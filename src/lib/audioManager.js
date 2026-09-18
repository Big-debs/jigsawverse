let audioContext = null;
let listenersInstalled = false;

const getAudioContextClass = () => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
};

export const unlockGameAudio = async () => {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return false;

  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') await audioContext.resume();

    // A silent buffer in the initiating gesture makes iOS/WebKit commit the
    // audio session before Phaser tries to play a later gameplay sound.
    const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    return audioContext.state === 'running';
  } catch {
    return false;
  }
};

export const installGameAudioUnlock = () => {
  if (typeof window === 'undefined' || listenersInstalled) return () => {};
  listenersInstalled = true;

  const unlock = () => { unlockGameAudio(); };
  const resume = () => {
    if (document.visibilityState === 'visible') unlockGameAudio();
  };

  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('touchend', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true });
  window.addEventListener('pageshow', unlock);
  document.addEventListener('visibilitychange', resume);

  return () => {
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('touchend', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('pageshow', unlock);
    document.removeEventListener('visibilitychange', resume);
    listenersInstalled = false;
  };
};

export const playGameSound = async (kind, settings = {}) => {
  if (!settings.soundEnabled) return false;
  if (!audioContext || audioContext.state !== 'running') {
    const unlocked = await unlockGameAudio();
    if (!unlocked) return false;
  }

  const sounds = {
    select: [360, 0.08, 'sine'],
    place: [210, 0.13, 'triangle'],
    reject: [105, 0.2, 'square'],
    hint: [680, 0.22, 'sine'],
    success: [560, 0.25, 'sine'],
    failure: [125, 0.28, 'sawtooth'],
    refill: [290, 0.12, 'triangle'],
    complete: [820, 0.42, 'sine']
  };
  const [frequency, duration, wave] = sounds[kind] || sounds.place;
  const volume = Math.max(0, Math.min(1, settings.soundVolume ?? 0.7));
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.28), now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
  return true;
};

