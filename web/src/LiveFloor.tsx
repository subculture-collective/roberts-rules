import type { MeetingRole, MeetingState } from '@subculture/roberts-rules-meeting-domain';
import type { MeetingCommand } from '@subculture/roberts-rules-meeting-domain';
import { MeetingControls } from './MeetingControls';

export function LiveFloor({ state, role, connection, actions }: { state: MeetingState; role: MeetingRole; connection: string; actions?:{pending:boolean;message?:string;submit:(command:MeetingCommand)=>void} }) {
  const activeMotion = state.motionStack.length ? state.motions[state.motionStack[state.motionStack.length - 1]!] : undefined;
  const currentAgenda = state.agenda.find((item) => item.status === 'current');
  const operational = role === 'chair' || role === 'secretary' || role === 'parliamentarian' || role === 'technicalOperator';
  return <main className="min-h-screen bg-[#ece8dc] p-5 text-[#1d201c] sm:p-8">
    <header className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 border-b-2 border-[#1d201c] pb-5">
      <div><p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#50583c]">Live floor / {connection}</p><h1 className="mt-2 font-serif text-5xl font-black tracking-[-0.04em]">Meeting in {state.phase}</h1></div>
      <p className="border border-[#1d201c] px-3 py-2 font-mono text-xs uppercase">Journal version {state.version}</p>
    </header>
    <div className="mx-auto grid max-w-7xl gap-0 border-b-2 border-[#1d201c] lg:grid-cols-[1.35fr_0.65fr]">
      <section className="border-b-2 border-[#1d201c] py-8 lg:border-r-2 lg:border-b-0 lg:pr-8" aria-labelledby="floor-question">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#a2402d]">Question before the floor</p>
        <h2 id="floor-question" className="mt-3 font-serif text-4xl font-bold">{activeMotion?.text ?? 'No active motion'}</h2>
        <p className="mt-5 text-sm text-[#55574f]">Agenda: {currentAgenda?.title ?? 'No current item'}</p>
        {state.debate && <p className="mt-2 font-mono text-sm">Debate closes {state.debate.closesAt}</p>}
      </section>
      <aside className="grid grid-cols-2 divide-x divide-[#8f8d82] py-8 lg:pl-8" aria-label="Meeting status">
        <div className="pr-5"><p className="font-mono text-xs uppercase">Quorum</p><p className="mt-2 text-3xl font-bold">{state.quorum.met ? 'Met' : 'Not met'}</p><p className="text-sm">{state.quorum.present} / {state.quorum.required}</p></div>
        <div className="pl-5"><p className="font-mono text-xs uppercase">Vote</p><p className="mt-2 text-3xl font-bold">{Object.values(state.votes).find((vote) => vote.status === 'open') ? 'Open' : 'Closed'}</p><p className="text-sm">Non-secret simulator</p></div>
      </aside>
    </div>
    <section className="mx-auto grid max-w-7xl gap-8 py-8 md:grid-cols-2" aria-label="Recognition queues">
      {(['pro','con'] as const).map((side) => <div key={side}><h2 className="border-b border-[#1d201c] pb-2 font-mono text-xs font-bold uppercase tracking-[0.18em]">{side === 'pro' ? 'For' : 'Against'} recognition</h2><ol className="mt-3 space-y-2">{state.recognitionQueues[side].map((id, index) => <li key={id} className="flex gap-3"><span className="font-mono text-xs">{String(index + 1).padStart(2, '0')}</span><span>{id}</span></li>)}</ol></div>)}
    </section>
    {actions&&<MeetingControls state={state} role={role} connected={connection==='live'} pending={actions.pending} message={actions.message} onSubmit={actions.submit}/>}
    {operational && <aside className="mx-auto max-w-7xl border-2 border-[#1d201c] bg-[#1d201c] p-5 text-[#ece8dc]"><p className="font-mono text-xs uppercase tracking-[0.18em]">Operational context / {role}</p><p className="mt-2">Actions are authorized by this meeting-scoped session and recorded in the authoritative journal.</p></aside>}
  </main>;
}

export function AuthenticationRequired() { return <section className="border-2 border-[#1d201c] p-6" aria-labelledby="auth-title"><p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#a2402d]">Live floor unavailable</p><h2 id="auth-title" className="mt-2 font-serif text-3xl font-bold">Authentication required.</h2><p className="mt-3 text-[#55574f]">Meeting state stays private until a meeting-scoped session is established.</p></section>; }
