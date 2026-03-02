// =====================================================
// IMAGE PROCESSOR - Slice images into puzzle pieces
// =====================================================

import { getModeConfig as importedGetModeConfig, getModeScoring as importedGetModeScoring } from './gameModes.js';
import { HINT_CONFIG } from './gameConfig.js';

export class ImageProcessor {
  constructor(imageSource, gridSize = 10) {
    this.imageSource = imageSource;
    this.gridSize = gridSize;
    this.image = null;
    this.pieces = [];
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  async loadImage() {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        this.image = img;
        resolve(img);
      };

      img.onerror = reject;

      if (typeof this.imageSource === 'string') {
        img.src = this.imageSource;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(this.imageSource);
      }
    });
  }

  calculateGridDimensions() {
    const aspectRatio = this.image.width / this.image.height;
    let cols = this.gridSize;
    let rows = this.gridSize;

    // For standard square grid sizes (5x5, 8x8, 10x10, 12x12, 15x15),
    // maintain square grids to ensure check/pass functionality works correctly
    const standardSquareSizes = [5, 8, 10, 12, 15];
    const isStandardSquare = standardSquareSizes.includes(this.gridSize);

    if (!isStandardSquare) {
      // For non-standard sizes, adjust based on aspect ratio
      if (aspectRatio > 1) {
        rows = Math.round(this.gridSize / aspectRatio);
      } else if (aspectRatio < 1) {
        cols = Math.round(this.gridSize * aspectRatio);
      }
    }
    // else: keep cols = rows = gridSize for standard square grids

    console.log(`Grid dimensions calculated: ${cols}x${rows} = ${cols * rows} pieces (gridSize: ${this.gridSize}, aspectRatio: ${aspectRatio.toFixed(2)})`);
    return { cols, rows, totalPieces: cols * rows };
  }

  async sliceImage() {
    if (!this.image) await this.loadImage();

    const { cols, rows, totalPieces } = this.calculateGridDimensions();
    const pieceWidth = this.image.width / cols;
    const pieceHeight = this.image.height / rows;

    this.pieces = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;

        this.canvas.width = pieceWidth;
        this.canvas.height = pieceHeight;

        this.ctx.drawImage(
          this.image,
          col * pieceWidth,
          row * pieceHeight,
          pieceWidth,
          pieceHeight,
          0,
          0,
          pieceWidth,
          pieceHeight
        );

        const dataUrl = this.canvas.toDataURL('image/png');

        this.pieces.push({
          id: index,
          correctPosition: index,
          row,
          col,
          imageData: dataUrl,
          isEdge: this.isEdgePiece(row, col, rows, cols),
          edges: this.getEdgeTypes(row, col, rows, cols)
        });
      }
    }

    return {
      pieces: this.pieces,
      gridDimensions: { cols, rows, totalPieces },
      pieceSize: { width: pieceWidth, height: pieceHeight }
    };
  }

  isEdgePiece(row, col, rows, cols) {
    return row === 0 || row === rows - 1 || col === 0 || col === cols - 1;
  }

  getEdgeTypes(row, col, rows, cols) {
    return {
      top: row === 0,
      bottom: row === rows - 1,
      left: col === 0,
      right: col === cols - 1
    };
  }

  shufflePieces() {
    const shuffled = [...this.pieces];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getPiecesForRack(count = 10) {
    // Distribute pieces across the grid to avoid clustering
    const shuffled = this.shufflePieces();
    const rackPieces = [];
    const selectedIndices = new Set();
    const step = Math.max(1, Math.floor(shuffled.length / count));

    for (let i = 0; i < count && rackPieces.length < count && i < shuffled.length; i++) {
      let index = (i * step) % shuffled.length;
      // If already selected, find the next available index
      while (selectedIndices.has(index) && selectedIndices.size < shuffled.length) {
        index = (index + 1) % shuffled.length;
      }
      if (!selectedIndices.has(index)) {
        selectedIndices.add(index);
        rackPieces.push(shuffled[index]);
      }
    }

    // Final shuffle of the selected pieces
    for (let i = rackPieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rackPieces[i], rackPieces[j]] = [rackPieces[j], rackPieces[i]];
    }

    return rackPieces;
  }
}

// =====================================================
// GAME LOGIC - Core puzzle game mechanics
// =====================================================

export class GameLogic {
  constructor(totalPieces = 100, pieces = [], mode = 'CLASSIC') {
    this.totalPieces = totalPieces;
    this.gridSize = Math.round(Math.sqrt(totalPieces));
    this.pieces = pieces;
    this.grid = Array(this.totalPieces).fill(null);
    this.piecePool = [...pieces];
    this.playerARack = [];
    this.playerBRack = [];
    this.currentTurn = 'playerA';
    this.scores = {
      playerA: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0, hintsUsed: 0 },
      playerB: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0, hintsUsed: 0 }
    };
    // Scores visible in the UI — only updated at 20% board-fill milestones
    this.revealedScores = {
      playerA: { score: 0, accuracy: 100, streak: 0 },
      playerB: { score: 0, accuracy: 100, streak: 0 }
    };
    this.gameState = 'setup';
    this.moveHistory = [];
    this.pendingCheck = null;
    this.nextCheckRevealProgress = 0.2;
    this.timerRemaining = 600; // Default 10 minutes
    this.isPlacementInProgress = false; // Add placement lock

    // Game mode support
    this.mode = mode || 'CLASSIC';
    this.modeConfig = importedGetModeConfig(mode);
    this.modeScoring = importedGetModeScoring(mode);
    this.turnsRemaining = {
      playerA: this.modeConfig.features.turnsPerRound,
      playerB: this.modeConfig.features.turnsPerRound
    };
    this.checksRemaining = {
      playerA: this.modeConfig.features.checksPerTurn,
      playerB: this.modeConfig.features.checksPerTurn
    };

    // Nexus mode state
    this.piecePlacedBy = {};  // gridIndex -> 'playerA'|'playerB'
    this.pieceMarks = {};     // gridIndex -> { marker, type: 'suspect'|'confident' }
    this.nexusResolved = false;
  }

  initialize() {
    // Shuffle the piece pool to randomize distribution
    this.piecePool = this.shufflePieces();
    this.fillRack('playerA');
    this.fillRack('playerB');
    this.gameState = 'active';
  }

  shufflePieces() {
    const shuffled = [...this.pieces];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  fillRack(player) {
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    // ... rest of fillRack code

    // Filter out null AND undefined, then count actual pieces
    const actualPieces = rack.filter(p => p !== null && p !== undefined);
    const needed = 10 - actualPieces.length;

    // Create new rack with actual pieces first
    const newRack = [...actualPieces];

    // Add pieces from pool
    for (let i = 0; i < needed && this.piecePool.length > 0; i++) {
      const piece = this.piecePool.shift();
      if (piece) {
        newRack.push(piece);
      }
    }

    // Update the rack
    if (player === 'playerA') {
      this.playerARack = newRack;
    } else {
      this.playerBRack = newRack;
    }

    console.log(`Refilled ${player} rack: now has ${newRack.length} pieces`);
  }

  returnPieceToRack(player, piece) {
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;

    // Ensure piece has complete data including imageData
    // If piece only has metadata (id, correctPosition), look it up from this.pieces
    let completePiece = piece;
    if (piece && !piece.imageData && Array.isArray(this.pieces) && this.pieces.length > 0) {
      const fullPiece = this.pieces.find(p => p.id === piece.id);
      if (fullPiece) {
        completePiece = fullPiece;
        console.log(`Retrieved full piece data for piece ${piece.id} from pieces array`);
      } else {
        console.warn(`Warning: Could not find full piece data for piece ${piece.id}`);
      }
    }

    // Find first null/undefined slot
    const firstEmptySlot = rack.findIndex(p => p === null || p === undefined);

    if (firstEmptySlot !== -1) {
      // Fill the first empty slot
      rack[firstEmptySlot] = completePiece;
    } else {
      // No empty slot, push to end
      rack.push(completePiece);
    }

    console.log(`Returned piece ${completePiece.id} to ${player} rack (hasImageData: ${!!completePiece.imageData})`);
  }

  isValidPlacement(pieceId, gridIndex) {
    // Bounds check
    if (gridIndex < 0 || gridIndex >= this.totalPieces) {
      console.log('Invalid grid index:', gridIndex);
      return { valid: false, reason: 'Invalid grid position' };
    }

    // Check if grid position is empty (check both null AND undefined)
    const currentCell = this.grid[gridIndex];
    if (currentCell !== null && currentCell !== undefined) {
      console.log('Position occupied:', { gridIndex, currentCell });
      return { valid: false, reason: 'Position occupied' };
    }

    // Find the piece
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!piece) {
      console.log('Piece not found:', pieceId);
      return { valid: false, reason: 'Piece not found' };
    }

    const isCorrect = piece.correctPosition === gridIndex;

    return {
      valid: true,
      correct: isCorrect,
      piece
    };
  }

  placePiece(player, pieceId, gridIndex) {
    const isNexus = this.mode === 'NEXUS';

    // In non-NEXUS modes, check if it's this player's turn
    if (!isNexus && this.currentTurn !== player) {
      return { success: false, message: "Not your turn" };
    }

    // Check placement lock
    if (this.isPlacementInProgress) {
      return { success: false, message: "Placement in progress, please wait" };
    }

    // Set lock
    this.isPlacementInProgress = true;

    // Bounds check
    if (gridIndex < 0 || gridIndex >= this.totalPieces) {
      this.isPlacementInProgress = false; // Release lock on error
      return { success: false, message: 'Invalid grid position' };
    }

    const validation = this.isValidPlacement(pieceId, gridIndex);

    if (!validation.valid) {
      this.isPlacementInProgress = false; // Release lock on error
      return { success: false, message: validation.reason };
    }

    // Place piece on grid
    this.grid[gridIndex] = validation.piece;

    // Remove from rack
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const pieceIndex = rack.findIndex(p => p && p.id === pieceId);
    if (pieceIndex !== -1) {
      rack[pieceIndex] = null;
    }

    // Record move
    const move = {
      player,
      pieceId,
      gridIndex,
      correct: validation.correct,
      timestamp: Date.now()
    };
    this.moveHistory.push(move);

    const supportsCheckFlow = this.modeConfig?.features?.checksPerTurn > 0;
    const shouldRevealCheck = supportsCheckFlow && this.shouldRevealCheckAtCurrentProgress();

    if (isNexus) {
      // NEXUS mode: no check/pass, no scoring now. Track who placed what.
      this.piecePlacedBy[gridIndex] = player;
      this.pendingCheck = null;

      // Refill rack for this player
      const activeRack = player === 'playerA' ? this.playerARack : this.playerBRack;
      const remainingPieces = activeRack.filter(p => p !== null).length;
      if (remainingPieces === 0 && this.piecePool.length > 0) {
        this.fillRack(player);
      }

      this.isPlacementInProgress = false;
      return {
        success: true,
        correct: validation.correct,
        piece: validation.piece,
        awaitingCheck: false,
        scored: false,
        nexus: true
      };
    } else if (supportsCheckFlow) {
      // Modes with check/pass flow (CLASSIC, SUPER, SAGE)
      this.pendingCheck = {
        ...move,
        revealCorrectness: shouldRevealCheck
      };

      if (shouldRevealCheck) {
        this.nextCheckRevealProgress = Math.min(this.nextCheckRevealProgress + 0.2, 1);
      }
    } else {
      // No-check modes (SAVANT, SINGLE_PLAYER) — score immediately
      this.pendingCheck = null;
      const correctPts = this.modeScoring.correctPiece || 10;
      const wrongPts = this.modeScoring.wrongPiece || 0;

      if (validation.correct) {
        this.updateScore(player, correctPts, true);
      } else {
        this.updateScore(player, wrongPts, false);
      }

      // Decrement turns and switch if exhausted
      this.consumeTurn(player);
    }

    // Check if rack needs refilling (when all pieces used)
    const activeRack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const remainingPieces = activeRack.filter(p => p !== null).length;
    if (remainingPieces === 0 && this.piecePool.length > 0) {
      this.fillRack(player);
    }

    return {
      success: true,
      correct: validation.correct,
      piece: validation.piece,
      awaitingCheck: supportsCheckFlow,
      scored: !supportsCheckFlow
    };
  }

  shouldRevealCheckAtCurrentProgress() {
    const filledCells = this.grid.filter(cell => cell !== null && cell !== undefined).length;
    const progress = this.totalPieces > 0 ? filledCells / this.totalPieces : 0;
    return progress >= this.nextCheckRevealProgress;
  }

  calculateNextCheckRevealProgress() {
    const filledCells = this.grid.filter(cell => cell !== null && cell !== undefined).length;
    const progress = this.totalPieces > 0 ? filledCells / this.totalPieces : 0;
    const bucket = Math.floor(progress / 0.2);
    return Math.min((bucket + 1) * 0.2, 1);
  }

  /**
   * Sync revealedScores to actual scores when a milestone is hit.
   */
  syncRevealedScores() {
    this.revealedScores = {
      playerA: {
        score: this.scores.playerA.score,
        accuracy: this.scores.playerA.accuracy,
        streak: this.scores.playerA.streak
      },
      playerB: {
        score: this.scores.playerB.score,
        accuracy: this.scores.playerB.accuracy,
        streak: this.scores.playerB.streak
      }
    };
  }

  handleOpponentCheck(checker, checkDecision) {
    if (!this.pendingCheck) {
      return { success: false, message: 'No pending move to check' };
    }

    const move = this.pendingCheck;
    const placer = move.player;
    const isRevealed = move.revealCorrectness;

    if (checkDecision === 'check') {
      // CHECK outcome
      if (!move.correct) {
        // Piece is INCORRECT — checker catches it
        const checkerPoints = this.modeScoring.checkerSuccess || 5;
        this.updateScore(checker, checkerPoints, false);

        // Remove piece from grid
        const piece = this.grid[move.gridIndex];
        this.grid[move.gridIndex] = null;

        // Return piece to PLACER's rack
        if (piece) {
          this.returnPieceToRack(placer, piece);
        }

        this.pendingCheck = null;
        this.consumeCheck(checker);
        this.consumeTurn(placer);
        this.isPlacementInProgress = false;

        // Sync revealed scores at milestone
        if (isRevealed) this.syncRevealedScores();

        return {
          success: true,
          result: 'successful_check',
          message: `Checker gained ${checkerPoints} points for catching an incorrect piece.`,
          correctPlacement: false,
          checkerGained: checkerPoints,
          correctnessRevealed: isRevealed,
          scoresRevealed: isRevealed
        };
      } else {
        // Piece is CORRECT — placer rewarded, checker penalized
        const placerPoints = this.modeScoring.checkCorrect || 10;
        this.updateScore(placer, placerPoints, true);
        const checkerPenalty = this.modeScoring.checkerFail || -2;
        this.updateScore(checker, checkerPenalty, false);

        this.pendingCheck = null;
        this.consumeCheck(checker);
        this.consumeTurn(placer);
        this.isPlacementInProgress = false;

        // Sync revealed scores at milestone
        if (isRevealed) this.syncRevealedScores();

        return {
          success: true,
          result: 'failed_check',
          message: `Placer awarded ${placerPoints} points. Checker penalized ${checkerPenalty} points.`,
          correctPlacement: true,
          placerGained: placerPoints,
          checkerLost: checkerPenalty,
          correctnessRevealed: isRevealed,
          scoresRevealed: isRevealed
        };
      }
    } else {
      // PASS outcome
      if (move.correct) {
        // Piece is CORRECT — placer gets bonus for surviving pass
        const passBonus = this.modeScoring.passCorrect || 5;
        if (passBonus > 0) {
          this.updateScore(placer, passBonus, true);
        }

        this.pendingCheck = null;
        this.consumeTurn(placer);
        this.isPlacementInProgress = false;

        // Sync revealed scores at milestone
        if (isRevealed) this.syncRevealedScores();

        return {
          success: true,
          result: 'opponent_passed_correct',
          message: passBonus > 0
            ? `Opponent passed — piece was correct! Placer earned ${passBonus} points.`
            : 'Opponent passed — piece was correct. Turn moves to opponent.',
          correctPlacement: true,
          placerGained: passBonus,
          correctnessRevealed: isRevealed,
          scoresRevealed: isRevealed
        };
      } else {
        // Piece is INCORRECT — both penalized
        const piece = this.grid[move.gridIndex];
        this.grid[move.gridIndex] = null;

        if (piece) {
          this.returnPieceToRack(placer, piece);
        }

        const penalty = this.modeScoring.passWrong || -3;
        this.updateScore(placer, penalty, false);
        this.updateScore(checker, penalty, false);

        this.pendingCheck = null;
        this.consumeTurn(placer);
        this.isPlacementInProgress = false;

        // Sync revealed scores at milestone
        if (isRevealed) this.syncRevealedScores();

        return {
          success: true,
          result: 'opponent_passed_incorrect',
          message: `Both penalized (${penalty}). Piece removed and returned to placer.`,
          correctPlacement: false,
          bothPenalized: penalty,
          correctnessRevealed: isRevealed,
          scoresRevealed: isRevealed
        };
      }
    }
  }

  // =====================================================
  // NEXUS MODE — Suspect/Confident Marking & End-Game
  // =====================================================

  /**
   * Mark a placed piece as 'suspect' (opponent's piece you think is wrong)
   * or 'confident' (your own piece you're sure is right).
   */
  markPiece(player, gridIndex, markType) {
    if (this.mode !== 'NEXUS') {
      return { success: false, message: 'Marking is only available in Nexus mode' };
    }

    const piece = this.grid[gridIndex];
    if (!piece) {
      return { success: false, message: 'No piece at this position' };
    }

    const placedBy = this.piecePlacedBy[gridIndex];

    if (markType === 'suspect') {
      // Can only suspect opponent's pieces
      if (placedBy === player) {
        return { success: false, message: "You can't suspect your own piece" };
      }
    } else if (markType === 'confident') {
      // Can only be confident about your own pieces
      if (placedBy !== player) {
        return { success: false, message: "You can only mark confidence on your own pieces" };
      }
    } else {
      return { success: false, message: 'Invalid mark type' };
    }

    // Toggle: if same mark exists, remove it
    const existing = this.pieceMarks[gridIndex];
    if (existing && existing.marker === player && existing.type === markType) {
      delete this.pieceMarks[gridIndex];
      return { success: true, action: 'removed', gridIndex, markType };
    }

    this.pieceMarks[gridIndex] = { marker: player, type: markType };
    return { success: true, action: 'added', gridIndex, markType };
  }

  /**
   * Resolve the end-game for Nexus mode.
   * Validates all pieces against their correct positions and calculates scores.
   */
  resolveNexusEndGame() {
    if (this.mode !== 'NEXUS') {
      return { success: false, message: 'Not in Nexus mode' };
    }
    if (this.nexusResolved) {
      return { success: false, message: 'Game already resolved' };
    }

    this.nexusResolved = true;
    const scoring = this.modeScoring;
    const results = [];

    // Score each placed piece
    for (let i = 0; i < this.grid.length; i++) {
      const piece = this.grid[i];
      if (!piece) continue;

      const placedBy = this.piecePlacedBy[i] || 'playerA';
      const isCorrect = piece.correctPosition === i;
      const mark = this.pieceMarks[i];

      // Base placement score for the placer
      const pts = isCorrect ? (scoring.correctPiece || 10) : (scoring.wrongPiece || -5);
      this.scores[placedBy].score += pts;
      if (isCorrect) {
        this.scores[placedBy].correctPlacements++;
      }
      this.scores[placedBy].totalPlacements++;

      const result = { gridIndex: i, pieceId: piece.id, placedBy, isCorrect, points: pts };

      // Mark bonus/penalty
      if (mark) {
        let markPts = 0;
        if (mark.type === 'suspect') {
          markPts = isCorrect
            ? (scoring.suspectCorrect || -3)   // false accusation
            : (scoring.suspectWrong || 8);     // good detective work
          this.scores[mark.marker].score += markPts;
        } else if (mark.type === 'confident') {
          markPts = isCorrect
            ? (scoring.confidentCorrect || 5)  // correct confidence bonus
            : (scoring.confidentWrong || -8);  // overconfidence penalty
          this.scores[mark.marker].score += markPts;
        }
        result.mark = { ...mark, points: markPts };
      }

      results.push(result);
    }

    // Calculate accuracy
    for (const player of ['playerA', 'playerB']) {
      const s = this.scores[player];
      s.accuracy = s.totalPlacements > 0
        ? Math.round((s.correctPlacements / s.totalPlacements) * 100)
        : 100;
    }

    // Sync revealed scores at end-game
    this.syncRevealedScores();
    this.gameState = 'finished';

    return {
      success: true,
      results,
      finalScores: { ...this.scores },
      winner: this.getWinner()
    };
  }

  updateScore(player, points, isCorrectPlacement) {
    const score = this.scores[player];
    score.score += points;

    // Only update placement stats if this is an actual placement (not a penalty)
    // Penalties (negative points without correct placement) shouldn't affect accuracy
    if (points > 0 || isCorrectPlacement) {
      score.totalPlacements++;

      if (isCorrectPlacement) {
        score.correctPlacements++;
        score.streak++;
      } else {
        score.streak = 0;
      }

      score.accuracy = score.totalPlacements > 0
        ? Math.round((score.correctPlacements / score.totalPlacements) * 100)
        : 100;
    }

    // Apply mode-specific streak bonuses
    const streakThreshold = this.modeScoring.streakBonusThreshold || 3;
    const streakMultiplier = this.modeScoring.streakMultiplier || 1;

    if (score.streak >= streakThreshold) {
      const bonus = Math.floor(score.streak / streakThreshold) * 2 * streakMultiplier;
      score.score += bonus;
    }
  }

  /**
   * Consume one turn for the player. If they have turns remaining in
   * a multi-turn mode, they keep playing. Otherwise, switch to the
   * other player and reset both players' per-round counters.
   */
  consumeTurn(player) {
    const turnsPerRound = this.modeConfig?.features?.turnsPerRound ?? 1;

    if (turnsPerRound !== Infinity && this.turnsRemaining[player] > 0) {
      this.turnsRemaining[player]--;
    }

    // If the player has remaining turns, they keep playing (no switch)
    if (turnsPerRound !== Infinity && this.turnsRemaining[player] > 0) {
      this.isPlacementInProgress = false;
      return;
    }

    // Turns exhausted — switch to the other player and reset for next round
    this.switchTurn();
    this.resetTurnsForPlayer(player); // Reset the outgoing player for their next round
  }

  /**
   * Consume one check for the checker. Tracked per-turn for modes
   * like SAGE that allow multiple checks (checksPerTurn: 2).
   */
  consumeCheck(checker) {
    const checksPerTurn = this.modeConfig?.features?.checksPerTurn ?? 1;
    if (checksPerTurn > 0 && this.checksRemaining[checker] > 0) {
      this.checksRemaining[checker]--;
    }
  }

  switchTurn() {
    this.currentTurn = this.currentTurn === 'playerA' ? 'playerB' : 'playerA';

    // Release placement lock
    this.isPlacementInProgress = false;

    // Reset checks for the new current player's round
    const checksPerTurn = this.modeConfig?.features?.checksPerTurn ?? 1;
    this.checksRemaining[this.currentTurn] = checksPerTurn;

    const rack = this.currentTurn === 'playerA' ? this.playerARack : this.playerBRack;
    const hasNoPieces = !rack || rack.length === 0 || rack.every(p => p == null);

    if (hasNoPieces && this.piecePool.length > 0) {
      this.fillRack(this.currentTurn);
    }
  }

  isGameComplete() {
    // Use loose equality (!=) to catch both null and undefined
    const allPlaced = this.grid.every(cell => cell != null);
    const noMorePieces = this.piecePool.length === 0 &&
      this.playerARack.every(p => p == null) &&
      this.playerBRack.every(p => p == null);

    return allPlaced || noMorePieces;
  }

  getWinner() {
    if (!this.isGameComplete()) return null;

    const scoreA = this.scores.playerA.score;
    const scoreB = this.scores.playerB.score;

    if (scoreA > scoreB) return 'playerA';
    if (scoreB > scoreA) return 'playerB';
    return 'tie';
  }

  resetTurnsForPlayer(player) {
    if (this.turnsRemaining[player] !== undefined) {
      this.turnsRemaining[player] = this.modeConfig.features.turnsPerRound;
    }
    if (this.checksRemaining[player] !== undefined) {
      this.checksRemaining[player] = this.modeConfig.features.checksPerTurn;
    }
  }

  useHint(player, hintType) {

    const score = this.scores[player];

    // Check if player has exceeded hint limit
    if (score.hintsUsed >= HINT_CONFIG.MAX_HINTS_PER_GAME) {
      return { success: false, message: 'Maximum hints used for this game' };
    }

    // Get hint information based on type
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const availablePieces = rack.filter(p => p !== null);

    if (availablePieces.length === 0) {
      return { success: false, message: 'No pieces available for hint' };
    }

    const validHintTypes = Object.keys(HINT_CONFIG.COSTS);
    if (!validHintTypes.includes(hintType)) {
      return { success: false, message: 'Unknown hint type' };
    }

    // Get hint cost and deduct points only after validation passes
    const cost = HINT_CONFIG.COSTS[hintType];
    this.updateScore(player, cost, false);
    score.hintsUsed++;

    let hintInfo = {};

    switch (hintType) {
      case 'position': {
        const hintPiece = availablePieces[Math.floor(Math.random() * availablePieces.length)];
        hintInfo = {
          type: 'position',
          pieceId: hintPiece.id,
          correctPosition: hintPiece.correctPosition
        };
        break;
      }
      case 'edge': {
        const edgePieces = availablePieces.filter((p) => {
          const edges = p.edges || {};
          const edgeCount = [edges.top, edges.right, edges.bottom, edges.left].filter(Boolean).length;
          // Edge hints should exclude corner pieces (which have 2 edges).
          return p.isEdge && edgeCount === 1;
        });
        hintInfo = {
          type: 'edge',
          edgePieceIds: edgePieces.map(p => p.id)
        };
        break;
      }
      case 'corner': {
        const cornerPieces = availablePieces.filter(p => {
          const edges = p.edges || {};
          return (edges.top && edges.left) || (edges.top && edges.right) ||
            (edges.bottom && edges.left) || (edges.bottom && edges.right);
        });
        hintInfo = {
          type: 'corner',
          cornerPieceIds: cornerPieces.map(p => p.id)
        };
        break;
      }
      case 'region': {
        const hintPiece = availablePieces[Math.floor(Math.random() * availablePieces.length)];
        const correctRow = Math.floor(hintPiece.correctPosition / this.gridSize);
        const correctCol = hintPiece.correctPosition % this.gridSize;
        hintInfo = {
          type: 'region',
          pieceId: hintPiece.id,
          region: {
            rowStart: Math.max(0, correctRow - 1),
            rowEnd: Math.min(this.gridSize - 1, correctRow + 1),
            colStart: Math.max(0, correctCol - 1),
            colEnd: Math.min(this.gridSize - 1, correctCol + 1)
          }
        };
        break;
      }
      default:
        return { success: false, message: 'Unknown hint type' };
    }

    return {
      success: true,
      cost,
      hintsUsed: score.hintsUsed,
      hint: hintInfo
    };
  }

  getHint(player) {
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const availablePieces = rack.filter(p => p !== null);

    if (availablePieces.length === 0) return null;

    const hintPiece = availablePieces[0];
    return {
      pieceId: hintPiece.id,
      correctPosition: hintPiece.correctPosition
    };
  }

  peekOpponentRack(player) {
    const opponentRack = player === 'playerA' ? this.playerBRack : this.playerARack;
    return [...opponentRack];
  }

  getGameState() {
    // Deep-copy scores to prevent external mutation
    const scoresCopy = {
      playerA: { ...this.scores.playerA },
      playerB: { ...this.scores.playerB }
    };
    return {
      grid: [...this.grid],
      currentTurn: this.currentTurn,
      scores: scoresCopy,
      revealedScores: {
        playerA: { ...this.revealedScores.playerA },
        playerB: { ...this.revealedScores.playerB }
      },
      playerARack: [...this.playerARack],
      playerBRack: [...this.playerBRack],
      piecePoolCount: this.piecePool.length,
      gameState: this.gameState,
      isComplete: this.isGameComplete(),
      winner: this.getWinner(),
      pendingCheck: this.pendingCheck,
      moveHistory: [...this.moveHistory],
      timerRemaining: this.timerRemaining,
      mode: this.mode,
      turnsRemaining: { ...this.turnsRemaining },
      checksRemaining: { ...this.checksRemaining },
      nextCheckRevealProgress: this.nextCheckRevealProgress,
      // Nexus mode state
      piecePlacedBy: { ...this.piecePlacedBy },
      pieceMarks: { ...this.pieceMarks },
      nexusResolved: this.nexusResolved
    };
  }

  exportForDatabase() {
    return {
      grid: this.grid.map(p => p ? { id: p.id, correctPosition: p.correctPosition } : null),
      player_a_rack: this.playerARack.map(p => p ? p.id : null),
      player_b_rack: this.playerBRack.map(p => p ? p.id : null),
      piece_pool: this.piecePool.map(p => p.id),
      current_turn: this.currentTurn,
      timer_remaining: this.timerRemaining,
      pending_check: this.pendingCheck,
      move_history: this.moveHistory,
      scores: this.scores,
      turns_remaining: this.turnsRemaining,
      checks_remaining: this.checksRemaining,
      // NOTE: gameplay_mode is only set during initializeGameState, not on updates
      // NOTE: 'pieces' exists but we don't update it after initialization
      // NOTE: 'awaiting_decision' is set separately in makeMove/respondToCheck
    };
  }

  // Backward compatibility alias
  exportForFirebase() {
    return this.exportForDatabase();
  }

  // Import game data from Firebase/Supabase (renamed from importFromFirebase)
  importGameState(data, pieces) {
    // Store pieces reference first
    if (pieces && Array.isArray(pieces) && pieces.length > 0) {
      this.pieces = pieces;
    }

    // Guard against undefined data
    if (!data) {
      console.error('importGameState: data is undefined');
      return;
    }

    if (!this.pieces || !Array.isArray(this.pieces) || this.pieces.length === 0) {
      console.error('importGameState: no valid pieces array');
      return;
    }

    // Use this.pieces for lookups (which now has imageData)
    const piecesArray = this.pieces;

    // Helper function to get piece from ID or object
    const getPieceFromIdOrObject = (item) => {
      if (item === null || item === undefined) return null;

      // Already a full piece with imageData - use it directly
      if (typeof item === 'object' && item.imageData) {
        return item;
      }

      // Object with just id (from DB) - find full piece with imageData
      if (typeof item === 'object' && typeof item.id === 'number') {
        return piecesArray.find(p => p.id === item.id) || null;
      }

      // Just a number (piece ID) - find full piece
      if (typeof item === 'number') {
        return piecesArray.find(p => p.id === item) || null;
      }

      return null;
    };

    // Import grid using helper
    const gridData = data.grid;
    if (Array.isArray(gridData)) {
      this.grid = gridData.map((cell) => getPieceFromIdOrObject(cell));
    } else {
      this.grid = Array(this.totalPieces).fill(null);
    }

    this.nextCheckRevealProgress = typeof data.nextCheckRevealProgress === 'number'
      ? data.nextCheckRevealProgress
      : this.calculateNextCheckRevealProgress();

    // Import racks using helper
    const playerARackData = data.player_a_rack || data.playerARack || [];
    this.playerARack = Array.isArray(playerARackData)
      ? playerARackData.map(item => getPieceFromIdOrObject(item))
      : [];

    const playerBRackData = data.player_b_rack || data.playerBRack || [];
    this.playerBRack = Array.isArray(playerBRackData)
      ? playerBRackData.map(item => getPieceFromIdOrObject(item))
      : [];

    // Import piece pool using helper
    const piecePoolData = data.piece_pool || data.piecePool || [];
    this.piecePool = Array.isArray(piecePoolData)
      ? piecePoolData.map(item => getPieceFromIdOrObject(item)).filter(Boolean)
      : [];

    console.log('Piece pool import:', {
      piecePoolDataLength: piecePoolData.length,
      reconstructedPoolLength: this.piecePool.length,
      hasImageData: this.piecePool.length > 0 ? !!this.piecePool[0]?.imageData : false
    });

    // Import other state
    this.currentTurn = data.current_turn || data.currentTurn || 'playerA';
    this.timerRemaining = data.timer_remaining || data.timerRemaining || 600;
    // Safely merge imported scores with defaults
    const defaultScore = { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0, hintsUsed: 0 };
    const imported = data.scores || {};
    this.scores = {
      playerA: { ...defaultScore, ...(imported.playerA || {}) },
      playerB: { ...defaultScore, ...(imported.playerB || {}) }
    };

    // Import revealed scores (milestone-gated UI scores)
    const defaultRevealed = { score: 0, accuracy: 100, streak: 0 };
    const importedRevealed = data.revealedScores || data.revealed_scores || {};
    this.revealedScores = {
      playerA: { ...defaultRevealed, ...(importedRevealed.playerA || {}) },
      playerB: { ...defaultRevealed, ...(importedRevealed.playerB || {}) }
    };

    this.gameState = data.game_state || data.gameState || 'active';
    this.pendingCheck = data.pending_check || data.pendingCheck || null;
    this.moveHistory = data.move_history || data.moveHistory || [];

    // Import mode data
    const importedMode = data.gameplay_mode || data.mode;
    if (importedMode) {
      this.mode = importedMode;
      this.modeConfig = importedGetModeConfig(importedMode);
      this.modeScoring = importedGetModeScoring(importedMode);
    }
    if (data.turns_remaining || data.turnsRemaining) {
      this.turnsRemaining = data.turns_remaining || data.turnsRemaining;
    }
    if (data.checks_remaining || data.checksRemaining) {
      this.checksRemaining = data.checks_remaining || data.checksRemaining;
    }

    // Import Nexus mode state
    this.piecePlacedBy = data.piecePlacedBy || data.piece_placed_by || {};
    this.pieceMarks = data.pieceMarks || data.piece_marks || {};
    this.nexusResolved = data.nexusResolved || data.nexus_resolved || false;

    console.log('importGameState complete:', {
      gridLength: this.grid.length,
      gridPlaced: this.grid.filter(p => p !== null).length,
      playerARackLength: this.playerARack.filter(p => p !== null).length,
      playerBRackLength: this.playerBRack.filter(p => p !== null).length,
      piecePoolLength: this.piecePool.length,
      currentTurn: this.currentTurn,
      pendingCheck: this.pendingCheck,
      mode: this.mode
    });
  }
}

export default {
  ImageProcessor,
  GameLogic
};
