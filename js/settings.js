import { G, DOM, $, clamp } from './core.js';
import { AU, Music } from './audio.js';
import { setWeaponTextures } from './weapons.js';
import { setDecorVisibility } from './decor.js';
import { setSkyVisibility } from './sky.js';

/* ============================================================
   НАСТРОЙКИ ГРАФИКИ И ЗВУКА
   5 пресетов (1 — для самых слабых ПК, 5 — максимум, по
   умолчанию 3) + ручная тонкая настройка каждого параметра.
   ============================================================ */

export const PRESETS = {
    1: { label: 'МИНИМУМ',  pr: 0.5,  shadow: false, shadowSize: 512,  bloom: false, effects: 0.35, grass: false, decor: false, birds: false, textures: false },
    2: { label: 'НИЗКИЙ',   pr: 0.7,  shadow: false, shadowSize: 512,  bloom: false, effects: 0.6,  grass: true,  decor: false, birds: false, textures: false },
    3: { label: 'СРЕДНИЙ',  pr: 1.0,  shadow: true,  shadowSize: 1024, bloom: true,  effects: 1.0,  grass: true,  decor: true,  birds: true,  textures: false },
    4: { label: 'ВЫСОКИЙ',  pr: 1.5,  shadow: true,  shadowSize: 2048, bloom: true,  effects: 1.0,  grass: true,  decor: true,  birds: true,  textures: false },
    5: { label: 'УЛЬТРА',   pr: 2.0,  shadow: true,  shadowSize: 2048, bloom: true,  effects: 1.0,  grass: true,  decor: true,  birds: true,  textures: true },
};

export const GFX = {
    level: 3,
    pr: 1.0,
    shadow: true,
    shadowSize: 1024,
    bloom: true,
    bloomAutoOff: false,
    effectsFactor: 1.0,
    grass: true,
    decor: true,
    birds: true,
    textures: false,
};

const TOGGLE_KEYS = ['grass', 'decor', 'birds', 'shadow', 'bloom', 'effects', 'textures'];

export function loadSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('nss_gfx') || 'null'); } catch (e) { void e; }
    const lvl = saved && PRESETS[saved.level] ? saved.level : 3;
    applyPreset(lvl, saved ? saved.t : null, false);
}

export function saveSettings() {
    try {
        localStorage.setItem('nss_gfx', JSON.stringify({
            level: GFX.level,
            t: {
                grass: GFX.grass, decor: GFX.decor, birds: GFX.birds,
                shadow: GFX.shadow, bloom: GFX.bloom,
                effects: GFX.effectsFactor, textures: GFX.textures,
            },
        }));
    } catch (e) { void e; }
}

function applyPreset(level, custom, persist = true) {
    const p = PRESETS[level] || PRESETS[3];
    GFX.level = level;
    GFX.pr = p.pr;
    GFX.shadowSize = p.shadowSize;
    GFX.effectsFactor = p.effects;
    GFX.shadow = custom ? !!custom.shadow : p.shadow;
    GFX.bloom = custom ? !!custom.bloom : p.bloom;
    GFX.grass = custom ? !!custom.grass : p.grass;
    GFX.decor = custom ? !!custom.decor : p.decor;
    GFX.birds = custom ? !!custom.birds : p.birds;
    GFX.textures = custom ? !!custom.textures : p.textures;
    if (custom && typeof custom.effects === 'number') GFX.effectsFactor = custom.effects;
    GFX.bloomAutoOff = false;
    if (persist) saveSettings();
    applyGraphics();
    refreshSettingsUI();
}

export function setPreset(level) {
    applyPreset(level, null, true);
    AU.ui();
}

export function setToggle(key, on) {
    if (!TOGGLE_KEYS.includes(key)) return;
    if (key === 'effects') {
        const p = PRESETS[GFX.level] || PRESETS[3];
        GFX.effectsFactor = on ? Math.max(0.6, p.effects) : 0.3;
    } else {
        GFX[key] = !!on;
    }
    if (key === 'bloom' && on) GFX.bloomAutoOff = false;
    saveSettings();
    applyGraphics();
    refreshSettingsUI();
}

export function applyGraphics() {
    const r = G.renderer;
    if (r) {
        const maxPr = Math.min(window.devicePixelRatio || 1, GFX.pr);
        r.setPixelRatio(Math.max(0.4, maxPr));
        r.setSize(innerWidth, innerHeight);
        if (G.composer) G.composer.setSize(innerWidth, innerHeight);
        if (G.bloomPass) G.bloomPass.setSize(innerWidth, innerHeight);
    }
    if (G.sun) {
        G.sun.castShadow = GFX.shadow;
        const want = GFX.shadowSize;
        if (G.sun.shadow.mapSize.width !== want) {
            if (G.sun.shadow.map) { G.sun.shadow.map.dispose(); G.sun.shadow.map = null; }
            G.sun.shadow.mapSize.set(want, want);
        }
    }
    G.bloomEnabled = GFX.bloom && !GFX.bloomAutoOff;
    setWeaponTextures(GFX.textures);
    setDecorVisibility(GFX.grass, GFX.decor);
    setSkyVisibility(GFX.birds, GFX.decor);
}

/* ============================================================
   UI панели настроек
   ============================================================ */
let uiReady = false;

export function initSettingsUI() {
    if (uiReady) return;
    uiReady = true;

    document.querySelectorAll('.set-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            setPreset(parseInt(btn.dataset.level, 10) || 3);
        });
    });

    const bindToggle = (id, key) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('change', () => setToggle(key, el.checked));
    };
    bindToggle('set-grass', 'grass');
    bindToggle('set-decor', 'decor');
    bindToggle('set-birds', 'birds');
    bindToggle('set-shadows', 'shadow');
    bindToggle('set-bloom', 'bloom');
    bindToggle('set-effects', 'effects');
    bindToggle('set-textures', 'textures');

    const musicSlider = $('set-music');
    if (musicSlider) {
        musicSlider.value = String(Math.round((Music.volume || 0.26) * 100));
        musicSlider.addEventListener('input', () => {
            const v = clamp(parseInt(musicSlider.value, 10) / 100, 0, 1);
            Music.volume = v;
            if (Music.el) Music.fadeTo(Music.muted ? 0 : v, 0.2);
            try { localStorage.setItem('nss_music_vol', String(v)); } catch (e) { void e; }
        });
    }
    const sfxSlider = $('set-sfx');
    if (sfxSlider) {
        sfxSlider.value = String(Math.round(AU.sfxVolume * 100));
        sfxSlider.addEventListener('input', () => {
            AU.setSfxVolume(parseInt(sfxSlider.value, 10) / 100);
            AU.ui();
        });
    }

    const nickInput = $('set-nick');
    if (nickInput) {
        nickInput.value = DOM.nickname ? DOM.nickname.value : '';
        const applyNick = () => {
            const v = (nickInput.value || 'Боец').trim().slice(0, 16) || 'Боец';
            if (DOM.nickname) DOM.nickname.value = v;
            try { localStorage.setItem('nss_name', v); } catch (e) { void e; }
            AU.ui();
        };
        nickInput.addEventListener('change', applyNick);
        nickInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { applyNick(); nickInput.blur(); }
        });
    }

    const closeBtn = $('set-close');
    if (closeBtn) closeBtn.addEventListener('click', () => closeSettings());
    const gearBtn = $('settings-btn');
    if (gearBtn) gearBtn.addEventListener('click', () => openSettings());
    const backdrop = $('settings-panel');
    if (backdrop) backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeSettings();
    });

    refreshSettingsUI();
}

export function refreshSettingsUI() {
    document.querySelectorAll('.set-preset').forEach(btn => {
        const lvl = parseInt(btn.dataset.level, 10);
        btn.classList.toggle('active', lvl === GFX.level);
    });
    const setChk = (id, val) => {
        const el = $(id);
        if (el) el.checked = !!val;
    };
    setChk('set-grass', GFX.grass);
    setChk('set-decor', GFX.decor);
    setChk('set-birds', GFX.birds);
    setChk('set-shadows', GFX.shadow);
    setChk('set-bloom', GFX.bloom && !GFX.bloomAutoOff);
    setChk('set-effects', GFX.effectsFactor > 0.5);
    setChk('set-textures', GFX.textures);
}

/* ============================================================
   Открытие/закрытие панели (из меню или из паузы)
   ============================================================ */
let settingsFromPause = false;
let onCloseCallback = null;

export function openSettings(fromPause = false, onClose = null) {
    settingsFromPause = fromPause;
    onCloseCallback = onClose;
    const panel = $('settings-panel');
    if (panel) panel.classList.remove('hidden');
    const nickInput = $('set-nick');
    if (nickInput && DOM.nickname) nickInput.value = DOM.nickname.value;
    refreshSettingsUI();
    AU.ui();
}

export function closeSettings() {
    const panel = $('settings-panel');
    if (panel) panel.classList.add('hidden');
    const cb = onCloseCallback;
    onCloseCallback = null;
    if (cb) cb(settingsFromPause);
}

export function settingsOpen() {
    const panel = $('settings-panel');
    return panel ? !panel.classList.contains('hidden') : false;
}
