import type { MeetingCommand, MeetingRole, MeetingState } from '@subculture/roberts-rules-meeting-domain';

export function MeetingControls({state,role,connected,pending,message,onSubmit}:{state:MeetingState;role:MeetingRole;connected:boolean;pending:boolean;message?:string;onSubmit:(command:MeetingCommand)=>void}){
  const disabled=!connected||pending;const chair=role==='chair';const participant=['delegate','alternate','participant','chair'].includes(role);const openVote=Object.values(state.votes).find((vote)=>vote.status==='open');
  const button=(label:string,command:MeetingCommand)=><button type="button" disabled={disabled} onClick={()=>onSubmit(command)} className="border border-[#1d201c] px-4 py-3 text-left font-mono text-xs font-bold uppercase tracking-wider transition hover:bg-[#1d201c] hover:text-[#ece8dc] disabled:cursor-not-allowed disabled:opacity-40">{label}</button>;
  return <section className="mx-auto max-w-7xl border-t-2 border-[#1d201c] py-8" aria-labelledby="controls-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#50583c]">Authenticated actions</p><h2 id="controls-title" className="mt-2 font-serif text-3xl font-bold">Floor controls</h2></div><p aria-live="polite" className="font-mono text-xs uppercase">{pending?'Submitting…':message??(connected?'Ready':'Disconnected')}</p></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {chair&&state.phase==='initialized'&&button('Open meeting',{type:'OpenMeeting'})}
      {chair&&state.phase==='open'&&button('Recess',{type:'RecessMeeting'})}
      {chair&&state.phase==='recessed'&&button('Resume',{type:'ResumeMeeting'})}
      {chair&&state.phase!=='adjourned'&&state.phase!=='uninitialized'&&button('Adjourn',{type:'AdjournMeeting'})}
      {participant&&button('Join pro queue',{type:'JoinRecognitionQueue',side:'pro'})}
      {participant&&button('Join con queue',{type:'JoinRecognitionQueue',side:'con'})}
      {participant&&button('Leave pro queue',{type:'WithdrawRecognitionQueue',side:'pro'})}
      {participant&&button('Leave con queue',{type:'WithdrawRecognitionQueue',side:'con'})}
      {participant&&openVote&&button('Vote yes',{type:'CastVote',voteId:openVote.id,choice:'yes'})}
      {participant&&openVote&&button('Vote no',{type:'CastVote',voteId:openVote.id,choice:'no'})}
      {participant&&openVote&&button('Abstain',{type:'CastVote',voteId:openVote.id,choice:'abstain'})}
    </div>
  </section>;
}
