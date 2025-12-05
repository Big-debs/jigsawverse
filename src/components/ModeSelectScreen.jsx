import { ArrowLeft, Lock } from 'lucide-react';
import { GAME_MODES } from '../lib/gameModes';

const ModeSelectScreen = ({ onModeSelect, onBack, multiplayerOnly = true }) => {
  const allModes = Object.values(GAME_MODES).filter(mode => {
    if (multiplayerOnly && !mode.multiplayer) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-purple-300 hover:text-purple-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <h2 className="text-3xl font-bold text-white">Select Game Mode</h2>
        <div className="w-20"></div> {/* Spacer for centering */}
      </div>

      {/* Mode Cards Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allModes.map((mode) => {
          const isAvailable = mode.available;
          const isComingSoon = mode.comingSoon;

          return (
            <button
              key={mode.id}
              onClick={() => isAvailable && onModeSelect(mode.id)}
              disabled={!isAvailable}
              className={`
                relative group rounded-2xl p-6 text-left transition-all transform
                ${isAvailable 
                  ? 'bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 hover:scale-105 shadow-2xl cursor-pointer' 
                  : 'bg-gray-700/50 cursor-not-allowed opacity-60'
                }
              `}
            >
              {/* Coming Soon Badge */}
              {isComingSoon && (
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-yellow-500/20 text-yellow-300 px-3 py-1 rounded-full text-xs font-semibold">
                  <Lock className="w-3 h-3" />
                  Coming Soon
                </div>
              )}

              {/* Icon */}
              <div className="text-5xl mb-4">{mode.icon}</div>

              {/* Mode Name */}
              <h3 className="text-2xl font-bold text-white mb-2">{mode.name}</h3>

              {/* Description */}
              <p className={`text-sm mb-4 ${isAvailable ? 'text-purple-100' : 'text-gray-400'}`}>
                {mode.description}
              </p>

              {/* Features */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${isAvailable ? 'bg-white/20 text-white' : 'bg-gray-600 text-gray-300'}`}>
                    {mode.features.turnsPerRound === Infinity ? '∞' : mode.features.turnsPerRound} Turn{mode.features.turnsPerRound !== 1 ? 's' : ''}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${isAvailable ? 'bg-white/20 text-white' : 'bg-gray-600 text-gray-300'}`}>
                    {mode.features.checksPerTurn === 0 ? 'No Checks' : `${mode.features.checksPerTurn} Check${mode.features.checksPerTurn !== 1 ? 's' : ''}`}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${isAvailable ? 'bg-white/20 text-white' : 'bg-gray-600 text-gray-300'}`}>
                    {mode.multiplayer ? 'Multiplayer' : 'Solo'}
                  </span>
                </div>
              </div>

              {/* Select Indicator */}
              {isAvailable && (
                <div className="mt-4 flex items-center text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>Select Mode</span>
                  <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="mt-8 bg-purple-900/30 backdrop-blur-md rounded-xl p-6 border border-purple-500/30">
        <h4 className="text-white font-semibold mb-2">About Game Modes</h4>
        <p className="text-purple-200 text-sm leading-relaxed">
          Each mode offers unique gameplay mechanics and scoring systems. Classic Mode is perfect for beginners, 
          while Super and Sage modes add complexity with additional turns and checks. Choose a mode that matches 
          your preferred play style and challenge level.
        </p>
      </div>
    </div>
  );
};

export default ModeSelectScreen;
