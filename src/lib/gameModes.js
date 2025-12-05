export const GAME_MODES = {
  CLASSIC: {
    id: 'CLASSIC',
    name: 'Classic Mode',
    description: 'Single turn, opponent checks your placement',
    icon: '🎯',
    features: {
      turns: 'single',
      check: 'opponent',
      turnsPerRound: 1,
      checksPerTurn: 1
    },
    multiplayer: true,
    available: true
  },
  SUPER: {
    id: 'SUPER',
    name: 'Super Mode',
    description: 'Double turn with higher stakes',
    icon: '⚡',
    features: {
      turns: 'double',
      check: 'opponent',
      turnsPerRound: 2,
      checksPerTurn: 1
    },
    multiplayer: true,
    available: true
  },
  SAGE: {
    id: 'SAGE',
    name: 'Sage Mode',
    description: 'Multiple turns, double check opportunity',
    icon: '🧠',
    features: {
      turns: 'multiple',
      check: 'double',
      turnsPerRound: 5,
      checksPerTurn: 2
    },
    multiplayer: true,
    available: true
  },
  SAVANT: {
    id: 'SAVANT',
    name: 'Savant Mode',
    description: 'Infinite turns, most correct pieces wins',
    icon: '🌟',
    features: {
      turns: 'infinite',
      check: 'none',
      turnsPerRound: Infinity,
      checksPerTurn: 0
    },
    multiplayer: true,
    available: false,
    comingSoon: true
  },
  SINGLE_PLAYER: {
    id: 'SINGLE_PLAYER',
    name: 'Single Player',
    description: 'Practice solo with auto-verification',
    icon: '👤',
    features: {
      turns: 'single',
      check: 'auto',
      turnsPerRound: 1,
      checksPerTurn: 0
    },
    multiplayer: false,
    available: true
  }
};

export const MODE_SCORING = {
  CLASSIC: {
    checkCorrect: 10,
    checkWrong: 0,
    checkerSuccess: 5,
    checkerFail: -2,
    passCorrect: 0,
    passWrong: -3,
    streakMultiplier: 1,
    streakBonusThreshold: 3
  },
  SUPER: {
    checkCorrect: 15,
    checkWrong: 0,
    checkerSuccess: 8,
    checkerFail: -3,
    passCorrect: 0,
    passWrong: -5,
    streakMultiplier: 1.5,
    streakBonusThreshold: 3
  },
  SAGE: {
    checkCorrect: 20,
    checkWrong: 0,
    checkerSuccess: 10,
    checkerFail: -5,
    passCorrect: 0,
    passWrong: -8,
    streakMultiplier: 2,
    streakBonusThreshold: 2
  },
  SAVANT: {
    correctPiece: 25,
    wrongPiece: 0,
    streakMultiplier: 2.5,
    streakBonusThreshold: 5
  },
  SINGLE_PLAYER: {
    correctPiece: 10,
    wrongPiece: -2,
    streakMultiplier: 1,
    streakBonusThreshold: 3
  }
};

export const getModeConfig = (modeId) => GAME_MODES[modeId] || GAME_MODES.CLASSIC;
export const getModeScoring = (modeId) => MODE_SCORING[modeId] || MODE_SCORING.CLASSIC;
export const getAvailableModes = (multiplayerOnly = false) => {
  return Object.values(GAME_MODES).filter(mode => {
    if (!mode.available) return false;
    if (multiplayerOnly && !mode.multiplayer) return false;
    return true;
  });
};
export const isModeMultiplayer = (modeId) => {
  const mode = GAME_MODES[modeId];
  return mode?.multiplayer ?? true;
};
