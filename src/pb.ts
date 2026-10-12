import PocketBase from 'pocketbase';
const url=import.meta.env.VITE_POCKETBASE_URL as string | undefined;
export const pb = new PocketBase(url || 'http://127.0.0.1:8090');
export const hasConfiguredBackend = Boolean(url);
export type GameMode = 'singles' | 'doubles';
export type Relation = 'with' | 'against';
export type Profile = {userId:string,displayName:string,games:number,wins:number,losses:number,bumps:number,assists:number};
export type PublicGame = {code:string,humans:number,capacity:number,countdown:number|null};
export async function api<T>(path:string,body?:Record<string,unknown>):Promise<T>{
  return await pb.send<T>(`/api/angry-marbles${path}`,{method:body?'POST':'GET',...(body?{body}:{}),requestKey:null});
}
export const gameApi = {
  profile: () => api<Profile>('/profile'),
  updateName: (displayName:string) => api<Profile>('/name',{displayName}),
  publicRooms: (mode:GameMode,capacity:number) => api<PublicGame[]>(`/public?mode=${mode}&capacity=${capacity}`),
  create: (opts:{mode:GameMode,capacity:number,waitSeconds:number,visibility:'private'|'public',preferredRelation:Relation}) => api<{code:string}>('/create',opts),
  join: (code:string,relation:Relation) => api<{code:string}>('/join',{code,relation}),
  state: <T>(code:string) => api<T>(`/room/${encodeURIComponent(code)}`),
  color: (code:string,color:string) => api<unknown>('/color',{code,color}),
  countdown: (code:string) => api<unknown>('/countdown',{code}),
  fill: (code:string) => api<unknown>('/fill',{code}),
  move: (code:string,moveId:string) => api<unknown>('/move',{code,moveId}),
  discard: (code:string,discardIndex:number) => api<unknown>('/move',{code,discardIndex}),
};
