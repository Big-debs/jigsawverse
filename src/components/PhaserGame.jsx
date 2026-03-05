import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BoardScene } from '../phaser/scenes/BoardScene';

/**
 * PhaserGame — React wrapper for the Phaser.Game instance.
 * Uses a single BoardScene that renders both the grid and the rack.
 */
const PhaserGame = ({
    gameState,
    gridSize,
    ghostImage,
    settings,
    myRack = [],
    myPlayer = 'playerA',
    isNexusMode = false,
    onPiecePlaced,
    onPieceMarked,
    selectedPiece,
    onPieceSelected,
    activeHint = null,
}) => {
    const containerRef = useRef(null);
    const gameRef = useRef(null);
    const sceneRef = useRef(null);

    // Stable callback refs so event listeners always call the latest handler
    const onPiecePlacedRef = useRef(onPiecePlaced);
    const onPieceMarkedRef = useRef(onPieceMarked);
    const onPieceSelectedRef = useRef(onPieceSelected);
    const selectedPieceRef = useRef(selectedPiece);

    useEffect(() => { onPiecePlacedRef.current = onPiecePlaced; }, [onPiecePlaced]);
    useEffect(() => { onPieceMarkedRef.current = onPieceMarked; }, [onPieceMarked]);
    useEffect(() => { onPieceSelectedRef.current = onPieceSelected; }, [onPieceSelected]);
    useEffect(() => { selectedPieceRef.current = selectedPiece; }, [selectedPiece]);

    // Initialize Phaser game — runs once
    useEffect(() => {
        if (!containerRef.current || gameRef.current) return;

        const config = {
            type: Phaser.AUTO,
            parent: containerRef.current,
            backgroundColor: '#0f0b1e',
            scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.CENTER_BOTH,
                width: '100%',
                height: '100%',
            },
            scene: [],
            physics: { default: false },
            input: {
                mouse: { preventDefaultWheel: false },
                touch: { capture: true }
            },
            render: {
                antialias: true,
                pixelArt: false,
                roundPixels: false
            },
            audio: { noAudio: true }
        };

        const game = new Phaser.Game(config);
        gameRef.current = game;

        const boardScene = new BoardScene();
        sceneRef.current = boardScene;

        game.scene.add('BoardScene', boardScene, true, {
            gridSize,
            ghostImage,
            settings,
            isNexusMode,
            myPlayer
        });

        // Wait for Phaser to boot and attach event listeners
        const onReady = () => {
            setTimeout(() => {
                const scene = sceneRef.current;
                if (!scene?.events) return;

                scene.events.on('boardEvent', (event) => {
                    switch (event.type) {
                        case 'cellClicked':
                            if (selectedPieceRef.current) {
                                onPiecePlacedRef.current?.(selectedPieceRef.current.id, event.gridIndex);
                            }
                            break;
                        case 'pieceMarked':
                            onPieceMarkedRef.current?.(event.gridIndex, event.markType);
                            break;
                    }
                });

                scene.events.on('rackEvent', (event) => {
                    if (event.type === 'pieceSelected') {
                        onPieceSelectedRef.current?.(event.piece);
                    }
                });
            }, 150);
        };

        if (game.isBooted) {
            onReady();
        } else {
            game.events.once('ready', onReady);
        }

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
                sceneRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync game state
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene?.scene?.isActive()) return;
        scene.updateGameState(gameState);
    }, [gameState]);

    // Sync rack
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene?.scene?.isActive()) return;
        scene.updateRack(myRack);
    }, [myRack]);

    // Sync selected piece
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene?.scene?.isActive()) return;
        scene.setSelectedPiece(selectedPiece);
    }, [selectedPiece]);

    // Sync settings
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene?.scene?.isActive()) return;
        scene.updateSettings(settings, ghostImage);
    }, [settings, ghostImage]);

    // Forward hint
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene?.scene?.isActive()) return;
        if (scene.updateHint) {
            scene.updateHint(activeHint);
        }
    }, [activeHint]);

    return (
        <div
            ref={containerRef}
            className="w-full rounded-xl overflow-hidden border border-white/10"
            style={{ minHeight: '500px', aspectRatio: '3/4' }}
        />
    );
};

export default PhaserGame;
