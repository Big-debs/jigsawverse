import { describe, expect, it } from 'vitest';
import {
  collapseAndRefill,
  createInitialBoard,
  createTile,
  findMatches,
  scoringMoves,
  shiftLine,
} from './planarMatchEngine';

function boardFromKinds(rows) {
  return rows.flatMap((row, rowIndex) =>
    row.map((kind, columnIndex) => createTile(kind, `${rowIndex}-${columnIndex}`)),
  );
}

describe('planar match engine', () => {
  it('shifts complete rows and columns with wrapping', () => {
    const board = boardFromKinds([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ]);

    expect(shiftLine(board, { axis: 'row', index: 1, direction: 1 }, 3).map((tile) => tile.kind)).toEqual([
      'a', 'b', 'c', 'f', 'd', 'e', 'g', 'h', 'i',
    ]);
    expect(shiftLine(board, { axis: 'column', index: 0, direction: -1 }, 3).map((tile) => tile.kind)).toEqual([
      'd', 'b', 'c', 'g', 'e', 'f', 'a', 'h', 'i',
    ]);
  });

  it('detects ordinary and seam-crossing matches', () => {
    const board = boardFromKinds([
      ['a', 'b', 'b', 'c', 'a', 'a'],
      ['b', 'c', 'd', 'e', 'f', 'a'],
      ['c', 'd', 'e', 'f', 'b', 'a'],
      ['d', 'e', 'f', 'b', 'c', 'd'],
      ['e', 'f', 'b', 'c', 'd', 'e'],
      ['f', 'b', 'c', 'd', 'e', 'f'],
    ]);

    const matches = findMatches(board, 6);
    expect(matches.indices).toEqual(expect.arrayContaining([0, 4, 5, 11, 17]));
    expect(matches.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: 'row', line: 0 }),
      expect.objectContaining({ axis: 'column', line: 5 }),
    ]));
  });

  it('collapses surviving tiles downward and refills from the top', () => {
    const board = boardFromKinds([
      ['a', 'x', 'x'],
      ['b', 'x', 'x'],
      ['c', 'x', 'x'],
    ]);
    let id = 0;
    const result = collapseAndRefill(board, [3, 6], {
      size: 3,
      random: () => 0,
      nextId: () => `new-${id++}`,
    });

    expect(result.board[6].kind).toBe('a');
    expect(result.createdIds).toEqual(['new-0', 'new-1']);
  });

  it('creates stable boards with at least one scoring shift', () => {
    const { board } = createInitialBoard({ size: 6, seed: 42 });
    expect(findMatches(board, 6).indices).toHaveLength(0);
    expect(scoringMoves(board, 6).length).toBeGreaterThan(0);
  });
});
