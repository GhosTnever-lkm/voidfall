// Процедурные звуки VOIDFALL. AudioContext создаётся только после жеста пользователя.
export class AudioManager {
  constructor({ enabled = false, volume = 0.32, maxVoices = 18 } = {}) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(0.7, Number(volume) || 0));
    this.maxVoices = Math.max(4, Math.min(32, Math.floor(maxVoices) || 18));
    this.ctx = null;
    this.master = null;
    this.voices = new Set();
    this.noise = null;
    this.supported = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  }

  unlock() {
    if (!this.supported || typeof window === 'undefined') return false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Context();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 8;
      limiter.ratio.value = 10;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.15;
      this.master.connect(limiter).connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    } catch {
      this.ctx = null;
      this.master = null;
      this.supported = false;
      return false;
    }
  }

  setEnabled(value) {
    this.enabled = !!value;
    if (!this.ctx || !this.master) return this.enabled;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, t, 0.025);
    return this.enabled;
  }

  toggle() { return this.setEnabled(!this.enabled); }

  play(name) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const recipe = this[`_${name}`];
    if (typeof recipe !== 'function') return;
    try { recipe.call(this, this.ctx); } catch { /* Sound must never interrupt gameplay. */ }
  }

  destroy() {
    for (const source of [...this.voices]) this._stop(source);
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.noise = null;
  }

  _track(source, duration, startAt = this.ctx.currentTime) {
    while (this.voices.size >= this.maxVoices) this._stop(this.voices.values().next().value);
    this.voices.add(source);
    source.onended = () => this.voices.delete(source);
    source.start(startAt);
    source.stop(startAt + duration);
  }

  _stop(source) {
    try { source.stop(); } catch {}
    this.voices.delete(source);
  }

  _noiseBuffer(ctx) {
    if (this.noise) return this.noise;
    const length = Math.floor(ctx.sampleRate * 0.35);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return this.noise;
  }

  _tone({ frequency = 440, endFrequency = frequency, duration = 0.1, type = 'sine', gain = 0.12 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime;
    const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), t);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t + duration);
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(envelope).connect(this.master);
    this._track(oscillator, duration + 0.015);
  }

  _noiseHit({ duration = 0.08, frequency = 1500, gain = 0.12 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
    source.buffer = this._noiseBuffer(ctx);
    filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.8;
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(envelope).connect(this.master);
    this._track(source, duration + 0.015);
  }

  _shoot() { this._tone({ frequency: 760, endFrequency: 220, duration: 0.075, type: 'square', gain: 0.055 }); }
  _hit() { this._noiseHit({ duration: 0.055, frequency: 1700, gain: 0.075 }); }
  _kill() { this._tone({ frequency: 360, endFrequency: 90, duration: 0.16, type: 'sawtooth', gain: 0.07 }); }
  _pickup() { this._tone({ frequency: 820, endFrequency: 1050, duration: 0.07, type: 'triangle', gain: 0.06 }); }
  _levelup() {
    for (const [i, frequency] of [523, 659, 784, 1047].entries()) {
      const start = this.ctx.currentTime + i * 0.075;
      this._toneAt(frequency, start, 0.22, 0.07);
    }
  }
  _boss() { this._tone({ frequency: 82, endFrequency: 48, duration: 0.75, type: 'sawtooth', gain: 0.12 }); }
  _dash() { this._noiseHit({ duration: 0.12, frequency: 900, gain: 0.065 }); }
  _phase_shift() { this._tone({ frequency: 680, endFrequency: 1450, duration: 0.18, type: 'sine', gain: 0.08 }); }
  _void_nova() { this._tone({ frequency: 180, endFrequency: 48, duration: 0.42, type: 'sawtooth', gain: 0.11 }); }
  _time_fold() { this._tone({ frequency: 420, endFrequency: 180, duration: 0.36, type: 'triangle', gain: 0.075 }); }
  _ui() { this._tone({ frequency: 1150, endFrequency: 1420, duration: 0.045, type: 'triangle', gain: 0.045 }); }

  _toneAt(frequency, start, duration, gain) {
    const ctx = this.ctx, oscillator = ctx.createOscillator(), envelope = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(this.master);
    this._track(oscillator, duration + 0.015, start);
  }
}
