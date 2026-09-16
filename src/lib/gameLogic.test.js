import { describe, expect, it } from 'vitest';
import { GameLogic } from './gameLogic.js';

const createPieces = (count) => Array.from({ length: count }, (_, id) => ({
  id,
  correctPosition: id,
  isEdge: true
}));

describe('GameLogic placement pipeline', () => {
  it('places piece ID zero from the rack', () => {
    const logic = new GameLogic(
      { rows: 1, cols: 1, totalPieces: 1 },
      createPieces(1),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();

    const result = logic.placePiece('playerA', 0, 0);

    expect(result.success).toBe(true);
    expect(logic.grid[0]?.id).toBe(0);
  });

  it('keeps a single-player rack at capacity after placement', () => {
    const logic = new GameLogic(
      { rows: 3, cols: 4, totalPieces: 12 },
      createPieces(12),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    const piece = logic.playerARack[0];

    const result = logic.placePiece('playerA', piece.id, piece.correctPosition);

    expect(result.success).toBe(true);
    expect(logic.playerARack).toHaveLength(10);
    expect(logic.piecePool).toHaveLength(1);
  });

  it('rejects a piece that is not in the active rack', () => {
    const logic = new GameLogic(
      { rows: 3, cols: 4, totalPieces: 12 },
      createPieces(12),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    const unavailable = logic.piecePool[0];

    const result = logic.placePiece('playerA', unavailable.id, unavailable.correctPosition);

    expect(result).toMatchObject({ success: false, message: 'Piece is not available in your rack' });
  });

  it('uses explicit columns for rectangular adjacency', () => {
    const logic = new GameLogic(
      { rows: 2, cols: 3, totalPieces: 6 },
      createPieces(6),
      'SINGLE_PLAYER'
    );
    logic.grid[0] = logic.pieces[0];

    expect(logic.getAdjacentCorrectCount(1)).toBe(1);
    expect(logic.getAdjacentCorrectCount(3)).toBe(1);
  });

  it('returns incorrect milestone placements to the pool', () => {
    const logic = new GameLogic(
      { rows: 1, cols: 5, totalPieces: 5 },
      createPieces(5),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    const piece = logic.playerARack.find(candidate => candidate.correctPosition !== 0);

    logic.placePiece('playerA', piece.id, 0);
    const milestone = logic.reconcileSinglePlayerMilestone();

    expect(milestone).toEqual({ reached: true, removedCount: 1 });
    expect(logic.grid[0]).toBeNull();
    expect(logic.piecePool).toContainEqual(piece);
  });
});
