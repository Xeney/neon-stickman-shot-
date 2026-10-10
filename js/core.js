import * as THREE from 'three';

export { THREE };

export const CFG = {
    ARENA_HALF: 200,

    MOVE_WALK:    7.5,
    MOVE_SPRINT:  12.0,
    MOVE_CROUCH:  3.5,
    ACCEL:        65,
    FRICTION:     15,
    GRAVITY:      20.0,
    JUMP_V:       6.2,

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

export const WS_URL = `ws://${location.hostname || 'localhost'}:8001`;
console.log('[WS_URL]', WS_URL);

export const $ = (id) => document.getElementById(id);

export const DOM = {
    menu: $('menu'),
    nickname: $('nickname'),
    connectBtn: $('connect-btn'),
    status: $('status'),
    hud: $('hud'),
    playersList: $('players-list'),
    playerCount: $('player-count'),
    minimap: $('minimap'),
    minimapCtx: null,
    hpFill: $('hp-fill'),
    pistolFill: $('pistol-fill'),
    weaponName: $('weapon-name'),
    ammoCount: $('ammo-count'),
    ammoStatus: $('ammo-status'),
    respawnOverlay: $('respawn-overlay'),
    respawnCounter: $('respawn-counter'),
    crosshair: $('crosshair'),
    hitMarker: $('hit-marker'),
    scope: $('scope'),
    killFeed: $('killfeed'),
    damageFlash: $('damage-flash'),
    medkitPrompt: $('medkit-prompt'),
    cards: document.querySelectorAll('.car-card'),
    flashOverlay: $('flash-overlay'),
    streakBanner: $('streak-banner'),
    streakMain: $('streak-main'),
    streakSub: $('streak-sub'),
    scoreboard: $('scoreboard'),
    sbBody: $('sb-body'),
    sbCount: $('sb-count'),
    sbPing: $('sb-ping'),
    sbGlyphs: document.querySelector('.sb-glyphs'),
    pingVal: $('ping-val'),
    grenChips: { frag: $('gren-frag'), smoke: $('gren-smoke'), flash: $('gren-flash') },
    ammoPips: $('ammo-pips'),
    reserveVal: $('reserve-val'),
    hpLag: $('hp-lag'),
    reloadRing: $('reload-ring'),
    reloadRingCircle: $('reload-ring-circle'),
    dmgIndicator: $('dmg-indicator'),
    carPrev: $('car-prev'),
    carNext: $('car-next'),
    fpsVal: $('fps-val'),
    streakVal: $('streak-val'),
    leaderName: $('leader-name'),
    leaderKills: $('leader-kills'),
    leaderChip: $('leader-chip'),
    loadoutName: $('loadout-name'),
    loadoutAbility: $('loadout-ability'),
    lsDmg: $('ls-dmg'),
    lsRate: $('ls-rate'),
    lsRange: $('ls-range'),
    lsDmgVal: $('ls-dmg-val'),
    lsRateVal: $('ls-rate-val'),
    lsRangeVal: $('ls-range-val'),
    weaponClass: $('weapon-class'),
    weaponMode: $('weapon-mode'),
    waveChip: $('wave-chip'),
    waveNum: $('wave-num'),
    waveState: $('wave-state'),
    pointsChip: $('points-chip'),
    pointsVal: $('points-val'),
    pointsPopup: $('points-popup'),
    shop: $('shop'),
    shopPoints: $('shop-points'),
    defeatOverlay: $('defeat-overlay'),
    musicBtn: $('music-btn'),
    gameContainer: $('game-container'),
};
if (DOM.minimap) DOM.minimapCtx = DOM.minimap.getContext('2d');

export function weaponModeLabel(id) {
    const w = CFG.WEAPONS[id];
    if (!w) return '';
    if (w.burst) return 'ОЧЕРЕДЬ ×3';
    return w.auto ? 'АВТОМАТИЧЕСКИЙ' : 'ОДИНОЧНЫЙ';
}

export const WEAPON_CLASS_LABEL = {
    pistol: 'ПИСТОЛЕТ', revolver: 'ПИСТОЛЕТ',
    dmr: 'МАРКСМАН', sniper: 'СНАЙПЕРСКОЕ',
    rifle: 'ШТУРМОВОЕ', burst: 'ШТУРМОВОЕ',
    smg: 'ПП', lmg: 'ПУЛЕМЁТ', shotgun: 'ДРОБОВИК',
};

export const damageVignette = document.createElement('div');
damageVignette.style.cssText = `
    position: fixed; inset: 0; pointer-events: none; z-index: 5;
    background: radial-gradient(circle at center,
        rgba(255,0,0,0) 45%, rgba(255,20,20,0.5) 100%);
    opacity: 0; transition: opacity .25s ease;
`;
document.body.appendChild(damageVignette);

/* ---------- общее состояние ---------- */
export const G = {
    renderer: null, scene: null, camera: null, clock: null, sun: null,
    viewScene: null, viewCamera: null,
    weaponHolder: null, currentWeaponModel: null,
    composer: null, bloomPass: null, bloomEnabled: true, bloomCheckedAt: 0,
    running: false, pointerLocked: false, scoreboardVisible: false,
    sendAccumulator: 0, hudAccumulator: 0, minimapAccumulator: 0,
    scoreboardAccumulator: 0, pingAccumulator: 0,
    windTime: 0,
};

export const colliders = [];
export const tracers = [];
export const impacts = [];
export const shrapnel = [];
export const flashes = [];
export const explosionRings = [];

export const world = {
    myId: null,
    myColor: 0xffffff,
    weapon: 'pistol',
    weaponCD: 0,
    ammo: 15,
    reloadLeft: 0,
    reloadTotal: 0,
    reloadStage: -1,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    velY: 0,
    grounded: true,
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
    sprintBlend: 0, inspectT: 0,
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
    rotation: true,
    roundPhase: 'ffa',
    roundLeft: 0,
    voteCounts: null,
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

export const keys = Object.create(null);
export const mouse = { left: false, right: false };

/* ---------- утилиты ---------- */
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const hexColor = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
}

export function disposeObj(obj) {
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

export function effMag() {
    const wp = CFG.WEAPONS[world.weapon];
    return Math.max(1, Math.round(wp.mag * (1 + 0.15 * (world.upgrades.mag || 0))));
}

export function effReloadTime() {
    const wp = CFG.WEAPONS[world.weapon];
    return wp.reload * (1 - 0.08 * (world.upgrades.reload || 0));
}

export function speedMult() {
    return 1 + 0.04 * (world.upgrades.speed || 0);
}

/* ---------- пространственный хеш ---------- */
export const GRID_CELL = 20;
export const colliderGrid = new Map();

export function buildColliderGrid() {
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

export function collidersNear(x, z, r) {
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

export function collidersInBox(x0, z0, x1, z1) {
    if (x0 > x1) { const t = x0; x0 = x1; x1 = t; }
    if (z0 > z1) { const t = z0; z0 = z1; z1 = t; }
    const r = Math.max(x1 - x0, z1 - z0) / 2 + GRID_CELL * 0.5;
    return collidersNear((x0 + x1) / 2, (z0 + z1) / 2, r);
}

export function pointBlocked(x, z, clr = 0.5, minH = 0.8) {
    for (const c of collidersNear(x, z, clr)) {
        if (c.h < minH) continue;
        if (Math.abs(x - c.x) < c.hw + clr && Math.abs(z - c.z) < c.hd + clr) return true;
    }
    return false;
}

/* ---------- ray / segment ---------- */
export function rayAABB(ox, oy, oz, dx, dy, dz, c) {
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

export function segmentClear3D(a, b) {
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

export function addBoxCollider(x, z, hw, hd, h = 16) {
    colliders.push({ x, z, hw, hd, h });
}
