import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '@subculture/roberts-rules-meeting-domain';
import { AuthenticationRequired, LiveFloor } from './LiveFloor';

const profile = { id: 'p', version: 1, quorum: { type: 'fixed' as const, minimum: 2 }, debate: { defaultDurationSeconds: 60 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' as const }, tiePolicy: 'motionFails' as const, overrides: { quorumIndependentActions: [] } };
describe('LiveFloor', () => {
  it('renders authoritative meeting status and operational context by role', () => { const html = renderToString(<LiveFloor state={createInitialState(profile)} role="chair" connection="live" />); expect(html).toContain('Journal version'); expect(html).toContain('Quorum'); expect(html).toContain('Operational context /'); expect(html).toContain('chair'); });
  it('renders an honest authentication boundary', () => expect(renderToString(<AuthenticationRequired />)).toContain('Authentication required'));
});
