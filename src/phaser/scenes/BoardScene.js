import Phaser from 'phaser';

/**
 * BoardScene — Phaser scene for the puzzle board.
 * Renders grid cells, placed pieces, ghost image, marks, and handles drop targets.
 */
export class BoardScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BoardScene' });
        this.gridSize = 5;
        this.cellSize = 60;
        this.margin = 10;
        this.gridContainer = null;
        this.cellSprites = [];
        this.pieceSprites = {};
        this.markSprites = {};
        this.ghostSprite = null;
        this.gameState = null;
        this.isNexusMode = false;
        this.myPlayer = 'playerA';
        this.settings = {};
    }

    init(data) {
        this.gridSize = data.gridSize || 5;
        this.isNexusMode = data.isNexusMode || false;
        this.myPlayer = data.myPlayer || 'playerA';
        this.settings = data.settings || {};
        this.ghostImageUrl = data.ghostImage;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0f0b1e');
        this.calculateLayout();
        this.createGrid();
        this.loadGhostImage();
        this.setupInput();

        // Emit ready event
        this.events.emit('create');

        // Handle resize
        this.scale.on('resize', () => {
            this.calculateLayout();
            this.repositionGrid();
        });
    }

    calculateLayout() {
        const w = this.scale.width;
        const h = this.scale.height;
        const availableSize = Math.min(w, h) - this.margin * 2;
        this.cellSize = Math.floor(availableSize / this.gridSize);
        const boardSize = this.cellSize * this.gridSize;
        this.offsetX = Math.floor((w - boardSize) / 2);
        this.offsetY = Math.floor((h - boardSize) / 2);
    }

    createGrid() {
        this.cellSprites = [];
        this.gridContainer = this.add.container(0, 0);

        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const x = this.offsetX + c * this.cellSize;
                const y = this.offsetY + r * this.cellSize;
                const index = r * this.gridSize + c;

                // Cell background
                const cell = this.add.rectangle(
                    x + this.cellSize / 2,
                    y + this.cellSize / 2,
                    this.cellSize - 2,
                    this.cellSize - 2,
                    0x1a1130,
                    0.6
                );
                cell.setStrokeStyle(1, 0x4a3b6e, 0.5);
                cell.setInteractive({ useHandCursor: true });
                cell.setData('gridIndex', index);

                // Hover effect
                cell.on('pointerover', () => {
                    if (!this.gameState?.grid?.[index]) {
                        cell.setFillStyle(0x2d1f5e, 0.8);
                        cell.setStrokeStyle(2, 0x7c5cbf, 0.9);
                    }
                });
                cell.on('pointerout', () => {
                    if (!this.gameState?.grid?.[index]) {
                        cell.setFillStyle(0x1a1130, 0.6);
                        cell.setStrokeStyle(1, 0x4a3b6e, 0.5);
                    }
                });

                // Click handler
                cell.on('pointerdown', () => {
                    this.events.emit('boardEvent', {
                        type: 'cellClicked',
                        gridIndex: index
                    });
                });

                this.cellSprites.push(cell);
                this.gridContainer.add(cell);
            }
        }
    }

    repositionGrid() {
        // Remove old grid and recreate
        if (this.gridContainer) {
            this.gridContainer.destroy(true);
        }
        Object.values(this.pieceSprites).forEach(s => s.destroy());
        this.pieceSprites = {};
        Object.values(this.markSprites).forEach(s => s.destroy());
        this.markSprites = {};
        if (this.ghostSprite) {
            this.ghostSprite.destroy();
            this.ghostSprite = null;
        }

        this.createGrid();
        this.loadGhostImage();
        if (this.gameState) {
            this.renderPieces(this.gameState);
        }
    }

    loadGhostImage() {
        if (!this.ghostImageUrl || !this.settings?.showGhostImage) return;

        const key = 'ghostImage';
        if (this.textures.exists(key)) {
            this.createGhostSprite(key);
            return;
        }

        this.load.image(key, this.ghostImageUrl);
        this.load.once('complete', () => {
            this.createGhostSprite(key);
        });
        this.load.start();
    }

    createGhostSprite(key) {
        if (this.ghostSprite) this.ghostSprite.destroy();

        const boardSize = this.cellSize * this.gridSize;
        this.ghostSprite = this.add.image(
            this.offsetX + boardSize / 2,
            this.offsetY + boardSize / 2,
            key
        );
        this.ghostSprite.setDisplaySize(boardSize, boardSize);
        this.ghostSprite.setAlpha(0.12);
        this.ghostSprite.setDepth(-1);
    }

    setupInput() {
        // Pinch-to-zoom
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            const cam = this.cameras.main;
            const newZoom = Phaser.Math.Clamp(cam.zoom + (deltaY > 0 ? -0.1 : 0.1), 0.5, 2.5);
            cam.setZoom(newZoom);
        });
    }

    // ========== STATE UPDATES ==========

    updateGameState(state) {
        if (!state) return;
        this.gameState = state;
        this.renderPieces(state);
        this.renderMarks(state);
    }

    updateSettings(settings, ghostImage) {
        this.settings = settings;
        this.ghostImageUrl = ghostImage;
        if (ghostImage && settings?.showGhostImage) {
            this.loadGhostImage();
        } else if (this.ghostSprite) {
            this.ghostSprite.setVisible(false);
        }
    }

    // ========== RENDERING ==========

    renderPieces(state) {
        if (!state?.grid) return;

        state.grid.forEach((piece, index) => {
            const existingSprite = this.pieceSprites[index];

            if (!piece) {
                // Remove piece sprite if cell is now empty
                if (existingSprite) {
                    existingSprite.destroy();
                    delete this.pieceSprites[index];
                    // Reset cell appearance
                    if (this.cellSprites[index]) {
                        this.cellSprites[index].setFillStyle(0x1a1130, 0.6);
                        this.cellSprites[index].setStrokeStyle(1, 0x4a3b6e, 0.5);
                    }
                }
                return;
            }

            // Skip if piece already rendered at this position
            if (existingSprite && existingSprite.getData('pieceId') === piece.id) return;

            // Remove old sprite if different piece
            if (existingSprite) existingSprite.destroy();

            const r = Math.floor(index / this.gridSize);
            const c = index % this.gridSize;
            const x = this.offsetX + c * this.cellSize + this.cellSize / 2;
            const y = this.offsetY + r * this.cellSize + this.cellSize / 2;

            if (piece.imageData) {
                const textureKey = `piece_${piece.id}`;
                if (!this.textures.exists(textureKey)) {
                    // Load piece image
                    this.load.image(textureKey, piece.imageData);
                    this.load.once('complete', () => {
                        this.createPieceSprite(textureKey, piece, index, x, y);
                    });
                    this.load.start();
                } else {
                    this.createPieceSprite(textureKey, piece, index, x, y);
                }
            } else {
                // Fallback: colored rectangle
                const rect = this.add.rectangle(x, y, this.cellSize - 4, this.cellSize - 4, 0x7c3aed, 1);
                rect.setData('pieceId', piece.id);
                rect.setData('gridIndex', index);
                rect.setDepth(1);
                this.pieceSprites[index] = rect;

                // Snap animation
                this.playSnapAnimation(rect);
            }

            // Dim the cell
            if (this.cellSprites[index]) {
                this.cellSprites[index].setFillStyle(0x2d1f5e, 0.3);
                this.cellSprites[index].setStrokeStyle(1, 0x6c5ce7, 0.6);
            }
        });
    }

    createPieceSprite(textureKey, piece, index, x, y) {
        const sprite = this.add.image(x, y, textureKey);
        sprite.setDisplaySize(this.cellSize - 4, this.cellSize - 4);
        sprite.setData('pieceId', piece.id);
        sprite.setData('gridIndex', index);
        sprite.setDepth(1);

        // Nexus: tap to mark — works on mobile AND desktop
        if (this.isNexusMode) {
            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => {
                const placedBy = this.gameState?.piecePlacedBy?.[index];
                const currentMark = this.gameState?.pieceMarks?.[index];

                let markType;
                if (placedBy === this.myPlayer) {
                    // Own pieces: cycle confident → remove
                    markType = currentMark ? null : 'confident';
                } else {
                    // Opponent pieces: cycle suspect → remove
                    markType = currentMark ? null : 'suspect';
                }

                this.events.emit('boardEvent', {
                    type: 'pieceMarked',
                    gridIndex: index,
                    markType  // null means remove
                });
            });

            // Show a small colored dot to indicate it's markable
            const dot = this.add.circle(
                x + this.cellSize / 2 - 6,
                y - this.cellSize / 2 + 6,
                4,
                0xc084fc,
                0.7
            );
            dot.setDepth(2);
            this.markSprites[`dot_${index}`] = dot;
        }

        this.pieceSprites[index] = sprite;

        // Snap animation
        this.playSnapAnimation(sprite);
    }

    // ========== HINT HIGHLIGHTING ==========

    /**
     * Highlight cells/pieces based on active hint.
     * Called by PhaserGame when hint changes.
     */
    updateHint(hint) {
        // Clear previous highlights
        this.clearHintHighlights();
        if (!hint) return;

        const gs = this.gridSize;

        switch (hint.type) {
            case 'position': {
                // Highlight the correct cell for this piece
                const targetCell = hint.correctPosition;
                if (this.cellSprites[targetCell]) {
                    this.cellSprites[targetCell].setFillStyle(0xfbbf24, 0.5);
                    this.cellSprites[targetCell].setStrokeStyle(2, 0xfbbf24, 1);
                    this.hintCells = [targetCell];
                }
                // Also tint the piece in the rack (handled by RackScene)
                break;
            }
            case 'edge': {
                // Highlight all edge cells on the board
                const edgeCells = [];
                for (let i = 0; i < gs * gs; i++) {
                    const r = Math.floor(i / gs), c = i % gs;
                    if (r === 0 || r === gs - 1 || c === 0 || c === gs - 1) {
                        edgeCells.push(i);
                    }
                }
                edgeCells.forEach(idx => {
                    if (this.cellSprites[idx] && !this.gameState?.grid?.[idx]) {
                        this.cellSprites[idx].setFillStyle(0xfbbf24, 0.35);
                        this.cellSprites[idx].setStrokeStyle(2, 0xfbbf24, 0.8);
                    }
                });
                this.hintCells = edgeCells;
                break;
            }
            case 'corner': {
                // Highlight the 4 corner cells
                const corners = [0, gs - 1, gs * (gs - 1), gs * gs - 1];
                corners.forEach(idx => {
                    if (this.cellSprites[idx] && !this.gameState?.grid?.[idx]) {
                        this.cellSprites[idx].setFillStyle(0xfbbf24, 0.5);
                        this.cellSprites[idx].setStrokeStyle(2, 0xfbbf24, 1);
                    }
                });
                this.hintCells = corners;
                break;
            }
            case 'region': {
                // Highlight region cells
                const { rowStart, rowEnd, colStart, colEnd } = hint.region || {};
                const regionCells = [];
                for (let r = rowStart; r <= rowEnd; r++) {
                    for (let c = colStart; c <= colEnd; c++) {
                        const idx = r * gs + c;
                        if (this.cellSprites[idx] && !this.gameState?.grid?.[idx]) {
                            this.cellSprites[idx].setFillStyle(0xfbbf24, 0.35);
                            this.cellSprites[idx].setStrokeStyle(2, 0xfbbf24, 0.8);
                            regionCells.push(idx);
                        }
                    }
                }
                this.hintCells = regionCells;
                break;
            }
        }

        // Pulse the highlighted cells
        if (this.hintCells?.length > 0) {
            this.hintCells.forEach(idx => {
                const cell = this.cellSprites[idx];
                if (!cell) return;
                this.tweens.add({
                    targets: cell,
                    fillAlpha: 0.8,
                    duration: 700,
                    yoyo: true,
                    repeat: 3,
                    ease: 'Sine.easeInOut'
                });
            });
        }

        // Auto-clear hint after 5s
        this.time.delayedCall(5000, () => this.clearHintHighlights());
    }

    clearHintHighlights() {
        (this.hintCells || []).forEach(idx => {
            const cell = this.cellSprites[idx];
            if (!cell) return;
            const piece = this.gameState?.grid?.[idx];
            if (piece) {
                cell.setFillStyle(0x2d1f5e, 0.3);
                cell.setStrokeStyle(1, 0x6c5ce7, 0.6);
            } else {
                cell.setFillStyle(0x1a1130, 0.6);
                cell.setStrokeStyle(1, 0x4a3b6e, 0.5);
            }
        });
        this.hintCells = [];
    }

    renderMarks(state) {
        if (!this.isNexusMode || !state?.pieceMarks) return;

        // Clear old marks
        Object.values(this.markSprites).forEach(s => s.destroy());
        this.markSprites = {};

        Object.entries(state.pieceMarks).forEach(([indexStr, mark]) => {
            const index = parseInt(indexStr);
            const r = Math.floor(index / this.gridSize);
            const c = index % this.gridSize;
            const x = this.offsetX + (c + 1) * this.cellSize - 8;
            const y = this.offsetY + r * this.cellSize + 8;

            const icon = mark.type === 'suspect' ? '🔍' : '💪';
            const text = this.add.text(x, y, icon, {
                fontSize: `${Math.max(12, this.cellSize / 4)}px`
            });
            text.setOrigin(1, 0);
            text.setDepth(3);

            // Pulse animation
            this.tweens.add({
                targets: text,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.markSprites[index] = text;
        });
    }

    // ========== ANIMATIONS ==========

    playSnapAnimation(target) {
        // Elastic snap: scale up slightly and bounce back
        target.setScale(0.3);
        target.setAlpha(0.5);
        this.tweens.add({
            targets: target,
            scaleX: target.scaleX || 1,
            scaleY: target.scaleY || 1,
            alpha: 1,
            duration: 350,
            ease: 'Back.easeOut'
        });
    }

    /**
     * Play score pop-up animation at a grid position.
     * Called externally via scene reference.
     */
    playScorePopup(gridIndex, points, breakdown) {
        const r = Math.floor(gridIndex / this.gridSize);
        const c = gridIndex % this.gridSize;
        const x = this.offsetX + c * this.cellSize + this.cellSize / 2;
        const y = this.offsetY + r * this.cellSize;

        const color = points >= 0 ? '#4ade80' : '#f87171';
        const sign = points >= 0 ? '+' : '';
        const text = this.add.text(x, y, `${sign}${points}`, {
            fontSize: `${Math.max(16, this.cellSize / 2.5)}px`,
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'bold',
            color,
            stroke: '#000000',
            strokeThickness: 3
        });
        text.setOrigin(0.5, 1);
        text.setDepth(10);

        this.tweens.add({
            targets: text,
            y: y - 40,
            alpha: 0,
            scaleX: 1.5,
            scaleY: 1.5,
            duration: 1200,
            ease: 'Power2',
            onComplete: () => text.destroy()
        });

        // Show breakdown below main score
        if (breakdown) {
            let offsetY = 18;
            const parts = [breakdown.adjacent, breakdown.difficulty, breakdown.region]
                .filter(Boolean);
            parts.forEach((part, i) => {
                const sub = this.add.text(x, y + offsetY * (i + 1), part, {
                    fontSize: `${Math.max(10, this.cellSize / 5)}px`,
                    fontFamily: 'Inter, sans-serif',
                    color: '#c4b5fd',
                    stroke: '#000000',
                    strokeThickness: 2
                });
                sub.setOrigin(0.5, 0);
                sub.setDepth(10);

                this.tweens.add({
                    targets: sub,
                    y: sub.y - 30,
                    alpha: 0,
                    duration: 1500,
                    delay: 200 + i * 150,
                    ease: 'Power2',
                    onComplete: () => sub.destroy()
                });
            });
        }
    }

    /**
     * Play incorrect piece shake animation.
     */
    playShakeAnimation(gridIndex) {
        const sprite = this.pieceSprites[gridIndex];
        if (!sprite) return;

        this.tweens.add({
            targets: sprite,
            x: sprite.x - 4,
            duration: 50,
            yoyo: true,
            repeat: 5,
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * Play piece ejection animation (milestone removal).
     */
    playEjectAnimation(gridIndex, onComplete) {
        const sprite = this.pieceSprites[gridIndex];
        if (!sprite) {
            onComplete?.();
            return;
        }

        // Red flash
        sprite.setTint(0xff4444);

        this.tweens.add({
            targets: sprite,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            angle: 180,
            duration: 500,
            ease: 'Back.easeIn',
            delay: Math.random() * 300,
            onComplete: () => {
                sprite.destroy();
                delete this.pieceSprites[gridIndex];
                // Reset cell
                if (this.cellSprites[gridIndex]) {
                    this.cellSprites[gridIndex].setFillStyle(0x1a1130, 0.6);
                    this.cellSprites[gridIndex].setStrokeStyle(1, 0x4a3b6e, 0.5);
                }
                onComplete?.();
            }
        });
    }

    /**
     * Play correct piece glow animation.
     */
    playCorrectGlow(gridIndex) {
        const sprite = this.pieceSprites[gridIndex];
        if (!sprite) return;

        // Brief golden glow
        sprite.setTint(0xffd700);
        this.time.delayedCall(400, () => {
            sprite.clearTint();
        });
    }

    /**
     * Pulse cell to indicate valid drop target.
     */
    pulseCell(gridIndex) {
        const cell = this.cellSprites[gridIndex];
        if (!cell) return;

        this.tweens.add({
            targets: cell,
            fillAlpha: 0.9,
            duration: 400,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                cell.setFillStyle(0x1a1130, 0.6);
            }
        });
    }

    /**
     * Streak fire effect — intensify glow on cells.
     */
    playStreakEffect(streak) {
        if (streak < 3) return;

        const intensity = Math.min(streak / 10, 1);
        const color = Phaser.Display.Color.Interpolate.ColorWithColor(
            new Phaser.Display.Color(74, 222, 128),  // green
            new Phaser.Display.Color(251, 146, 60),  // orange
            100,
            Math.floor(intensity * 100)
        );
        const hexColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);

        // Flash the border
        Object.values(this.pieceSprites).forEach(sprite => {
            sprite.setTint(hexColor);
            this.time.delayedCall(300, () => sprite.clearTint());
        });
    }

    /**
     * Timer urgency — pulse board border red.
     */
    playTimerUrgency(secondsLeft) {
        if (secondsLeft > 30) return;

        this.cameras.main.flash(200, 255, 50, 50, false);
    }
}
