import { THREE, DOM, $, CFG, G, world, clamp, hexColor, effMag, colliders, damageVignette } from './core.js';
import { AU } from './audio.js';
import { sendMsg } from './net.js';

/* ============================================================
   HUD v2.1: список игроков, патроны, TAB-табло, миникарта,
   волны, магазин прокачки, киллфид, баннеры
   ============================================================ */

export function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

export function showHitMarker(headshot) {
    if (!DOM.hitMarker) return;
    DOM.hitMarker.classList.toggle('kill', !!headshot);
    DOM.hitMarker.classList.add('active');
    if (DOM.crosshair) {
        DOM.crosshair.classList.add('hit');
        setTimeout(() => DOM.crosshair.classList.remove('hit'), 100);
    }
    setTimeout(() => DOM.hitMarker.classList.remove('active'), headshot ? 250 : 130);
}

export function showDamageIndicator(shooterId) {
    if (!DOM.dmgIndicator) return;
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
    DOM.dmgIndicator.classList.remove('hidden');
    DOM.dmgIndicator.style.transform = `translate(-50%, -50%) rotate(${(angle * 180 / Math.PI).toFixed(1)}deg)`;
}

export function updateDamageIndicator(dt) {
    if (!world.dmgDir) return;
    world.dmgDir.t += dt;
    if (world.dmgDir.t >= world.dmgDir.life) {
        world.dmgDir = null;
        if (DOM.dmgIndicator) DOM.dmgIndicator.classList.add('hidden');
    }
}

/* ---------- киллфид ---------- */
export function addKillFeed(msg) {
    if (!DOM.killFeed) return;
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
    const rawWeapon = msg.weapon ? String(msg.weapon).toUpperCase() : '';
    const wname = rawWeapon === 'BOSS_GUN' ? 'ТИТАН' : rawWeapon;
    const weapon = wname ? `<span class="wpn">${escapeHtml(wname)}</span>` : '';
    el.innerHTML = `<span class="kf-glitch" data-txt="${escapeHtml(shooterName)}">` +
                   `<b class="${cls1}">${escapeHtml(shooterName)}</b></span> ${weapon} ${icon} ` +
                   `<b class="${cls2}">${escapeHtml(targetName)}</b>` +
                   (msg.headshot ? `<span class="hs">ХЕДШОТ</span>` : '');
    DOM.killFeed.appendChild(el);
    setTimeout(() => el.remove(), 5000);
    while (DOM.killFeed.children.length > 6) DOM.killFeed.firstChild.remove();
}

/* ---------- список игроков (левый верх) ---------- */
export function updatePlayersList(players) {
    const entries = Object.entries(players);
    if (DOM.playerCount) DOM.playerCount.textContent = entries.length;
    if (!DOM.playersList || DOM.playersList.offsetParent === null) return;
    entries.sort((a, b) => {
        const ka = a[1].kills || 0, kb = b[1].kills || 0;
        if (kb !== ka) return kb - ka;
        return (a[1].name || '').localeCompare(b[1].name || '');
    });
    DOM.playersList.innerHTML = '';
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
        const botTag = p.cls === 'boss' ? ' [БОСС]' : (p.is_bot ? ' [BOT]' : '');
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
        DOM.playersList.appendChild(li);
    }
}

/* ---------- гранаты ---------- */
export function updateGrenadeHud() {
    for (const kind of ['frag', 'smoke', 'flash']) {
        const el = DOM.grenChips[kind];
        if (!el) continue;
        el.classList.toggle('sel', world.grenadeSel === kind);
        el.classList.toggle('empty', (world.grenadesCount[kind] || 0) <= 0);
        const cnt = el.querySelector('.cnt');
        if (cnt) cnt.textContent = String(world.grenadesCount[kind] || 0);
    }
}

export function flashChip(kind) {
    const el = DOM.grenChips[kind];
    if (!el) return;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 350);
}

/* ---------- патроны ---------- */
export function buildAmmoPips() {
    if (!DOM.ammoPips) return;
    const mag = effMag();
    const count = Math.min(mag, 30);
    world.pipCount = count;
    world.roundsPerPip = mag / count;
    DOM.ammoPips.innerHTML = '';
    for (let i = 0; i < count; i++) {
        DOM.ammoPips.appendChild(document.createElement('i'));
    }
    updateAmmoPips();
}

export function updateAmmoPips() {
    if (!DOM.ammoPips || !world.pipCount) return;
    const lit = Math.max(0, Math.ceil(world.ammo / world.roundsPerPip));
    const kids = DOM.ammoPips.children;
    for (let i = 0; i < kids.length; i++) {
        const on = i < lit;
        if (kids[i].classList.contains('on') !== on) kids[i].classList.toggle('on', on);
    }
    DOM.ammoPips.classList.toggle('low', world.ammo <= Math.ceil(CFG.WEAPONS[world.weapon].mag * 0.25));
}

/* ---------- основной HUD ---------- */
export function updateHUD() {
    const hpPct = world.maxHp > 0 ? (world.hp / world.maxHp) * 100 : 0;
    if (DOM.hpFill) {
        DOM.hpFill.style.width = hpPct + '%';
        const bar = DOM.hpFill.parentElement;
        if (hpPct < 30) bar.classList.add('low'); else bar.classList.remove('low');
    }
    if (DOM.hpLag) DOM.hpLag.style.width = clamp(world.hpLag, 0, 100) + '%';
    const wp = CFG.WEAPONS[world.weapon];
    if (DOM.pistolFill) {
        if (world.weaponCD > 0) {
            DOM.pistolFill.style.width = ((1 - world.weaponCD / wp.cooldown) * 100) + '%';
            DOM.pistolFill.parentElement.classList.remove('ready');
        } else {
            DOM.pistolFill.style.width = '100%';
            DOM.pistolFill.parentElement.classList.add('ready');
        }
    }
    updateAmmoPips();
    if (DOM.crosshair) {
        const spd = Math.hypot(world.velocity.x, world.velocity.z);
        const moveF = clamp(spd / CFG.MOVE_SPRINT, 0, 1);
        const spr = (wp.spreadBase + wp.spreadMove * moveF * (world.ads ? 0.25 : 1.0)) / 0.08;
        DOM.crosshair.style.setProperty('--chs', (1 + Math.min(1.5, spr) * 0.45).toFixed(2));
    }
    if (DOM.ammoCount) {
        DOM.ammoCount.innerHTML = `${world.ammo}<small> | ${world.reserve}</small>`;
        DOM.ammoCount.style.color = world.ammo <= Math.ceil(wp.mag * 0.25) ? '#ffb347' : '#00e5ff';
    }
    if (DOM.reserveVal) {
        DOM.reserveVal.textContent = String(world.reserve);
        DOM.reserveVal.classList.toggle('empty', world.reserve <= 0);
    }
    if (DOM.ammoStatus) {
        if (world.reloadLeft > 0) {
            DOM.ammoStatus.textContent = 'ПЕРЕЗАРЯДКА';
            DOM.ammoStatus.classList.add('reloading');
        } else if (world.ammo <= 0) {
            DOM.ammoStatus.textContent = world.reserve > 0 ? '[R] ПЕРЕЗАРЯДКА' : 'НЕТ ПАТРОНОВ';
            DOM.ammoStatus.classList.add('reloading');
        } else {
            DOM.ammoStatus.textContent = world.ads ? 'ПРИЦЕЛ' : 'ГОТОВ';
            DOM.ammoStatus.classList.remove('reloading');
        }
    }
    if (DOM.reloadRingCircle && DOM.reloadRing) {
        const C = 2 * Math.PI * 26;
        if (world.reloadLeft > 0 && world.reloadTotal > 0) {
            const progress = 1 - world.reloadLeft / world.reloadTotal;
            DOM.reloadRingCircle.style.strokeDashoffset = String(C * (1 - progress));
            DOM.reloadRing.classList.add('active');
        } else {
            DOM.reloadRing.classList.remove('active');
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
    if (DOM.streakVal) DOM.streakVal.textContent = String(world.streak || 0);
    if (statusValEl) statusValEl.textContent = world.alive ? 'ONLINE' : 'DEAD';
    updateWaveHud();
    updateNukeTimer();
    if (DOM.pingVal) DOM.pingVal.textContent = world.ping + ' ms';
    const vigAlpha = world.alive ? (hpPct < 60 ? (1 - hpPct / 60) * 0.85 : 0) : 0.55;
    damageVignette.style.opacity = vigAlpha.toFixed(2);
}

/* ---------- TAB-табло ---------- */
export function renderScoreboard() {
    if (!DOM.sbBody) return;
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
            ghost: '◆', jugg: '■', storm: '●', boss: '☠',
        }[botCls] || '●';
        const glyph = isBot
            ? `<span class="cls-glyph ${botCls}">${glyphChar}</span>`
            : '';
        html += `<tr class="${cls.join(' ')}">` +
            `<td class="rank">${place}</td>` +
            `<td class="nm"><span class="tdot" style="background:${teamColor}"></span>${glyph}` +
            `${escapeHtml(p.name || 'Боец')}${isBot ? `<span class="tag">${p.cls === 'boss' ? 'БОСС' : 'BOT'}</span>` : ''}${isMe ? '<span class="tag me-tag">ВЫ</span>' : ''}</td>` +
            `<td class="k">${p.kills || 0}</td>` +
            `<td class="d">${p.deaths || 0}</td>` +
            `<td class="s">${p.streak || 0}</td>` +
            `<td class="hp"><div class="sb-hp"><i style="width:${clamp(hp, 0, 100)}%"></i></div></td>` +
            `</tr>`;
    }
    if (!html) html = '<tr><td colspan="6" class="empty">Нет игроков</td></tr>';
    DOM.sbBody.innerHTML = html;
    if (DOM.sbCount) DOM.sbCount.textContent = String(entries.length);
    if (DOM.sbPing) DOM.sbPing.textContent = world.ping + ' ms';
}

/* ---------- баннеры ---------- */
let bannerTimer = null;
export function showBanner(main, sub, color) {
    if (!DOM.streakBanner) return;
    if (DOM.streakMain) {
        DOM.streakMain.textContent = main;
        DOM.streakMain.style.color = color || '#ff2d88';
        DOM.streakMain.style.textShadow = `0 0 24px ${color || '#ff2d88'}, 0 0 60px ${color || '#ff2d88'}`;
    }
    if (DOM.streakSub) DOM.streakSub.textContent = sub || '';
    DOM.streakBanner.classList.remove('hidden');
    DOM.streakBanner.classList.remove('show');
    void DOM.streakBanner.offsetWidth;
    DOM.streakBanner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
        DOM.streakBanner.classList.add('hidden');
        DOM.streakBanner.classList.remove('show');
    }, 2200);
}

/* ---------- миникарта ---------- */
let minimapBg = null;

export function buildMinimapBg() {
    if (!DOM.minimap) return;
    minimapBg = document.createElement('canvas');
    minimapBg.width = DOM.minimap.width;
    minimapBg.height = DOM.minimap.height;
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

export function drawMinimap() {
    if (!DOM.minimapCtx || !DOM.minimap) return;
    const W = DOM.minimap.width, H = DOM.minimap.height;
    DOM.minimapCtx.clearRect(0, 0, W, H);

    if (minimapBg) DOM.minimapCtx.drawImage(minimapBg, 0, 0);

    const range = CFG.ARENA_HALF * 1.05;
    const mapX = (x) => ((x + range) / (range * 2)) * W;
    const mapY = (z) => ((z + range) / (range * 2)) * H;

    DOM.minimapCtx.fillStyle = 'rgba(140,150,165,0.55)';
    for (const s of world.smokes.values()) {
        DOM.minimapCtx.beginPath();
        DOM.minimapCtx.arc(mapX(s.group.position.x), mapY(s.group.position.z), 6, 0, Math.PI * 2);
        DOM.minimapCtx.fill();
    }

    for (const m of world.medkits.values()) {
        if (!m.available) continue;
        DOM.minimapCtx.fillStyle = '#44ff88';
        DOM.minimapCtx.fillRect(mapX(m.x) - 2, mapY(m.z) - 2, 4, 4);
    }

    for (const r of world.remote.values()) {
        if (!r.alive) continue;
        DOM.minimapCtx.fillStyle = hexColor(r.color);
        DOM.minimapCtx.beginPath();
        DOM.minimapCtx.arc(mapX(r.mesh.position.x), mapY(r.mesh.position.z), 3.5, 0, Math.PI * 2);
        DOM.minimapCtx.fill();
    }

    if (world.alive) {
        const cx = mapX(world.position.x);
        const cy = mapY(world.position.z);
        const fx = -Math.sin(world.yaw);
        const fz = -Math.cos(world.yaw);
        DOM.minimapCtx.fillStyle = 'rgba(0,229,255,0.18)';
        DOM.minimapCtx.beginPath();
        DOM.minimapCtx.moveTo(cx, cy);
        const coneAng = Math.atan2(fz, fx);
        DOM.minimapCtx.arc(cx, cy, 22, coneAng - 0.6, coneAng + 0.6);
        DOM.minimapCtx.closePath();
        DOM.minimapCtx.fill();
        DOM.minimapCtx.fillStyle = '#ffffff';
        DOM.minimapCtx.beginPath();
        DOM.minimapCtx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        DOM.minimapCtx.fill();
        DOM.minimapCtx.strokeStyle = '#00e5ff';
        DOM.minimapCtx.lineWidth = 2;
        DOM.minimapCtx.beginPath();
        DOM.minimapCtx.moveTo(cx, cy);
        DOM.minimapCtx.lineTo(cx + fx * 10, cy + fz * 10);
        DOM.minimapCtx.stroke();
    }
}

/* ---------- волны (оборона) ---------- */
export function updateWaveHud() {
    const def = world.mode === 'defense';
    if (DOM.waveChip) DOM.waveChip.classList.toggle('hidden', !def);
    if (DOM.leaderChip) DOM.leaderChip.classList.toggle('hidden', def);
    if (DOM.pointsChip) DOM.pointsChip.classList.toggle('hidden', !def);
    if (DOM.pointsVal) DOM.pointsVal.textContent = String(world.points || 0);
    if (DOM.sbGlyphs) {
        DOM.sbGlyphs.textContent = def
            ? '● БЕГУН · ■ ГРОМИЛА · ◆ ВИЗГУН · ▲ ПЛЕВУН · ★ ТИТАН'
            : '◆ ПРИЗРАК · ■ ДЖАГГЕРНАУТ · ● ШТУРМОВИК';
    }
    if (!def) return;
    if (DOM.waveNum) DOM.waveNum.textContent = String(world.wave || 1);
    if (DOM.waveState) {
        if (world.wavePhase === 'active') {
            let alive = 0;
            const players = world.lastState || {};
            for (const p of Object.values(players)) {
                if (p.is_bot && !p.is_dead) alive++;
            }
            DOM.waveState.textContent = `ДЕМОНОВ: ${alive}`;
        } else if (world.wavePhase === 'break') {
            const left = Math.max(0, Math.ceil(world.breakUntil - performance.now() / 1000));
            DOM.waveState.textContent = `ПЕРЕРЫВ ${left}с · [B] МАГАЗИН`;
        } else if (world.wavePhase === 'defeat') {
            DOM.waveState.textContent = 'ПОРАЖЕНИЕ';
        } else {
            DOM.waveState.textContent = 'ПОДГОТОВКА';
        }
    }
}

/* ---------- магазин прокачки ---------- */
export const UPGRADE_DEFS = [
    { id: 'dmg',    costs: [100, 150, 225, 340, 500] },
    { id: 'mag',    costs: [80, 120, 180, 270, 400] },
    { id: 'reload', costs: [80, 120, 180, 270, 400] },
    { id: 'speed',  costs: [60, 90, 135, 200, 300] },
    { id: 'hp',     costs: [70, 105, 160, 240, 360] },
];
export const UPGRADE_MAX = 5;

export function buildShopPips() {
    for (const def of UPGRADE_DEFS) {
        const row = document.querySelector(`.shop-row[data-upg="${def.id}"]`);
        if (!row) continue;
        const pips = row.querySelector('.sr-pips');
        if (!pips) continue;
        pips.innerHTML = '';
        for (let i = 0; i < UPGRADE_MAX; i++) pips.appendChild(document.createElement('i'));
    }
}

export function updateShopUI() {
    if (DOM.shopPoints) DOM.shopPoints.textContent = String(world.points || 0);
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

export function toggleShop(force) {
    if (world.mode !== 'defense') return;
    const open = force !== undefined ? force : !world.shopOpen;
    if (open === world.shopOpen) return;
    world.shopOpen = open;
    if (DOM.shop) DOM.shop.classList.toggle('hidden', !open);
    if (open) {
        updateShopUI();
        if (document.pointerLockElement) document.exitPointerLock();
        AU.ui();
    } else if (G.running && !document.pointerLockElement) {
        try { G.renderer.domElement.requestPointerLock(); } catch (e) { void e; }
    }
}

export function buyUpgrade(id) {
    if (!world.shopOpen || world.mode !== 'defense') return;
    sendMsg({ type: 'upgrade', id });
}

export function showPointsPopup(amount) {
    if (!DOM.pointsPopup) return;
    const el = document.createElement('div');
    el.className = 'points-float';
    el.textContent = '+' + amount;
    DOM.pointsPopup.appendChild(el);
    setTimeout(() => el.remove(), 1050);
}

export function showDefeatOverlay() {
    if (DOM.defeatOverlay) DOM.defeatOverlay.classList.remove('hidden');
    if (world.shopOpen) toggleShop(false);
}

export function hideDefeatOverlay() {
    if (DOM.defeatOverlay) DOM.defeatOverlay.classList.add('hidden');
}

/* ---------- голо-табло в центре арены ---------- */
export let holoBoard = null;
let holoCtx = null;

export function buildHoloBoard() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    holoCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    holoBoard = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 7.5),
        new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0.92,
            side: THREE.DoubleSide, toneMapped: false, depthWrite: false,
        })
    );
    holoBoard.position.set(0, 17, 0);
    G.scene.add(holoBoard);
    drawHoloBoard(0, null);
}

export function drawHoloBoard(count, leader) {
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

/* ---------- ядерная бомба (награда за босса) ---------- */
let nukeDeadline = 0;
let nukeWired = false;

export function showNukeModal(seconds = 20) {
    const modal = $('nuke-modal');
    if (!modal) return;
    nukeDeadline = performance.now() / 1000 + seconds;
    modal.classList.remove('hidden');
    if (!nukeWired) {
        nukeWired = true;
        const useBtn = $('nuke-use');
        const denyBtn = $('nuke-deny');
        if (useBtn) useBtn.addEventListener('click', () => nukeUse());
        if (denyBtn) denyBtn.addEventListener('click', () => nukeDeny());
    }
    AU.nukeAlarm();
}

export function hideNukeModal() {
    const modal = $('nuke-modal');
    if (modal) modal.classList.add('hidden');
    nukeDeadline = 0;
}

export function nukeModalOpen() {
    const modal = $('nuke-modal');
    return modal ? !modal.classList.contains('hidden') : false;
}

export function nukeUse() {
    if (!nukeModalOpen()) return;
    sendMsg({ type: 'nuke_use' });
    hideNukeModal();
    AU.ui();
}

export function nukeDeny() {
    if (!nukeModalOpen()) return;
    sendMsg({ type: 'nuke_deny' });
    hideNukeModal();
    AU.ui();
}

function updateNukeTimer() {
    if (!nukeModalOpen()) return;
    const left = Math.max(0, Math.ceil(nukeDeadline - performance.now() / 1000));
    const el = $('nuke-timer');
    if (el) el.textContent = String(left);
    if (left <= 0) nukeDeny();
}
