/* Angry Marbles geometry-lock contract.
   This file is deliberately dependency-free. All placements derive from ONE model.
   Visual styling / animations must not mutate coordinates or movement IDs.
   Intended to match the user's approved v0.4.2 polygon model exactly.
*/
(function (root) {
  'use strict';
  const BOARD_CX = 520;
  const BOARD_CY = 485;
  const SIDE_STEPS = 18;
  const RED_OFFSET = 2;
  const GREEN_OFFSET = 8;
  const HOME_OFFSET = 29;
  const HOME_STEP = 22;
  const INVENTORY_OFFSET = 47; // virtual-only; never rendered as holes on the board
  const INVENTORY_STEP = 23;
  const BOARD_RADIUS = Object.freeze({ 4: 374, 6: 391, 8: 419 });
  function add(a, vec, step) { return { x: a.x + vec.x * step, y: a.y + vec.y * step }; }
  function round(v) { return Math.round(v * 1000000) / 1000000; }
  function generate(playerCount) {
    if (![4, 6, 8].includes(playerCount)) throw new Error('Supported board sizes: 4, 6, 8');
    const radius = BOARD_RADIUS[playerCount];
    const corners = Array.from({ length: playerCount }, (_, i) => {
      const theta = -Math.PI / 2 + i * (2 * Math.PI / playerCount);
      return { x: BOARD_CX + Math.cos(theta) * radius,
               y: BOARD_CY + Math.sin(theta) * radius };
    });
    const sides = corners.map((a, seat) => {
      const b = corners[(seat + 1) % playerCount];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const forward = { x: dx / length, y: dy / length };
      const inward = { x: -forward.y, y: forward.x };
      const trackWithSharedEnd = Array.from({ length: 19 }, (_, i) => add(a, forward, i * length / SIDE_STEPS));
      const red = trackWithSharedEnd[RED_OFFSET];
      const green = trackWithSharedEnd[GREEN_OFFSET];
      return {
        seat,
        corner: a,
        nextCorner: b,
        forward,
        inward,
        trackWithSharedEnd,
        // There are exactly 18 UNIQUE shared track spaces per side; index 18 == next side index 0.
        track: trackWithSharedEnd.slice(0, SIDE_STEPS).map((p, step) => ({ ...p, id: `track-${seat * SIDE_STEPS + step}`, localStep: step, seat })),
        red: { ...red, id: `track-${seat * SIDE_STEPS + RED_OFFSET}`, localStep: RED_OFFSET },
        green: { ...green, id: `track-${seat * SIDE_STEPS + GREEN_OFFSET}`, localStep: GREEN_OFFSET },
        home: Array.from({ length: 5 }, (_, i) => ({ ...add(red, inward, HOME_OFFSET + i * HOME_STEP), id: `home-${seat}-${i}`, homeIndex: i })),
        // Preserve reference model for compatibility but these coordinates are NOT board holes anymore.
        inventoryVirtual: Array.from({ length: 5 }, (_, i) => ({ ...add(green, inward, INVENTORY_OFFSET + i * INVENTORY_STEP), id: `inventory-${seat}-${i}` })),
        spacing: length / SIDE_STEPS,
        length,
      };
    });
    return {
      playerCount,
      radius,
      center: { x: BOARD_CX, y: BOARD_CY },
      corners,
      sides,
      track: sides.flatMap((s) => s.track),
      homes: sides.flatMap((s) => s.home),
      // Intentionally NOT a collection of visible board holes.
      inventories: sides.flatMap((s) => s.inventoryVirtual),
      partnerOf: (seat) => (seat + playerCount / 2) % playerCount,
      manifest: Object.freeze({ perSideTrack: 18, perSideHome: 5, perSideInventory: 5,
        sharedTrack: playerCount * SIDE_STEPS, homeHoles: playerCount * 5,
        virtualInventorySlots: playerCount * 5,
        roundedTrackSpacing: round(sides[0].spacing) }),
    };
  }
  const API = Object.freeze({ generate, SIDE_STEPS, RED_OFFSET, GREEN_OFFSET, HOME_OFFSET, HOME_STEP, INVENTORY_OFFSET, INVENTORY_STEP, BOARD_RADIUS });
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof root !== 'undefined') root.AngryGeometry = API;
})(typeof window !== 'undefined' ? window : undefined);
