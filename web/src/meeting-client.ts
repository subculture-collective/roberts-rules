import { reduce, type MeetingEvent, type MeetingState } from '@subculture/roberts-rules-meeting-domain';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'closed' | 'error';
export interface Projection { status: ConnectionStatus; state?: MeetingState; error?: string }
export interface SocketLike { onopen: (() => void) | null; onmessage: ((event: { data: string }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null; close(): void }

export class MeetingProjectionClient {
  private projection: Projection = { status: 'connecting' };
  private socket?: SocketLike; private stopped = false; private reconnectAttempt = 0;
  private readonly listeners = new Set<(projection: Projection) => void>();

  constructor(private readonly apiBase: string, private readonly meetingId: string,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init), private readonly sockets: (url: string) => SocketLike = (url) => new WebSocket(url) as unknown as SocketLike,
    private readonly schedule: (callback: () => void, delay: number) => unknown = setTimeout,
    private readonly random: () => number = Math.random) {}

  subscribe(listener: (projection: Projection) => void): () => void { this.listeners.add(listener); listener(this.projection); return () => this.listeners.delete(listener); }
  async start(): Promise<void> { this.stopped = false; await this.refresh('connecting'); }
  async refreshSnapshot(): Promise<void> { if(this.socket){this.socket.onclose=null;this.socket.close();} await this.refresh('reconnecting'); }
  stop(): void { this.stopped = true; this.socket?.close(); this.update({ ...this.projection, status: 'closed' }); }

  private async refresh(status: ConnectionStatus): Promise<void> {
    this.update({ ...this.projection, status });
    try {
      const response = await this.fetcher(`${this.apiBase}/api/meetings/${this.meetingId}/snapshot`, { credentials: 'include' });
      if (!response.ok) throw new Error(`snapshot:${response.status}`);
      const state = await response.json() as MeetingState; this.update({ status, state }); this.connect(state.version);
    } catch (error) { this.update({ status: 'error', error: error instanceof Error ? error.message : String(error) }); }
  }

  private connect(after: number): void {
    if (this.stopped) return;
    const base = new URL(this.apiBase, globalThis.location?.href ?? 'http://localhost'); base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = this.sockets(`${base.origin}/api/meetings/${this.meetingId}/events?after=${after}`); this.socket = socket;
    socket.onopen = () => { this.reconnectAttempt = 0; this.update({ ...this.projection, status: 'live' }); };
    socket.onmessage = (message) => { void this.receive(message.data); };
    socket.onerror = () => this.update({ ...this.projection, status: 'error', error: 'event-stream' });
    socket.onclose = () => { if (!this.stopped) { this.update({ ...this.projection, status: 'reconnecting' }); const base = Math.min(500 * 2 ** this.reconnectAttempt++, 10_000); const delay = base * (0.75 + this.random() * 0.5); this.schedule(() => this.connect(this.projection.state?.version ?? 0), delay); } };
  }

  private async receive(data: string): Promise<void> {
    const message = JSON.parse(data) as { type: string; version?: number; event?: MeetingEvent };
    if (message.type !== 'event' || !message.event || message.version === undefined || !this.projection.state) return;
    const current = this.projection.state.version;
    if (message.version <= current) return;
    if (message.version !== current + 1) { this.socket?.close(); await this.refresh('reconnecting'); return; }
    this.update({ status: this.projection.status, state: reduce(this.projection.state, message.event) });
  }

  private update(projection: Projection) { this.projection = projection; for (const listener of this.listeners) listener(projection); }
}
