import { useEffect, useRef, useCallback } from 'react';
import Phaser from 'phaser';
import { BoardScene } from '../phaser/scenes/BoardScene';
import { RackScene } from '../phaser/scenes/RackScene';

/**
 * PhaserGame — React wrapper for the Phaser.Game instance.
 * Manages lifecycle, passes state down via scene events.
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
    const boardSceneRef = useRef(null);
    const rackSceneRef = useRef(null);

    // Initialize Phaser game
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

        // Add scenes
        const boardScene = new BoardScene();
        const rackScene = new RackScene();
        boardSceneRef.current = boardScene;
        rackSceneRef.current = rackScene;

        game.scene.add('BoardScene', boardScene, true, {
            gridSize,
            ghostImage,
            settings,
            isNexusMode,
            myPlayer
        });

        game.scene.add('RackScene', rackScene, true, {
            gridSize
        });

        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
                boardSceneRef.current = null;
                rackSceneRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync game state to Phaser scenes
    useEffect(() => {
        if (!boardSceneRef.current?.scene?.isActive()) return;
        boardSceneRef.current.updateGameState(gameState);
    }, [gameState]);

    // Sync rack to Phaser
    useEffect(() => {
        if (!rackSceneRef.current?.scene?.isActive()) return;
        rackSceneRef.current.updateRack(myRack);
    }, [myRack]);

    // Sync selected piece
    useEffect(() => {
        if (!rackSceneRef.current?.scene?.isActive()) return;
        rackSceneRef.current.setSelectedPiece(selectedPiece);
    }, [selectedPiece]);

    // Sync settings
    useEffect(() => {
        if (!boardSceneRef.current?.scene?.isActive()) return;
        boardSceneRef.current.updateSettings(settings, ghostImage);
    }, [settings, ghostImage]);

    // Forward hint changes to board scene for visual highlighting
    useEffect(() => {
        if (!boardSceneRef.current?.scene?.isActive()) return;
        if (boardSceneRef.current.updateHint) {
            boardSceneRef.current.updateHint(activeHint);
        }
    }, [activeHint]);

    // Event handlers — forward Phaser events to React
    const handleBoardEvent = useCallback((event) => {
        switch (event.type) {
            case 'piecePlaced':
                onPiecePlaced?.(event.pieceId, event.gridIndex);
                break;
            case 'pieceMarked':
                onPieceMarked?.(event.gridIndex, event.markType);
                break;
            case 'cellClicked':
                if (selectedPiece) {
                    onPiecePlaced?.(selectedPiece.id, event.gridIndex);
                }
                break;
        }
    }, [onPiecePlaced, onPieceMarked, selectedPiece]);

    const handleRackEvent = useCallback((event) => {
        if (event.type === 'pieceSelected') {
            onPieceSelected?.(event.piece);
        }
    }, [onPieceSelected]);

    // Keep stable refs for callbacks so the init useEffect can access latest handlers
    const boardHandlerRef = useRef(handleBoardEvent);
    const rackHandlerRef = useRef(handleRackEvent);
    useEffect(() => { boardHandlerRef.current = handleBoardEvent; }, [handleBoardEvent]);
    useEffect(() => { rackHandlerRef.current = handleRackEvent; }, [handleRackEvent]);

    // Register event listeners AFTER Phaser scenes are ready
    useEffect(() => {
        const board = boardSceneRef.current;
        const rack = rackSceneRef.current;
        const game = gameRef.current;
        if (!board || !rack || !game) return;

        const setupListeners = () => {
            // Board events — use a forwarding function that reads from ref
            const boardForwarder = (event) => boardHandlerRef.current?.(event);
            const rackForwarder = (event) => rackHandlerRef.current?.(event);

            if (board.events) {
                board.events.on('boardEvent', boardForwarder);
            }
            if (rack.events) {
                rack.events.on('rackEvent', rackForwarder);
            }

            // Push initial state once scenes are active
            if (board.scene?.isActive() && gameState) {
                board.updateGameState(gameState);
            }
            if (rack.scene?.isActive() && myRack) {
                rack.updateRack(myRack);
            }
        };

        // Phaser game 'ready' fires after all scenes have booted
        if (game.isBooted) {
            // Already booted (e.g. useEffect re-ran) — setup now
            // Small delay to ensure scenes have finished create()
            setTimeout(setupListeners, 100);
        } else {
            game.events.once('ready', () => {
                setTimeout(setupListeners, 100);
            });
        }

        return () => {
            if (board.events) {
                board.events.removeAllListeners('boardEvent');
            }
            if (rack.events) {
                rack.events.removeAllListeners('rackEvent');
            }
        };
        // Only run once after init
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            ref={containerRef}
            className="w-full rounded-xl overflow-hidden border border-white/10"
            style={{ minHeight: '400px', aspectRatio: '4/3' }}
        />
    );
};

export default PhaserGame;
