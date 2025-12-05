import { Lightbulb, MapPin, Square, CornerDownRight, Map } from 'lucide-react';
import { HINT_CONFIG } from '../lib/gameConfig';

const HintsPanel = ({ onUseHint, hintsUsed = 0, disabled = false }) => {
  const maxHints = HINT_CONFIG.MAX_HINTS_PER_GAME;
  const hintsRemaining = maxHints - hintsUsed;

  const hintTypes = [
    {
      type: 'position',
      label: 'Position Hint',
      description: 'Reveal correct position for a piece',
      icon: MapPin,
      cost: HINT_CONFIG.COSTS.position
    },
    {
      type: 'edge',
      label: 'Edge Hint',
      description: 'Highlight all edge pieces',
      icon: Square,
      cost: HINT_CONFIG.COSTS.edge
    },
    {
      type: 'corner',
      label: 'Corner Hint',
      description: 'Highlight all corner pieces',
      icon: CornerDownRight,
      cost: HINT_CONFIG.COSTS.corner
    },
    {
      type: 'region',
      label: 'Region Hint',
      description: 'Show general area for a piece',
      icon: Map,
      cost: HINT_CONFIG.COSTS.region
    }
  ];

  const handleUseHint = (hintType) => {
    if (disabled || hintsRemaining <= 0) return;
    onUseHint(hintType);
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-yellow-400" />
          Hints
        </h3>
        <div className="text-sm">
          <span className={`font-semibold ${hintsRemaining > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
            {hintsRemaining}
          </span>
          <span className="text-gray-400"> / {maxHints} remaining</span>
        </div>
      </div>

      {/* Hints Grid */}
      <div className="space-y-2">
        {hintTypes.map((hint) => {
          const Icon = hint.icon;
          const isDisabled = disabled || hintsRemaining <= 0;

          return (
            <button
              key={hint.type}
              onClick={() => handleUseHint(hint.type)}
              disabled={isDisabled}
              className={`
                w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors
                ${isDisabled
                  ? 'bg-slate-700/30 opacity-50 cursor-not-allowed'
                  : 'bg-slate-700/50 hover:bg-slate-700 cursor-pointer'
                }
              `}
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                isDisabled ? 'bg-slate-600' : 'bg-yellow-500/20'
              }`}>
                <Icon className={`w-5 h-5 ${isDisabled ? 'text-gray-500' : 'text-yellow-400'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`font-medium ${isDisabled ? 'text-gray-500' : 'text-white'}`}>
                    {hint.label}
                  </span>
                  <span className={`text-sm font-semibold ${
                    isDisabled ? 'text-gray-500' : hint.cost < 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {hint.cost > 0 ? '+' : ''}{hint.cost} pts
                  </span>
                </div>
                <p className={`text-xs ${isDisabled ? 'text-gray-600' : 'text-gray-400'}`}>
                  {hint.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Warning Message */}
      {hintsRemaining === 0 && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-400 text-center">
            No hints remaining for this game
          </p>
        </div>
      )}

      {/* Info Message */}
      {hintsRemaining > 0 && (
        <div className="mt-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <p className="text-xs text-purple-300 text-center">
            Using hints will deduct points from your score
          </p>
        </div>
      )}
    </div>
  );
};

export default HintsPanel;
