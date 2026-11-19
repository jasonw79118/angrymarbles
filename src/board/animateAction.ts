import type {ConfirmedAction,Piece,Player} from '../types';
import boardGeometry from '../../pb_hooks/boardGeometry.cjs';
import {buildActionTimeline} from './actionTimeline.js';
import {buildMoveRoute,sampleTokenMotion} from './tokenMotion.js';

type Point={x:number;y:number};
type Marble=(position:Point,seat:number,id:string,selected?:boolean)=>Element;
type Job={name:string;pieceId:string;seat:number;at:number;duration:number;start?:()=>void;tick:(t:number)=>void;finish?:()=>void;started?:boolean;done?:boolean};

// Adaptation of v0.6.0 screenPoint, pocketPoint, flyBall and showBoardLift.
// No rule decisions occur here: only confirmed from/to states and locked coordinates.
export function animateAction(svg:SVGSVGElement,layer:SVGGraphicsElement,sideCount:number,players:Player[],action:ConfirmedAction,marble:Marble,fast:boolean){
  const plan=buildActionTimeline(action,sideCount,{fast,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches});
  if(!plan.steps.length)return ()=>{};
  const geo=boardGeometry.geometry(sideCount),nodes:Element[]=[],restore:Array<()=>void>=[],jobs:Job[]=[];
  const color=(seat:number)=>players.find(p=>p.seat===seat)?.color||'#2499ff';
  const point=(piece:Piece):Point=>{
    if(piece.loc==='base')return geo.sides[piece.seat].green;
    if(piece.loc==='track'){const i=boardGeometry.trackIndex(piece.seat,piece.progress,sideCount);return geo.sides[Math.floor(i/18)].holes[i%18];}
    return geo.sides[piece.seat].home[Math.min(4,Math.max(0,piece.run))];
  };
  const screen=(p:Point)=>{const matrix=layer.getScreenCTM();return matrix?new DOMPoint(p.x,p.y).matrixTransform(matrix):null;};
  const center=(selector:string)=>{const r=document.querySelector(selector)?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null;};
  const pocket=(seat:number)=>center(`[data-inventory-pocket="${seat}"]`);
  const hide=(node:Element|null)=>{if(!node)return;const value=node.getAttribute('opacity');node.setAttribute('opacity','0');restore.push(()=>value===null?node.removeAttribute('opacity'):node.setAttribute('opacity',value));};
  const sElt=(tag:string,attrs:Record<string,string|number>,parent:Element=layer)=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));parent.append(node);return node;
  };
  const moving=new Map<string,{group:Element;origin:Point}>();
  const getMoving=(piece:Piece)=>{
    const old=moving.get(piece.id);if(old)return old;
    const origin=piece.loc==='base'?geo.sides[piece.seat].green:point(piece);
    const group=marble(origin,piece.seat,`moving-${piece.id}`);group.setAttribute('pointer-events','none');layer.append(group);nodes.push(group);
    const entry={group,origin};moving.set(piece.id,entry);return entry;
  };
  for(const change of action.changes)hide(layer.querySelector(`[data-piece-id="${change.to.id}"]`));
  const markPhase=(job:Job)=>{
    svg.dataset.animationAction=action.id;svg.dataset.animationPhase=job.name;
    svg.dispatchEvent(new CustomEvent('angrymarbles:visual-phase',{bubbles:true,detail:{actionId:action.id,name:job.name,seat:job.seat,pieceId:job.pieceId}}));
  };
  const pulse=(seat:number,on:boolean)=>document.querySelector(`[data-inventory-pocket="${seat}"]`)?.classList.toggle('pulse',on);
  const flight=(seat:number)=>{
    const orb=document.createElement('i');orb.className='inventory-flight v060-flight';orb.style.setProperty('--flight-color',color(seat));
    orb.style.left='0';orb.style.top='0';orb.setAttribute('aria-hidden','true');document.body.append(orb);nodes.push(orb);return orb;
  };
  for(const step of plan.steps){
    const change=action.changes.find(c=>c.to.id===step.pieceId);if(!change)continue;
    const {from,to}=change;
    const job:Job={...step,tick:()=>{}};
    if(step.name==='opponent-to-inventory'){
      const old=getMoving(from),token=document.querySelector<HTMLElement>(`[data-inventory-piece="${to.id}"]`);
      const op=action.ops.find(op=>op.piece===to.id);
      const source=op?.kind==='move'?buildMoveRoute(from,to,op,sideCount).at(-1)!:point(from);
      if(token){const previous=token.style.visibility;token.style.visibility='hidden';restore.push(()=>{token.style.visibility=previous;});}
      let orb:HTMLElement|null=null;
      job.start=()=>{old.group.setAttribute('opacity','0');orb=flight(to.seat);pulse(to.seat,true);};
      job.tick=t=>{const a=screen(source),b=pocket(to.seat);if(!a||!b||!orb)return;const ease=1-(1-t)**2;
        orb.style.transform=`translate(${a.x+(b.x-a.x)*ease-11}px,${a.y+(b.y-a.y)*ease-55*Math.sin(t*Math.PI)-11}px) scale(${1-.65*t})`;orb.style.opacity=String(1-.4*t);};
      job.finish=()=>{orb?.remove();if(token)token.style.visibility='';pulse(to.seat,false);};
    }else if(step.name==='teammate-to-red'){
      const old=getMoving(from),op=action.ops.find(op=>op.piece===to.id);
      const a=op?.kind==='move'?buildMoveRoute(from,to,op,sideCount).at(-1)!:point(from),b=point(to);
      const matrix=layer.getScreenCTM(),angle=matrix?Math.atan2(matrix.b,matrix.a):0,up={x:-Math.sin(angle),y:-Math.cos(angle)};
      const trail=sElt('path',{d:`M${a.x} ${a.y} Q${(a.x+b.x)/2+up.x*55} ${(a.y+b.y)/2+up.y*55} ${b.x} ${b.y}`,fill:'none',stroke:color(to.seat),'stroke-width':3,opacity:0,'pointer-events':'none',class:'teleport-trail'});nodes.push(trail);
      job.tick=t=>{const ease=1-(1-t)**2,lift=55*Math.sin(t*Math.PI);old.group.setAttribute('transform',`translate(${a.x+(b.x-a.x)*ease-old.origin.x+up.x*lift} ${a.y+(b.y-a.y)*ease-old.origin.y+up.y*lift})`);trail.setAttribute('opacity',String(Math.sin(t*Math.PI)*.8));};
    }else if(step.name==='joker-arrival'){
      const target=point(to),released=getMoving(from);released.group.setAttribute('opacity','0');let orb:HTMLElement|null=null;
      job.start=()=>{orb=flight(to.seat);pulse(to.seat,true);};
      job.tick=t=>{
        const a=center(`[data-inventory-piece="${to.id}"]`)||pocket(to.seat),b=screen(target);
        if(t<.8&&a&&b&&orb){const u=t/.8,ease=u*u*(3-2*u);
          orb.style.transform=`translate(${a.x+(b.x-a.x)*ease-11}px,${a.y+(b.y-a.y)*ease-75*Math.sin(u*Math.PI)-11}px) rotate(${u*540}deg) scale(${1+.3*Math.sin(u*Math.PI)})`;
        }else{
          orb?.remove();released.group.setAttribute('opacity','1');
          const u=Math.max(0,(t-.8)/.2),s=1+.22*Math.sin(u*Math.PI);
          released.group.setAttribute('transform',`translate(${target.x} ${target.y}) scale(${s} ${1/s}) translate(${-released.origin.x} ${-released.origin.y})`);
        }
      };
      job.finish=()=>{orb?.remove();pulse(to.seat,false);};
    }else if(step.name==='inventory-pocket-drop'){
      const released=getMoving({...to,loc:'base'});released.group.setAttribute('opacity','0');let orb:HTMLElement|null=null;
      job.start=()=>{orb=flight(to.seat);pulse(to.seat,true);};
      job.tick=t=>{const a=center(`[data-inventory-piece="${to.id}"]`),b=pocket(to.seat);if(!a||!b||!orb)return;
        orb.style.transform=`translate(${a.x+(b.x-a.x)*t-11}px,${a.y+(b.y-a.y)*t-15*Math.sin(t*Math.PI)-11}px) scale(${.8-.65*t})`;orb.style.opacity=String(1-.75*t);};
      job.finish=()=>{orb?.remove();pulse(to.seat,false);};
    }else if(step.name==='green-trapdoor-open'){
      const p=point(to),id=boardGeometry.trackIndex(to.seat,to.progress,sideCount);
      const inner=layer.querySelector(`[data-hole-inner="track-${id}"]`);
      if(inner){const previous=inner.getAttribute('fill')||'#00684f';restore.push(()=>inner.setAttribute('fill',previous));}
      const lid=sElt('g',{class:'trapdoor-lid','data-trap-track':id,'pointer-events':'none'});nodes.push(lid);
      const top=sElt('path',{d:'M-8 0 A8 8 0 0 1 8 0 Z',fill:'#25dca4',stroke:'#f6cf75','stroke-width':1.2},lid);
      const bottom=sElt('path',{d:'M8 0 A8 8 0 0 1 -8 0 Z',fill:'#08765a',stroke:'#f6cf75','stroke-width':1.2},lid);
      lid.setAttribute('transform',`translate(${p.x} ${p.y})`);lid.setAttribute('opacity','0');
      job.start=()=>{inner?.setAttribute('fill','#020406');lid.setAttribute('opacity','1');};
      job.tick=t=>{top.setAttribute('transform',`translate(0 ${-7*t}) scale(1 ${1-.92*t})`);bottom.setAttribute('transform',`translate(0 ${7*t}) scale(1 ${1-.92*t})`);};
      job.finish=()=>lid.setAttribute('opacity','.25');
    }else if(step.name==='green-marble-rise'){
      const p=point(to),released=getMoving({...to,loc:'base'});
      job.tick=t=>{const matrix=layer.getScreenCTM(),inverse=matrix?.inverse();
        const zero=inverse?new DOMPoint(0,0).matrixTransform(inverse):{x:0,y:0};
        const offset=inverse?new DOMPoint(0,18*(1-t)).matrixTransform(inverse):{x:0,y:18*(1-t)};
        const scale=t<.75?.1+1.05*(t/.75):1.15-.15*((t-.75)/.25);
        released.group.setAttribute('opacity',String(Math.min(1,t*4)));
        released.group.setAttribute('transform',`translate(${p.x+offset.x-zero.x} ${p.y+offset.y-zero.y}) scale(${scale}) translate(${-p.x} ${-p.y})`);};
    }else if(step.name==='green-trapdoor-close'){
      job.tick=t=>layer.querySelectorAll('.trapdoor-lid').forEach(node=>node.setAttribute('opacity',String(.25*(1-t))));
      job.finish=()=>layer.querySelectorAll('.trapdoor-lid').forEach(node=>node.remove());
    }else{
      const old=getMoving(from);
      const op=action.ops.find(op=>op.piece===to.id);
      if(!op)continue;
      const route=buildMoveRoute(from,to,op,sideCount);
      const body=old.group.querySelector('.marble-body'),glass=old.group.querySelector('.marble-glass'),shadow=old.group.querySelector('.marble-shadow');
      const {x:ox,y:oy}=old.origin;
      const fx=sElt('g',{'pointer-events':'none',opacity:0,'aria-hidden':'true',class:'token-landing-fx'});nodes.push(fx);
      const ring=sElt('ellipse',{cx:0,cy:5,rx:10,ry:4,fill:'none',stroke:'#fff2a0','stroke-width':2},fx);
      const stars=Array.from({length:7},()=>sElt('path',{d:'M0 -4 L1.4 -1.4 L4 0 L1.4 1.4 L0 4 L-1.4 1.4 L-4 0 L-1.4 -1.4 Z',fill:'#fff3aa',stroke:'#cb8b2d','stroke-width':.5},fx));
      const counter=sElt('text',{'text-anchor':'middle',fill:'#fff9d0',stroke:'#4d5b29','stroke-width':3,'paint-order':'stroke','font-size':15,'font-weight':900,'pointer-events':'none','aria-hidden':'true',opacity:0,class:'token-hop-counter'});nodes.push(counter);
      job.tick=t=>{
        const motion=sampleTokenMotion(route,t,Math.sign(op.steps||1));
        const matrix=layer.getScreenCTM(),angle=matrix?Math.atan2(matrix.b,matrix.a):0,degrees=angle*180/Math.PI;
        const up={x:-Math.sin(angle),y:-Math.cos(angle)};
        old.group.setAttribute('transform',`translate(${motion.x-ox} ${motion.y-oy})`);
        // Height and squash follow screen-up even when the player's board is rotated.
        body?.setAttribute('transform',`translate(${up.x*motion.lift} ${up.y*motion.lift}) translate(${ox} ${oy}) rotate(${-degrees}) scale(${motion.scaleX} ${motion.scaleY}) rotate(${degrees}) translate(${-ox} ${-oy})`);
        glass?.setAttribute('transform',`rotate(${motion.roll} ${ox} ${oy})`);
        const shadowScale=1-motion.lift/75;
        shadow?.setAttribute('transform',`translate(${ox+2} ${oy+8.6}) scale(${shadowScale}) translate(${-(ox+2)} ${-(oy+8.6)})`);
        shadow?.setAttribute('opacity',String(.5-motion.lift/100));
        counter.textContent=motion.settling&&to.loc==='home'?'HOME!':`${motion.hop} / ${motion.hops}`;
        counter.setAttribute('transform',`translate(${motion.x+up.x*(motion.lift+28)} ${motion.y+up.y*(motion.lift+28)}) rotate(${-degrees})`);
        counter.setAttribute('opacity',String(motion.settling?1-motion.settle:1));
        const burst=motion.settling?motion.settle:motion.landing;
        const spread=Math.max(0,burst);
        fx.setAttribute('transform',`translate(${motion.x} ${motion.y}) rotate(${-degrees})`);
        fx.setAttribute('opacity',String(burst<0?0:1-burst));
        ring.setAttribute('rx',String(9+spread*19));ring.setAttribute('ry',String(4+spread*8));
        stars.forEach((star,i)=>{
          const theta=i/7*Math.PI*2,r=10+spread*27;
          star.setAttribute('opacity',motion.settling?'1':'0');
          star.setAttribute('transform',`translate(${Math.cos(theta)*r} ${Math.sin(theta)*r-8*spread}) rotate(${spread*90+i*35}) scale(${1-.5*spread})`);
        });
        svg.dataset.animationHop=String(motion.hop);
      };
    }
    jobs.push(job);
  }
  let disposed=false,frame=0;const started=performance.now();
  const cleanup=()=>{
    for(const node of nodes)node.remove();for(const undo of restore)undo();for(const p of players)pulse(p.seat,false);
    delete svg.dataset.animationAction;delete svg.dataset.animationPhase;delete svg.dataset.animationHop;
  };
  const tick=(now:number)=>{
    if(disposed)return;
    try{
      let complete=true;
      for(const job of jobs){
        if(job.done)continue;const elapsed=now-started-job.at;
        if(elapsed<0){complete=false;continue;}
        if(!job.started){job.started=true;markPhase(job);job.start?.();}
        const t=Math.min(1,elapsed/job.duration);job.tick(t);
        if(t===1){job.done=true;job.finish?.();}else complete=false;
      }
      if(complete){cleanup();return;}
      frame=requestAnimationFrame(tick);
    }catch{cleanup();} // VFX failure restores the confirmed result, never a partial position.
  };
  frame=requestAnimationFrame(tick);
  return ()=>{disposed=true;cancelAnimationFrame(frame);cleanup();};
}
