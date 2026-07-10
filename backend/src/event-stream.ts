import type { Server } from 'node:http';
import type { MeetingEvent } from '@subculture/roberts-rules-meeting-domain';
import { WebSocket, WebSocketServer } from 'ws';
import type { PrincipalProvider } from './principal.js';

export interface MeetingEventLoader { exists(meetingId: string): Promise<boolean>; loadAfter(meetingId: string, version: number): Promise<MeetingEvent[]> }
export interface MeetingWakeupSource { subscribe(callback: (meetingId: string) => void): () => void }
interface ClientState { socket: WebSocket; meetingId: string; cursor: number; alive: boolean; flushing: boolean }

export class MeetingEventStream {
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<ClientState>();
  private readonly unsubscribe: () => void;
  private readonly heartbeat: NodeJS.Timeout;

  constructor(http: Server, private readonly principals: PrincipalProvider, private readonly loader: MeetingEventLoader, wakeups: MeetingWakeupSource) {
    http.on('upgrade', (request, socket, head) => { void this.upgrade(request, socket, head); });
    this.unsubscribe = wakeups.subscribe((meetingId) => { for (const client of this.clients) if (client.meetingId === meetingId) void this.flush(client); });
    this.heartbeat = setInterval(() => this.ping(), 30_000);
  }

  private async upgrade(request: Parameters<PrincipalProvider['authenticate']>[0], socket: import('node:stream').Duplex, head: Buffer) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const match = url.pathname.match(/^\/api\/meetings\/([0-9a-f-]+)\/events$/);
    const after = Number(url.searchParams.get('after') ?? '0');
    if (!match || !Number.isSafeInteger(after) || after < 0) return this.reject(socket, 400, 'INVALID_EVENT_CURSOR');
    const meetingId = match[1]!;
    if (!(await this.principals.authenticate(request, meetingId))) return this.reject(socket, 401, 'AUTHENTICATION_REQUIRED');
    if (!(await this.loader.exists(meetingId))) return this.reject(socket, 404, 'MEETING_NOT_FOUND');
    this.server.handleUpgrade(request, socket, head, (ws) => {
      const state: ClientState = { socket: ws, meetingId, cursor: after, alive: true, flushing: false };
      this.clients.add(state);
      ws.on('pong', () => { state.alive = true; });
      ws.on('message', () => ws.close(1008, 'server-stream-only'));
      ws.on('close', () => this.clients.delete(state));
      ws.send(JSON.stringify({ type: 'ready', meetingId, after }));
      void this.flush(state);
    });
  }

  private async flush(client: ClientState) {
    if (client.flushing || client.socket.readyState !== WebSocket.OPEN) return;
    client.flushing = true;
    try {
      for (const event of await this.loader.loadAfter(client.meetingId, client.cursor)) {
        if (client.socket.bufferedAmount > 262_144) { client.socket.close(1013, 'backpressure'); return; }
        client.socket.send(JSON.stringify({ type: 'event', meetingId: client.meetingId, version: event.aggregateVersion, event }));
        client.cursor = event.aggregateVersion;
      }
    } finally { client.flushing = false; }
  }

  private ping() { for (const client of this.clients) { if (!client.alive) { client.socket.close(1013, 'heartbeat-timeout'); continue; } client.alive = false; client.socket.ping(); } }
  private reject(socket: import('node:stream').Duplex, status: number, code: string) { socket.end(`HTTP/1.1 ${status} Rejected\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n${JSON.stringify({ error: code })}`); }
  close() { clearInterval(this.heartbeat); this.unsubscribe(); for (const client of this.clients) client.socket.close(1001, 'server-shutdown'); this.server.close(); }
}
