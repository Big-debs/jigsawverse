import Phaser from 'phaser';

/**
 * BoardScene — Single Phaser scene for the entire game view.
 * Layout: Board grid (top ~75%) + Piece rack (bottom ~25%).
 * Handles grid cells, placed pieces, ghost image, Nexus marks,
 * piece rack with selection, and all animations.
 */
export class BoardScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BoardScene' });
        this.rows = 5;
        this.cols = 5;
        this.cellSize = 60;
        this.cellSprites = [];
        this.pieceSprites = {};
        this.markSprites = {};
        this.ghostSprite = null;
        this.gameState = null;
        this.isNexusMode = false;
        this.myPlayer = 'playerA';
        this.settings = {};

        // Rack state
        this.rackPieces = [];
        this.rackSprites = [];
        this.rackSlotSprites = [];
        this.rackCapacity = 10;
        this.selectedPieceId = null;
        this.hintCells = [];

        // Render layers
        this.boardContainer = null;
        this.rackContainer = null;
        // Layout dimensions
        this.boardOffsetX = 0;
        this.boardOffsetY = 0;
        this.rackOffsetY = 0;
    }

    init(data) {
        this.rows = data.gridDimensions?.rows || 5;
        this.cols = data.gridDimensions?.cols || 5;
        this.isNexusMode = data.isNexusMode || false;
        this.myPlayer = data.myPlayer || 'playerA';
        this.settings = data.settings || {};
        this.ghostImageUrl = data.ghostImage;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0f0b1e');
        this.cameras.main.setZoom(1);
        this.calculateLayout();
        this.createRenderLayers();
        this.createGrid();
        this.createRackBar();
        this.loadGhostImage();
        this.events.emit('create');

        this.scale.on('resize', () => {
            this.rebuildAll();
        });
    }

    // ========== LAYOUT ==========

    calculateLayout() {
        const w = this.scale.width;
        const h = this.scale.height;

        if (w < 10 || h < 10) return; // Canvas not ready yet

        // Reserve top 78% for board, bottom 22% for rack
        const boardAreaH = Math.floor(h * 0.78);
        const rackAreaH = h - boardAreaH;

        // Board: fit the full puzzle dimensions into the board area
        const margin = 8;
        const availableW = w - margin * 2;
        const availableH = boardAreaH - margin * 2;
        this.cellSize = Math.floor(Math.min(availableW / this.cols, availableH / this.rows));
        const boardWidth = this.cellSize * this.cols;
        const boardHeight = this.cellSize * this.rows;

        this.boardOffsetX = Math.floor((w - boardWidth) / 2);
        this.boardOffsetY = Math.floor((boardAreaH - boardHeight) / 2);

        // Rack area starts after the board area
        this.rackOffsetY = boardAreaH;
        this.rackAreaH = rackAreaH;
    }

    rebuildAll() {
        // Destroy everything and recreate
        this.children.removeAll(true);
        this.cellSprites = [];
        this.pieceSprites = {};
        this.markSprites = {};
        this.ghostSprite = null;
        this.rackSprites = [];
        this.rackSlotSprites = [];
        this.boardContainer = null;
        this.rackContainer = null;

        this.calculateLayout();
        this.createRenderLayers();
        this.createGrid();
        this.loadGhostImage();
        this.createRackBar();

        if (this.gameState) {
            this.renderPieces(this.gameState);
            this.renderMarks(this.gameState);
        }
        if (this.rackPieces.length > 0) {
            this.renderRack();
        }
    }

    createRenderLayers() {
        this.boardContainer = this.add.container(0, 0);
        this.boardContainer.setDepth(1);

        this.rackContainer = this.add.container(0, 0);
        this.rackContainer.setDepth(4);
    }

    // ========== GRID ==========

    createGrid() {
        this.cellSprites = [];

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const x = this.boardOffsetX + c * this.cellSize + this.cellSize / 2;
                const y = this.boardOffsetY + r * this.cellSize + this.cellSize / 2;
                const index = r * this.cols + c;

                const cell = this.add.rectangle(
                    x, y,
                    this.cellSize - 2, this.cellSize - 2,
                    0x1a1130, 0.6
                );
                this.boardContainer?.add(cell);
                cell.setStrokeStyle(1, 0x4a3b6e, 0.5);
                cell.setInteractive({ useHandCursor: true });
                cell.setData('gridIndex', index);

                // Hover
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

                // Click — place piece
                cell.on('pointerdown', () => {
                    this.events.emit('boardEvent', {
                        type: 'cellClicked',
                        gridIndex: index
                    });
                });

                this.cellSprites.push(cell);
            }
        }

        // Draw a subtle separator line between board and rack
        const w = this.scale.width;
        const line = this.add.line(0, 0, 20, this.rackOffsetY, w - 20, this.rackOffsetY, 0x4a3b6e, 0.3);
        this.rackContainer?.add(line);
        line.setOrigin(0, 0);
        line.setDepth(0);
    }

    // ========== RACK BAR ==========

    createRackBar() {
        // Background for rack area
        const w = this.scale.width;
        const bg = this.add.rectangle(
            w / 2, this.rackOffsetY + this.rackAreaH / 2,
            w - 12, Math.max(0, this.rackAreaH - 10),
            0x130f24, 0.96
        );
        this.rackContainer?.add(bg);
        bg.setStrokeStyle(2, 0x4a3b6e, 0.85);
    }

    renderRack() {
        // Clear the prior rack contents and rebuild the fixed tray layout.
        this.rackSprites.forEach(s => s.container?.destroy());
        this.rackSlotSprites.forEach(slot => slot.destroy());
        this.rackSprites = [];
        this.rackSlotSprites = [];

        const w = this.scale.width;
        const padding = 12;
        const gap = 6;
        const availableWidth = w - padding * 2;
        const availableHeight = Math.max(1, this.rackAreaH - padding * 2);
        const slotSize = Math.max(1, Math.floor(Math.min(
            availableHeight,
            (availableWidth - gap * (this.rackCapacity - 1)) / this.rackCapacity
        )));
        const totalWidth = this.rackCapacity * slotSize + gap * (this.rackCapacity - 1);
        const startX = Math.floor((w - totalWidth) / 2);
        const y = this.rackOffsetY + Math.floor(this.rackAreaH / 2);

        for (let i = 0; i < this.rackCapacity; i++) {
            const x = startX + i * (slotSize + gap) + slotSize / 2;
            const slot = this.add.rectangle(x, y, slotSize, slotSize, 0x1a1130, 0.75);
            slot.setStrokeStyle(1, 0x4a3b6e, 0.7);
            this.rackContainer?.add(slot);
            this.rackSlotSprites.push(slot);
        }

        const pieces = this.rackPieces.filter(Boolean).slice(0, this.rackCapacity);
        const pieceSize = Math.max(1, slotSize - 4);
        pieces.forEach((piece, i) => {
            const x = startX + i * (slotSize + gap) + slotSize / 2;
            const container = this.add.container(x, y);
            this.rackContainer?.add(container);

            // Background card
            const isSelected = this.selectedPieceId === piece.id;
            const bg = this.add.rectangle(0, 0, pieceSize, pieceSize, 0x2d1f5e, 0.9);
            bg.setStrokeStyle(
                isSelected ? 3 : 2,
                isSelected ? 0xfbbf24 : 0x4a3b6e,
                1
            );
            container.add(bg);

            // Selected ring glow
            if (isSelected) {
                const glow = this.add.rectangle(0, 0, slotSize, slotSize);
                glow.setStrokeStyle(2, 0xfbbf24, 0.5);
                container.add(glow);
            }

            // Edge highlight
            if (piece.isEdge) {
                const edgeGlow = this.add.rectangle(0, 0, slotSize - 2, slotSize - 2);
                edgeGlow.setStrokeStyle(2, 0xf59e0b, 0.5);
                container.add(edgeGlow);
            }

            // Piece image
            if (piece.imageData) {
                const textureKey = `rack_${piece.id}`;
                if (this.textures.exists(textureKey)) {
                    const img = this.add.image(0, 0, textureKey);
                    img.setDisplaySize(pieceSize - 4, pieceSize - 4);
                    container.add(img);
                } else {
                    this.load.image(textureKey, piece.imageData);
                    this.load.once('complete', () => {
                        if (!container.scene) return;
                        try {
                            const img = this.add.image(0, 0, textureKey);
                            img.setDisplaySize(pieceSize - 4, pieceSize - 4);
                            container.add(img);
                        } catch { /* container may have been destroyed */ }
                    });
                    this.load.start();
                }
            } else {
                // Fallback: piece ID text
                const text = this.add.text(0, 0, `${piece.id}`, {
                    fontSize: '12px',
                    color: '#c4b5fd',
                    fontFamily: 'monospace'
                });
                text.setOrigin(0.5, 0.5);
                container.add(text);
            }

            // Click handler
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerdown', () => {
                this.events.emit('rackEvent', {
                    type: 'pieceSelected',
                    piece
                });
            });

            // Hover scale
            bg.on('pointerover', () => {
                this.tweens.add({
                    targets: container,
                    scaleX: 1.1, scaleY: 1.1,
                    duration: 120, ease: 'Power2'
                });
            });
            bg.on('pointerout', () => {
                this.tweens.add({
                    targets: container,
                    scaleX: 1.0, scaleY: 1.0,
                    duration: 120, ease: 'Power2'
                });
            });

            this.rackSprites.push({ container, bg, piece });
        });
    }

    updateRackSelection() {
        this.rackSprites.forEach(({ bg, piece }) => {
            if (!bg || !piece) return;
            const isSelected = this.selectedPieceId === piece.id;
            bg.setStrokeStyle(
                isSelected ? 3 : 2,
                isSelected ? 0xfbbf24 : 0x4a3b6e,
                1
            );
        });
    }

    // ========== GHOST IMAGE ==========

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

        const boardWidth = this.cellSize * this.cols;
        const boardHeight = this.cellSize * this.rows;
        this.ghostSprite = this.add.image(
            this.boardOffsetX + boardWidth / 2,
            this.boardOffsetY + boardHeight / 2,
            key
        );
        this.boardContainer?.add(this.ghostSprite);
        this.boardContainer?.moveTo(this.ghostSprite, 0);
        this.ghostSprite.setDisplaySize(boardWidth, boardHeight);
        this.ghostSprite.setAlpha(0.12);
        this.ghostSprite.setDepth(-1);
    }

    // ========== STATE UPDATES (called from PhaserGame) ==========

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

    // Called by PhaserGame to update rack
    updateRack(rack) {
        if (!rack) return;
        this.rackPieces = rack;
        this.renderRack();
    }

    // Called by PhaserGame to update selected piece
    setSelectedPiece(piece) {
        this.selectedPieceId = piece?.id ?? null;
        this.updateRackSelection();
    }

    // ========== PIECE RENDERING ==========

    renderPieces(state) {
        if (!state?.grid) return;

        state.grid.forEach((piece, index) => {
            const existing = this.pieceSprites[index];

            if (!piece) {
                if (existing) {
                    existing.destroy();
                    delete this.pieceSprites[index];
                    if (this.cellSprites[index]) {
                        this.cellSprites[index].setFillStyle(0x1a1130, 0.6);
                        this.cellSprites[index].setStrokeStyle(1, 0x4a3b6e, 0.5);
                    }
                }
                return;
            }

            if (existing && existing.getData('pieceId') === piece.id) return;
            if (existing) existing.destroy();

            const r = Math.floor(index / this.cols);
            const c = index % this.cols;
            const x = this.boardOffsetX + c * this.cellSize + this.cellSize / 2;
            const y = this.boardOffsetY + r * this.cellSize + this.cellSize / 2;

            if (piece.imageData) {
                const textureKey = `piece_${piece.id}`;
                if (!this.textures.exists(textureKey)) {
                    this.load.image(textureKey, piece.imageData);
                    this.load.once('complete', () => {
                        this.createPieceSprite(textureKey, piece, index, x, y);
                    });
                    this.load.start();
                } else {
                    this.createPieceSprite(textureKey, piece, index, x, y);
                }
            } else {
                const rect = this.add.rectangle(x, y, this.cellSize - 2, this.cellSize - 2, 0x7c3aed, 1);
                this.boardContainer?.add(rect);
                rect.setData('pieceId', piece.id);
                rect.setData('gridIndex', index);
                rect.setDepth(1);
                this.pieceSprites[index] = rect;
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
        this.boardContainer?.add(sprite);
        sprite.setDisplaySize(this.cellSize - 2, this.cellSize - 2);
        sprite.setData('pieceId', piece.id);
        sprite.setData('gridIndex', index);
        sprite.setDepth(1);

        // Nexus: tap to mark
        if (this.isNexusMode) {
            sprite.setInteractive({ useHandCursor: true });
            sprite.on('pointerdown', () => {
                const placedBy = this.gameState?.piecePlacedBy?.[index];
                const currentMark = this.gameState?.pieceMarks?.[index];

                let markType;
                if (placedBy === this.myPlayer) {
                    markType = currentMark ? null : 'confident';
                } else {
                    markType = currentMark ? null : 'suspect';
                }

                this.events.emit('boardEvent', {
                    type: 'pieceMarked',
                    gridIndex: index,
                    markType
                });
            });
        }

        this.pieceSprites[index] = sprite;
        this.playSnapAnimation(sprite);
    }

    // ========== MARKS ==========

    renderMarks(state) {
        if (!this.isNexusMode || !state?.pieceMarks) return;

        Object.values(this.markSprites).forEach(s => s.destroy());
        this.markSprites = {};

        Object.entries(state.pieceMarks).forEach(([indexStr, mark]) => {
            const index = parseInt(indexStr);
            const r = Math.floor(index / this.cols);
            const c = index % this.cols;
            const x = this.boardOffsetX + (c + 1) * this.cellSize - 8;
            const y = this.boardOffsetY + r * this.cellSize + 8;

            const icon = mark.type === 'suspect' ? '🔍' : '💪';
            const text = this.add.text(x, y, icon, {
                fontSize: `${Math.max(12, this.cellSize / 4)}px`
            });
            this.boardContainer?.add(text);
            text.setOrigin(1, 0);
            text.setDepth(3);

            this.tweens.add({
                targets: text,
                scaleX: 1.2, scaleY: 1.2,
                duration: 600,
                yoyo: true, repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.markSprites[index] = text;
        });
    }

    // ========== HINT HIGHLIGHTING ==========

    updateHint(hint) {
        this.clearHintHighlights();
        if (!hint) return;

        switch (hint.type) {
            case 'position': {
                const idx = hint.correctPosition;
                if (this.cellSprites[idx]) {
                    this.cellSprites[idx].setFillStyle(0xfbbf24, 0.5);
                    this.cellSprites[idx].setStrokeStyle(2, 0xfbbf24, 1);
                    this.hintCells = [idx];
                }
                break;
            }
            case 'edge': {
                const cells = [];
                for (let i = 0; i < this.rows * this.cols; i++) {
                    const r = Math.floor(i / this.cols), c = i % this.cols;
                    if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) cells.push(i);
                }
                cells.forEach(idx => {
                    if (this.cellSprites[idx] && !this.gameState?.grid?.[idx]) {
                        this.cellSprites[idx].setFillStyle(0xfbbf24, 0.35);
                        this.cellSprites[idx].setStrokeStyle(2, 0xfbbf24, 0.8);
                    }
                });
                this.hintCells = cells;
                break;
            }
            case 'corner': {
                const corners = [0, this.cols - 1, this.cols * (this.rows - 1), this.rows * this.cols - 1];
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
                const { rowStart, rowEnd, colStart, colEnd } = hint.region || {};
                const cells = [];
                for (let r = rowStart; r <= rowEnd; r++) {
                    for (let c = colStart; c <= colEnd; c++) {
                        const idx = r * this.cols + c;
                        if (this.cellSprites[idx] && !this.gameState?.grid?.[idx]) {
                            this.cellSprites[idx].setFillStyle(0xfbbf24, 0.35);
                            this.cellSprites[idx].setStrokeStyle(2, 0xfbbf24, 0.8);
                            cells.push(idx);
                        }
                    }
                }
                this.hintCells = cells;
                break;
            }
        }

        // Pulse
        (this.hintCells || []).forEach(idx => {
            const cell = this.cellSprites[idx];
            if (!cell) return;
            this.tweens.add({
                targets: cell, fillAlpha: 0.8,
                duration: 700, yoyo: true, repeat: 3,
                ease: 'Sine.easeInOut'
            });
        });

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

    // ========== ANIMATIONS ==========

    playSnapAnimation(target) {
        const targetScaleX = target.scaleX;
        const targetScaleY = target.scaleY;
        target.setScale(targetScaleX * 0.3, targetScaleY * 0.3);
        target.setAlpha(0.5);
        this.tweens.add({
            targets: target,
            scaleX: targetScaleX, scaleY: targetScaleY,
            alpha: 1,
            duration: 350,
            ease: 'Back.easeOut'
        });
    }

    playScorePopup(gridIndex, points, breakdown) {
        const r = Math.floor(gridIndex / this.cols);
        const c = gridIndex % this.cols;
        const x = this.boardOffsetX + c * this.cellSize + this.cellSize / 2;
        const y = this.boardOffsetY + r * this.cellSize;

        const color = points >= 0 ? '#4ade80' : '#f87171';
        const sign = points >= 0 ? '+' : '';
        const text = this.add.text(x, y, `${sign}${points}`, {
            fontSize: `${Math.max(16, this.cellSize / 2.5)}px`,
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'bold', color,
            stroke: '#000000', strokeThickness: 3
        });
        this.boardContainer?.add(text);
        text.setOrigin(0.5, 1);
        text.setDepth(10);

        this.tweens.add({
            targets: text,
            y: y - 40, alpha: 0,
            scaleX: 1.5, scaleY: 1.5,
            duration: 1200, ease: 'Power2',
            onComplete: () => text.destroy()
        });

        if (breakdown) {
            let oY = 18;
            const parts = [breakdown.adjacent, breakdown.difficulty, breakdown.region].filter(Boolean);
            parts.forEach((part, i) => {
                const sub = this.add.text(x, y + oY * (i + 1), part, {
                    fontSize: `${Math.max(10, this.cellSize / 5)}px`,
                    fontFamily: 'Inter, sans-serif',
                    color: '#c4b5fd',
                    stroke: '#000000', strokeThickness: 2
                });
                this.boardContainer?.add(sub);
                sub.setOrigin(0.5, 0);
                sub.setDepth(10);

                this.tweens.add({
                    targets: sub,
                    y: sub.y - 30, alpha: 0,
                    duration: 1500, delay: 200 + i * 150,
                    ease: 'Power2',
                    onComplete: () => sub.destroy()
                });
            });
        }
    }

    playShakeAnimation(gridIndex) {
        const sprite = this.pieceSprites[gridIndex];
        if (!sprite) return;
        this.tweens.add({
            targets: sprite,
            x: sprite.x - 4,
            duration: 50, yoyo: true, repeat: 5,
            ease: 'Sine.easeInOut'
        });
    }

    playEjectAnimation(gridIndex, onComplete) {
        const sprite = this.pieceSprites[gridIndex];
        if (!sprite) { onComplete?.(); return; }
        sprite.setTint(0xff4444);
        this.tweens.add({
            targets: sprite,
            scaleX: 0, scaleY: 0, alpha: 0, angle: 180,
            duration: 500, ease: 'Back.easeIn',
            delay: Math.random() * 300,
            onComplete: () => {
                sprite.destroy();
                delete this.pieceSprites[gridIndex];
                if (this.cellSprites[gridIndex]) {
                    this.cellSprites[gridIndex].setFillStyle(0x1a1130, 0.6);
                    this.cellSprites[gridIndex].setStrokeStyle(1, 0x4a3b6e, 0.5);
                }
                onComplete?.();
            }
        });
    }

    playCorrectGlow(gridIndex) {
        const sprite = this.pieceSprites[gridIndex];
        if (!sprite) return;
        sprite.setTint(0xffd700);
        this.time.delayedCall(400, () => sprite.clearTint());
    }

    pulseCell(gridIndex) {
        const cell = this.cellSprites[gridIndex];
        if (!cell) return;
        this.tweens.add({
            targets: cell, fillAlpha: 0.9,
            duration: 400, yoyo: true, repeat: 2,
            ease: 'Sine.easeInOut',
            onComplete: () => cell.setFillStyle(0x1a1130, 0.6)
        });
    }

    playStreakEffect(streak) {
        if (streak < 3) return;
        const intensity = Math.min(streak / 10, 1);
        const color = Phaser.Display.Color.Interpolate.ColorWithColor(
            new Phaser.Display.Color(74, 222, 128),
            new Phaser.Display.Color(251, 146, 60),
            100, Math.floor(intensity * 100)
        );
        const hexColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
        Object.values(this.pieceSprites).forEach(sprite => {
            sprite.setTint(hexColor);
            this.time.delayedCall(300, () => sprite.clearTint());
        });
    }

    playTimerUrgency(secondsLeft) {
        if (secondsLeft > 30) return;
        this.cameras.main.flash(200, 255, 50, 50, false);
    }

    playRefillAnimation() {
        this.rackSprites.forEach(({ container }, i) => {
            if (!container) return;
            const targetX = container.x;
            container.x = this.scale.width + 100;
            container.setAlpha(0);

            this.tweens.add({
                targets: container,
                x: targetX, alpha: 1,
                duration: 300, delay: i * 80,
                ease: 'Back.easeOut'
            });
        });
    }
}
