import Phaser from 'phaser';

/**
 * RackScene — Phaser scene for the player's piece rack.
 * Displays pieces in a row, handles selection and drag-start.
 */
export class RackScene extends Phaser.Scene {
    constructor() {
        super({ key: 'RackScene' });
        this.rackPieces = [];
        this.pieceSprites = [];
        this.selectedPieceId = null;
        this.gridSize = 5;
    }

    init(data) {
        this.gridSize = data.gridSize || 5;
    }

    create() {
        this.cameras.main.setBackgroundColor(0x0f0b1e);
        this.events.emit('create');

        this.scale.on('resize', () => {
            this.renderRack();
        });
    }

    updateRack(rack) {
        if (!rack) return;
        this.rackPieces = rack;
        this.renderRack();
    }

    setSelectedPiece(piece) {
        this.selectedPieceId = piece?.id || null;
        this.updateSelectionHighlight();
    }

    renderRack() {
        // Clear existing
        this.pieceSprites.forEach(s => s.container?.destroy());
        this.pieceSprites = [];

        const w = this.scale.width;
        const h = this.scale.height;
        const pieces = this.rackPieces.filter(p => p !== null);
        const maxPieces = 10;
        const padding = 6;
        const pieceSize = Math.min(
            Math.floor((w - padding * 2) / maxPieces) - padding,
            Math.floor(h - padding * 2),
            80
        );

        const totalWidth = pieces.length * (pieceSize + padding) - padding;
        const startX = Math.floor((w - totalWidth) / 2);
        const y = Math.floor(h / 2);

        pieces.forEach((piece, i) => {
            if (!piece) return;

            const x = startX + i * (pieceSize + padding) + pieceSize / 2;
            const container = this.add.container(x, y);

            // Background
            const bg = this.add.rectangle(0, 0, pieceSize, pieceSize, 0x2d1f5e, 0.8);
            bg.setStrokeStyle(2, this.selectedPieceId === piece.id ? 0x06b6d4 : 0x4a3b6e, 1);
            container.add(bg);

            // Edge highlight
            if (piece.isEdge) {
                const edgeGlow = this.add.rectangle(0, 0, pieceSize + 4, pieceSize + 4);
                edgeGlow.setStrokeStyle(2, 0xf59e0b, 0.6);
                container.add(edgeGlow);
            }

            // Piece image
            if (piece.imageData) {
                const textureKey = `rack_${piece.id}`;
                if (this.textures.exists(textureKey)) {
                    const img = this.add.image(0, 0, textureKey);
                    img.setDisplaySize(pieceSize - 6, pieceSize - 6);
                    container.add(img);
                } else {
                    this.load.image(textureKey, piece.imageData);
                    this.load.once('complete', () => {
                        if (this.textures.exists(textureKey) && !container.scene) return;
                        try {
                            const img = this.add.image(0, 0, textureKey);
                            img.setDisplaySize(pieceSize - 6, pieceSize - 6);
                            container.add(img);
                        } catch { /* container destroyed */ }
                    });
                    this.load.start();
                }
            }

            // Make interactive
            bg.setInteractive({ useHandCursor: true, draggable: false });

            // Selection on click
            bg.on('pointerdown', () => {
                this.events.emit('rackEvent', {
                    type: 'pieceSelected',
                    piece
                });
            });

            // Hover animations
            bg.on('pointerover', () => {
                this.tweens.add({
                    targets: container,
                    scaleX: 1.1,
                    scaleY: 1.1,
                    duration: 150,
                    ease: 'Power2'
                });
            });
            bg.on('pointerout', () => {
                this.tweens.add({
                    targets: container,
                    scaleX: 1.0,
                    scaleY: 1.0,
                    duration: 150,
                    ease: 'Power2'
                });
            });

            container.setData('piece', piece);
            this.pieceSprites.push({ container, bg, piece });
        });
    }

    updateSelectionHighlight() {
        this.pieceSprites.forEach(({ bg, piece }) => {
            if (!bg || !piece) return;
            const isSelected = this.selectedPieceId === piece.id;
            bg.setStrokeStyle(
                isSelected ? 3 : 2,
                isSelected ? 0x06b6d4 : 0x4a3b6e,
                1
            );
        });
    }

    /**
     * Play rack refill animation — pieces slide in one by one.
     */
    playRefillAnimation() {
        this.pieceSprites.forEach(({ container }, i) => {
            if (!container) return;
            const targetX = container.x;
            container.x = this.scale.width + 100;
            container.setAlpha(0);

            this.tweens.add({
                targets: container,
                x: targetX,
                alpha: 1,
                duration: 300,
                delay: i * 80,
                ease: 'Back.easeOut'
            });
        });
    }
}
