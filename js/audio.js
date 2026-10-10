import { THREE, clamp, G, DOM } from './core.js';

export const AU = {
    ctx: null, master: null, noise: null, ready: false,
    lastShotAt: 0, shotCount: 0,
    sfxVolume: (() => {
        try {
            const v = parseFloat(localStorage.getItem('nss_sfx_vol'));
            return Number.isFinite(v) ? clamp(v, 0, 1) : 0.5;
        } catch (e) { void e; return 0.5; }
    })(),
    _noiseVoices: null, _toneVoices: null, _nvi: 0, _tvi: 0, _noiseSrc: null,

    setSfxVolume(v) {
        this.sfxVolume = clamp(Number(v) || 0, 0, 1);
        if (this.master) {
            this.master.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
        }
        try { localStorage.setItem('nss_sfx_vol', String(this.sfxVolume)); } catch (e) { void e; }
    },

    init() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.sfxVolume;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 2.0);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;

        const mkPan = () => this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.start();
        this._noiseSrc = src;

        this._noiseVoices = [];
        for (let i = 0; i < 10; i++) {
            const filt = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            const pan = mkPan();
            gain.gain.value = 0.0001;
            src.connect(filt);
            filt.connect(gain);
            if (pan) { gain.connect(pan); pan.connect(this.master); }
            else gain.connect(this.master);
            this._noiseVoices.push({ filt, gain, pan });
        }

        this._toneVoices = [];
        for (let i = 0; i < 8; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 440;
            const gain = this.ctx.createGain();
            const pan = mkPan();
            gain.gain.value = 0.0001;
            osc.connect(gain);
            if (pan) { gain.connect(pan); pan.connect(this.master); }
            else gain.connect(this.master);
            osc.start();
            this._toneVoices.push({ osc, gain, pan });
        }
        this.ready = true;
    },

    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        Music.start();
    },

    noiseHit(t, dur, vol, f0, f1, pan = 0, type = 'lowpass', q = 0.8) {
        if (!this.ready || !this._noiseVoices) return;
        const ctx = this.ctx;
        const v = this._noiseVoices[this._nvi++ % this._noiseVoices.length];
        const at = ctx.currentTime + t;
        const filt = v.filt.frequency;
        v.filt.type = type;
        v.filt.Q.setValueAtTime(q, at);
        filt.cancelScheduledValues(at);
        filt.setValueAtTime(Math.max(30, f0), at);
        filt.exponentialRampToValueAtTime(Math.max(30, f1), at + dur);
        const g = v.gain.gain;
        g.cancelScheduledValues(at);
        g.setValueAtTime(Math.max(0.0001, vol), at);
        g.exponentialRampToValueAtTime(0.0001, at + dur);
        if (v.pan) v.pan.pan.setValueAtTime(clamp(pan, -1, 1), at);
    },

    toneHit(t, dur, vol, f0, f1, type = 'sine', pan = 0) {
        if (!this.ready || !this._toneVoices) return;
        const ctx = this.ctx;
        const v = this._toneVoices[this._tvi++ % this._toneVoices.length];
        const at = ctx.currentTime + t;
        v.osc.type = type;
        const fr = v.osc.frequency;
        fr.cancelScheduledValues(at);
        fr.setValueAtTime(Math.max(20, f0), at);
        if (f1 !== f0) fr.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
        const g = v.gain.gain;
        g.cancelScheduledValues(at);
        g.setValueAtTime(Math.max(0.0001, vol), at);
        g.exponentialRampToValueAtTime(0.0001, at + dur);
        if (v.pan) v.pan.pan.setValueAtTime(clamp(pan, -1, 1), at);
    },

    SHOOT_PRESETS: {
        pistol:   { vol: 0.42, dur: 0.13, f0: 3600, f1: 420, thump: 150, tv: 0.30 },
        revolver: { vol: 0.55, dur: 0.20, f0: 3000, f1: 240, thump: 115, tv: 0.45 },
        dmr:      { vol: 0.50, dur: 0.17, f0: 4200, f1: 350, thump: 140, tv: 0.36 },
        rifle:    { vol: 0.42, dur: 0.12, f0: 3900, f1: 430, thump: 160, tv: 0.28 },
        burst:    { vol: 0.46, dur: 0.13, f0: 3700, f1: 400, thump: 150, tv: 0.32 },
        smg:      { vol: 0.32, dur: 0.09, f0: 4600, f1: 650, thump: 185, tv: 0.22 },
        lmg:      { vol: 0.52, dur: 0.16, f0: 3200, f1: 300, thump: 130, tv: 0.42 },
        shotgun:  { vol: 0.72, dur: 0.30, f0: 2400, f1: 140, thump: 95,  tv: 0.55 },
        sniper:   { vol: 0.85, dur: 0.42, f0: 2600, f1: 110, thump: 85,  tv: 0.55, echo: true },
    },

    shoot(weapon, pan = 0, vol = 1) {
        if (!this.ready) return;
        const nowT = performance.now();
        if (nowT - this.lastShotAt > 100) { this.shotCount = 0; this.lastShotAt = nowT; }
        if (this.shotCount > 5) return;
        this.shotCount++;
        const pr = this.SHOOT_PRESETS[weapon] || this.SHOOT_PRESETS.rifle;
        this.noiseHit(0, pr.dur, pr.vol * vol, pr.f0, pr.f1, pan, 'lowpass', 0.7);
        this.toneHit(0, 0.09, pr.tv * vol, pr.thump, pr.thump * 0.5, 'triangle', pan);
        if (pr.echo) this.noiseHit(0.09, 0.3, pr.vol * 0.35 * vol, 1400, 150, pan, 'lowpass', 0.7);
    },

    reloadStart(pan = 0) {
        this.noiseHit(0.0, 0.04, 0.25, 2500, 900, pan, 'bandpass', 3);
        this.noiseHit(0.13, 0.05, 0.28, 1800, 600, pan, 'bandpass', 3);
    },

    reloadMag(pan = 0) {
        this.noiseHit(0.0, 0.06, 0.3, 900, 300, pan, 'bandpass', 2.2);
        this.toneHit(0.02, 0.05, 0.12, 480, 320, 'square', pan);
    },

    reloadBolt(pan = 0) {
        this.noiseHit(0.0, 0.05, 0.34, 2200, 700, pan, 'bandpass', 3.5);
        this.noiseHit(0.06, 0.04, 0.26, 1500, 500, pan, 'bandpass', 3.5);
    },

    reloadEnd(pan = 0) {
        this.noiseHit(0.0, 0.05, 0.3, 1200, 400, pan, 'bandpass', 2.5);
        this.toneHit(0.02, 0.05, 0.12, 700, 500, 'square', pan);
    },

    hit(headshot, pan = 0) {
        this.toneHit(0, 0.05, 0.16, headshot ? 1500 : 950, headshot ? 2000 : 1250, 'square', pan);
    },

    kill(pan = 0) {
        this.toneHit(0, 0.1, 0.2, 880, 880, 'triangle', pan);
        this.toneHit(0.09, 0.16, 0.2, 1320, 1320, 'triangle', pan);
    },

    explosion(pan = 0, vol = 1) {
        this.noiseHit(0, 0.8, 0.8 * vol, 700, 60, pan, 'lowpass', 0.6);
        this.toneHit(0, 0.5, 0.5 * vol, 70, 28, 'sine', pan);
        this.noiseHit(0.05, 0.5, 0.3 * vol, 2200, 300, pan, 'lowpass', 0.7);
    },

    throwSnd(pan = 0) {
        this.noiseHit(0, 0.16, 0.22, 600, 3000, pan, 'bandpass', 1.2);
    },

    smokeHiss(vol = 0.5) {
        this.noiseHit(0, 1.1, 0.28 * vol, 3200, 1200, 0, 'bandpass', 0.9);
    },

    flashbang(intensity = 1) {
        this.noiseHit(0, 0.12, 0.9, 5000, 400, 0, 'lowpass', 0.5);
        this.toneHit(0, 0.4, 0.5, 90, 40, 'sine', 0);
        const ringVol = 0.1 * clamp(intensity, 0.15, 1);
        this.toneHit(0.02, 2.2 + 2.2 * intensity, ringVol, 4300, 4100, 'sine', 0);
    },

    dry(pan = 0) {
        this.noiseHit(0, 0.03, 0.2, 2000, 800, pan, 'bandpass', 4);
    },

    pickup() {
        this.toneHit(0, 0.18, 0.2, 420, 880, 'sine', 0);
        this.toneHit(0.09, 0.2, 0.16, 620, 1240, 'sine', 0);
    },

    respawnSnd() {
        this.noiseHit(0, 0.4, 0.2, 300, 2600, 0, 'bandpass', 1);
    },

    streakSnd() {
        const notes = [660, 880, 1100, 1320];
        notes.forEach((n, i) => this.toneHit(i * 0.07, 0.16, 0.16, n, n, 'square', 0));
    },

    step(pan = 0, vol = 0.12) {
        this.noiseHit(0, 0.05, vol, 700, 250, pan, 'lowpass', 1.2);
    },

    jump() {
        this.noiseHit(0, 0.12, 0.13, 500, 1300, 0, 'bandpass', 1.5);
        this.toneHit(0, 0.1, 0.07, 190, 270, 'sine', 0);
    },

    land(vol = 0.12) {
        this.noiseHit(0, 0.09, Math.max(0.05, vol), 420, 140, 0, 'lowpass', 1.2);
        this.toneHit(0, 0.09, Math.max(0.03, vol * 0.7), 120, 68, 'sine', 0);
    },

    ui() {
        this.toneHit(0, 0.06, 0.1, 900, 1200, 'square', 0);
    },

    demonScream(kind = 'runner', pan = 0, vol = 1) {
        if (!this.ready) return;
        const base = kind === 'screamer' ? 540 : (kind === 'titan' ? 150 : 360);
        const dur = kind === 'titan' ? 1.7 : 1.15;
        this.toneHit(0, dur, 0.2 * vol, base * 0.5, base * 1.9, 'sawtooth', pan);
        this.toneHit(0.05, dur * 0.85, 0.15 * vol, base * 1.5, base * 0.6, 'sawtooth', pan);
        this.toneHit(0.1, dur * 0.6, 0.09 * vol, base * 2.3, base * 1.2, 'square', pan);
        this.noiseHit(0, dur, 0.12 * vol, 2600, 500, pan, 'bandpass', 1.1);
    },

    demonGrowl(pan = 0, vol = 1) {
        this.toneHit(0, 1.5, 0.18 * vol, 72, 52, 'sawtooth', pan);
        this.noiseHit(0, 1.2, 0.09 * vol, 320, 120, pan, 'lowpass', 1.4);
    },

    demonSpit(pan = 0, vol = 1) {
        this.noiseHit(0, 0.22, 0.2 * vol, 3000, 700, pan, 'bandpass', 1.4);
        this.toneHit(0, 0.14, 0.09 * vol, 320, 120, 'square', pan);
    },

    demonClaw(pan = 0, vol = 1) {
        this.noiseHit(0, 0.12, 0.22 * vol, 5200, 900, pan, 'highpass', 1.0);
        this.noiseHit(0.03, 0.1, 0.16 * vol, 1200, 300, pan, 'bandpass', 2.0);
    },

    demonExplode(pan = 0, vol = 1) {
        this.noiseHit(0, 0.7, 0.7 * vol, 900, 70, pan, 'lowpass', 0.6);
        this.toneHit(0, 0.45, 0.45 * vol, 92, 30, 'sine', pan);
        this.noiseHit(0.05, 0.5, 0.28 * vol, 1800, 200, pan, 'lowpass', 0.8);
    },

    demonSlam(pan = 0, vol = 1) {
        this.toneHit(0, 0.35, 0.5 * vol, 72, 30, 'sine', pan);
        this.noiseHit(0, 0.42, 0.35 * vol, 520, 90, pan, 'lowpass', 0.7);
        this.toneHit(0.05, 0.2, 0.22 * vol, 120, 60, 'square', pan);
    },

    acidSizzle(pan = 0, vol = 1) {
        this.noiseHit(0, 0.5, 0.2 * vol, 2600, 700, pan, 'bandpass', 1.2);
    },

    waveHorn() {
        this.toneHit(0, 1.6, 0.22, 98, 92, 'sawtooth', 0);
        this.toneHit(0.05, 1.5, 0.16, 147, 138, 'sawtooth', 0);
        this.toneHit(0.1, 1.4, 0.1, 196, 184, 'triangle', 0);
    },

    waveBreak() {
        this.toneHit(0, 0.5, 0.14, 660, 440, 'triangle', 0);
        this.toneHit(0.15, 0.6, 0.11, 520, 330, 'triangle', 0);
    },

    waveClear() {
        [523, 659, 784, 1046].forEach((f, i) =>
            this.toneHit(i * 0.09, 0.25, 0.15, f, f, 'triangle', 0));
    },

    defeat() {
        this.toneHit(0, 1.9, 0.28, 220, 52, 'sawtooth', 0);
        this.noiseHit(0, 1.6, 0.22, 520, 60, 0, 'lowpass', 0.7);
    },

    upgradeOk() {
        this.toneHit(0, 0.12, 0.18, 880, 1320, 'square', 0);
        this.toneHit(0.1, 0.18, 0.16, 1320, 1760, 'square', 0);
    },

    deny() {
        this.toneHit(0, 0.15, 0.18, 220, 180, 'square', 0);
    },

    ambientStart() {
        if (!this.ready || this._ambient) return;
        const ctx = this.ctx;
        const g = ctx.createGain();
        g.gain.value = 0.0001;
        g.connect(this.master);
        const o1 = ctx.createOscillator();
        o1.type = 'sawtooth';
        o1.frequency.value = 46;
        const o2 = ctx.createOscillator();
        o2.type = 'sawtooth';
        o2.frequency.value = 46.7;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 180;
        o1.connect(f);
        o2.connect(f);
        f.connect(g);
        o1.start();
        o2.start();
        g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 5);
        this._ambient = { g, o1, o2 };
    },

    ambientStop() {
        if (!this._ambient || !this.ctx) return;
        const { g, o1, o2 } = this._ambient;
        g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 1.2);
        setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) { void e; } }, 1600);
        this._ambient = null;
    },

    heartbeat(vol = 0.3) {
        this.toneHit(0, 0.12, 0.3 * vol, 62, 40, 'sine', 0);
        this.toneHit(0.18, 0.14, 0.22 * vol, 56, 38, 'sine', 0);
    },

    whisper(pan = 0) {
        this.noiseHit(0, 1.8, 0.05, 1200, 2400, pan, 'bandpass', 2.5);
        this.noiseHit(0.4, 1.4, 0.04, 1800, 900, pan, 'bandpass', 3);
    },

    bossSpawn() {
        this.toneHit(0, 1.8, 0.26, 55, 48, 'sawtooth', 0);
        this.toneHit(0.08, 1.6, 0.18, 82, 74, 'sawtooth', 0);
        this.noiseHit(0, 1.4, 0.2, 400, 90, 0, 'lowpass', 0.8);
        this.toneHit(0.3, 1.2, 0.14, 110, 104, 'square', 0);
    },

    nuke() {
        this.noiseHit(0, 2.6, 0.95, 900, 40, 0, 'lowpass', 0.5);
        this.toneHit(0, 2.2, 0.6, 60, 22, 'sine', 0);
        this.toneHit(0.15, 2.4, 0.35, 120, 34, 'sawtooth', 0);
        this.noiseHit(0.5, 2.4, 0.4, 1600, 120, 0, 'lowpass', 0.6);
        this.noiseHit(1.2, 2.2, 0.22, 700, 60, 0, 'lowpass', 0.7);
    },

    nukeAlarm() {
        for (let i = 0; i < 4; i++) {
            this.toneHit(i * 0.42, 0.34, 0.2, 880, 660, 'square', 0);
            this.toneHit(i * 0.42 + 0.2, 0.2, 0.14, 560, 440, 'square', 0);
        }
    },
};

export function spatialSound(pos) {
    if (!G.camera) return { pan: 0, vol: 0 };
    const v = pos.clone().project(G.camera);
    const d = G.camera.position.distanceTo(pos);
    return { pan: clamp(v.x, -1, 1), vol: clamp(1 - d / 70, 0, 1) };
}

export const Music = {
    tracks: ['assets/music/magnific-24k.mp3', 'assets/music/magnific-ckt-rip.mp3'],
    el: null,
    idx: 0,
    started: false,
    muted: false,
    fadeTimer: null,
    volume: 0.26,

    init() {
        if (this.el) return;
        this.el = new Audio();
        this.el.id = 'bg-music';
        this.el.volume = 0;
        this.el.preload = 'auto';
        this.el.style.display = 'none';
        document.body.appendChild(this.el);
        this.el.addEventListener('ended', () => this.next());
        try {
            this.muted = localStorage.getItem('nss_music_muted') === '1';
        } catch (e) { void e; }
        this.updateButton();
    },

    start() {
        this.init();
        if (this.muted) return;
        if (this.started && this.el.src && !this.el.paused) return;
        this.started = true;
        if (!this.el.src) this.el.src = this.tracks[this.idx];
        const p = this.el.play();
        if (p && p.catch) p.catch(() => {});
        this.fadeTo(this.volume, 2.5);
    },

    next() {
        this.idx = (this.idx + 1) % this.tracks.length;
        if (!this.el) return;
        this.el.src = this.tracks[this.idx];
        if (!this.muted) {
            const p = this.el.play();
            if (p && p.catch) p.catch(() => {});
        }
    },

    fadeTo(target, seconds) {
        if (!this.el) return;
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        const step = (target - this.el.volume) / Math.max(1, seconds * 20);
        this.fadeTimer = setInterval(() => {
            if (!this.el) return;
            let v = this.el.volume + step;
            if ((step > 0 && v >= target) || (step < 0 && v <= target) || step === 0) {
                v = target;
                clearInterval(this.fadeTimer);
                this.fadeTimer = null;
            }
            this.el.volume = clamp(v, 0, 1);
        }, 50);
    },

    toggle() {
        this.init();
        this.muted = !this.muted;
        if (this.muted) {
            this.fadeTo(0, 0.4);
            setTimeout(() => { if (this.muted && this.el) this.el.pause(); }, 450);
        } else if (!this.started) {
            this.start();
        } else {
            const p = this.el.play();
            if (p && p.catch) p.catch(() => {});
            this.fadeTo(this.volume, 0.8);
        }
        try { localStorage.setItem('nss_music_muted', this.muted ? '1' : '0'); } catch (e) { void e; }
        this.updateButton();
        return this.muted;
    },

    updateButton() {
        const btn = DOM.musicBtn;
        if (!btn) return;
        btn.classList.toggle('muted', this.muted);
        btn.title = this.muted ? 'Включить музыку (M)' : 'Выключить музыку (M)';
    },
};
