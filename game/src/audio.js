// Synthesized WebAudio: engine, siren, horns, gunshots, pickup blips, bass loop.
// Everything is generated — no audio assets. Starts on first user gesture.
export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.started = false;
  }
  init() {
    if (this.started) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.5;
    this.master.connect(c.destination);
    // engine: sawtooth through lowpass, pitch follows speed
    this.engOsc = c.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 40;
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 300;
    this.engGain = c.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter).connect(this.engGain).connect(this.master);
    this.engOsc.start();
    // siren: square LFO between two tones
    this.sirOsc = c.createOscillator(); this.sirOsc.type = 'triangle'; this.sirOsc.frequency.value = 700;
    this.sirGain = c.createGain(); this.sirGain.gain.value = 0;
    this.sirOsc.connect(this.sirGain).connect(this.master);
    this.sirOsc.start();
    this.started = true;
    this.bassLoop();
  }
  bassLoop() {
    const notes = [55, 55, 65.41, 49]; // A1 A1 C2 G1
    let i = 0;
    const step = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = notes[i % notes.length];
      g.gain.setValueAtTime(this.muted ? 0 : 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.45);
      i++;
      this.bassTimer = setTimeout(step, 460);
    };
    step();
  }
  setEngine(on, speed01) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(on && !this.muted ? 0.05 + speed01 * 0.05 : 0, t, 0.1);
    this.engOsc.frequency.setTargetAtTime(45 + speed01 * 130, t, 0.1);
  }
  setSiren(on, time) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.sirGain.gain.setTargetAtTime(on && !this.muted ? 0.018 : 0, t, 0.15);
    if (on) this.sirOsc.frequency.setTargetAtTime(650 + Math.sin(time * 5.2) * 220, t, 0.05);
  }
  blip(freq = 880, dur = 0.09, vol = 0.12) {
    if (!this.started || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur);
  }
  horn() { this.blip(370, 0.28, 0.07); setTimeout(() => this.blip(440, 0.2, 0.05), 30); }
  shot(enemy = false) {
    if (!this.started || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const len = c.sampleRate * 0.12;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = enemy ? 1200 : 2400;
    const g = c.createGain(); g.gain.value = enemy ? 0.15 : 0.25;
    src.connect(f).connect(g).connect(this.master); src.start(t);
  }
  cash() { this.blip(1320, 0.07, 0.12); setTimeout(() => this.blip(1760, 0.12, 0.12), 70); }
  toggleMute() { this.muted = !this.muted; return this.muted; }
}
