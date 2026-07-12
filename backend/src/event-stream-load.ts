import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { SESSION_COOKIE } from './session-principal.js';
import { summarizeLoad } from './load-metrics.js';

const schema = z.object({
  LOAD_WS_URL: z.string().url().refine((value) => value.startsWith('ws://') || value.startsWith('wss://')),
  LOAD_ORIGIN: z.string().url(),
  LOAD_SESSION_FILE: z.string().min(1),
  LOAD_CONNECTIONS: z.coerce.number().int().min(1).max(5000),
  LOAD_RAMP_MS: z.coerce.number().int().min(0).max(300_000),
  LOAD_HOLD_MS: z.coerce.number().int().min(0).max(900_000),
  LOAD_RECONNECT_PERCENT: z.coerce.number().min(0).max(100),
  LOAD_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000),
});

export interface EventStreamLoadConfig { wsUrl: string; origin: string; sessionFile: string; connections: number; rampMs: number; holdMs: number; reconnectPercent: number; timeoutMs: number }

export function parseEventStreamLoadConfig(env: NodeJS.ProcessEnv): EventStreamLoadConfig {
  const value = schema.parse(env);
  return { wsUrl: value.LOAD_WS_URL, origin: value.LOAD_ORIGIN, sessionFile: value.LOAD_SESSION_FILE, connections: value.LOAD_CONNECTIONS, rampMs: value.LOAD_RAMP_MS, holdMs: value.LOAD_HOLD_MS, reconnectPercent: value.LOAD_RECONNECT_PERCENT, timeoutMs: value.LOAD_TIMEOUT_MS };
}

export async function readLoadTokens(path: string): Promise<string[]> {
  return (await readFile(path, 'utf8')).split(/\r?\n/).filter(Boolean).map((line, index) => {
    const value = JSON.parse(line) as { token?: unknown };
    if (typeof value.token !== 'string' || !value.token) throw new Error(`invalid token at line ${index + 1}`);
    return value.token;
  });
}

interface Connected { socket: WebSocket; token: string }

export async function runEventStreamLoad(config: EventStreamLoadConfig, tokens: readonly string[]) {
  if (tokens.length < config.connections) throw new Error(`session file has ${tokens.length} tokens, expected ${config.connections}`);
  const initialReadyMs: number[] = [];
  const reconnectReadyMs: number[] = [];
  const failures: string[] = [];
  const connected: Connected[] = [];
  const plannedCloses = new WeakSet<WebSocket>();
  const track = (item: Connected) => {
    item.socket.on('close', (code) => { if (!plannedCloses.has(item.socket)) failures.push(`unexpected_close_${code}`); });
    item.socket.on('error', () => { if (!plannedCloses.has(item.socket)) failures.push('connected_socket_error'); });
    connected.push(item);
  };
  let peakHarnessRssBytes = process.memoryUsage().rss;
  const memoryTimer = setInterval(() => { peakHarnessRssBytes = Math.max(peakHarnessRssBytes, process.memoryUsage().rss); }, 100);
  const startedAt = new Date().toISOString();
  try {
    const initial = tokens.slice(0, config.connections).map(async (token, index) => {
      if (config.rampMs > 0) await delay(Math.floor((index * config.rampMs) / config.connections));
      const result = await connect(config, token);
      if (typeof result === 'string') failures.push(result);
      else { initialReadyMs.push(result.readyMs); track({ socket: result.socket, token }); }
    });
    await Promise.all(initial);
    await delay(config.holdMs);

    const reconnectTarget = Math.ceil((config.connections * config.reconnectPercent) / 100);
    const reconnecting = connected.slice(0, reconnectTarget);
    for (const { socket } of reconnecting) plannedCloses.add(socket);
    await Promise.all(reconnecting.map(({ socket }) => closeSocket(socket)));
    for (const item of reconnecting) connected.splice(connected.indexOf(item), 1);
    await Promise.all(reconnecting.map(async ({ token }, index) => {
      await delay(Math.floor((index * Math.min(config.rampMs, 5_000)) / Math.max(1, reconnectTarget)));
      const result = await connect(config, token);
      if (typeof result === 'string') failures.push(`reconnect_${result}`);
      else { reconnectReadyMs.push(result.readyMs); track({ socket: result.socket, token }); }
    }));
    await delay(Math.min(config.holdMs, 1_000));
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      profile: { connections: config.connections, rampMs: config.rampMs, holdMs: config.holdMs, reconnectPercent: config.reconnectPercent, timeoutMs: config.timeoutMs },
      summary: summarizeLoad({ initialTarget: config.connections, initialReadyMs, reconnectTarget, reconnectReadyMs, failures, peakHarnessRssBytes }),
    };
  } finally {
    clearInterval(memoryTimer);
    for (const { socket } of connected) plannedCloses.add(socket);
    await Promise.all(connected.map(({ socket }) => closeSocket(socket)));
  }
}

async function connect(config: EventStreamLoadConfig, token: string): Promise<{ socket: WebSocket; readyMs: number } | string> {
  const started = performance.now();
  return new Promise((resolve) => {
    const socket = new WebSocket(config.wsUrl, { headers: { Origin: config.origin, Cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` } });
    let settled = false;
    const finish = (value: { socket: WebSocket; readyMs: number } | string) => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
    const timeout = setTimeout(() => { socket.terminate(); finish('timeout'); }, config.timeoutMs);
    socket.once('unexpected-response', (_request, response) => finish(`http_${response.statusCode ?? 0}`));
    socket.once('error', () => finish('socket_error'));
    socket.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString()) as { type?: unknown };
        if (frame.type === 'ready') finish({ socket, readyMs: Math.max(0, Math.round(performance.now() - started)) });
      } catch { finish('invalid_frame'); }
    });
    socket.once('close', (code) => { if (!settled) finish(`close_${code}`); });
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => { socket.once('close', () => resolve()); socket.close(1000, 'load-test-complete'); setTimeout(() => { socket.terminate(); resolve(); }, 1_000).unref(); });
}

function delay(milliseconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
