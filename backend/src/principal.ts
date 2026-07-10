import type { IncomingMessage } from 'node:http';
import type { MeetingPrincipal } from './meeting-service.js';

export interface PrincipalProvider {
  authenticate(request: IncomingMessage, meetingId?: string): Promise<MeetingPrincipal | null>;
}

export const denyAllPrincipals: PrincipalProvider = { authenticate: async () => null };
