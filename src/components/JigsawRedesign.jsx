import { useState, useEffect } from 'react';
import { Upload, Users, User, Play, ChevronRight, Image, Eye, Shuffle, RotateCcw, Maximize2, Check, X, Zap, Mail, Lock, LogIn, UserPlus } from 'lucide-react';
import { authService } from '../services/auth.service';

const JigsawRedesign = () => {
  const [currentScreen, setCurrentScreen] = useState('welcome');
  const [selectedImage, setSelectedImage] = useState(null);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [isLogin, setIsLogin] = useState(true);
  const [gameState, setGameState] = useState({
    playerA: { score: 0, accuracy: 100, streak: 0, pieces: 0, turn: true, name: 'Player Alpha' },
    playerB: { score: 0, accuracy: 100, streak: 0, pieces: 0, turn: false, name: 'Player Beta' },
    timer: 600,
    grid: Array(100).fill(null),
    rack: Array(10).fill(null).map((_, i) => ({ id: i, placed: false })),
    selectedPiece: null,
    showAnimation: null
  });

  useEffect(() => {
    if (currentScreen === 'welcome') {
      const timer = setTimeout(() => {
        // Welcome screen auto-advance
        setCurrentScreen('login');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen === 'gameplay') {
      const interval = setInterval(() => {
        setGameState(prev => ({
          ...prev,
          timer: Math.max(0, prev.timer - 1)
        }));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [currentScreen]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
  };

  const handlePlacePiece = (gridIndex) => {
    if (!gameState.selectedPiece) return;
    
    const newGrid = [...gameState.grid];
    newGrid[gridIndex] = gameState.selectedPiece;
    
    const newRack = gameState.rack.map(p => 
      p.id === gameState.selectedPiece.id ? { ...p, placed: true } : p
    );

    const isCorrect = Math.random() > 0.3;
    
    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      rack: newRack,
      selectedPiece: null,
      showAnimation: isCorrect ? 'correct' : 'incorrect',
      playerA: prev.playerA.turn ? {
        ...prev.playerA,
        score: isCorrect ? prev.playerA.score + 10 : prev.playerA.score,
        streak: isCorrect ? prev.playerA.streak + 1 : 0,
        pieces: prev.playerA.pieces + 1,
        turn: false
      } : { ...prev.playerA, turn: true },
      playerB: prev.playerB.turn ? {
        ...prev.playerB,
        score: isCorrect ? prev.playerB.score + 10 : prev.playerB.score,
        streak: isCorrect ? prev.playerB.streak + 1 : 0,
        pieces: prev.playerB.pieces + 1,
        turn: false
      } : { ...prev.playerB, turn: true }
    }));

    setTimeout(() => {
      setGameState(prev => ({ ...prev, showAnimation: null }));
    }, 1500);
  };

  const handleAuth = () => {
    if (loginData.username) {
      setGameState(prev => ({
        ...prev,
        playerA: { ...prev.playerA, name: loginData.username }
      }));
      setCurrentScreen('home');
    }
  };

  const WelcomeScreen = () => (
    <div 
      onClick={() => setCurrentScreen('login')}
      className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center overflow-hidden relative cursor-pointer"
    >
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-white rounded-full animate-pulse"
            style={{
              width: Math.random() * 3 + 'px',
              height: Math.random() * 3 + 'px',
              top: Math.random() * 100 + '%',
              left: Math.random() * 100 + '%',
              opacity: Math.random() * 0.7 + 0.3
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center px-4">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white mb-4">
          JIGSAW<span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-pink-400">verse</span>
        </h1>
        
        <p className="text-xl sm:text-2xl text-blue-200 mb-8">
          Where Puzzles Meet Strategy
        </p>

        <button className="bg-gradient-to-r from-yellow-500 via-orange-500 to-pink-500 hover:from-yellow-400 hover:to-pink-400 text-white px-8 py-4 rounded-full font-bold text-lg shadow-2xl transition-all transform hover:scale-105 flex items-center gap-3 mx-auto">
          <span>Click to Enter</span>
          <ChevronRight className="w-6 h-6" />
        </button>

        <p className="text-blue-300 text-sm mt-4 animate-pulse">Click anywhere to continue</p>
      </div>
    </div>
  );

  const LoginScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2">
            JIGSAW<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">verse</span>
          </h2>
          <p className="text-purple-200">Welcome back! Let&apos;s play.</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                isLogin
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                  : 'bg-white/5 text-purple-300 hover:bg-white/10'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                !isLogin
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                  : 'bg-white/5 text-purple-300 hover:bg-white/10'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                {isLogin ? 'Username or Email' : 'Choose Username'}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
                <input
                  type="text"
                  value={loginData.username}
                  onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                  placeholder="Enter your username"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-purple-200 text-sm font-medium mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
                <input
                  type="password"
                  value={loginData.password}
                  onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                  placeholder="Enter your password"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              onClick={handleAuth}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg hover:shadow-purple-500/50 flex items-center justify-center gap-2"
            >
              {isLogin ? (
                <>
                  <LogIn className="w-5 h-5" />
                  Login &amp; Play
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  Create Account
                </>
              )}
            </button>
          </div>

         <div className="mt-6 text-center">
  <button
    onClick={async () => {
      try {
        await authService.signInAnonymously();
        setCurrentScreen('home');
      } catch (error) {
        console. error('Guest sign-in failed:', error);
        // Still allow navigation but log the error
        setCurrentScreen('home');
      }
    }}
    className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
  >
    Continue as Guest →
  </button>
</div>
      </div>
    </div>
  );

  const HomeScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      <header className="p-4 sm:p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">JIGSAWverse</h1>
          <p className="text-purple-300 text-xs sm:text-sm">Classic Mode</p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
              Choose Your Adventure
            </h2>
            <p className="text-purple-200 text-base sm:text-lg">
              Solve puzzles solo or challenge friends
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-8">
            <div 
              onClick={() => setCurrentScreen('setup')}
              className="group bg-gradient-to-br from-yellow-500 to-orange-600 rounded-2xl sm:rounded-3xl p-6 sm:p-8 cursor-pointer transform hover:scale-105 transition-all duration-300 shadow-2xl hover:shadow-yellow-500/50"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <User className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <ChevronRight className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Single Player</h3>
              <p className="text-white/90 text-sm sm:text-base">Play against AI and sharpen your skills</p>
            </div>

            <div 
              onClick={() => setCurrentScreen('multiplayer')}
              className="group bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl sm:rounded-3xl p-6 sm:p-8 cursor-pointer transform hover:scale-105 transition-all duration-300 shadow-2xl hover:shadow-cyan-500/50"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 p-3 rounded-xl">
                  <Users className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                </div>
                <ChevronRight className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">Multiplayer</h3>
              <p className="text-white/90 text-sm sm:text-base">Challenge friends in real-time battles</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4 bg-white/5 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-white/10">
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-white mb-1">0</div>
              <div className="text-purple-300 text-xs sm:text-sm">Games Played</div>
            </div>
            <div className="text-center border-x border-white/10">
              <div className="text-xl sm:text-2xl font-bold text-white mb-1">0%</div>
              <div className="text-purple-300 text-xs sm:text-sm">Win Rate</div>
            </div>
            <div className="text-center">
              <div className="text-xl sm:text-2xl font-bold text-white mb-1">0</div>
              <div className="text-purple-300 text-xs sm:text-sm">Best Streak</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  const MultiplayerScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      <header className="p-4 sm:p-6 flex items-center justify-between border-b border-white/10">
        <button 
          onClick={() => setCurrentScreen('home')}
          className="text-purple-300 hover:text-white transition-colors text-sm sm:text-base"
        >
          ← Back
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-block p-4 bg-cyan-500/20 rounded-2xl mb-4">
              <Users className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-400" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Multiplayer Lobby</h2>
            <p className="text-purple-200 text-sm sm:text-base">
              Create a new game or join an existing one
            </p>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => setCurrentScreen('setup')}
              className="w-full group bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl sm:rounded-2xl p-6 sm:p-8 transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 p-3 rounded-xl">
                    <Play className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-1">Create New Game</h3>
                    <p className="text-cyan-100 text-sm sm:text-base">Host a game and invite friends</p>
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" />
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  const SetupScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      <header className="p-4 sm:p-6 flex items-center justify-between border-b border-white/10">
        <button 
          onClick={() => setCurrentScreen('home')}
          className="text-purple-300 hover:text-white transition-colors text-sm sm:text-base"
        >
          ← Back
        </button>
        <div className="text-right">
          <div className="text-white font-semibold text-sm sm:text-base">Game Setup</div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Choose Your Puzzle</h2>
            <p className="text-purple-200 text-sm sm:text-base">Select an image or upload your own</p>
          </div>

          <div className="bg-white/5 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-white/10 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    selectedImage === i
                      ? 'border-cyan-400 shadow-lg shadow-cyan-500/50 scale-105'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  <div className="w-full h-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                    <Image className="w-8 h-8 sm:w-10 sm:h-10 text-white/60" />
                  </div>
                </button>
              ))}
            </div>

            <button className="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl py-3 sm:py-4 font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
              <Upload className="w-5 h-5" />
              <span className="text-sm sm:text-base">Upload Your Image</span>
            </button>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-white/10 p-4 sm:p-6">
        <div className="max-w-3xl mx-auto">
          <button 
            onClick={() => setCurrentScreen('gameplay')}
            disabled={!selectedImage}
            className={`w-full rounded-xl py-3 sm:py-4 font-bold text-base sm:text-lg transition-all ${
              selectedImage
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
            }`}
          >
            Create Game
          </button>
        </div>
      </div>
    </div>
  );

  const GameplayScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      <header className="bg-slate-900/80 backdrop-blur-lg border-b border-white/10 p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex-1 bg-white/5 border-2 border-white/10 rounded-xl p-2 sm:p-3">
            <div className="text-white font-bold text-xs truncate">{gameState.playerA.name}</div>
            <div className="text-white font-bold text-lg">{gameState.playerA.score}</div>
          </div>

          <div className="bg-white/5 rounded-xl px-3 py-2 text-center">
            <div className="text-white font-mono font-bold text-lg">{formatTime(gameState.timer)}</div>
          </div>

          <div className="flex-1 bg-white/5 border-2 border-white/10 rounded-xl p-2 sm:p-3">
            <div className="text-white font-bold text-xs truncate">{gameState.playerB.name}</div>
            <div className="text-white font-bold text-lg">{gameState.playerB.score}</div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-4 p-3 sm:p-4">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold text-sm sm:text-base">Puzzle Board</h3>
            <div className="flex gap-2">
              <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                <Maximize2 className="w-4 h-4 text-purple-300" />
              </button>
              <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                <Eye className="w-4 h-4 text-purple-300" />
              </button>
            </div>
          </div>
          
          <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/20 rounded-xl p-2 sm:p-4 overflow-auto">
            <div className="grid grid-cols-10 gap-0.5 sm:gap-1 max-w-2xl mx-auto aspect-square">
              {gameState.grid.map((piece, idx) => (
                <button
                  key={idx}
                  onClick={() => handlePlacePiece(idx)}
                  className={`relative aspect-square rounded border-2 transition-all duration-300 ${
                    piece 
                      ? 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 border-white/40' 
                      : 'bg-white/5 border-white/10 hover:border-purple-400/50 hover:bg-white/10'
                  } ${gameState.selectedPiece ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {piece && (
                    <div className="absolute inset-0 flex items-center justify-center text-white/40 text-xs">
                      {piece.id}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:w-80 flex flex-col gap-4">
          <div className="bg-white/5 backdrop-blur-md border border-white/20 rounded-xl p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm">Your Rack</h3>
              <span className="text-purple-300 text-xs">{gameState.rack.filter(p => !p.placed).length}/10</span>
            </div>
            
            <div className="grid grid-cols-5 gap-2">
              {gameState.rack.filter(p => !p.placed).map((piece) => (
                <button
                  key={piece.id}
                  onClick={() => setGameState(prev => ({ ...prev, selectedPiece: piece }))}
                  className={`aspect-square rounded-lg border-2 transition-all duration-300 ${
                    gameState.selectedPiece?.id === piece.id
                      ? 'border-yellow-400 bg-gradient-to-br from-yellow-500 to-orange-500 scale-110 shadow-lg shadow-yellow-500/50'
                      : 'border-white/20 bg-gradient-to-br from-purple-500/50 to-pink-500/50 hover:border-white/40 hover:scale-105'
                  }`}
                >
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-xs">
                    {piece.id}
                  </div>
                </button>
              ))}
            </div>

            <button className="w-full mt-3 bg-purple-600 hover:bg-purple-500 rounded-lg py-2 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
              <Shuffle className="w-4 h-4" />
              Shuffle Rack
            </button>
          </div>

          <div className="bg-white/5 backdrop-blur-md border border-white/20 rounded-xl p-3 sm:p-4">
            <h3 className="text-white font-semibold text-sm mb-3">Actions</h3>
            
            <div className="space-y-2">
              <button className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg py-3 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
                <Check className="w-5 h-5" />
                Check Placement
              </button>
              
              <button className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 rounded-lg py-3 text-white font-medium transition-all flex items-center justify-center gap-2 shadow-lg">
                <X className="w-5 h-5" />
                Pass Turn
              </button>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md border border-white/20 rounded-xl p-3 sm:p-4">
            <h3 className="text-white font-semibold text-sm mb-3">Match Stats</h3>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-purple-300">Total Moves</span>
                <span className="text-white font-semibold">{gameState.playerA.pieces + gameState.playerB.pieces}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-300">Board Complete</span>
                <span className="text-white font-semibold">{gameState.grid.filter(p => p).length}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-300">Time Remaining</span>
                <span className="text-white font-semibold">{formatTime(gameState.timer)}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {gameState.showAnimation && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className={`animate-bounce ${gameState.showAnimation === 'correct' ? 'animate-ping' : ''}`}>
            {gameState.showAnimation === 'correct' ? (
              <div className="bg-green-500 rounded-full p-8 shadow-2xl shadow-green-500/50">
                <Check className="w-20 h-20 text-white animate-pulse" />
              </div>
            ) : (
              <div className="bg-red-500 rounded-full p-8 shadow-2xl shadow-red-500/50">
                <X className="w-20 h-20 text-white animate-pulse" />
              </div>
            )}
          </div>
        </div>
      )}

      {(gameState.playerA.streak > 2 || gameState.playerB.streak > 2) && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-yellow-500 to-orange-500 px-6 py-3 rounded-full shadow-2xl shadow-yellow-500/50 animate-bounce z-40">
          <div className="flex items-center gap-2 text-white font-bold">
            <Zap className="w-5 h-5 animate-pulse" />
            <span>{Math.max(gameState.playerA.streak, gameState.playerB.streak)}x STREAK!</span>
            <Zap className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      )}

      <div className="bg-slate-900/95 backdrop-blur-lg border-t border-white/10 p-3 sm:p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <button 
            onClick={() => setCurrentScreen('home')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
          >
            Exit Game
          </button>
          
          <div className="flex gap-2">
            <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
              <RotateCcw className="w-5 h-5 text-purple-300" />
            </button>
            <button className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white text-sm font-medium transition-colors">
              Forfeit
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const screens = {
    welcome: <WelcomeScreen />,
    login: <LoginScreen />,
    home: <HomeScreen />,
    multiplayer: <MultiplayerScreen />,
    setup: <SetupScreen />,
    gameplay: <GameplayScreen />
  };

  return screens[currentScreen];
};

export default JigsawRedesign;
