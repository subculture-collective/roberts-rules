// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInitialState, type MeetingRole } from '@subculture/roberts-rules-meeting-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeetingPage, meetingIdFromPath, type MeetingPageClients } from './MeetingPage';

const meetingId = '00000000-0000-4000-8000-000000000600';
const profile = { id: 'browser', version: 1, quorum: { type: 'fixed' as const, minimum: 1 }, debate: { defaultDurationSeconds: 60 }, voteMethods: ['counted'] as const, motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' as const }, tiePolicy: 'motionFails' as const, overrides: { quorumIndependentActions: [] } };
const state = { ...createInitialState(profile), phase: 'open' as const, version: 2, quorum: { met: true, present: 2, required: 1 } };
afterEach(cleanup);

function clients(current: () => Promise<{meetingId:string;actorId:string;role:MeetingRole}>): MeetingPageClients {
  const actionListeners = new Set<(value:{status:'idle'|'pending'|'error';error?:string})=>void>();
  return {
    action: {
      current,
      redeem: vi.fn(async () => ({ meetingId, actorId: 'chair-1', role: 'chair' as MeetingRole })),
      revoke: vi.fn(async () => undefined),
      submit: vi.fn(async () => ({ accepted: true as const, events: [] })),
      subscribe: (listener) => { actionListeners.add(listener); listener({status:'idle'}); return () => actionListeners.delete(listener); },
    },
    projection: {
      start: vi.fn(async () => undefined), stop: vi.fn(), refreshSnapshot: vi.fn(async () => undefined),
      subscribe: (listener) => { listener({status:'live',state}); return () => undefined; },
    },
  };
}

describe('MeetingPage', () => {
  it('accepts only a UUID meeting route', () => {
    expect(meetingIdFromPath(`/meetings/${meetingId}`)).toBe(meetingId);
    expect(meetingIdFromPath('/meetings/not-a-meeting')).toBeNull();
    expect(meetingIdFromPath('/')).toBeNull();
  });

  it('restores a current session and renders role-aware live controls', async () => {
    render(<MeetingPage meetingId={meetingId} clients={clients(async()=>({meetingId,actorId:'chair-1',role:'chair'}))}/>);
    expect(screen.getByText('Checking meeting session…')).toBeTruthy();
    await screen.findByRole('heading', { name: 'Meeting in open' });
    expect(screen.getByRole('button', { name: 'Recess' })).toBeTruthy();
  });

  it('redeems a pasted token, clears it, and logs out', async () => {
    const value=clients(async()=>{throw Object.assign(new Error('AUTHENTICATION_REQUIRED'),{code:'AUTHENTICATION_REQUIRED'})});
    render(<MeetingPage meetingId={meetingId} clients={value}/>);
    const input=await screen.findByLabelText('Enrollment token') as HTMLInputElement;
    fireEvent.change(input,{target:{value:'single-use-secret-token'}});fireEvent.submit(input.closest('form')!);
    await screen.findByRole('heading',{name:'Meeting in open'});expect(input.value).toBe('');
    await act(async()=>screen.getByRole('button',{name:'Log out'}).click());
    await waitFor(()=>expect(screen.getByLabelText('Enrollment token')).toBeTruthy());
    expect(value.action.revoke).toHaveBeenCalledOnce();expect(value.projection.stop).toHaveBeenCalled();
  });
});
