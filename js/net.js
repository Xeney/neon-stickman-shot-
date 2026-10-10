import { THREE, CFG, DOM, G, world, clamp, disposeObj, WS_URL, segmentClear3D,
         collidersInBox, rayAABB, WEAPON_CLASS_LABEL, weaponModeLabel, explosionRings } from './core.js';
import { AU, spatialSound, Music } from './audio.js';
import { createGrenadeMesh, createMedkitMesh, createPickupMesh, createSmokeVisual,
         removeSmoke, spawnTracerLimited, spawnGoreBurst, spawnExplosion, explodeHuman, explodeDemon,
         createAcidGlob, acidPop, spawnClawFX, spawnNuke } from './effects.js';
import { addRemotePlayer, removeRemotePlayer } from './characters.js';
import { buildWeaponModel } from './weapons.js';
import { updatePlayersList, renderScoreboard, showHitMarker, showDamageIndicator,
         showBanner, updateGrenadeHud, flashChip, buildAmmoPips, buildShopPips,
         updateShopUI, updateWaveHud, hideDefeatOverlay, showDefeatOverlay,
         showPointsPopup, addKillFeed, toggleShop, showNukeModal, hideNukeModal,
         showVote, hideVote, voteOpen } from './hud.js';
import { startReload, updateCamera, applyModeVisuals } from '../game.js';

/* ============================================================
   СЕТЬ: подключение, обработчики сервера, отправка состояния
   ============================================================ */

export let ws = null;
let connectTimeout = null;
let joinWeapon = 'pistol';

export function setJoinWeapon(id) {
    if (CFG.WEAPONS[id]) joinWeapon = id;
}

export function sendMsg(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
    }
}

export function connect(name) {
    try { ws = new WebSocket(WS_URL); }
    catch (err) {
        console.error('[WS] Не удалось создать:', err);
        DOM.status.textContent = 'Не удалось открыть соединение';
        DOM.connectBtn.disabled = false;
        return;
    }

    connectTimeout = setTimeout(() => {
        if (!G.running && ws && ws.readyState !== WebSocket.OPEN) {
            DOM.status.textContent = 'Сервер не отвечает (5с). Запущен ли server.py?';
            DOM.connectBtn.disabled = false;
            try { ws.close(); } catch (e) { void e; }
        }
    }, 5000);

    ws.onopen = () => {
        console.log('[WS] open');
        DOM.status.textContent = 'Синхронизация...';
        ws.send(JSON.stringify({ type: 'join', name, weapon: joinWeapon }));
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
            case 'acid_spawn':    createAcidGlob(msg); break;
            case 'acid_pop':      acidPop(msg); break;
            case 'wave':          handleWaveEvent(msg); break;
            case 'upgrade_ok':    handleUpgradeOk(msg); break;
            case 'upgrade_deny':  handleUpgradeDeny(msg); break;
            case 'boss_spawn':    handleBossSpawn(msg); break;
            case 'boss_defeated': handleBossDefeated(msg); break;
            case 'boss_down':     handleBossDown(msg); break;
            case 'nuke':          handleNuke(msg); break;
            case 'nuke_denied':   handleNukeDenied(msg); break;
            case 'round_end':     handleRoundEnd(msg); break;
            case 'vote_start':    handleVoteStart(msg); break;
            case 'vote_update':   handleVoteUpdate(msg); break;
            case 'vote_end':      handleVoteEnd(msg); break;
            case 'mode_start':    handleModeStart(msg); break;
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
        DOM.status.textContent = 'Ошибка соединения. Сервер запущен? Порт 8001 доступен?';
        DOM.connectBtn.disabled = false;
    };

    ws.onclose = (ev) => {
        console.warn('[WS CLOSE]', ev.code, ev.reason);
        if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
        G.running = false; G.pointerLocked = false;
        if (document.pointerLockElement) document.exitPointerLock();
        DOM.hud.classList.add('hidden');
        DOM.menu.classList.remove('hidden');
        DOM.connectBtn.disabled = false;
        DOM.status.textContent = ev.code === 1000
            ? 'Соединение закрыто'
            : `Соединение потеряно (код ${ev.code})`;
        clearWorld();
    };
}

/* ============================================================
   Сброс мира
   ============================================================ */
export function clearWorld() {
    AU.ambientStop();
    hideNukeModal();
    if (world.shopOpen) toggleShop(false);
    hideDefeatOverlay();
    for (const id of Array.from(world.acidGlobs.keys())) {
        const g = world.acidGlobs.get(id);
        if (g) { G.scene.remove(g.mesh); disposeObj(g.mesh); }
        world.acidGlobs.delete(id);
    }
    for (const id of Array.from(world.remote.keys())) removeRemotePlayer(id);
    for (const gid of Array.from(world.grenades.keys())) {
        const e = world.grenades.get(gid);
        G.scene.remove(e.mesh);
        disposeObj(e.mesh);
    }
    world.grenades.clear();
    for (const m of world.medkits.values()) {
        G.scene.remove(m.mesh);
        disposeObj(m.mesh);
    }
    world.medkits.clear();
    for (const p of world.pickups.values()) {
        G.scene.remove(p.mesh);
        disposeObj(p.mesh);
    }
    world.pickups.clear();
    for (const sid of Array.from(world.smokes.keys())) removeSmoke(sid);
    world.flashScreen = null;
    if (DOM.flashOverlay) DOM.flashOverlay.style.opacity = '0';
    world.myId = null;
}

/* ============================================================
   Отправка состояния (30 Гц)
   ============================================================ */
export function sendState() {
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
        y: Number(world.position.y.toFixed(3)),
        ry: Number(world.yaw.toFixed(4)),
        rx: Number(world.pitch.toFixed(4)),
    }));
}

/* ============================================================
   События стрельбы / попаданий / убийств
   ============================================================ */
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
        if (DOM.damageFlash) {
            DOM.damageFlash.style.opacity = '1';
            setTimeout(() => { DOM.damageFlash.style.opacity = '0'; }, 200);
        }
        const hitKick = msg.explosion ? 0.85 : (msg.headshot ? 0.65 : 0.3);
        world.shake = Math.min(1.1, world.shake + hitKick);
        world.hp = msg.hp;
        showDamageIndicator(msg.shooter);
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
            else explodeHuman(r.mesh, r.color);
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
        if (G.weaponHolder) G.weaponHolder.visible = false;
        if (DOM.respawnOverlay) DOM.respawnOverlay.classList.remove('hidden');
        if (DOM.crosshair) DOM.crosshair.style.opacity = '0';
        if (document.pointerLockElement) document.exitPointerLock();
        world.shake = 0.7;
    }
    addKillFeed(msg);
}

/* ============================================================
   Гранаты / дым / флеш / аптечки
   ============================================================ */
function handleGrenadeSpawn(msg) {
    if (world.grenades.has(msg.id)) return;
    const kind = msg.kind || 'frag';
    const mesh = createGrenadeMesh(kind);
    mesh.position.set(msg.x, msg.y, msg.z);
    G.scene.add(mesh);
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

function handleFlashPop(msg) {
    const pos = new THREE.Vector3(msg.x, msg.y, msg.z);
    const dist = G.camera.position.distanceTo(pos);
    const los = segmentClear3D(G.camera.position.clone(), pos);
    if (dist >= 46 || (!los && dist > 3)) {
        const snd = spatialSound(pos);
        AU.flashbang(0.22 * Math.max(0.2, snd.vol));
        return;
    }
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

function handlePickupTaken(msg) {
    const p = world.pickups.get(msg.id);
    if (p) {
        G.scene.remove(p.mesh);
        disposeObj(p.mesh);
        world.pickups.delete(msg.id);
    }
    if (msg.player === world.myId) {
        AU.pickup(0);
        if (typeof msg.reserve === 'number') world.reserve = msg.reserve;
        world.pickupCooldown = 0.8;
    }
}

/* ============================================================
   Демоны и волны
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
        G.scene.add(ring);
        explosionRings.push({ mesh: ring, life: 0.55, age: 0, maxScale: msg.r || 5 });
        spawnGoreBurst(pos, 0x993311, 22, 9, 0.4);
        const snd = spatialSound(pos);
        AU.demonSlam(snd.pan, Math.max(0.25, snd.vol));
        const d = G.camera.position.distanceTo(pos);
        world.shake = Math.min(1.2, world.shake + clamp(1.1 - d / 40, 0, 1) * 0.8);
    }
    if (msg.target === world.myId) {
        world.shake = Math.min(0.9, world.shake + 0.3);
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
    const d = G.camera.position.distanceTo(pos);
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
    G.scene.add(ring);
    explosionRings.push({ mesh: ring, life: 0.55, age: 0, maxScale: (msg.r || 6) * 0.8 });
    const snd = spatialSound(pos);
    AU.demonExplode(snd.pan, Math.max(0.2, snd.vol));
    const d = G.camera.position.distanceTo(pos);
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
        if (msg.revived > 0) {
            showBanner('ВОЛНА ЗАЧИЩЕНА', `ВОЗРОЖДЕНИЕ: ${msg.revived} · ПЕРЕРЫВ ${msg.next_in} СЕК`, '#34d97b');
        } else {
            showBanner('ВОЛНА ЗАЧИЩЕНА', `ПЕРЕРЫВ ${msg.next_in} СЕК · [B] МАГАЗИН`, '#34d97b');
        }
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
   БОСС И ЯДЕРНАЯ БОМБА
   ============================================================ */
function handleBossSpawn() {
    showBanner('БОСС В ЦЕНТРЕ', 'ТИТАН ЖДЁТ СМЕЛЬЧАКОВ', '#ff5533');
    AU.bossSpawn();
    world.shake = Math.min(0.8, world.shake + 0.3);
}

function handleBossDefeated(msg) {
    if (msg.killer === world.myId) return;
    const who = msg.killer_name || 'НИКТО';
    showBanner('БОСС ПОВЕРЖЕН', `${who} · СЛЕДУЮЩИЙ ЧЕРЕЗ ${Math.round((msg.next_in || 900) / 60)} МИН`, '#ff2d88');
}

function handleBossDown(msg) {
    showBanner('БОСС ПОВЕРЖЕН!', 'ТЫ ПОЛУЧИЛ ЯДЕРНУЮ БОМБУ', '#ff5533');
    showNukeModal(20);
}

function handleNuke(msg) {
    addKillFeed({
        shooter_name: msg.name || '?',
        target_name: 'ВСЕ НА КАРТЕ',
        explosion: true,
        weapon: 'NUKE',
        shooter: msg.by,
        headshot: false,
    });
    spawnNuke(msg.x || 0, msg.z || 0);
    showBanner('☢ ЯДЕРНЫЙ УДАР', `${msg.name || '?'} СТЁР ${msg.victims || 0} БОЙЦОВ`, '#ff5533');
}

function handleNukeDenied(msg) {
    showBanner('ЯДЕРКА ОТМЕНЕНА', `${msg.name || '?'} ОТКАЗАЛСЯ ОТ УДАРА`, '#8fb4ff');
    AU.deny();
}

/* ============================================================
   РОТАЦИЯ: конец раунда, голосование, смена режима
   ============================================================ */
function handleRoundEnd(msg) {
    const why = msg.reason === 'kills' ? `ЛИМИТ ${msg.kill_limit} УБИЙСТВ` : 'ВРЕМЯ ВЫШЛО';
    showBanner('РАУНД ЗАВЕРШЁН', `${msg.winner_name || '—'} · ${msg.winner_kills || 0} УБ · ${why}`, '#ffcc00');
    AU.streakSnd();
}

function handleVoteStart(msg) {
    showVote(msg.seconds || 15, msg.reason || '');
}

function handleVoteUpdate(msg) {
    world.voteCounts = msg.counts || null;
}

function handleVoteEnd(msg) {
    hideVote();
    const name = msg.chosen === 'defense' ? 'С ДЕМОНАМИ' : 'С БОТАМИ';
    showBanner('ГОЛОСОВАНИЕ', `ВЫБРАНО: ${name}`, msg.chosen === 'defense' ? '#ff5533' : '#00e5ff');
}

function handleModeStart(msg) {
    hideVote();
    hideDefeatOverlay();
    world.mode = msg.mode === 'defense' ? 'defense' : 'ffa';
    world.roundPhase = world.mode;
    applyModeVisuals(world.mode);
    if (world.mode === 'defense') {
        AU.ambientStart();
        Music.volume = 0.16;
        world.wave = msg.wave || 0;
        world.wavePhase = 'break';
        world.breakUntil = performance.now() / 1000 + (msg.break_seconds || 12);
        if (world.shopOpen) toggleShop(false);
        showBanner('РЕЖИМ: ОБОРОНА', `ДЕМОНЫ ЧЕРЕЗ ${msg.break_seconds || 12} СЕК · [B] МАГАЗИН`, '#ff5533');
    } else {
        AU.ambientStop();
        Music.volume = 0.26;
        world.wavePhase = 'idle';
        if (world.shopOpen) toggleShop(false);
        showBanner('РЕЖИМ: АРЕНА', `${msg.kill_limit || 50} УБИЙСТВ ИЛИ ${Math.round((msg.duration || 1800) / 60)} МИН`, '#00e5ff');
    }
    const mmLabel = document.querySelector('.mm-label');
    if (mmLabel) {
        mmLabel.textContent = world.mode === 'defense'
            ? 'МЕГАПОЛИС · НОЧЬ · 400×400'
            : 'НЕОН-АРЕНА · 400×400';
    }
    updateWaveHud();
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
        const wId = (msg.weapon && CFG.WEAPONS[msg.weapon]) ? msg.weapon : joinWeapon;
        world.weapon = wId;
        world.hp = 100; world.maxHp = 100; world.kills = 0; world.deaths = 0; world.streak = 0;
        world.ammo = CFG.WEAPONS[wId].mag;
        world.reloadLeft = 0; world.reloadTotal = 0;
        world.position.set(msg.x, 0, msg.z);
        world.velocity.set(0, 0, 0);
        world.velY = 0;
        world.grounded = true;
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
        world.rotation = !!msg.rotation;
        world.roundPhase = msg.phase || world.mode;
        world.roundLeft = msg.round_left || 0;
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
        applyModeVisuals(world.mode);
        if (msg.vote && msg.vote.ends_in > 0) {
            showVote(msg.vote.ends_in, 'late');
        }
        const mmLabel = document.querySelector('.mm-label');
        if (mmLabel) {
            mmLabel.textContent = world.mode === 'defense' ? 'КРЕПОСТЬ · 300×300' : 'НЕОН-АРЕНА · 400×400';
        }

        buildWeaponModel(wId);
        if (DOM.weaponName) DOM.weaponName.textContent = CFG.WEAPONS[wId].name;
        if (DOM.weaponClass) DOM.weaponClass.textContent = WEAPON_CLASS_LABEL[wId] || '';
        if (DOM.weaponMode) DOM.weaponMode.textContent = weaponModeLabel(wId);

        G.running = true;
        DOM.menu.classList.add('hidden');
        DOM.hud.classList.remove('hidden');
        DOM.status.textContent = '';
        if (DOM.respawnOverlay) DOM.respawnOverlay.classList.add('hidden');
        if (DOM.crosshair) DOM.crosshair.style.opacity = '1';
        if (DOM.flashOverlay) DOM.flashOverlay.style.opacity = '0';

        for (const id of Array.from(world.remote.keys())) removeRemotePlayer(id);
        for (const gid of Array.from(world.grenades.keys())) {
            const g = world.grenades.get(gid);
            G.scene.remove(g.mesh);
            disposeObj(g.mesh);
        }
        world.grenades.clear();
        for (const m of world.medkits.values()) {
            G.scene.remove(m.mesh);
            disposeObj(m.mesh);
        }
        world.medkits.clear();
        for (const p of world.pickups.values()) {
            G.scene.remove(p.mesh);
            disposeObj(p.mesh);
        }
        world.pickups.clear();
        for (const sid of Array.from(world.smokes.keys())) removeSmoke(sid);
        for (const id of Array.from(world.acidGlobs.keys())) {
            const g = world.acidGlobs.get(id);
            if (g) { G.scene.remove(g.mesh); disposeObj(g.mesh); }
            world.acidGlobs.delete(id);
        }

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
                G.scene.add(mesh);
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
                G.scene.add(mesh);
                world.medkits.set(m.id, {
                    id: m.id, mesh, x: m.x, z: m.z, available: !!m.available,
                });
            } catch (e) { console.warn('[INIT] medkit error', e); }
        }

        for (const pk of (msg.pickups || [])) {
            try {
                const mesh = createPickupMesh();
                mesh.position.set(pk.x, 0.2, pk.z);
                G.scene.add(mesh);
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
            const p = G.renderer.domElement.requestPointerLock();
            if (p && p.catch) p.catch((err) => console.warn('[PTRLOCK]', err));
        } catch (err) { console.warn('[PTRLOCK]', err); }

        try { updatePlayersList(playersObj); }
        catch (e) { console.warn('[INIT] players list', e); }

        console.log('[INIT] OK, running =', G.running);
    } catch (err) {
        console.error('[INIT] КРИТИЧЕСКАЯ ОШИБКА:', err);
        DOM.status.textContent = 'Ошибка инициализации: ' + err.message;
        DOM.connectBtn.disabled = false;
        DOM.menu.classList.remove('hidden');
        DOM.hud.classList.add('hidden');
        G.running = false;
    }
}

function handleState(msg) {
    const players = msg.players || {};
    world.lastState = players;
    world.roundPhase = msg.phase || world.roundPhase;
    world.roundLeft = msg.round_left || 0;
    if (msg.vote_ends_in > 0) {
        world.voteCounts = msg.vote_counts || null;
        if (!voteOpen()) showVote(msg.vote_ends_in, 'server');
    } else {
        world.voteCounts = null;
    }
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
            if (G.weaponHolder) G.weaponHolder.visible = false;
            if (DOM.respawnOverlay) DOM.respawnOverlay.classList.remove('hidden');
            if (DOM.crosshair) DOM.crosshair.style.opacity = '0';
            if (document.pointerLockElement) document.exitPointerLock();
        } else if (!me.is_dead && !world.alive) {
            world.alive = true;
            world.hp = newHp;
            world.hpLag = newHp;
            world.position.set(me.x, me.y || 0, me.z);
            world.velocity.set(0, 0, 0);
            world.velY = 0;
            world.grounded = true;
            world.yaw = me.ry || 0;
            world.pitch = 0;
            world.reconcile = null;
            world.lastSent = null;
            world.sentHist = [];
            if (typeof me.reserve === 'number') world.reserve = me.reserve;
            if (typeof me.ammo === 'number') world.ammo = me.ammo;
            if (G.weaponHolder) G.weaponHolder.visible = true;
            if (DOM.respawnOverlay) DOM.respawnOverlay.classList.add('hidden');
            if (DOM.crosshair) DOM.crosshair.style.opacity = '1';
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
                else explodeHuman(r.mesh, r.color);
                r.mesh.visible = false;
            }
        } else if (!newIsDead && !r.alive) {
            r.alive = true; r.is_dead = false;
            r.mesh.visible = true;
            r.mesh.position.set(p.x, p.y || 0, p.z);
        }
        r.hp = p.hp !== undefined ? p.hp : 100;
        r.kills = p.kills || 0;
        r.deaths = p.deaths || 0;
        r.streak = p.streak || 0;
        r.targetPos.set(p.x, p.y || 0, p.z);
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
                G.scene.add(mesh);
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
                G.scene.remove(e.mesh);
                disposeObj(e.mesh);
                world.grenades.delete(gid);
                if (kind === 'frag') {
                    spawnExplosion(pos.x, Math.max(0.4, pos.y), pos.z);
                    const snd = spatialSound(pos);
                    AU.explosion(snd.pan, Math.max(0.2, snd.vol));
                    const dd = G.camera.position.distanceTo(pos);
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
                G.scene.add(mesh);
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
                G.scene.add(mesh);
                world.pickups.set(pk.id, { id: pk.id, mesh, x: pk.x, z: pk.z });
            }
        }
        for (const pkid of Array.from(world.pickups.keys())) {
            if (!ids.has(pkid)) {
                const p = world.pickups.get(pkid);
                G.scene.remove(p.mesh);
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
    if (G.scoreboardVisible) renderScoreboard();
}
