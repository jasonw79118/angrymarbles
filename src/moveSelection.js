import geometry from '../pb_hooks/boardGeometry.cjs';

/** Read the public operation data already encoded in server-issued legal move IDs.
 * These are presentation hints only; the original ID still goes to the server.
 * @param {import('./types').Move} move
 * @param {import('./types').Piece[]} pieces
 */
export function moveParticipants(move, pieces, sideCount) {
  let ops=[];
  try { ops=move.id.split('|').slice(1).map(value=>JSON.parse(value)); } catch { /* older view fallback */ }
  const sources=[...new Set(ops.map(op=>op.piece).filter(id=>typeof id==='string'))];
  const targets=[];
  for(const op of ops){
    if(typeof op.target==='string')targets.push(op.target);
    const source=pieces.find(p=>p.id===op.piece);
    if(!source||op.kind==='joker'||(op.kind==='move'&&(source.loc!=='track'||op.home==='enter')))continue;
    const destination=op.kind==='release'?geometry.startIndex(source.seat)
      :geometry.trackIndex(source.seat,source.progress+(op.steps||0),sideCount);
    const occupant=pieces.find(p=>p.id!==source.id&&p.loc==='track'&&geometry.trackIndex(p.seat,p.progress,sideCount)===destination);
    if(occupant)targets.push(occupant.id);
  }
  return {sources:sources.length?sources:move.pieceIds||[],targets:[...new Set(targets)]};
}

/** Keep source and bump target independent, supporting either selection order.
 * @param {import('./types').Move[]} moves
 * @param {import('./types').Piece[]} pieces
 * @param {{sourceId:string,targetId:string,moveId:string}} selection
 */
export function selectMarble(moves,pieces,sideCount,selection,id){
  const entries=moves.map(move=>({move,...moveParticipants(move,pieces,sideCount)}));
  const sources=entries.filter(e=>e.sources.includes(id));
  if(sources.length){
    const matching=selection.targetId?sources.filter(e=>e.targets.includes(selection.targetId)):[];
    const choices=matching.length?matching:sources;
    return {sourceId:id,targetId:matching.length?selection.targetId:'',moveId:choices.length===1?choices[0].move.id:''};
  }
  let targets=entries.filter(e=>e.targets.includes(id)&&(!selection.sourceId||e.sources.includes(selection.sourceId)));
  if(!targets.length)return null;
  const sourceId=selection.sourceId||targets[0].sources[0];
  targets=targets.filter(e=>e.sources.includes(sourceId));
  return {sourceId,targetId:id,moveId:targets.length===1?targets[0].move.id:''};
}

/** Choose the closest eligible marble in screen pixels, not overlapping SVG hit boxes. */
export function nearestMarble(candidates,x,y,radius){
  let best=null,distance=radius;
  for(const candidate of candidates){
    const d=Math.hypot(candidate.x-x,candidate.y-y);
    if(d<=distance){distance=d;best=candidate.id;}
  }
  return best;
}
