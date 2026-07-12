import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ActionState, MeetingActionClient, SessionInfo } from './meeting-actions';
import { MeetingActionClient as ActionClient, MeetingActionError } from './meeting-actions';
import type { MeetingCommand } from '@subculture/roberts-rules-meeting-domain';
import type { MeetingProjectionClient, Projection } from './meeting-client';
import { MeetingProjectionClient as ProjectionClient } from './meeting-client';
import { LiveFloor } from './LiveFloor';

const meetingPath = /^\/meetings\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i;

export function meetingIdFromPath(pathname: string): string | null { return pathname.match(meetingPath)?.[1] ?? null; }

interface ActionPort {
  current(): Promise<SessionInfo>;
  redeem(token: string): Promise<SessionInfo>;
  revoke(): Promise<void>;
  submit(command: MeetingCommand, expectedVersion: number): Promise<unknown>;
  subscribe(listener: (state: ActionState) => void): () => void;
}
interface ProjectionPort {
  start(): Promise<void>; stop(): void; refreshSnapshot(): Promise<void>;
  subscribe(listener: (projection: Projection) => void): () => void;
}
export interface MeetingPageClients { action: ActionPort; projection: ProjectionPort }

function createClients(meetingId: string): MeetingPageClients {
  const projection: MeetingProjectionClient = new ProjectionClient('', meetingId);
  const action: MeetingActionClient = new ActionClient('', meetingId, () => projection.refreshSnapshot());
  return { action, projection };
}

export function MeetingPage({ meetingId, clients: provided }: { meetingId: string; clients?: MeetingPageClients }) {
  const clients = useMemo(() => provided ?? createClients(meetingId), [meetingId, provided]);
  const [session, setSession] = useState<SessionInfo>();
  const [checking, setChecking] = useState(true);
  const [projection, setProjection] = useState<Projection>({ status: 'connecting' });
  const [action, setAction] = useState<ActionState>({ status: 'idle' });
  const [message, setMessage] = useState<string>();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = clients.action.subscribe(setAction);
    void clients.action.current().then((value) => { if (mounted.current) setSession(value); }).catch((error: unknown) => {
      if (mounted.current && (!(error instanceof MeetingActionError) || error.code !== 'AUTHENTICATION_REQUIRED')) setMessage('Meeting session is unavailable.');
    }).finally(() => { if (mounted.current) setChecking(false); });
    return () => { mounted.current = false; unsubscribe(); clients.projection.stop(); };
  }, [clients]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = clients.projection.subscribe(setProjection);
    void clients.projection.start();
    return () => { unsubscribe(); clients.projection.stop(); };
  }, [clients, session]);

  async function redeem(token: string) {
    setMessage(undefined);
    try { setSession(await clients.action.redeem(token)); }
    catch (error) { const code=error instanceof MeetingActionError?error.code:'REQUEST_FAILED';setMessage(code==='ENROLLMENT_INVALID'?'Enrollment token is invalid or expired.':`Meeting access request failed (${code}).`); }
  }
  async function logout() {
    clients.projection.stop();
    try { await clients.action.revoke(); } finally { setSession(undefined); setProjection({status:'closed'}); setMessage('Logged out.'); }
  }
  async function submit(command: MeetingCommand) {
    if (!projection.state) return;
    setMessage(undefined);
    try {
      const decision = await clients.action.submit(command, projection.state.version) as {accepted?:boolean;code?:string};
      if (decision.accepted === false) setMessage(decision.code ?? 'Command rejected.');
    } catch { setMessage('Command could not be submitted.'); }
  }

  if (checking) return <Status title="Checking meeting session…" detail="Confirming this browser's meeting-scoped access."/>;
  if (!session) return <EnrollmentForm pending={action.status==='pending'} message={message} onRedeem={redeem}/>;
  if (!projection.state) return <Status title={projection.status==='error'?'Meeting unavailable':'Connecting to meeting…'} detail={projection.error ?? 'Loading the authoritative journal.'} action={<button type="button" onClick={()=>void logout()} className="underline">Log out</button>}/>;
  return <div className="bg-[#ece8dc]"><div className="mx-auto flex max-w-7xl justify-end px-5 pt-4 sm:px-8"><button type="button" onClick={()=>void logout()} className="border border-[#1d201c] px-3 py-2 font-mono text-xs font-bold uppercase">Log out</button></div><LiveFloor state={projection.state} role={session.role} connection={projection.status} actions={{pending:action.status==='pending',message:message??action.error,submit:(command)=>void submit(command)}}/></div>;
}

function EnrollmentForm({pending,message,onRedeem}:{pending:boolean;message?:string;onRedeem:(token:string)=>Promise<void>}) {
  const [token,setToken]=useState('');
  async function submit(event:FormEvent){event.preventDefault();const value=token.trim();setToken('');if(value)await onRedeem(value);}
  return <main className="min-h-screen bg-[#ece8dc] p-5 text-[#1d201c] sm:p-8"><section className="mx-auto max-w-xl border-2 border-[#1d201c] p-6"><p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#a2402d]">Private meeting</p><h1 className="mt-2 font-serif text-4xl font-bold">Enter the live floor.</h1><p className="mt-3 text-[#55574f]">Paste the single-use enrollment token provided by the meeting operator.</p><form className="mt-6 space-y-4" onSubmit={(event)=>void submit(event)}><label className="block font-mono text-xs font-bold uppercase" htmlFor="enrollment-token">Enrollment token</label><input id="enrollment-token" type="password" autoComplete="off" value={token} onChange={(event)=>setToken(event.target.value)} className="w-full border-2 border-[#1d201c] bg-white p-3 font-mono"/><button type="submit" disabled={pending||!token.trim()} className="bg-[#1d201c] px-5 py-3 font-mono text-xs font-bold uppercase text-[#ece8dc] disabled:opacity-40">{pending?'Entering…':'Enter meeting'}</button></form>{message&&<p aria-live="polite" className="mt-4 font-mono text-sm text-[#a2402d]">{message}</p>}</section></main>;
}

function Status({title,detail,action}:{title:string;detail:string;action?:ReactNode}) { return <main className="min-h-screen bg-[#ece8dc] p-8 text-[#1d201c]"><section className="mx-auto max-w-xl border-2 border-[#1d201c] p-6"><h1 className="font-serif text-3xl font-bold">{title}</h1><p className="mt-3 text-[#55574f]">{detail}</p>{action&&<div className="mt-5">{action}</div>}</section></main>; }
