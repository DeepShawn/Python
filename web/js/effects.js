// Python Nexus 沉浸式特效：黑客模式字符流、科幻模式粒子、执行音效。
// 所有特效均可关闭；系统开启「减少动态效果」时默认关闭动画背景。

export class Effects {
  constructor(bgCanvas, fgCanvas) {
    this.bg = bgCanvas;
    this.fg = fgCanvas;
    this.theme = "standard";
    this.motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.sound = false;
    this.particles = [];
    this._audio = null;
    this._raf = 0;
    this._drops = [];
    addEventListener("resize", () => this._resize());
    this._resize();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  setTheme(theme) { this.theme = theme; this._drops = []; this._clearBg(); }
  setMotion(on) { this.motion = on; this._clearBg(); this.particles = []; }
  setSound(on) { this.sound = on; }

  _resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [this.bg, this.fg]) {
      c.width = innerWidth * dpr;
      c.height = innerHeight * dpr;
      c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this._drops = [];
  }

  _clearBg() {
    const ctx = this.bg.getContext("2d");
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  /** 在某一行的位置触发执行特效。 */
  pulse(rect, kind = "line") {
    if (this.motion && this.theme === "quantum" && rect) {
      const n = kind === "call" ? 26 : 12;
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: rect.left + 30 + Math.random() * Math.min(rect.width - 40, 320),
          y: rect.top + rect.height / 2,
          vx: (Math.random() - 0.5) * 2.4,
          vy: (Math.random() - 0.5) * 2.4 - 0.4,
          life: 1,
          hue: kind === "exception" ? 350 : kind === "call" ? 280 : 185 + Math.random() * 40,
        });
      }
    }
    this.beep(kind);
  }

  beep(kind = "line") {
    if (!this.sound) return;
    try {
      this._audio = this._audio || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audio;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const base = { standard: 660, quantum: 880, matrix: 440 }[this.theme] || 660;
      const freq = { line: base, call: base * 1.5, return: base * 0.75, exception: 180, end: base * 2 }[kind] || base;
      osc.type = this.theme === "matrix" ? "square" : this.theme === "quantum" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (this.theme === "quantum") osc.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch { /* 音频不可用时静默 */ }
  }

  _loop(t) {
    this._raf = requestAnimationFrame(this._loop);
    if (!this.motion || document.hidden) return;
    if (this.theme === "matrix") this._matrix(t);
    else if (this.theme === "quantum") this._stars(t);
    this._particles();
  }

  _matrix(t) {
    if (this._last && t - this._last < 50) return;
    this._last = t;
    const ctx = this.bg.getContext("2d");
    const size = 15;
    const cols = Math.ceil(innerWidth / size);
    if (this._drops.length !== cols) this._drops = Array.from({ length: cols }, () => Math.random() * -60);
    ctx.fillStyle = "rgba(0, 8, 2, 0.12)";
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.font = `${size - 2}px monospace`;
    const chars = "アイウエオカキクケコｱｲｳｴｵ01<>{}[]=+*/#def:if;λπΣ";
    for (let i = 0; i < cols; i++) {
      const y = this._drops[i] * size;
      ctx.fillStyle = Math.random() > 0.96 ? "#d6ffd9" : "rgba(0, 255, 102, 0.55)";
      ctx.fillText(chars[(Math.random() * chars.length) | 0], i * size, y);
      if (y > innerHeight && Math.random() > 0.975) this._drops[i] = 0;
      this._drops[i] += 1;
    }
  }

  _stars(t) {
    if (this._last && t - this._last < 33) return;
    this._last = t;
    const ctx = this.bg.getContext("2d");
    if (!this._stars_) {
      this._stars_ = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
    }
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const s of this._stars_) {
      s.y += 0.0004 + s.z * 0.0008;
      if (s.y > 1) { s.y = 0; s.x = Math.random(); }
      const a = 0.25 + 0.5 * Math.abs(Math.sin(t / 900 + s.x * 10));
      ctx.fillStyle = `rgba(120, 220, 255, ${a * s.z})`;
      ctx.fillRect(s.x * innerWidth, s.y * innerHeight, 1 + s.z * 1.5, 1 + s.z * 1.5);
    }
  }

  _particles() {
    const ctx = this.fg.getContext("2d");
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (!this.particles.length) return;
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.life -= 0.025;
      ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${Math.max(p.life, 0)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8 + p.life * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
