import geometry from '../../pb_hooks/boardGeometry.cjs';

/** @param {import('../types').Piece} piece */
export function piecePoint(piece, sideCount) {
  const board = geometry.geometry(sideCount);
  if (piece.loc === 'track') {
    const index = geometry.trackIndex(piece.seat, piece.progress, sideCount);
    return board.sides[Math.floor(index / 18)].holes[index % 18];
  }
  if (piece.loc === 'base') return board.sides[piece.seat].green;
  return board.sides[piece.seat].home[Math.min(4, Math.max(0, piece.run))];
}

/** Follow confirmed steps through the existing holes, including backwards and home entry.
 * A teammate-exit redirect is deliberately separate from this walking route.
 * @param {import('../types').Piece} from
 * @param {import('../types').Piece} to
 * @param {import('../types').ConfirmedAction['ops'][number]} op
 */
export function buildMoveRoute(from, to, op, sideCount) {
  const route = [piecePoint(from, sideCount)];
  if (op.kind !== 'move' || !op.steps) return route;
  const board = geometry.geometry(sideCount);
  if (from.loc === 'track' && to.loc !== 'run' && to.loc !== 'home') {
    for (let i = 1; i <= Math.abs(op.steps); i++) {
      route.push(piecePoint({...from, progress: from.progress + i * Math.sign(op.steps)}, sideCount));
    }
  } else if (from.loc === 'track' && (to.loc === 'run' || to.loc === 'home')) {
    let entry = geometry.homeEntryProgress(from.seat, sideCount);
    while (entry <= from.progress) entry += sideCount * 18;
    for (let p = from.progress + 1; p < entry; p++) route.push(piecePoint({...from, progress: p}, sideCount));
    for (let i = 0; i <= to.run; i++) route.push(board.sides[to.seat].home[Math.min(4, i)]);
  } else if (from.loc === 'run' && (to.loc === 'run' || to.loc === 'home')) {
    for (let i = from.run + 1; i <= to.run; i++) route.push(board.sides[to.seat].home[Math.min(4, i)]);
  }
  return route;
}

export function movementTiming(route) {
  const hops = Math.max(1, route.length - 1);
  const hopMs = hops >= 8 ? 210 : 245;
  return {hops, hopMs, travelMs: hops * hopMs, settleMs: 300, duration: hops * hopMs + 300};
}

/** Pure frame sampler: ground follows holes; the render layer adds screen-up height.
 * @param {Array<{x:number,y:number}>} route
 */
export function sampleTokenMotion(route, t, direction = 1) {
  const timing = movementTiming(route);
  const ms = Math.max(0, Math.min(1, t)) * timing.duration;
  const f = Math.min(timing.hops, ms / timing.hopMs);
  const index = Math.min(timing.hops - 1, Math.floor(f));
  const phase = Math.min(1, f - index);
  const a = route[index] || route[0], b = route[index + 1] || a;
  // A short pause after each landing makes the individual spaces countable.
  const flight = Math.min(1, phase / .76);
  const ease = flight * flight * (3 - 2 * flight);
  const air = Math.sin(flight * Math.PI);
  const settling = ms >= timing.travelMs;
  const settle = Math.max(0, Math.min(1, (ms - timing.travelMs) / timing.settleMs));
  const impact = settling ? Math.sin(settle * Math.PI * 3) * (1 - settle) * .2
    : phase >= .76 ? Math.sin((phase - .76) / .24 * Math.PI) * .19 : -air * .1;
  return {
    x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * ease,
    lift: settling ? Math.max(0, Math.sin(settle * Math.PI * 2)) * (1 - settle) * 7
      : air * (index === timing.hops - 1 ? 24 : 18),
    scaleX: 1 + impact, scaleY: 1 - impact,
    roll: direction * (index + ease) * 160,
    hop: index + 1, hops: timing.hops,
    landing: phase >= .76 ? (phase - .76) / .24 : -1,
    settling, settle,
  };
}
