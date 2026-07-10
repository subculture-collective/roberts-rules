import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateMeetingCommand, type Decision, type MeetingState, type RulesProfile } from '@subculture/roberts-rules-meeting-domain';
import { z } from 'zod';
import type { PrincipalProvider } from './principal.js';
import { MeetingServiceError, type MeetingPrincipal, type SubmitCommandInput } from './meeting-service.js';

export interface MeetingApplication {
  createMeeting(id: string, profile: RulesProfile): Promise<void>;
  submitCommand(principal: MeetingPrincipal, input: SubmitCommandInput): Promise<Decision>;
  snapshot(id: string): Promise<MeetingState>;
}

const uuid = z.string().uuid();
const datetime = z.iso.datetime({ offset: true });
const profileSchema = z.object({ id: z.string().min(1), version: z.number().int().positive(), quorum: z.object({ type: z.literal('fixed'), minimum: z.number().int().nonnegative() }).strict(), debate: z.object({ defaultDurationSeconds: z.number().nonnegative() }).strict(), voteMethods: z.array(z.string()), motionThreshold: z.object({ numerator: z.number().int().positive(), denominator: z.number().int().positive(), basis: z.literal('votesCast') }).strict(), tiePolicy: z.enum(['motionFails', 'chairDecides']), overrides: z.object({ quorumIndependentActions: z.array(z.string()) }).strict() }).strict();
const commandRequestSchema = z.object({ commandId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), occurredAt: datetime, command: z.record(z.string(), z.unknown()) }).strict();

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const value = Buffer.from(chunk); size += value.length; if (size > 65_536) throw new HttpError(413, 'BODY_TOO_LARGE'); chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'MALFORMED_JSON'); }
}
class HttpError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
function send(response: ServerResponse, status: number, value: unknown) { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); }

export function createHttpHandler(application: MeetingApplication, principals: PrincipalProvider) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'POST' && url.pathname === '/api/meetings') {
        const principal = await principals.authenticate(request); if (!principal) throw new HttpError(401, 'AUTHENTICATION_REQUIRED');
        if (principal.role !== 'administrator') throw new HttpError(403, 'ROLE_FORBIDDEN');
        const parsed = z.object({ id: uuid, profile: profileSchema }).strict().parse(await body(request));
        await application.createMeeting(parsed.id, parsed.profile); send(response, 201, { id: parsed.id, version: 0 }); return;
      }
      const commandMatch = url.pathname.match(/^\/api\/meetings\/([^/]+)\/commands$/);
      const snapshotMatch = url.pathname.match(/^\/api\/meetings\/([^/]+)\/snapshot$/);
      const meetingId = uuid.parse(commandMatch?.[1] ?? snapshotMatch?.[1]);
      const principal = await principals.authenticate(request, meetingId); if (!principal) throw new HttpError(401, 'AUTHENTICATION_REQUIRED');
      if (request.method === 'POST' && commandMatch) {
        const raw = await body(request) as Record<string, unknown>;
        if ('actorId' in raw || 'role' in raw) throw new HttpError(400, 'ENVELOPE_AUTHORITY_FORBIDDEN');
        const parsed = commandRequestSchema.parse(raw);
        let command; try { command = validateMeetingCommand(parsed.command) } catch { throw new HttpError(400, 'COMMAND_INVALID') }
        const decision = await application.submitCommand(principal, { meetingId, commandId: parsed.commandId, expectedVersion: parsed.expectedVersion, occurredAt: parsed.occurredAt, command });
        send(response, 200, decision); return;
      }
      if (request.method === 'GET' && snapshotMatch) { send(response, 200, await application.snapshot(meetingId)); return; }
      throw new HttpError(404, 'NOT_FOUND');
    } catch (error) {
      if (error instanceof MeetingServiceError) return send(response, error.code === 'MEETING_NOT_FOUND' ? 404 : 409, { error: error.code });
      if (error instanceof HttpError) return send(response, error.status, { error: error.code });
      if (error instanceof z.ZodError) return send(response, 400, { error: 'REQUEST_INVALID' });
      send(response, 500, { error: 'INTERNAL_ERROR' });
    }
  };
}
