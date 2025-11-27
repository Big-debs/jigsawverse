import React, { useState, useEffect } from 'react';
import { Users, Gamepad2, Trophy, LogOut, Play, UserPlus, RefreshCw } from 'lucide-react';

// =====================================================
// MOCK SERVICES (Replace with actual Supabase integration)
// =====================================================

const mockSupabase = {
  auth: {
    getUser: async () => ({ 
      data: { 
        user: { 
          id: 'user-' + Math.random().toString(36).substr(2, 9),
          user_metadata: { username: 'Player' + Math.floor(Math.random() * 1000) }
        }
      }
    }),
    signOut: async () => {}
  }
};

const mockGameService = {
  createGame: async (userId, settings) => ({
    id: 'game-' + Math.random().toString(36).substr(2, 9),
    game_code: Math.random().toString(36).substr(2, 6).toUpperCase(),
    status: 'waiting',
    ...settings
  }),
  getGameByCode: async (code) => ({
    id: 'game-' + Math.random().toString(36).substr(2, 9),
    game_code: code,
    status: 'waiting'
  }),
  joinGame: async (code, userId, userName) => ({ success: true })
};

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

  useEffect(() => {
    // Initialize user
    mockSupabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  // Navigation handlers
  const navigate = (route, data = null) => {
    setCurrentRoute(route);
    if (data) setGameData(data);
  };

  const handleLogout = async () => {
    await mockSupabase.auth.signOut();
    setUser(null);
    setCurrentRoute(ROUTES.HOME);
  };

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
            onGameCreated={(data) => {
              setGameData(data);
              navigate(ROUTES.WAITING_ROOM, data);
            }}
            onBack={() => navigate(ROUTES.HOME)}
          />
        )}
        
        {currentRoute === ROUTES.WAITING_ROOM && (
          <WaitingRoom 
            gameCode={gameData?.gameCode}
            onCancel={() => navigate(ROUTES.HOME)}
            onGameStart={() => navigate(ROUTES.GAMEPLAY)}
          />
        )}
        
        {currentRoute === ROUTES.JOIN_GAME && (
          <JoinGameScreen 
            onGameJoined={(data) => {
              setGameData(data);
              navigate(ROUTES.GAMEPLAY, data);
            }}
            onBack={() => navigate(ROUTES.HOME)}
          />
        )}
        
        {currentRoute === ROUTES.GAMEPLAY && (
          <GameplayScreen 
            gameData={gameData}
            isHost={isHost}
            onGameEnd={(winner) => {
              navigate(ROUTES.GAME_OVER, { winner });
            }}
            onExit={() => navigate(ROUTES.HOME)}
          />
        )}
        
        {currentRoute === ROUTES.GAME_OVER && (
          <GameOverScreen 
            winner={gameData?.winner}
            onPlayAgain={() => navigate(ROUTES.HOME)}
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
            Enter a game code to join your friend's puzzle challenge
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

const CreateGameScreen = ({ onGameCreated, onBack }) => {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [gridSize, setGridSize] = useState(10);
  const [creating, setCreating] = useState(false);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleCreate = async () => {
    if (!imageFile) return;
    
    setCreating(true);
    
    // Simulate game creation
    setTimeout(async () => {
      const user = await mockSupabase.auth.getUser();
      const game = await mockGameService.createGame(user.data.user.id, {
        gridSize,
        imageUrl: imagePreview
      });
      
      onGameCreated({
        gameId: game.id,
        gameCode: game.game_code,
        game
      });
    }, 2000);
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
        {creating ? 'Creating Game...' : 'Create Game'}
      </button>
    </div>
  );
};

// =====================================================
// WAITING ROOM
// =====================================================

const WaitingRoom = ({ gameCode, onCancel, onGameStart }) => {
  const [copied, setCopied] = useState(false);

  // Simulate opponent joining after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onGameStart();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onGameStart]);

  const handleCopy = () => {
    navigator.clipboard.writeText(gameCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 border border-white/10">
        <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-cyan-400 animate-pulse" />
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-2">Waiting for Opponent...</h2>
        <p className="text-purple-200 mb-6">Share this code to start playing</p>

        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 mb-6">
          <p className="text-white/80 text-sm mb-2">Game Code</p>
          <p className="text-5xl font-bold text-white tracking-wider font-mono">
            {gameCode}
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="w-full bg-white/10 hover:bg-white/20 rounded-xl py-3 text-white font-medium mb-4"
        >
          {copied ? '✓ Copied!' : 'Copy Code'}
        </button>

        <button onClick={onCancel} className="text-purple-400 hover:text-purple-300">
          Cancel Game
        </button>
      </div>
    </div>
  );
};

// =====================================================
// JOIN GAME SCREEN
// =====================================================

const JoinGameScreen = ({ onGameJoined, onBack }) => {
  const [gameCode, setGameCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    if (gameCode.length !== 6) return;
    
    setJoining(true);
    
    setTimeout(async () => {
      const game = await mockGameService.getGameByCode(gameCode);
      onGameJoined({ gameId: game.id, game });
    }, 1500);
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
          {joining ? 'Joining...' : 'Join Game'}
        </button>
      </div>
    </div>
  );
};

// =====================================================
// GAMEPLAY SCREEN (Simplified Demo)
// =====================================================

const GameplayScreen = ({ gameData, isHost, onGameEnd, onExit }) => {
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [isMyTurn, setIsMyTurn] = useState(isHost);

  // Simulate game progression
  useEffect(() => {
    const timer = setInterval(() => {
      setMoves(m => m + 1);
      if (isMyTurn) {
        setMyScore(s => s + Math.floor(Math.random() * 10));
      } else {
        setOpponentScore(s => s + Math.floor(Math.random() * 10));
      }
      setIsMyTurn(t => !t);

      // End game after 10 moves
      if (moves >= 10) {
        onGameEnd(myScore > opponentScore ? 'you' : 'opponent');
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [moves, isMyTurn, myScore, opponentScore, onGameEnd]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Game Header */}
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 mb-6 flex items-center justify-between">
        <div className={`flex-1 ${isMyTurn ? 'opacity-100' : 'opacity-50'}`}>
          <p className="text-white font-bold">You</p>
          <p className="text-purple-300">Score: {myScore}</p>
        </div>
        
        <div className="text-center">
          {isMyTurn ? (
            <p className="text-yellow-400 font-bold animate-pulse">Your Turn</p>
          ) : (
            <p className="text-cyan-400">Opponent's Turn</p>
          )}
          <p className="text-purple-200 text-sm">Move {moves}/10</p>
        </div>
        
        <div className={`flex-1 text-right ${!isMyTurn ? 'opacity-100' : 'opacity-50'}`}>
          <p className="text-white font-bold">Opponent</p>
          <p className="text-purple-300">Score: {opponentScore}</p>
        </div>
      </div>

      {/* Simulated Game Board */}
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 mb-6 border border-white/10">
        <div className="aspect-square bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-xl flex items-center justify-center">
          <div className="text-center">
            <Gamepad2 className="w-16 h-16 text-white/50 mx-auto mb-4" />
            <p className="text-white/70">Game in Progress...</p>
            <p className="text-purple-300 text-sm mt-2">
              This is a demo - integrate with actual game logic
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={onExit}
        className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl py-3 font-medium transition-colors"
      >
        Exit Game
      </button>
    </div>
  );
};

// =====================================================
// GAME OVER SCREEN
// =====================================================

const GameOverScreen = ({ winner, onPlayAgain }) => {
  const isWinner = winner === 'you';

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 border border-white/10">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
          isWinner ? 'bg-yellow-500/20' : 'bg-gray-500/20'
        }`}>
          <Trophy className={`w-12 h-12 ${isWinner ? 'text-yellow-400' : 'text-gray-400'}`} />
        </div>

        <h2 className="text-4xl font-bold text-white mb-4">
          {isWinner ? '🎉 You Win!' : 'Game Over'}
        </h2>
        
        <p className="text-purple-200 mb-8">
          {isWinner ? 'Congratulations on your victory!' : 'Better luck next time!'}
        </p>

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