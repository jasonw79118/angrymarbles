const configuredUrl=import.meta.env.VITE_API_BASE_URL as string|undefined;
export const apiBase=(configuredUrl|| (import.meta.env.DEV?'/api':'')).replace(/\/$/,'');
export const hasConfiguredBackend=Boolean(apiBase);
export type GameMode='singles'|'doubles';
export type Relation='with'|'against';
export type Profile={userId:string;displayName:string;games:number;wins:number;losses:number;bumps:number;assists:number};
export type PublicGame={code:string;humans:number;capacity:number;countdown:number|null};

type SessionResponse={token:string;profile:Profile};
type Listener=()=>void;
const TOKEN_KEY='angrymarbles_session_v1';
const listeners=new Set<Listener>();
function token():string|null{
  try{return localStorage.getItem(TOKEN_KEY);}catch{return null;}
}
function publish(){for(const listener of listeners)listener();}
export function setSession(value:string){localStorage.setItem(TOKEN_KEY,value);publish();}
export function clearSession(){localStorage.removeItem(TOKEN_KEY);publish();}
function headers(body?:unknown):Headers{
  const result=new Headers();
  const access=token();if(access)result.set('Authorization',`Bearer ${access}`);
  if(body!==undefined)result.set('Content-Type','application/json');
  return result;
}
async function request<T>(path:string,body?:unknown,authenticated=true):Promise<T>{
  if(!apiBase)throw new Error('Cloudflare API is not configured.');
  const response=await fetch(`${apiBase}${path}`,{method:body===undefined?'GET':'POST',headers:authenticated?headers(body):body===undefined?new Headers():new Headers({'Content-Type':'application/json'}),body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({message:`Request failed (${response.status}).`})) as {message?:string};
  if(!response.ok)throw new Error(payload.message||`Request failed (${response.status}).`);
  return payload as T;
}
export const authApi={
  register:async(name:string,email:string,password:string)=>request<SessionResponse>('/auth/register',{name,email,password},false),
  login:async(email:string,password:string)=>request<SessionResponse>('/auth/login',{email,password},false),
  me:()=>request<{profile:Profile}>('/auth/me'),
  logout:async()=>{try{await request('/auth/logout',{});}catch{}finally{clearSession();}},
};
export const authStore={
  get isValid(){return Boolean(token());},
  clear:clearSession,
  onChange(listener:Listener){listeners.add(listener);return()=>{listeners.delete(listener);};},
};
export async function api<T>(path:string,body?:Record<string,unknown>):Promise<T>{
  return request<T>(`/angry-marbles${path}`,body);
}
export function subscribeRoom(code:string,onChange:()=>void,onError:(error:Error)=>void):()=>void{
  const controller=new AbortController();
  void (async()=>{
    const result=await request<{ticket:string}>(`/angry-marbles/room/${encodeURIComponent(code)}/events-ticket`,{});
    if(controller.signal.aborted)return;
    const endpoint=new URL(`${apiBase}/angry-marbles/room/${encodeURIComponent(code)}/events?ticket=${encodeURIComponent(result.ticket)}`,window.location.href);
    endpoint.protocol=window.location.protocol==='https:'?'wss:':'ws:';
    const socket=new WebSocket(endpoint);
    controller.signal.addEventListener('abort',()=>socket.close(1000,'Leaving room.'),{once:true});
    socket.onmessage=event=>{try{if(JSON.parse(String(event.data)).changed)onChange();}catch{}};
    await new Promise<void>((resolve,reject)=>{socket.onopen=()=>resolve();socket.onerror=()=>reject(new Error('Realtime connection failed.'));socket.onclose=event=>{if(!controller.signal.aborted&&event.code!==1000)reject(new Error('Realtime connection closed.'));};});
    await new Promise<void>(resolve=>{socket.onclose=()=>resolve();});
  })().catch(reason=>{if(!controller.signal.aborted)onError(reason instanceof Error?reason:new Error(String(reason)));});
  return()=>controller.abort();
}
export const gameApi={
  profile:()=>api<Profile>('/profile'),
  updateName:(displayName:string)=>api<Profile>('/name',{displayName}),
  publicRooms:(mode:GameMode,capacity:number)=>request<PublicGame[]>(`/angry-marbles/public?mode=${mode}&capacity=${capacity}`),
  create:(options:{mode:GameMode;capacity:number;waitSeconds:number;visibility:'private'|'public';preferredRelation:Relation})=>api<{code:string}>('/create',options),
  join:(code:string,relation:Relation)=>api<{code:string}>('/join',{code,relation}),
  state:<T>(code:string)=>request<T>(`/angry-marbles/room/${encodeURIComponent(code)}`),
  color:(code:string,color:string)=>api<unknown>('/color',{code,color}),
  countdown:(code:string)=>api<unknown>('/countdown',{code}),
  fill:(code:string)=>api<unknown>('/fill',{code}),
  move:(code:string,moveId:string)=>api<unknown>('/move',{code,moveId}),
  discard:(code:string,discardIndex:number)=>api<unknown>('/move',{code,discardIndex}),
};
