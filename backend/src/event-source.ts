import type { Pool, PoolClient } from 'pg';

export type MeetingWakeup = (meetingId: string) => void;

export class PostgresMeetingEventSource {
  private client?: PoolClient;
  private running = false;
  private retryDelay = 250;
  private retryTimer?: NodeJS.Timeout;
  private readonly subscribers = new Set<MeetingWakeup>();
  constructor(private readonly pool: Pool) {}

  subscribe(callback: MeetingWakeup): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  async start(): Promise<void> {
    this.running = true;
    if (this.client) return;
    const client = await this.pool.connect();
    client.on('notification', (message) => {
      if (message.channel === 'meeting_events' && message.payload) {
        for (const subscriber of this.subscribers) subscriber(message.payload);
      }
    });
    client.on('error', () => {
      if (this.client !== client) return;
      this.client = undefined; client.release(true);
      if (this.running) {
        const delay = this.retryDelay; this.retryDelay = Math.min(this.retryDelay * 2, 10_000);
        this.retryTimer = setTimeout(() => { void this.start(); }, delay);
      }
    });
    await client.query('LISTEN meeting_events');
    this.client = client; this.retryDelay = 250;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const client = this.client; this.client = undefined;
    if (!client) return;
    await client.query('UNLISTEN meeting_events').catch(() => undefined);
    client.release();
  }
}
