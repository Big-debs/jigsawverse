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
        this.rackColumns = 5;
        this.rackRows = 2;
        this.rackPadding = 6;
        this.rackSignature = '';
        this.pendingTextureKeys = new Set();
        this.rackRenderQueued = false;
        this.selectedPieceId = null;
        this.hintCells = [];
        this.hintPieceIds = new Set();
        this.hintTimeout = null;
        this.lastGameplayEffectId = null;
        this.audioContext = null;

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
        this.setupAudioUnlock();
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

        // The board and rack share one tile scale. The rack is a fixed
        // 5 × 2 continuation of the board rather than a miniature strip.
        const margin = 8;
        const separatorGap = 12;
        const layoutColumns = Math.max(this.cols, this.rackColumns);
        const layoutRows = this.rows + this.rackRows;
        const availableW = w - margin * 2;
        const availableH = h - margin * 2 - separatorGap - this.rackPadding * 2;

        this.cellSize = Math.max(1, Math.floor(Math.min(
            availableW / layoutColumns,
            availableH / layoutRows
        )));

        const boardWidth = this.cellSize * this.cols;
        const boardHeight = this.cellSize * this.rows;
        const rackHeight = this.cellSize * this.rackRows + this.rackPadding * 2;
        const contentHeight = boardHeight + separatorGap + rackHeight;
        const contentTop = Math.floor((h - contentHeight) / 2);

        this.boardOffsetX = Math.floor((w - boardWidth) / 2);
        this.boardOffsetY = Math.max(margin, contentTop);

        // Keep enough real canvas space for two full-size rack rows.
        this.rackOffsetY = this.boardOffsetY + boardHeight + separatorGap;
        this.rackAreaH = rackHeight;
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
        const rackWidth = this.rackColumns * this.cellSize;
        const bg = this.add.rectangle(
            w / 2, this.rackOffsetY + this.rackAreaH / 2,
            rackWidth + this.rackPadding * 2,
            this.rackAreaH,
            0x130f24, 0.96
        );
        this.rackContainer?.add(bg);
        bg.setStrokeStyle(2, 0x4a3b6e, 0.85);
    }

    loadTexture(textureKey, source, onLoaded) {
        if (this.textures.exists(textureKey)) {
            onLoaded();
            return;
        }
        if (this.pendingTextureKeys.has(textureKey)) return;

        this.pendingTextureKeys.add(textureKey);
        this.load.once('complete', () => {
            this.pendingTextureKeys.delete(textureKey);
            if (this.textures.exists(textureKey)) onLoaded();
        });
        this.load.image(textureKey, source);
        this.load.start();
    }

    queueRackRender() {
        if (this.rackRenderQueued) return;
        this.rackRenderQueued = true;
        this.time.delayedCall(0, () => {
            this.rackRenderQueued = false;
            this.renderRack();
        });
    }

    renderRack() {
        // Clear the prior rack contents and rebuild the fixed tray layout.
        this.rackSprites.forEach(s => s.container?.destroy());
        this.rackSlotSprites.forEach(slot => slot.destroy());
        this.rackSprites = [];
        this.rackSlotSprites = [];

        const w = this.scale.width;
        const slotSize = this.cellSize;
        const totalWidth = this.rackColumns * slotSize;
        const startX = Math.floor((w - totalWidth) / 2);
        const startY = this.rackOffsetY + this.rackPadding;

        for (let i = 0; i < this.rackCapacity; i++) {
            const row = Math.floor(i / this.rackColumns);
            const col = i % this.rackColumns;
            const x = startX + col * slotSize + slotSize / 2;
            const y = startY + row * slotSize + slotSize / 2;
            const slot = this.add.rectangle(
                x, y,
                Math.max(1, slotSize - 2),
                Math.max(1, slotSize - 2),
                0x1a1130, 0.75
            );
            slot.setStrokeStyle(1, 0x4a3b6e, 0.7);
            this.rackContainer?.add(slot);
            this.rackSlotSprites.push(slot);
        }

        const pieces = this.rackPieces.filter(Boolean).slice(0, this.rackCapacity);
        const pieceSize = Math.max(1, slotSize - 2);
        pieces.forEach((piece, i) => {
            const row = Math.floor(i / this.rackColumns);
            const col = i % this.rackColumns;
            const x = startX + col * slotSize + slotSize / 2;
            const y = startY + row * slotSize + slotSize / 2;
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
                    this.loadTexture(textureKey, piece.imageData, () => this.queueRackRender());
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
        this.rackSprites.forEach(({ container, bg, piece }) => {
            if (!bg || !piece) return;
            const isSelected = this.selectedPieceId === piece.id;
            const isHinted = this.hintPieceIds.has(piece.id);
            bg.setStrokeStyle(
                isSelected ? 4 : isHinted ? 4 : 2,
                isSelected ? 0xfbbf24 : isHinted ? 0x22d3ee : 0x4a3b6e,
                1
            );
            if (container) {
                this.tweens.killTweensOf(container);
                container.setScale(isHinted ? 1.06 : 1);
            }
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

        this.loadTexture(key, this.ghostImageUrl, () => this.createGhostSprite(key));
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
        this.settings = settings || {};
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
        const signature = rack.map(piece => piece?.id ?? '').join('|');
        if (signature === this.rackSignature) return;
        this.rackSignature = signature;
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
                    this.loadTexture(textureKey, piece.imageData, () => this.renderPieces(this.gameState));
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
        if (this.pieceSprites[index] || this.gameState?.grid?.[index]?.id !== piece.id) return;

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

        this.hintPieceIds = new Set(hint.pieceIds || []);
        this.updateRackSelection();

        const cells = Array.isArray(hint.cellIndices) ? hint.cellIndices : [];
        cells.forEach(index => {
            const cell = this.cellSprites[index];
            if (!cell) return;
            const isExact = hint.type === 'position';
            cell.setFillStyle(0xfbbf24, isExact ? 0.58 : 0.3);
            cell.setStrokeStyle(isExact ? 3 : 2, isExact ? 0xfbbf24 : 0x22d3ee, 0.95);
        });
        this.hintCells = cells.filter(index => !!this.cellSprites[index]);

        this.hintCells.forEach(index => {
            const cell = this.cellSprites[index];
            this.tweens.killTweensOf(cell);
            this.tweens.add({
                targets: cell,
                fillAlpha: 0.78,
                duration: this.settings?.reducedMotion ? 1 : 650,
                yoyo: !this.settings?.reducedMotion,
                repeat: this.settings?.reducedMotion ? 0 : 3,
                ease: 'Sine.easeInOut'
            });
        });

        this.playSoundEffect('hint');
        const remaining = Math.max(250, (hint.expiresAt || Date.now() + (hint.duration || 5000)) - Date.now());
        this.hintTimeout = this.time.delayedCall(remaining, () => {
            this.hintTimeout = null;
            this.clearHintHighlights(false);
        });
    }

    clearHintHighlights(cancelTimer = true) {
        if (cancelTimer && this.hintTimeout) {
            this.hintTimeout.remove(false);
            this.hintTimeout = null;
        }

        (this.hintCells || []).forEach(index => {
            const cell = this.cellSprites[index];
            if (!cell) return;
            this.tweens.killTweensOf(cell);
            const piece = this.gameState?.grid?.[index];
            if (piece) {
                cell.setFillStyle(0x2d1f5e, 0.3);
                cell.setStrokeStyle(1, 0x6c5ce7, 0.6);
            } else {
                cell.setFillStyle(0x1a1130, 0.6);
                cell.setStrokeStyle(1, 0x4a3b6e, 0.5);
            }
        });

        this.hintCells = [];
        this.hintPieceIds = new Set();
        this.updateRackSelection();
    }

    setupAudioUnlock() {
        this.input.on('pointerdown', () => {
            if (!this.settings?.soundEnabled) return;
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            if (!this.audioContext) this.audioContext = new AudioContextClass();
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
        });
    }

    playSoundEffect(kind) {
        if (!this.settings?.soundEnabled || !this.audioContext) return;
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
            return;
        }

        const sounds = {
            select: [330, 0.045, 'sine'],
            place: [180, 0.07, 'triangle'],
            reject: [95, 0.12, 'square'],
            hint: [660, 0.12, 'sine'],
            success: [520, 0.16, 'sine'],
            failure: [120, 0.18, 'sawtooth'],
            refill: [260, 0.06, 'triangle'],
            complete: [784, 0.28, 'sine']
        };
        const [frequency, duration, wave] = sounds[kind] || sounds.place;
        const volume = Math.max(0, Math.min(1, this.settings?.soundVolume ?? 0.7));
        const now = this.audioContext.currentTime;
        const oscillator = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.12), now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain);
        gain.connect(this.audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.02);
    }

    playGameplayEffect(event) {
        if (!event?.id || event.id === this.lastGameplayEffectId) return;
        this.lastGameplayEffectId = event.id;

        switch (event.type) {
            case 'piece_selected':
                this.playSoundEffect('select');
                break;
            case 'piece_placed':
                this.pulseCell(event.gridIndex);
                if (typeof event.points === 'number' && event.points !== 0) {
                    this.playScorePopup(event.gridIndex, event.points, event.breakdown);
                }
                if (event.streak >= 3) this.playStreakEffect(event.streak);
                this.playSoundEffect('place');
                break;
            case 'placement_rejected':
                this.playShakeAnimation(event.gridIndex);
                this.playSoundEffect('reject');
                break;
            case 'hint_activated':
                // updateHint owns the visual pulse and sound.
                break;
            case 'check_resolved':
                if (event.outcome === 'successful_check' || event.outcome === 'opponent_passed_incorrect') {
                    this.playEjectAnimation(event.gridIndex);
                    this.playSoundEffect('failure');
                } else {
                    this.playCorrectGlow(event.gridIndex);
                    this.playSoundEffect('success');
                }
                break;
            case 'rack_refilled':
                this.playRefillAnimation();
                this.playSoundEffect('refill');
                break;
            case 'streak_increased':
                this.playStreakEffect(event.streak);
                this.playSoundEffect('success');
                break;
            case 'game_completed':
                this.cameras.main.flash(this.settings?.reducedMotion ? 1 : 500, 251, 191, 36, false);
                this.playSoundEffect('complete');
                break;
            default:
                break;
        }
    }

    // ========== ANIMATIONS ==========

    playSnapAnimation(target) {
        if (this.settings?.reducedMotion) {
            target.setAlpha(1);
            return;
        }
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
        if (!sprite) {
            this.pulseCell(gridIndex);
            return;
        }
        if (this.settings?.reducedMotion) {
            sprite.setTint(0xf87171);
            this.time.delayedCall(180, () => sprite.clearTint());
            return;
        }
        this.tweens.add({
            targets: sprite,
            x: sprite.x - 4,
            duration: 50, yoyo: true, repeat: 5,
            ease: 'Sine.easeInOut'
        });
    }

    playEjectAnimation(gridIndex, onComplete) {
        const sprite = this.pieceSprites[gridIndex];
        if (!sprite) {
            this.pulseCell(gridIndex);
            onComplete?.();
            return;
        }
        sprite.setTint(0xff4444);
        if (this.settings?.reducedMotion) {
            sprite.setAlpha(0);
            this.time.delayedCall(100, () => {
                sprite.destroy();
                delete this.pieceSprites[gridIndex];
                onComplete?.();
            });
            return;
        }
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
        this.tweens.killTweensOf(cell);
        const restore = () => {
            const piece = this.gameState?.grid?.[gridIndex];
            cell.setFillStyle(piece ? 0x2d1f5e : 0x1a1130, piece ? 0.3 : 0.6);
            cell.setStrokeStyle(1, piece ? 0x6c5ce7 : 0x4a3b6e, piece ? 0.6 : 0.5);
        };
        if (this.settings?.reducedMotion) {
            cell.setStrokeStyle(2, 0xfbbf24, 0.9);
            this.time.delayedCall(160, restore);
            return;
        }
        this.tweens.add({
            targets: cell,
            fillAlpha: 0.9,
            duration: 400,
            yoyo: true,
            repeat: 2,
            ease: 'Sine.easeInOut',
            onComplete: restore
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
            this.time.delayedCall(this.settings?.reducedMotion ? 120 : 300, () => sprite.clearTint());
        });
    }

    playTimerUrgency(secondsLeft) {
        if (secondsLeft > 30) return;
        this.cameras.main.flash(this.settings?.reducedMotion ? 1 : 200, 255, 50, 50, false);
    }

    playRefillAnimation() {
        if (this.settings?.reducedMotion) return;
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
