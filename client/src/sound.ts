/**
 * Synthesised sound effects (no audio assets, no network). The AudioContext is
 * created lazily on the first user gesture so browsers allow playback.
 */
let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function setMuted(value: boolean) {
  muted = value;
}

export function isMuted() {
  return muted;
}

function noiseBuffer(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A stone hitting the wooden board: a sharp click plus a short low thud. */
export function playStoneClack() {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Click: filtered noise burst.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.05);
  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = 'bandpass';
  clickFilter.frequency.value = 2600 + Math.random() * 600;
  clickFilter.Q.value = 1.2;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.7, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  click.connect(clickFilter).connect(clickGain).connect(master);
  click.start(t);

  // Thud: decaying sine with a quick pitch drop.
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(220, t);
  thud.frequency.exponentialRampToValueAtTime(90, t + 0.08);
  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.5, t);
  thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  thud.connect(thudGain).connect(master);
  thud.start(t);
  thud.stop(t + 0.13);
}

/** Stones being swept off the board: a handful of soft rustling taps. */
export function playCaptureRustle(stones = 3) {
  if (muted || !ctx) return;
  const context = ctx;
  const t0 = context.currentTime + 0.06;
  const master = context.createGain();
  master.gain.value = 0.8;
  master.connect(context.destination);

  const taps = Math.min(8, 3 + stones);
  for (let i = 0; i < taps; i++) {
    const t = t0 + i * (0.045 + Math.random() * 0.03);
    const src = context.createBufferSource();
    src.buffer = noiseBuffer(context, 0.06);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200 + Math.random() * 1800;
    filter.Q.value = 2.5;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35 + Math.random() * 0.2, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  // Low rumble underneath the taps.
  const rumble = context.createBufferSource();
  rumble.buffer = noiseBuffer(context, 0.4);
  const lp = context.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 400;
  const rumbleGain = context.createGain();
  rumbleGain.gain.setValueAtTime(0.25, t0);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
  rumble.connect(lp).connect(rumbleGain).connect(master);
  rumble.start(t0);
}
