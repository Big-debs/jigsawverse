// =====================================================
// IMAGE PROCESSOR - Slice images into puzzle pieces
// =====================================================

export class ImageProcessor {
  constructor(imageSource, gridSize = 10) {
    this.imageSource = imageSource; // URL or File object
    this.gridSize = gridSize; // e.g., 10x10 = 100 pieces
    this.image = null;
    this.pieces = [];
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  // Load and process image
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
        // Handle File object
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target.result; };
        reader.readAsDataURL(this.imageSource);
      }
    });
  }

  // Calculate optimal grid dimensions based on image aspect ratio
  calculateGridDimensions() {
    const aspectRatio = this.image.width / this.image.height;
    let cols = this.gridSize;
    let rows = this.gridSize;

    if (aspectRatio > 1) {
      // Landscape - more columns
      rows = Math.round(this.gridSize / aspectRatio);
    } else if (aspectRatio < 1) {
      // Portrait - more rows
      cols = Math.round(this.gridSize * aspectRatio);
    }

    return { cols, rows, totalPieces: cols * rows };
  }

  // Slice image into rectangular pieces
  async sliceImage() {
    if (!this.image) await this.loadImage();

    const { cols, rows, totalPieces } = this.calculateGridDimensions();
    const pieceWidth = this.image.width / cols;
    const pieceHeight = this.image.height / rows;

    this.pieces = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        
        // Set canvas size for this piece
        this.canvas.width = pieceWidth;
        this.canvas.height = pieceHeight;

        // Draw piece portion
        this.ctx.drawImage(
          this.image,
          col * pieceWidth,      // source x
          row * pieceHeight,     // source y
          pieceWidth,            // source width
          pieceHeight,           // source height
          0,                     // dest x
          0,                     // dest y
          pieceWidth,            // dest width
          pieceHeight            // dest height
        );

        // Convert to data URL
        const dataUrl = this.canvas.toDataURL('image/png');

        // Create piece object
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

  // Determine if piece is on edge
  isEdgePiece(row, col, rows, cols) {
    return row === 0 || row === rows - 1 || col === 0 || col === cols - 1;
  }

  // Get edge types (for logic deduction)
  getEdgeTypes(row, col, rows, cols) {
    return {
      top: row === 0,
      bottom: row === rows - 1,
      left: col === 0,
      right: col === cols - 1
    };
  }

  // Shuffle pieces
  shufflePieces() {
    const shuffled = [...this.pieces];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // Get subset of pieces for player rack
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
    this.pieces = pieces; // Array of piece objects
    this.grid = Array(this.totalPieces).fill(null); // Placed pieces
    this.piecePool = [...pieces]; // Available pieces
    this.playerARack = [];
    this.playerBRack = [];
    this.currentTurn = 'playerA';
    this.scores = {
      playerA: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0 },
      playerB: { score: 0, accuracy: 100, streak: 0, correctPlacements: 0, totalPlacements: 0 }
    };
    this.gameState = 'setup'; // setup, active, paused, completed
    this.moveHistory = [];
    this.pendingCheck = null; // For pass/check flow
  }

  // Initialize game
  initialize() {
    this.fillRack('playerA');
    this.fillRack('playerB');
    this.gameState = 'active';
  }

  // Fill player rack with pieces from pool
  fillRack(player) {
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const needed = 10 - rack.filter(p => p !== null).length;

    for (let i = 0; i < needed && this.piecePool.length > 0; i++) {
      const piece = this.piecePool.shift();
      rack.push(piece);
    }

    if (player === 'playerA') {
      this.playerARack = rack;
    } else {
      this.playerBRack = rack;
    }
  }

  // Validate piece placement
  isValidPlacement(pieceId, gridIndex) {
    // Check if grid position is empty
    if (this.grid[gridIndex] !== null) {
      return { valid: false, reason: 'Position occupied' };
    }

    // Find the piece
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!piece) {
      return { valid: false, reason: 'Piece not found' };
    }

    // Check if placement is correct
    const isCorrect = piece.correctPosition === gridIndex;

    return { 
      valid: true, 
      correct: isCorrect,
      piece 
    };
  }

  // Place piece on grid
  placePiece(player, pieceId, gridIndex) {
    const validation = this.isValidPlacement(pieceId, gridIndex);
    
    if (!validation.valid) {
      return { success: false, message: validation.reason };
    }

    // Place piece
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

    // Set pending check
    this.pendingCheck = move;

    return {
      success: true,
      correct: validation.correct,
      piece: validation.piece,
      awaitingCheck: true
    };
  }

  // Pass/Check Flow Implementation
  handleOpponentCheck(opponent, checkDecision) {
    if (!this.pendingCheck) {
      return { success: false, message: 'No pending move to check' };
    }

    const move = this.pendingCheck;
    
    if (checkDecision === 'check') {
      // Opponent checks the placement
      if (move.correct) {
        // Placement was correct - opponent loses points
        this.updateScore(opponent, -5, false);
        this.pendingCheck = null;
        this.switchTurn();
        return {
          success: true,
          result: 'failed_check',
          message: 'Piece was correct! Opponent loses 5 points.',
          correctPlacement: true
        };
      } else {
        // Placement was incorrect - opponent gains points
        this.updateScore(opponent, 5, false);
        this.grid[move.gridIndex] = null; // Remove incorrect piece
        this.pendingCheck = null;
        this.switchTurn();
        return {
          success: true,
          result: 'successful_check',
          message: 'Piece was incorrect! Opponent gains 5 points.',
          correctPlacement: false
        };
      }
    } else {
      // Opponent passes - placer gets to check themselves
      return {
        success: true,
        result: 'opponent_passed',
        message: 'Opponent passed. Your turn to check or pass.',
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
      // Placer self-checks
      if (move.correct) {
        this.updateScore(placer, 10, true);
        this.pendingCheck = null;
        this.switchTurn();
        return {
          success: true,
          result: 'correct_placement',
          message: 'Correct! +10 points.',
          correctPlacement: true
        };
      } else {
        // Self-check reveals error
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
      // Both passed - hidden penalty
      const opponent = placer === 'playerA' ? 'playerB' : 'playerA';
      
      if (!move.correct) {
        // Incorrect piece stayed - opponent gets penalty bonus
        this.updateScore(opponent, 3, false);
      }
      
      this.pendingCheck = null;
      this.switchTurn();
      return {
        success: true,
        result: 'both_passed',
        message: move.correct ? 'Both passed.' : 'Both passed. Opponent gains 3 points for hidden mistake.',
        hiddenPenalty: !move.correct
      };
    }
  }

  // Update player score
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

    // Calculate accuracy
    score.accuracy = score.totalPlacements > 0
      ? Math.round((score.correctPlacements / score.totalPlacements) * 100)
      : 100;

    // Apply streak bonus
    if (score.streak >= 3) {
      const bonus = Math.floor(score.streak / 3) * 2;
      score.score += bonus;
    }
  }

  // Switch turn
  switchTurn() {
    this.currentTurn = this.currentTurn === 'playerA' ? 'playerB' : 'playerA';
    
    // Refill rack if empty
    const rack = this.currentTurn === 'playerA' ? this.playerARack : this.playerBRack;
    if (rack.every(p => p === null)) {
      this.fillRack(this.currentTurn);
    }
  }

  // Check if game is complete
  isGameComplete() {
    const allPlaced = this.grid.every(cell => cell !== null);
    const noMorePieces = this.piecePool.length === 0 && 
                         this.playerARack.every(p => p === null) &&
                         this.playerBRack.every(p => p === null);
    
    return allPlaced || noMorePieces;
  }

  // Get winner
  getWinner() {
    if (!this.isGameComplete()) return null;

    const scoreA = this.scores.playerA.score;
    const scoreB = this.scores.playerB.score;

    if (scoreA > scoreB) return 'playerA';
    if (scoreB > scoreA) return 'playerB';
    return 'tie';
  }

  // Get hint (reveal correct position for a piece)
  getHint(player) {
    const rack = player === 'playerA' ? this.playerARack : this.playerBRack;
    const availablePieces = rack.filter(p => p !== null);
    
    if (availablePieces.length === 0) return null;

    // Find a piece that hasn't been placed yet
    const hintPiece = availablePieces[0];
    return {
      pieceId: hintPiece.id,
      correctPosition: hintPiece.correctPosition
    };
  }

  // Peek opponent rack (temporary view)
  peekOpponentRack(player) {
    const opponentRack = player === 'playerA' ? this.playerBRack : this.playerARack;
    return [...opponentRack]; // Return copy
  }

  // Get game state snapshot
  getGameState() {
    return {
      grid: [...this.grid],
      currentTurn: this.currentTurn,
      scores: { ...this.scores },
      playerARack: [...this.playerARack],
      playerBRack: [...this.playerBRack],
      piecePoolCount: this.piecePool.length,
      gameState: this.gameState,
      isComplete: this.isGameComplete(),
      winner: this.getWinner(),
      pendingCheck: this.pendingCheck,
      moveHistory: [...this.moveHistory]
    };
  }

  // Export game data for Firebase
  exportForFirebase() {
    return {
      grid: this.grid.map(p => p ? { id: p.id, correctPosition: p.correctPosition } : null),
      currentTurn: this.currentTurn,
      scores: this.scores,
      playerARack: this.playerARack.map(p => p ? p.id : null),
      playerBRack: this.playerBRack.map(p => p ? p.id : null),
      piecePool: this.piecePool.map(p => p.id),
      gameState: this.gameState,
      pendingCheck: this.pendingCheck,
      moveHistory: this.moveHistory
    };
  }

  // Import game data from Firebase
  importFromFirebase(data, pieces) {
    this.grid = data.grid.map(p => p ? pieces.find(piece => piece.id === p.id) : null);
    this.currentTurn = data.currentTurn;
    this.scores = data.scores;
    this.playerARack = data.playerARack.map(id => id !== null ? pieces.find(p => p.id === id) : null);
    this.playerBRack = data.playerBRack.map(id => id !== null ? pieces.find(p => p.id === id) : null);
    this.piecePool = data.piecePool.map(id => pieces.find(p => p.id === id));
    this.gameState = data.gameState;
    this.pendingCheck = data.pendingCheck;
    this.moveHistory = data.moveHistory || [];
  }
}

export default {
  ImageProcessor,
  GameLogic
};
