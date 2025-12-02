// =====================================================
// IMAGE PROCESSOR - Slice images into puzzle pieces
// =====================================================

export class ImageProcessor {
  constructor(imageSource, gridSize = 10) {
    this.imageSource = imageSource;
    this.gridSize = gridSize;
    this.image = null;
    this.pieces = [];
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas. getContext('2d');
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
        reader. onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(this.imageSource);
      }
    });
  }

  calculateGridDimensions() {
    const aspectRatio = this. image.width / this.image.height;
    let cols = this.gridSize;
    let rows = this.gridSize;

    if (aspectRatio > 1) {
      rows = Math.round(this.gridSize / aspectRatio);
    } else if (aspectRatio < 1) {
      cols = Math. round(this.gridSize * aspectRatio);
    }

    return { cols, rows, totalPieces: cols * rows };
  }

  async sliceImage() {
    if (! this.image) await this.loadImage();

    const { cols, rows, totalPieces } = this.calculateGridDimensions();
    const pieceWidth = this.image. width / cols;
    const pieceHeight = this. image.height / rows;

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

        this.pieces. push({
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
    const shuffled = [...this. pieces];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getPiecesForRack(count = 10) {
    const shuffled = this.shufflePieces();
    return shuffled.slice(0, count);
  }
}

// =====================================================
// GAME LOGIC - Core puzzle game mechanics
// =====================================================

export class GameLogic {
  constructor(gridSize = 10, pieces = []) {
    this.gridSize = gridSize;
    this.totalPieces = gridSize * gridSize;
    this.pieces = pieces;
    this.grid = Array(this. totalPieces). fill(null);
    this.piecePool = [... pieces];
    this. playerARack = [];
    this.playerBRack = [];
    this.currentTurn = 'playerA';
    this.scores = {
      playerA: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0 },
      playerB: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0 }
    };
    this.gameState = 'setup';
    this. moveHistory = [];
    this.pendingCheck = null;
    this.timerRemaining = 600; // Default 10 minutes
  }

  initialize() {
    this.fillRack('playerA');
    this.fillRack('playerB');
    this.gameState = 'active';
  }

  fillRack(player) {
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const needed = 10 - rack. filter(p => p !== null).length;

    for (let i = 0; i < needed && this.piecePool. length > 0; i++) {
      const piece = this.piecePool.shift();
      rack. push(piece);
    }

    if (player === 'playerA') {
      this.playerARack = rack;
    } else {
      this.playerBRack = rack;
    }
  }

  isValidPlacement(pieceId, gridIndex) {
    if (this.grid[gridIndex] !== null) {
      return { valid: false, reason: 'Position occupied' };
    }

    const piece = this.pieces. find(p => p.id === pieceId);
    if (!piece) {
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
    const validation = this.isValidPlacement(pieceId, gridIndex);
    
    if (!validation. valid) {
      return { success: false, message: validation.reason };
    }

    this.grid[gridIndex] = validation.piece;

    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const pieceIndex = rack. findIndex(p => p && p.id === pieceId);
    if (pieceIndex !== -1) {
      rack[pieceIndex] = null;
    }

    const move = {
      player,
      pieceId,
      gridIndex,
      correct: validation.correct,
      timestamp: Date.now()
    };
    this.moveHistory.push(move);

    this.pendingCheck = move;

    return {
      success: true,
      correct: validation.correct,
      piece: validation.piece,
      awaitingCheck: true
    };
  }

  handleOpponentCheck(opponent, checkDecision) {
    if (! this.pendingCheck) {
      return { success: false, message: 'No pending move to check' };
    }

    const move = this.pendingCheck;
    
    if (checkDecision === 'check') {
      if (move.correct) {
        this.updateScore(opponent, -5, false);
        this.pendingCheck = null;
        this.switchTurn();
        return {
          success: true,
          result: 'failed_check',
          message: 'Piece was correct!  Opponent loses 5 points.',
          correctPlacement: true
        };
      } else {
        this.updateScore(opponent, 5, false);
        this.grid[move.gridIndex] = null;
        this.pendingCheck = null;
        this.switchTurn();
        return {
          success: true,
          result: 'successful_check',
          message: 'Piece was incorrect!  Opponent gains 5 points.',
          correctPlacement: false
        };
      }
    } else {
      return {
        success: true,
        result: 'opponent_passed',
        message: 'Opponent passed.  Your turn to check or pass.',
        awaitingPlacerDecision: true
      };
    }
  }

  handlePlacerCheck(placer, checkDecision) {
    if (!this.pendingCheck) {
      return { success: false, message: 'No pending move to check' };
    }

    const move = this.pendingCheck;
    
    if (checkDecision === 'check') {
      if (move.correct) {
        this.updateScore(placer, 10, true);
        this. pendingCheck = null;
        this. switchTurn();
        return {
          success: true,
          result: 'correct_placement',
          message: 'Correct!  +10 points.',
          correctPlacement: true
        };
      } else {
        this.grid[move.gridIndex] = null;
        this.pendingCheck = null;
        this.switchTurn();
        return {
          success: true,
          result: 'incorrect_placement',
          message: 'Incorrect placement detected.',
          correctPlacement: false
        };
      }
    } else {
      const opponent = placer === 'playerA' ? 'playerB' : 'playerA';
      
      if (! move.correct) {
        this.updateScore(opponent, 3, false);
      }
      
      this.pendingCheck = null;
      this.switchTurn();
      return {
        success: true,
        result: 'both_passed',
        message: move.correct ? 'Both passed.' : 'Both passed.  Opponent gains 3 points for hidden mistake.',
        hiddenPenalty: ! move.correct
      };
    }
  }

  updateScore(player, points, isCorrectPlacement) {
    const score = this.scores[player];
    score.score += points;
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

    if (score.streak >= 3) {
      const bonus = Math.floor(score. streak / 3) * 2;
      score.score += bonus;
    }
  }

  switchTurn() {
    this.currentTurn = this.currentTurn === 'playerA' ? 'playerB' : 'playerA';
    
    const rack = this.currentTurn === 'playerA' ? this.playerARack : this.playerBRack;
    if (rack.every(p => p === null)) {
      this.fillRack(this. currentTurn);
    }
  }

  isGameComplete() {
    const allPlaced = this.grid.every(cell => cell !== null);
    const noMorePieces = this. piecePool.length === 0 && 
                         this.playerARack.every(p => p === null) &&
                         this. playerBRack. every(p => p === null);
    
    return allPlaced || noMorePieces;
  }

  getWinner() {
    if (! this.isGameComplete()) return null;

    const scoreA = this.scores.playerA. score;
    const scoreB = this. scores.playerB. score;

    if (scoreA > scoreB) return 'playerA';
    if (scoreB > scoreA) return 'playerB';
    return 'tie';
  }

  getHint(player) {
    const rack = player === 'playerA' ? this. playerARack : this.playerBRack;
    const availablePieces = rack.filter(p => p !== null);
    
    if (availablePieces.length === 0) return null;

    const hintPiece = availablePieces[0];
    return {
      pieceId: hintPiece. id,
      correctPosition: hintPiece.correctPosition
    };
  }

  peekOpponentRack(player) {
    const opponentRack = player === 'playerA' ?  this.playerBRack : this.playerARack;
    return [...opponentRack];
  }

  getGameState() {
    return {
      grid: [... this.grid],
      currentTurn: this.currentTurn,
      scores: { ...this.scores },
      playerARack: [...this.playerARack],
      playerBRack: [...this.playerBRack],
      piecePoolCount: this.piecePool.length,
      gameState: this.gameState,
      isComplete: this.isGameComplete(),
      winner: this.getWinner(),
      pendingCheck: this.pendingCheck,
      moveHistory: [...this.moveHistory],
      timerRemaining: this.timerRemaining
    };
  }

  exportForFirebase() {
    return {
      grid: this.grid.map(p => p ?  { id: p.id, correctPosition: p.correctPosition } : null),
      currentTurn: this. currentTurn,
      scores: this. scores,
      playerARack: this. playerARack.map(p => p ?  p.id : null),
      playerBRack: this.playerBRack.map(p => p ?  p.id : null),
      piecePool: this.piecePool.map(p => p.id),
      gameState: this.gameState,
      pendingCheck: this.pendingCheck,
      moveHistory: this.moveHistory,
      timerRemaining: this.timerRemaining
    };
  }

  // Import game data from Firebase/Supabase (renamed from importFromFirebase)
  importGameState(data, pieces) {
    // Guard against undefined data
    if (!data) {
      console.error('importGameState: data is undefined');
      return;
    }
    
    if (!pieces || !Array.isArray(pieces)) {
      console.error('importGameState: pieces is undefined or not an array', pieces);
      return;
    }

    console.log('importGameState data:', data);
    console.log('importGameState pieces count:', pieces.length);

    // Safely import grid (handle both snake_case and camelCase)
    const gridData = data.grid;
    this.grid = Array. isArray(gridData) 
      ?  gridData.map(p => p ? pieces.find(piece => piece.id === p.id) : null)
      : Array(this.totalPieces).fill(null);

    this.currentTurn = data.current_turn || data.currentTurn || 'playerA';
    
    this.scores = data.scores || {
      playerA: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0 },
      playerB: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0 }
    };

    // Safely import player racks (handle both snake_case and camelCase)
    const playerARackData = data.player_a_rack || data.playerARack || [];
    this. playerARack = Array.isArray(playerARackData) 
      ? playerARackData.map(id => id !== null ? pieces.find(p => p.id === id) : null)
      : [];
      
    const playerBRackData = data.player_b_rack || data.playerBRack || [];
    this.playerBRack = Array.isArray(playerBRackData)
      ? playerBRackData.map(id => id !== null ? pieces.find(p => p. id === id) : null)
      : [];

    // Safely import piece pool (handle both snake_case and camelCase)
    const piecePoolData = data. piece_pool || data.piecePool || [];
    this. piecePool = Array.isArray(piecePoolData)
      ? piecePoolData.map(id => pieces.find(p => p.id === id)). filter(Boolean)
      : [];

    this.gameState = data.game_state || data.gameState || 'active';
    this.pendingCheck = data.pending_check || data.pendingCheck || null;
    this.moveHistory = data.move_history || data.moveHistory || [];
    this.timerRemaining = data.timer_remaining || data.timerRemaining || 600;
    
    // Store pieces reference
    this.pieces = pieces;

    console.log('importGameState complete:', {
      gridLength: this.grid.length,
      playerARackLength: this.playerARack.length,
      playerBRackLength: this.playerBRack.length,
      piecePoolLength: this.piecePool.length,
      timerRemaining: this.timerRemaining
    });
  }
}

export default {
  ImageProcessor,
  GameLogic
};
