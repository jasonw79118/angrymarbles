import { useEffect, useRef } from 'react';
import type { Piece, Player, ConfirmedAction } from '../types';
import {animateAction} from './animateAction';
import {addTableMaterials} from './materials';
import boardGeometry from '../../pb_hooks/boardGeometry.cjs';

type Props = {
  sideCount: number;
  players: Player[];
  pieces: Piece[];
  activeSeat: number;
  selectedPieceIds?: string[];
  onPieceSelect?: (pieceId:string)=>void;
  showIndices?: boolean;
  action?: ConfirmedAction|null;
  fast?: boolean;
};

type Point = { x: number; y: number };

const COLORS = ['#329bff','#f04b5c','#17c98c','#ffcf3e','#bb7bff','#fa963b','#21c7e5','#ed74b3'];
const add = (origin: Point, direction: Point, distance = 1): Point => ({x:origin.x+direction.x*distance,y:origin.y+direction.y*distance});

export default function ApprovedBoard({sideCount,players,pieces,activeSeat,selectedPieceIds=[],onPieceSelect,showIndices=false,action=null,fast=false}:Props){
  const svgRef=useRef<SVGSVGElement>(null);

  const onPieceSelectRef=useRef(onPieceSelect);

  useEffect(()=>{onPieceSelectRef.current=onPieceSelect;},[onPieceSelect]);
  useEffect(()=>{
    const svg=svgRef.current;
    if(!svg)return;
    const selectPiece=(event:Event)=>{
      const target=event.target;
      if(!(target instanceof Element))return;
      const marble=target.closest<SVGGElement>('[data-piece-id]');
      const id=marble?.getAttribute('data-piece-id');
      if(id&&!id.startsWith('moving-'))onPieceSelectRef.current?.(id);
    };
    const selectWithKeyboard=(event:KeyboardEvent)=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();selectPiece(event);}
    };
    svg.addEventListener('click',selectPiece);
    svg.addEventListener('keydown',selectWithKeyboard);
    return ()=>{svg.removeEventListener('click',selectPiece);svg.removeEventListener('keydown',selectWithKeyboard);};
  },[]);

  useEffect(()=>{
    const svg=svgRef.current;
    if(!svg)return;
    const NS='http://www.w3.org/2000/svg';
    const geo=boardGeometry.geometry(sideCount);
    const seatPlayers=new Map(players.map(player=>[player.seat,player]));
    const selectedPieces=new Set(action?[]:selectedPieceIds);
    const colorFor=(seat:number)=>seatPlayers.get(seat)?.color||COLORS[seat%COLORS.length];
    const el=(tag:string,attrs:Record<string,string|number|undefined>={},parent:Element=svg)=>{
      const node=document.createElementNS(NS,tag);
      for(const [key,value] of Object.entries(attrs))if(value!==undefined)node.setAttribute(key,String(value));
      parent.append(node);return node;
    };
    const marble=(position:Point,seat:number,id:string,selected=false)=>{
      const moving=id.startsWith('moving-');
      const slot=Number(id.split(':')[1]);
      const owner=seatPlayers.get(seat)?.name||`Player ${seat+1}`;
      const group=el('g',{'data-id':id,'data-piece-id':id,class:`marble${selected?' selected':''}`,role:moving?undefined:'button',tabindex:moving?undefined:0,'aria-label':moving?undefined:`Select ${owner}'s marble ${slot+1}`,'pointer-events':moving?'none':'auto'});
      el('circle',{cx:position.x,cy:position.y,r:18,fill:'transparent',class:'piece-hit'},group);
      if(selected)el('circle',{cx:position.x,cy:position.y,r:15.5,fill:'#ffe18a28',stroke:'#fff0a1','stroke-width':2.5,class:'selection-ring'},group);
      el('circle',{cx:position.x,cy:position.y,r:10.5,fill:`url(#ball${seat%COLORS.length})`,stroke:selected?'#fff2ad':'#fff8','stroke-width':selected?2.4:1.3},group);
      el('circle',{cx:position.x,cy:position.y,r:9.7,fill:'url(#lens)',opacity:.67},group);
      el('ellipse',{cx:position.x-3.3,cy:position.y-3.8,rx:3.1,ry:1.9,fill:'#fff',opacity:.72},group);
      el('circle',{cx:position.x-5.2,cy:position.y-5.2,r:1.05,fill:'#fff',opacity:.88},group);
      return group;
    };
    const positionOf=(piece:Piece):Point=>{
      const side=geo.sides[piece.seat]||geo.sides[0];
      let position:Point|undefined;
      if(piece.loc==='track'){
        const index=boardGeometry.trackIndex(piece.seat,piece.progress,sideCount)%(sideCount*18);
        position=geo.sides[Math.floor(index/18)]?.holes[index%18];
      }
      else if(piece.loc==='run'||piece.loc==='home')position=side.home[Math.max(0,Math.min(piece.run,4))];
      else position=side.base[4-piece.slot];
      if(position)return position;
      console.warn('Missing board position for marble',piece.id,piece.seat,piece.loc,piece.slot,piece.run,piece.progress);
      return side.base[0];
    };
    const activeSide=geo.sides[activeSeat]||geo.sides[0];
    const boardOrientation=180-Math.atan2(activeSide.along.y,activeSide.along.x)*180/Math.PI;
    const draw=()=>{
      svg.replaceChildren();
      const defs=el('defs');
      addTableMaterials(defs,el);
      COLORS.forEach((fallback,index)=>{
        const color=colorFor(index)||fallback;
        const ball=el('radialGradient',{id:`ball${index}`,cx:'28%',cy:'25%',r:'85%'},defs);
        for(const [offset,shade] of [['0%','#fff'],['27%',color],['64%',color],['100%','#142031']])el('stop',{offset,'stop-color':shade},ball);
      });
      const polygon=(vertices:Point[],attrs:Record<string,string|number>)=>el('polygon',{points:vertices.map(point=>`${point.x},${point.y}`).join(' '),...attrs});
      const outer=geo.corners.map(point=>({x:geo.center.x+(point.x-geo.center.x)*(geo.radius+44)/geo.radius,y:geo.center.y+(point.y-geo.center.y)*(geo.radius+44)/geo.radius}));
      const inner=geo.corners.map(point=>({x:geo.center.x+(point.x-geo.center.x)*(geo.radius-40)/geo.radius,y:geo.center.y+(point.y-geo.center.y)*(geo.radius-40)/geo.radius}));
      polygon(outer.map(point=>({x:point.x+4,y:point.y+7})),{fill:'#000',opacity:.37,filter:'url(#shadow)'});
      polygon(outer,{fill:'url(#wood)',stroke:'#6a3c1e','stroke-width':9,'stroke-linejoin':'round'});
      polygon(inner,{fill:'url(#felt)',stroke:'#2e160e','stroke-width':10,'stroke-linejoin':'round'});
      polygon(outer,{fill:'url(#grain)',opacity:.56,'pointer-events':'none'});
      polygon(inner,{fill:'url(#felt)','pointer-events':'none'});
      const roundedWood=(from:Point,to:Point,width:number,rim='#713614')=>{
        el('line',{x1:from.x,y1:from.y,x2:to.x,y2:to.y,stroke:rim,'stroke-width':width+9,'stroke-linecap':'round',opacity:.94});
        el('line',{x1:from.x,y1:from.y,x2:to.x,y2:to.y,stroke:'url(#wood)','stroke-width':width,'stroke-linecap':'round'});
        el('line',{x1:from.x-5,y1:from.y-5,x2:to.x-5,y2:to.y-5,stroke:'#ffd78d','stroke-width':'1.5',opacity:.24});
      };
      const carvedHole=(position:Point,fill='#422012',stroke='#d59b53',radius=8,kind='track',id='')=>{
        el('circle',{cx:position.x,cy:position.y,r:radius+2.7,fill:'#6d3d21',stroke,'stroke-width':'1.9',class:'hole','data-hole-type':kind,'data-hole-id':id});
        el('circle',{cx:position.x,cy:position.y,r:radius-1,fill,stroke:'#482217','stroke-width':1,'data-hole-inner':`${kind}-${id}`});
        el('ellipse',{cx:position.x-2.5,cy:position.y-3.2,rx:radius*.35,ry:radius*.2,fill:'#f5c588',opacity:fill==='#422012'?.11:.15});
      };
      geo.sides.forEach(side=>{
        // Gold rail material uses the existing side endpoints, never a new movement graph.
        el('line',{x1:side.from.x,y1:side.from.y,x2:side.to.x,y2:side.to.y,stroke:'#744020','stroke-width':45,'stroke-linecap':'round'});
        el('line',{x1:side.from.x,y1:side.from.y,x2:side.to.x,y2:side.to.y,stroke:'url(#wood)','stroke-width':37,'stroke-linecap':'round'});
        el('line',{x1:side.from.x,y1:side.from.y,x2:side.to.x,y2:side.to.y,stroke:'url(#grain)','stroke-width':37,'stroke-linecap':'round',opacity:.52});
      });
      geo.sides.forEach((side,seat)=>{
        roundedWood(add(side.red,side.inward,12),add(side.red,side.inward,126),29,'#8c4835');
        side.home.forEach((position,index)=>carvedHole(position,'#482212','#daab62',7.3,'home',`${seat}-${index}`));
        side.track.forEach((position,index)=>{
          const marker=index===2?'red':index===8?'green':null;
          carvedHole(position,marker==='red'?'#ff476a':marker==='green'?'#2cfaa7':'#2a120b',marker==='red'?'#ffd2a1':marker==='green'?'#eaf2a7':'#ffd88b',7.7,'track',String(seat*18+index));
          const hole=svg.querySelector(`[data-hole-type="track"][data-hole-id="${seat*18+index}"]`);
          if(marker&&hole)hole.setAttribute('data-marker',marker);
        });
        const angle=Math.atan2(side.along.y,side.along.x)*180/Math.PI;
        const normalizedAngle=(angle+boardOrientation+360)%360;
        const readableAngle=normalizedAngle>90&&normalizedAngle<270?angle+180:angle;
        const laneLabel=(position:Point,label:string,color:string,inward=-25,along=0)=>{
          const at=add(add(position,side.inward,inward),side.along,along);
          const group=el('g',{transform:`translate(${at.x} ${at.y}) rotate(${readableAngle})`,'pointer-events':'none'});
          const text=el('text',{x:0,y:4,'text-anchor':'middle',fill:color,'font-size':12,'font-weight':900,stroke:'#06182a','stroke-width':2.5,'paint-order':'stroke'},group);text.textContent=label;
        };
        laneLabel(side.red,'HOME','#ffe6a3',52,-26);laneLabel(side.green,'START','#8bffba');

      });
      for(const piece of pieces.filter(item=>item.loc==='track'))marble(positionOf(piece),piece.seat,piece.id,selectedPieces.has(piece.id));
      for(const piece of pieces.filter(item=>item.loc==='run'||item.loc==='home'))marble(positionOf(piece),piece.seat,piece.id,selectedPieces.has(piece.id));
      if(showIndices){
        const side=geo.sides[0];
        [0,2,8,18].forEach(position=>{const point=side.holes[position],at=add(point,side.inward,-28),text=el('text',{x:at.x,y:at.y+5,'text-anchor':'middle',class:'numbadge'});text.textContent=String(position);});
        const at=add(side.red,side.inward,144),text=el('text',{x:at.x,y:at.y+4,'text-anchor':'middle',class:'numbadge'});text.textContent='5 HOME';
      }
      const layer=document.createElementNS(NS,'g');
      layer.setAttribute('transform',`rotate(${boardOrientation} ${geo.center.x} ${geo.center.y})`);
      while(svg.firstChild)layer.append(svg.firstChild);
      svg.append(layer);
      const title=geo.center;
      const angry=el('text',{x:title.x,y:title.y-8,'text-anchor':'middle',fill:'#ffba3f','font-size':52,'font-weight':1000,stroke:'#6e251c','stroke-width':6,'paint-order':'stroke'});angry.textContent='ANGRY';
      const marbles=el('text',{x:title.x,y:title.y+41,'text-anchor':'middle',fill:'#85caff','font-size':50,'font-weight':1000,stroke:'#142e65','stroke-width':6,'paint-order':'stroke'});marbles.textContent='MARBLES';
      const info=el('text',{x:title.x,y:title.y+83,'text-anchor':'middle',fill:'#a5d3df','font-size':15,'letter-spacing':2});info.textContent=`${sideCount} SIDES  ·  ${sideCount*18} TRACK SPACES`;
      return layer;
    };
    const boardLayer=draw();
    if(action){
      try{return animateAction(svg,boardLayer,sideCount,players,action,marble,fast);}
      catch{
        // Presentation failures must never hide or change the confirmed game result.
        document.querySelectorAll('.inventory-flight').forEach(node=>node.remove());
        draw();
      }
    }
  },[sideCount,JSON.stringify(players),JSON.stringify(pieces),activeSeat,action?'':selectedPieceIds.join(','),showIndices,action?.id,fast]);


  return <svg ref={svgRef} id="board" viewBox="0 0 1040 970" aria-label="Accurate Angry Marbles board geometry" role="img"/>;
}