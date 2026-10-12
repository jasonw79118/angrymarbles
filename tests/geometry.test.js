import test from 'node:test';
import assert from 'node:assert/strict';
import boardGeometry from '../pb_hooks/boardGeometry.cjs';
const { geometry, homeEntryProgress, trackIndex } = boardGeometry;

for (const sideCount of [4, 6, 8]) {
  test(`${sideCount}-side board has the locked track, markers, and lanes`, () => {
    const board = geometry(sideCount);
    assert.equal(board.trackCount, sideCount * 18);
    assert.equal(board.sides.flatMap(side => side.track).length, sideCount * 18);
    assert.ok(board.sides.every(side => side.track.length === 18));
    assert.equal(board.sides.flatMap(side => side.home).length, sideCount * 5);
    assert.equal(board.sides.flatMap(side => side.base).length, sideCount * 5);

    for (const side of board.sides) {
      assert.equal(side.track[2].marker, 'red');
      assert.equal(side.track[8].marker, 'green');
      const nextSide = board.sides[(side.seat + 1) % sideCount];
      assert.deepEqual(side.holes[18], nextSide.holes[0]);
    }

    assert.equal(trackIndex(0, 10, sideCount), 18);
    assert.equal(homeEntryProgress(0, sideCount), sideCount * 18 - 5);
  });
}

test('singles use square geometry and team games use their player-count polygon', () => {
  assert.equal(geometry(4).trackCount, 72);
  assert.equal(geometry(6).trackCount, 108);
  assert.equal(geometry(8).trackCount, 144);
});