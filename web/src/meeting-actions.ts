import type { Decision, MeetingCommand } from '@subculture/roberts-rules-meeting-domain';

export class MeetingActionError extends Error { constructor(readonly code: string) { super(code); } }
export interface ActionState{status:'idle'|'pending'|'error';error?:string}
export interface SessionInfo{meetingId:string;actorId:string;role:string}

export class MeetingActionClient {
  private state:ActionState={status:'idle'};private readonly listeners=new Set<(state:ActionState)=>void>();
  constructor(private readonly apiBase:string,private readonly meetingId:string,private readonly refreshSnapshot:()=>Promise<void>,private readonly fetcher:typeof fetch=fetch,private readonly id:()=>string=()=>crypto.randomUUID(),private readonly now:()=>string=()=>new Date().toISOString()){}
  subscribe(listener:(state:ActionState)=>void):()=>void{this.listeners.add(listener);listener(this.state);return()=>this.listeners.delete(listener)}
  private update(state:ActionState){this.state=state;for(const listener of this.listeners)listener(state)}
  async current():Promise<SessionInfo>{const response=await this.fetcher(`${this.apiBase}/api/meetings/${this.meetingId}/session`,{credentials:'include'});if(!response.ok)throw new MeetingActionError((await this.errorCode(response))??`HTTP_${response.status}`);return response.json() as Promise<SessionInfo>}
  async redeem(enrollmentToken:string):Promise<{actorId:string;role:string;expiresAt:string}>{this.update({status:'pending'});try{
    const response=await this.fetcher(`${this.apiBase}/api/meetings/${this.meetingId}/session`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({enrollmentToken})});
    if(!response.ok)throw new MeetingActionError((await this.errorCode(response))??'ENROLLMENT_FAILED');const result=await response.json();this.update({status:'idle'});return result;}catch(error){this.update({status:'error',error:error instanceof MeetingActionError?error.code:'REQUEST_FAILED'});throw error;}
  }
  async submit(command:MeetingCommand,expectedVersion:number):Promise<Decision>{this.update({status:'pending'});try{
    const response=await this.fetcher(`${this.apiBase}/api/meetings/${this.meetingId}/commands`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({commandId:this.id(),expectedVersion,occurredAt:this.now(),command})});
    if(!response.ok)throw new MeetingActionError((await this.errorCode(response))??`HTTP_${response.status}`);
    const decision=await response.json() as Decision;if(!decision.accepted&&decision.code==='STALE_VERSION')await this.refreshSnapshot();this.update({status:'idle'});return decision;}catch(error){this.update({status:'error',error:error instanceof MeetingActionError?error.code:'REQUEST_FAILED'});throw error;}
  }
  async revoke():Promise<void>{const response=await this.fetcher(`${this.apiBase}/api/meetings/${this.meetingId}/session`,{method:'DELETE',credentials:'include'});if(!response.ok)throw new MeetingActionError((await this.errorCode(response))??`HTTP_${response.status}`);this.update({status:'idle'})}
  private async errorCode(response:Response):Promise<string|undefined>{try{return (await response.json() as {error?:string}).error}catch{return undefined}}
}
