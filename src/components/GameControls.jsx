import { useEffect, useState } from 'react';
import { Eye, Lightbulb, LogOut, Settings, X } from 'lucide-react';

const GameControls = ({
  settingsPanel,
  hintsPanel,
  activeHint = null,
  hintsRemaining = 0,
  onPreview,
  onExit
}) => {
  const [openPanel, setOpenPanel] = useState(null);

  useEffect(() => {
    if (activeHint) setOpenPanel(null);
  }, [activeHint]);

  const open = (panel) => setOpenPanel(current => current === panel ? null : panel);

  return (
    <>
      {activeHint && (
        <div className="game-active-hint" role="status">
          <Lightbulb className="w-4 h-4 text-yellow-300" />
          <span>
            {activeHint.type === 'position' && 'Highlighted tile → highlighted cell'}
            {activeHint.type === 'region' && 'Highlighted tile belongs in the outlined area'}
            {activeHint.type === 'edge' && 'Highlighted tiles belong on the board edge'}
            {activeHint.type === 'corner' && 'Highlighted tiles belong in a board corner'}
          </span>
        </div>
      )}

      <nav className="game-control-bar" aria-label="Game controls">
        <button onClick={() => open('hints')} className="game-control-button touch-target">
          <span className="relative">
            <Lightbulb className="w-5 h-5" />
            <span className="game-control-badge">{hintsRemaining}</span>
          </span>
          <span>Hints</span>
        </button>
        <button onClick={() => open('settings')} className="game-control-button touch-target">
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </button>
        {onPreview && (
          <button onClick={onPreview} className="game-control-button touch-target">
            <Eye className="w-5 h-5" />
            <span>Preview</span>
          </button>
        )}
        <button onClick={onExit} className="game-control-button text-red-300 touch-target">
          <LogOut className="w-5 h-5" />
          <span>Exit</span>
        </button>
      </nav>

      {openPanel && (
        <div className="game-drawer-backdrop" onClick={() => setOpenPanel(null)}>
          <section
            className="game-control-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={openPanel === 'hints' ? 'Hints' : 'Display settings'}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-bold">
                {openPanel === 'hints' ? 'Choose a hint' : 'Display & sound'}
              </h2>
              <button onClick={() => setOpenPanel(null)} className="p-2 text-slate-300 touch-target" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[65vh]">
              {openPanel === 'hints' ? hintsPanel : settingsPanel}
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default GameControls;
