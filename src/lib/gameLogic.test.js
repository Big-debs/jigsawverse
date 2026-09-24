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

  it('keeps a single-player rack at twice the grid width after placement', () => {
    const logic = new GameLogic(
      { rows: 3, cols: 4, totalPieces: 12 },
      createPieces(12),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    const piece = logic.playerARack[0];

    const result = logic.placePiece('playerA', piece.id, piece.correctPosition);

    expect(result.success).toBe(true);
    expect(logic.playerARack).toHaveLength(8);
    expect(logic.piecePool).toHaveLength(3);
  });

  it.each([
    [5, 10],
    [8, 16],
    [10, 20],
    [15, 30]
  ])('uses a two-row rack for a %ix%i grid', (gridSize, expectedCapacity) => {
    const logic = new GameLogic(
      { rows: gridSize, cols: gridSize, totalPieces: gridSize * gridSize },
      createPieces(gridSize * gridSize),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();

    expect(logic.rackCapacity).toBe(expectedCapacity);
    expect(logic.playerARack).toHaveLength(expectedCapacity);
  });

  it('keeps multiplayer rack tile IDs disjoint', () => {
    const pieces = createPieces(64);
    const logic = new GameLogic(
      { rows: 8, cols: 8, totalPieces: 64 },
      pieces,
      'NEXUS'
    );
    logic.initialize();

    const rackAIds = new Set(logic.playerARack.map(piece => piece.id));
    const rackBIds = logic.playerBRack.map(piece => piece.id);
    expect(rackBIds.some(id => rackAIds.has(id))).toBe(false);
    expect(logic.validateTileLocations()).toEqual({ valid: true, duplicates: [], missing: [] });
  });

  it('reconstructs joined-player ownership and scores both players at reveal', () => {
    const pieces = createPieces(4);
    const logic = new GameLogic(
      { rows: 2, cols: 2, totalPieces: 4 },
      pieces,
      'NEXUS'
    );
    logic.importGameState({
      grid: [0, 1, null, null],
      player_a_rack: [],
      player_b_rack: [],
      piece_pool: [2, 3],
      gameplay_mode: 'NEXUS',
      move_history: [
        { player: 'playerA', pieceId: 0, gridIndex: 0 },
        { player: 'playerB', pieceId: 1, gridIndex: 1 }
      ]
    }, pieces);

    const result = logic.resolveNexusEndGame();

    expect(result.success).toBe(true);
    expect(result.finalScores.playerA.score).toBe(10);
    expect(result.finalScores.playerB.score).toBe(10);
    expect(result.winner).toBe('tie');
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

    expect(milestone).toMatchObject({ reached: true, removedCount: 1, removedCells: [0] });
    expect(logic.grid[0]).toBeNull();
    expect(logic.piecePool).toContainEqual(piece);
    expect(logic.revealedScores.playerA.score).toBe(logic.scores.playerA.score);
  });

  it('keeps placement scoring concealed until a milestone is reconciled', () => {
    const logic = new GameLogic(
      { rows: 1, cols: 10, totalPieces: 10 },
      createPieces(10),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    const first = logic.playerARack.find(piece => piece.correctPosition === 0);

    logic.placePiece('playerA', first.id, 0);

    expect(logic.scores.playerA.score).toBeGreaterThan(0);
    expect(logic.revealedScores.playerA.score).toBe(0);
    expect(logic.reconcileSinglePlayerMilestone().reached).toBe(false);
    expect(logic.revealedScores.playerA.score).toBe(0);
  });
});


const createGridPieces = (rows, cols) => Array.from({ length: rows * cols }, (_, id) => {
  const row = Math.floor(id / cols);
  const col = id % cols;
  const edges = {
    top: row === 0,
    right: col === cols - 1,
    bottom: row === rows - 1,
    left: col === 0
  };
  return {
    id,
    correctPosition: id,
    row,
    col,
    edges,
    isEdge: Object.values(edges).some(Boolean)
  };
});

describe('GameLogic hint engine', () => {
  it('returns piece and cell targets for a position hint, including piece ID zero', () => {
    const logic = new GameLogic(
      { rows: 1, cols: 1, totalPieces: 1 },
      createGridPieces(1, 1),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();

    const result = logic.useHint('playerA', 'position');

    expect(result.success).toBe(true);
    expect(result.hint.pieceIds).toEqual([0]);
    expect(result.hint.cellIndices).toEqual([0]);
    expect(result.hint.targetCellIndex).toBe(0);
    expect(result.hint.player).toBe('playerA');
  });

  it('never offers an exact position hint whose target is occupied', () => {
    const pieces = createGridPieces(1, 3);
    const logic = new GameLogic(
      { rows: 1, cols: 3, totalPieces: 3 },
      pieces,
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    logic.grid[0] = pieces[2];
    logic.playerARack = [pieces[0], pieces[1]];

    const result = logic.useHint('playerA', 'position');

    expect(result.success).toBe(true);
    expect(result.hint.pieceIds).toEqual([1]);
    expect(result.hint.cellIndices).toEqual([1]);
  });

  it('uses explicit columns when producing a rectangular region', () => {
    const logic = new GameLogic(
      { rows: 2, cols: 3, totalPieces: 6 },
      createGridPieces(2, 3),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    logic.playerARack = [logic.pieces[5]];

    const result = logic.useHint('playerA', 'region');

    expect(result.success).toBe(true);
    expect(result.hint.pieceIds).toEqual([5]);
    expect(result.hint.region).toEqual({
      rowStart: 0,
      rowEnd: 1,
      colStart: 1,
      colEnd: 2
    });
    expect(result.hint.cellIndices).toEqual([1, 2, 4, 5]);
  });

  it('does not charge when no eligible edge piece is in the rack', () => {
    const logic = new GameLogic(
      { rows: 3, cols: 3, totalPieces: 9 },
      createGridPieces(3, 3),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    logic.playerARack = [logic.pieces[4]];
    const before = { ...logic.scores.playerA };

    const result = logic.useHint('playerA', 'edge');

    expect(result).toMatchObject({
      success: false,
      message: 'No edge pieces are currently in your rack'
    });
    expect(logic.scores.playerA).toEqual(before);
  });

  it('highlights rack edge pieces and all board-edge cells', () => {
    const pieces = createGridPieces(3, 3);
    const logic = new GameLogic(
      { rows: 3, cols: 3, totalPieces: 9 },
      pieces,
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    logic.playerARack = [pieces[1], pieces[4]];

    const result = logic.useHint('playerA', 'edge');

    expect(result.success).toBe(true);
    expect(result.hint.pieceIds).toEqual([1]);
    expect(result.hint.cellIndices).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  });

  it('enforces the configured per-game hint limit', () => {
    const logic = new GameLogic(
      { rows: 2, cols: 2, totalPieces: 4 },
      createGridPieces(2, 2),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();

    for (let index = 0; index < 5; index++) {
      expect(logic.useHint('playerA', 'position').success).toBe(true);
    }

    expect(logic.useHint('playerA', 'position')).toMatchObject({
      success: false,
      message: 'Maximum hints used for this game'
    });
    expect(logic.scores.playerA.hintsUsed).toBe(5);
  });

  it('shows a hint cost without revealing concealed placement points', () => {
    const logic = new GameLogic(
      { rows: 1, cols: 10, totalPieces: 10 },
      createGridPieces(1, 10),
      'SINGLE_PLAYER'
    );
    logic.initializeSinglePlayer();
    const correctPiece = logic.playerARack.find(piece => piece.correctPosition === 0);
    logic.placePiece('playerA', correctPiece.id, 0);
    const hiddenPlacementScore = logic.scores.playerA.score;

    const result = logic.useHint('playerA', 'position');

    expect(result.success).toBe(true);
    expect(logic.scores.playerA.score).toBe(hiddenPlacementScore + result.cost);
    expect(logic.revealedScores.playerA.score).toBe(result.cost);
  });
});
