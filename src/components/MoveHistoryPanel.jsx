import { History, CheckCircle, XCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const MoveHistoryPanel = ({ moveHistory = [], isVisible = true }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!isVisible) return null;

  // Get last 50 entries
  const displayHistory = moveHistory.slice(-50).reverse();

  const getEntryColor = (entry) => {
    if (entry.correct === true) return 'text-green-400 bg-green-500/10';
    if (entry.correct === false) return 'text-red-400 bg-red-500/10';
    return 'text-blue-400 bg-blue-500/10';
  };

  const getEntryIcon = (entry) => {
    if (entry.correct === true) return <CheckCircle className="w-4 h-4" />;
    if (entry.correct === false) return <XCircle className="w-4 h-4" />;
    return <Info className="w-4 h-4" />;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getGridPosition = (gridIndex, gridSize = 10) => {
    const col = gridIndex % gridSize;
    const row = Math.floor(gridIndex / gridSize);
    const colLetter = String.fromCharCode(65 + col); // A-Z
    const rowNumber = row + 1;
    return `${colLetter}${rowNumber}`;
  };

  return (
    <div className="bg-slate-800/80 backdrop-blur-md rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-purple-400" />
          <h3 className="text-white font-semibold">Move History</h3>
          <span className="text-xs text-gray-400">
            ({displayHistory.length} moves)
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="max-h-96 overflow-y-auto p-4 pt-0 space-y-2">
          {displayHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No moves yet</p>
            </div>
          ) : (
            displayHistory.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                className={`flex items-start gap-3 p-3 rounded-lg ${getEntryColor(entry)}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getEntryIcon(entry)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">
                      {entry.player === 'playerA' ? 'Player A' : 'Player B'}
                    </span>
                    <span className="text-xs opacity-75">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm opacity-90">
                    Placed piece #{entry.pieceId} at {getGridPosition(entry.gridIndex)}
                    {entry.correct === true && <span className="ml-1">✓ Correct</span>}
                    {entry.correct === false && <span className="ml-1">✗ Incorrect</span>}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MoveHistoryPanel;
