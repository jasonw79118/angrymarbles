import { useEffect, useRef } from 'react';
import type { Piece, Player } from '../types';
import boardGeometry from '../../pb_hooks/boardGeometry.cjs';

type Props = {
  sideCount: number;
  players: Player[];
  pieces: Piece[];
  activeSeat: number;
  selectedPieceIds?: string[];
  onPieceSelect?: (pieceId:string)=>void;
  showIndices?: boolean;
};

type Point = { x: number; y: number };

const COLORS = ['#329bff','#f04b5c','#17c98c','#ffcf3e','#bb7bff','#fa963b','#21c7e5','#ed74b3'];
const add = (origin: Point, direction: Point, distance = 1): Point => ({x:origin.x+direction.x*distance,y:origin.y+direction.y*distance});

export default function ApprovedBoard({sideCount,players,pieces,activeSeat,selectedPieceIds=[],onPieceSelect,showIndices=false}:Props){
  const svgRef=useRef<SVGSVGElement>(null);
  const previousRef=useRef<Piece[]>([]);
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
    const selectedPieces=new Set(selectedPieceIds);
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
      if(selected)el('circle',{cx:position.x,cy:position.y,r:15.5,fill:'#ffe18a28',stroke:'#fff0a1','stroke-width':2.5,class:'selection-ring'},group);
      el('circle',{cx:position.x,cy:position.y,r:10.5,fill:`url(#ball${seat%COLORS.length})`,stroke:selected?'#fff2ad':'#fff8','stroke-width':selected?2.4:1.3},group);
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
    const pathOf=(from:Piece,to:Piece):Point[]=>{
      const path=[positionOf(from)];
      if(from.loc==='track'&&to.loc==='track'){
        const step=Math.sign(to.progress-from.progress);
        for(let progress=from.progress+step;step&&((progress-to.progress)*step)<=0;progress+=step){
          const index=boardGeometry.trackIndex(from.seat,progress,sideCount);
          path.push(geo.sides[Math.floor(index/18)].holes[index%18]);
        }
      }else if(from.loc==='track'&&(to.loc==='run'||to.loc==='home')){
        let threshold=boardGeometry.homeEntryProgress(from.seat,sideCount);
        while(threshold<=from.progress)threshold+=sideCount*18;
        for(let progress=from.progress+1;progress<threshold;progress++){
          const index=boardGeometry.trackIndex(from.seat,progress,sideCount);
          path.push(geo.sides[Math.floor(index/18)].holes[index%18]);
        }
        for(let position=0;position<=Math.min(to.run,4);position++)path.push(geo.sides[to.seat].home[position]);
      }else if(from.loc==='run'&&(to.loc==='run'||to.loc==='home')){
        for(let position=from.run+1;position<=Math.min(to.run,4);position++)path.push(geo.sides[to.seat].home[position]);
      }else{
        path.push(positionOf(to));
      }
      return path;
    };
    const activeSide=geo.sides[activeSeat]||geo.sides[0];
    const boardOrientation=180-Math.atan2(activeSide.along.y,activeSide.along.x)*180/Math.PI;
    const draw=()=>{
      svg.replaceChildren();
      const defs=el('defs');
      defs.innerHTML=`<linearGradient id="wood" x1="0%" y1="0%" x2="90%" y2="100%"><stop stop-color="#ffc57b"/><stop offset=".22" stop-color="#d9944b"/><stop offset=".56" stop-color="#c17c36"/><stop offset=".84" stop-color="#e6a965"/><stop offset="1" stop-color="#a96529"/></linearGradient><radialGradient id="felt" cx="48%" cy="45%" r="75%"><stop stop-color="#23647f"/><stop offset=".8" stop-color="#0b304c"/><stop offset="1" stop-color="#082237"/></radialGradient><filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="10"/></filter>`;
      // Image patterns skin the existing SVG shapes; geometry and hit targets stay intact.
      const artBase=`${import.meta.env.BASE_URL}assets/art/`;
      for(const texture of ['wood','felt']){
        const width=texture==='wood'?660:512,height=texture==='wood'?210:512;
        const pattern=el('pattern',{id:`art-${texture}`,width,height,patternUnits:'userSpaceOnUse'},defs);
        el('image',{href:`${artBase}${texture}.webp`,width,height,preserveAspectRatio:'none'},pattern);
      }
      COLORS.forEach((fallback,index)=>{
        const color=players.find(player=>player.seat%COLORS.length===index)?.color||fallback;
        const channels=[1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)/255);
        const filter=el('filter',{id:`marble-tint-${index}`,'color-interpolation-filters':'sRGB',x:0,y:0,width:1,height:1},defs);
        const transfer=el('feComponentTransfer',{},filter);
        channels.forEach((channel,i)=>el(`feFunc${['R','G','B'][i]}`,{type:'table',tableValues:`${channel*.12} ${channel*.65} ${channel} 1`},transfer));
        const pattern=el('pattern',{id:`ball${index}`,width:1,height:1,patternContentUnits:'objectBoundingBox'},defs);
        el('rect',{width:1,height:1,fill:color},pattern);
        el('image',{href:`${artBase}marble-neutral.png`,width:1,height:1,preserveAspectRatio:'none',filter:`url(#marble-tint-${index})`},pattern);
      });
      const polygon=(vertices:Point[],attrs:Record<string,string|number>)=>el('polygon',{points:vertices.map(point=>`${point.x},${point.y}`).join(' '),...attrs});
      const outer=geo.corners.map(point=>({x:geo.center.x+(point.x-geo.center.x)*(geo.radius+44)/geo.radius,y:geo.center.y+(point.y-geo.center.y)*(geo.radius+44)/geo.radius}));
      const inner=geo.corners.map(point=>({x:geo.center.x+(point.x-geo.center.x)*(geo.radius-40)/geo.radius,y:geo.center.y+(point.y-geo.center.y)*(geo.radius-40)/geo.radius}));
      polygon(outer.map(point=>({x:point.x+4,y:point.y+7})),{fill:'#000',opacity:.37,filter:'url(#shadow)'});
      polygon(outer,{fill:'url(#wood)',stroke:'#59351e','stroke-width':6,'stroke-linejoin':'round'});
      polygon(inner,{fill:'url(#felt)',stroke:'#94571e','stroke-width':7,'stroke-linejoin':'round'});
      polygon(outer,{fill:'url(#art-wood)',opacity:.28,'pointer-events':'none'});
      polygon(inner,{fill:'url(#art-felt)',opacity:.62,'pointer-events':'none'});
      const roundedWood=(from:Point,to:Point,width:number,rim='#713614')=>{
        el('line',{x1:from.x,y1:from.y,x2:to.x,y2:to.y,stroke:rim,'stroke-width':width+9,'stroke-linecap':'round',opacity:.94});
        el('line',{x1:from.x,y1:from.y,x2:to.x,y2:to.y,stroke:'url(#art-wood)','stroke-width':width,'stroke-linecap':'round'});
        el('line',{x1:from.x-5,y1:from.y-5,x2:to.x-5,y2:to.y-5,stroke:'#ffd78d','stroke-width':'1.5',opacity:.24});
      };
      const carvedHole=(position:Point,fill='#422012',stroke='#d59b53',radius=8,kind='track',id='')=>{
        el('circle',{cx:position.x,cy:position.y,r:radius+2.7,fill:'#714018',stroke,'stroke-width':'1.7',class:'hole','data-hole-type':kind,'data-hole-id':id});
        el('circle',{cx:position.x,cy:position.y,r:radius-1,fill,stroke:'#2e160d','stroke-width':'.85'});
        el('ellipse',{cx:position.x-2.5,cy:position.y-3.2,rx:radius*.35,ry:radius*.2,fill:'#f5c588',opacity:fill==='#422012'?.11:.15});
      };
      geo.sides.forEach((side,seat)=>{
        roundedWood(add(side.red,side.inward,12),add(side.red,side.inward,126),29,'#8c4835');
        roundedWood(add(side.green,side.inward,33),add(side.green,side.inward,151),34,'#306e54');
        side.home.forEach((position,index)=>carvedHole(position,'#482212','#daab62',7.3,'home',`${seat}-${index}`));
        side.base.forEach((position,index)=>carvedHole(position,'#402314','#b98d5b',10,'base',`${seat}-${index}`));
        side.track.forEach((position,index)=>{
          const marker=index===2?'red':index===8?'green':null;
          carvedHole(position,marker==='red'?'#c82e3c':marker==='green'?'#0a976b':'#422012',marker==='red'?'#ff9d98':marker==='green'?'#9ee4b4':'#d59b53',7.7,'track',String(seat*18+index));
          const hole=svg.querySelector(`[data-hole-type="track"][data-hole-id="${seat*18+index}"]`);
          if(marker&&hole)hole.setAttribute('data-marker',marker);
        });
        const angle=Math.atan2(side.along.y,side.along.x)*180/Math.PI;
        const normalizedAngle=(angle+boardOrientation+360)%360;
        const readableAngle=normalizedAngle>90&&normalizedAngle<270?angle+180:angle;
        const laneLabel=(position:Point,label:string,color:string)=>{
          const at=add(position,side.inward,-34),group=el('g',{transform:`translate(${at.x} ${at.y}) rotate(${readableAngle})`});
          el('rect',{x:-70,y:-21,width:140,height:42,rx:12,fill:'#061526',stroke:'#ffffff', 'stroke-width':3,opacity:1},group);
          el('rect',{x:-65,y:-16,width:130,height:32,rx:9,fill:'#0b2133',stroke:color,'stroke-width':3,opacity:1},group);
          const text=el('text',{x:0,y:8,'text-anchor':'middle',fill:'#fff','font-size':25,'font-weight':1000,'letter-spacing':.25,stroke:'#061526','stroke-width':2.5},group);text.textContent=label;
        };
        laneLabel(side.red,'HOME','#fa5b61');laneLabel(side.green,'BASE','#38cc96');
        const basePieces=pieces.filter(piece=>piece.seat===seat&&piece.loc==='base');
        basePieces.forEach(piece=>marble(side.base[4-piece.slot],seat,piece.id,selectedPieces.has(piece.id)));
        const badge=add(side.green,side.inward,169);
        el('circle',{cx:badge.x,cy:badge.y,r:14,fill:'#102842',stroke:colorFor(seat),'stroke-width':2});
        const count=el('text',{x:badge.x,y:badge.y+5,'text-anchor':'middle',fill:'#fff','font-weight':900,'font-size':15});count.textContent=String(basePieces.length);
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
    const previous=previousRef.current;
    const boardLayer=draw();
    previousRef.current=pieces.map(piece=>({...piece}));
    const animations:Array<{frame:number;group:SVGGElement;staticMarble:Element|null}>=[];
    for(const piece of pieces){
      const old=previous.find(candidate=>candidate.id===piece.id);
      if(!old||old.loc===piece.loc&&old.progress===piece.progress&&old.run===piece.run)continue;
      const finalMarble=boardLayer.querySelector(`[data-piece-id="${piece.id}"]`);
      if(!finalMarble)continue;
          const group=marble(positionOf(old),piece.seat,`moving-${piece.id}`,selectedPieces.has(piece.id)) as SVGGElement;
      finalMarble.setAttribute('opacity','0');
      boardLayer.append(group);
      const route=pathOf(old,piece);
      const frame=window.requestAnimationFrame(()=>{
        const started=performance.now();
        const segmentDuration=old.loc==='base'?740:150;
        const duration=route.length===1?330:segmentDuration*(route.length-1);
        const tick=(time:number)=>{
          const elapsed=Math.min(duration,time-started);
          const segment=Math.min(route.length-2,Math.floor(elapsed/segmentDuration));
          const progress=route.length===1?1:Math.min(1,(elapsed-segment*segmentDuration)/segmentDuration);
          const eased=1-Math.pow(1-progress,old.loc==='base'?3:2);
          const from=route[segment]||route[0],to=route[segment+1]||route[0];
          const x=from.x+(to.x-from.x)*eased,y=from.y+(to.y-from.y)*eased;
          group.querySelectorAll('circle').forEach(node=>{node.setAttribute('cx',String(x));node.setAttribute('cy',String(y));});
          group.querySelectorAll('ellipse').forEach(node=>{node.setAttribute('cx',String(x-3.3));node.setAttribute('cy',String(y-3.8));});
          if(elapsed<duration)window.requestAnimationFrame(tick);
          else{group.remove();finalMarble.setAttribute('opacity','1');}
        };
        window.requestAnimationFrame(tick);
      });
      animations.push({frame,group,staticMarble:finalMarble});
    }
    return ()=>{for(const animation of animations){window.cancelAnimationFrame(animation.frame);animation.group.remove();animation.staticMarble?.setAttribute('opacity','1');}};
  },[sideCount,players,pieces,activeSeat,selectedPieceIds,showIndices]);

  return <svg ref={svgRef} id="board" viewBox="0 0 1040 970" aria-label="Accurate Angry Marbles board geometry" role="img"/>;
}