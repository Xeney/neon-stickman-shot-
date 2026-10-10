import * as THREE from 'three';

/* ============================================================
   NEON STICKMAN SHOT v3.0 — FPS Edition
   новая арена · команды · магазины · дым/флеш · TAB-табло · WebAudio
   ============================================================ */

const CFG = {
    ARENA_HALF: 200,

    MOVE_WALK:    7.5,
    MOVE_SPRINT:  12.0,
    MOVE_CROUCH:  3.5,
    ACCEL:        65,
    FRICTION:     15,

    PLAYER_RADIUS: 0.45,
    EYE_HEIGHT:    1.70,
    CROUCH_EYE:    1.05,

    MAX_PITCH:     Math.PI / 2 - 0.03,
    MOUSE_SENS:    0.0018,

    CAM_FOV:       80,
    ADS_FOV:       { pistol: 62, revolver: 60, dmr: 52, rifle: 58, burst: 56,
                     smg: 62, lmg: 60, shotgun: 62, sniper: 22 },
    ADS_TIME:      0.16,

    SEND_INTERVAL: 1 / 30,
    LERP_SPEED:    16,
    RESPAWN_TIME:  3.0,

    VM_HIP: new THREE.Vector3(0.24, -0.22, -0.52),
    VM_ADS: {
        pistol:   new THREE.Vector3(0.0, -0.10, -0.28),
        revolver: new THREE.Vector3(0.0, -0.10, -0.30),
        dmr:      new THREE.Vector3(0.0, -0.11, -0.32),
        rifle:    new THREE.Vector3(0.0, -0.13, -0.34),
        burst:    new THREE.Vector3(0.0, -0.13, -0.34),
        smg:      new THREE.Vector3(0.0, -0.13, -0.34),
        lmg:      new THREE.Vector3(0.0, -0.15, -0.38),
        shotgun:  new THREE.Vector3(0.0, -0.13, -0.34),
        sniper:   new THREE.Vector3(0.0, -0.10, -0.30),
    },
    VM_BOB: 0.014,

    WEAPONS: {
        pistol:   { name: 'PISTOL',   cooldown: 0.20,  auto: false, mag: 15, reload: 1.4, tracer: 0xccddff, spreadBase: 0.006, spreadMove: 0.025, recoil: 0.05, pellets: 1 },
        revolver: { name: 'REVOLVER', cooldown: 0.70,  auto: false, mag: 6,  reload: 1.9, tracer: 0xffddaa, spreadBase: 0.004, spreadMove: 0.030, recoil: 0.16, pellets: 1 },
        dmr:      { name: 'DMR',      cooldown: 0.30,  auto: false, mag: 12, reload: 1.8, tracer: 0xfff2aa, spreadBase: 0.006, spreadMove: 0.035, recoil: 0.11, pellets: 1 },
        rifle:    { name: 'RIFLE',    cooldown: 0.095, auto: true,  mag: 30, reload: 2.0, tracer: 0x88ffcc, spreadBase: 0.010, spreadMove: 0.040, recoil: 0.06, pellets: 1 },
        burst:    { name: 'BURST',    cooldown: 0.55,  auto: false, mag: 30, reload: 2.1, tracer: 0x9ad8ff, spreadBase: 0.012, spreadMove: 0.045, recoil: 0.07, pellets: 3, burst: true },
        smg:      { name: 'SMG',      cooldown: 0.060, auto: true,  mag: 35, reload: 1.7, tracer: 0xaaffff, spreadBase: 0.022, spreadMove: 0.055, recoil: 0.05, pellets: 1 },
        lmg:      { name: 'LMG',      cooldown: 0.100, auto: true,  mag: 80, reload: 3.4, tracer: 0xffaa88, spreadBase: 0.028, spreadMove: 0.070, recoil: 0.11, pellets: 1 },
        shotgun:  { name: 'SHOTGUN',  cooldown: 0.80,  auto: false, mag: 7,  reload: 2.6, tracer: 0xffcc66, spreadBase: 0.075, spreadMove: 0.100, recoil: 0.20, pellets: 8, visualPellets: 3 },
        sniper:   { name: 'SNIPER',   cooldown: 1.30,  auto: false, mag: 8,  reload: 2.8, tracer: 0x66ccff, spreadBase: 0.000, spreadMove: 0.050, recoil: 0.22, pellets: 1 },
    },
    WEAPON_ORDER: ['pistol', 'revolver', 'dmr', 'rifle', 'burst', 'smg', 'lmg', 'shotgun', 'sniper'],

    GRENADES: {
        frag:  { name: 'ФРАГ', color: 0xff5533 },
        smoke: { name: 'ДЫМ',  color: 0xbfc8d2 },
        flash: { name: 'ФЛЕШ', color: 0xffd34d },
    },
};

const WS_URL = `ws://${location.hostname || 'localhost'}:8001`;
console.log('[WS_URL]', WS_URL);

/* ============================================================
   DOM
   ============================================================ */
const $ = (id) => document.getElementById(id);

const menuEl        = $('menu');
const nicknameEl    = $('nickname');
const connectBtn    = $('connect-btn');
const statusEl      = $('status');
const hudEl         = $('hud');
const playersListEl = $('players-list');
const playerCountEl = $('player-count');
const minimapEl     = $('minimap');
const minimapCtx    = minimapEl ? minimapEl.getContext('2d') : null;
const hpFillEl      = $('hp-fill');
const pistolFillEl  = $('pistol-fill');
const weaponNameEl  = $('weapon-name');
const ammoCountEl   = $('ammo-count');
const ammoStatusEl  = $('ammo-status');
const respawnOverlayEl = $('respawn-overlay');
const respawnCounterEl = $('respawn-counter');
const crosshairEl   = $('crosshair');
const hitMarkerEl   = $('hit-marker');
const scopeEl       = $('scope');
const killFeedEl    = $('killfeed');
const damageFlashEl = $('damage-flash');
const medkitPromptEl = $('medkit-prompt');
const cardEls       = document.querySelectorAll('.car-card');
const reloadWrapEl  = $('reload-wrap');
const reloadFillEl  = $('reload-fill');
const reloadTextEl  = $('reload-text');
const flashOverlayEl = $('flash-overlay');
const streakBannerEl = $('streak-banner');
const streakMainEl  = $('streak-main');
const streakSubEl   = $('streak-sub');
const scoreboardEl  = $('scoreboard');
const sbBodyEl      = $('sb-body');
const sbCountEl     = $('sb-count');
const sbPingEl      = $('sb-ping');
const pingValEl     = $('ping-val');
const grenChipEls   = {
    frag:  $('gren-frag'),
    smoke: $('gren-smoke'),
    flash: $('gren-flash'),
};
const ammoPipsEl    = $('ammo-pips');
const reserveValEl  = $('reserve-val');
const hpLagEl       = $('hp-lag');
const reloadRingEl  = $('reload-ring');
const reloadRingCircle = $('reload-ring-circle');
const dmgIndicatorEl = $('dmg-indicator');
const carPrevEl     = $('car-prev');
const carNextEl     = $('car-next');
const fpsValEl      = $('fps-val');
const streakValEl   = $('streak-val');
const leaderNameEl  = $('leader-name');
const leaderKillsEl = $('leader-kills');
const loadoutNameEl = $('loadout-name');
const loadoutAbilityEl = $('loadout-ability');
const lsDmgEl       = $('ls-dmg');
const lsRateEl      = $('ls-rate');
const lsRangeEl     = $('ls-range');
const lsDmgValEl    = $('ls-dmg-val');
const lsRateValEl   = $('ls-rate-val');
const lsRangeValEl  = $('ls-range-val');
const weaponClassEl = $('weapon-class');
const weaponModeEl  = $('weapon-mode');
const waveChipEl    = $('wave-chip');
const waveNumEl     = $('wave-num');
const waveStateEl   = $('wave-state');
const pointsChipEl  = $('points-chip');
const pointsValEl   = $('points-val');
const pointsPopupEl = $('points-popup');
const shopEl        = $('shop');
const shopPointsEl  = $('shop-points');
const defeatOverlayEl = $('defeat-overlay');
const leaderChipEl  = $('leader-chip');
const sbGlyphsEl    = document.querySelector('.sb-glyphs');

function weaponModeLabel(id) {
    const w = CFG.WEAPONS[id];
    if (!w) return '';
    if (w.burst) return 'ОЧЕРЕДЬ ×3';
    return w.auto ? 'АВТОМАТИЧЕСКИЙ' : 'ОДИНОЧНЫЙ';
}

const WEAPON_CLASS_LABEL = {
    pistol: 'ПИСТОЛЕТ', revolver: 'ПИСТОЛЕТ',
    dmr: 'МАРКСМАН', sniper: 'СНАЙПЕРСКОЕ',
    rifle: 'ШТУРМОВОЕ', burst: 'ШТУРМОВОЕ',
    smg: 'ПП', lmg: 'ПУЛЕМЁТ', shotgun: 'ДРОБОВИК',
};

const damageVignette = document.createElement('div');
damageVignette.style.cssText = `
    position: fixed; inset: 0; pointer-events: none; z-index: 5;
    background: radial-gradient(circle at center,
        rgba(255,0,0,0) 45%, rgba(255,20,20,0.5) 100%);
    opacity: 0; transition: opacity .25s ease;
`;
document.body.appendChild(damageVignette);

/* ============================================================
   STATE
   ============================================================ */
let renderer, scene, camera, clock, sun;
let viewScene, viewCamera;
let weaponHolder;
let currentWeaponModel = null;

let running = false;
let pointerLocked = false;
let scoreboardVisible = false;

let sendAccumulator = 0;
let hudAccumulator = 0;
let minimapAccumulator = 0;
let scoreboardAccumulator = 0;
let pingAccumulator = 0;

const colliders = [];
const tracers = [];
const impacts = [];
const shrapnel = [];
const flashes = [];
const explosionRings = [];

let selectedWeapon = 'pistol';

const world = {
    myId: null,
    myColor: 0xffffff,
    weapon: 'pistol',
    weaponCD: 0,
    ammo: 15,
    reloadLeft: 0,
    reloadTotal: 0,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eyeY: CFG.EYE_HEIGHT,
    crouch: false,
    sprint: false,
    hp: 100, maxHp: 100,
    kills: 0, deaths: 0, streak: 0,
    ping: 0,
    alive: true,
    respawnTimer: 0,
    ads: false, adsProgress: 0,
    bobPhase: 0, bobAmount: 0,
    lastStepPhase: 0,
    recoilPitch: 0, recoilYaw: 0,
    swayX: 0, swayY: 0,
    shake: 0,
    moveDir: new THREE.Vector2(),
    remote: new Map(),
    grenades: new Map(),
    medkits: new Map(),
    smokes: new Map(),
    acidGlobs: new Map(),
    grenadeCooldown: 0,
    grenadesCount: { frag: 2, smoke: 1, flash: 1 },
    grenadeSel: 'frag',
    nearbyMedkit: null,
    flashScreen: null,
    lastState: null,
    reserve: 90,
    hpLag: 100,
    roll: 0,
    reconcile: null,
    sentHist: [],
    mode: 'ffa',
    wave: 0,
    wavePhase: 'idle',
    breakUntil: 0,
    points: 0,
    upgrades: { dmg: 0, mag: 0, reload: 0, speed: 0, hp: 0 },
    shopOpen: false,
    heartbeatAt: 0,
    whisperAt: 0,
    _envTex: null,
    pickups: new Map(),
    pickupCooldown: 0,
    pipCount: 0,
    roundsPerPip: 1,
    dmgDir: null,
};

const keys = Object.create(null);
let mouseLeftDown = false;
let mouseRightDown = false;

/* ============================================================
   UTILS
   ============================================================ */
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const hexColor = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

function effMag() {
    const wp = CFG.WEAPONS[world.weapon];
    return Math.max(1, Math.round(wp.mag * (1 + 0.15 * (world.upgrades.mag || 0))));
}

function effReloadTime() {
    const wp = CFG.WEAPONS[world.weapon];
    return wp.reload * (1 - 0.08 * (world.upgrades.reload || 0));
}

function speedMult() {
    return 1 + 0.04 * (world.upgrades.speed || 0);
}

function disposeObj(obj) {
    if (!obj) return;
    obj.traverse(o => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
            if (Array.isArray(o.material)) {
                o.material.forEach(m => { if (m.map) m.map.dispose?.(); m.dispose?.(); });
            } else {
                if (o.material.map) o.material.map.dispose?.();
                o.material.dispose?.();
            }
        }
    });
}

/* ============================================================
   ПРОСТРАНСТВЕННЫЙ ХЕШ (сетка 20x20) — ускоряет коллизии/рейкасты
   ============================================================ */
const GRID_CELL = 20;
const colliderGrid = new Map();

function buildColliderGrid() {
    colliderGrid.clear();
    for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const x0 = Math.floor((c.x - c.hw) / GRID_CELL);
        const x1 = Math.floor((c.x + c.hw) / GRID_CELL);
        const z0 = Math.floor((c.z - c.hd) / GRID_CELL);
        const z1 = Math.floor((c.z + c.hd) / GRID_CELL);
        for (let cx = x0; cx <= x1; cx++) {
            for (let cz = z0; cz <= z1; cz++) {
                const k = cx + ':' + cz;
                let arr = colliderGrid.get(k);
                if (!arr) { arr = []; colliderGrid.set(k, arr); }
                arr.push(i);
            }
        }
    }
}

function collidersNear(x, z, r) {
    const out = [];
    const seen = new Set();
    const x0 = Math.floor((x - r) / GRID_CELL);
    const x1 = Math.floor((x + r) / GRID_CELL);
    const z0 = Math.floor((z - r) / GRID_CELL);
    const z1 = Math.floor((z + r) / GRID_CELL);
    for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
            const arr = colliderGrid.get(cx + ':' + cz);
            if (!arr) continue;
            for (let a = 0; a < arr.length; a++) {
                const i = arr[a];
                if (seen.has(i)) continue;
                seen.add(i);
                out.push(colliders[i]);
            }
        }
    }
    return out;
}

function collidersInBox(x0, z0, x1, z1) {
    if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
    if (z0 > z1) { const t = z0; z0 = z1; z1 = t; }
    const r = Math.max(x1 - x0, z1 - z0) / 2 + GRID_CELL * 0.5;
    return collidersNear((x0 + x1) / 2, (z0 + z1) / 2, r);
}

/* ============================================================
   WEBAUDIO — синтезированные звуки (пул узлов)
   ============================================================ */
const AU = {
    ctx: null, master: null, noise: null, ready: false,
    lastShotAt: 0, shotCount: 0,
    _noiseVoices: null, _toneVoices: null, _nvi: 0, _tvi: 0, _noiseSrc: null,

    init() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
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

    ui() {
        this.toneHit(0, 0.06, 0.1, 900, 1200, 'square', 0);
    },

    /* --- хоррор: демоны и атмосфера --- */
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
};

function spatialSound(pos) {
    if (!camera) return { pan: 0, vol: 0 };
    const v = pos.clone().project(camera);
    const d = camera.position.distanceTo(pos);
    return { pan: clamp(v.x, -1, 1), vol: clamp(1 - d / 70, 0, 1) };
}

/* ============================================================
   ФОНОВАЯ МУЗЫКА — зацикленный плейлист с фейдом
   ============================================================ */
const Music = {
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
        const btn = document.getElementById('music-btn');
        if (!btn) return;
        btn.classList.toggle('muted', this.muted);
        btn.title = this.muted ? 'Включить музыку (M)' : 'Выключить музыку (M)';
    },
};

/* ============================================================
   THREE BOOTSTRAP
   ============================================================ */
function initThree() {
    const container = $('game-container');

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    const defense = world.mode === 'defense';
    if (defense) {
        scene.background = new THREE.Color(0x0a0508);
        scene.fog = new THREE.FogExp2(0x14060a, 0.006);
    } else {
        scene.background = new THREE.Color(0x9ec8ee);
        scene.fog = new THREE.FogExp2(0xbcd6ee, 0.0011);
    }

    camera = new THREE.PerspectiveCamera(CFG.CAM_FOV, innerWidth / innerHeight, 0.08, 2500);
    camera.rotation.order = 'YXZ';

    // environment-карта: реалистичные блики металла
    try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envCanvas = document.createElement('canvas');
        envCanvas.width = 64; envCanvas.height = 32;
        const ex = envCanvas.getContext('2d');
        const eg = ex.createLinearGradient(0, 0, 0, 32);
        if (defense) {
            eg.addColorStop(0, '#2a1a22');
            eg.addColorStop(0.5, '#140a10');
            eg.addColorStop(1, '#080409');
        } else {
            eg.addColorStop(0, '#9fb6d4');
            eg.addColorStop(0.5, '#5a6a80');
            eg.addColorStop(1, '#2a3444');
        }
        ex.fillStyle = eg;
        ex.fillRect(0, 0, 64, 32);
        if (defense) {
            ex.fillStyle = 'rgba(255,60,40,0.9)';
            ex.beginPath(); ex.arc(14, 10, 7, 0, Math.PI * 2); ex.fill();
            ex.fillStyle = 'rgba(255,120,90,0.6)';
            ex.beginPath(); ex.arc(50, 20, 6, 0, Math.PI * 2); ex.fill();
        } else {
            ex.fillStyle = 'rgba(255,255,255,0.95)';
            ex.beginPath(); ex.arc(16, 8, 8, 0, Math.PI * 2); ex.fill();
        }
        const envTex = new THREE.CanvasTexture(envCanvas);
        envTex.mapping = THREE.EquirectangularReflectionMapping;
        envTex.colorSpace = THREE.SRGBColorSpace;
        const envRT = pmrem.fromEquirectangular(envTex);
        scene.environment = envRT.texture;
        pmrem.dispose();
        envTex.dispose();
        world._envTex = envRT.texture;
    } catch (e) {
        console.warn('[ENV] skipped:', e);
    }

    if (defense) {
        scene.add(new THREE.AmbientLight(0x664455, 0.72));
        scene.add(new THREE.HemisphereLight(0x442233, 0x14080c, 0.65));
        sun = new THREE.DirectionalLight(0xdd9999, 0.7);
        sun.position.set(-120, 220, -80);
    } else {
        scene.add(new THREE.AmbientLight(0xbcd4ee, 0.9));
        scene.add(new THREE.HemisphereLight(0xfff4e0, 0x556677, 1.0));
        sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
        sun.position.set(140, 260, 90);
    }
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 800;
    sun.shadow.camera.left   = -240;
    sun.shadow.camera.right  =  240;
    sun.shadow.camera.top    =  240;
    sun.shadow.camera.bottom = -240;
    sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);

    viewScene = new THREE.Scene();
    if (world._envTex) viewScene.environment = world._envTex;
    viewCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    viewScene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const vSun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    vSun.position.set(0.7, 1.0, 0.6);
    viewScene.add(vSun);
    const vFill = new THREE.DirectionalLight(0x88aaff, 0.55);
    vFill.position.set(-0.5, 0.3, -0.8);
    viewScene.add(vFill);

    weaponHolder = new THREE.Group();
    weaponHolder.position.copy(CFG.VM_HIP);
    viewScene.add(weaponHolder);

    buildWeaponModel(selectedWeapon);
    buildMap();

    clock = new THREE.Clock();
    addEventListener('resize', onResize);
}

function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    viewCamera.aspect = innerWidth / innerHeight;
    viewCamera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}

/* ============================================================
   КАРТА — идентична server.py build_wall_list()
   ============================================================ */
function buildWallList(mode) {
    if (mode === 'defense') return buildWallListDefense();
    return buildWallListFFA();
}

function buildWallListDefense() {
    // «Крепость» — должна совпадать с server.py build_wall_list_defense()
    const walls = [];
    const A = CFG.ARENA_HALF, T = 3.0, H = 18.0;
    walls.push({ x: 0, z: A, hw: A, hd: T / 2, h: H, kind: 'outer' });
    walls.push({ x: 0, z: -A, hw: A, hd: T / 2, h: H, kind: 'outer' });
    walls.push({ x: A, z: 0, hw: T / 2, hd: A, h: H, kind: 'outer' });
    walls.push({ x: -A, z: 0, hw: T / 2, hd: A, h: H, kind: 'outer' });

    {
        const S = 46, door = 12, th = 2.0, h = 5.0;
        const half = S / 2, seg = (S - door) / 2;
        for (const sx of [-1, 1]) {
            const cx = sx * (S / 2 - seg / 2);
            walls.push({ x: cx, z: half, hw: seg / 2, hd: th / 2, h: h, kind: 'cwall' });
            walls.push({ x: cx, z: -half, hw: seg / 2, hd: th / 2, h: h, kind: 'cwall' });
        }
        for (const sz of [-1, 1]) {
            const cz = sz * (S / 2 - seg / 2);
            walls.push({ x: half, z: cz, hw: th / 2, hd: seg / 2, h: h, kind: 'cwall' });
            walls.push({ x: -half, z: cz, hw: th / 2, hd: seg / 2, h: h, kind: 'cwall' });
        }
        for (const tx of [-1, 1]) {
            for (const tz of [-1, 1]) {
                walls.push({ x: tx * half, z: tz * half, hw: 2.2, hd: 2.2, h: 7.5, kind: 'tower' });
            }
        }
        for (const [dx, dz] of [[-13, -13], [13, -13], [13, 13], [-13, 13]]) {
            walls.push({ x: dx, z: dz, hw: 0.9, hd: 0.9, h: h, kind: 'pillar' });
        }
        walls.push({ x: 0, z: 0, hw: 2.4, hd: 2.4, h: 1.6, kind: 'crate' });
        for (const [dx, dz] of [[-17, 0], [17, 0], [0, -17], [0, 17]]) {
            walls.push({ x: dx, z: dz, hw: 2.6, hd: 0.7, h: 1.4, kind: 'cover' });
        }
    }

    const ruin = (cx, cz) => {
        const s2 = 20, h2 = 4.0, th2 = 1.6, d2 = 7.0;
        const seg2 = (s2 - d2) / 2, half2 = s2 / 2;
        for (const sx of [-1, 1]) {
            const x = cx + sx * (s2 / 2 - seg2 / 2);
            walls.push({ x, z: cz + half2, hw: seg2 / 2, hd: th2 / 2, h: h2, kind: 'bwall' });
            walls.push({ x, z: cz - half2, hw: seg2 / 2, hd: th2 / 2, h: h2, kind: 'bwall' });
        }
        for (const sz of [-1, 1]) {
            const z = cz + sz * (s2 / 2 - seg2 / 2);
            walls.push({ x: cx + half2, z, hw: th2 / 2, hd: seg2 / 2, h: h2, kind: 'bwall' });
            walls.push({ x: cx - half2, z, hw: th2 / 2, hd: seg2 / 2, h: h2, kind: 'bwall' });
        }
    };
    for (const qx of [-1, 1]) for (const qz of [-1, 1]) ruin(qx * 72, qz * 72);
    for (const [cx, cz] of [[72, 0], [-72, 0], [0, 72], [0, -72]]) ruin(cx, cz);

    for (const off of [-112, 112]) {
        for (const c of [-70, 0, 70]) {
            walls.push({ x: off, z: c, hw: 1.0, hd: 22, h: 3.0, kind: 'lane' });
            walls.push({ x: c, z: off, hw: 22, hd: 1.0, h: 3.0, kind: 'lane' });
        }
    }

    const covers = [
        [40, 40, 3.2, 0.7], [-40, 40, 3.2, 0.7], [40, -40, 3.2, 0.7], [-40, -40, 3.2, 0.7],
        [40, 40, 0.7, 3.2], [-40, 40, 0.7, 3.2], [40, -40, 0.7, 3.2], [-40, -40, 0.7, 3.2],
        [95, 35, 2.6, 0.7], [95, -35, 2.6, 0.7], [-95, 35, 2.6, 0.7], [-95, -35, 2.6, 0.7],
        [35, 95, 0.7, 2.6], [35, -95, 0.7, 2.6], [-35, 95, 0.7, 2.6], [-35, -95, 0.7, 2.6],
    ];
    for (const [x, z, hw, hd] of covers) {
        walls.push({ x, z, hw, hd, h: 1.5, kind: 'cover' });
    }

    const clusters = [[55, 25], [-55, 25], [55, -25], [-55, -25],
                      [25, 55], [-25, 55], [25, -55], [-25, -55]];
    for (const [cx, cz] of clusters) {
        for (const [ox, oz] of [[0, 0], [1.9, 0.3]]) {
            walls.push({ x: cx + ox, z: cz + oz, hw: 0.85, hd: 0.85, h: 1.7, kind: 'crate' });
        }
    }
    const barrels = [[23, 23], [-23, 23], [23, -23], [-23, -23],
                     [85, 0], [-85, 0], [0, 85], [0, -85]];
    for (const [x, z] of barrels) {
        walls.push({ x, z, hw: 0.55, hd: 0.55, h: 2.1, kind: 'barrel' });
    }
    return walls;
}

function buildWallListFFA() {
    // «МЕГАПОЛИС» — зеркало server.py build_wall_list_ffa()
    const walls = [];
    const A = CFG.ARENA_HALF, T = 3.0;
    walls.push({ x: 0, z: A, hw: A, hd: T / 2, h: 16, kind: 'outer' });
    walls.push({ x: 0, z: -A, hw: A, hd: T / 2, h: 16, kind: 'outer' });
    walls.push({ x: A, z: 0, hw: T / 2, hd: A, h: 16, kind: 'outer' });
    walls.push({ x: -A, z: 0, hw: T / 2, hd: A, h: 16, kind: 'outer' });

    // Кольцевая стена на ±172: проёмы у осей и углов
    for (const sgn of [-1, 1]) {
        const ring = [
            [sgn * 172, -102.5, 1.25, 57.5], [sgn * 172, 102.5, 1.25, 57.5],
            [-102.5, sgn * 172, 57.5, 1.25], [102.5, sgn * 172, 57.5, 1.25],
        ];
        for (const [x, z, hw, hd] of ring) {
            walls.push({ x, z, hw, hd, h: 10, kind: 'bwall' });
        }
    }

    // Центральная площадь: квадрат 104x104, входы 16
    {
        const P = 52, seg = 22;
        for (const sgn of [-1, 1]) {
            walls.push({ x: sgn * 30, z: P, hw: seg, hd: 1.25, h: 6.5, kind: 'cwall' });
            walls.push({ x: sgn * 30, z: -P, hw: seg, hd: 1.25, h: 6.5, kind: 'cwall' });
            walls.push({ x: P, z: sgn * 30, hw: 1.25, hd: seg, h: 6.5, kind: 'cwall' });
            walls.push({ x: -P, z: sgn * 30, hw: 1.25, hd: seg, h: 6.5, kind: 'cwall' });
        }
    }
    walls.push({ x: 0, z: 0, hw: 1.2, hd: 1.2, h: 1.7, kind: 'crate' });
    for (const [x, z, hw, hd] of [[16, 0, 2.6, 0.7], [-16, 0, 2.6, 0.7],
                                  [0, 16, 0.7, 2.6], [0, -16, 0.7, 2.6]]) {
        walls.push({ x, z, hw, hd, h: 1.4, kind: 'cover' });
    }
    for (const [x, z] of [[30, 30], [-30, 30], [30, -30], [-30, -30]]) {
        walls.push({ x, z, hw: 0.9, hd: 0.9, h: 6.0, kind: 'pillar' });
    }

    // 4 главных туннеля с зигзаг-баффлами
    for (const d of [-1, 1]) {
        walls.push({ x: 8, z: d * 110, hw: 0.8, hd: 48, h: 4.5, kind: 'lane' });
        walls.push({ x: -8, z: d * 110, hw: 0.8, hd: 48, h: 4.5, kind: 'lane' });
        walls.push({ x: -5, z: d * 88, hw: 5, hd: 0.7, h: 4.0, kind: 'cover' });
        walls.push({ x: 5, z: d * 110, hw: 5, hd: 0.7, h: 4.0, kind: 'cover' });
        walls.push({ x: -5, z: d * 132, hw: 5, hd: 0.7, h: 4.0, kind: 'cover' });
        walls.push({ x: d * 110, z: 8, hw: 48, hd: 0.8, h: 4.5, kind: 'lane' });
        walls.push({ x: d * 110, z: -8, hw: 48, hd: 0.8, h: 4.5, kind: 'lane' });
        walls.push({ x: d * 88, z: -5, hw: 0.7, hd: 5, h: 4.0, kind: 'cover' });
        walls.push({ x: d * 110, z: 5, hw: 0.7, hd: 5, h: 4.0, kind: 'cover' });
        walls.push({ x: d * 132, z: -5, hw: 0.7, hd: 5, h: 4.0, kind: 'cover' });
    }

    // Лабиринты в квадрантах (зеркалятся)
    const maze = [
        [70, 55, 0.8, 30], [70, 95, 35, 0.8], [120, 65, 0.8, 40],
        [90, 135, 50, 0.8], [100, 151.5, 0.8, 16.5], [155, 62.5, 0.8, 32.5],
        [150, 60, 20, 0.8], [95, 77.5, 0.8, 17.5], [105, 30, 15, 0.8],
        [135, 100, 0.8, 20],
    ];
    for (const qx of [-1, 1]) {
        for (const qz of [-1, 1]) {
            for (const [x, z, hw, hd] of maze) {
                walls.push({ x: qx * x, z: qz * z, hw, hd, h: 5.0, kind: 'bwall' });
            }
        }
    }

    // 4 угловые башни (двери внутрь карты)
    for (const [tx, tz] of [[155, 155], [-155, 155], [155, -155], [-155, -155]]) {
        const half3 = 6.0, th3 = 1.2, doorHalf = 2.6;
        const seg3 = half3 - doorHalf;
        const sx = Math.sign(tx), sz = Math.sign(tz);
        walls.push({ x: tx, z: tz + sz * half3, hw: 2 * half3, hd: th3 / 2, h: 8.0, kind: 'tower' });
        walls.push({ x: tx + sx * half3, z: tz, hw: th3 / 2, hd: 2 * half3, h: 8.0, kind: 'tower' });
        const innerX = tx - sx * half3;
        const innerZ = tz - sz * half3;
        walls.push({ x: innerX, z: tz + sz * (half3 / 2 + doorHalf / 2), hw: th3 / 2, hd: seg3 / 2, h: 8.0, kind: 'tower' });
        walls.push({ x: innerX, z: tz - sz * (half3 / 2 + doorHalf / 2), hw: th3 / 2, hd: seg3 / 2, h: 8.0, kind: 'tower' });
        walls.push({ x: tx + sx * (half3 / 2 + doorHalf / 2), z: innerZ, hw: seg3 / 2, hd: th3 / 2, h: 8.0, kind: 'tower' });
        walls.push({ x: tx - sx * (half3 / 2 + doorHalf / 2), z: innerZ, hw: seg3 / 2, hd: th3 / 2, h: 8.0, kind: 'tower' });
    }

    // Укрытия и ящики
    for (const d of [-1, 1]) {
        walls.push({ x: d * 14, z: 60, hw: 0.7, hd: 3.0, h: 1.5, kind: 'cover' });
        walls.push({ x: d * 60, z: 14, hw: 3.0, hd: 0.7, h: 1.5, kind: 'cover' });
    }
    const clusters = [[40, 70], [70, 40], [-40, 70], [-70, 40],
                      [40, -70], [70, -40], [-40, -70], [-70, -40],
                      [185, 60], [60, 185], [-185, 60], [-60, 185],
                      [185, -60], [60, -185], [-185, -60], [-60, -185]];
    for (const [cx, cz] of clusters) {
        for (const [ox, oz] of [[0, 0], [2.05, 0.3]]) {
            walls.push({ x: cx + ox, z: cz + oz, hw: 0.85, hd: 0.85, h: 1.7, kind: 'crate' });
        }
    }
    const barrels = [[120, 120], [-120, 120], [120, -120], [-120, -120],
                     [0, 62], [0, -62], [62, 0], [-62, 0]];
    for (const [x, z] of barrels) {
        walls.push({ x, z, hw: 0.55, hd: 0.55, h: 2.1, kind: 'barrel' });
    }
    return walls;
}

const MAT = {
    outer:  new THREE.MeshStandardMaterial({ color: 0x9aa6b4, roughness: 0.9, metalness: 0.06 }),
    cwall:  new THREE.MeshStandardMaterial({ color: 0x3d4654, roughness: 0.6, metalness: 0.45 }),
    bwall:  new THREE.MeshStandardMaterial({ color: 0xc4b394, roughness: 0.92, metalness: 0.04 }),
    tower:  new THREE.MeshStandardMaterial({ color: 0x6a5560, roughness: 0.75, metalness: 0.18 }),
    lane:   new THREE.MeshStandardMaterial({ color: 0x8d97a3, roughness: 0.88, metalness: 0.08 }),
    cover:  new THREE.MeshStandardMaterial({ color: 0xa8b2c0, roughness: 0.9, metalness: 0.1 }),
    crate:  new THREE.MeshStandardMaterial({ color: 0xb5a37c, roughness: 0.95, metalness: 0.05 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0xc0512e, roughness: 0.55, metalness: 0.55 }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x77808f, roughness: 0.6, metalness: 0.35 }),
};

const MAT_NIGHT = {
    outer:  new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.95, metalness: 0.05 }),
    cwall:  new THREE.MeshStandardMaterial({ color: 0x2a2230, roughness: 0.7, metalness: 0.35 }),
    bwall:  new THREE.MeshStandardMaterial({ color: 0x4a3a34, roughness: 0.95, metalness: 0.03 }),
    tower:  new THREE.MeshStandardMaterial({ color: 0x35242a, roughness: 0.8, metalness: 0.15 }),
    lane:   new THREE.MeshStandardMaterial({ color: 0x3c414c, roughness: 0.9, metalness: 0.08 }),
    cover:  new THREE.MeshStandardMaterial({ color: 0x424a56, roughness: 0.9, metalness: 0.1 }),
    crate:  new THREE.MeshStandardMaterial({ color: 0x5a4a34, roughness: 0.95, metalness: 0.05 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x6a2a1a, roughness: 0.6, metalness: 0.5 }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x333a46, roughness: 0.65, metalness: 0.3 }),
};

const TRIM = {
    outer: 0x00b0ff,
    cwall: 0x00e5ff,
    tower: 0xff2d88,
    lane:  0x3fa9ff,
    cover: 0x00e5ff,
};

const TRIM_NIGHT = {
    outer: 0x552222,
    cwall: 0x882222,
    tower: 0xff3333,
    lane:  0x553355,
    cover: 0x884444,
};

let MATS = null;

function addBoxCollider(x, z, hw, hd, h = 16) {
    colliders.push({ x, z, hw, hd, h });
}

function buildMap() {
    const defense = world.mode === 'defense';
    MATS = defense ? MAT_NIGHT : MAT;

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(CFG.ARENA_HALF * 2 + 400, CFG.ARENA_HALF * 2 + 400),
        new THREE.MeshStandardMaterial({
            map: groundTexture(defense ? 26 : 30, defense),
            roughness: 0.97, metalness: 0.02,
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    if (!defense) {
        addAsphaltDecor();
        addZoneRings();
    } else {
        addDefenseDecor();
    }

    const list = buildWallList(world.mode);
    for (const w of list) buildWallMesh(w);

    buildColliderGrid();
    buildMinimapBg();

    if (!defense) {
        buildBanners();
        buildHoloBoard();
    } else {
        buildNightGlows();
    }
    buildSky(defense);
}

function addDefenseDecor() {
    // красные кольца на точках спавна демонов + кольцо у крепости
    const spawns = [[0, 135], [0, -135], [135, 0], [-135, 0],
                    [95, 95], [-95, 95], [95, -95], [-95, -95]];
    for (const [x, z] of spawns) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(6.5, 7.6, 36),
            new THREE.MeshBasicMaterial({
                color: 0xaa1111, transparent: true, opacity: 0.4,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
                depthWrite: false, toneMapped: false,
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.05, z);
        scene.add(ring);
    }
    const centerRing = new THREE.Mesh(
        new THREE.RingGeometry(20, 21.4, 48),
        new THREE.MeshBasicMaterial({
            color: 0xcc2222, transparent: true, opacity: 0.35,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            depthWrite: false, toneMapped: false,
        })
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.set(0, 0.05, 0);
    scene.add(centerRing);
}

function buildNightGlows() {
    // зловещие красные огни на башнях крепости
    for (const [x, z] of [[23, 23], [-23, 23], [23, -23], [-23, -23]]) {
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0xff2211, toneMapped: false })
        );
        glow.position.set(x, 8.2, z);
        scene.add(glow);
    }
    const light = new THREE.PointLight(0xff2211, 8, 40, 2);
    light.position.set(0, 6, 0);
    scene.add(light);
}

function buildWallMesh(w) {
    const { x, z, hw, hd, h, kind } = w;

    if (kind === 'barrel') {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, h, 12), MAT.barrel);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(0.58, 0.58, 0.12, 12),
            new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.6, metalness: 0.6 })
        );
        ring.position.set(x, h * 0.7, z);
        scene.add(ring);
        addBoxCollider(x, z, hw, hd, h);
        return;
    }

    const geo = new THREE.BoxGeometry(hw * 2, h, hd * 2);
    const mat = (MATS || MAT)[kind] || MAT.outer;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    if (kind === 'crate') {
        const cap = new THREE.Mesh(
            new THREE.BoxGeometry(hw * 1.7, 0.06, hd * 1.7),
            new THREE.MeshBasicMaterial({ color: 0xff7a3a, toneMapped: false })
        );
        cap.position.set(x, h + 0.03, z);
        scene.add(cap);
    }

    const trimColor = (world.mode === 'defense' ? TRIM_NIGHT : TRIM)[kind];
    if (trimColor !== undefined) {
        const t = new THREE.Mesh(
            new THREE.BoxGeometry(hw * 2 + 0.06, 0.1, hd * 2 + 0.06),
            new THREE.MeshBasicMaterial({ color: trimColor, toneMapped: false })
        );
        t.position.set(x, h + 0.05, z);
        scene.add(t);
    }

    if (kind === 'outer') {
        for (const yOff of [h - 1.2, 1.5, h * 0.55]) {
            const neon = new THREE.Mesh(
                new THREE.BoxGeometry(hw * 2 - 0.6, 0.32, 0.15),
                new THREE.MeshBasicMaterial({ color: yOff === 1.5 ? 0xff2d88 : 0x00b0ff, toneMapped: false })
            );
            neon.position.set(x, yOff, z);
            neon.rotation.y = hw > hd ? 0 : Math.PI / 2;
            if (hw > hd) neon.position.z += (z > 0 ? -1 : 1) * (hd + 0.12);
            else neon.position.x += (x > 0 ? -1 : 1) * (hw + 0.12);
            scene.add(neon);
        }
    }

    addBoxCollider(x, z, hw, hd, h);
}

function groundTexture(scale, dark = false) {
    const s = 512;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    if (dark) {
        x.fillStyle = '#14100f'; x.fillRect(0, 0, s, s);
        x.strokeStyle = 'rgba(70, 40, 38, 0.4)'; x.lineWidth = 2;
        const cells = 8, step = s / cells;
        for (let i = 0; i <= cells; i++) {
            x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, s); x.stroke();
            x.beginPath(); x.moveTo(0, i * step); x.lineTo(s, i * step); x.stroke();
        }
        // трещины и кровавые пятна
        x.globalAlpha = 0.25;
        for (let i = 0; i < 40; i++) {
            x.fillStyle = `hsl(${[0, 12, 350][i % 3]}, 55%, 22%)`;
            x.beginPath();
            x.arc(Math.random() * s, Math.random() * s, 5 + Math.random() * 22, 0, Math.PI * 2);
            x.fill();
        }
        x.globalAlpha = 0.35;
        x.strokeStyle = '#2a1210';
        x.lineWidth = 2;
        for (let i = 0; i < 26; i++) {
            let px = Math.random() * s, py = Math.random() * s;
            x.beginPath();
            x.moveTo(px, py);
            for (let k = 0; k < 4; k++) {
                px += (Math.random() - 0.5) * 70;
                py += (Math.random() - 0.5) * 70;
                x.lineTo(px, py);
            }
            x.stroke();
        }
        x.globalAlpha = 1;
    } else {
        x.fillStyle = '#c3ced8'; x.fillRect(0, 0, s, s);
        x.strokeStyle = 'rgba(90, 115, 140, 0.3)'; x.lineWidth = 2;
        const cells = 8, step = s / cells;
        for (let i = 0; i <= cells; i++) {
            x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, s); x.stroke();
            x.beginPath(); x.moveTo(0, i * step); x.lineTo(s, i * step); x.stroke();
        }
        x.globalAlpha = 0.13;
        for (let i = 0; i < 70; i++) {
            x.fillStyle = `hsl(${[190, 210, 30, 45][i % 4]}, 45%, 70%)`;
            x.beginPath();
            x.arc(Math.random() * s, Math.random() * s, 6 + Math.random() * 18, 0, Math.PI * 2);
            x.fill();
        }
        x.globalAlpha = 1;
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(scale, scale);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
}

function addAsphaltDecor() {
    const s = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    const cx = s / 2, cy = s / 2;
    const w2p = s / (CFG.ARENA_HALF * 2);

    x.strokeStyle = 'rgba(255,255,255,0.5)';
    x.lineWidth = 0.8 * w2p;
    x.setLineDash([4 * w2p, 4 * w2p]);
    x.beginPath();
    x.moveTo(cx, 0); x.lineTo(cx, s);
    x.moveTo(0, cy); x.lineTo(s, cy);
    x.stroke();
    x.setLineDash([]);

    x.strokeStyle = 'rgba(0,140,220,0.55)';
    x.lineWidth = 0.55 * w2p;
    x.beginPath(); x.arc(cx, cy, 78 * w2p, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(cx, cy, 40 * w2p, 0, Math.PI * 2); x.stroke();

    x.font = `900 ${7 * w2p}px Arial`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = 'rgba(30,80,140,0.5)';
    const q = 108;
    x.fillText('СЕКТОР A', cx - q * w2p, cy - q * w2p);
    x.fillText('СЕКТОР B', cx + q * w2p, cy - q * w2p);
    x.fillText('СЕКТОР C', cx - q * w2p, cy + q * w2p);
    x.fillText('СЕКТОР D', cx + q * w2p, cy + q * w2p);

    const t = new THREE.CanvasTexture(c);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(CFG.ARENA_HALF * 2, CFG.ARENA_HALF * 2),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.02;
    scene.add(plane);
}

function addZoneRings() {
    const spots = [[35, 0], [-35, 0], [0, 35], [0, -35],
                   [110, 0], [-110, 0], [0, 110], [0, -110]];
    for (const [x, z] of spots) {
        const geo = new THREE.RingGeometry(11, 12.2, 40);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x00c8ff, transparent: true, opacity: 0.28,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
            depthWrite: false, toneMapped: false,
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.04, z);
        scene.add(ring);
    }
}

function textBannerTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(10,16,26,0.85)';
    x.fillRect(0, 0, 512, 128);
    x.strokeStyle = hexColor(color);
    x.lineWidth = 8;
    x.strokeRect(6, 6, 500, 116);
    x.font = '900 64px Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = hexColor(color);
    x.shadowBlur = 24;
    x.fillStyle = '#ffffff';
    x.fillText(text, 256, 68);
    return new THREE.CanvasTexture(c);
}

function buildBanners() {
    // баннеры на стенах центральной площади (лицом внутрь)
    const defs = [
        { x: 30, z: 50, ry: Math.PI, text: 'СЕКТОР A', color: 0x00e5ff },
        { x: -30, z: 50, ry: Math.PI, text: 'СЕКТОР B', color: 0xff2d88 },
        { x: 30, z: -50, ry: 0, text: 'СЕКТОР C', color: 0x00e5ff },
        { x: -30, z: -50, ry: 0, text: 'СЕКТОР D', color: 0xff2d88 },
        { x: 50, z: 30, ry: -Math.PI / 2, text: 'ТУННЕЛЬ', color: 0x00e5ff },
        { x: -50, z: -30, ry: Math.PI / 2, text: 'ТУННЕЛЬ', color: 0xff2d88 },
    ];
    for (const d of defs) {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 3),
            new THREE.MeshBasicMaterial({
                map: textBannerTexture(d.text, d.color),
                transparent: true, toneMapped: false, side: THREE.DoubleSide,
            })
        );
        mesh.position.set(d.x, 4.2, d.z);
        mesh.rotation.y = d.ry;
        scene.add(mesh);
    }
    for (const [x, z] of [[186, 186], [-186, 186], [186, -186], [-186, -186]]) {
        const pillar = new THREE.Mesh(
            new THREE.BoxGeometry(1.0, 13, 1.0),
            new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.5, metalness: 0.6 })
        );
        pillar.position.set(x, 16, z);
        pillar.castShadow = true;
        scene.add(pillar);
        const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 12, 10),
            new THREE.MeshBasicMaterial({ color: 0xff2d88, toneMapped: false })
        );
        glow.position.set(x, 23.1, z);
        scene.add(glow);
    }
}

let holoCanvas, holoCtx, holoTexture, holoBoard;
function buildHoloBoard() {
    holoCanvas = document.createElement('canvas');
    holoCanvas.width = 1024;
    holoCanvas.height = 256;
    holoCtx = holoCanvas.getContext('2d');
    holoTexture = new THREE.CanvasTexture(holoCanvas);
    holoBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 7.5),
        new THREE.MeshBasicMaterial({
            map: holoTexture, transparent: true, opacity: 0.92,
            side: THREE.DoubleSide, toneMapped: false, depthWrite: false,
        })
    );
    holoBoard.position.set(0, 17, 0);
    scene.add(holoBoard);
    drawHoloBoard(0, null);
}

function drawHoloBoard(count, leader) {
    if (!holoCtx) return;
    const x = holoCtx;
    x.clearRect(0, 0, 1024, 256);
    x.fillStyle = 'rgba(4,10,20,0.72)';
    x.fillRect(0, 0, 1024, 256);
    x.strokeStyle = 'rgba(0,229,255,0.9)';
    x.lineWidth = 6;
    x.strokeRect(8, 8, 1008, 240);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.shadowColor = '#00e5ff';
    x.shadowBlur = 30;
    x.font = '900 88px Arial';
    x.fillStyle = '#00e5ff';
    x.fillText('NEON ARENA', 512, 82);
    x.shadowBlur = 14;
    x.font = '700 46px Arial';
    x.fillStyle = '#ff9dc4';
    x.fillText(leader ? `ЛИДЕР: ${leader.name} — ${leader.kills}` : 'ЛИДЕР: —', 512, 158);
    x.shadowBlur = 0;
    x.font = '700 34px Arial';
    x.fillStyle = '#9fb4cc';
    x.fillText(`БОЙЦОВ В АРЕНЕ: ${count}`, 512, 212);
}

function buildSky(dark = false) {
    const s = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');

    if (dark) {
        const g = x.createLinearGradient(0, 0, 0, s);
        g.addColorStop(0.0, '#050208');
        g.addColorStop(0.5, '#12060c');
        g.addColorStop(0.8, '#2a0d10');
        g.addColorStop(1.0, '#3a1210');
        x.fillStyle = g; x.fillRect(0, 0, s, s);

        // кровавая луна
        const moon = x.createRadialGradient(s * 0.68, s * 0.24, 0, s * 0.68, s * 0.24, 90);
        moon.addColorStop(0, 'rgba(255,120,90,0.95)');
        moon.addColorStop(0.35, 'rgba(220,70,50,0.55)');
        moon.addColorStop(1, 'rgba(180,40,30,0)');
        x.fillStyle = moon;
        x.beginPath(); x.arc(s * 0.68, s * 0.24, 90, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,150,120,0.9)';
        x.beginPath(); x.arc(s * 0.68, s * 0.24, 34, 0, Math.PI * 2); x.fill();

        // мутные тучи
        for (let i = 0; i < 16; i++) {
            const cx = Math.random() * s;
            const cy = Math.random() * s * 0.55;
            const r = 50 + Math.random() * 120;
            const cg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
            cg.addColorStop(0, 'rgba(60,20,24,0.5)');
            cg.addColorStop(1, 'rgba(60,20,24,0)');
            x.fillStyle = cg;
            x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
        }
        // звёзды
        x.fillStyle = 'rgba(255,220,220,0.8)';
        for (let i = 0; i < 120; i++) {
            x.globalAlpha = 0.2 + Math.random() * 0.6;
            x.fillRect(Math.random() * s, Math.random() * s * 0.5, 1.6, 1.6);
        }
        x.globalAlpha = 1;
    } else {
        const g = x.createLinearGradient(0, 0, 0, s);
        g.addColorStop(0.0, '#3d7fbf');
        g.addColorStop(0.45, '#8ec1e8');
        g.addColorStop(0.75, '#d6e8f5');
        g.addColorStop(1.0, '#f4e6c8');
        x.fillStyle = g; x.fillRect(0, 0, s, s);

        const sunGrad = x.createRadialGradient(s * 0.75, s * 0.25, 0, s * 0.75, s * 0.25, 220);
        sunGrad.addColorStop(0, 'rgba(255,245,200,1)');
        sunGrad.addColorStop(0.2, 'rgba(255,235,170,0.75)');
        sunGrad.addColorStop(1, 'rgba(255,235,170,0)');
        x.fillStyle = sunGrad;
        x.fillRect(0, 0, s, s);

        for (let i = 0; i < 22; i++) {
            const cx = Math.random() * s;
            const cy = Math.random() * s * 0.5;
            const r = 30 + Math.random() * 70;
            const cg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
            cg.addColorStop(0, 'rgba(255,255,255,0.85)');
            cg.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = cg;
            x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
        }
    }

    scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(2000, 32, 16),
        new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(c),
            side: THREE.BackSide, depthWrite: false, toneMapped: false,
        })
    ));
}

/* ============================================================
   МАТЕРИАЛЫ ОРУЖИЯ
   ============================================================ */
const GUNMAT = {
    body:  new THREE.MeshStandardMaterial({ color: 0x1f2228, roughness: 0.55, metalness: 0.85 }),
    dark:  new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.5, metalness: 0.9 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.35, metalness: 0.95 }),
    grip:  new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.9, metalness: 0.1 }),
    accent:  new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false }),
    accentP: new THREE.MeshBasicMaterial({ color: 0xff2d88, toneMapped: false }),
    accentO: new THREE.MeshBasicMaterial({ color: 0xffa02e, toneMapped: false }),
    lens:  new THREE.MeshStandardMaterial({ color: 0x0a1a2a, roughness: 0.1, metalness: 0.9,
                                            emissive: 0x00e5ff, emissiveIntensity: 0.5 }),
    hand:  new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.85, metalness: 0.05 }),
    wood:  new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85, metalness: 0.05 }),
};

function buildWeaponModel(id) {
    if (currentWeaponModel) {
        weaponHolder.remove(currentWeaponModel);
        disposeObj(currentWeaponModel);
    }
    currentWeaponModel = createWeaponModel(id);
    weaponHolder.add(currentWeaponModel);
}

function createWeaponModel(id) {
    switch (id) {
        case 'pistol':   return createPistol();
        case 'revolver': return createRevolver();
        case 'dmr':      return createDMR();
        case 'rifle':    return createRifle();
        case 'burst':    return createBurst();
        case 'smg':      return createSMG();
        case 'lmg':      return createLMG();
        case 'shotgun':  return createShotgun();
        case 'sniper':   return createSniper();
        default:         return createRifle();
    }
}

/* ============================================================
   3D-ПРЕВЬЮ ОРУЖИЯ В МЕНЮ
   ============================================================ */
let showcaseRenderer = null;
let showcaseScene = null;
let showcaseCamera = null;
let showcasePivot = null;
let showcaseModel = null;
let showcaseRing = null;
let showcaseT = 0;
let showcaseBroken = false;

function initShowcase() {
    const canvas = $('weapon-showcase');
    if (!canvas || showcaseBroken) return;
    try {
        showcaseRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        showcaseRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        showcaseRenderer.setSize(720, 420, false);
        showcaseRenderer.outputColorSpace = THREE.SRGBColorSpace;
        showcaseRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        showcaseRenderer.toneMappingExposure = 1.4;
    } catch (e) {
        showcaseBroken = true;
        console.warn('[SHOWCASE] disabled:', e);
        return;
    }

    showcaseScene = new THREE.Scene();
    showcaseCamera = new THREE.PerspectiveCamera(36, 720 / 420, 0.01, 60);

    // неоновая environment-карта: без неё металлические материалы чёрные
    try {
        const envCanvas = document.createElement('canvas');
        envCanvas.width = 64; envCanvas.height = 32;
        const ex = envCanvas.getContext('2d');
        const eg = ex.createLinearGradient(0, 0, 0, 32);
        eg.addColorStop(0, '#55688c');
        eg.addColorStop(0.5, '#1c2436');
        eg.addColorStop(1, '#0a0e18');
        ex.fillStyle = eg;
        ex.fillRect(0, 0, 64, 32);
        ex.fillStyle = 'rgba(0, 229, 255, 0.95)';
        ex.beginPath(); ex.arc(14, 10, 7, 0, Math.PI * 2); ex.fill();
        ex.fillStyle = 'rgba(255, 45, 136, 0.85)';
        ex.beginPath(); ex.arc(50, 22, 6, 0, Math.PI * 2); ex.fill();
        ex.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ex.beginPath(); ex.arc(34, 6, 4, 0, Math.PI * 2); ex.fill();
        const envTex = new THREE.CanvasTexture(envCanvas);
        envTex.mapping = THREE.EquirectangularReflectionMapping;
        envTex.colorSpace = THREE.SRGBColorSpace;
        const pmrem = new THREE.PMREMGenerator(showcaseRenderer);
        showcaseScene.environment = pmrem.fromEquirectangular(envTex).texture;
        pmrem.dispose();
        envTex.dispose();
    } catch (e) {
        console.warn('[SHOWCASE] env map skipped:', e);
    }

    showcaseScene.add(new THREE.AmbientLight(0x99aacc, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(3, 3.5, 2.5);
    showcaseScene.add(key);
    const fill = new THREE.DirectionalLight(0xaad4ff, 1.1);
    fill.position.set(-2.5, 1.2, 2.2);
    showcaseScene.add(fill);
    const rimCyan = new THREE.PointLight(0x00e5ff, 11, 8, 2);
    rimCyan.position.set(-1.5, 0.8, 1.3);
    showcaseScene.add(rimCyan);
    const rimMag = new THREE.PointLight(0xff2d88, 6, 8, 2);
    rimMag.position.set(2.0, -1.0, 0.9);
    showcaseScene.add(rimMag);

    showcaseRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.0, 0.016, 8, 72),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5, toneMapped: false })
    );
    showcaseRing.rotation.x = -Math.PI / 2;
    showcaseScene.add(showcaseRing);
    const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.009, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xff2d88, transparent: true, opacity: 0.35, toneMapped: false })
    );
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.1;
    showcaseRing.add(ring2);

    showcasePivot = new THREE.Group();
    showcaseScene.add(showcasePivot);
    setShowcaseWeapon(selectedWeapon);
}

function setShowcaseWeapon(id) {
    if (!showcaseScene || !showcasePivot) return;
    if (showcaseModel) {
        showcasePivot.remove(showcaseModel);
        disposeObj(showcaseModel);
    }
    const model = createWeaponModel(id);
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    model.position.set(-center.x, -center.y, -center.z);
    model.userData.baseY = -center.y;
    model.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.receiveShadow = false;
        if (o.material === GUNMAT.hand) { o.visible = false; return; }
        if (o.material && o.material.isMeshStandardMaterial) {
            o.material = o.material.clone();
            o.material.color.multiplyScalar(2.0);
            o.material.metalness = Math.min(o.material.metalness, 0.7);
            o.material.roughness = Math.max(o.material.roughness, 0.32);
        }
    });
    showcasePivot.add(model);
    showcaseModel = model;

    const maxDim = Math.max(size.x, size.y, size.z, 0.2);
    const dist = maxDim * 1.45 + 0.16;
    showcaseCamera.position.set(dist * 0.22, dist * 0.4, dist * 0.89);
    showcaseCamera.lookAt(0, 0.01, 0);
    showcasePivot.rotation.y = Math.PI / 2 - 0.35;
    if (showcaseRing) {
        showcaseRing.position.y = -size.y * 0.5 - 0.12;
        showcaseRing.scale.setScalar(maxDim * 0.55 + 0.08);
    }
}

function updateShowcase(dt) {
    if (!showcaseRenderer || running || showcaseBroken) return;
    showcaseT += dt;
    if (showcasePivot) showcasePivot.rotation.y += dt * 0.5;
    if (showcaseModel) {
        showcaseModel.position.y = (showcaseModel.userData.baseY || 0) + Math.sin(showcaseT * 1.3) * 0.025;
    }
    if (showcaseRing) {
        showcaseRing.rotation.z += dt * 0.35;
        showcaseRing.material.opacity = 0.35 + Math.sin(showcaseT * 2.2) * 0.15;
    }
    try {
        showcaseRenderer.render(showcaseScene, showcaseCamera);
    } catch (e) {
        showcaseBroken = true;
        console.warn('[SHOWCASE] render disabled:', e);
    }
}

function addRightHand(parent, x, y, z) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.04, 0.18, 8), GUNMAT.hand);
    f.position.set(x, y, z);
    f.rotation.x = 0.4; f.rotation.z = -0.35;
    parent.add(f);
}
function addLeftHand(parent, x, y, z) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.04, 0.18, 8), GUNMAT.hand);
    f.position.set(x, y, z);
    f.rotation.x = -0.35; f.rotation.z = 0.35;
    parent.add(f);
}

function createPistol() {
    const g = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.26), GUNMAT.body);
    slide.position.set(0, 0.02, -0.05); g.add(slide);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.22), GUNMAT.dark);
    frame.position.set(0, -0.04, -0.04); g.add(frame);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), GUNMAT.grip);
    grip.position.set(0, -0.13, 0.08); grip.rotation.x = -0.2; g.add(grip);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.22); g.add(barrel);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.012), GUNMAT.accent);
    sight.position.set(0, 0.075, -0.16); g.add(sight);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.005, 0.12), GUNMAT.accent);
    acc.position.set(0, 0.068, -0.05); g.add(acc);
    addRightHand(g, 0.035, -0.11, 0.08);
    return g;
}

function createRevolver() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.26), GUNMAT.body);
    body.position.set(0, 0.02, -0.02); g.add(body);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 10), GUNMAT.metal);
    cylinder.rotation.x = Math.PI / 2; cylinder.position.set(0, 0.03, -0.02); g.add(cylinder);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.24); g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), GUNMAT.wood);
    grip.position.set(0, -0.13, 0.08); grip.rotation.x = -0.28; g.add(grip);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.03), GUNMAT.dark);
    hammer.position.set(0, 0.09, 0.07); g.add(hammer);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.005, 0.1), GUNMAT.accentP);
    acc.position.set(0, 0.078, -0.02); g.add(acc);
    addRightHand(g, 0.04, -0.11, 0.08);
    return g;
}

function createDMR() {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.6), GUNMAT.body); g.add(upper);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.08, 0.34), GUNMAT.wood);
    handguard.position.set(0, -0.005, -0.34); g.add(handguard);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.012, 0.5, 12), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.012, -0.76); g.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.08, 12), GUNMAT.metal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.012, -1.02); g.add(muzzle);
    const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), GUNMAT.dark);
    scopeMount.position.set(0, 0.075, -0.05); g.add(scopeMount);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.26, 14), GUNMAT.dark);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.11, -0.05); g.add(scope);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 14), GUNMAT.lens);
    lens.rotation.y = Math.PI; lens.position.set(0, 0.11, -0.185); g.add(lens);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), GUNMAT.dark);
    mag.position.set(0, -0.15, 0.07); mag.rotation.x = 0.12; g.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.055), GUNMAT.wood);
    grip.position.set(0, -0.13, 0.17); grip.rotation.x = -0.25; g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.085, 0.3), GUNMAT.wood);
    stock.position.set(0, -0.02, 0.46); g.add(stock);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.006, 0.28), GUNMAT.accentO);
    acc.position.set(0, 0.055, -0.34); g.add(acc);
    addRightHand(g, 0.045, -0.11, 0.16);
    addLeftHand(g, -0.045, -0.08, -0.32);
    return g;
}

function createRifle() {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.62), GUNMAT.body); g.add(upper);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.32), GUNMAT.dark);
    lower.position.set(0, -0.075, 0.02); g.add(lower);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.085, 0.28), GUNMAT.dark);
    handguard.position.set(0, 0, -0.32); g.add(handguard);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.016, 0.7), GUNMAT.metal);
    rail.position.set(0, 0.065, -0.08); g.add(rail);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.42, 12), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.68); g.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.09, 12), GUNMAT.metal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.01, -0.92); g.add(muzzle);
    const fsight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), GUNMAT.metal);
    fsight.position.set(0, 0.085, -0.62); g.add(fsight);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.075), GUNMAT.dark);
    mag.position.set(0, -0.16, 0.06); mag.rotation.x = 0.12; g.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.055), GUNMAT.grip);
    grip.position.set(0, -0.14, 0.16); grip.rotation.x = -0.25; g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.22), GUNMAT.dark);
    stock.position.set(0, -0.025, 0.42); g.add(stock);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.006, 0.24), GUNMAT.accent);
    acc.position.set(0, 0.058, -0.32); g.add(acc);
    addRightHand(g, 0.045, -0.11, 0.15);
    addLeftHand(g, -0.045, -0.085, -0.30);
    return g;
}

function createBurst() {
    const g = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.10, 0.5), GUNMAT.body); g.add(upper);
    const carry = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.3), GUNMAT.dark);
    carry.position.set(0, 0.078, -0.02); g.add(carry);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.08, 0.26), GUNMAT.dark);
    handguard.position.set(0, -0.005, -0.31); g.add(handguard);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.34, 12), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.62); g.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.07, 6), GUNMAT.metal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.01, -0.8); g.add(muzzle);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.07), GUNMAT.dark);
    mag.position.set(0, -0.17, 0.0); mag.rotation.x = 0.3; g.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.055), GUNMAT.grip);
    grip.position.set(0, -0.13, 0.15); grip.rotation.x = -0.28; g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.26), GUNMAT.body);
    stock.position.set(0, -0.02, 0.38); g.add(stock);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.006, 0.2), GUNMAT.accentO);
    acc.position.set(0, 0.055, -0.3); g.add(acc);
    addRightHand(g, 0.045, -0.11, 0.14);
    addLeftHand(g, -0.045, -0.08, -0.3);
    return g;
}

function createSMG() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.42), GUNMAT.body); g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.22, 10), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.32); g.add(barrel);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.18), GUNMAT.dark);
    handguard.position.set(0, 0, -0.24); g.add(handguard);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.28, 0.06), GUNMAT.dark);
    mag.position.set(0, -0.20, -0.02); g.add(mag);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.13, 0.055), GUNMAT.grip);
    grip.position.set(0, -0.13, 0.14); grip.rotation.x = -0.22; g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), GUNMAT.metal);
    stock.position.set(0, -0.02, 0.32); g.add(stock);
    const butt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.10, 0.03), GUNMAT.grip);
    butt.position.set(0, -0.02, 0.43); g.add(butt);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.006, 0.28), GUNMAT.accent);
    acc.position.set(0, 0.058, -0.10); g.add(acc);
    addRightHand(g, 0.045, -0.11, 0.13);
    addLeftHand(g, -0.04, -0.075, -0.24);
    return g;
}

function createLMG() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.7), GUNMAT.body); g.add(body);
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.75), GUNMAT.metal);
    topRail.position.set(0, 0.08, -0.05); g.add(topRail);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 12), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.7); g.add(barrel);
    const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.32, 12), GUNMAT.dark);
    shroud.rotation.x = Math.PI / 2; shroud.position.set(0, 0.02, -0.48); g.add(shroud);
    const magBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.22), GUNMAT.dark);
    magBox.position.set(0, -0.13, -0.02); g.add(magBox);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.06), GUNMAT.grip);
    grip.position.set(0, -0.15, 0.16); grip.rotation.x = -0.25; g.add(grip);
    const grip2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.055), GUNMAT.grip);
    grip2.position.set(0, -0.13, -0.32); grip2.rotation.x = -0.15; g.add(grip2);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.28), GUNMAT.grip);
    stock.position.set(0, -0.03, 0.45); g.add(stock);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.006, 0.4), GUNMAT.accentP);
    acc.position.set(0, 0.072, -0.15); g.add(acc);
    addRightHand(g, 0.05, -0.13, 0.15);
    addLeftHand(g, -0.05, -0.10, -0.30);
    return g;
}

function createShotgun() {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.42), GUNMAT.body);
    receiver.position.set(0, 0, 0.05); g.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.55, 12), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.42); g.add(barrel);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.48, 12), GUNMAT.dark);
    tube.rotation.x = Math.PI / 2; tube.position.set(0, -0.045, -0.42); g.add(tube);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.16), GUNMAT.wood);
    pump.position.set(0, -0.045, -0.34); g.add(pump);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.02, 0.4), GUNMAT.metal);
    top.position.set(0, 0.068, 0.03); g.add(top);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12), GUNMAT.metal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.015, -0.72); g.add(muzzle);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.09, 0.28), GUNMAT.wood);
    stock.position.set(0, -0.03, 0.4); stock.rotation.x = -0.05; g.add(stock);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.008, 0.32), GUNMAT.accentP);
    acc.position.set(0, 0.03, 0.05); g.add(acc);
    addRightHand(g, 0.055, -0.11, 0.2);
    addLeftHand(g, -0.05, -0.075, -0.33);
    return g;
}

function createSniper() {
    const g = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.55), GUNMAT.body); g.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.011, 0.75, 12), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.78); g.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.1, 12), GUNMAT.metal);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 0.01, -1.18); g.add(muzzle);
    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.42, 16), GUNMAT.dark);
    scopeTube.rotation.x = Math.PI / 2; scopeTube.position.set(0, 0.105, 0.05); g.add(scopeTube);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.032, 0.05, 16), GUNMAT.dark);
    bell.rotation.x = Math.PI / 2; bell.position.set(0, 0.105, -0.18); g.add(bell);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), GUNMAT.lens);
    lens.rotation.y = Math.PI; lens.position.set(0, 0.105, -0.21); g.add(lens);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8), GUNMAT.metal);
    bolt.rotation.z = Math.PI / 2; bolt.position.set(0.07, 0.02, 0.15); g.add(bolt);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.34), GUNMAT.wood);
    stock.position.set(0, -0.025, 0.42); g.add(stock);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.14, 0.055), GUNMAT.wood);
    grip.position.set(0, -0.14, 0.18); grip.rotation.x = -0.2; g.add(grip);
    const acc = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.006, 0.4), GUNMAT.accent);
    acc.position.set(0, 0.05, -0.05); g.add(acc);
    addRightHand(g, 0.05, -0.11, 0.18);
    addLeftHand(g, -0.045, -0.08, -0.15);
    return g;
}

/* ============================================================
   СТИКМЕН
   ============================================================ */
function createStickman(color, cls) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    g.add(inner);

    if (cls === 'ghost') {
        inner.scale.set(0.78, 1.14, 0.78);
    } else if (cls === 'jugg') {
        inner.scale.set(1.55, 1.1, 1.42);
    }

    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x1a1f28, emissive: color, emissiveIntensity: 0.4,
        metalness: 0.35, roughness: 0.5,
    });
    const armorMat = new THREE.MeshStandardMaterial({
        color: 0x22262e, emissive: color, emissiveIntensity: 0.12,
        metalness: 0.55, roughness: 0.4,
    });
    const neonLine = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x16161c, metalness: 0.6, roughness: 0.4 });

    const legs = [];
    for (const sx of [-0.13, 0.13]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx, 0.85, 0);
        const geo = new THREE.CylinderGeometry(0.07, 0.07, 0.85, 6);
        geo.translate(0, -0.425, 0);
        const leg = new THREE.Mesh(geo, bodyMat);
        leg.castShadow = true;
        pivot.add(leg);
        const knee = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), armorMat);
        knee.position.y = -0.45;
        pivot.add(knee);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.28), darkMat);
        foot.position.set(0, -0.82, 0.06);
        pivot.add(foot);
        inner.add(pivot);
        legs.push(pivot);
    }

    const torsoGeo = new THREE.CylinderGeometry(0.21, 0.19, 0.72, 10);
    torsoGeo.translate(0, 0.36, 0);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.85;
    torso.castShadow = true;
    inner.add(torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.26), armorMat);
    chest.position.set(0, 1.18, 0.02);
    chest.castShadow = true;
    inner.add(chest);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.4), neonLine);
    stripe.position.set(0, 1.36, 0.06);
    inner.add(stripe);

    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.16), darkMat);
    backpack.position.set(0, 1.2, -0.22);
    inner.add(backpack);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), GUNMAT.metal);
    antenna.position.set(-0.14, 1.6, -0.2);
    inner.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), neonLine);
    antennaTip.position.set(-0.14, 1.76, -0.2);
    inner.add(antennaTip);

    const upper = new THREE.Group();
    upper.position.y = 1.55;
    inner.add(upper);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 12), bodyMat);
    head.position.y = 0.2;
    head.castShadow = true;
    upper.add(head);

    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.245, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), armorMat);
    helmet.position.y = 0.24;
    upper.add(helmet);

    const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.07, 0.05),
        new THREE.MeshBasicMaterial({ color, toneMapped: false })
    );
    visor.position.set(0, 0.22, 0.21);
    upper.add(visor);

    const arms = [];
    const baseArmRotX = -1.15;
    for (const sx of [-0.28, 0.28]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx, -0.02, 0);
        pivot.rotation.x = baseArmRotX;
        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), armorMat);
        pivot.add(shoulder);
        const geo = new THREE.CylinderGeometry(0.055, 0.05, 0.66, 6);
        geo.translate(0, -0.33, 0);
        const arm = new THREE.Mesh(geo, bodyMat);
        arm.castShadow = true;
        pivot.add(arm);
        upper.add(pivot);
        arms.push(pivot);
    }

    const gun = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.85), GUNMAT.dark);
    gun.add(gunBody);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), GUNMAT.metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.65;
    gun.add(barrel);
    const gunStripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.5), neonLine);
    gunStripe.position.y = 0.08;
    gun.add(gunStripe);
    gun.position.set(0.22, -0.48, 0.42);
    upper.add(gun);

    g.userData = { legs, arms, upper, baseArmRotX, walkPhase: 0, cls: cls || 'storm', label: null };
    return g;
}

/* ============================================================
   МОДЕЛИ v2: ДЕМОНЫ И ОХОТНИК
   (merge по материалам — минимум draw call при десятках демонов)
   ============================================================ */
function mergeGeoList(geos) {
    const list = geos.map(g => (g.index ? g.toNonIndexed() : g));
    let total = 0;
    for (const g of list) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const norm = new Float32Array(total * 3);
    let off = 0;
    for (const g of list) {
        pos.set(g.attributes.position.array, off);
        if (g.attributes.normal) norm.set(g.attributes.normal.array, off);
        off += g.attributes.position.array.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    return out;
}

function mergeParts(parts) {
    const byMat = new Map();
    for (const p of parts) {
        const g = p.geo.clone();
        const q = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(p.rot ? p.rot[0] : 0, p.rot ? p.rot[1] : 0, p.rot ? p.rot[2] : 0));
        const m = new THREE.Matrix4().compose(
            new THREE.Vector3(p.pos ? p.pos[0] : 0, p.pos ? p.pos[1] : 0, p.pos ? p.pos[2] : 0),
            q,
            new THREE.Vector3(p.scale ? p.scale[0] : 1, p.scale ? p.scale[1] : 1, p.scale ? p.scale[2] : 1));
        g.applyMatrix4(m);
        const arr = byMat.get(p.mat) || [];
        arr.push(g);
        byMat.set(p.mat, arr);
    }
    const group = new THREE.Group();
    for (const [mat, geos] of byMat) {
        const mesh = new THREE.Mesh(mergeGeoList(geos), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        group.add(mesh);
    }
    return group;
}

const DEMON_VIS = {
    runner:   { scale: 0.85, skin: 0x5c1414, glow: 0xff2a18, horn: 0.9,  jaw: 1.0 },
    brute:    { scale: 1.55, skin: 0x46100e, glow: 0xff4422, horn: 1.15, jaw: 0.8 },
    screamer: { scale: 1.00, skin: 0x3a1a4c, glow: 0xdd66ff, horn: 1.0,  jaw: 1.25 },
    spitter:  { scale: 1.00, skin: 0x1f3a18, glow: 0x77ee44, horn: 0.85, jaw: 1.1 },
    titan:    { scale: 2.45, skin: 0x320a08, glow: 0xff1512, horn: 1.4,  jaw: 0.9 },
};

function demonMaterials(type) {
    const v = DEMON_VIS[type] || DEMON_VIS.runner;
    return {
        skin: new THREE.MeshStandardMaterial({
            color: v.skin, roughness: 0.72, metalness: 0.12,
            emissive: new THREE.Color(v.glow).multiplyScalar(0.12),
        }),
        bone: new THREE.MeshStandardMaterial({ color: 0xd8cbb2, roughness: 0.55, metalness: 0.05 }),
        eye: new THREE.MeshBasicMaterial({ color: v.glow, toneMapped: false }),
        mouth: new THREE.MeshStandardMaterial({ color: 0x140404, roughness: 0.9, metalness: 0.0 }),
    };
}

function createDemon(type) {
    const v = DEMON_VIS[type] || DEMON_VIS.runner;
    const M = demonMaterials(type);
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    g.add(inner);

    // === корпус (skin), статика ===
    const bodyParts = [
        { geo: new THREE.BoxGeometry(0.4, 0.26, 0.3), mat: M.skin, pos: [0, 1.0, 0] },
        { geo: new THREE.CylinderGeometry(0.26, 0.2, 0.78, 8), mat: M.skin, pos: [0, 1.45, 0.03], rot: [0.24, 0, 0] },
        { geo: new THREE.CylinderGeometry(0.09, 0.12, 0.26, 7), mat: M.skin, pos: [0, 1.98, 0.09], rot: [0.32, 0, 0] },
        { geo: new THREE.BoxGeometry(0.34, 0.05, 0.17), mat: M.skin, pos: [0, 1.34, 0.19], rot: [0.24, 0, 0] },
        { geo: new THREE.BoxGeometry(0.33, 0.05, 0.16), mat: M.skin, pos: [0, 1.47, 0.2], rot: [0.24, 0, 0] },
        { geo: new THREE.BoxGeometry(0.31, 0.05, 0.15), mat: M.skin, pos: [0, 1.6, 0.21], rot: [0.24, 0, 0] },
        { geo: new THREE.SphereGeometry(0.13, 8, 6), mat: M.skin, pos: [-0.3, 1.74, 0.02] },
        { geo: new THREE.SphereGeometry(0.13, 8, 6), mat: M.skin, pos: [0.3, 1.74, 0.02] },
        { geo: new THREE.BoxGeometry(0.2, 0.2, 0.14), mat: M.mouth, pos: [0, 2.14, 0.1] },
    ];
    for (let i = 0; i < 5; i++) {
        bodyParts.push({
            geo: new THREE.ConeGeometry(0.05, 0.24, 6), mat: M.skin,
            pos: [0, 1.14 + i * 0.18, -0.24 - i * 0.012],
            rot: [-0.85 - i * 0.06, 0, 0],
        });
    }
    const body = mergeParts(bodyParts);
    body.traverse(o => { o.castShadow = true; });
    inner.add(body);

    // === голова (статика: череп + надбровье) ===
    const head = new THREE.Group();
    head.position.set(0, 2.18, 0.12);
    const headParts = [
        { geo: new THREE.SphereGeometry(0.21, 12, 10), mat: M.skin, scale: [1, 0.9, 1.18] },
        { geo: new THREE.BoxGeometry(0.3, 0.07, 0.12), mat: M.skin, pos: [0, 0.06, 0.11] },
        { geo: new THREE.BoxGeometry(0.2, 0.05, 0.06), mat: M.skin, pos: [0, 0.1, 0.16] },
    ];
    head.add(mergeParts(headParts));

    // рога (кость)
    const hornParts = [];
    for (const sx of [-1, 1]) {
        const base = [sx * 0.15, 0.16, 0.0];
        const segs = [
            { r: 0.055, h: 0.2, rx: -0.45, dz: -0.04, dy: 0.1 },
            { r: 0.042, h: 0.18, rx: -0.85, dz: -0.09, dy: 0.24 },
            { r: 0.03, h: 0.16, rx: -1.25, dz: -0.16, dy: 0.36 },
        ];
        for (const s of segs) {
            hornParts.push({
                geo: new THREE.ConeGeometry(s.r * (v.horn), s.h * v.horn, 6),
                mat: M.bone,
                pos: [base[0] + sx * (s.dy * 0.12), base[1] + s.dy, base[2] + s.dz],
                rot: [s.rx, 0, sx * 0.12],
            });
        }
    }
    head.add(mergeParts(hornParts));

    // глаза
    const eyeParts = [];
    for (const sx of [-1, 1]) {
        eyeParts.push({ geo: new THREE.SphereGeometry(0.042, 8, 6), mat: M.eye, pos: [sx * 0.082, 0.02, 0.2] });
    }
    head.add(mergeParts(eyeParts));

    // верхняя челюсть с клыками
    const jawU = new THREE.Group();
    const jawUParts = [
        { geo: new THREE.BoxGeometry(0.24, 0.075, 0.2), mat: M.skin, pos: [0, -0.05, 0.13] },
    ];
    const jawUTeeth = [];
    for (let i = -2; i <= 2; i++) {
        jawUTeeth.push({ geo: new THREE.ConeGeometry(0.017, 0.065, 5), mat: M.bone, pos: [i * 0.048, -0.11, 0.21], rot: [Math.PI, 0, 0] });
    }
    jawU.add(mergeParts(jawUParts));
    jawU.add(mergeParts(jawUTeeth));
    head.add(jawU);

    // нижняя челюсть (анимируется)
    const jawL = new THREE.Group();
    jawL.position.set(0, -0.09, 0.0);
    const jawLParts = [
        { geo: new THREE.BoxGeometry(0.2, 0.06, 0.19), mat: M.skin, pos: [0, -0.03, 0.11] },
    ];
    const jawLTeeth = [];
    for (let i = -2; i <= 2; i++) {
        jawLTeeth.push({ geo: new THREE.ConeGeometry(0.016, 0.06, 5), mat: M.bone, pos: [i * 0.042, 0.02, 0.19] });
    }
    jawL.add(mergeParts(jawLParts));
    jawL.add(mergeParts(jawLTeeth));
    head.add(jawL);
    inner.add(head);

    // === ноги ===
    const legs = [];
    for (const sx of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 0.19, 1.0, 0);
        const legParts = [
            { geo: new THREE.CylinderGeometry(0.1, 0.082, 0.55, 7), mat: M.skin, pos: [0, -0.27, 0.01] },
            { geo: new THREE.CylinderGeometry(0.072, 0.058, 0.5, 7), mat: M.skin, pos: [0, -0.76, 0.05], rot: [0.16, 0, 0] },
            { geo: new THREE.BoxGeometry(0.15, 0.08, 0.32), mat: M.skin, pos: [0, -1.02, 0.14] },
        ];
        for (let c = -1; c <= 1; c++) {
            legParts.push({ geo: new THREE.ConeGeometry(0.02, 0.13, 5), mat: M.bone, pos: [c * 0.05, -1.02, 0.3], rot: [1.35, 0, 0] });
        }
        hip.add(mergeParts(legParts));
        inner.add(hip);
        legs.push(hip);
    }

    // === руки ===
    const arms = [];
    for (const sx of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(sx * 0.33, 1.72, 0.02);
        const armParts = [
            { geo: new THREE.CylinderGeometry(0.072, 0.06, 0.52, 7), mat: M.skin, pos: [0, -0.26, 0.02] },
            { geo: new THREE.CylinderGeometry(0.055, 0.048, 0.52, 7), mat: M.skin, pos: [0, -0.76, 0.05], rot: [0.12, 0, 0] },
            { geo: new THREE.BoxGeometry(0.13, 0.09, 0.15), mat: M.skin, pos: [0, -1.05, 0.08] },
        ];
        for (let c = -1; c <= 1; c++) {
            armParts.push({ geo: new THREE.ConeGeometry(0.021, 0.21, 5), mat: M.bone, pos: [c * 0.045, -1.08, 0.19], rot: [1.85, 0, 0] });
        }
        sh.add(mergeParts(armParts));
        sh.rotation.x = -0.42;
        inner.add(sh);
        arms.push(sh);
    }

    g.scale.setScalar(v.scale);
    g.userData = {
        kind: 'demon', type,
        legs, arms, head, jawU, jawL,
        baseArmRotX: -0.42, walkPhase: 0,
        label: null,
    };
    return g;
}

function createHunter(color) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    g.add(inner);

    const armor = new THREE.MeshStandardMaterial({
        color: 0x232b38, roughness: 0.55, metalness: 0.45,
        emissive: new THREE.Color(color).multiplyScalar(0.08),
    });
    const suit = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.8, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d1016, roughness: 0.6, metalness: 0.5 });
    const glow = new THREE.MeshBasicMaterial({ color, toneMapped: false });

    // ноги
    const legs = [];
    for (const sx of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 0.15, 0.92, 0);
        hip.add(mergeParts([
            { geo: new THREE.CylinderGeometry(0.085, 0.07, 0.5, 7), mat: suit, pos: [0, -0.25, 0] },
            { geo: new THREE.CylinderGeometry(0.065, 0.06, 0.48, 7), mat: suit, pos: [0, -0.72, 0.02] },
            { geo: new THREE.SphereGeometry(0.075, 7, 6), mat: armor, pos: [0, -0.48, 0] },
            { geo: new THREE.BoxGeometry(0.16, 0.1, 0.3), mat: dark, pos: [0, -0.95, 0.06] },
        ]));
        inner.add(hip);
        legs.push(hip);
    }

    // корпус
    const bodyParts = [
        { geo: new THREE.CylinderGeometry(0.21, 0.19, 0.55, 9), mat: suit, pos: [0, 1.15, 0] },
        { geo: new THREE.BoxGeometry(0.4, 0.36, 0.26), mat: armor, pos: [0, 1.3, 0.02] },
        { geo: new THREE.BoxGeometry(0.42, 0.06, 0.28), mat: glow, pos: [0, 1.44, 0.02] },
        { geo: new THREE.BoxGeometry(0.36, 0.16, 0.22), mat: dark, pos: [0, 0.94, 0] },
        { geo: new THREE.BoxGeometry(0.3, 0.36, 0.16), mat: dark, pos: [0, 1.25, -0.22] },
        { geo: new THREE.BoxGeometry(0.16, 0.04, 0.02), mat: glow, pos: [0, 1.25, -0.31] },
        { geo: new THREE.SphereGeometry(0.1, 8, 6), mat: armor, pos: [-0.27, 1.5, 0] },
        { geo: new THREE.SphereGeometry(0.1, 8, 6), mat: armor, pos: [0.27, 1.5, 0] },
    ];
    inner.add(mergeParts(bodyParts));

    // голова: шлем + визор
    const upper = new THREE.Group();
    upper.position.y = 1.6;
    upper.add(mergeParts([
        { geo: new THREE.SphereGeometry(0.17, 12, 10), mat: armor, pos: [0, 0.16, 0] },
        { geo: new THREE.BoxGeometry(0.3, 0.05, 0.22), mat: dark, pos: [0, 0.06, 0.02] },
    ]));
    upper.add(mergeParts([
        { geo: new THREE.BoxGeometry(0.24, 0.06, 0.04), mat: glow, pos: [0, 0.16, 0.16] },
    ]));
    inner.add(upper);

    // руки
    const arms = [];
    const baseArmRotX = -1.05;
    for (const sx of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(sx * 0.3, 1.5, 0);
        sh.rotation.x = baseArmRotX;
        sh.add(mergeParts([
            { geo: new THREE.CylinderGeometry(0.055, 0.05, 0.42, 7), mat: suit, pos: [0, -0.21, 0] },
            { geo: new THREE.CylinderGeometry(0.05, 0.045, 0.4, 7), mat: suit, pos: [0, -0.6, 0.02] },
            { geo: new THREE.BoxGeometry(0.09, 0.08, 0.11), mat: dark, pos: [0, -0.82, 0.03] },
        ]));
        inner.add(sh);
        arms.push(sh);
    }

    // оружие в руках
    const gun = new THREE.Group();
    gun.add(mergeParts([
        { geo: new THREE.BoxGeometry(0.09, 0.11, 0.62), mat: dark },
        { geo: new THREE.CylinderGeometry(0.016, 0.016, 0.34, 8), mat: armor, pos: [0, 0.01, -0.45], rot: [Math.PI / 2, 0, 0] },
        { geo: new THREE.BoxGeometry(0.05, 0.14, 0.05), mat: dark, pos: [0, -0.12, 0.12], rot: [-0.25, 0, 0] },
        { geo: new THREE.BoxGeometry(0.06, 0.16, 0.07), mat: dark, pos: [0, -0.13, -0.06], rot: [0.15, 0, 0] },
    ]));
    gun.add(mergeParts([
        { geo: new THREE.BoxGeometry(0.1, 0.006, 0.2), mat: glow, pos: [0, 0.058, -0.2] },
    ]));
    gun.position.set(0, -0.62, 0.24);
    upper.add(gun);

    g.userData = {
        kind: 'hunter', legs, arms, upper, baseArmRotX,
        walkPhase: 0, label: null,
    };
    return g;
}

function makeNameLabel(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(16,24,36,0.8)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = hexColor(color);
    ctx.lineWidth = 5;
    ctx.strokeRect(2.5, 2.5, 251, 59);
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
    }));
    sprite.scale.set(4, 1, 1);
    sprite.position.y = 2.75;
    return sprite;
}

/* ============================================================
   ГРАНАТЫ И АПТЕЧКИ
   ============================================================ */
function createGrenadeMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'smoke') {
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.34, 12),
            new THREE.MeshStandardMaterial({ color: 0x5a636e, roughness: 0.5, metalness: 0.6 })
        );
        g.add(body);
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(0.135, 0.135, 0.07, 12),
            new THREE.MeshBasicMaterial({ color: 0xd8dee6, toneMapped: false })
        );
        g.add(band);
    } else if (kind === 'flash') {
        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12),
            new THREE.MeshStandardMaterial({ color: 0x3d3a30, roughness: 0.45, metalness: 0.7 })
        );
        g.add(body);
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(0.125, 0.125, 0.08, 12),
            new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false })
        );
        g.add(band);
    } else {
        const body = new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 12, 10),
            new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.6, metalness: 0.4,
                                             emissive: 0xff2200, emissiveIntensity: 0.35 })
        );
        g.add(body);
    }
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.16, 0.02, 6, 16),
        new THREE.MeshBasicMaterial({
            color: kind === 'smoke' ? 0xbfc8d2 : (kind === 'flash' ? 0xffd34d : 0xff4400),
            toneMapped: false,
        })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.userData.ring = ring;
    return g;
}

function createMedkitMesh() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.4, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6,
                                         emissive: 0x224422, emissiveIntensity: 0.25 })
    );
    g.add(base);
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x22ff66, toneMapped: false });
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.12), crossMat);
    g.add(cross1);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.5), crossMat);
    g.add(cross2);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x44ff88, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.set(2.2, 2.2, 1);
    glow.position.y = 0.6;
    g.add(glow);
    g.position.y = 0.2;
    return g;
}

function createPickupMesh() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.4, 0.55),
        new THREE.MeshStandardMaterial({ color: 0x3a3320, roughness: 0.5, metalness: 0.6,
                                         emissive: 0xffaa22, emissiveIntensity: 0.5 })
    );
    g.add(box);
    const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.1, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false })
    );
    g.add(band);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xffcc44, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.set(2.0, 2.0, 1);
    glow.position.y = 0.5;
    g.add(glow);
    g.position.y = 0.2;
    return g;
}

/* ============================================================
   ДЫМ
   ============================================================ */
let smokeTexture = null;
function getSmokeTexture() {
    if (smokeTexture) return smokeTexture;
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    // клубная текстура: несколько мягких пятен
    for (let i = 0; i < 16; i++) {
        const cx = s / 2 + (Math.random() - 0.5) * s * 0.42;
        const cy = s / 2 + (Math.random() - 0.5) * s * 0.42;
        const r = s * (0.15 + Math.random() * 0.22);
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(238,242,248,0.5)');
        g.addColorStop(0.55, 'rgba(212,220,230,0.22)');
        g.addColorStop(1, 'rgba(200,208,220,0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.fill();
    }
    smokeTexture = new THREE.CanvasTexture(c);
    return smokeTexture;
}

function createSmokeVisual(x, y, z) {
    // ОДИН THREE.Points на облако: 1 draw call, радиус ~10.8 (как на сервере)
    const N = 110;
    const R = 9.6;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const rad = Math.sqrt(Math.random()) * R;
        pos[i * 3] = Math.cos(a) * rad;
        pos[i * 3 + 1] = 0.7 + Math.random() * 5.4 - (rad / R) * 1.3;
        pos[i * 3 + 2] = Math.sin(a) * rad;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        map: getSmokeTexture(),
        size: 7.8,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        toneMapped: false,
        color: 0xd6dde6,
        sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.position.set(x, y, z);
    pts.rotation.y = Math.random() * Math.PI * 2;
    scene.add(pts);
    return { group: pts, mat, geo, baseY: y, spin: (Math.random() - 0.5) * 0.08 + 0.03 };
}

/* ============================================================
   ЭФФЕКТЫ
   ============================================================ */
function spawnTracerLimited(x, y, z, dx, dy, dz, color, length) {
    const len = Math.max(1, length);
    const geo = new THREE.CylinderGeometry(0.035, 0.035, len, 6, 1, true);
    geo.translate(0, len / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(x, y, z);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    scene.add(beam);
    tracers.push({ mesh: beam, life: 0.09, age: 0 });
}

function spawnExplosion(x, y, z) {
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({
            color: 0xffaa33, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })
    );
    sphere.position.set(x, y, z);
    scene.add(sphere);
    explosionRings.push({ mesh: sphere, life: 0.6, age: 0, maxScale: 5.0 });

    const light = new THREE.PointLight(0xffaa44, 14, 24, 2);
    light.position.set(x, y + 0.5, z);
    scene.add(light);
    setTimeout(() => scene.remove(light), 240);

    const N = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const vels = [];
    for (let i = 0; i < N; i++) {
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        const dir = new THREE.Vector3(
            Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5
        ).normalize().multiplyScalar(10 + Math.random() * 14);
        vels.push(dir);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffcc44, size: 0.4, map: getParticleTexture(),
        transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    impacts.push({ points, geo, mat, vels, life: 1.4, age: 0 });
}

function updateEffects(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.age += dt;
        t.mesh.material.opacity = Math.max(0, 0.85 * (1 - t.age / t.life));
        if (t.age >= t.life) {
            scene.remove(t.mesh);
            t.mesh.geometry.dispose(); t.mesh.material.dispose();
            tracers.splice(i, 1);
        }
    }
    for (let i = impacts.length - 1; i >= 0; i--) {
        const e = impacts[i];
        e.age += dt;
        const arr = e.geo.attributes.position.array;
        for (let j = 0; j < e.vels.length; j++) {
            const v = e.vels[j];
            arr[j * 3] += v.x * dt;
            arr[j * 3 + 1] += v.y * dt;
            arr[j * 3 + 2] += v.z * dt;
            v.y -= 22 * dt;
        }
        e.geo.attributes.position.needsUpdate = true;
        e.mat.opacity = Math.max(0, 1 - e.age / e.life);
        if (e.age >= e.life) {
            scene.remove(e.points);
            e.geo.dispose(); e.mat.dispose();
            impacts.splice(i, 1);
        }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.age += dt;
        if (f.age >= f.life) {
            scene.remove(f.sprite);
            f.sprite.material.dispose();
            flashes.splice(i, 1);
        } else {
            const k = f.age / f.life;
            f.sprite.material.opacity = 0.9 * (1 - k);
            f.sprite.scale.setScalar(f.scale0 * (1 + k * 1.5));
        }
    }
    for (let i = shrapnel.length - 1; i >= 0; i--) {
        const s = shrapnel[i];
        s.age += dt;
        s.vel.y -= 22 * dt;
        s.mesh.position.x += s.vel.x * dt;
        s.mesh.position.y += s.vel.y * dt;
        s.mesh.position.z += s.vel.z * dt;
        s.mesh.rotation.x += s.angVel.x * dt;
        s.mesh.rotation.y += s.angVel.y * dt;
        s.mesh.rotation.z += s.angVel.z * dt;
        if (s.mesh.position.y < 0.2) {
            s.mesh.position.y = 0.2; s.vel.y *= -0.3;
            s.vel.x *= 0.6; s.vel.z *= 0.6;
        }
        const k = s.age / s.life;
        s.mesh.traverse(o => {
            if (o.material && o.material.opacity !== undefined) o.material.opacity = Math.max(0, 1 - k);
        });
        if (s.age >= s.life) {
            scene.remove(s.mesh);
            disposeObj(s.mesh);
            shrapnel.splice(i, 1);
        }
    }
    for (let i = explosionRings.length - 1; i >= 0; i--) {
        const e = explosionRings[i];
        e.age += dt;
        const k = e.age / e.life;
        e.mesh.scale.setScalar(0.5 + e.maxScale * k);
        e.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
        if (e.age >= e.life) {
            scene.remove(e.mesh);
            e.mesh.geometry.dispose(); e.mesh.material.dispose();
            explosionRings.splice(i, 1);
        }
    }
}

function explodeStickman(mesh, color) {
    if (!mesh) return;
    const origin = new THREE.Vector3();
    mesh.getWorldPosition(origin);
    mesh.children.forEach(child => {
        if (!child.visible) return;
        const clone = child.clone(true);
        clone.traverse(o => {
            if (o.material) {
                o.material = o.material.clone();
                o.material.transparent = true;
            }
        });
        const wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        clone.position.copy(wp);
        clone.rotation.copy(child.rotation);
        scene.add(clone);
        shrapnel.push({
            mesh: clone,
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 14, 6 + Math.random() * 8, (Math.random() - 0.5) * 14
            ),
            angVel: new THREE.Vector3(
                (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10
            ),
            life: 1.6, age: 0,
        });
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(origin); sprite.position.y += 1.0;
    sprite.scale.set(3.5, 3.5, 3.5);
    scene.add(sprite);
    flashes.push({ sprite, life: 0.5, age: 0, scale0: 3.5 });
}

let particleTexture = null;
function getParticleTexture() {
    if (particleTexture) return particleTexture;
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    x.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    x.fill();
    particleTexture = new THREE.CanvasTexture(c);
    return particleTexture;
}

function spawnGoreBurst(origin, color, count, speed, size) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vels = [];
    for (let i = 0; i < count; i++) {
        pos[i * 3] = origin.x;
        pos[i * 3 + 1] = origin.y;
        pos[i * 3 + 2] = origin.z;
        vels.push(new THREE.Vector3(
            Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5
        ).normalize().multiplyScalar(speed * (0.5 + Math.random())));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color, size, map: getParticleTexture(),
        transparent: true, opacity: 1,
        depthWrite: false, toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    impacts.push({ points, geo, mat, vels, life: 1.3, age: 0 });
}

function explodeDemon(mesh, type) {
    if (!mesh) return;
    const origin = new THREE.Vector3();
    mesh.getWorldPosition(origin);
    origin.y += 1.0;

    // куски плоти
    mesh.children.forEach(child => {
        if (!child.visible) return;
        const clone = child.clone(true);
        clone.traverse(o => {
            if (o.material) {
                o.material = o.material.clone();
                o.material.transparent = true;
                if (o.material.isMeshStandardMaterial) {
                    o.material.emissive.setHex(0x660000);
                    o.material.emissiveIntensity = 0.7;
                }
            }
        });
        const wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        clone.position.copy(wp);
        clone.rotation.copy(child.rotation);
        scene.add(clone);
        shrapnel.push({
            mesh: clone,
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 16, 5 + Math.random() * 10, (Math.random() - 0.5) * 16),
            angVel: new THREE.Vector3(
                (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
            life: 1.5, age: 0,
        });
    });

    // кровь: яркая + тёмная эссенция
    spawnGoreBurst(origin, 0xbb1414, 60, 16, 0.5);
    spawnGoreBurst(origin, 0x4a0505, 40, 11, 0.75);

    const light = new THREE.PointLight(0xff2200, 16, 20, 2);
    light.position.copy(origin);
    scene.add(light);
    setTimeout(() => scene.remove(light), 220);

    const ring = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 10),
        new THREE.MeshBasicMaterial({
            color: 0x991111, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })
    );
    ring.position.set(origin.x, 0.5, origin.z);
    scene.add(ring);
    explosionRings.push({ mesh: ring, life: 0.5, age: 0, maxScale: 3.2 });

    const snd = spatialSound(origin);
    AU.demonExplode(snd.pan, Math.max(0.25, snd.vol));
}

function spawnAcidSplash(pos) {
    spawnGoreBurst(pos, 0x77ee44, 14, 6.5, 0.2);
}

function spawnClawFX(pos) {
    for (let i = -1; i <= 1; i++) {
        const a = (Math.random() - 0.5) * 1.2;
        const dx = Math.sin(a + i * 0.4) * 0.3;
        const dz = Math.cos(a + i * 0.4) * 0.3;
        spawnTracerLimited(pos.x - dx * 0.5, pos.y + 0.3 + i * 0.12, pos.z - dz * 0.5,
                           dx, 0.05, dz, 0xff3333, 1.1);
    }
}

/* ============================================================
   RAY-AABB
   ============================================================ */
function rayAABB(ox, oy, oz, dx, dy, dz, c) {
    const w = c.h;
    let tmin = -Infinity, tmax = Infinity;
    const bounds = [
        [ox, dx, c.x - c.hw, c.x + c.hw],
        [oy, dy, 0.0, w],
        [oz, dz, c.z - c.hd, c.z + c.hd],
    ];
    for (const [o, d, lo, hi] of bounds) {
        const dd = Math.abs(d) < 1e-8 ? (d >= 0 ? 1e-8 : -1e-8) : d;
        let t1 = (lo - o) / dd;
        let t2 = (hi - o) / dd;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    return Math.max(tmin, 0);
}

function segmentClear3D(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.001) return true;
    dir.normalize();
    for (const c of collidersInBox(a.x, a.z, b.x, b.z)) {
        const t = rayAABB(a.x, a.y, a.z, dir.x, dir.y, dir.z, c);
        if (t !== null && t > 0.3 && t < len - 0.3) return false;
    }
    return true;
}

/* ============================================================
   ВВОД
   ============================================================ */
function initInput() {
    addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (!Music.started && !Music.muted) Music.start();
        if (k === 'escape' && world.shopOpen) {
            toggleShop(false);
            return;
        }
        if (k === 'tab') {
            e.preventDefault();
            if (running) {
                scoreboardVisible = true;
                if (scoreboardEl) scoreboardEl.classList.remove('hidden');
                renderScoreboard();
            }
            return;
        }
        if (!keys[k]) onKeyPress(k);
        keys[k] = true;
        if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
            e.preventDefault();
        }
    });
    addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (k === 'tab') {
            scoreboardVisible = false;
            if (scoreboardEl) scoreboardEl.classList.add('hidden');
        }
        keys[k] = false;
    });
    addEventListener('blur', () => {
        for (const k in keys) keys[k] = false;
        mouseLeftDown = mouseRightDown = false;
        scoreboardVisible = false;
        if (scoreboardEl) scoreboardEl.classList.add('hidden');
    });
    addEventListener('mousemove', (e) => {
        if (!running || !pointerLocked) return;
        const sens = CFG.MOUSE_SENS * (world.ads ? 0.55 : 1.0);
        world.yaw -= e.movementX * sens;
        world.pitch -= e.movementY * sens;
        world.pitch = clamp(world.pitch, -CFG.MAX_PITCH, CFG.MAX_PITCH);
        world.swayX += -e.movementX * 0.0006;
        world.swayY += -e.movementY * 0.0006;
        world.swayX = clamp(world.swayX, -0.04, 0.04);
        world.swayY = clamp(world.swayY, -0.04, 0.04);
    });
    addEventListener('mousedown', (e) => {
        AU.resume();
        if (!running) return;
        if (e.button === 0) { mouseLeftDown = true; if (world.alive) tryShoot(); }
        else if (e.button === 2) mouseRightDown = true;
    });
    addEventListener('mouseup', (e) => {
        if (e.button === 0) mouseLeftDown = false;
        else if (e.button === 2) mouseRightDown = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
        pointerLocked = document.pointerLockElement === renderer.domElement;
    });
}

function onKeyPress(k) {
    if (world.shopOpen) {
        if (k >= '1' && k <= '5') {
            buyUpgrade(UPGRADE_DEFS[parseInt(k, 10) - 1].id);
        } else if (k === 'b' || k === 'escape') {
            toggleShop(false);
        }
        return;
    }
    if (k === 'b') {
        toggleShop();
    } else if (k >= '1' && k <= '9') {
        const idx = parseInt(k, 10) - 1;
        const id = CFG.WEAPON_ORDER[idx];
        if (id) switchWeapon(id);
    } else if (k === 'q' || k === 'e') {
        const cur = CFG.WEAPON_ORDER.indexOf(world.weapon);
        const next = (k === 'q')
            ? (cur - 1 + CFG.WEAPON_ORDER.length) % CFG.WEAPON_ORDER.length
            : (cur + 1) % CFG.WEAPON_ORDER.length;
        switchWeapon(CFG.WEAPON_ORDER[next]);
    } else if (k === 'r') {
        startReload();
    } else if (k === 'v') {
        cycleGrenade();
    } else if (k === 'g') {
        if (world.alive) tryGrenade();
    } else if (k === 'f') {
        if (world.alive && world.nearbyMedkit) tryMedkit(world.nearbyMedkit);
    } else if (k === 'm') {
        Music.toggle();
    }
}

function cycleGrenade() {
    const order = ['frag', 'smoke', 'flash'];
    const cur = order.indexOf(world.grenadeSel);
    world.grenadeSel = order[(cur + 1) % order.length];
    updateGrenadeHud();
    AU.ui();
}

function switchWeapon(id) {
    if (!CFG.WEAPONS[id]) return;
    if (world.weapon === id) return;
    world.weapon = id;
    world.weaponCD = 0;
    world.ammo = effMag();
    world.reserve = effMag() * 3;
    world.reloadLeft = 0;
    world.reloadTotal = 0;
    buildAmmoPips();
    buildWeaponModel(id);
    if (weaponNameEl) weaponNameEl.textContent = CFG.WEAPONS[id].name;
    if (weaponClassEl) weaponClassEl.textContent = WEAPON_CLASS_LABEL[id] || '';
    if (weaponModeEl) weaponModeEl.textContent = weaponModeLabel(id);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'weapon', weapon: id }));
    }
    if (crosshairEl) crosshairEl.classList.toggle('ads', world.ads);
}

/* ============================================================
   СТРЕЛЬБА + ПЕРЕЗАРЯДКА
   ============================================================ */
function startReload() {
    if (!world.alive || world.reloadLeft > 0 || world.ammo >= effMag()) return;
    if (world.reserve <= 0) { AU.dry(0); return; }
    world.reloadTotal = effReloadTime();
    world.reloadLeft = world.reloadTotal;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'reload' }));
    }
    AU.reloadStart(0);
}

function fireTracer(origin, dx, dy, dz, wp) {
    const RAY_LEN = 60;
    let traceLen = RAY_LEN;
    const ex = origin.x + dx * RAY_LEN;
    const ez = origin.z + dz * RAY_LEN;
    for (const c of collidersInBox(origin.x, origin.z, ex, ez)) {
        const t = rayAABB(origin.x, origin.y, origin.z, dx, dy, dz, c);
        if (t !== null && t > 0 && t < traceLen) traceLen = t;
    }
    spawnTracerLimited(origin.x, origin.y, origin.z, dx, dy, dz, wp.tracer, traceLen);

    const flashLight = new THREE.PointLight(0xffdd88, 4, 8, 2);
    flashLight.position.copy(origin);
    scene.add(flashLight);
    setTimeout(() => scene.remove(flashLight), 50);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xffee99, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(origin);
    sprite.scale.set(0.5, 0.5, 0.5);
    scene.add(sprite);
    flashes.push({ sprite, life: 0.07, age: 0, scale0: 0.5 });
}

function computeShotDirection(spreadScale) {
    const wp = CFG.WEAPONS[world.weapon];
    const speed = Math.hypot(world.velocity.x, world.velocity.z);
    const moveFactor = clamp(speed / CFG.MOVE_SPRINT, 0, 1);
    const extraSpread = wp.spreadMove * moveFactor * (world.ads ? 0.25 : 1.0);
    const spread = (wp.spreadBase + extraSpread) * spreadScale;
    const yaw = world.yaw + (Math.random() - 0.5) * spread * 2;
    const pitch = world.pitch + (Math.random() - 0.5) * spread * 2;
    return {
        dx: -Math.sin(yaw) * Math.cos(pitch),
        dy: Math.sin(pitch),
        dz: -Math.cos(yaw) * Math.cos(pitch),
    };
}

function tryShoot() {
    if (!world.alive) return;
    if (world.reloadLeft > 0) return;
    if (world.weaponCD > 0) return;
    if (world.ammo <= 0) { AU.dry(0); startReload(); return; }

    const wp = CFG.WEAPONS[world.weapon];
    world.weaponCD = wp.cooldown;
    world.ammo -= 1;
    const empty = world.ammo <= 0;

    const kick = wp.recoil;
    world.recoilPitch += kick;
    world.recoilYaw += (Math.random() - 0.5) * kick * 0.3;
    camera.rotation.x += kick * 0.5;
    world.shake = Math.min(0.35, world.shake + kick * 0.8);

    const shots = wp.burst ? 3 : 1;
    const vpellets = wp.visualPellets || 1;
    for (let s = 0; s < shots; s++) {
        const delay = s * 70;
        setTimeout(() => {
            if (!running || !world.alive) return;
            for (let p = 0; p < vpellets; p++) {
                const dir = computeShotDirection(p === 0 ? 0.2 : 1.6);
                const start = new THREE.Vector3(
                    world.position.x + dir.dx * 0.5,
                    world.position.y + world.eyeY + dir.dy * 0.5,
                    world.position.z + dir.dz * 0.5
                );
                fireTracer(start, dir.dx, dir.dy, dir.dz, wp);
            }
        }, delay);
    }

    AU.shoot(world.weapon, 0, 1);

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'shoot', rx: world.pitch, ry: world.yaw, ping: world.ping }));
    }
    if (empty) startReload();
}

function tryGrenade() {
    if (!world.alive || world.grenadeCooldown > 0) return;
    const kind = world.grenadeSel;
    if ((world.grenadesCount[kind] || 0) <= 0) {
        AU.dry(0);
        flashChip(kind);
        return;
    }
    world.grenadeCooldown = 1.1;
    world.grenadesCount[kind] = Math.max(0, (world.grenadesCount[kind] || 0) - 1);
    updateGrenadeHud();
    AU.throwSnd(0);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'grenade', rx: world.pitch, ry: world.yaw, kind }));
    }
}

function tryMedkit(m) {
    if (!m || !m.available) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pickup_medkit', id: m.id }));
    }
}

/* ============================================================
   ДВИЖЕНИЕ
   ============================================================ */
function resolveAABBs(pos, radius) {
    for (const c of collidersNear(pos.x, pos.z, radius + 1.0)) {
        const closestX = clamp(pos.x, c.x - c.hw, c.x + c.hw);
        const closestZ = clamp(pos.z, c.z - c.hd, c.z + c.hd);
        const dx = pos.x - closestX;
        const dz = pos.z - closestZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
            const d = Math.sqrt(d2);
            if (d > 0.0001) {
                const push = radius - d;
                pos.x += (dx / d) * push;
                pos.z += (dz / d) * push;
            } else {
                const dxL = Math.abs(pos.x - (c.x - c.hw));
                const dxR = Math.abs((c.x + c.hw) - pos.x);
                const dzL = Math.abs(pos.z - (c.z - c.hd));
                const dzR = Math.abs((c.z + c.hd) - pos.z);
                const mm = Math.min(dxL, dxR, dzL, dzR);
                if (mm === dxL) pos.x = c.x - c.hw - radius;
                else if (mm === dxR) pos.x = c.x + c.hw + radius;
                else if (mm === dzL) pos.z = c.z - c.hd - radius;
                else pos.z = c.z + c.hd + radius;
            }
        }
    }
}

function updateMovement(dt) {
    if (world.grenadeCooldown > 0) world.grenadeCooldown = Math.max(0, world.grenadeCooldown - dt);

    if (world.reloadLeft > 0) {
        world.reloadLeft = Math.max(0, world.reloadLeft - dt);
        if (world.reloadLeft === 0) {
            world.ammo = effMag();
            world.reloadDoneAt = performance.now();
            AU.reloadEnd(0);
        }
    }

    if (world.pickupCooldown > 0) world.pickupCooldown = Math.max(0, world.pickupCooldown - dt);
    if (world.hp > world.hpLag) world.hpLag = world.hp;
    else if (world.hpLag > world.hp) world.hpLag = Math.max(world.hp, world.hpLag - dt * Math.max(18, (world.hpLag - world.hp) * 3.5));

    if (!world.alive) {
        world.respawnTimer -= dt;
        if (respawnCounterEl) respawnCounterEl.textContent = Math.max(0, world.respawnTimer).toFixed(1);
        return;
    }

    if (world.reconcile) {
        const rk = Math.min(1, dt * 7);
        world.position.x += (world.reconcile.x - world.position.x) * rk;
        world.position.z += (world.reconcile.z - world.position.z) * rk;
        const rdx = world.reconcile.x - world.position.x;
        const rdz = world.reconcile.z - world.position.z;
        if (rdx * rdx + rdz * rdz < 0.04) world.reconcile = null;
    }

    if (world.weaponCD > 0) world.weaponCD = Math.max(0, world.weaponCD - dt);

    world.crouch = !!(keys['control'] || keys['c']);
    world.sprint = !!(keys['shift']) && !world.crouch && !world.ads;

    const forward = (keys['w'] || keys['arrowup']) ? 1 : 0;
    const backward = (keys['s'] || keys['arrowdown']) ? 1 : 0;
    const left = (keys['a'] || keys['arrowleft']) ? 1 : 0;
    const right = (keys['d'] || keys['arrowright']) ? 1 : 0;

    const ry = world.yaw;
    const fwdX = -Math.sin(ry), fwdZ = -Math.cos(ry);
    const rightX = Math.cos(ry), rightZ = -Math.sin(ry);

    let ix = (forward - backward) * fwdX + (right - left) * rightX;
    let iz = (forward - backward) * fwdZ + (right - left) * rightZ;
    const ilen = Math.hypot(ix, iz);

    let speed = CFG.MOVE_WALK;
    if (world.crouch) speed = CFG.MOVE_CROUCH;
    else if (world.sprint && forward) speed = CFG.MOVE_SPRINT;
    else if (world.ads) speed *= 0.55;
    speed *= speedMult();

    if (ilen > 0.001) {
        ix /= ilen; iz /= ilen;
        world.moveDir.set(ix, iz);
    } else {
        world.moveDir.set(0, 0);
    }

    const targetVX = world.moveDir.x * speed;
    const targetVZ = world.moveDir.y * speed;
    const accel = CFG.ACCEL * dt;
    world.velocity.x += clamp(targetVX - world.velocity.x, -accel, accel);
    world.velocity.z += clamp(targetVZ - world.velocity.z, -accel, accel);

    if (ilen < 0.001) {
        const f = CFG.FRICTION * dt;
        const vl = Math.hypot(world.velocity.x, world.velocity.z);
        if (vl > 0.01) {
            const nf = Math.max(0, vl - f);
            world.velocity.x = (world.velocity.x / vl) * nf;
            world.velocity.z = (world.velocity.z / vl) * nf;
        } else {
            world.velocity.x = 0; world.velocity.z = 0;
        }
    }

    world.position.x += world.velocity.x * dt;
    world.position.z += world.velocity.z * dt;

    const b = CFG.ARENA_HALF - CFG.PLAYER_RADIUS - 1.5;
    world.position.x = clamp(world.position.x, -b, b);
    world.position.z = clamp(world.position.z, -b, b);

    resolveAABBs(world.position, CFG.PLAYER_RADIUS);

    const speedMag = Math.hypot(world.velocity.x, world.velocity.z);
    if (speedMag > 2.5 && pointerLocked) {
        const phase = Math.floor(world.bobPhase / Math.PI);
        if (phase !== world.lastStepPhase) {
            world.lastStepPhase = phase;
            AU.step(0, world.crouch ? 0.05 : (world.sprint ? 0.14 : 0.09));
        }
    }

    const targetFov = world.ads ? CFG.ADS_FOV[world.weapon] : CFG.CAM_FOV + (world.sprint ? 4 : 0);
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();

    world.nearbyMedkit = null;
    let bestD = 2.5;
    for (const m of world.medkits.values()) {
        if (!m.available) continue;
        const d = Math.hypot(world.position.x - m.x, world.position.z - m.z);
        if (d < bestD) { bestD = d; world.nearbyMedkit = m; }
    }
    if (medkitPromptEl) medkitPromptEl.classList.toggle('active', !!world.nearbyMedkit);

    if (world.pickupCooldown <= 0 && world.pickups.size > 0) {
        for (const pk of world.pickups.values()) {
            const dx = world.position.x - pk.x;
            const dz = world.position.z - pk.z;
            if (dx * dx + dz * dz < 2.6) {
                world.pickupCooldown = 1.0;
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'pickup_ammo', id: pk.id }));
                }
                break;
            }
        }
    }
}

/* ============================================================
   КАМЕРА И VIEWMODEL
   ============================================================ */
function updateCamera(dt) {
    if (world.recoilPitch > 0 || world.recoilYaw !== 0) {
        const rec = Math.min(1, dt * 12);
        world.recoilPitch *= (1 - rec);
        world.recoilYaw *= (1 - rec);
        if (world.recoilPitch < 0.001) world.recoilPitch = 0;
        if (Math.abs(world.recoilYaw) < 0.0001) world.recoilYaw = 0;
    }
    world.swayX *= Math.pow(0.001, dt);
    world.swayY *= Math.pow(0.001, dt);
    world.shake *= Math.pow(0.0001, dt);

    const targetEye = world.crouch ? CFG.CROUCH_EYE : CFG.EYE_HEIGHT;
    world.eyeY += (targetEye - world.eyeY) * Math.min(1, dt * 14);

    const speedMag = Math.hypot(world.velocity.x, world.velocity.z);
    const bobSpeed = world.sprint ? 12 : (world.crouch ? 6 : 9);
    const bobAmp = Math.min(1, speedMag / CFG.MOVE_WALK) * (world.sprint ? 0.055 : 0.032);
    if (speedMag > 0.5) {
        world.bobPhase += dt * bobSpeed;
        world.bobAmount = bobAmp;
    } else {
        world.bobAmount *= Math.pow(0.01, dt);
    }
    const bobY = Math.sin(world.bobPhase * 2) * world.bobAmount;
    const bobX = Math.cos(world.bobPhase) * world.bobAmount * 0.6;

    const shakeX = (Math.random() - 0.5) * world.shake * 0.12;
    const shakeY = (Math.random() - 0.5) * world.shake * 0.12;

    camera.position.set(
        world.position.x + bobX * 0.4,
        world.position.y + world.eyeY + bobY,
        world.position.z
    );

    camera.rotation.y = world.yaw + world.recoilYaw;
    camera.rotation.x = clamp(
        world.pitch + world.recoilPitch * 0.6,
        -CFG.MAX_PITCH - 0.2, CFG.MAX_PITCH + 0.2
    );

    const rightX = Math.cos(world.yaw), rightZ = -Math.sin(world.yaw);
    const strafeV = world.velocity.x * rightX + world.velocity.z * rightZ;
    const rollTarget = clamp(-strafeV * 0.007, -0.06, 0.06)
        + (world.sprint ? Math.sin(world.bobPhase) * 0.006 : 0);
    world.roll += (rollTarget - world.roll) * Math.min(1, dt * 9);
    camera.rotation.z = shakeX + world.roll;

    if (sun) {
        sun.position.set(world.position.x + 140, 260, world.position.z + 90);
        sun.target.position.set(world.position.x, 0, world.position.z);
        sun.target.updateMatrixWorld();
    }

    const adsTarget = (world.ads && !world.crouch) ? 1 : 0;
    world.adsProgress += (adsTarget - world.adsProgress) * Math.min(1, dt / CFG.ADS_TIME);

    updateViewmodel(dt, speedMag);
}

function updateViewmodel(dt, speedMag) {
    if (!weaponHolder) return;

    const hip = CFG.VM_HIP;
    const adsTarget = CFG.VM_ADS[world.weapon] || hip;
    const t = world.adsProgress;

    const baseX = hip.x + (adsTarget.x - hip.x) * t;
    const baseY = hip.y + (adsTarget.y - hip.y) * t;
    const baseZ = hip.z + (adsTarget.z - hip.z) * t;

    const bobMag = Math.min(1, speedMag / CFG.MOVE_WALK);
    const bobX = Math.cos(world.bobPhase) * CFG.VM_BOB * bobMag * (1 - t);
    const bobY = Math.abs(Math.sin(world.bobPhase * 2)) * CFG.VM_BOB * bobMag * (1 - t);

    const swayX = world.swayX * (1 - t * 0.7);
    const swayY = world.swayY * (1 - t * 0.7);

    const reloadProgress = (world.reloadTotal > 0 && world.reloadLeft > 0)
        ? 1 - world.reloadLeft / world.reloadTotal : 0;
    const dip = world.reloadLeft > 0 ? Math.sin(clamp(reloadProgress, 0, 1) * Math.PI) : 0;

    const recoilZ = world.recoilPitch * 0.35;
    const recoilPitchVM = world.recoilPitch * 1.6;

    weaponHolder.position.set(
        baseX + bobX + swayX,
        baseY + bobY + swayY - dip * 0.22,
        baseZ + recoilZ
    );
    weaponHolder.rotation.x = recoilPitchVM * 0.9 + dip * 0.7;
    weaponHolder.rotation.y = world.recoilYaw * 3 + swayX * 4;
    weaponHolder.rotation.z = swayX * 2.5 + -world.velocity.x * 0.005 * (1 - t) + dip * 0.35;

    if (world.weapon === 'sniper' && t > 0.6) weaponHolder.visible = false;
    else weaponHolder.visible = true;

    if (scopeEl) {
        if (world.weapon === 'sniper' && t > 0.5) scopeEl.classList.add('active');
        else scopeEl.classList.remove('active');
    }
    if (crosshairEl) crosshairEl.classList.toggle('ads', world.adsProgress > 0.4);
}

/* ============================================================
   СЕТЬ
   ============================================================ */
let ws = null;
let connectTimeout = null;

function connect(name) {
    try { ws = new WebSocket(WS_URL); }
    catch (err) {
        console.error('[WS] Не удалось создать:', err);
        statusEl.textContent = 'Не удалось открыть соединение';
        connectBtn.disabled = false;
        return;
    }

    connectTimeout = setTimeout(() => {
        if (!running && ws && ws.readyState !== WebSocket.OPEN) {
            statusEl.textContent = 'Сервер не отвечает (5с). Запущен ли server.py?';
            connectBtn.disabled = false;
            try { ws.close(); } catch (e) { void e; }
        }
    }, 5000);

    ws.onopen = () => {
        console.log('[WS] open');
        statusEl.textContent = 'Синхронизация...';
        ws.send(JSON.stringify({ type: 'join', name, weapon: selectedWeapon }));
    };

    ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch (err) {
            console.warn('[WS] parse error', err); return;
        }
        switch (msg.type) {
            case 'init':  handleInit(msg); break;
            case 'state': handleState(msg); break;
            case 'shoot': handleShootEvent(msg); break;
            case 'hit':   handleHitEvent(msg); break;
            case 'kill':  handleKillEvent(msg); break;
            case 'grenade_spawn': handleGrenadeSpawn(msg); break;
            case 'medkit_taken':  handleMedkitTaken(msg); break;
            case 'smoke_spawn':   handleSmokeSpawn(msg); break;
            case 'smoke_end':     handleSmokeEnd(msg); break;
            case 'flash_pop':     handleFlashPop(msg); break;
            case 'streak':        handleStreak(msg); break;
            case 'reload':        handleRemoteReload(msg); break;
            case 'pickup_taken':  handlePickupTaken(msg); break;
            case 'demon_attack':  handleDemonAttack(msg); break;
            case 'demon_scream':  handleDemonScream(msg); break;
            case 'demon_explode': handleDemonExplode(msg); break;
            case 'acid_spawn':    handleAcidSpawn(msg); break;
            case 'acid_pop':      handleAcidPop(msg); break;
            case 'wave':          handleWaveEvent(msg); break;
            case 'upgrade_ok':    handleUpgradeOk(msg); break;
            case 'upgrade_deny':  handleUpgradeDeny(msg); break;
            case 'no_ammo':
                AU.dry(0);
                if (world.reserve > 0) startReload();
                break;
            case 'no_grenade':    flashChip(msg.kind || world.grenadeSel); break;
            case 'pong':
                world.ping = Math.round(performance.now() - (msg.t || 0));
                break;
        }
    };

    ws.onerror = (e) => {
        console.error('[WS ERROR]', e);
        statusEl.textContent = 'Ошибка соединения. Сервер запущен? Порт 8001 доступен?';
        connectBtn.disabled = false;
    };

    ws.onclose = (ev) => {
        console.warn('[WS CLOSE]', ev.code, ev.reason);
        if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
        running = false; pointerLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();
        hudEl.classList.add('hidden');
        menuEl.classList.remove('hidden');
        connectBtn.disabled = false;
        statusEl.textContent = ev.code === 1000
            ? 'Соединение закрыто'
            : `Соединение потеряно (код ${ev.code})`;
        clearWorld();
    };
}

function handleShootEvent(msg) {
    if (msg.shooter === world.myId) return;
    const wp = CFG.WEAPONS[msg.weapon] || CFG.WEAPONS.rifle;
    const pellets = Math.min(msg.pellets || 1, 3);
    const dir0 = {
        dx: -Math.sin(msg.ry || 0) * Math.cos(msg.rx || 0),
        dy: Math.sin(msg.rx || 0),
        dz: -Math.cos(msg.ry || 0) * Math.cos(msg.rx || 0),
    };
    const sx = msg.x, sy = (msg.y || 0) + 1.70, sz = msg.z;
    const snd = spatialSound(new THREE.Vector3(sx, sy, sz));
    AU.shoot(msg.weapon || 'rifle', snd.pan, Math.max(0.15, snd.vol));
    for (let p = 0; p < pellets; p++) {
        const spread = p === 0 ? 0.06 : 0.1;
        const dx = dir0.dx + (Math.random() - 0.5) * spread;
        const dy = dir0.dy + (Math.random() - 0.5) * spread;
        const dz = dir0.dz + (Math.random() - 0.5) * spread;
        let len = 60;
        for (const c of collidersInBox(sx, sz, sx + dx * 60, sz + dz * 60)) {
            const tt = rayAABB(sx, sy, sz, dx, dy, dz, c);
            if (tt !== null && tt > 0 && tt < len) len = tt;
        }
        spawnTracerLimited(sx, sy, sz, dx, dy, dz, wp.tracer, len);
    }
}

function handleHitEvent(msg) {
    if (msg.shooter === world.myId) {
        showHitMarker(msg.headshot);
        const r = world.remote.get(msg.target);
        const sp = r ? r.mesh.position : null;
        if (sp) {
            const snd = spatialSound(sp);
            AU.hit(msg.headshot, snd.pan);
        } else {
            AU.hit(msg.headshot, 0);
        }
    }
    if (msg.target === world.myId) {
        if (damageFlashEl) {
            damageFlashEl.style.opacity = '1';
            setTimeout(() => { damageFlashEl.style.opacity = '0'; }, 200);
        }
        const hitKick = msg.explosion ? 0.85 : (msg.headshot ? 0.65 : 0.3);
        world.shake = Math.min(1.1, world.shake + hitKick);
        world.hp = msg.hp;
        showDamageIndicator(msg.shooter);
    }
}

function showDamageIndicator(shooterId) {
    if (!dmgIndicatorEl) return;
    let angle = Math.random() * Math.PI * 2;
    if (shooterId === world.myId) {
        angle = 0;
    } else {
        const r = world.remote.get(shooterId);
        if (r) {
            const dx = r.mesh.position.x - world.position.x;
            const dz = r.mesh.position.z - world.position.z;
            if (dx * dx + dz * dz > 0.001) {
                const bearing = Math.atan2(dx, dz);
                const forward = world.yaw + Math.PI;
                angle = bearing - forward;
                while (angle > Math.PI) angle -= Math.PI * 2;
                while (angle < -Math.PI) angle += Math.PI * 2;
            }
        }
    }
    world.dmgDir = { angle, t: 0, life: 0.6 };
    dmgIndicatorEl.classList.remove('hidden');
    dmgIndicatorEl.style.transform = `translate(-50%, -50%) rotate(${(angle * 180 / Math.PI).toFixed(1)}deg)`;
}

function updateDamageIndicator(dt) {
    if (!world.dmgDir) return;
    world.dmgDir.t += dt;
    if (world.dmgDir.t >= world.dmgDir.life) {
        world.dmgDir = null;
        if (dmgIndicatorEl) {
            dmgIndicatorEl.classList.add('hidden');
        }
    }
}

function handleKillEvent(msg) {
    const isMine = msg.shooter === world.myId;
    const iDied  = msg.target === world.myId;
    const r = world.remote.get(msg.target);
    if (r && r.alive) {
        r.alive = false; r.is_dead = true;
        if (r.mesh.visible) {
            if (r.kind === 'demon') explodeDemon(r.mesh, r.dt);
            else explodeStickman(r.mesh, r.color);
            r.mesh.visible = false;
        }
    }
    if (isMine) {
        showHitMarker(true);
        AU.kill(0);
        world.kills = msg.shooter_kills || (world.kills + 1);
        world.streak = msg.shooter_streak || (world.streak + 1);
        if (msg.points_gain) {
            world.points = (world.points || 0) + msg.points_gain;
            showPointsPopup(msg.points_gain);
        }
    }
    if (iDied && world.alive) {
        world.alive = false;
        world.deaths += 1;
        world.streak = 0;
        world.respawnTimer = CFG.RESPAWN_TIME;
        if (weaponHolder) weaponHolder.visible = false;
        if (respawnOverlayEl) respawnOverlayEl.classList.remove('hidden');
        if (crosshairEl) crosshairEl.style.opacity = '0';
        if (document.pointerLockElement) document.exitPointerLock();
        world.shake = 0.7;
    }
    if (killFeedEl) {
        const el = document.createElement('div');
        el.className = 'kf-item';
        if (msg.headshot) el.classList.add('kf-hs');
        if (msg.explosion) el.classList.add('kf-exp');
        if (msg.demon) el.classList.add('kf-demon');
        if ((msg.shooter_streak || 0) >= 3) el.classList.add('kf-streak');
        const shooterName = msg.shooter_name || '?';
        const targetName = msg.target_name || '?';
        const cls1 = msg.shooter === world.myId ? 'me' : '';
        const cls2 = msg.target === world.myId ? 'tgt' : '';
        const icon = msg.explosion ? '💥' : '⟶';
        const weapon = msg.weapon ? `<span class="wpn">${escapeHtml(String(msg.weapon).toUpperCase())}</span>` : '';
        el.innerHTML = `<span class="kf-glitch" data-txt="${escapeHtml(shooterName)}">` +
                       `<b class="${cls1}">${escapeHtml(shooterName)}</b></span> ${weapon} ${icon} ` +
                       `<b class="${cls2}">${escapeHtml(targetName)}</b>` +
                       (msg.headshot ? `<span class="hs">ХЕДШОТ</span>` : '');
        killFeedEl.appendChild(el);
        setTimeout(() => el.remove(), 5000);
        while (killFeedEl.children.length > 6) killFeedEl.firstChild.remove();
    }
}

function handleGrenadeSpawn(msg) {
    if (world.grenades.has(msg.id)) return;
    const kind = msg.kind || 'frag';
    const mesh = createGrenadeMesh(kind);
    mesh.position.set(msg.x, msg.y, msg.z);
    scene.add(mesh);
    world.grenades.set(msg.id, {
        mesh, kind, target: new THREE.Vector3(msg.x, msg.y, msg.z), landed: false,
    });
    if (msg.owner === world.myId) AU.throwSnd(0);
}

function handleSmokeSpawn(msg) {
    if (world.smokes.has(msg.id)) return;
    const visual = createSmokeVisual(msg.x, msg.y + 0.4, msg.z);
    world.smokes.set(msg.id, { ...visual, life: msg.life || 12, age: 0 });
    const snd = spatialSound(new THREE.Vector3(msg.x, 1, msg.z));
    AU.smokeHiss(Math.max(0.2, snd.vol));
}

function handleSmokeEnd(msg) {
    removeSmoke(msg.id);
}

function removeSmoke(id) {
    const s = world.smokes.get(id);
    if (!s) return;
    scene.remove(s.group);
    disposeObj(s.group);
    world.smokes.delete(id);
}

function handleFlashPop(msg) {
    const pos = new THREE.Vector3(msg.x, msg.y, msg.z);
    const dist = camera.position.distanceTo(pos);
    const los = segmentClear3D(camera.position.clone(), pos);
    if (dist >= 46 || (!los && dist > 3)) {
        // за стеной или далеко — только глухой хлопок
        const snd = spatialSound(pos);
        AU.flashbang(0.22 * Math.max(0.2, snd.vol));
        return;
    }
    // попал в зону — ровно 4 секунды белого экрана
    AU.flashbang(1);
    world.flashScreen = { t: 0, dur: 4.0, int: 1 };
    world.shake = Math.max(world.shake, 0.9);
}

function handleStreak(msg) {
    const isMine = msg.player === world.myId;
    if (msg.multi) {
        showBanner(msg.multi, isMine ? 'ЭТО ВЫ!' : msg.name, isMine ? '#ff2d88' : '#8fb4ff');
    }
    if (msg.reward) {
        showBanner(msg.streak + ' СЕРИЯ', `НАГРАДА: ${msg.reward}`, '#ffcc00');
    } else if (!msg.multi && msg.streak >= 3) {
        showBanner(msg.streak + ' СЕРИЯ', isMine ? 'ЭТО ВЫ!' : msg.name, '#ffb347');
    }
    AU.streakSnd();
}

function handleRemoteReload(msg) {
    if (msg.player === world.myId) return;
    const r = world.remote.get(msg.player);
    if (r) {
        const snd = spatialSound(r.mesh.position);
        if (snd.vol > 0.05) AU.reloadStart(snd.pan);
    }
}

function handleMedkitTaken(msg) {
    const m = world.medkits.get(msg.id);
    if (m) {
        m.available = false;
        if (m.mesh) m.mesh.visible = false;
    }
    if (msg.player === world.myId) AU.pickup(0);
}

/* ============================================================
   СОБЫТИЯ ДЕМОНОВ И ВОЛН
   ============================================================ */
function handleDemonAttack(msg) {
    const r = world.remote.get(msg.id);
    const nowS = performance.now() * 0.001;
    if (r) {
        r.anim = msg.kind === 'slam' ? 'slam' : 'attack';
        r.animUntil = nowS + (msg.kind === 'slam' ? 0.9 : 0.55);
    }
    if (msg.kind === 'claw') {
        const pos = new THREE.Vector3(msg.tx, 1.1, msg.tz);
        spawnClawFX(pos);
        const snd = spatialSound(pos);
        AU.demonClaw(snd.pan, Math.max(0.2, snd.vol));
    } else if (msg.kind === 'slam') {
        const pos = new THREE.Vector3(msg.x, 0.45, msg.z);
        const ring = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 12),
            new THREE.MeshBasicMaterial({
                color: 0xbb3311, transparent: true, opacity: 0.5,
                blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
            })
        );
        ring.position.copy(pos);
        scene.add(ring);
        explosionRings.push({ mesh: ring, life: 0.55, age: 0, maxScale: msg.r || 5 });
        spawnGoreBurst(pos, 0x993311, 22, 9, 0.4);
        const snd = spatialSound(pos);
        AU.demonSlam(snd.pan, Math.max(0.25, snd.vol));
        const d = camera.position.distanceTo(pos);
        world.shake = Math.min(1.2, world.shake + clamp(1.1 - d / 40, 0, 1) * 0.8);
    }
    if (msg.target === world.myId) {
        world.shake = Math.min(0.9, world.shake + 0.3);
    }
}

function handleAcidSpawn(msg) {
    if (world.acidGlobs.has(msg.id)) return;
    const g = new THREE.Group();
    const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x88ff44, toneMapped: false })
    );
    g.add(ball);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0x88ff44, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    glow.scale.set(1.5, 1.5, 1);
    g.add(glow);
    g.position.set(msg.x, msg.y, msg.z);
    scene.add(g);
    world.acidGlobs.set(msg.id, {
        mesh: g, vx: msg.vx || 0, vz: msg.vz || 0, age: 0, life: 3.2,
    });
    const r = world.remote.get(msg.owner);
    if (r) {
        r.anim = 'spit';
        r.animUntil = performance.now() * 0.001 + 0.55;
    }
    const snd = spatialSound(new THREE.Vector3(msg.x, 1.6, msg.z));
    AU.demonSpit(snd.pan, Math.max(0.2, snd.vol));
}

function removeAcid(id) {
    const g = world.acidGlobs.get(id);
    if (!g) return;
    scene.remove(g.mesh);
    disposeObj(g.mesh);
    world.acidGlobs.delete(id);
}

function handleAcidPop(msg) {
    removeAcid(msg.id);
    const pos = new THREE.Vector3(msg.x, msg.y, msg.z);
    spawnAcidSplash(pos);
    const snd = spatialSound(pos);
    AU.acidSizzle(snd.pan, Math.max(0.2, snd.vol));
}

function updateAcid(dt) {
    for (const [id, g] of world.acidGlobs) {
        g.age += dt;
        g.mesh.position.x += g.vx * dt;
        g.mesh.position.z += g.vz * dt;
        g.mesh.position.y = 1.6 + Math.sin(g.age * 22) * 0.06;
        if (g.age >= g.life) removeAcid(id);
    }
}

function handleDemonScream(msg) {
    const r = world.remote.get(msg.id);
    const nowS = performance.now() * 0.001;
    if (r) {
        r.anim = 'scream';
        r.animUntil = nowS + 1.1;
    }
    const pos = new THREE.Vector3(msg.x, 1.7, msg.z);
    const snd = spatialSound(pos);
    AU.demonScream(msg.kind || 'runner', snd.pan, Math.max(0.15, snd.vol));
    const d = camera.position.distanceTo(pos);
    world.shake = Math.min(1.0, world.shake + clamp(1 - d / 42, 0, 1) * 0.4);
}

function handleDemonExplode(msg) {
    const pos = new THREE.Vector3(msg.x, 0.7, msg.z);
    spawnGoreBurst(pos, 0x991111, 40, 12, 0.5);
    const ring = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 10),
        new THREE.MeshBasicMaterial({
            color: 0xaa1111, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })
    );
    ring.position.copy(pos);
    scene.add(ring);
    explosionRings.push({ mesh: ring, life: 0.55, age: 0, maxScale: (msg.r || 6) * 0.8 });
    const snd = spatialSound(pos);
    AU.demonExplode(snd.pan, Math.max(0.2, snd.vol));
    const d = camera.position.distanceTo(pos);
    world.shake = Math.min(1.2, world.shake + clamp(1.1 - d / 45, 0, 1) * 0.85);
}

function handleWaveEvent(msg) {
    world.wave = msg.wave || world.wave;
    if (msg.state === 'break') {
        world.wavePhase = 'break';
        world.breakUntil = performance.now() / 1000 + (msg.next_in || 30);
        showBanner(`ВОЛНА ${msg.wave}`, `ПЕРЕРЫВ ${msg.next_in} СЕК · [B] МАГАЗИН`, '#00e5ff');
        AU.waveBreak();
    } else if (msg.state === 'start') {
        world.wavePhase = 'active';
        showBanner(`ВОЛНА ${msg.wave}`, `${msg.count} ДЕМОНОВ ИДУТ`, '#ff2d88');
        AU.waveHorn();
        world.shake = Math.min(1.0, world.shake + 0.35);
    } else if (msg.state === 'clear') {
        world.wavePhase = 'break';
        world.breakUntil = performance.now() / 1000 + (msg.next_in || 30);
        showBanner('ВОЛНА ЗАЧИЩЕНА', `ПЕРЕРЫВ ${msg.next_in} СЕК · [B] МАГАЗИН`, '#34d97b');
        AU.waveClear();
    } else if (msg.state === 'defeat') {
        world.wavePhase = 'defeat';
        showDefeatOverlay();
        AU.defeat();
    } else if (msg.state === 'reset') {
        world.wavePhase = 'break';
        world.breakUntil = performance.now() / 1000 + (msg.next_in || 12);
        hideDefeatOverlay();
    }
    updateWaveHud();
}

function handleUpgradeOk(msg) {
    AU.upgradeOk();
    if (typeof msg.points === 'number') world.points = msg.points;
    if (typeof msg.max_hp === 'number') world.maxHp = msg.max_hp;
    world.upgrades[msg.id] = msg.lvl;
    updateShopUI();
}

function handleUpgradeDeny(msg) {
    AU.deny();
    const row = document.querySelector(`.shop-row[data-upg="${msg.id}"]`);
    if (row) {
        row.classList.add('deny');
        setTimeout(() => row.classList.remove('deny'), 400);
    }
}

/* ============================================================
   МАГАЗИН ПРОКАЧКИ / ВОЛНЫ / ПОРАЖЕНИЕ
   ============================================================ */
const UPGRADE_DEFS = [
    { id: 'dmg',    costs: [100, 150, 225, 340, 500] },
    { id: 'mag',    costs: [80, 120, 180, 270, 400] },
    { id: 'reload', costs: [80, 120, 180, 270, 400] },
    { id: 'speed',  costs: [60, 90, 135, 200, 300] },
    { id: 'hp',     costs: [70, 105, 160, 240, 360] },
];
const UPGRADE_MAX = 5;

function buildShopPips() {
    for (const def of UPGRADE_DEFS) {
        const row = document.querySelector(`.shop-row[data-upg="${def.id}"]`);
        if (!row) continue;
        const pips = row.querySelector('.sr-pips');
        if (!pips) continue;
        pips.innerHTML = '';
        for (let i = 0; i < UPGRADE_MAX; i++) pips.appendChild(document.createElement('i'));
    }
}

function updateShopUI() {
    if (shopPointsEl) shopPointsEl.textContent = String(world.points || 0);
    for (const def of UPGRADE_DEFS) {
        const row = document.querySelector(`.shop-row[data-upg="${def.id}"]`);
        if (!row) continue;
        const lvl = world.upgrades[def.id] || 0;
        row.querySelectorAll('.sr-pips i').forEach((p, i) => p.classList.toggle('on', i < lvl));
        const costEl = row.querySelector('.sr-cost');
        if (!costEl) continue;
        if (lvl >= UPGRADE_MAX) {
            row.classList.add('max');
            costEl.textContent = 'МАКС';
        } else {
            row.classList.remove('max');
            const cost = def.costs[lvl];
            costEl.textContent = String(cost);
            row.classList.toggle('poor', (world.points || 0) < cost);
        }
    }
}

function toggleShop(force) {
    if (world.mode !== 'defense') return;
    const open = force !== undefined ? force : !world.shopOpen;
    if (open === world.shopOpen) return;
    world.shopOpen = open;
    if (shopEl) shopEl.classList.toggle('hidden', !open);
    if (open) {
        updateShopUI();
        if (document.pointerLockElement) document.exitPointerLock();
        AU.ui();
    } else if (running && !document.pointerLockElement) {
        try { renderer.domElement.requestPointerLock(); } catch (e) { void e; }
    }
}

function buyUpgrade(id) {
    if (!world.shopOpen || world.mode !== 'defense') return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'upgrade', id }));
    }
}

function showPointsPopup(amount) {
    if (!pointsPopupEl) return;
    const el = document.createElement('div');
    el.className = 'points-float';
    el.textContent = '+' + amount;
    pointsPopupEl.appendChild(el);
    setTimeout(() => el.remove(), 1050);
}

function showDefeatOverlay() {
    if (defeatOverlayEl) defeatOverlayEl.classList.remove('hidden');
    if (world.shopOpen) toggleShop(false);
}

function hideDefeatOverlay() {
    if (defeatOverlayEl) defeatOverlayEl.classList.add('hidden');
}

function updateWaveHud() {
    const def = world.mode === 'defense';
    if (waveChipEl) waveChipEl.classList.toggle('hidden', !def);
    if (leaderChipEl) leaderChipEl.classList.toggle('hidden', def);
    if (pointsChipEl) pointsChipEl.classList.toggle('hidden', !def);
    if (pointsValEl) pointsValEl.textContent = String(world.points || 0);
    if (sbGlyphsEl) {
        sbGlyphsEl.textContent = def
            ? '● БЕГУН · ■ ГРОМИЛА · ◆ ВИЗГУН · ▲ ПЛЕВУН · ★ ТИТАН'
            : '◆ ПРИЗРАК · ■ ДЖАГГЕРНАУТ · ● ШТУРМОВИК';
    }
    if (!def) return;
    if (waveNumEl) waveNumEl.textContent = String(world.wave || 1);
    if (waveStateEl) {
        if (world.wavePhase === 'active') {
            let alive = 0;
            const players = world.lastState || {};
            for (const p of Object.values(players)) {
                if (p.is_bot && !p.is_dead) alive++;
            }
            waveStateEl.textContent = `ДЕМОНОВ: ${alive}`;
        } else if (world.wavePhase === 'break') {
            const left = Math.max(0, Math.ceil(world.breakUntil - performance.now() / 1000));
            waveStateEl.textContent = `ПЕРЕРЫВ ${left}с · [B] МАГАЗИН`;
        } else if (world.wavePhase === 'defeat') {
            waveStateEl.textContent = 'ПОРАЖЕНИЕ';
        } else {
            waveStateEl.textContent = 'ПОДГОТОВКА';
        }
    }
}

function handlePickupTaken(msg) {
    const p = world.pickups.get(msg.id);
    if (p) {
        scene.remove(p.mesh);
        disposeObj(p.mesh);
        world.pickups.delete(msg.id);
    }
    if (msg.player === world.myId) {
        AU.pickup(0);
        if (typeof msg.reserve === 'number') world.reserve = msg.reserve;
        world.pickupCooldown = 0.8;
    }
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function showHitMarker(headshot) {
    if (!hitMarkerEl) return;
    hitMarkerEl.classList.toggle('kill', !!headshot);
    hitMarkerEl.classList.add('active');
    if (crosshairEl) {
        crosshairEl.classList.add('hit');
        setTimeout(() => crosshairEl.classList.remove('hit'), 100);
    }
    setTimeout(() => hitMarkerEl.classList.remove('active'), headshot ? 250 : 130);
}

/* ============================================================
   INIT / STATE
   ============================================================ */
function handleInit(msg) {
    console.log('[INIT] получен:', msg);
    try {
        if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }

        world.myId = msg.id;
        world.myColor = msg.color;
        const wId = (msg.weapon && CFG.WEAPONS[msg.weapon]) ? msg.weapon : selectedWeapon;
        world.weapon = wId;
        world.hp = 100; world.maxHp = 100; world.kills = 0; world.deaths = 0; world.streak = 0;
        world.ammo = CFG.WEAPONS[wId].mag;
        world.reloadLeft = 0; world.reloadTotal = 0;
        world.position.set(msg.x, 0, msg.z);
        world.velocity.set(0, 0, 0);
        world.yaw = msg.ry || 0;
        world.pitch = 0;
        world.alive = true;
        world.respawnTimer = 0;
        world.weaponCD = 0;
        world.grenadeCooldown = 0;
        world.ads = false;
        world.adsProgress = 0;
        world.bobPhase = 0;
        world.bobAmount = 0;
        world.recoilPitch = 0;
        world.recoilYaw = 0;
        world.shake = 0;
        world.grenadesCount = { frag: 2, smoke: 1, flash: 1 };
        world.grenadeSel = 'frag';
        world.flashScreen = null;
        world.reserve = CFG.WEAPONS[wId].mag * 3;
        world.reloadLeft = 0;
        world.reloadTotal = 0;
        world.hpLag = 100;
        world.roll = 0;
        world.reconcile = null;
        world.lastSent = null;
        world.sentHist = [];
        world.dmgDir = null;
        world.pickupCooldown = 0;
        world.wave = msg.wave || 0;
        world.wavePhase = msg.wave_phase || 'idle';
        world.breakUntil = performance.now() / 1000 + (msg.break_seconds || 30);
        buildAmmoPips();
        buildShopPips();
        updateShopUI();
        updateWaveHud();
        hideDefeatOverlay();
        if (world.mode === 'defense') {
            AU.ambientStart();
            Music.volume = 0.16;
        } else {
            AU.ambientStop();
            Music.volume = 0.26;
        }
        const mmLabel = document.querySelector('.mm-label');
        if (mmLabel) {
            mmLabel.textContent = world.mode === 'defense' ? 'КРЕПОСТЬ · 300×300' : 'НЕОН-АРЕНА · 400×400';
        }

        buildWeaponModel(wId);
        if (weaponNameEl) weaponNameEl.textContent = CFG.WEAPONS[wId].name;
        if (weaponClassEl) weaponClassEl.textContent = WEAPON_CLASS_LABEL[wId] || '';
        if (weaponModeEl) weaponModeEl.textContent = weaponModeLabel(wId);

        running = true;
        menuEl.classList.add('hidden');
        hudEl.classList.remove('hidden');
        statusEl.textContent = '';
        if (respawnOverlayEl) respawnOverlayEl.classList.add('hidden');
        if (crosshairEl) crosshairEl.style.opacity = '1';
        if (flashOverlayEl) flashOverlayEl.style.opacity = '0';

        for (const id of Array.from(world.remote.keys())) removeRemotePlayer(id);
        for (const gid of Array.from(world.grenades.keys())) {
            const g = world.grenades.get(gid);
            scene.remove(g.mesh);
            disposeObj(g.mesh);
        }
        world.grenades.clear();
        for (const m of world.medkits.values()) {
            scene.remove(m.mesh);
            disposeObj(m.mesh);
        }
        world.medkits.clear();
        for (const p of world.pickups.values()) {
            scene.remove(p.mesh);
            disposeObj(p.mesh);
        }
        world.pickups.clear();
        for (const sid of Array.from(world.smokes.keys())) removeSmoke(sid);
        for (const id of Array.from(world.acidGlobs.keys())) removeAcid(id);

        const playersObj = msg.players || {};
        for (const [id, p] of Object.entries(playersObj)) {
            if (id === world.myId) continue;
            try { addRemotePlayer(id, p); }
            catch (e) { console.warn('[INIT] addRemotePlayer error', id, e); }
        }

        for (const g of (msg.grenades || [])) {
            try {
                const mesh = createGrenadeMesh(g.kind || 'frag');
                mesh.position.set(g.x, g.y, g.z);
                scene.add(mesh);
                world.grenades.set(g.id, {
                    mesh, kind: g.kind || 'frag',
                    target: new THREE.Vector3(g.x, g.y, g.z), landed: false,
                });
            } catch (e) { console.warn('[INIT] grenade error', e); }
        }

        for (const m of (msg.medkits || [])) {
            try {
                const mesh = createMedkitMesh();
                mesh.position.set(m.x, 0.2, m.z);
                mesh.visible = !!m.available;
                scene.add(mesh);
                world.medkits.set(m.id, {
                    id: m.id, mesh, x: m.x, z: m.z, available: !!m.available,
                });
            } catch (e) { console.warn('[INIT] medkit error', e); }
        }

        for (const pk of (msg.pickups || [])) {
            try {
                const mesh = createPickupMesh();
                mesh.position.set(pk.x, 0.2, pk.z);
                scene.add(mesh);
                world.pickups.set(pk.id, { id: pk.id, mesh, x: pk.x, z: pk.z });
            } catch (e) { console.warn('[INIT] pickup error', e); }
        }

        for (const s of (msg.smokes || [])) {
            try {
                const visual = createSmokeVisual(s.x, s.y + 0.4, s.z);
                world.smokes.set(s.id, {
                    ...visual, life: s.left || 12, age: (12 - (s.left || 12)),
                });
            } catch (e) { console.warn('[INIT] smoke error', e); }
        }

        updateCamera(0);
        updateGrenadeHud();

        try {
            const p = renderer.domElement.requestPointerLock();
            if (p && p.catch) p.catch((err) => console.warn('[PTRLOCK]', err));
        } catch (err) { console.warn('[PTRLOCK]', err); }

        try { updatePlayersList(playersObj); }
        catch (e) { console.warn('[INIT] players list', e); }

        console.log('[INIT] OK, running =', running);
    } catch (err) {
        console.error('[INIT] КРИТИЧЕСКАЯ ОШИБКА:', err);
        statusEl.textContent = 'Ошибка инициализации: ' + err.message;
        connectBtn.disabled = false;
        menuEl.classList.remove('hidden');
        hudEl.classList.add('hidden');
        running = false;
    }
}

function handleState(msg) {
    const players = msg.players || {};
    world.lastState = players;
    const me = players[world.myId];

    if (me) {
        const newHp = me.hp !== undefined ? me.hp : 100;
        world.kills = me.kills || 0;
        world.deaths = me.deaths || 0;
        world.streak = me.streak || 0;

        if (typeof me.ammo === 'number') {
            const settle = performance.now() - (world.reloadDoneAt || 0);
            if (world.reloadLeft <= 0 && settle > 400) world.ammo = me.ammo;
            else if (me.ammo > world.ammo) world.ammo = me.ammo;
        }
        const srvReload = me.reload_left || 0;
        if (srvReload > 0) {
            const wp2 = CFG.WEAPONS[world.weapon];
            if (world.reloadLeft <= 0 || Math.abs(world.reloadLeft - srvReload) > 0.4) {
                world.reloadLeft = srvReload;
                world.reloadTotal = wp2.reload;
            } else {
                world.reloadLeft = Math.min(world.reloadLeft, srvReload + 0.15);
            }
        } else if (world.reloadLeft > 0 && world.reloadLeft < 0.45) {
            world.reloadLeft = 0;
        }
        if (me.grenades) {
            world.grenadesCount = {
                frag: me.grenades.frag | 0,
                smoke: me.grenades.smoke | 0,
                flash: me.grenades.flash | 0,
            };
        }
        if (typeof me.reserve === 'number') world.reserve = me.reserve;
        if (typeof me.points === 'number') world.points = me.points;
        if (typeof me.max_hp === 'number' && me.max_hp !== world.maxHp) {
            world.maxHp = me.max_hp;
        }
        if (me.upgrades) world.upgrades = me.upgrades;

        if (world.alive && !me.is_dead && world.sentHist.length > 0) {
            const targetT = performance.now() - Math.min(400, Math.max(0, world.ping));
            let ref = world.sentHist[0];
            for (let i = world.sentHist.length - 1; i >= 0; i--) {
                ref = world.sentHist[i];
                if (ref.t <= targetT) break;
            }
            const ex = me.x - ref.x;
            const ez = me.z - ref.z;
            if (ex * ex + ez * ez > 2.25) {
                world.reconcile = { x: me.x, z: me.z };
            }
        }

        if (me.is_dead && world.alive) {
            world.alive = false;
            world.respawnTimer = CFG.RESPAWN_TIME;
            if (weaponHolder) weaponHolder.visible = false;
            if (respawnOverlayEl) respawnOverlayEl.classList.remove('hidden');
            if (crosshairEl) crosshairEl.style.opacity = '0';
            if (document.pointerLockElement) document.exitPointerLock();
        } else if (!me.is_dead && !world.alive) {
            world.alive = true;
            world.hp = newHp;
            world.hpLag = newHp;
            world.position.set(me.x, 0, me.z);
            world.velocity.set(0, 0, 0);
            world.yaw = me.ry || 0;
            world.pitch = 0;
            world.reconcile = null;
            world.lastSent = null;
            world.sentHist = [];
            if (typeof me.reserve === 'number') world.reserve = me.reserve;
            if (typeof me.ammo === 'number') world.ammo = me.ammo;
            if (weaponHolder) weaponHolder.visible = true;
            if (respawnOverlayEl) respawnOverlayEl.classList.add('hidden');
            if (crosshairEl) crosshairEl.style.opacity = '1';
            AU.respawnSnd();
            updateCamera(0);
        } else if (world.alive) {
            world.hp = newHp;
        }
    }

    for (const [id, p] of Object.entries(players)) {
        if (id === world.myId) continue;
        if (!world.remote.has(id)) addRemotePlayer(id, p);
        const r = world.remote.get(id);
        const newIsDead = !!p.is_dead;
        if (newIsDead && r.alive) {
            r.alive = false; r.is_dead = true;
            if (r.mesh.visible) {
                if (r.kind === 'demon') explodeDemon(r.mesh, r.dt);
                else explodeStickman(r.mesh, r.color);
                r.mesh.visible = false;
            }
        } else if (!newIsDead && !r.alive) {
            r.alive = true; r.is_dead = false;
            r.mesh.visible = true;
            r.mesh.position.set(p.x, 0, p.z);
        }
        r.hp = p.hp !== undefined ? p.hp : 100;
        r.kills = p.kills || 0;
        r.deaths = p.deaths || 0;
        r.streak = p.streak || 0;
        r.targetPos.set(p.x, 0, p.z);
        r.targetRy = p.ry || 0;
        r.targetRx = p.rx || 0;
        r.weapon = p.weapon || 'rifle';
    }

    for (const id of Array.from(world.remote.keys())) {
        if (!players[id]) removeRemotePlayer(id);
    }

    if (msg.grenades) {
        const ids = new Set();
        for (const g of msg.grenades) {
            ids.add(g.id);
            let entry = world.grenades.get(g.id);
            if (!entry) {
                const mesh = createGrenadeMesh(g.kind || 'frag');
                mesh.position.set(g.x, g.y, g.z);
                scene.add(mesh);
                entry = {
                    mesh, kind: g.kind || 'frag',
                    target: new THREE.Vector3(g.x, g.y, g.z), landed: false,
                };
                world.grenades.set(g.id, entry);
            }
            entry.target.set(g.x, g.y, g.z);
        }
        for (const gid of Array.from(world.grenades.keys())) {
            if (!ids.has(gid)) {
                const e = world.grenades.get(gid);
                const pos = e.mesh.position.clone();
                const kind = e.kind || 'frag';
                scene.remove(e.mesh);
                disposeObj(e.mesh);
                world.grenades.delete(gid);
                if (kind === 'frag') {
                    spawnExplosion(pos.x, Math.max(0.4, pos.y), pos.z);
                    const snd = spatialSound(pos);
                    AU.explosion(snd.pan, Math.max(0.2, snd.vol));
                    const dd = camera.position.distanceTo(pos);
                    world.shake = Math.min(1.2, world.shake + clamp(1.1 - dd / 45, 0, 1) * 0.9);
                }
            }
        }
    }

    if (msg.medkits) {
        for (const m of msg.medkits) {
            let entry = world.medkits.get(m.id);
            if (!entry) {
                const mesh = createMedkitMesh();
                mesh.position.set(m.x, 0.2, m.z);
                scene.add(mesh);
                entry = { id: m.id, mesh, x: m.x, z: m.z, available: !!m.available };
                world.medkits.set(m.id, entry);
            }
            entry.available = !!m.available;
            if (entry.mesh) entry.mesh.visible = !!m.available;
        }
    }

    if (msg.pickups) {
        const ids = new Set();
        for (const pk of msg.pickups) {
            ids.add(pk.id);
            if (!world.pickups.has(pk.id)) {
                const mesh = createPickupMesh();
                mesh.position.set(pk.x, 0.2, pk.z);
                scene.add(mesh);
                world.pickups.set(pk.id, { id: pk.id, mesh, x: pk.x, z: pk.z });
            }
        }
        for (const pkid of Array.from(world.pickups.keys())) {
            if (!ids.has(pkid)) {
                const p = world.pickups.get(pkid);
                scene.remove(p.mesh);
                disposeObj(p.mesh);
                world.pickups.delete(pkid);
            }
        }
    }

    if (msg.smokes) {
        const ids = new Set();
        for (const s of msg.smokes) {
            ids.add(s.id);
            if (!world.smokes.has(s.id)) {
                const visual = createSmokeVisual(s.x, s.y + 0.4, s.z);
                world.smokes.set(s.id, {
                    ...visual, life: s.left || 12, age: (12 - (s.left || 12)),
                });
            }
        }
        for (const sid of Array.from(world.smokes.keys())) {
            if (!ids.has(sid)) removeSmoke(sid);
        }
    }

    updatePlayersList(players);
    if (scoreboardVisible) renderScoreboard();
}

function addRemotePlayer(id, p) {
    const isDemon = !!p.is_demon;
    const mesh = isDemon ? createDemon(p.dt || 'runner') : createHunter(p.color);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.ry || 0;
    let label = null;
    if (p.name) {
        label = makeNameLabel(p.name, p.color);
        label.position.y = isDemon ? 2.75 * (DEMON_VIS[p.dt] ? DEMON_VIS[p.dt].scale : 1) + 0.25 : 2.15;
        if (isDemon) label.scale.set(3.1, 0.78, 1);
        mesh.add(label);
        mesh.userData.label = label;
    }
    const heavyCrowd = world.remote.size >= 10;
    if (heavyCrowd) {
        mesh.traverse(o => { o.castShadow = false; });
    }
    scene.add(mesh);
    const isDead = !!p.is_dead;
    mesh.visible = !isDead;
    world.remote.set(id, {
        mesh, color: p.color, name: p.name,
        kind: isDemon ? 'demon' : 'hunter',
        isDemon,
        dt: p.dt || '',
        weapon: p.weapon || 'rifle',
        targetPos: new THREE.Vector3(p.x, 0, p.z),
        targetRy: p.ry || 0, targetRx: p.rx || 0,
        hp: p.hp !== undefined ? p.hp : 100,
        maxHp: p.max_hp !== undefined ? p.max_hp : 100,
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        streak: p.streak || 0,
        is_dead: isDead, alive: !isDead,
        anim: '', animUntil: 0, twitchSeed: Math.random() * 10,
    });
}

function removeRemotePlayer(id) {
    const r = world.remote.get(id);
    if (!r) return;
    scene.remove(r.mesh);
    disposeObj(r.mesh);
    world.remote.delete(id);
}

function clearWorld() {
    AU.ambientStop();
    if (world.shopOpen) toggleShop(false);
    hideDefeatOverlay();
    for (const id of Array.from(world.acidGlobs.keys())) removeAcid(id);
    for (const id of Array.from(world.remote.keys())) removeRemotePlayer(id);
    for (const gid of Array.from(world.grenades.keys())) {
        const e = world.grenades.get(gid);
        scene.remove(e.mesh);
        disposeObj(e.mesh);
    }
    world.grenades.clear();
    for (const m of world.medkits.values()) {
        scene.remove(m.mesh);
        disposeObj(m.mesh);
    }
    world.medkits.clear();
    for (const p of world.pickups.values()) {
        scene.remove(p.mesh);
        disposeObj(p.mesh);
    }
    world.pickups.clear();
    for (const sid of Array.from(world.smokes.keys())) removeSmoke(sid);
    world.flashScreen = null;
    if (flashOverlayEl) flashOverlayEl.style.opacity = '0';
    world.myId = null;
}

/* ============================================================
   ИНТЕРПОЛЯЦИЯ / ДЫМ / ФЛЕШ
   ============================================================ */
function updateRemotePlayers(dt) {
    const tPos = 1 - Math.exp(-CFG.LERP_SPEED * dt);
    const tRot = 1 - Math.exp(-CFG.LERP_SPEED * 1.6 * dt);
    const t = performance.now() * 0.001;

    for (const r of world.remote.values()) {
        const m = r.mesh;
        if (!r.alive) continue;
        const distSq = r.targetPos.distanceToSquared(m.position);
        const moving = distSq > 0.02;
        m.position.lerp(r.targetPos, tPos);
        m.rotation.y = lerpAngle(m.rotation.y, r.targetRy, tRot);
        const ud = m.userData;

        if (r.anim && performance.now() * 0.001 > r.animUntil) r.anim = '';

        if (r.kind === 'demon') {
            updateDemonAnim(r, ud, dt, moving, t);
        } else {
            if (ud.upper) ud.upper.rotation.x = -r.targetRx;
            ud.walkPhase = ud.walkPhase || 0;
            if (moving) ud.walkPhase += dt * 11;
            const swing = moving ? Math.sin(ud.walkPhase) * 0.7 : 0;
            if (ud.legs) {
                ud.legs[0].rotation.x = swing;
                ud.legs[1].rotation.x = -swing;
            }
            if (ud.arms) {
                ud.arms[0].rotation.x = ud.baseArmRotX - swing * 0.5;
                ud.arms[1].rotation.x = ud.baseArmRotX + swing * 0.5;
            }
        }
    }
}

function updateDemonAnim(r, ud, dt, moving, t) {
    const m = r.mesh;
    ud.walkPhase = ud.walkPhase || 0;
    const seed = r.twitchSeed || 0;

    // базовая походка: неровная, припадающая
    if (moving) ud.walkPhase += dt * 8.2;
    else ud.walkPhase += dt * 2.1;
    const ph = ud.walkPhase;
    const lurch = Math.sin(ph);
    const lurch2 = Math.sin(ph + Math.PI * 0.85);

    // покачивание корпуса (жуть)
    m.position.y = Math.abs(Math.sin(ph)) * (moving ? 0.075 : 0.02);
    m.rotation.z = Math.sin(ph * 0.5 + seed) * 0.045;

    if (ud.legs) {
        ud.legs[0].rotation.x = lurch * (moving ? 0.75 : 0.12);
        ud.legs[1].rotation.x = lurch2 * (moving ? 0.68 : 0.1);
    }

    const anim = r.anim || '';
    let armL = ud.baseArmRotX + lurch2 * 0.28 - 0.1;
    let armR = ud.baseArmRotX - lurch * 0.28 - 0.1;
    let jawOpen = 0.14 + Math.sin(t * 2.2 + seed) * 0.07;
    let headTilt = 0;
    let headX = 0;

    if (anim === 'attack') {
        // выпад с замахом правой лапы
        const k = Math.sin(Math.min(1, (r.animUntil - t) / 0.55) * Math.PI);
        armR = -1.9 * k + ud.baseArmRotX * (1 - k);
        armL = ud.baseArmRotX - 0.4 * k;
        jawOpen = 0.55 * k + 0.14;
        headX = -0.25 * k;
        m.position.y += 0.05 * k;
    } else if (anim === 'slam') {
        // поднимает обе лапы и бьёт по земле
        const p = Math.min(1, (0.9 - (r.animUntil - t)) / 0.9);
        const raise = Math.sin(Math.min(1, p / 0.5) * Math.PI * 0.5);
        const strike = p > 0.5 ? (p - 0.5) / 0.5 : 0;
        armL = ud.baseArmRotX - 2.1 * raise + 3.0 * strike;
        armR = ud.baseArmRotX - 2.1 * raise + 3.0 * strike;
        jawOpen = 0.7;
        headX = 0.35 * strike;
        m.position.y += 0.16 * raise - 0.1 * strike;
    } else if (anim === 'spit') {
        const k = Math.sin(Math.min(1, (r.animUntil - t) / 0.55) * Math.PI);
        jawOpen = 0.75 * k + 0.14;
        headX = 0.3 * k;
    } else if (anim === 'scream') {
        const k = Math.min(1, (r.animUntil - t) / 1.1);
        const s = Math.sin(k * Math.PI);
        jawOpen = 1.0 * s + 0.14;
        headX = -0.5 * s;
        headTilt = Math.sin(t * 22) * 0.05 * s;
        armL = ud.baseArmRotX - 0.9 * s;
        armR = ud.baseArmRotX - 0.9 * s;
    } else if (anim === 'stumble') {
        headTilt = Math.sin(t * 17 + seed) * 0.25;
        jawOpen = 0.4;
    } else if (!moving) {
        // idle: тяжёлое дыхание и подёргивания
        headTilt = Math.sin(t * 9 + seed * 3) * 0.03;
        jawOpen = 0.12 + Math.sin(t * 1.6 + seed) * 0.1;
    }

    if (ud.arms) {
        ud.arms[0].rotation.x = armL;
        ud.arms[1].rotation.x = armR;
        ud.arms[0].rotation.z = 0.12 + Math.sin(ph * 0.7) * 0.05;
        ud.arms[1].rotation.z = -0.12 - Math.sin(ph * 0.7) * 0.05;
    }
    if (ud.jawL) ud.jawL.rotation.x = jawOpen;
    if (ud.head) {
        ud.head.rotation.x = headX + Math.sin(t * 1.4 + seed) * 0.03;
        ud.head.rotation.z = headTilt;
        ud.head.rotation.y = Math.sin(t * 0.7 + seed) * 0.06;
    }
}

function updateGrenadeMeshes(dt) {
    for (const g of world.grenades.values()) {
        g.mesh.position.lerp(g.target, 1 - Math.exp(-18 * dt));
        const ring = g.mesh.userData.ring;
        if (ring) ring.rotation.z += dt * 6;
    }
}

function updateMedkits(dt) {
    const t = performance.now() * 0.001;
    for (const m of world.medkits.values()) {
        if (!m.mesh || !m.mesh.visible) continue;
        m.mesh.rotation.y += dt * 1.5;
        m.mesh.position.y = 0.2 + Math.sin(t * 2 + m.x) * 0.08;
    }
}

function updateSmokes(dt) {
    for (const s of world.smokes.values()) {
        s.age += dt;
        const grow = Math.min(1, s.age / 1.2);
        const fade = s.age > s.life - 2.5 ? clamp((s.life - s.age) / 2.5, 0, 1) : 1;
        if (s.mat) {
            s.mat.opacity = 0.62 * grow * fade;
            s.mat.size = 7.8 * (0.55 + 0.45 * grow);
        }
        if (s.group) {
            s.group.rotation.y += (s.spin || 0.03) * dt;
            s.group.position.y = (s.baseY || 0) + Math.sin(s.age * 0.5) * 0.22;
        }
        if (s.age >= s.life) removeSmokeSilent(s);
    }
}

function updateNameLabels() {
    for (const r of world.remote.values()) {
        const label = r.mesh.userData.label;
        if (!label) continue;
        let hidden = false;
        if (r.mesh.position.distanceToSquared(camera.position) < 22) {
            hidden = true; // в упор ник не мешает обзору
        } else if (world.smokes.size > 0) {
            for (const s of world.smokes.values()) {
                const dx = r.mesh.position.x - s.group.position.x;
                const dz = r.mesh.position.z - s.group.position.z;
                if (dx * dx + dz * dz < 132) { hidden = true; break; }
            }
        }
        label.visible = !hidden;
    }
}

function updatePickups(dt) {
    const t = performance.now() * 0.001;
    for (const p of world.pickups.values()) {
        if (!p.mesh) continue;
        p.mesh.rotation.y += dt * 1.8;
        p.mesh.position.y = 0.2 + Math.sin(t * 2.4 + p.x) * 0.09;
    }
}

function removeSmokeSilent(s) {
    for (const [id, v] of world.smokes) {
        if (v === s) {
            scene.remove(v.group);
            disposeObj(v.group);
            world.smokes.delete(id);
            return;
        }
    }
}

function updateFlashScreen(dt) {
    if (!flashOverlayEl) return;
    const f = world.flashScreen;
    if (!f) return;
    f.t += dt;
    let o = 0;
    if (f.t < f.dur) {
        o = 1; // сплошной белый
    } else if (f.t < f.dur + 0.6) {
        o = 1 - (f.t - f.dur) / 0.6;
    } else {
        world.flashScreen = null;
    }
    flashOverlayEl.style.opacity = o.toFixed(3);
}

/* ============================================================
   АВТО-ОГОНЬ
   ============================================================ */
function handleAutoFire() {
    if (!mouseLeftDown) return;
    if (!world.alive) return;
    const wp = CFG.WEAPONS[world.weapon];
    if (!wp || !wp.auto) return;
    if (world.weaponCD > 0) return;
    tryShoot();
}

/* ============================================================
   ОТПРАВКА СОСТОЯНИЯ
   ============================================================ */
function sendState() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !world.myId) return;
    if (!world.alive) return;
    const sx = Number(world.position.x.toFixed(3));
    const sz = Number(world.position.z.toFixed(3));
    world.lastSent = { x: sx, z: sz };
    world.sentHist.push({ t: performance.now(), x: sx, z: sz });
    if (world.sentHist.length > 30) world.sentHist.shift();
    ws.send(JSON.stringify({
        type: 'state',
        x: sx,
        z: sz,
        ry: Number(world.yaw.toFixed(4)),
        rx: Number(world.pitch.toFixed(4)),
        y: 0,
    }));
}

/* ============================================================
   HUD
   ============================================================ */
function updatePlayersList(players) {
    const entries = Object.entries(players);
    if (playerCountEl) playerCountEl.textContent = entries.length;
    if (!playersListEl || playersListEl.offsetParent === null) return;
    entries.sort((a, b) => {
        const ka = a[1].kills || 0, kb = b[1].kills || 0;
        if (kb !== ka) return kb - ka;
        return (a[1].name || '').localeCompare(b[1].name || '');
    });
    playersListEl.innerHTML = '';
    for (const [id, p] of entries) {
        const li = document.createElement('li');
        if (id === world.myId) li.classList.add('me');
        const hp = p.hp !== undefined ? p.hp : 100;
        if (hp <= 0 || p.is_dead) li.classList.add('dead');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = hexColor(p.color);
        dot.style.color = hexColor(p.color);
        const nm = document.createElement('span');
        const botTag = p.is_bot ? ' [BOT]' : '';
        nm.textContent = (p.name || 'Боец') + botTag +
                        (id === world.myId ? ' (вы)' : '') +
                        ` · ${p.kills || 0}`;
        const hpMini = document.createElement('div');
        hpMini.className = 'hp-mini';
        const hpBar = document.createElement('i');
        hpBar.style.width = Math.max(0, Math.min(100, hp)) + '%';
        hpMini.appendChild(hpBar);
        li.appendChild(dot);
        li.appendChild(nm);
        li.appendChild(hpMini);
        playersListEl.appendChild(li);
    }
}

function updateGrenadeHud() {
    for (const kind of ['frag', 'smoke', 'flash']) {
        const el = grenChipEls[kind];
        if (!el) continue;
        el.classList.toggle('sel', world.grenadeSel === kind);
        el.classList.toggle('empty', (world.grenadesCount[kind] || 0) <= 0);
        const cnt = el.querySelector('.cnt');
        if (cnt) cnt.textContent = String(world.grenadesCount[kind] || 0);
    }
}

function flashChip(kind) {
    const el = grenChipEls[kind];
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 350);
}

function buildAmmoPips() {
    if (!ammoPipsEl) return;
    const mag = effMag();
    const count = Math.min(mag, 30);
    world.pipCount = count;
    world.roundsPerPip = mag / count;
    ammoPipsEl.innerHTML = '';
    for (let i = 0; i < count; i++) {
        ammoPipsEl.appendChild(document.createElement('i'));
    }
    updateAmmoPips();
}

function updateAmmoPips() {
    if (!ammoPipsEl || !world.pipCount) return;
    const lit = Math.max(0, Math.ceil(world.ammo / world.roundsPerPip));
    const kids = ammoPipsEl.children;
    for (let i = 0; i < kids.length; i++) {
        const on = i < lit;
        if (kids[i].classList.contains('on') !== on) kids[i].classList.toggle('on', on);
    }
    ammoPipsEl.classList.toggle('low', world.ammo <= Math.ceil(CFG.WEAPONS[world.weapon].mag * 0.25));
}

function updateHUD() {
    const hpPct = world.maxHp > 0 ? (world.hp / world.maxHp) * 100 : 0;
    if (hpFillEl) {
        hpFillEl.style.width = hpPct + '%';
        const bar = hpFillEl.parentElement;
        if (hpPct < 30) bar.classList.add('low'); else bar.classList.remove('low');
    }
    if (hpLagEl) hpLagEl.style.width = clamp(world.hpLag, 0, 100) + '%';
    const wp = CFG.WEAPONS[world.weapon];
    if (pistolFillEl) {
        if (world.weaponCD > 0) {
            pistolFillEl.style.width = ((1 - world.weaponCD / wp.cooldown) * 100) + '%';
            pistolFillEl.parentElement.classList.remove('ready');
        } else {
            pistolFillEl.style.width = '100%';
            pistolFillEl.parentElement.classList.add('ready');
        }
    }
    updateAmmoPips();
    if (crosshairEl) {
        const spd = Math.hypot(world.velocity.x, world.velocity.z);
        const moveF = clamp(spd / CFG.MOVE_SPRINT, 0, 1);
        const spr = (wp.spreadBase + wp.spreadMove * moveF * (world.ads ? 0.25 : 1.0)) / 0.08;
        crosshairEl.style.setProperty('--chs', (1 + Math.min(1.5, spr) * 0.45).toFixed(2));
    }
    if (ammoCountEl) {
        ammoCountEl.innerHTML = `${world.ammo}<small> | ${world.reserve}</small>`;
        ammoCountEl.style.color = world.ammo <= Math.ceil(wp.mag * 0.25) ? '#ffb347' : '#00e5ff';
    }
    if (reserveValEl) {
        reserveValEl.textContent = String(world.reserve);
        reserveValEl.classList.toggle('empty', world.reserve <= 0);
    }
    if (ammoStatusEl) {
        if (world.reloadLeft > 0) {
            ammoStatusEl.textContent = 'ПЕРЕЗАРЯДКА';
            ammoStatusEl.classList.add('reloading');
        } else if (world.ammo <= 0) {
            ammoStatusEl.textContent = world.reserve > 0 ? '[R] ПЕРЕЗАРЯДКА' : 'НЕТ ПАТРОНОВ';
            ammoStatusEl.classList.add('reloading');
        } else {
            ammoStatusEl.textContent = world.ads ? 'ПРИЦЕЛ' : 'ГОТОВ';
            ammoStatusEl.classList.remove('reloading');
        }
    }
    if (reloadWrapEl) reloadWrapEl.classList.add('hidden');
    if (reloadRingCircle && reloadRingEl) {
        const C = 2 * Math.PI * 26;
        if (world.reloadLeft > 0 && world.reloadTotal > 0) {
            const progress = 1 - world.reloadLeft / world.reloadTotal;
            reloadRingCircle.style.strokeDashoffset = String(C * (1 - progress));
            reloadRingEl.classList.add('active');
        } else {
            reloadRingEl.classList.remove('active');
        }
    }
    const hpPctEl = $('hp-pct');
    const killsValEl = $('kills-val');
    const statusValEl = $('status-val');
    if (hpPctEl) {
        hpPctEl.textContent = Math.round(hpPct) + '';
        hpPctEl.style.color = hpPct < 30 ? '#ff4b4b' : '#ffffff';
    }
    if (killsValEl) killsValEl.textContent = String(world.kills || 0);
    if (streakValEl) streakValEl.textContent = String(world.streak || 0);
    if (statusValEl) statusValEl.textContent = world.alive ? 'ONLINE' : 'DEAD';
    updateWaveHud();
    if (pingValEl) pingValEl.textContent = world.ping + ' ms';
    const vigAlpha = world.alive ? (hpPct < 60 ? (1 - hpPct / 60) * 0.85 : 0) : 0.55;
    damageVignette.style.opacity = vigAlpha.toFixed(2);
}

/* ============================================================
   ТАБЛО (TAB)
   ============================================================ */
function renderScoreboard() {
    if (!sbBodyEl) return;
    const players = world.lastState || {};
    const entries = Object.entries(players);
    entries.sort((a, b) => {
        const ka = a[1].kills || 0, kb = b[1].kills || 0;
        if (kb !== ka) return kb - ka;
        const da = a[1].deaths || 0, db = b[1].deaths || 0;
        return da - db;
    });
    let html = '';
    let place = 0;
    for (const [id, p] of entries) {
        place++;
        const isMe = id === world.myId;
        const isBot = !!p.is_bot;
        const hp = p.hp !== undefined ? p.hp : 100;
        const cls = [];
        if (isMe) cls.push('me');
        if (p.is_dead) cls.push('dead');
        if (isBot) cls.push('bot');
        const teamColor = hexColor(p.color);
        const botCls = p.dt || p.cls || 'runner';
        const glyphChar = {
            runner: '●', brute: '■', screamer: '◆', spitter: '▲', titan: '★',
            ghost: '◆', jugg: '■', storm: '●',
        }[botCls] || '●';
        const glyph = isBot
            ? `<span class="cls-glyph ${botCls}">${glyphChar}</span>`
            : '';
        html += `<tr class="${cls.join(' ')}">` +
            `<td class="rank">${place}</td>` +
            `<td class="nm"><span class="tdot" style="background:${teamColor}"></span>${glyph}` +
            `${escapeHtml(p.name || 'Боец')}${isBot ? '<span class="tag">BOT</span>' : ''}${isMe ? '<span class="tag me-tag">ВЫ</span>' : ''}</td>` +
            `<td class="k">${p.kills || 0}</td>` +
            `<td class="d">${p.deaths || 0}</td>` +
            `<td class="s">${p.streak || 0}</td>` +
            `<td class="hp"><div class="sb-hp"><i style="width:${clamp(hp, 0, 100)}%"></i></div></td>` +
            `</tr>`;
    }
    if (!html) html = '<tr><td colspan="6" class="empty">Нет игроков</td></tr>';
    sbBodyEl.innerHTML = html;
    if (sbCountEl) sbCountEl.textContent = String(entries.length);
    if (sbPingEl) sbPingEl.textContent = world.ping + ' ms';
}

/* ============================================================
   БАННЕР СЕРИЙ
   ============================================================ */
let bannerTimer = null;
function showBanner(main, sub, color) {
    if (!streakBannerEl) return;
    if (streakMainEl) {
        streakMainEl.textContent = main;
        streakMainEl.style.color = color || '#ff2d88';
        streakMainEl.style.textShadow = `0 0 24px ${color || '#ff2d88'}, 0 0 60px ${color || '#ff2d88'}`;
    }
    if (streakSubEl) streakSubEl.textContent = sub || '';
    streakBannerEl.classList.remove('hidden');
    streakBannerEl.classList.remove('show');
    void streakBannerEl.offsetWidth;
    streakBannerEl.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
        streakBannerEl.classList.add('hidden');
        streakBannerEl.classList.remove('show');
    }, 2200);
}

/* ============================================================
   МИНИКАРТА
   ============================================================ */
let minimapBg = null;

function buildMinimapBg() {
    if (!minimapEl) return;
    minimapBg = document.createElement('canvas');
    minimapBg.width = minimapEl.width;
    minimapBg.height = minimapEl.height;
    const ctx = minimapBg.getContext('2d');
    const W = minimapBg.width, H = minimapBg.height;
    const range = CFG.ARENA_HALF * 1.05;
    const mapX = (x) => ((x + range) / (range * 2)) * W;
    const mapY = (z) => ((z + range) / (range * 2)) * H;

    ctx.fillStyle = 'rgba(150,190,230,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,80,140,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mapX(-CFG.ARENA_HALF), mapY(-CFG.ARENA_HALF),
                   W * (CFG.ARENA_HALF / range), H * (CFG.ARENA_HALF / range));
    ctx.fillStyle = 'rgba(40,60,80,0.55)';
    for (const c of colliders) {
        const w = (c.hw * 2 / (range * 2)) * W;
        const h = (c.hd * 2 / (range * 2)) * H;
        ctx.fillRect(mapX(c.x - c.hw), mapY(c.z - c.hd), w, h);
    }
}

function drawMinimap() {
    if (!minimapCtx || !minimapEl) return;
    const W = minimapEl.width, H = minimapEl.height;
    minimapCtx.clearRect(0, 0, W, H);

    if (minimapBg) minimapCtx.drawImage(minimapBg, 0, 0);

    const range = CFG.ARENA_HALF * 1.05;
    const mapX = (x) => ((x + range) / (range * 2)) * W;
    const mapY = (z) => ((z + range) / (range * 2)) * H;

    minimapCtx.fillStyle = 'rgba(140,150,165,0.55)';
    for (const s of world.smokes.values()) {
        minimapCtx.beginPath();
        minimapCtx.arc(mapX(s.group.position.x), mapY(s.group.position.z), 6, 0, Math.PI * 2);
        minimapCtx.fill();
    }

    for (const m of world.medkits.values()) {
        if (!m.available) continue;
        minimapCtx.fillStyle = '#44ff88';
        minimapCtx.fillRect(mapX(m.x) - 2, mapY(m.z) - 2, 4, 4);
    }

    for (const r of world.remote.values()) {
        if (!r.alive) continue;
        minimapCtx.fillStyle = hexColor(r.color);
        minimapCtx.beginPath();
        minimapCtx.arc(mapX(r.mesh.position.x), mapY(r.mesh.position.z), 3.5, 0, Math.PI * 2);
        minimapCtx.fill();
    }

    if (world.alive) {
        const cx = mapX(world.position.x);
        const cy = mapY(world.position.z);
        const fx = -Math.sin(world.yaw);
        const fz = -Math.cos(world.yaw);
        minimapCtx.fillStyle = 'rgba(0,229,255,0.18)';
        minimapCtx.beginPath();
        minimapCtx.moveTo(cx, cy);
        const coneAng = Math.atan2(fz, fx);
        minimapCtx.arc(cx, cy, 22, coneAng - 0.6, coneAng + 0.6);
        minimapCtx.closePath();
        minimapCtx.fill();
        minimapCtx.fillStyle = '#ffffff';
        minimapCtx.beginPath();
        minimapCtx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        minimapCtx.fill();
        minimapCtx.strokeStyle = '#00e5ff';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.moveTo(cx, cy);
        minimapCtx.lineTo(cx + fx * 10, cy + fz * 10);
        minimapCtx.stroke();
    }
}

/* ============================================================
   ADS
   ============================================================ */
function updateADS() {
    world.ads = mouseRightDown && !world.sprint;
}

/* ============================================================
   ЦИКЛ РЕНДЕРА
   ============================================================ */
let holoAccumulator = 0;
let fpsFrames = 0;
let fpsTime = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (running) {
        updateADS();
        updateMovement(dt);
        handleAutoFire();
        updateRemotePlayers(dt);
        updateGrenadeMeshes(dt);
        updateAcid(dt);
        updateMedkits(dt);
        updatePickups(dt);
        updateSmokes(dt);
        updateNameLabels();
        updateDamageIndicator(dt);
        updateFlashScreen(dt);
        updateEffects(dt);
        updateCamera(dt);

        sendAccumulator += dt;
        if (sendAccumulator >= CFG.SEND_INTERVAL) {
            sendAccumulator = 0;
            sendState();
        }
        hudAccumulator += dt;
        if (hudAccumulator >= 1 / 20) {
            hudAccumulator = 0;
            updateHUD();
        }
        minimapAccumulator += dt;
        if (minimapAccumulator >= 1 / 20) {
            minimapAccumulator = 0;
            drawMinimap();
        }
        pingAccumulator += dt;
        if (pingAccumulator >= 2.0) {
            pingAccumulator = 0;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
            }
        }
        if (scoreboardVisible) {
            scoreboardAccumulator += dt;
            if (scoreboardAccumulator >= 0.3) {
                scoreboardAccumulator = 0;
                renderScoreboard();
            }
        }
        holoAccumulator += dt;
        if (holoAccumulator >= 2.0) {
            holoAccumulator = 0;
            const players = world.lastState || {};
            const entries = Object.entries(players);
            let leader = null;
            for (const [id, p] of entries) {
                if (!leader || (p.kills || 0) > (leader.kills || 0)) leader = p;
                void id;
            }
            drawHoloBoard(entries.length, leader);
            if (leaderNameEl) leaderNameEl.textContent = leader ? (leader.name || '—') : '—';
            if (leaderKillsEl) leaderKillsEl.textContent = String(leader ? (leader.kills || 0) : 0);
        }

        fpsFrames++;
        fpsTime += dt;
        if (fpsTime >= 0.5) {
            if (fpsValEl) fpsValEl.textContent = String(Math.round(fpsFrames / fpsTime));
            fpsFrames = 0;
            fpsTime = 0;
        }

        if (world.mode === 'defense') {
            const nowS = performance.now() * 0.001;
            let nearest = 1e9;
            for (const r of world.remote.values()) {
                if (r.kind === 'demon' && r.alive) {
                    nearest = Math.min(nearest, r.mesh.position.distanceTo(camera.position));
                }
            }
            const hpPct = world.maxHp > 0 ? world.hp / world.maxHp : 1;
            const danger = clamp((1 - nearest / 20) * 0.65 + (hpPct < 0.5 ? 0.55 : 0), 0, 1);
            if (danger > 0.22 && nowS >= world.heartbeatAt) {
                world.heartbeatAt = nowS + (1.15 - danger * 0.55);
                AU.heartbeat(0.45 + danger * 0.55);
            }
            if (world.wavePhase === 'break' && nowS >= world.whisperAt) {
                world.whisperAt = nowS + 6 + Math.random() * 9;
                AU.whisper((Math.random() - 0.5) * 1.6);
            }
        }
    } else {
        const t = clock.getElapsedTime() * 0.12;
        camera.position.set(Math.sin(t) * 90, 35, Math.cos(t) * 90);
        camera.lookAt(0, 3, 0);
    }

    if (holoBoard) holoBoard.rotation.y = Math.sin(clock.getElapsedTime() * 0.25) * 0.5;

    updateShowcase(dt);

    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(viewScene, viewCamera);
}

/* ============================================================
   ПРЕВЬЮ ОРУЖИЯ В МЕНЮ
   ============================================================ */
function updateLoadoutFromCard(card) {
    if (!card) return;
    const h3 = card.querySelector('h3');
    if (loadoutNameEl && h3) loadoutNameEl.textContent = h3.textContent;
    if (loadoutAbilityEl) loadoutAbilityEl.textContent = card.dataset.ability || '';
    const bars = card.querySelectorAll('.mini-bar i');
    const targets = [lsDmgEl, lsRateEl, lsRangeEl];
    const vals = [lsDmgValEl, lsRateValEl, lsRangeValEl];
    for (let i = 0; i < targets.length; i++) {
        if (!bars[i]) continue;
        const w = bars[i].style.width || '0%';
        if (targets[i]) targets[i].style.width = w;
        if (vals[i]) vals[i].textContent = String(parseInt(w, 10) || 0);
    }
}

function drawWeaponPreviews() {
    document.querySelectorAll('.car-preview').forEach((canvas) => {
        const kind = canvas.dataset.preview;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(10,16,26,0.55)';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2, h / 2);

        if (kind === 'pistol') {
            ctx.fillStyle = '#cccccc';
            ctx.fillRect(-16, -4, 24, 8);
            ctx.fillStyle = '#444';
            ctx.fillRect(-6, 4, 10, 14);
        } else if (kind === 'revolver') {
            ctx.fillStyle = '#dddddd';
            ctx.fillRect(-18, -4, 26, 8);
            ctx.fillStyle = '#888';
            ctx.beginPath(); ctx.arc(-6, 0, 7, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#6b4a2a';
            ctx.fillRect(-4, 4, 8, 14);
        } else if (kind === 'dmr') {
            ctx.fillStyle = '#ffd27a';
            ctx.fillRect(-44, -2, 80, 4);
            ctx.fillStyle = '#6b4a2a';
            ctx.fillRect(-30, -3, 22, 6);
            ctx.fillStyle = '#1a1c22';
            ctx.fillRect(-4, -9, 16, 7);
            ctx.fillRect(8, 2, 16, 10);
        } else if (kind === 'rifle') {
            ctx.fillStyle = '#33ff88';
            ctx.fillRect(-44, -2, 76, 4);
            ctx.fillStyle = '#2a3140';
            ctx.fillRect(-22, -8, 30, 16);
            ctx.fillRect(-10, 8, 10, 16);
            ctx.fillStyle = '#1a1c22';
            ctx.fillRect(6, -4, 20, 8);
        } else if (kind === 'burst') {
            ctx.fillStyle = '#ffb054';
            ctx.fillRect(-40, -2, 66, 4);
            ctx.fillStyle = '#2a3140';
            ctx.fillRect(-18, -7, 28, 14);
            ctx.fillStyle = '#333';
            ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(24, -4); ctx.lineTo(20, 2); ctx.lineTo(12, 2); ctx.fill();
        } else if (kind === 'smg') {
            ctx.fillStyle = '#aaffff';
            ctx.fillRect(-34, -2, 50, 4);
            ctx.fillStyle = '#2a3140';
            ctx.fillRect(-16, -6, 24, 12);
            ctx.fillStyle = '#444';
            ctx.fillRect(-10, 4, 8, 16);
        } else if (kind === 'lmg') {
            ctx.fillStyle = '#ffaa88';
            ctx.fillRect(-50, -2, 80, 4);
            ctx.fillStyle = '#2a3140';
            ctx.fillRect(-20, -10, 34, 18);
            ctx.fillStyle = '#1a1c22';
            ctx.fillRect(-10, 8, 20, 8);
        } else if (kind === 'shotgun') {
            ctx.fillStyle = '#ffaa33';
            ctx.fillRect(-40, -3, 60, 6);
            ctx.fillStyle = '#2a3140';
            ctx.fillRect(-46, -10, 30, 20);
            ctx.fillStyle = '#6b4a2a';
            ctx.fillRect(6, -4, 20, 10);
        } else {
            ctx.fillStyle = '#33aaff';
            ctx.fillRect(-50, -1, 100, 2);
            ctx.fillStyle = '#1a1c22';
            ctx.fillRect(-40, -8, 34, 16);
            ctx.fillStyle = '#0a0a10';
            ctx.fillRect(-30, -18, 50, 10);
            ctx.fillStyle = '#33aaff';
            ctx.beginPath(); ctx.arc(-30, -13, 3, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    });
}

/* ============================================================
   BOOT
   ============================================================ */
async function boot() {
    try {
        let mode = 'ffa';
        try {
            const r = await fetch('config.json', { cache: 'no-store' });
            if (r.ok) {
                const cfg = await r.json();
                if (cfg && cfg.mode) mode = String(cfg.mode).toLowerCase();
            }
        } catch (e) {
            console.warn('[CONFIG] fetch failed, ffa по умолчанию:', e);
        }
        world.mode = (mode === 'defense') ? 'defense' : 'ffa';
        CFG.ARENA_HALF = world.mode === 'defense' ? 150 : 200;
        console.log('[MODE]', world.mode, '| арена', CFG.ARENA_HALF * 2);

        initThree();
        initInput();

        cardEls.forEach(card => {
            card.addEventListener('click', () => {
                cardEls.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedWeapon = card.dataset.weapon;
                updateLoadoutFromCard(card);
                setShowcaseWeapon(selectedWeapon);
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                AU.resume();
                AU.ui();
            });
        });
        updateLoadoutFromCard(document.querySelector('.car-card.selected'));

        const scrollCarousel = (dir) => {
            const track = $('car-select');
            if (!track) return;
            const step = (track.querySelector('.car-card')?.offsetWidth || 240) + 12;
            track.scrollBy({ left: dir * step, behavior: 'smooth' });
            AU.ui();
        };
        if (carPrevEl) carPrevEl.addEventListener('click', () => scrollCarousel(-1));
        if (carNextEl) carNextEl.addEventListener('click', () => scrollCarousel(1));

        const musicBtnEl = $('music-btn');
        if (musicBtnEl) musicBtnEl.addEventListener('click', () => {
            AU.resume();
            Music.toggle();
        });

        connectBtn.addEventListener('click', () => {
            const name = (nicknameEl.value || 'Боец').trim().slice(0, 16) || 'Боец';
            connectBtn.disabled = true;
            statusEl.textContent = 'Подключение...';
            AU.resume();
            connect(name);
        });

        nicknameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !connectBtn.disabled) connectBtn.click();
        });

        renderer.domElement.addEventListener('click', () => {
            if (running && !pointerLocked) {
                renderer.domElement.requestPointerLock();
            }
        });

        drawWeaponPreviews();
        initShowcase();
        animate();
        console.log('[BOOT] OK');
    } catch (err) {
        console.error('[BOOT] FAILED:', err);
        statusEl.textContent = 'Ошибка запуска: ' + err.message;
    }
}

boot();
