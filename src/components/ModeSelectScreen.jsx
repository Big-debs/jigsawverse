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
      <div className="flex items-center justify-between mb-4 sm:mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 sm:gap-2 text-purple-300 hover:text-purple-200 transition-colors touch-target"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-sm sm:text-base">Back</span>
        </button>
        <h2 className="text-xl sm:text-3xl font-bold text-white">Select Game Mode</h2>
        <div className="w-12 sm:w-20"></div> {/* Spacer for centering */}
      </div>

      {/* Mode Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        {allModes.map((mode) => {
          const isAvailable = mode.available;
          const isComingSoon = mode.comingSoon;

          return (
            <button
              key={mode.id}
              onClick={() => isAvailable && onModeSelect(mode.id)}
              disabled={!isAvailable}
              className={`
                relative group rounded-2xl p-4 sm:p-6 text-left transition-all transform
                ${isAvailable
                  ? 'bg-gradient-to-br from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 hover:scale-[1.02] sm:hover:scale-105 shadow-2xl cursor-pointer active:scale-[0.98]'
                  : 'bg-gray-700/50 cursor-not-allowed opacity-60'
                }
              `}
            >
              {/* Coming Soon Badge */}
              {isComingSoon && (
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1.5 sm:gap-2 bg-yellow-500/20 text-yellow-300 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold">
                  <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  Coming Soon
                </div>
              )}

              {/* Icon */}
              <div className="text-3xl sm:text-5xl mb-2 sm:mb-4">{mode.icon}</div>

              {/* Mode Name */}
              <h3 className="text-lg sm:text-2xl font-bold text-white mb-1 sm:mb-2">{mode.name}</h3>

              {/* Description */}
              <p className={`text-xs sm:text-sm mb-3 sm:mb-4 ${isAvailable ? 'text-purple-100' : 'text-gray-400'}`}>
                {mode.description}
              </p>

              {/* Features */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${isAvailable ? 'bg-white/20 text-white' : 'bg-gray-600 text-gray-300'}`}>
                    {mode.features.turnsPerRound === Infinity ? '∞' : mode.features.turnsPerRound} Turn{mode.features.turnsPerRound !== 1 ? 's' : ''}
                  </span>
                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${isAvailable ? 'bg-white/20 text-white' : 'bg-gray-600 text-gray-300'}`}>
                    {mode.features.checksPerTurn === 0 ? 'No Checks' : `${mode.features.checksPerTurn} Check${mode.features.checksPerTurn !== 1 ? 's' : ''}`}
                  </span>
                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${isAvailable ? 'bg-white/20 text-white' : 'bg-gray-600 text-gray-300'}`}>
                    {mode.multiplayer ? 'Multiplayer' : 'Solo'}
                  </span>
                </div>
              </div>

              {/* Select Indicator */}
              {isAvailable && (
                <div className="mt-3 sm:mt-4 flex items-center text-white font-medium opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-sm">
                  <span>Select Mode</span>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="mt-4 sm:mt-8 bg-purple-900/30 backdrop-blur-md rounded-xl p-4 sm:p-6 border border-purple-500/30">
        <h4 className="text-white font-semibold mb-1 sm:mb-2 text-sm sm:text-base">About Game Modes</h4>
        <p className="text-purple-200 text-xs sm:text-sm leading-relaxed">
          Each mode offers unique gameplay mechanics and scoring systems. Classic Mode is perfect for beginners,
          while Super and Sage modes add complexity with additional turns and checks. Choose a mode that matches
          your preferred play style and challenge level.
        </p>
      </div>
    </div>
  );
};

export default ModeSelectScreen;
