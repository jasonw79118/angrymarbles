import {useCallback,useEffect,useRef,useState} from 'react';
import type {ConfirmedAction,RoomState} from './types';
import {buildActionTimeline} from './board/actionTimeline.js';

export function useActionPlayback(fast:boolean){
  const [room,setRoom]=useState<RoomState|null>(null);
  const [action,setAction]=useState<ConfirmedAction|null>(null);
  const latest=useRef<RoomState|null>(null),queue=useRef<ConfirmedAction[]>([]);
  const seen=useRef(0),running=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const speed=useRef(fast);speed.current=fast;
  const pump=useRef<()=>void>(()=>{});
  pump.current=()=>{
    const state=latest.current;if(!state)return;
    const next=queue.current.shift();
    if(!next){running.current=false;setAction(null);setRoom(state);return;}
    running.current=true;
    // Reconstruct this confirmed step even if several newer updates arrived together.
    const pieces=state.pieces.map(p=>({...p}));
    for(const event of [...(state.actions||[])].reverse()){
      if(event.seq<=next.seq)break;
      for(const change of event.changes){const index=pieces.findIndex(p=>p.id===change.from.id);if(index>=0)pieces[index]={...change.from};}
    }
    setRoom({...state,pieces,turnSeat:next.actorSeat,turnNumber:next.turnNumber,
      players:state.players.map(p=>({...p,baseCount:next.baseCounts[p.seat]??p.baseCount,
        marbleCount:pieces.filter(m=>m.seat===p.seat&&m.loc==='home').length}))});
    setAction(next);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeline=buildActionTimeline(next,state.boardSides||state.capacity,{fast:speed.current,reducedMotion:reduced});
    timer.current=setTimeout(()=>pump.current(),timeline.duration);
  };
  const accept=useCallback((state:RoomState)=>{
    const previous=latest.current;
    // Responses can race on the WebSocket invalidation and the move POST refresh.
    if(previous&&previous.code===state.code&&((state.actionSeq||0)<(previous.actionSeq||0)||state.turnNumber<previous.turnNumber))return;
    latest.current=state;
    if(!previous||previous.code!==state.code){
      if(timer.current)clearTimeout(timer.current);
      queue.current=[];running.current=false;seen.current=state.actionSeq||0;setAction(null);setRoom(state);return;
    }
    const events=(state.actions||[]).filter(e=>e.seq>seen.current).sort((a,b)=>a.seq-b.seq);
    if(events.length){
      // A history gap means restore the authoritative result, not an invented route.
      if(events[0].seq!==seen.current+1){queue.current=[];if(timer.current)clearTimeout(timer.current);running.current=false;setAction(null);setRoom(state);}
      else queue.current.push(...events);
      seen.current=events.at(-1)!.seq;
    }
    if(!running.current)pump.current();
  },[]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return {room,action,animating:action!==null,accept};
}
