import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Gamepad2, Trophy, LogOut, Play, UserPlus, RefreshCw, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '../config/supabase';
import { authService } from '../services/auth.service';
import { MultiplayerGameHost, MultiplayerGameGuest } from '../lib/multiplayer';

// =====================================================
// CONNECTION STATUS CONSTANTS
// =====================================================

const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

// =====================================================
// MULTIPLAYER CONNECTION MANAGER
// =====================================================

class ConnectionManager {
  constructor() {
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1 second
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.heartbeatInterval = null;
    this.connectionStatus = CONNECTION_STATUS.DISCONNECTED;
    this.onStatusChange = null;
    this.onReconnect = null;
  }

  setStatusCallback(callback) {
    this.onStatusChange = callback;
  }

  setReconnectCallback(callback) {
    this.onReconnect = callback;
  }

  updateStatus(status) {
    this.connectionStatus = status;
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.updateStatus(CONNECTION_STATUS.ERROR);
      return false;
    }

    this.updateStatus(CONNECTION_STATUS.RECONNECTING);
    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      if (this.onReconnect) {
        await this.onReconnect();
      }
      this.reconnectAttempts = 0;
      this.updateStatus(CONNECTION_STATUS.CONNECTED);
      return true;
    } catch {
      return this.attemptReconnect();
    }
  }

  startHeartbeat(callback, interval = 30000) {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(async () => {
      try {
        await callback();
        this.updateStatus(CONNECTION_STATUS.CONNECTED);
      } catch {
        this.attemptReconnect();
      }
    }, interval);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  reset() {
    this.reconnectAttempts = 0;
    this.stopHeartbeat();
    this.updateStatus(CONNECTION_STATUS.DISCONNECTED);
  }
}

// Heartbeat configuration
const HEARTBEAT_CONFIG = {
  INTERVAL: 60000, // 60 seconds - reduced frequency for less database load
};

/**
 * Create a lightweight heartbeat function for connection monitoring
 * Uses the Supabase realtime connection status instead of database queries
 * @param {Object} multiplayerRef - Reference to multiplayer instance
 * @returns {Function} Heartbeat check function
 */
function createHeartbeatCheck(multiplayerRef) {
  return async () => {
    if (!multiplayerRef.current) {
      throw new Error('No active connection');
    }
    // Check if the multiplayer instance reports as connected
    if (!multiplayerRef.current.isConnected) {
      throw new Error('Connection lost');
    }
    // Connection is healthy
    return true;
  };
}

// =====================================================
// APP ROUTES
// =====================================================

const ROUTES = {
  HOME: 'home',
  CREATE_GAME: 'create',
  WAITING_ROOM: 'waiting',
  JOIN_GAME: 'join',
  GAMEPLAY: 'gameplay',
  GAME_OVER: 'gameover'
};

// =====================================================
// MAIN APP COMPONENT
// =====================================================

const JigsawVerseApp = () => {
  const [currentRoute, setCurrentRoute] = useState(ROUTES.HOME);
  const [user, setUser] = useState(null);
  const [gameData, setGameData] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Refs for multiplayer instances and connection manager
  const multiplayerRef = useRef(null);
  const connectionManagerRef = useRef(new ConnectionManager());

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          setUser(session.user);
        } else {
          // Auto sign-in anonymously if no session exists
          const { data, error } = await supabase.auth.signInAnonymously();
          if (!error && data?.user) {
            // Update with guest metadata
            await supabase.auth.updateUser({
              data: {
                username: `Guest_${Date.now() % 10000}`,
                display_name: 'Guest Player',
                is_anonymous: true
              }
            });
            setUser(data.user);
          }
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Setup connection manager callbacks
  useEffect(() => {
    const connectionManager = connectionManagerRef.current;
    connectionManager.setStatusCallback(setConnectionStatus);
    
    return () => {
      connectionManager.reset();
    };
  }, []);

  // Cleanup multiplayer on unmount
  useEffect(() => {
    return () => {
      if (multiplayerRef.current) {
        multiplayerRef.current.disconnect();
      }
    };
  }, []);

  // Navigation handlers
  const navigate = useCallback((route, data = null) => {
    setCurrentRoute(route);
    if (data) setGameData(prev => ({ ...prev, ...data }));
    setError(null);
  }, []);

  const handleLogout = async () => {
    try {
      // Disconnect from any active game
      if (multiplayerRef.current) {
        await multiplayerRef.current.disconnect();
        multiplayerRef.current = null;
      }
      connectionManagerRef.current.reset();
      
      await authService.signOut();
      setUser(null);
      setGameData(null);
      setCurrentRoute(ROUTES.HOME);
    } catch (err) {
      console.error('Logout error:', err);
      setError('Failed to logout. Please try again.');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-purple-200">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Gamepad2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">JigsawVerse</h1>
          </div>
          
          {user && (
            <div className="flex items-center gap-4">
              {/* Connection Status Indicator */}
              {currentRoute === ROUTES.GAMEPLAY && (
                <div className="flex items-center gap-2">
                  {connectionStatus === CONNECTION_STATUS.CONNECTED && (
                    <Wifi className="w-4 h-4 text-green-400" />
                  )}
                  {connectionStatus === CONNECTION_STATUS.DISCONNECTED && (
                    <WifiOff className="w-4 h-4 text-red-400" />
                  )}
                  {connectionStatus === CONNECTION_STATUS.RECONNECTING && (
                    <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />
                  )}
                  {connectionStatus === CONNECTION_STATUS.ERROR && (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              )}
              <span className="text-purple-200">
                {user.user_metadata?.username || 'Player'}
              </span>
              <button
                onClick={handleLogout}
                className="text-purple-400 hover:text-purple-300 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/20 border-b border-red-500/30 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-200">{error}</span>
            </div>
            <button 
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentRoute === ROUTES.HOME && (
          <HomeScreen 
            onNavigate={navigate}
            setIsHost={setIsHost}
          />
        )}
        
        {currentRoute === ROUTES.CREATE_GAME && (
          <CreateGameScreen 
            user={user}
            multiplayerRef={multiplayerRef}
            connectionManager={connectionManagerRef.current}
            onGameCreated={(data) => {
              setGameData(data);
              navigate(ROUTES.WAITING_ROOM, data);
            }}
            onBack={() => navigate(ROUTES.HOME)}
            setError={setError}
          />
        )}
        
        {currentRoute === ROUTES.WAITING_ROOM && (
          <WaitingRoom 
            gameCode={gameData?.gameCode}
            multiplayerRef={multiplayerRef}
            onCancel={async () => {
              if (multiplayerRef.current) {
                await multiplayerRef.current.disconnect();
                multiplayerRef.current = null;
              }
              navigate(ROUTES.HOME);
            }}
            onGameStart={() => navigate(ROUTES.GAMEPLAY)}
          />
        )}
        
        {currentRoute === ROUTES.JOIN_GAME && (
          <JoinGameScreen 
            user={user}
            multiplayerRef={multiplayerRef}
            connectionManager={connectionManagerRef.current}
            onGameJoined={(data) => {
              setGameData(data);
              navigate(ROUTES.GAMEPLAY, data);
            }}
            onBack={() => navigate(ROUTES.HOME)}
            setError={setError}
          />
        )}
        
        {currentRoute === ROUTES.GAMEPLAY && (
          <GameplayScreen 
            isHost={isHost}
            multiplayerRef={multiplayerRef}
            onGameEnd={(winner) => {
              navigate(ROUTES.GAME_OVER, { winner });
            }}
            onExit={async () => {
              if (multiplayerRef.current) {
                await multiplayerRef.current.disconnect();
                multiplayerRef.current = null;
              }
              connectionManagerRef.current.reset();
              navigate(ROUTES.HOME);
            }}
            setError={setError}
          />
        )}
        
        {currentRoute === ROUTES.GAME_OVER && (
          <GameOverScreen 
            winner={gameData?.winner}
            gameData={gameData}
            onPlayAgain={() => {
              setGameData(null);
              navigate(ROUTES.HOME);
            }}
          />
        )}
      </main>
    </div>
  );
};

// =====================================================
// HOME SCREEN
// =====================================================

const HomeScreen = ({ onNavigate, setIsHost }) => {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h2 className="text-5xl font-bold text-white mb-4">
          Welcome to JigsawVerse
        </h2>
        <p className="text-xl text-purple-200">
          Challenge friends in real-time puzzle battles
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Create Game Card */}
        <button
          onClick={() => {
            setIsHost(true);
            onNavigate(ROUTES.CREATE_GAME);
          }}
          className="group bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl p-8 text-left transition-all transform hover:scale-105 shadow-2xl"
        >
          <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
            <Play className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Create Game</h3>
          <p className="text-purple-100">
            Upload an image and start a new multiplayer puzzle challenge
          </p>
          <div className="mt-4 flex items-center text-white font-medium">
            <span>Get Started</span>
            <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Join Game Card */}
        <button
          onClick={() => {
            setIsHost(false);
            onNavigate(ROUTES.JOIN_GAME);
          }}
          className="group bg-gradient-to-br from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-2xl p-8 text-left transition-all transform hover:scale-105 shadow-2xl"
        >
          <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-white/30 transition-colors">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Join Game</h3>
          <p className="text-cyan-100">
            Enter a game code to join your friend&apos;s puzzle challenge
          </p>
          <div className="mt-4 flex items-center text-white font-medium">
            <span>Enter Code</span>
            <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>

      {/* Features Section */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
          <Users className="w-8 h-8 text-purple-400 mb-3" />
          <h4 className="text-white font-semibold mb-2">Real-Time Multiplayer</h4>
          <p className="text-purple-200 text-sm">
            Play with friends in synchronized real-time gameplay
          </p>
        </div>
        
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
          <Trophy className="w-8 h-8 text-yellow-400 mb-3" />
          <h4 className="text-white font-semibold mb-2">Competitive Scoring</h4>
          <p className="text-purple-200 text-sm">
            Strategic check/pass system with streak bonuses
          </p>
        </div>
        
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
          <Gamepad2 className="w-8 h-8 text-cyan-400 mb-3" />
          <h4 className="text-white font-semibold mb-2">Custom Puzzles</h4>
          <p className="text-purple-200 text-sm">
            Upload any image and choose difficulty level
          </p>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// CREATE GAME SCREEN
// =====================================================

const CreateGameScreen = ({ user, multiplayerRef, connectionManager, onGameCreated, onBack, setError }) => {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [gridSize, setGridSize] = useState(10);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState('');

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleCreate = async () => {
    if (!imageFile || !user) return;
    
    setCreating(true);
    setProgress('Initializing...');
    
    try {
      // Create multiplayer host instance
      const gameHost = new MultiplayerGameHost();
      multiplayerRef.current = gameHost;

      setProgress('Creating game...');
      
      // Create the game using the multiplayer host
      const result = await gameHost.createGame(imageFile, {
        gridSize,
        timeLimit: 600
      });

      // Setup connection manager for reconnection
      connectionManager.setReconnectCallback(async () => {
        if (gameHost.realtimeChannel) {
          await gameHost.setupRealtimeChannel(result.gameId);
        }
      });
      connectionManager.updateStatus(CONNECTION_STATUS.CONNECTED);

      // Start lightweight heartbeat for connection monitoring
      connectionManager.startHeartbeat(
        createHeartbeatCheck(multiplayerRef),
        HEARTBEAT_CONFIG.INTERVAL
      );

      setProgress('Game created!');
      
      onGameCreated({
        gameId: result.gameId,
        gameCode: result.gameCode,
        game: result.game,
        pieces: result.pieces,
        gridDimensions: result.gridDimensions,
        imagePreview
      });
    } catch (err) {
      console.error('Error creating game:', err);
      setError('Failed to create game: ' + (err.message || 'Unknown error'));
      connectionManager.updateStatus(CONNECTION_STATUS.ERROR);
      
      // Cleanup on error
      if (multiplayerRef.current) {
        await multiplayerRef.current.disconnect();
        multiplayerRef.current = null;
      }
    } finally {
      setCreating(false);
      setProgress('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={onBack}
        className="text-purple-400 hover:text-purple-300 mb-6 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h2 className="text-3xl font-bold text-white mb-6">Create New Game</h2>

      <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/10">
        <label className="block text-white font-semibold mb-3">
          Choose Puzzle Image
        </label>
        
        <input
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          disabled={creating}
          className="hidden"
          id="image-upload"
        />
        
        <label htmlFor="image-upload" className="block cursor-pointer">
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-64 object-cover rounded-lg border-2 border-white/20 hover:border-cyan-400 transition-colors"
            />
          ) : (
            <div className="w-full h-64 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center hover:border-cyan-400 transition-colors">
              <div className="text-center text-purple-300">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>Click to upload image</p>
              </div>
            </div>
          )}
        </label>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/10">
        <label className="block text-purple-200 text-sm mb-2">
          Grid Size: {gridSize}×{gridSize} ({gridSize * gridSize} pieces)
        </label>
        <input
          type="range"
          min="5"
          max="15"
          value={gridSize}
          onChange={(e) => setGridSize(Number(e.target.value))}
          disabled={creating}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-purple-300 mt-1">
          <span>Easy</span>
          <span>Medium</span>
          <span>Hard</span>
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={!imageFile || creating}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
          imageFile && !creating
            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white'
            : 'bg-white/10 text-white/40 cursor-not-allowed'
        }`}
      >
        {creating ? (
          <span className="flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin" />
            {progress || 'Creating Game...'}
          </span>
        ) : 'Create Game'}
      </button>
    </div>
  );
};

// =====================================================
// WAITING ROOM
// =====================================================

const WaitingRoom = ({ gameCode, multiplayerRef, onCancel, onGameStart }) => {
  const [copied, setCopied] = useState(false);
  const [opponentName, setOpponentName] = useState(null);
  const [players, setPlayers] = useState([]);

  // Setup callbacks for opponent joining
  useEffect(() => {
    if (!multiplayerRef.current) return;

    const gameHost = multiplayerRef.current;

    // Listen for opponent joining
    gameHost.onOpponentJoin = (name) => {
      setOpponentName(name);
      // Small delay to show the "joined" message before starting
      setTimeout(() => {
        onGameStart();
      }, 1500);
    };

    // Listen for presence updates
    gameHost.onPresenceUpdate = (playerList) => {
      setPlayers(playerList);
    };

    // Listen for game updates
    gameHost.onGameUpdate = (game) => {
      if (game.status === 'active' && game.player_b_id) {
        setOpponentName(game.player_b_name || 'Opponent');
        setTimeout(() => {
          onGameStart();
        }, 1500);
      }
    };

    return () => {
      gameHost.onOpponentJoin = null;
      gameHost.onPresenceUpdate = null;
      gameHost.onGameUpdate = null;
    };
  }, [multiplayerRef, onGameStart]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(gameCode || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      console.warn('Clipboard API not supported:', err);
      // Create a temporary input element for fallback
      const textArea = document.createElement('textarea');
      textArea.value = gameCode || '';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 border border-white/10">
        {opponentName ? (
          <>
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{opponentName} joined!</h2>
            <p className="text-purple-200 mb-6">Starting game...</p>
            <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">Waiting for Opponent...</h2>
            <p className="text-purple-200 mb-6">Share this code to start playing</p>

            <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 mb-6">
              <p className="text-white/80 text-sm mb-2">Game Code</p>
              <p className="text-5xl font-bold text-white tracking-wider font-mono">
                {gameCode || '------'}
              </p>
            </div>

            {/* Connected players indicator */}
            {players.length > 0 && (
              <div className="mb-4 text-purple-200 text-sm">
                <p>Connected: {players.map(p => p.user_name).join(', ')}</p>
              </div>
            )}

            <button
              onClick={handleCopy}
              className="w-full bg-white/10 hover:bg-white/20 rounded-xl py-3 text-white font-medium mb-4"
            >
              {copied ? '✓ Copied!' : 'Copy Code'}
            </button>

            <button onClick={onCancel} className="text-purple-400 hover:text-purple-300">
              Cancel Game
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// =====================================================
// JOIN GAME SCREEN
// =====================================================

const JoinGameScreen = ({ user, multiplayerRef, connectionManager, onGameJoined, onBack, setError }) => {
  const [gameCode, setGameCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [progress, setProgress] = useState('');

  const handleJoin = async () => {
    if (gameCode.length !== 6 || !user) return;
    
    setJoining(true);
    setProgress('Finding game...');
    
    try {
      // Create multiplayer guest instance
      const gameGuest = new MultiplayerGameGuest();
      multiplayerRef.current = gameGuest;

      setProgress('Joining game...');
      
      // Join the game using the multiplayer guest
      const result = await gameGuest.joinGame(gameCode);

      // Setup connection manager for reconnection
      connectionManager.setReconnectCallback(async () => {
        if (gameGuest.realtimeChannel) {
          await gameGuest.setupRealtimeChannel(result.gameId);
        }
      });
      connectionManager.updateStatus(CONNECTION_STATUS.CONNECTED);

      // Start lightweight heartbeat for connection monitoring
      connectionManager.startHeartbeat(
        createHeartbeatCheck(multiplayerRef),
        HEARTBEAT_CONFIG.INTERVAL
      );

      setProgress('Game joined!');
      
      onGameJoined({
        gameId: result.gameId,
        game: result.game,
        gameState: result.gameState
      });
    } catch (err) {
      console.error('Error joining game:', err);
      setError('Failed to join game: ' + (err.message || 'Game not found'));
      connectionManager.updateStatus(CONNECTION_STATUS.ERROR);
      
      // Cleanup on error
      if (multiplayerRef.current) {
        await multiplayerRef.current.disconnect();
        multiplayerRef.current = null;
      }
    } finally {
      setJoining(false);
      setProgress('');
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <button
        onClick={onBack}
        className="text-purple-400 hover:text-purple-300 mb-6 flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Join Game</h2>
        <p className="text-purple-200">Enter the 6-character game code</p>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
        <input
          type="text"
          value={gameCode}
          onChange={(e) => setGameCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="ABC123"
          maxLength={6}
          disabled={joining}
          className="w-full bg-white/5 border-2 border-white/20 focus:border-cyan-400 rounded-xl px-6 py-4 text-white text-center text-3xl font-mono font-bold uppercase tracking-wider focus:outline-none mb-4"
        />

        <button
          onClick={handleJoin}
          disabled={gameCode.length !== 6 || joining}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            gameCode.length === 6 && !joining
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          {joining ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              {progress || 'Joining...'}
            </span>
          ) : 'Join Game'}
        </button>
      </div>
    </div>
  );
};

// =====================================================
// GAMEPLAY SCREEN - INTEGRATED WITH GAME LOGIC
// =====================================================

const GameplayScreen = ({ isHost, multiplayerRef, onGameEnd, onExit, setError }) => {
  const [gameState, setGameState] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [awaitingDecision, setAwaitingDecision] = useState(null);
  const [lastAction, setLastAction] = useState(null);
  const [loading, setLoading] = useState(true);

  // Get player identifier
  const myPlayer = isHost ? 'playerA' : 'playerB';
  const opponentPlayer = isHost ? 'playerB' : 'playerA';

  // Initialize game state from multiplayer instance
  useEffect(() => {
    if (!multiplayerRef.current) return;

    const multiplayer = multiplayerRef.current;

    // Get initial game state
    if (multiplayer.gameLogic) {
      const initialState = multiplayer.gameLogic.getGameState();
      console.log('Initial game state:', {
        gridLength: initialState.grid?.length,
        playerARackLength: initialState.playerARack?.length,
        playerBRackLength: initialState.playerBRack?.length
      });
      setGameState(initialState);
      setLoading(false);
    }

    // Setup state update callback
    multiplayer.onStateUpdate = (newState) => {
      console.log('Game state updated:', {
        gridLength: newState.grid?.length,
        currentTurn: newState.currentTurn,
        timerRemaining: newState.timerRemaining
      });
      setGameState(newState);
      setLoading(false);
      
      // Check for game completion
      if (newState.isComplete) {
        const winner = newState.winner;
        if (winner === myPlayer) {
          onGameEnd('you');
        } else if (winner === opponentPlayer) {
          onGameEnd('opponent');
        } else {
          onGameEnd('tie');
        }
      }

      // Check for pending decisions
      if (newState.pendingCheck) {
        if (newState.currentTurn === opponentPlayer) {
          // Opponent just placed, we need to check/pass
          setAwaitingDecision('opponent_check');
        }
      } else {
        setAwaitingDecision(null);
      }
    };

    return () => {
      multiplayer.onStateUpdate = null;
    };
  }, [multiplayerRef, myPlayer, opponentPlayer, onGameEnd]);

  // Timer countdown effect
  useEffect(() => {
    if (!gameState || !multiplayerRef.current) return;
    
    const interval = setInterval(() => {
      if (multiplayerRef.current?.gameLogic) {
        multiplayerRef.current.gameLogic.timerRemaining -= 1;
        
        if (multiplayerRef.current.gameLogic.timerRemaining <= 0) {
          onGameEnd('timeout');
          clearInterval(interval);
          return;
        }
        
        setGameState(prev => ({
          ...prev,
          timerRemaining: multiplayerRef.current.gameLogic.timerRemaining
        }));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState, multiplayerRef, onGameEnd]);

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle piece selection
  const handlePieceSelect = (piece) => {
    if (!isMyTurn || awaitingDecision) return;
    setSelectedPiece(piece);
  };

  // Handle piece placement
  const handlePlacement = async (gridIndex) => {
    if (!selectedPiece || !multiplayerRef.current || !isMyTurn) return;

    try {
      const result = await multiplayerRef.current.makeMove(selectedPiece.id, gridIndex);
      setSelectedPiece(null);
      
      if (result.awaitingCheck) {
        setLastAction({ type: 'placed', correct: result.correct });
      }
    } catch (err) {
      console.error('Move error:', err);
      setError('Failed to place piece: ' + err.message);
    }
  };

  // Handle check/pass decision
  const handleCheckDecision = async (decision) => {
    if (!multiplayerRef.current) return;

    try {
      const result = await multiplayerRef.current.respondToCheck(decision);
      setLastAction({ 
        type: decision, 
        result: result.result,
        message: result.message 
      });
      setAwaitingDecision(null);
    } catch (err) {
      console.error('Check error:', err);
      setError('Failed to respond: ' + err.message);
    }
  };

  // Get game state values
  const myScore = gameState?.scores?.[myPlayer]?.score || 0;
  const opponentScore = gameState?.scores?.[opponentPlayer]?.score || 0;
  const myStreak = gameState?.scores?.[myPlayer]?.streak || 0;
  const myAccuracy = gameState?.scores?.[myPlayer]?.accuracy || 100;
  const isMyTurn = gameState?.currentTurn === myPlayer && !awaitingDecision;
  const myRack = isHost ? (gameState?.playerARack || []) : (gameState?.playerBRack || []);
  const grid = gameState?.grid || [];
  
  // Calculate grid size with proper fallback
  const calculateGridSize = () => {
    if (!grid || grid.length === 0) return 10;
    const size = Math.sqrt(grid.length);
    return Number.isInteger(size) && size > 0 ? size : 10;
  };
  const gridSize = calculateGridSize();
  
  // Get timer from game state (synced from database)
  const timer = gameState?.timerRemaining || 600;

  // Show loading state while game initializes
  if (loading || !gameState) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 text-center">
          <RefreshCw className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-purple-200">Loading game...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Game Header */}
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 mb-6 flex items-center justify-between">
        <div className={`flex-1 ${isMyTurn ? 'ring-2 ring-yellow-400 rounded-lg p-2' : 'opacity-70 p-2'}`}>
          <p className="text-white font-bold">You {isHost ? '(Host)' : '(Guest)'}</p>
          <p className="text-purple-300">Score: {myScore}</p>
          <p className="text-purple-400 text-sm">Streak: {myStreak} | Accuracy: {myAccuracy}%</p>
        </div>
        
        <div className="text-center px-4">
          <p className="text-2xl font-mono font-bold text-white">{formatTime(timer)}</p>
          {isMyTurn ? (
            <p className="text-yellow-400 font-bold animate-pulse">Your Turn</p>
          ) : (
            <p className="text-cyan-400">Opponent&apos;s Turn</p>
          )}
        </div>
        
        <div className={`flex-1 text-right ${!isMyTurn && !awaitingDecision ? 'ring-2 ring-cyan-400 rounded-lg p-2' : 'opacity-70 p-2'}`}>
          <p className="text-white font-bold">Opponent</p>
          <p className="text-purple-300">Score: {opponentScore}</p>
        </div>
      </div>

      {/* Last Action Feedback */}
      {lastAction && (
        <div className={`mb-4 p-3 rounded-xl text-center ${
          lastAction.result === 'correct_placement' || lastAction.result === 'successful_check' 
            ? 'bg-green-500/20 text-green-300' 
            : lastAction.result === 'failed_check' 
              ? 'bg-red-500/20 text-red-300'
              : 'bg-purple-500/20 text-purple-300'
        }`}>
          {lastAction.message}
        </div>
      )}

      {/* Check/Pass Decision UI */}
      {awaitingDecision && (
        <div className="mb-6 bg-yellow-500/20 rounded-xl p-6 border border-yellow-500/30">
          <h3 className="text-xl font-bold text-white mb-4 text-center">
            Opponent placed a piece! What do you want to do?
          </h3>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => handleCheckDecision('check')}
              className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold rounded-xl transition-all"
            >
              Check (+5 if wrong)
            </button>
            <button
              onClick={() => handleCheckDecision('pass')}
              className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-bold rounded-xl transition-all"
            >
              Pass (Skip)
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Puzzle Grid */}
        <div className="lg:col-span-2">
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10">
            <h3 className="text-white font-semibold mb-4">Puzzle Board</h3>
            <div 
              className="grid gap-1 aspect-square"
              style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
            >
              {grid.map((piece, index) => (
                <button
                  key={index}
                  onClick={() => handlePlacement(index)}
                  disabled={! selectedPiece || piece !== null || ! isMyTurn}
                  className={`aspect-square rounded border transition-all ${
                    piece 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 border-white/40' 
                      : selectedPiece && isMyTurn
                        ? 'bg-white/10 border-cyan-400 hover:bg-cyan-500/20 cursor-pointer'
                        : 'bg-white/5 border-white/10'
                  }`}
                >
                  {piece && piece.imageData && (
                    <img 
                      src={piece.imageData} 
                      alt={`Piece ${piece.id}`}
                      className="w-full h-full object-cover rounded"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Player Rack and Actions */}
        <div className="space-y-4">
          {/* Your Rack */}
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10">
            <h3 className="text-white font-semibold mb-4">
              Your Pieces ({myRack.filter(p => p !== null).length})
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {myRack.map((piece, index) => (
                piece && (
                  <button
                    key={index}
                    onClick={() => handlePieceSelect(piece)}
                    disabled={!isMyTurn}
                    className={`aspect-square rounded-lg border-2 transition-all ${
                      selectedPiece?.id === piece.id
                        ? 'border-yellow-400 ring-2 ring-yellow-400 scale-110'
                        : isMyTurn 
                          ? 'border-white/20 hover:border-cyan-400 cursor-pointer'
                          : 'border-white/10 opacity-50'
                    }`}
                  >
                    {piece.imageData ? (
                      <img 
                        src={piece.imageData} 
                        alt={`Piece ${piece.id}`}
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500/50 to-pink-500/50 rounded flex items-center justify-center text-white text-xs">
                        {piece.id}
                      </div>
                    )}
                  </button>
                )
              ))}
            </div>
            {selectedPiece && (
              <p className="text-cyan-400 text-sm mt-3 text-center">
                Click on the grid to place the selected piece
              </p>
            )}
          </div>

          {/* Game Stats */}
          <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10">
            <h3 className="text-white font-semibold mb-4">Game Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-purple-300">Pieces Placed</span>
                <span className="text-white">{grid.filter(p => p !== null).length}/{grid.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-300">Pieces Remaining</span>
                <span className="text-white">{gameState?.piecePoolCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-300">Your Streak</span>
                <span className="text-white">{myStreak}</span>
              </div>
            </div>
          </div>

          {/* Exit Button */}
          <button
            onClick={onExit}
            className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl py-3 font-medium transition-colors"
          >
            Exit Game
          </button>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// GAME OVER SCREEN
// =====================================================

const GameOverScreen = ({ winner, gameData, onPlayAgain }) => {
  const isWinner = winner === 'you';
  const isTie = winner === 'tie';
  const isTimeout = winner === 'timeout';

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 border border-white/10">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
          isWinner ? 'bg-yellow-500/20' : isTie ? 'bg-purple-500/20' : 'bg-gray-500/20'
        }`}>
          <Trophy className={`w-12 h-12 ${
            isWinner ? 'text-yellow-400' : isTie ? 'text-purple-400' : 'text-gray-400'
          }`} />
        </div>

        <h2 className="text-4xl font-bold text-white mb-4">
          {isTimeout ? '⏰ Time Up!' : isWinner ? '🎉 You Win!' : isTie ? '🤝 It\'s a Tie!' : 'Game Over'}
        </h2>
        
        <p className="text-purple-200 mb-8">
          {isTimeout 
            ? 'The game has ended due to time limit.' 
            : isWinner 
              ? 'Congratulations on your victory!' 
              : isTie 
                ? 'Great game! You both played equally well.' 
                : 'Better luck next time!'}
        </p>

        {gameData?.game && (
          <div className="bg-white/5 rounded-xl p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">Final Scores</h3>
            <div className="flex justify-around">
              <div>
                <p className="text-purple-300 text-sm">{gameData.game.player_a_name || 'Player A'}</p>
                <p className="text-2xl font-bold text-white">{gameData.game.player_a_score || 0}</p>
              </div>
              <div className="text-purple-400 self-center">VS</div>
              <div>
                <p className="text-purple-300 text-sm">{gameData.game.player_b_name || 'Player B'}</p>
                <p className="text-2xl font-bold text-white">{gameData.game.player_b_score || 0}</p>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onPlayAgain}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white py-4 rounded-xl font-bold text-lg transition-all"
        >
          Play Again
        </button>
      </div>
    </div>
  );
};

export default JigsawVerseApp;
