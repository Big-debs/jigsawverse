import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { BoardScene } from '../phaser/scenes/BoardScene';

/**
 * PhaserGame — React wrapper for the Phaser.Game instance.
 * Uses a single BoardScene that renders both the grid and the rack.
 *
 * Key architecture:
 *   - All React state is stored in refs so the onReady callback and
 *     event listeners always see the latest values.
 *   - A `sceneReady` flag gates the useEffect syncs so data isn't
 *     silently dropped before the scene boots.
 *   - The onReady callback pushes ALL initial data once the scene is live.
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
    const sceneReadyRef = useRef(false);

    // Latest-value refs — so callbacks/effects always see current data
    const gameStateRef = useRef(gameState);
    const myRackRef = useRef(myRack);
    const selectedPieceRef = useRef(selectedPiece);
    const settingsRef = useRef(settings);
    const ghostImageRef = useRef(ghostImage);
    const activeHintRef = useRef(activeHint);
    const onPiecePlacedRef = useRef(onPiecePlaced);
    const onPieceMarkedRef = useRef(onPieceMarked);
    const onPieceSelectedRef = useRef(onPieceSelected);

    // Keep refs in sync with props
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { myRackRef.current = myRack; }, [myRack]);
    useEffect(() => { selectedPieceRef.current = selectedPiece; }, [selectedPiece]);
    useEffect(() => { settingsRef.current = settings; }, [settings]);
    useEffect(() => { ghostImageRef.current = ghostImage; }, [ghostImage]);
    useEffect(() => { activeHintRef.current = activeHint; }, [activeHint]);
    useEffect(() => { onPiecePlacedRef.current = onPiecePlaced; }, [onPiecePlaced]);
    useEffect(() => { onPieceMarkedRef.current = onPieceMarked; }, [onPieceMarked]);
    useEffect(() => { onPieceSelectedRef.current = onPieceSelected; }, [onPieceSelected]);

    // ========== Initialize Phaser — runs once ==========
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

        // Once Phaser boots and the scene's create() has run,
        // attach event listeners and push initial data.
        const attachAndSync = () => {
            const scene = sceneRef.current;
            if (!scene?.events) {
                console.warn('PhaserGame: scene.events not available');
                return;
            }

            // Board events → React
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

            // Rack events → React
            scene.events.on('rackEvent', (event) => {
                if (event.type === 'pieceSelected') {
                    onPieceSelectedRef.current?.(event.piece);
                }
            });

            // Push ALL initial data now that the scene is alive
            if (gameStateRef.current) scene.updateGameState(gameStateRef.current);
            if (myRackRef.current) scene.updateRack(myRackRef.current);
            if (selectedPieceRef.current) scene.setSelectedPiece(selectedPieceRef.current);
            if (activeHintRef.current) scene.updateHint?.(activeHintRef.current);

            sceneReadyRef.current = true;
        };

        // Wait for Phaser to boot and the scene to be fully created,
        // then attach listeners and push initial data.
        const waitForSceneAndSync = () => {
            const scene = sceneRef.current;
            if (scene?.scene?.isActive()) {
                attachAndSync();
            } else {
                // Scene not ready yet — poll briefly
                const check = setInterval(() => {
                    if (sceneRef.current?.scene?.isActive()) {
                        clearInterval(check);
                        attachAndSync();
                    }
                }, 50);
                // Safety: stop polling after 5s
                setTimeout(() => clearInterval(check), 5000);
            }
        };

        if (game.isBooted) {
            waitForSceneAndSync();
        } else {
            game.events.once('ready', waitForSceneAndSync);
        }

        return () => {
            sceneReadyRef.current = false;
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
                sceneRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ========== Sync React → Phaser (only after scene is ready) ==========

    useEffect(() => {
        if (!sceneReadyRef.current) return;
        sceneRef.current?.updateGameState(gameState);
    }, [gameState]);

    useEffect(() => {
        if (!sceneReadyRef.current) return;
        sceneRef.current?.updateRack(myRack);
    }, [myRack]);

    useEffect(() => {
        if (!sceneReadyRef.current) return;
        sceneRef.current?.setSelectedPiece(selectedPiece);
    }, [selectedPiece]);

    useEffect(() => {
        if (!sceneReadyRef.current) return;
        sceneRef.current?.updateSettings(settings, ghostImage);
    }, [settings, ghostImage]);

    useEffect(() => {
        if (!sceneReadyRef.current) return;
        sceneRef.current?.updateHint?.(activeHint);
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
