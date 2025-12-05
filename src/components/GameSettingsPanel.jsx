import { Eye, EyeOff, Grid3x3, Sparkles, History } from 'lucide-react';

const GameSettingsPanel = ({ settings, onSettingsChange }) => {
  const toggleSetting = (key) => {
    onSettingsChange({
      ...settings,
      [key]: !settings[key]
    });
  };

  const settingOptions = [
    {
      key: 'showGhostImage',
      label: 'Ghost Image',
      description: 'Show faint puzzle preview behind grid',
      icon: Eye
    },
    {
      key: 'highlightEdges',
      label: 'Highlight Edges',
      description: 'Visual indicator for edge/corner pieces',
      icon: Sparkles
    },
    {
      key: 'showGridLabels',
      label: 'Grid Labels',
      description: 'Show coordinates (A1, B2, etc.)',
      icon: Grid3x3
    },
    {
      key: 'showMoveHistory',
      label: 'Move History',
      description: 'Display move history panel',
      icon: History
    }
  ];

  return (
    <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <Eye className="w-5 h-5" />
        Display Settings
      </h3>
      
      <div className="space-y-3">
        {settingOptions.map((option) => {
          const Icon = option.icon;
          const isEnabled = settings[option.key];
          
          return (
            <button
              key={option.key}
              onClick={() => toggleSetting(option.key)}
              className="w-full flex items-start gap-3 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-left"
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                isEnabled ? 'bg-purple-500' : 'bg-slate-600'
              }`}>
                {isEnabled ? (
                  <Icon className="w-5 h-5 text-white" />
                ) : (
                  <EyeOff className="w-5 h-5 text-gray-400" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium">{option.label}</span>
                  <div className={`w-10 h-5 rounded-full transition-colors ${
                    isEnabled ? 'bg-purple-500' : 'bg-slate-600'
                  }`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    } mt-0.5`} />
                  </div>
                </div>
                <p className="text-xs text-gray-400">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default GameSettingsPanel;
