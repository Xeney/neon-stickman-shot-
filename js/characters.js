import { THREE, CFG, G, world, clamp, hexColor, disposeObj, lerpAngle } from './core.js';
import { GUNMAT, mergeParts, createSimpleGun } from './weapons.js';

/* ============================================================
   ДЕМОНЫ (v2.0): merge по материалам — минимум draw call
   ============================================================ */
export const DEMON_VIS = {
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

export function createDemon(type) {
    const v = DEMON_VIS[type] || DEMON_VIS.runner;
    const M = demonMaterials(type);
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    g.add(inner);

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

    const head = new THREE.Group();
    head.position.set(0, 2.18, 0.12);
    const headParts = [
        { geo: new THREE.SphereGeometry(0.21, 12, 10), mat: M.skin, scale: [1, 0.9, 1.18] },
        { geo: new THREE.BoxGeometry(0.3, 0.07, 0.12), mat: M.skin, pos: [0, 0.06, 0.11] },
        { geo: new THREE.BoxGeometry(0.2, 0.05, 0.06), mat: M.skin, pos: [0, 0.1, 0.16] },
    ];
    head.add(mergeParts(headParts));

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

    const eyeParts = [];
    for (const sx of [-1, 1]) {
        eyeParts.push({ geo: new THREE.SphereGeometry(0.042, 8, 6), mat: M.eye, pos: [sx * 0.082, 0.02, 0.2] });
    }
    head.add(mergeParts(eyeParts));

    const jawU = new THREE.Group();
    jawU.add(mergeParts([
        { geo: new THREE.BoxGeometry(0.24, 0.075, 0.2), mat: M.skin, pos: [0, -0.05, 0.13] },
    ]));
    const jawUTeeth = [];
    for (let i = -2; i <= 2; i++) {
        jawUTeeth.push({ geo: new THREE.ConeGeometry(0.017, 0.065, 5), mat: M.bone, pos: [i * 0.048, -0.11, 0.21], rot: [Math.PI, 0, 0] });
    }
    jawU.add(mergeParts(jawUTeeth));
    head.add(jawU);

    const jawL = new THREE.Group();
    jawL.position.set(0, -0.09, 0.0);
    jawL.add(mergeParts([
        { geo: new THREE.BoxGeometry(0.2, 0.06, 0.19), mat: M.skin, pos: [0, -0.03, 0.11] },
    ]));
    const jawLTeeth = [];
    for (let i = -2; i <= 2; i++) {
        jawLTeeth.push({ geo: new THREE.ConeGeometry(0.016, 0.06, 5), mat: M.bone, pos: [i * 0.042, 0.02, 0.19] });
    }
    jawL.add(mergeParts(jawLTeeth));
    head.add(jawL);
    inner.add(head);

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

/* ============================================================
   ЧЕЛОВЕК v2.1: реалистичный риг с коленями и локтями
   (перед модели = -Z, как ждут серверные ry)
   ============================================================ */
export const HUMAN_CLS = {
    ghost: { bulk: 0.96, armor: 0x1d2836, suit: 0x0e141c, dark: 0x0a0e14, metal: 0.5, accentInt: 1.15 },
    jugg:  { bulk: 1.14, armor: 0x33302c, suit: 0x1c1a17, dark: 0x120f0d, metal: 0.35, accentInt: 0.85 },
    storm: { bulk: 1.0,  armor: 0x252e3c, suit: 0x151a22, dark: 0x0d1016, metal: 0.45, accentInt: 1.0 },
    hunter:{ bulk: 1.0,  armor: 0x252e3c, suit: 0x151a22, dark: 0x0d1016, metal: 0.45, accentInt: 1.0 },
    boss:  { bulk: 1.32, armor: 0x30161a, suit: 0x160a0d, dark: 0x0b0506, metal: 0.5,  accentInt: 1.3 },
};

function humanMaterials(color, cls) {
    const c = HUMAN_CLS[cls] || HUMAN_CLS.storm;
    return {
        armor: new THREE.MeshStandardMaterial({
            color: c.armor, roughness: 0.5, metalness: c.metal,
            emissive: new THREE.Color(color).multiplyScalar(0.06),
        }),
        suit: new THREE.MeshStandardMaterial({ color: c.suit, roughness: 0.85, metalness: 0.15 }),
        dark: new THREE.MeshStandardMaterial({ color: c.dark, roughness: 0.6, metalness: 0.5 }),
        glow: new THREE.MeshBasicMaterial({ color, toneMapped: false }),
        skin: new THREE.MeshStandardMaterial({ color: 0x9c7a63, roughness: 0.75, metalness: 0.0 }),
    };
}

export function createHuman(color, cls, weaponId) {
    const c = HUMAN_CLS[cls] || HUMAN_CLS.storm;
    const M = humanMaterials(color, cls);
    const B = c.bulk;
    const g = new THREE.Group();

    /* --- ноги: бедро -> колено -> голень+ботинок --- */
    const legs = [];
    for (const sx of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 0.115, 0.98, 0);
        hip.add(mergeParts([
            { geo: new THREE.CylinderGeometry(0.088 * B, 0.072 * B, 0.46, 8), mat: M.suit, pos: [0, -0.23, 0] },
            { geo: new THREE.SphereGeometry(0.075 * B, 8, 6), mat: M.armor, pos: [0, -0.45, 0] },
        ]));
        const knee = new THREE.Group();
        knee.position.y = -0.46;
        knee.add(mergeParts([
            { geo: new THREE.CylinderGeometry(0.066 * B, 0.052 * B, 0.4, 8), mat: M.suit, pos: [0, -0.2, 0.01] },
            { geo: new THREE.BoxGeometry(0.13 * B, 0.05, 0.16), mat: M.armor, pos: [0, -0.3, -0.03] },
            { geo: new THREE.BoxGeometry(0.135 * B, 0.095, 0.28), mat: M.dark, pos: [0, -0.44, -0.05] },
            { geo: new THREE.BoxGeometry(0.13 * B, 0.04, 0.1), mat: M.armor, pos: [0, -0.42, 0.09] },
        ]));
        hip.add(knee);
        g.add(hip);
        legs.push({ hip, knee });
    }

    /* --- верх: торс + голова + руки + оружие (группа прицеливания) --- */
    const upper = new THREE.Group();
    upper.position.y = 1.0;
    g.add(upper);

    upper.add(mergeParts([
        { geo: new THREE.CylinderGeometry(0.2 * B, 0.17 * B, 0.48, 10), mat: M.suit, pos: [0, 0.24, 0] },
        { geo: new THREE.BoxGeometry(0.42 * B, 0.38, 0.28), mat: M.armor, pos: [0, 0.34, 0] },
        { geo: new THREE.BoxGeometry(0.34 * B, 0.12, 0.3), mat: M.dark, pos: [0, 0.12, 0] },
        { geo: new THREE.BoxGeometry(0.3, 0.36, 0.14), mat: M.dark, pos: [0, 0.32, 0.2] },
        { geo: new THREE.BoxGeometry(0.24, 0.3, 0.08), mat: M.suit, pos: [0, 0.3, 0.27] },
        { geo: new THREE.SphereGeometry(0.1 * B, 8, 6), mat: M.armor, pos: [-0.26 * B, 0.5, 0] },
        { geo: new THREE.SphereGeometry(0.1 * B, 8, 6), mat: M.armor, pos: [0.26 * B, 0.5, 0] },
        { geo: new THREE.CylinderGeometry(0.07, 0.075, 0.1, 8), mat: M.skin, pos: [0, 0.58, -0.01] },
        { geo: new THREE.BoxGeometry(0.2, 0.14, 0.06), mat: M.armor, pos: [0, 0.26, -0.15] },
    ]));
    upper.add(mergeParts([
        { geo: new THREE.BoxGeometry(0.4 * B, 0.045, 0.29), mat: M.glow, pos: [0, 0.46, 0] },
        { geo: new THREE.BoxGeometry(0.16, 0.03, 0.02), mat: M.glow, pos: [0, 0.32, 0.35] },
    ]));

    /* голова: череп + шлем + визор + подбородок */
    const head = new THREE.Group();
    head.position.set(0, 0.68, 0);
    head.add(mergeParts([
        { geo: new THREE.SphereGeometry(0.135, 12, 10), mat: M.skin, pos: [0, 0.02, -0.01], scale: [1, 1.05, 1.05] },
        { geo: new THREE.SphereGeometry(0.155, 12, 10), mat: M.armor, pos: [0, 0.055, 0.005], scale: [1, 0.92, 1.02] },
        { geo: new THREE.BoxGeometry(0.24, 0.05, 0.06), mat: M.armor, pos: [0, 0.015, -0.12] },
        { geo: new THREE.BoxGeometry(0.18, 0.06, 0.05), mat: M.skin, pos: [0, -0.075, -0.1] },
        { geo: new THREE.BoxGeometry(0.08, 0.09, 0.05), mat: M.dark, pos: [-0.12, 0.03, 0.0] },
        { geo: new THREE.BoxGeometry(0.08, 0.09, 0.05), mat: M.dark, pos: [0.12, 0.03, 0.0] },
    ]));
    head.add(mergeParts([
        { geo: new THREE.BoxGeometry(0.21, 0.05, 0.02), mat: M.glow, pos: [0, 0.015, -0.145] },
        { geo: new THREE.BoxGeometry(0.03, 0.03, 0.02), mat: M.glow, pos: [0.13, 0.075, -0.09], rot: [0, 0.5, 0] },
    ]));
    upper.add(head);

    /* руки: плечо -> локоть -> предплечье+кисть (держат оружие) */
    const baseArmRotX = -1.12;
    const arms = [];
    for (const sx of [-1, 1]) {
        const shoulder = new THREE.Group();
        shoulder.position.set(sx * 0.24 * B, 0.5, 0);
        shoulder.add(mergeParts([
            { geo: new THREE.CylinderGeometry(0.055 * B, 0.048 * B, 0.3, 8), mat: M.suit, pos: [0, -0.15, 0] },
            { geo: new THREE.BoxGeometry(0.1, 0.09, 0.11), mat: M.armor, pos: [0, -0.05, 0] },
        ]));
        const elbow = new THREE.Group();
        elbow.position.y = -0.3;
        elbow.add(mergeParts([
            { geo: new THREE.SphereGeometry(0.052, 8, 6), mat: M.armor, pos: [0, 0, 0] },
            { geo: new THREE.CylinderGeometry(0.048 * B, 0.042 * B, 0.28, 8), mat: M.suit, pos: [0, -0.14, 0] },
            { geo: new THREE.BoxGeometry(0.085, 0.09, 0.11), mat: M.dark, pos: [0, -0.3, -0.02] },
        ]));
        shoulder.add(elbow);
        shoulder.rotation.x = baseArmRotX;
        elbow.rotation.x = -0.42;
        upper.add(shoulder);
        arms.push({ shoulder, elbow });
    }

    /* оружие в руках (упрощённая модель) */
    const gunMount = new THREE.Group();
    gunMount.position.set(0, 0.36, -0.2);
    gunMount.rotation.x = 0.1;
    const gun = createSimpleGun(weaponId || 'rifle');
    gun.position.set(0, 0, -0.05);
    if (cls === 'boss') gun.scale.setScalar(1.3);
    gunMount.add(gun);
    upper.add(gunMount);

    if (cls === 'boss') {
        g.scale.setScalar(1.45);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff1512, toneMapped: false });
        const chestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.3), glowMat);
        chestGlow.position.set(0, 0.34, -0.15);
        upper.add(chestGlow);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.02), glowMat);
        eye.position.set(0, 0.015, -0.15);
        head.add(eye);
    }

    g.userData = {
        kind: 'human', cls: cls || 'storm',
        legs, arms, upper, head, gunMount,
        baseArmRotX, upperBaseY: 1.0, walkPhase: 0,
        label: null,
    };
    return g;
}

/* ============================================================
   Ник над головой
   ============================================================ */
export function makeNameLabel(text, color) {
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
   Удалённые игроки: добавление / удаление / анимация
   ============================================================ */
export function addRemotePlayer(id, p) {
    const isDemon = !!p.is_demon;
    const mesh = isDemon
        ? createDemon(p.dt || 'runner')
        : createHuman(p.color, p.cls || 'hunter', p.weapon || 'rifle');
    mesh.position.set(p.x, p.y || 0, p.z);
    mesh.rotation.y = p.ry || 0;
    let label = null;
    if (p.name) {
        label = makeNameLabel(p.name, p.color);
        const isBoss = !isDemon && (p.cls === 'boss');
        label.position.y = isDemon ? 2.75 * (DEMON_VIS[p.dt] ? DEMON_VIS[p.dt].scale : 1) + 0.25
                                   : (isBoss ? 3.2 : 2.1);
        if (isDemon) label.scale.set(3.1, 0.78, 1);
        if (isBoss) label.scale.set(4.6, 1.15, 1);
        mesh.add(label);
        mesh.userData.label = label;
    }
    const heavyCrowd = world.remote.size >= 10;
    if (heavyCrowd) {
        mesh.traverse(o => { o.castShadow = false; });
    }
    G.scene.add(mesh);
    const isDead = !!p.is_dead;
    mesh.visible = !isDead;
    world.remote.set(id, {
        mesh, color: p.color, name: p.name,
        kind: isDemon ? 'demon' : 'human',
        cls: p.cls || 'hunter',
        isDemon,
        dt: p.dt || '',
        weapon: p.weapon || 'rifle',
        targetPos: new THREE.Vector3(p.x, p.y || 0, p.z),
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

export function removeRemotePlayer(id) {
    const r = world.remote.get(id);
    if (!r) return;
    G.scene.remove(r.mesh);
    disposeObj(r.mesh);
    world.remote.delete(id);
}

export function updateRemotePlayers(dt) {
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
            updateHumanAnim(r, ud, dt, moving, t);
        }
    }
}

/* ============================================================
   Анимация человека: двусочленённые конечности, прицел, флинч
   ============================================================ */
function updateHumanAnim(r, ud, dt, moving, t) {
    ud.walkPhase = ud.walkPhase || 0;
    if (moving) ud.walkPhase += dt * 10.5;
    else ud.walkPhase += dt * 1.7;
    const ph = ud.walkPhase;
    const amp = moving ? 1 : 0.06;

    if (ud.legs) {
        for (let i = 0; i < 2; i++) {
            const s = i === 0 ? 1 : -1;
            const p = ph + (i === 1 ? Math.PI : 0);
            const { hip, knee } = ud.legs[i];
            hip.rotation.x = Math.sin(p) * 0.62 * amp;
            knee.rotation.x = (Math.max(0, Math.sin(p + 2.4)) * 0.85 + 0.1) * amp + 0.06;
            hip.rotation.z = s * 0.02;
        }
    }

    const aim = clamp(-r.targetRx, -0.9, 0.9);
    let upperX = aim;
    let upperZ = 0;
    let headX = 0;
    let headZ = 0;

    const anim = r.anim || '';
    if (anim === 'hit') {
        const k = Math.sin(Math.min(1, (r.animUntil - t) / 0.35) * Math.PI);
        upperX += -0.28 * k;
        headX = -0.35 * k;
        headZ = Math.sin(t * 30) * 0.08 * k;
    } else if (anim === 'shoot') {
        upperX += Math.sin(t * 34) * 0.012;
    }

    if (ud.upper) {
        ud.upper.rotation.x = upperX;
        ud.upper.rotation.z = upperZ + Math.sin(ph) * 0.028 * amp;
        ud.upper.position.y = (ud.upperBaseY || 1.0) + Math.abs(Math.sin(ph * 2)) * 0.028 * amp
            + Math.sin(t * 1.7 + (r.twitchSeed || 0)) * 0.006;
    }
    if (ud.head) {
        headX += Math.sin(t * 1.3 + (r.twitchSeed || 0)) * 0.02;
        ud.head.rotation.x = headX;
        ud.head.rotation.z = headZ + Math.sin(t * 0.9 + (r.twitchSeed || 0)) * 0.015;
        ud.head.rotation.y = Math.sin(t * 0.6 + (r.twitchSeed || 0)) * 0.08;
    }
    if (ud.arms) {
        const sway = Math.sin(ph) * 0.05 * amp;
        ud.arms[0].shoulder.rotation.x = ud.baseArmRotX + sway;
        ud.arms[1].shoulder.rotation.x = ud.baseArmRotX - sway;
        ud.arms[0].elbow.rotation.x = -0.42 + Math.sin(ph + 0.5) * 0.03 * amp;
        ud.arms[1].elbow.rotation.x = -0.42 - Math.sin(ph + 0.5) * 0.03 * amp;
    }
}

/* ============================================================
   Анимация демона (v2.0: атаки, слэм, визг, плевок)
   ============================================================ */
function updateDemonAnim(r, ud, dt, moving, t) {
    const m = r.mesh;
    ud.walkPhase = ud.walkPhase || 0;
    const seed = r.twitchSeed || 0;

    if (moving) ud.walkPhase += dt * 8.2;
    else ud.walkPhase += dt * 2.1;
    const ph = ud.walkPhase;
    const lurch = Math.sin(ph);
    const lurch2 = Math.sin(ph + Math.PI * 0.85);

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
        const k = Math.sin(Math.min(1, (r.animUntil - t) / 0.55) * Math.PI);
        armR = -1.9 * k + ud.baseArmRotX * (1 - k);
        armL = ud.baseArmRotX - 0.4 * k;
        jawOpen = 0.55 * k + 0.14;
        headX = -0.25 * k;
        m.position.y += 0.05 * k;
    } else if (anim === 'slam') {
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
