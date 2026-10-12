/**
 * The battle screen's effects: particles and drawn shapes on a canvas over the arena, in place of
 * stretched 32px sprites and CSS lines. Fire throws a comet that sheds embers and smoke, water an
 * orb or a pressure jet that splashes, electricity a forked bolt that flickers, grass a spiral of
 * leaves and vines that wrap; every hit lands with a shockwave and debris of its element. The
 * capture capsule is drawn here too: thrown on an arc with a spinning trail, opened with a beam
 * that draws the creature in as light, three wobbles, and the click.
 *
 * The engine only animates while something is on screen and stops its frame loop otherwise; it
 * never touches the battle's numbers, which the reducer and the match program already settled.
 */
import type { Element } from '../domain/game';

export type Pt = { x: number; y: number };
/** Where things are on the canvas, read from the sprites each time an effect starts. */
export type Stage = { own: Pt; wild: Pt; ownSize: number; wildSize: number; capsuleRest: Pt; ownRest: Pt };
export type FxCue = { kind: string; el: Element; dir: 'own' | 'wild'; fxKind?: string; crit?: boolean };

type Palette = { core: string; hot: string; mid: string; deep: string; smoke: string };
const PALETTE: Record<Element, Palette> = {
  fire: { core: '#fff6c8', hot: '#ffc23d', mid: '#ff6a1f', deep: '#c31d10', smoke: '#4a3a34' },
  water: { core: '#f0fdff', hot: '#9fe6ff', mid: '#38a8f2', deep: '#1257b8', smoke: '#cfefff' },
  electric: { core: '#ffffff', hot: '#fff7a3', mid: '#ffe03a', deep: '#79c9ff', smoke: '#fff7a3' },
  grass: { core: '#f2ffd9', hot: '#b9ee7c', mid: '#57b84c', deep: '#1f6e2f', smoke: '#cfe9a8' },
  none: { core: '#ffffff', hot: '#fff1c4', mid: '#e8d39a', deep: '#a88a4f', smoke: '#efe6cf' },
};

type Particle = {
  x: number; y: number; vx: number; vy: number; ay: number; drag: number;
  age: number; life: number; size: number; grow: number; rot: number; spin: number;
  shape: 'glow' | 'leaf' | 'drop' | 'spark' | 'star' | 'smoke' | 'shard' | 'plus';
  color: string; glow: boolean;
};
/** A drawn shape with its own timeline: `t` runs 0 → 1 over `dur` ms. */
type Drawing = { start: number; dur: number; draw: (g: CanvasRenderingContext2D, t: number, now: number) => void; done?: () => void };

const MAX_PARTICLES = 320;
/** The capsule's radius, as a share of the creature's drawn width. */
const CAPSULE = 0.16;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ease = { out: (t: number) => 1 - (1 - t) ** 3, inOut: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2), in: (t: number) => t ** 2 };
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** A point on the quadratic curve a → b bending through `lift` above their midpoint. */
function arc(a: Pt, b: Pt, t: number, lift: number): Pt {
  const c = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift };
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

export class BattleFx {
  private g: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private drawings: Drawing[] = [];
  private frame = 0;
  private last = 0;
  private glows = new Map<string, HTMLCanvasElement>();
  private resting: 'none' | 'own' | 'wild' = 'none';
  private scale = 1;

  constructor(private canvas: HTMLCanvasElement, private locate: () => Stage | null) {
    this.g = canvas.getContext('2d')!;
  }

  /** Plays one cue of the battle's choreography. */
  play(cue: FxCue): void {
    this.fit();
    const s = this.locate();
    if (!s) return;
    const from = cue.dir === 'own' ? s.own : s.wild, to = cue.dir === 'own' ? s.wild : s.own;
    const size = cue.dir === 'own' ? s.wildSize : s.ownSize;
    const p = PALETTE[cue.el] ?? PALETTE.none;
    switch (cue.kind) {
      case 'windup': this.windup(from, p, cue.dir === 'own' ? s.ownSize : s.wildSize); break;
      case 'proj': if (cue.fxKind === 'snare') this.snare(from, to, size); else this.projectile(cue.el, from, to, p); break;
      case 'lunge': case 'counter': this.melee(cue.fxKind, cue.el, to, size, p); break;
      case 'tongue': this.tongue(from, to, size); break;
      case 'chain': this.chain(from, to, size); break;
      case 'jet': this.jet(from, to, size); break;
      case 'lure': this.lure(from, to, size); break;
      case 'impact': this.impact(to, size, p, !!cue.crit, cue.fxKind); break;
      case 'guard': this.guard(from, cue.dir === 'own' ? s.ownSize : s.wildSize); break;
      case 'camo': this.camo(from, cue.dir === 'own' ? s.ownSize : s.wildSize); break;
      case 'heal': this.heal(from, cue.dir === 'own' ? s.ownSize : s.wildSize); break;
      case 'cap-throw': this.capThrow(s.own, s.capsuleRest, s.wildSize); break;
      case 'cap-open': this.capOpen(s.capsuleRest, s.wild, s.wildSize); break;
      case 'cap-shake': this.capShake(s.capsuleRest, s.wildSize); break;
      case 'cap-catch': this.capCatch(s.capsuleRest, s.wildSize); break;
      case 'recall': this.recall(s.ownRest, s.own, s.ownSize); break;
      case 'faint': this.faint(cue.dir === 'own' ? s.own : s.wild, cue.dir === 'own' ? s.ownSize : s.wildSize); break;
      case 'send-out': this.sendOut(cue.dir === 'own' ? s.own : s.wild, cue.dir === 'own' ? s.ownSize : s.wildSize); break;
    }
    this.run();
  }

  /** Keeps the closed capsule drawn on a pad (a creature called back into it), until cleared. */
  rest(where: 'none' | 'own' | 'wild'): void {
    if (this.resting === where) return;
    this.resting = where;
    this.run();
  }

  destroy(): void { cancelAnimationFrame(this.frame); this.frame = 0; this.particles = []; this.drawings = []; }

  // ------------------------------------------------------------------ engine

  private fit() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.scale = dpr;
  }

  private run() {
    if (this.frame) return;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(48, now - this.last) / 1000;
      this.last = now;
      this.tick(dt, now);
      this.frame = this.particles.length || this.drawings.length || this.resting !== 'none' ? requestAnimationFrame(step) : 0;
    };
    this.frame = requestAnimationFrame(step);
  }

  private tick(dt: number, now: number) {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (this.resting !== 'none') {
      const s = this.locate();
      if (s) { const at = this.resting === 'own' ? s.ownRest : s.capsuleRest; drawCapsule(g, at.x, at.y, (this.resting === 'own' ? s.ownSize : s.wildSize) * CAPSULE, 0, 0, 0.35 + 0.25 * Math.sin(now / 300)); }
    }
    this.drawings = this.drawings.filter((d) => {
      const t = (now - d.start) / d.dur;
      if (t < 0) return true;
      if (t >= 1) { d.done?.(); return false; }
      g.save(); d.draw(g, t, now); g.restore();
      return true;
    });
    const live: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; p.vy += p.ay * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      this.drawParticle(p);
      live.push(p);
    }
    this.particles = live;
  }

  private add(p: Partial<Particle> & Pick<Particle, 'x' | 'y' | 'color'>) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ vx: 0, vy: 0, ay: 0, drag: 0, age: 0, life: 0.6, size: 6, grow: 0, rot: rnd(0, Math.PI * 2), spin: 0, shape: 'glow', glow: true, ...p });
  }
  private later(ms: number, dur: number, draw: Drawing['draw'], done?: () => void) {
    this.drawings.push({ start: performance.now() + ms, dur, draw, done });
  }
  private at(ms: number, fn: () => void) { this.later(ms, 1, () => {}, fn); }

  /** A soft round glow of `color`, drawn once and reused (radial gradients every frame cost a phone its frames). */
  private glow(color: string): HTMLCanvasElement {
    let c = this.glows.get(color);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d')!, gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, color); gr.addColorStop(0.35, color + 'cc'); gr.addColorStop(1, color + '00');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this.glows.set(color, c);
    }
    return c;
  }

  private drawParticle(p: Particle) {
    const g = this.g, k = p.age / p.life, size = Math.max(0.1, p.size + p.grow * p.age);
    const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, fade));
    g.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
    g.translate(p.x, p.y); g.rotate(p.rot);
    switch (p.shape) {
      case 'glow': g.drawImage(this.glow(p.color), -size, -size, size * 2, size * 2); break;
      case 'smoke': g.globalAlpha *= 0.45; g.drawImage(this.glow(p.color), -size, -size, size * 2, size * 2); break;
      case 'leaf': {
        g.fillStyle = p.color; g.beginPath(); g.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#1f4d22'; g.lineWidth = Math.max(1, size * 0.12); g.beginPath(); g.moveTo(-size, 0); g.lineTo(size, 0); g.stroke();
        g.fillStyle = '#ffffff55'; g.beginPath(); g.ellipse(-size * 0.2, -size * 0.15, size * 0.45, size * 0.15, 0, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'drop': {
        const sp = Math.hypot(p.vx, p.vy); g.rotate(Math.atan2(p.vy, p.vx) - p.rot);
        const len = size * (1 + Math.min(2.5, sp / 260));
        g.fillStyle = p.color; g.beginPath(); g.ellipse(0, 0, len, size * 0.7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(len * 0.35, -size * 0.25, size * 0.25, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'spark': {
        g.rotate(Math.atan2(p.vy, p.vx) - p.rot);
        const len = size * 3; g.strokeStyle = p.color; g.lineCap = 'round'; g.lineWidth = Math.max(1.2, size * 0.45);
        g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, 0); g.stroke();
        g.drawImage(this.glow(p.color), -size * 1.4, -size * 1.4, size * 2.8, size * 2.8);
        break;
      }
      case 'star': {
        g.fillStyle = p.color; g.beginPath();
        for (let i = 0; i < 8; i++) { const r = i % 2 ? size * 0.38 : size; const a = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        g.closePath(); g.fill(); g.drawImage(this.glow(p.color), -size * 1.6, -size * 1.6, size * 3.2, size * 3.2);
        break;
      }
      case 'shard': {
        g.fillStyle = p.color; g.beginPath(); g.moveTo(size, 0); g.lineTo(-size * 0.6, size * 0.5); g.lineTo(-size * 0.4, -size * 0.6); g.closePath(); g.fill();
        g.strokeStyle = '#00000033'; g.lineWidth = 1; g.stroke();
        break;
      }
      case 'plus': {
        g.rotate(-p.rot); const w = size * 0.36;
        g.fillStyle = p.color; g.fillRect(-w, -size, w * 2, size * 2); g.fillRect(-size, -w, size * 2, w * 2);
        g.drawImage(this.glow(p.color), -size * 1.6, -size * 1.6, size * 3.2, size * 3.2);
        break;
      }
    }
    g.restore();
  }

  // ------------------------------------------------------------------ attacks

  /** Light gathers into the attacker before it moves. */
  private windup(c: Pt, p: Palette, size: number) {
    const r = size * 0.55;
    for (let i = 0; i < 22; i++) {
      const a = rnd(0, Math.PI * 2), d = rnd(r * 0.7, r * 1.2), t = rnd(0.28, 0.4);
      this.add({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, vx: -Math.cos(a) * d / t, vy: -Math.sin(a) * d / t, life: t, size: rnd(3, 6), color: i % 3 ? p.hot : p.core });
    }
    this.later(0, 380, (g, t) => {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.sin(t * Math.PI) * 0.8;
      const s = size * (0.6 + 0.25 * t); g.drawImage(this.glow(p.mid), c.x - s, c.y - s, s * 2, s * 2);
    });
  }

  private projectile(el: Element, a: Pt, b: Pt, p: Palette) {
    if (el === 'electric') return this.bolt(a, b, p);
    if (el === 'grass') return this.leaves(a, b, p);
    const dur = 420, lift = Math.abs(b.x - a.x) * 0.18;
    this.later(0, dur, (g, t, now) => {
      const at = arc(a, b, ease.inOut(t), lift), head = el === 'fire' ? 26 : 22;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.glow(p.mid), at.x - head * 1.6, at.y - head * 1.6, head * 3.2, head * 3.2);
      g.drawImage(this.glow(p.core), at.x - head * 0.7, at.y - head * 0.7, head * 1.4, head * 1.4);
      if (el === 'fire') {
        // A tapered tail of flame along the last stretch of the path.
        for (let i = 1; i <= 8; i++) {
          const back = arc(a, b, ease.inOut(Math.max(0, t - i * 0.025)), lift), w = head * (1 - i / 9) * (0.9 + 0.2 * Math.sin(now / 30 + i));
          g.globalAlpha = 0.75 * (1 - i / 9); g.drawImage(this.glow(i < 3 ? p.hot : p.mid), back.x - w, back.y - w, w * 2, w * 2);
        }
        g.globalAlpha = 1;
      }
      if (el === 'water') {
        g.globalCompositeOperation = 'source-over';
        const gr = g.createRadialGradient(at.x - 4, at.y - 5, 1, at.x, at.y, head * 0.55);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, p.hot); gr.addColorStop(1, p.deep);
        g.fillStyle = gr; g.beginPath(); g.arc(at.x, at.y, head * 0.55 * (1 + 0.06 * Math.sin(now / 40)), 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < (el === 'fire' ? 3 : 2); i++) {
        if (el === 'fire') {
          this.add({ x: at.x + rnd(-7, 7), y: at.y + rnd(-7, 7), vx: rnd(-50, 50), vy: rnd(-80, -10), ay: -80, life: rnd(0.25, 0.5), size: rnd(6, 12), grow: -14, color: [p.core, p.hot, p.mid][i % 3] });
          this.add({ x: at.x + rnd(-4, 4), y: at.y + rnd(-4, 4), vx: rnd(-120, 120), vy: rnd(-140, 40), drag: 2, life: rnd(0.3, 0.55), size: rnd(1.5, 2.5), shape: 'spark', color: p.hot });
          if (Math.random() < 0.18) this.add({ x: at.x, y: at.y, vx: rnd(-15, 15), vy: rnd(-40, -15), life: rnd(0.5, 0.8), size: rnd(5, 8), grow: 16, shape: 'smoke', glow: false, color: '#8c7a70' });
        } else {
          this.add({ x: at.x + rnd(-8, 8), y: at.y + rnd(-8, 8), vx: rnd(-30, 30), vy: rnd(-20, 30), ay: 420, life: rnd(0.35, 0.6), size: rnd(2.5, 4.5), shape: 'drop', glow: false, color: p.mid });
        }
      }
    });
  }

  /** A forked bolt that redraws itself every few frames, so it crackles. */
  private bolt(a: Pt, b: Pt, p: Palette) {
    let path: Pt[] = [], branches: Pt[][] = [], drawn = -1;
    this.later(0, 440, (g, t, now) => {
      const reach = Math.min(1, t / 0.35), end = lerp(a, b, reach), frame = Math.floor(now / 55);
      if (frame !== drawn) { drawn = frame; path = jagged(a, end, 7, 0.22); branches = [0.35, 0.6].map((k) => { const s = path[Math.floor(path.length * k)]; return jagged(s, { x: s.x + rnd(-40, 40), y: s.y + rnd(25, 70) }, 4, 0.3); }); }
      const fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
      for (const [w, c, al] of [[14, p.deep, 0.35], [7, p.mid, 0.7], [2.5, p.core, 1]] as const) {
        g.globalAlpha = al * fade; g.strokeStyle = c; g.lineWidth = w;
        for (const line of [path, ...branches]) { g.beginPath(); line.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke(); }
      }
      g.globalAlpha = fade; g.drawImage(this.glow(p.hot), a.x - 30, a.y - 30, 60, 60);
      if (reach >= 1) { g.drawImage(this.glow(p.core), end.x - 34, end.y - 34, 68, 68); if (Math.random() < 0.5) this.add({ x: end.x, y: end.y, vx: rnd(-220, 220), vy: rnd(-220, 120), drag: 3, life: 0.3, size: 2.5, shape: 'spark', color: p.hot }); }
    });
  }

  private leaves(a: Pt, b: Pt, p: Palette) {
    for (let i = 0; i < 7; i++) {
      const delay = i * 40, phase = (i / 7) * Math.PI * 2, size = rnd(7, 11), tone = [p.hot, p.mid, p.mid, p.deep][i % 4];
      this.later(delay, 460, (g, t) => {
        const base = lerp(a, b, ease.inOut(t)), r = 26 * (1 - t * 0.6), ang = phase + t * 9;
        const x = base.x + Math.cos(ang) * r, y = base.y + Math.sin(ang) * r * 0.6;
        g.translate(x, y); g.rotate(ang * 1.4); g.fillStyle = tone;
        g.beginPath(); g.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#1f4d22'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-size, 0); g.lineTo(size, 0); g.stroke();
        g.fillStyle = '#ffffff55'; g.beginPath(); g.ellipse(-size * 0.2, -size * 0.15, size * 0.45, size * 0.15, 0, 0, Math.PI * 2); g.fill();
      });
    }
  }

  /** Thorned seeds fly over, then vines curl up around the target. */
  private snare(a: Pt, b: Pt, size: number) {
    const p = PALETTE.grass;
    this.leaves(a, b, p);
    const base = { x: b.x, y: b.y + size * 0.32 };
    for (let v = 0; v < 4; v++) {
      const side = v % 2 ? 1 : -1, reach = size * rnd(0.4, 0.6), lean = rnd(0.5, 0.9);
      this.later(330 + v * 50, 700, (g, t) => {
        const grow = ease.out(Math.min(1, t / 0.6)), fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
        g.globalAlpha = fade; g.lineCap = 'round';
        const pts: Pt[] = [];
        for (let i = 0; i <= 18 * grow; i++) { const k = i / 18; pts.push({ x: base.x + side * Math.sin(k * Math.PI * 1.6) * reach * lean * (1 - k * 0.3), y: base.y - k * size * 0.9 }); }
        for (const [w, c] of [[7, '#123d1c'], [4.5, p.mid], [1.5, p.hot]] as const) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke(); }
        pts.forEach((q, i) => { if (i % 4 === 2) { g.fillStyle = p.mid; g.beginPath(); g.ellipse(q.x + side * 6, q.y, 6, 3, side * 0.6, 0, Math.PI * 2); g.fill(); } });
      });
    }
  }

  /** A wet tongue that shoots out on a curve, slaps, and snaps back. */
  private tongue(a: Pt, b: Pt, size: number) {
    const mouth = { x: a.x + (b.x - a.x) * 0.12, y: a.y - size * 0.08 }, tip = { x: b.x - (b.x - a.x) * 0.08, y: b.y };
    this.later(0, 520, (g, t) => {
      const out = t < 0.45 ? ease.out(t / 0.45) : t < 0.6 ? 1 : 1 - ease.in((t - 0.6) / 0.4);
      const end = arc(mouth, tip, out, 40 * (1 - out) + 18), mid = arc(mouth, end, 0.5, 26);
      // A tapered tongue: segments widen from the mouth toward the tip, outline first, then flesh, then the wet sheen.
      const ctrl = { x: mid.x, y: mid.y - 12 }, pts: Pt[] = [];
      for (let i = 0; i <= 20; i++) { const k = i / 20, u = 1 - k; pts.push({ x: u * u * mouth.x + 2 * u * k * ctrl.x + k * k * end.x, y: u * u * mouth.y + 2 * u * k * ctrl.y + k * k * end.y }); }
      g.lineCap = 'round';
      for (const [extra, c] of [[6, '#3a0f1e'], [0, '#d9557a']] as const) for (let i = 1; i < pts.length; i++) { g.strokeStyle = c; g.lineWidth = 7 + (i / pts.length) * 9 + extra; g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke(); }
      g.strokeStyle = '#a8324f'; g.lineWidth = 1.5; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y + 1) : g.moveTo(q.x, q.y + 1))); g.stroke();
      g.strokeStyle = '#ffd2de'; g.lineWidth = 2.5; g.globalAlpha = 0.85; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y - 4 - (i / pts.length) * 2) : g.moveTo(q.x, q.y - 4))); g.stroke(); g.globalAlpha = 1;
      g.fillStyle = '#3a0f1e'; g.beginPath(); g.arc(end.x, end.y, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e8648a'; g.beginPath(); g.arc(end.x, end.y, 10.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(end.x - 2, end.y - 3, 2.6, 0, Math.PI * 2); g.fill();
    });
    this.at(235, () => { for (let i = 0; i < 12; i++) this.add({ x: tip.x, y: tip.y, vx: rnd(-160, 160), vy: rnd(-200, 40), ay: 600, life: rnd(0.35, 0.6), size: rnd(2, 3.5), shape: 'drop', glow: false, color: '#f6c7d6' }); this.slap(tip); });
  }
  private slap(at: Pt) {
    this.later(0, 420, (g, t) => {
      g.globalAlpha = 1 - t; g.translate(at.x, at.y - 30 - t * 20); g.scale(1 + 0.4 * ease.out(Math.min(1, t * 3)), 1 + 0.4 * ease.out(Math.min(1, t * 3)));
      g.font = 'bold 22px Silkscreen, monospace'; g.textAlign = 'center'; g.lineWidth = 5; g.strokeStyle = '#3a0f1e'; g.strokeText('SLAP!', 0, 0); g.fillStyle = '#ffe8ef'; g.fillText('SLAP!', 0, 0);
    });
  }

  /** Steel links that whip out in a swinging arc and crack against the target. */
  private chain(a: Pt, b: Pt, size: number) {
    const from = { x: a.x, y: a.y - size * 0.1 };
    this.later(0, 520, (g, t, now) => {
      const out = t < 0.5 ? ease.out(t / 0.5) : 1 - ease.in((t - 0.5) / 0.5), swing = Math.sin(t * Math.PI * 2) * 60;
      const end = lerp(from, b, out), ctrl = { x: (from.x + end.x) / 2, y: Math.min(from.y, end.y) - 50 + swing };
      const links = Math.max(3, Math.floor(16 * out));
      for (let i = 0; i <= links; i++) {
        const k = i / 16;
        const q = { x: (1 - k) ** 2 * from.x + 2 * (1 - k) * k * ctrl.x + k * k * end.x, y: (1 - k) ** 2 * from.y + 2 * (1 - k) * k * ctrl.y + k * k * end.y };
        if (k > out + 0.001) break;
        const tan = Math.atan2(2 * (1 - k) * (ctrl.y - from.y) + 2 * k * (end.y - ctrl.y), 2 * (1 - k) * (ctrl.x - from.x) + 2 * k * (end.x - ctrl.x));
        g.save(); g.translate(q.x, q.y); g.rotate(tan + (i % 2 ? Math.PI / 2 : 0));
        const gr = g.createLinearGradient(0, -5, 0, 5); gr.addColorStop(0, '#f2f6f7'); gr.addColorStop(0.5, '#9aa9b0'); gr.addColorStop(1, '#4b5a61');
        g.strokeStyle = '#1d262a'; g.lineWidth = 5.5; g.beginPath(); g.ellipse(0, 0, 8, 4.5, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = gr; g.lineWidth = 3; g.stroke(); g.restore();
      }
      if (out > 0.92 && Math.floor(now / 30) % 2) for (let i = 0; i < 3; i++) this.add({ x: end.x, y: end.y, vx: rnd(-260, 260), vy: rnd(-240, 60), drag: 3, life: 0.28, size: 2.2, shape: 'spark', color: '#fff3c4' });
    });
  }

  /** A pressure jet: a bright core with droplets streaming along it and spraying off the target. */
  private jet(a: Pt, b: Pt, size: number) {
    const p = PALETTE.water, from = { x: a.x + (b.x - a.x) * 0.1, y: a.y - size * 0.05 };
    this.later(0, 520, (g, t, now) => {
      const reach = ease.out(Math.min(1, t / 0.3)), end = lerp(from, b, reach), fade = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      // The stream: a wavy body of water, darker at its edges, with foam running down its middle.
      const pts: Pt[] = [], nx = -(end.y - from.y), ny = end.x - from.x, nl = Math.hypot(nx, ny) || 1;
      for (let i = 0; i <= 24; i++) { const k = i / 24, q = lerp(from, end, k), wave = Math.sin(k * 14 - now / 35) * 5 * k; pts.push({ x: q.x + (nx / nl) * wave, y: q.y + (ny / nl) * wave }); }
      const stroke = (w: number, c: string, al: number, add: boolean) => { g.globalCompositeOperation = add ? 'lighter' : 'source-over'; g.globalAlpha = al * fade; g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke(); };
      stroke(24, p.deep, 0.55, false); stroke(17, p.mid, 0.9, false); stroke(9, p.hot, 0.9, false);
      g.setLineDash([10, 14]); g.lineDashOffset = -now / 4; stroke(3.5, '#ffffff', 0.95, false); g.setLineDash([]);
      stroke(30, p.hot, 0.25, true);
      const dx = b.x - from.x, dy = b.y - from.y, len = Math.hypot(dx, dy) || 1;
      for (let i = 0; i < 4 && fade > 0.5; i++) {
        const k = Math.random() * reach, q = lerp(from, b, k);
        this.add({ x: q.x + rnd(-9, 9), y: q.y + rnd(-9, 9), vx: (dx / len) * rnd(380, 560) + rnd(-60, 60), vy: (dy / len) * rnd(380, 560) + rnd(-80, 40), ay: 500, life: rnd(0.2, 0.35), size: rnd(2.5, 4.5), shape: 'drop', glow: false, color: i % 2 ? p.hot : '#ffffff' });
      }
      if (reach >= 1 && fade > 0.5) for (let i = 0; i < 4; i++) this.add({ x: b.x, y: b.y, vx: rnd(-240, 240), vy: rnd(-280, -40), ay: 700, life: rnd(0.35, 0.6), size: rnd(2.5, 4.5), shape: 'drop', glow: false, color: p.mid });
    });
  }

  /** A deep-sea lure pulses, then flashes across the field. */
  private lure(a: Pt, b: Pt, size: number) {
    const p = PALETTE.water, orb = { x: a.x + (b.x - a.x) * 0.15, y: a.y - size * 0.45 };
    this.later(0, 800, (g, t, now) => {
      g.globalCompositeOperation = 'lighter';
      const pulse = 0.6 + 0.4 * Math.sin(now / 60), r = 14 + 8 * pulse * (t < 0.5 ? t * 2 : 1);
      g.globalAlpha = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
      g.drawImage(this.glow('#7ff6e4'), orb.x - r * 2.2, orb.y - r * 2.2, r * 4.4, r * 4.4);
      g.drawImage(this.glow('#ffffff'), orb.x - r * 0.7, orb.y - r * 0.7, r * 1.4, r * 1.4);
      if (t > 0.5) {
        const k = (t - 0.5) / 0.5;
        g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = '#c8fff6'; g.lineWidth = 3;
        for (let i = 0; i < 14; i++) { const ang = (i / 14) * Math.PI * 2 + k; g.beginPath(); g.moveTo(b.x + Math.cos(ang) * 20, b.y + Math.sin(ang) * 20); g.lineTo(b.x + Math.cos(ang) * (40 + 140 * k), b.y + Math.sin(ang) * (40 + 140 * k)); g.stroke(); }
        g.drawImage(this.glow('#e8fffb'), b.x - 90 * k - 20, b.y - 90 * k - 20, 180 * k + 40, 180 * k + 40);
      }
    });
    for (let i = 0; i < 10; i++) this.add({ x: orb.x + rnd(-20, 20), y: orb.y + rnd(-20, 20), vx: rnd(-20, 20), vy: rnd(-30, -5), life: rnd(0.6, 1), size: rnd(2, 4), color: p.hot });
  }

  /** A bite clamps shut; a tusk or a shell rams in. */
  private melee(kind: string | undefined, el: Element, at: Pt, size: number, p: Palette) {
    if (kind === 'bite') {
      this.later(100, 380, (g, t) => {
        const close = ease.in(Math.min(1, t / 0.5)), gap = (1 - close) * size * 0.32, w = size * 0.4, fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        g.globalAlpha = fade;
        for (const side of [-1, 1]) {
          // A jaw: a curved band of gum, its teeth pointing at the other jaw, the two outer ones fangs.
          g.save(); g.translate(at.x, at.y + side * gap); g.rotate(side * (1 - close) * 0.25);
          g.fillStyle = '#5a1420'; g.strokeStyle = '#1e0609'; g.lineWidth = 3;
          g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, side * size * 0.2, w, 0); g.quadraticCurveTo(0, side * size * 0.1, -w, 0); g.fill(); g.stroke();
          const teeth = 7;
          for (let i = 0; i < teeth; i++) {
            const k = (i + 0.5) / teeth, x = -w + k * w * 2, y = side * size * 0.06 * (1 - (2 * k - 1) ** 2);
            const fang = i === 1 || i === teeth - 2, len = size * (fang ? 0.16 : 0.08), half = w / teeth * (fang ? 0.75 : 0.6);
            const tooth = g.createLinearGradient(x, y, x, y - side * len); tooth.addColorStop(0, '#fffdf6'); tooth.addColorStop(1, '#d9cfb8');
            g.fillStyle = tooth; g.beginPath(); g.moveTo(x - half, y); g.lineTo(x, y - side * len); g.lineTo(x + half, y); g.closePath(); g.fill();
            g.strokeStyle = '#3b2a20'; g.lineWidth = 1.2; g.stroke();
          }
          g.restore();
        }
        if (close >= 1) {
          g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#fff3d8'; g.lineCap = 'round';
          for (let i = -1; i <= 1; i++) { g.globalAlpha = fade * 0.8; g.lineWidth = 3 - Math.abs(i); g.beginPath(); g.moveTo(at.x - w * 1.3, at.y + i * 10 - 14); g.lineTo(at.x + w * 1.3, at.y + i * 10 + 14); g.stroke(); }
        }
      });
      this.at(300, () => this.burst(at, size * 0.6, el === 'fire' ? PALETTE.fire : p, 20, 'spark'));
      return;
    }
    if (kind === 'tusk') {
      this.at(170, () => { this.burst(at, size * 0.7, PALETTE.electric, 22, 'spark'); this.crackle(at, size); });
      return;
    }
    if (kind === 'bash') {
      this.at(170, () => { for (let i = 0; i < 10; i++) this.add({ x: at.x, y: at.y, vx: rnd(-260, 260), vy: rnd(-300, -40), ay: 800, life: rnd(0.4, 0.7), size: rnd(4, 7), spin: rnd(-12, 12), shape: 'shard', glow: false, color: ['#e9dcc0', '#b9a684', '#7f6b4c'][i % 3] }); });
      return;
    }
    this.at(170, () => this.burst(at, size * 0.6, PALETTE.none, 10, 'star'));
  }
  /** Little arcs of electricity hop around the target. */
  private crackle(at: Pt, size: number) {
    const p = PALETTE.electric;
    this.later(0, 420, (g, t, now) => {
      if (Math.floor(now / 50) % 2) return;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - t; g.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const a0 = rnd(0, Math.PI * 2), r = size * 0.45, s = { x: at.x + Math.cos(a0) * r, y: at.y + Math.sin(a0) * r * 0.8 }, e = { x: at.x + Math.cos(a0 + 1.4) * r, y: at.y + Math.sin(a0 + 1.4) * r * 0.8 };
        const path = jagged(s, e, 4, 0.35);
        for (const [w, c] of [[6, p.deep], [2, p.core]] as const) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); path.forEach((q, j) => (j ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.stroke(); }
      }
    });
  }

  private burst(at: Pt, r: number, p: Palette, n: number, shape: Particle['shape']) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(r * 2.2, r * 4.5);
      this.add({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4, life: rnd(0.3, 0.55), size: shape === 'star' ? rnd(5, 9) : rnd(2, 3.5), spin: rnd(-8, 8), shape, color: [p.core, p.hot, p.mid][i % 3] });
    }
  }

  /** Every hit: a shockwave ring, a flash, and debris of the attack's element. */
  private impact(at: Pt, size: number, p: Palette, crit: boolean, kind?: string) {
    const rings = crit ? 2 : 1;
    for (let k = 0; k < rings; k++) {
      this.later(k * 90, 420, (g, t) => {
        const r = size * (0.2 + 0.75 * ease.out(t)) * (crit ? 1.25 : 1);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - t) * 0.9;
        g.strokeStyle = p.hot; g.lineWidth = 7 * (1 - t) + 1; g.beginPath(); g.ellipse(at.x, at.y, r, r * 0.72, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = p.core; g.lineWidth = 2.5 * (1 - t) + 0.5; g.stroke();
      });
    }
    this.later(0, 240, (g, t) => { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - t; const s = size * (crit ? 0.9 : 0.6) * (0.6 + t); g.drawImage(this.glow(p.core), at.x - s, at.y - s, s * 2, s * 2); });
    const n = crit ? 30 : 18;
    if (p === PALETTE.fire) {
      this.burst(at, size * 0.5, p, n, 'glow');
      for (let i = 0; i < 6; i++) this.add({ x: at.x + rnd(-15, 15), y: at.y + rnd(-10, 10), vx: rnd(-30, 30), vy: rnd(-60, -20), life: rnd(0.6, 1.1), size: rnd(10, 16), grow: 30, shape: 'smoke', glow: false, color: p.smoke });
    } else if (p === PALETTE.water || kind === 'jet' || kind === 'bash') {
      for (let i = 0; i < n; i++) { const a = rnd(Math.PI * 1.05, Math.PI * 1.95); const v = rnd(150, 340); this.add({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ay: 800, life: rnd(0.4, 0.7), size: rnd(2.5, 5), shape: 'drop', glow: false, color: i % 2 ? PALETTE.water.hot : PALETTE.water.mid }); }
    } else if (p === PALETTE.electric) {
      this.burst(at, size * 0.6, p, n, 'spark'); this.crackle(at, size);
    } else if (p === PALETTE.grass) {
      for (let i = 0; i < Math.round(n * 0.6); i++) this.add({ x: at.x, y: at.y, vx: rnd(-200, 200), vy: rnd(-240, -40), ay: 160, drag: 2.5, life: rnd(0.6, 1), size: rnd(5, 8), spin: rnd(-9, 9), shape: 'leaf', glow: false, color: [p.hot, p.mid, p.deep][i % 3] });
    } else {
      this.burst(at, size * 0.5, p, Math.round(n * 0.6), 'star');
    }
  }

  // ------------------------------------------------------------------ support moves

  /** A hex-lit bubble rises around the guard. */
  private guard(c: Pt, size: number) {
    this.later(0, 700, (g, t, now) => {
      const r = size * 0.62 * ease.out(Math.min(1, t / 0.35)), fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      g.globalAlpha = fade;
      const gr = g.createRadialGradient(c.x, c.y, r * 0.5, c.x, c.y, r);
      gr.addColorStop(0, '#9fe6ff00'); gr.addColorStop(0.8, '#9fe6ff55'); gr.addColorStop(1, '#e9fbffcc');
      g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.fill();
      g.globalCompositeOperation = 'lighter'; g.strokeStyle = '#d8f6ff'; g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + now / 900, x = c.x + Math.cos(a) * r * 0.55, y = c.y + Math.sin(a) * r * 0.55, h = r * 0.24;
        g.globalAlpha = fade * (0.35 + 0.35 * Math.sin(now / 120 + i));
        g.beginPath(); for (let k = 0; k < 6; k++) { const b = (k / 6) * Math.PI * 2; g.lineTo(x + Math.cos(b) * h, y + Math.sin(b) * h); } g.closePath(); g.stroke();
      }
    });
  }

  private camo(c: Pt, size: number) {
    const p = PALETTE.grass;
    for (let i = 0; i < 12; i++) {
      const phase = (i / 12) * Math.PI * 2, tone = [p.hot, p.mid, p.deep][i % 3], s = rnd(7, 10);
      this.later(i * 25, 700, (g, t) => {
        const a = phase + t * 7, r = size * (0.55 - 0.2 * t), x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r * 0.55 - t * 20;
        g.globalAlpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2; g.translate(x, y); g.rotate(a * 2); g.fillStyle = tone;
        g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); g.fill();
      });
    }
  }

  private heal(c: Pt, size: number) {
    const base = { x: c.x, y: c.y + size * 0.35 };
    this.later(0, 700, (g, t) => {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - t) * 0.8; g.strokeStyle = '#b9ff9a'; g.lineWidth = 3;
      const r = size * (0.3 + 0.5 * ease.out(t)); g.beginPath(); g.ellipse(base.x, base.y, r, r * 0.3, 0, 0, Math.PI * 2); g.stroke();
    });
    for (let i = 0; i < 16; i++) this.add({ x: c.x + rnd(-size * 0.35, size * 0.35), y: base.y - rnd(0, size * 0.3), vx: rnd(-10, 10), vy: rnd(-110, -60), life: rnd(0.6, 1), size: i % 4 ? rnd(3, 6) : rnd(6, 8), shape: i % 4 ? 'glow' : 'plus', color: i % 3 ? '#b9ff9a' : '#fff3a8' });
  }

  // ------------------------------------------------------------------ the capsule

  private capThrow(from: Pt, rest: Pt, size: number) {
    const r = size * CAPSULE, start = { x: from.x, y: from.y - size * 0.2 }, lift = Math.max(90, Math.abs(rest.y - start.y) + 110);
    this.later(0, 600, (g, t) => {
      const k = ease.inOut(t), spin = t * Math.PI * 5;
      for (let i = 4; i >= 1; i--) {
        const q = arc(start, rest, Math.max(0, k - i * 0.05), lift);
        g.globalAlpha = 0.12 * (5 - i); drawCapsule(g, q.x, q.y, r * (0.9 + 0.2 * (1 - k)), spin - i * 0.5, 0, 0);
      }
      const q = arc(start, rest, k, lift); g.globalAlpha = 1;
      drawCapsule(g, q.x, q.y, r * (1 + 0.25 * (1 - k)), spin, 0, 0);
      if (Math.random() < 0.7) this.add({ x: q.x, y: q.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: rnd(0.25, 0.45), size: rnd(2, 3.5), shape: 'star', color: '#fff3c4' });
    }, () => {
      for (let i = 0; i < 8; i++) this.add({ x: rest.x, y: rest.y + r, vx: rnd(-80, 80), vy: rnd(-40, -5), drag: 3, life: 0.5, size: rnd(5, 8), grow: 12, shape: 'smoke', glow: false, color: '#d9c9a3' });
    });
  }

  private capOpen(rest: Pt, creature: Pt, size: number) {
    const r = size * CAPSULE;
    this.later(0, 650, (g, t, now) => {
      const open = ease.out(Math.min(1, t / 0.25));
      const mouth = { x: rest.x, y: rest.y - r * 0.4 };
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, t * 4) * (t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2);
      // A soft cone of light: layered, each wider and fainter, so it has no hard edge.
      const ang = Math.atan2(creature.y - mouth.y, creature.x - mouth.x), len = Math.hypot(creature.x - mouth.x, creature.y - mouth.y) + size * 0.25;
      g.translate(mouth.x, mouth.y); g.rotate(ang);
      for (const [w, al] of [[0.55, 0.12], [0.4, 0.16], [0.26, 0.22], [0.12, 0.35]] as const) {
        const half = size * w * (1 + 0.06 * Math.sin(now / 45)), gr = g.createLinearGradient(0, 0, len, 0);
        gr.addColorStop(0, `rgba(255,255,255,${al * 2})`); gr.addColorStop(0.6, `rgba(255,214,200,${al})`); gr.addColorStop(1, 'rgba(255,190,170,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, -r * 0.35); g.quadraticCurveTo(len * 0.5, -half * 0.8, len, -half); g.lineTo(len, half); g.quadraticCurveTo(len * 0.5, half * 0.8, 0, r * 0.35); g.closePath(); g.fill();
      }
      g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      g.globalAlpha = Math.min(1, t * 4) * (t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2) * 0.8; g.strokeStyle = '#fff1ea'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a0 = now / 150 + (i * Math.PI * 2) / 3; g.beginPath(); g.ellipse(creature.x, creature.y, size * (0.42 - t * 0.2), size * (0.16 - t * 0.06), 0, a0, a0 + 1.6); g.stroke(); }
      g.drawImage(this.glow('#ffe1d8'), creature.x - size * 0.6, creature.y - size * 0.6, size * 1.2, size * 1.2);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      drawCapsule(g, rest.x, rest.y, r, 0, open, 1);
      for (let i = 0; i < 4; i++) {
        const sx = creature.x + rnd(-size * 0.35, size * 0.35), sy = creature.y + rnd(-size * 0.35, size * 0.35), tt = rnd(0.25, 0.4);
        this.add({ x: sx, y: sy, vx: (mouth.x - sx) / tt, vy: (mouth.y - sy) / tt, life: tt, size: rnd(3, 6), color: i % 2 ? '#ffffff' : '#ff9c84' });
      }
    });
  }

  private capShake(rest: Pt, size: number) {
    const r = size * CAPSULE;
    this.later(0, 1400, (g, t) => {
      const k = (t * 3) % 1, wob = Math.sin(k * Math.PI * 2) * (k < 0.5 ? 0.42 : 0.2) * (k < 0.75 ? 1 : (1 - k) * 4);
      const hop = Math.max(0, Math.sin(k * Math.PI)) * r * 0.25, blink = k > 0.1 && k < 0.45 ? 1 : 0.15;
      drawCapsule(g, rest.x, rest.y - hop, r, wob, 0, blink, '#ff4d3a');
    });
    for (const ms of [120, 585, 1050]) this.at(ms, () => { for (let i = 0; i < 4; i++) this.add({ x: rest.x + rnd(-r, r), y: rest.y + r, vx: rnd(-50, 50), vy: rnd(-25, -5), drag: 3, life: 0.45, size: rnd(4, 7), grow: 10, shape: 'smoke', glow: false, color: '#d9c9a3' }); });
  }

  private capCatch(rest: Pt, size: number) {
    const r = size * CAPSULE;
    this.later(0, 900, (g, t) => {
      g.globalAlpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
      drawCapsule(g, rest.x, rest.y, r * (1 + 0.15 * Math.sin(Math.min(1, t * 4) * Math.PI)), 0, 0, 1, '#7dff8a');
      g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 1 - t;
      g.strokeStyle = '#fff7c2'; g.lineWidth = 4; const rr = r * (1.5 + 5 * ease.out(t)); g.beginPath(); g.arc(rest.x, rest.y, rr, 0, Math.PI * 2); g.stroke();
    });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.add({ x: rest.x, y: rest.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220 - 60, drag: 3.5, life: 0.7, size: rnd(6, 9), spin: rnd(-6, 6), shape: 'star', color: i % 2 ? '#fff3a8' : '#ffffff' }); }
    for (let i = 0; i < 12; i++) this.add({ x: rest.x + rnd(-r * 2, r * 2), y: rest.y, vx: rnd(-30, 30), vy: rnd(-120, -60), life: rnd(0.6, 1), size: rnd(2, 4), color: '#b9ff9a' });
  }

  /** Called back: a red beam pulls the creature into the capsule waiting on its pad. */
  private recall(rest: Pt, creature: Pt, size: number) {
    const r = size * CAPSULE;
    this.later(0, 900, (g, t, now) => {
      const mouth = { x: rest.x, y: rest.y - r * 0.4 };
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, t * 4) * (t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15);
      g.strokeStyle = '#ff6a50'; g.lineWidth = 8 + 3 * Math.sin(now / 35); g.lineCap = 'round';
      g.beginPath(); g.moveTo(mouth.x, mouth.y); g.lineTo(creature.x, creature.y); g.stroke();
      g.strokeStyle = '#ffe1d8'; g.lineWidth = 3; g.stroke();
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      drawCapsule(g, rest.x, rest.y, r * ease.out(Math.min(1, t * 3)), 0, t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2, 1);
      if (Math.random() < 0.8) { const sx = creature.x + rnd(-size * 0.3, size * 0.3), sy = creature.y + rnd(-size * 0.3, size * 0.3); this.add({ x: sx, y: sy, vx: (mouth.x - sx) / 0.3, vy: (mouth.y - sy) / 0.3, life: 0.3, size: rnd(3, 5), color: '#ff9c84' }); }
    });
  }

  /** A fainted creature breaks up into motes that drift away. */
  private faint(c: Pt, size: number) {
    for (let i = 0; i < 40; i++) this.add({ x: c.x + rnd(-size * 0.35, size * 0.35), y: c.y + rnd(-size * 0.3, size * 0.35), vx: rnd(-25, 25), vy: rnd(-70, -20), drag: 0.5, life: rnd(0.6, 1.1), size: rnd(2, 4.5), color: i % 3 ? '#f3ecd2' : '#c9d6e0' });
  }

  /** The next creature bursts out of its capsule. */
  private sendOut(c: Pt, size: number) {
    this.later(0, 450, (g, t) => {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - t;
      const s = size * (0.3 + 0.8 * ease.out(t)); g.drawImage(this.glow('#ffffff'), c.x - s, c.y - s, s * 2, s * 2);
      g.strokeStyle = '#fff3c4'; g.lineWidth = 4 * (1 - t) + 1; g.beginPath(); g.ellipse(c.x, c.y + size * 0.3, s * 0.8, s * 0.25, 0, 0, Math.PI * 2); g.stroke();
    });
    this.burst(c, size * 0.45, PALETTE.none, 12, 'star');
  }
}

/** A jagged line a → b: midpoint displacement, `depth` times, by up to `rough` of each segment's length. */
function jagged(a: Pt, b: Pt, depth: number, rough: number): Pt[] {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const next: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], len = Math.hypot(q.x - p.x, q.y - p.y), off = rnd(-1, 1) * len * rough;
      const nx = -(q.y - p.y) / (len || 1), ny = (q.x - p.x) / (len || 1);
      next.push({ x: (p.x + q.x) / 2 + nx * off, y: (p.y + q.y) / 2 + ny * off }, q);
    }
    pts = next;
  }
  return pts;
}

/**
 * The capture capsule: a red top, a white bottom, a black band and a button, shaded as a sphere.
 * `open` lifts the top on its hinge (0 closed, 1 open); `glow` lights the button in `button`.
 */
export function drawCapsule(g: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, open: number, glow: number, button = '#ffffff') {
  if (r <= 0.5) return;
  g.save();
  g.translate(x, y); g.rotate(angle);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#0b1a1544'; g.beginPath(); g.ellipse(0, r * 1.05, r * 0.95, r * 0.25, 0, 0, Math.PI * 2); g.fill();
  // Bottom half.
  const low = g.createRadialGradient(-r * 0.35, r * 0.1, r * 0.1, 0, 0, r);
  low.addColorStop(0, '#ffffff'); low.addColorStop(0.7, '#e3e3e3'); low.addColorStop(1, '#9a9a9a');
  g.fillStyle = low; g.beginPath(); g.arc(0, 0, r, 0, Math.PI); g.closePath(); g.fill();
  // Top half, lifted on its hinge at the back.
  g.save();
  g.translate(-r, 0); g.rotate(-open * 1.15); g.translate(r, 0);
  const high = g.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.08, 0, 0, r);
  high.addColorStop(0, '#ff9a86'); high.addColorStop(0.55, '#e8392b'); high.addColorStop(1, '#8e1810');
  g.fillStyle = high; g.beginPath(); g.arc(0, 0, r, Math.PI, Math.PI * 2); g.closePath(); g.fill();
  g.fillStyle = '#ffffffb0'; g.beginPath(); g.ellipse(-r * 0.38, -r * 0.55, r * 0.28, r * 0.14, -0.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(1.5, r * 0.09); g.beginPath(); g.arc(0, 0, r, Math.PI, Math.PI * 2); g.stroke();
  g.restore();
  if (open > 0.05) {
    g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,240,220,${0.8 * open})`;
    g.beginPath(); g.ellipse(0, 0, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  // The band and the button.
  g.strokeStyle = '#1a1a1a'; g.lineWidth = Math.max(1.5, r * 0.09);
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI); g.stroke();
  g.fillStyle = '#1a1a1a'; g.fillRect(-r, -r * 0.09, r * 2, r * 0.18);
  if (open < 0.5) {
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(0, 0, r * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(0, 0, r * 0.22, 0, Math.PI * 2); g.fill();
    if (glow > 0) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow;
      const b = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.7); b.addColorStop(0, button); b.addColorStop(1, button + '00');
      g.fillStyle = b; g.beginPath(); g.arc(0, 0, r * 0.7, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}
