import test from 'node:test';
import assert from 'node:assert/strict';
import { initialAssemble, initialPlanar, assemblePlace, planarShift, cellPosition, isAssembleReferenceComplete, KINDS, tileTransition } from '../src/demoState.js';

test('Pass 06 coordinates center correctly', () => {
  assert.deepEqual(cellPosition(0, 0, 5), { x: -2, z: -2 });
  assert.deepEqual(cellPosition(5, 5, 6), { x: 2.5, z: 2.5 });
});
test('Assemble fixture 25 square cells, 10 rack entries and local preview only', () => {
  const s = initialAssemble();
  assert.equal(s.board.length, 25);
  assert.equal(s.board.filter(x => x !== null).length, 15);
  assert.equal(s.rack.length, 10);
  const changed = assemblePlace({ ...s, selected: 15 }, 15);
  assert.equal(changed.board[15], 15);
  assert.equal(changed.rack.length, 9);
  assert.equal(assemblePlace(s, 24), s);
  assert.equal(isAssembleReferenceComplete({ ...s, board: Array.from({ length: 25 }, (_, i) => i) }), true);
});
test('Planar deterministic 6x6 fixture with six kinds and stable IDs', () => {
  const s = initialPlanar();
  assert.equal(s.board.length, 36);
  assert.equal(KINDS.length, 6);
  const b = planarShift(s, 'row', 2, 1);
  assert.equal(b.board[13].id, s.board[12].id);
  assert.equal(b.board[12].id, s.board[17].id);
  assert.equal(new Set(b.board.map(x => x.id)).size, 36);
  const c = planarShift(b, 'row', 2, -1);
  assert.deepEqual(c.board, s.board);
  const d = planarShift(s, 'column', 1, 1);
  assert.equal(d.board[7].id, s.board[1].id);
  assert.equal(d.board[1].id, s.board[31].id);
  assert.equal(planarShift(s, 'row', -1, 1), s);
});
test('non-move visual changes snap stale tile coordinates to their new goals',()=>{
  const before=initialAssemble();
  assert.equal(tileTransition(true,before,{...before,uvProof:true}),'snap');
  assert.equal(tileTransition(true,before,{...before,demoMoves:1}),'animate');
  assert.equal(tileTransition(false,before,{...before,uvProof:true}),'none');
});
