const TRACK_PER_SIDE = 18;
const HOME_PER_SIDE = 5;
const BASE_PER_SIDE = 5;
const CENTER = Object.freeze({ x: 520, y: 485 });
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

function point(x, y) {
  return { x, y };
}

function add(origin, direction, distance = 1) {
  return point(origin.x + direction.x * distance, origin.y + direction.y * distance);
}

function corner(index, count, radius) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  return point(CENTER.x + Math.cos(angle) * radius, CENTER.y + Math.sin(angle) * radius);
}

function boardSides(mode, capacity) {
  if (mode === 'singles') return 4;
  if (mode === 'doubles' && [4, 6, 8].includes(capacity)) return capacity;
  throw new Error('Board geometry supports singles on four sides and team games with 4, 6, or 8 players.');
}

function trackLength(sideCount) {
  return TRACK_PER_SIDE * sideCount;
}

function startIndex(seat) {
  return seat * TRACK_PER_SIDE + 8;
}

function trackIndex(seat, progress, sideCount) {
  return mod(startIndex(seat) + progress, trackLength(sideCount));
}

function homeEntryProgress(seat, sideCount) {
  const redMarker = seat * TRACK_PER_SIDE + 2;
  return mod(redMarker - startIndex(seat), trackLength(sideCount)) + 1;
}

function oppositeSeat(seat, sideCount) {
  return mod(seat + sideCount / 2, sideCount);
}

function geometry(sideCount) {
  if (![4, 6, 8].includes(sideCount)) throw new Error('Board must have 4, 6, or 8 sides.');
  const radius = sideCount === 8 ? 419 : sideCount === 6 ? 391 : 374;
  const corners = Array.from({ length: sideCount }, (_, index) => corner(index, sideCount, radius));
  const sides = corners.map((from, seat) => {
    const to = corners[(seat + 1) % sideCount];
    const delta = point(to.x - from.x, to.y - from.y);
    const length = Math.hypot(delta.x, delta.y);
    const along = point(delta.x / length, delta.y / length);
    const inward = point(-along.y, along.x);
    const holes = Array.from({ length: TRACK_PER_SIDE + 1 }, (_, position) =>
      add(from, along, (position * length) / TRACK_PER_SIDE),
    );
    const track = holes.slice(0, TRACK_PER_SIDE).map((at, position) => ({
      ...at,
      id: seat * TRACK_PER_SIDE + position,
      seat,
      position,
      marker: position === 2 ? 'red' : position === 8 ? 'green' : null,
    }));
    const home = Array.from({ length: HOME_PER_SIDE }, (_, index) => ({
      ...add(holes[2], inward, 29 + 22 * index),
      id: `${seat}-${index}`,
      seat,
      position: index,
    }));
    const base = Array.from({ length: BASE_PER_SIDE }, (_, index) => ({
      ...add(holes[8], inward, 47 + 23 * index),
      id: `${seat}-${index}`,
      seat,
      position: index,
    }));
    return { seat, from, to, along, inward, length, holes, track, red: holes[2], green: holes[8], home, base };
  });
  return { sideCount, trackCount: trackLength(sideCount), radius, center: CENTER, corners, sides };
}

module.exports = { BASE_PER_SIDE, HOME_PER_SIDE, TRACK_PER_SIDE, boardSides, trackLength, startIndex, trackIndex, homeEntryProgress, oppositeSeat, geometry };