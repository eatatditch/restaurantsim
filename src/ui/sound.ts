/**
 * Minimal WebAudio sound effects — short synthesized blips, no assets.
 * Respects a mute toggle persisted in localStorage.
 */

let ctx: AudioContext | null = null;
let muted = localStorage.getItem("shorething:muted") === "1";

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

function blip(freq: number, durationMs: number, type: OscillatorType = "sine", gain = 0.06): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(ac.destination);
  const now = ac.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

export const sfx = {
  tick: () => blip(420, 90, "triangle"),
  cash: () => {
    blip(660, 80, "square", 0.05);
    setTimeout(() => blip(880, 90, "square", 0.05), 70);
  },
  click: () => blip(520, 50, "sine", 0.04),
  success: () => {
    blip(523, 90, "triangle");
    setTimeout(() => blip(784, 120, "triangle"), 90);
  },
  error: () => blip(180, 160, "sawtooth", 0.05),
  achievement: () => {
    blip(659, 90, "triangle");
    setTimeout(() => blip(880, 90, "triangle"), 80);
    setTimeout(() => blip(1175, 140, "triangle"), 170);
  },
};

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem("shorething:muted", muted ? "1" : "0");
  return muted;
}
