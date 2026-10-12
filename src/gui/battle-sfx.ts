/**
 * The battle's sounds, made on the spot with WebAudio: no files, nothing to download, one
 * short synthesised cue per effect. Every cue is built from a few oscillators and filtered
 * noise with an envelope, so a fire move crackles and roars, water splashes, a bolt snaps,
 * a leaf whistles, a bite clacks, a shell knocks.
 *
 * A WebView plays nothing until the player has touched the page, so the context is made on
 * the first cue after a touch and cues before that are simply silent. `muted` is the
 * player's own switch, kept on the phone.
 */
/** Every sound: one per move (by the move's id), one per element's windup, and one per event of the choreography. */
export const SFX_NAMES = [
  'windup-fire', 'windup-water', 'windup-electric', 'windup-grass', 'windup-none',
  'flare', 'ember-bite', 'leaf-cut', 'root-bind', 'tide-lash', 'soak', 'volt-charge', 'static-tusk',
  'tongue-lash', 'sticky-snare', 'chain-whip', 'lure-flash', 'brine-jet', 'barnacle-bash', 'strike',
  'warm-coat', 'mist-veil', 'bristle', 'shell-up', 'rust-hide', 'camouflage', 'photosynth', 'heal',
  'hit', 'hit-crit', 'cap-throw', 'cap-open', 'cap-shake', 'cap-catch', 'recall', 'faint', 'send-out',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

const MUTE_KEY = 'wildstate.sfx.muted';

export class BattleSfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;

  constructor() {
    const wake = () => { this.context(); };
    for (const ev of ['pointerdown', 'touchstart', 'keydown']) window.addEventListener(ev, wake, { passive: true });
  }

  get muted(): boolean {
    try { return localStorage.getItem(MUTE_KEY) === 'on'; } catch { return false; }
  }
  set muted(on: boolean) {
    try { localStorage.setItem(MUTE_KEY, on ? 'on' : 'off'); } catch { /* a phone that keeps nothing still plays */ }
  }

  /** The context, made once the page may play; null before. */
  private context(): AudioContext | null {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return this.ctx; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    const master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    const seconds = 2, buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ctx = ctx; this.master = master; this.noise = buf;
    return ctx;
  }

  play(name: SfxName): void {
    if (this.muted) return;
    const ctx = this.context();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const out = this.master;
    const s = new Synth(ctx, out, this.noise!, t);
    switch (name) {
      case 'windup-fire': s.noise(0.35, { from: 600, to: 2400, type: 'bandpass', q: 1.2 }, 0.25, 0.3); s.tone(0.35, 'sawtooth', 110, 220, 0.08); break;
      case 'windup-water': s.noise(0.35, { from: 300, to: 1800, type: 'bandpass', q: 2 }, 0.2, 0.3); s.tone(0.3, 'sine', 300, 600, 0.08); break;
      case 'windup-electric': s.tone(0.3, 'square', 60, 1200, 0.07); s.noise(0.3, { from: 3000, to: 8000, type: 'highpass' }, 0.08, 0.2); break;
      case 'windup-grass': s.noise(0.35, { from: 800, to: 3500, type: 'bandpass', q: 3 }, 0.18, 0.3); break;
      case 'windup-none': s.noise(0.25, { from: 400, to: 1200, type: 'bandpass', q: 1 }, 0.15, 0.2); break;

      case 'flare': s.noise(0.55, { from: 200, to: 3000, type: 'bandpass', q: 0.8 }, 0.5, 0.5); s.crackle(0.5, 14); s.tone(0.5, 'sawtooth', 80, 40, 0.1); break;
      case 'ember-bite': s.crackle(0.3, 8); s.click(0.0, 1800, 0.25); s.click(0.12, 900, 0.3); break;
      case 'leaf-cut': s.sweep(0.22, 2500, 7000, 0.3); s.sweep(0.1, 1800, 5000, 0.18, 0.12); break;
      case 'root-bind': s.noise(0.4, { from: 150, to: 600, type: 'lowpass' }, 0.3, 0.4); s.tone(0.4, 'triangle', 90, 60, 0.12); s.click(0.3, 400, 0.2); break;
      case 'tide-lash': s.splash(0.5, 0.45); s.tone(0.35, 'sine', 500, 150, 0.1); break;
      case 'soak': s.splash(0.5, 0.35); s.drip(0.3, 3); break;
      case 'volt-charge': s.snap(0.0, 0.5); s.tone(0.25, 'square', 1500, 300, 0.12); s.noise(0.3, { from: 2500, to: 6000, type: 'highpass' }, 0.2, 0.3); break;
      case 'static-tusk': s.snap(0.0, 0.35); s.snap(0.08, 0.3); s.snap(0.17, 0.25); s.buzz(0.4, 0.15); break;
      case 'tongue-lash': s.sweep(0.18, 300, 1400, 0.25); s.click(0.24, 600, 0.35); s.splash(0.2, 0.15, 0.24); break;
      case 'sticky-snare': s.noise(0.3, { from: 400, to: 1200, type: 'bandpass', q: 2 }, 0.2, 0.3); s.tone(0.35, 'sine', 240, 120, 0.1, 0.05); break;
      case 'chain-whip': s.rattle(0.4, 9); s.click(0.42, 2200, 0.35); break;
      case 'lure-flash': s.tone(0.5, 'sine', 880, 880, 0.08); s.tone(0.5, 'sine', 1320, 1320, 0.05, 0.1); s.noise(0.25, { from: 4000, to: 9000, type: 'highpass' }, 0.25, 0.2, 0.45); break;
      case 'brine-jet': s.noise(0.5, { from: 500, to: 2500, type: 'bandpass', q: 0.9 }, 0.45, 0.5); s.splash(0.3, 0.3, 0.25); break;
      case 'barnacle-bash': s.knock(0.0, 180, 0.5); s.knock(0.06, 120, 0.4); s.noise(0.15, { from: 1500, to: 4000, type: 'bandpass', q: 1 }, 0.2, 0.15, 0.04); break;
      case 'strike': s.noise(0.12, { from: 800, to: 2500, type: 'bandpass', q: 1 }, 0.3, 0.12); s.knock(0.1, 200, 0.35); break;

      case 'warm-coat': s.noise(0.6, { from: 200, to: 900, type: 'lowpass' }, 0.18, 0.6); s.tone(0.6, 'sine', 220, 330, 0.07); break;
      case 'mist-veil': s.noise(0.7, { from: 600, to: 2000, type: 'bandpass', q: 0.7 }, 0.2, 0.7); break;
      case 'bristle': s.rattle(0.3, 12, 2500); break;
      case 'shell-up': s.knock(0.0, 260, 0.35); s.knock(0.1, 190, 0.4); s.knock(0.2, 140, 0.45); break;
      case 'rust-hide': s.noise(0.4, { from: 300, to: 1500, type: 'bandpass', q: 1.5 }, 0.22, 0.4); s.knock(0.3, 150, 0.3); break;
      case 'camouflage': s.noise(0.5, { from: 900, to: 3500, type: 'bandpass', q: 2.5 }, 0.15, 0.5); break;
      case 'photosynth': s.tone(0.7, 'sine', 523, 784, 0.07); s.tone(0.7, 'sine', 659, 988, 0.05, 0.1); s.tone(0.7, 'sine', 784, 1175, 0.04, 0.2); break;
      case 'heal': s.tone(0.5, 'sine', 660, 990, 0.07); s.tone(0.5, 'sine', 880, 1320, 0.05, 0.08); break;

      case 'hit': s.knock(0.0, 150, 0.55); s.noise(0.12, { from: 1000, to: 3000, type: 'bandpass', q: 1 }, 0.3, 0.12); break;
      case 'hit-crit': s.knock(0.0, 120, 0.7); s.noise(0.2, { from: 800, to: 4000, type: 'bandpass', q: 0.8 }, 0.4, 0.2); s.tone(0.25, 'sawtooth', 300, 80, 0.1); break;
      case 'cap-throw': s.sweep(0.4, 600, 1800, 0.12); break;
      case 'cap-open': s.click(0.0, 1400, 0.3); s.tone(0.5, 'sine', 400, 1600, 0.08, 0.05); s.noise(0.5, { from: 2000, to: 6000, type: 'highpass' }, 0.1, 0.4, 0.1); break;
      case 'cap-shake': s.knock(0.0, 420, 0.3); s.knock(0.47, 420, 0.3); s.knock(0.93, 420, 0.3); break;
      case 'cap-catch': s.click(0.0, 2600, 0.35); s.tone(0.6, 'sine', 523, 523, 0.08, 0.05); s.tone(0.6, 'sine', 784, 784, 0.07, 0.15); s.tone(0.8, 'sine', 1047, 1047, 0.07, 0.25); break;
      case 'recall': s.tone(0.6, 'sine', 1200, 300, 0.1); s.noise(0.5, { from: 2000, to: 500, type: 'bandpass', q: 1.5 }, 0.15, 0.5); break;
      case 'faint': s.tone(0.7, 'triangle', 440, 110, 0.12); s.tone(0.7, 'triangle', 330, 82, 0.08, 0.05); break;
      case 'send-out': s.sweep(0.25, 400, 1600, 0.12); s.tone(0.4, 'sine', 659, 988, 0.07, 0.1); break;
    }
  }
}

/** Short building blocks over one output; `at` offsets are seconds from the cue's start. */
class Synth {
  constructor(private ctx: AudioContext, private out: AudioNode, private noiseBuf: AudioBuffer, private t0: number) {}
  private env(gain: GainNode, at: number, peak: number, dur: number, attack = 0.01) {
    const t = this.t0 + at;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  }
  tone(dur: number, type: OscillatorType, from: number, to: number, peak: number, at = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(from, this.t0 + at); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), this.t0 + at + dur);
    this.env(g, at, peak, dur); o.connect(g); g.connect(this.out); o.start(this.t0 + at); o.stop(this.t0 + at + dur + 0.05);
  }
  noise(dur: number, f: { from: number; to: number; type: BiquadFilterType; q?: number }, peak: number, decay: number, at = 0) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const flt = this.ctx.createBiquadFilter(); flt.type = f.type; flt.Q.value = f.q ?? 1;
    flt.frequency.setValueAtTime(f.from, this.t0 + at); flt.frequency.exponentialRampToValueAtTime(f.to, this.t0 + at + dur);
    const g = this.ctx.createGain(); this.env(g, at, peak, decay, 0.02);
    src.connect(flt); flt.connect(g); g.connect(this.out); src.start(this.t0 + at); src.stop(this.t0 + at + Math.max(dur, decay) + 0.05);
  }
  /** A short pitched tick: a tooth, a latch, a click. */
  click(at: number, freq: number, peak: number) { this.tone(0.04, 'square', freq, freq * 0.6, peak, at); }
  /** A low thump: a body hit, a shell, a knock. */
  knock(at: number, freq: number, peak: number) { this.tone(0.12, 'sine', freq, freq * 0.4, peak, at); this.noise(0.05, { from: 300, to: 100, type: 'lowpass' }, peak * 0.5, 0.08, at); }
  /** A rising or falling whistle: a blade, a throw. */
  sweep(dur: number, from: number, to: number, peak: number, at = 0) { this.tone(dur, 'sine', from, to, peak, at); this.noise(dur, { from, to, type: 'bandpass', q: 6 }, peak * 0.6, dur, at); }
  /** Fire: a scatter of tiny pops over the roar. */
  crackle(dur: number, n: number) { for (let i = 0; i < n; i++) this.click(Math.random() * dur, 1200 + Math.random() * 2500, 0.08 + Math.random() * 0.1); }
  /** Water hitting something: a burst of filtered noise that falls away. */
  splash(dur: number, peak: number, at = 0) { this.noise(dur, { from: 2500, to: 600, type: 'bandpass', q: 0.7 }, peak, dur, at); }
  drip(at: number, n: number) { for (let i = 0; i < n; i++) this.tone(0.08, 'sine', 1200 + i * 200, 500, 0.08, at + i * 0.09); }
  /** Electricity: a hard snap. */
  snap(at: number, peak: number) { this.noise(0.03, { from: 6000, to: 9000, type: 'highpass' }, peak, 0.06, at); this.tone(0.05, 'square', 3000, 400, peak * 0.4, at); }
  buzz(dur: number, peak: number) { this.tone(dur, 'square', 90, 70, peak); this.tone(dur, 'sawtooth', 91, 71, peak * 0.5); }
  /** Links or quills knocking in a run. */
  rattle(dur: number, n: number, freq = 1400) { for (let i = 0; i < n; i++) this.click((i / n) * dur, freq + Math.random() * 600, 0.12 + Math.random() * 0.1); }
}
