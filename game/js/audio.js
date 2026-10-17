// Efectos de sonido sintetizados (sin archivos de audio).
import { save } from './save.js';

let actx = null;
const lastSfx = {};

export function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (actx.state === 'suspended') actx.resume();
}

export function sfx(name, freq, dur, type = 'square', vol = 0.04, slide = 0, gap = 0.05) {
  if (save.muted || !actx) return;
  const now = actx.currentTime;
  if (lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(actx.destination);
  o.start(now);
  o.stop(now + dur + 0.02);
}

export function boom(vol = 0.25, dur = 0.8, cutoff = 900) {
  if (save.muted || !actx) return;
  const now = actx.currentTime;
  const len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff, now);
  f.frequency.exponentialRampToValueAtTime(80, now + dur);
  const g = actx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(actx.destination);
  src.start(now);
}

// Arpegio corto (fanfarria de victoria, invocación…)
export function fanfare(notes, step = 0.09, type = 'square', vol = 0.05) {
  if (save.muted || !actx) return;
  notes.forEach((f, i) => setTimeout(() => sfx('fan' + i, f, step * 2.2, type, vol, 0, 0), i * step * 1000));
}

export const vibrate = (ms) => {
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(ms);
};
