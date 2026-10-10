import { THREE, CFG, G, world, keys, clamp, hexColor, DOM, $, addBoxCollider,
         buildColliderGrid, collidersNear, collidersInBox, rayAABB, flashes,
         effMag, effReloadTime, speedMult, WEAPON_CLASS_LABEL, weaponModeLabel } from './js/core.js';
import { AU, Music } from './js/audio.js';
import { spawnTracerLimited, updateEffects, updateSmokes, updateMedkits, updatePickups,
         updateGrenadeMeshes, updateAcid, updateNameLabels, updateFlashScreen } from './js/effects.js';
import { buildWeaponModel, updateViewmodel, inspectWeapon, initShowcase,
         setShowcaseWeapon, updateShowcase } from './js/weapons.js';
import { updateRemotePlayers } from './js/characters.js';
import { buildDecor, updateDecor } from './js/decor.js';
import { buildSky, updateSky, setNightMode } from './js/sky.js';
import { buildMinimapBg, drawMinimap, updateHUD, renderScoreboard, updateDamageIndicator,
         buildHoloBoard, drawHoloBoard, holoBoard, updateGrenadeHud, flashChip,
         buildAmmoPips, toggleShop, buyUpgrade, UPGRADE_DEFS,
         nukeModalOpen, nukeUse, nukeDeny, voteOpen, castVote } from './js/hud.js';
import { connect, sendMsg, sendState, setJoinWeapon, ws } from './js/net.js';
import { loadSettings, initSettingsUI, applyGraphics, GFX,
         openSettings, closeSettings, settingsOpen } from './js/settings.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
   NEON STICKMAN SHOT v2.1 «ЖИВОЙ МИР» — точка входа
   (модули: core, audio, effects, weapons, characters, decor,
    sky, hud, net)
   ============================================================ */

let selectedWeapon = 'pistol';
let mouseLeftDown = false;
let mouseRightDown = false;

/* ============================================================
   THREE BOOTSTRAP + BLOOM
   ============================================================ */
function initThree() {
    const container = DOM.gameContainer;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.autoClear = false;
    container.appendChild(renderer.domElement);
    G.renderer = renderer;

    const scene = new THREE.Scene();
    G.scene = scene;
    const defense = world.mode === 'defense';
    if (defense) {
        scene.background = new THREE.Color(0x0a0508);
        scene.fog = new THREE.FogExp2(0x14060a, 0.006);
    } else {
        scene.background = new THREE.Color(0x9ec8ee);
        scene.fog = new THREE.FogExp2(0xbcd6ee, 0.0011);
    }

    const camera = new THREE.PerspectiveCamera(CFG.CAM_FOV, innerWidth / innerHeight, 0.08, 2500);
    camera.rotation.order = 'YXZ';
    G.camera = camera;

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

    let sun;
    if (defense) {
        const amb = new THREE.AmbientLight(0x664455, 0.72);
        const hemi = new THREE.HemisphereLight(0x442233, 0x14080c, 0.65);
        scene.add(amb, hemi);
        G.ambient = amb;
        G.hemi = hemi;
        sun = new THREE.DirectionalLight(0xdd9999, 0.7);
        sun.position.set(-120, 220, -80);
    } else {
        const amb = new THREE.AmbientLight(0xbcd4ee, 0.9);
        const hemi = new THREE.HemisphereLight(0xfff4e0, 0x556677, 1.0);
        scene.add(amb, hemi);
        G.ambient = amb;
        G.hemi = hemi;
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
    G.sun = sun;

    const viewScene = new THREE.Scene();
    G.viewScene = viewScene;
    if (world._envTex) viewScene.environment = world._envTex;
    const viewCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    G.viewCamera = viewCamera;
    viewScene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const vSun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    vSun.position.set(0.7, 1.0, 0.6);
    viewScene.add(vSun);
    const vFill = new THREE.DirectionalLight(0x88aaff, 0.55);
    vFill.position.set(-0.5, 0.3, -0.8);
    viewScene.add(vFill);

    const weaponHolder = new THREE.Group();
    weaponHolder.position.copy(CFG.VM_HIP);
    viewScene.add(weaponHolder);
    G.weaponHolder = weaponHolder;

    buildWeaponModel(selectedWeapon);
    buildMap();

    /* bloom-постобработка */
    try {
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.55, 0.82);
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());
        G.composer = composer;
        G.bloomPass = bloomPass;
        G.bloomEnabled = true;
    } catch (e) {
        console.warn('[BLOOM] disabled:', e);
        G.composer = null;
        G.bloomEnabled = false;
    }

    G.clock = new THREE.Clock();
    addEventListener('resize', onResize);
}

function onResize() {
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    G.viewCamera.aspect = innerWidth / innerHeight;
    G.viewCamera.updateProjectionMatrix();
    G.renderer.setSize(innerWidth, innerHeight);
    if (G.composer) G.composer.setSize(innerWidth, innerHeight);
    if (G.bloomPass) G.bloomPass.setSize(innerWidth, innerHeight);
}

/* ============================================================
   КАРТА — идентична server.py build_wall_list()
   ============================================================ */
function buildWallList(mode) {
    if (mode === 'defense') return buildWallListDefense();
    return buildWallListFFA();
}

function buildWallListDefense() {
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
    const walls = [];
    const A = CFG.ARENA_HALF, T = 3.0;
    walls.push({ x: 0, z: A, hw: A, hd: T / 2, h: 16, kind: 'outer' });
    walls.push({ x: 0, z: -A, hw: A, hd: T / 2, h: 16, kind: 'outer' });
    walls.push({ x: A, z: 0, hw: T / 2, hd: A, h: 16, kind: 'outer' });
    walls.push({ x: -A, z: 0, hw: T / 2, hd: A, h: 16, kind: 'outer' });

    for (const sgn of [-1, 1]) {
        const ring = [
            [sgn * 172, -102.5, 1.25, 57.5], [sgn * 172, 102.5, 1.25, 57.5],
            [-102.5, sgn * 172, 57.5, 1.25], [102.5, sgn * 172, 57.5, 1.25],
        ];
        for (const [x, z, hw, hd] of ring) {
            walls.push({ x, z, hw, hd, h: 10, kind: 'bwall' });
        }
    }

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

function buildMap() {
    const scene = G.scene;
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

    buildDecor(defense);
    buildSky();
    setNightMode(defense);
}

function addDefenseDecor() {
    const scene = G.scene;
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
    const scene = G.scene;
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
    const scene = G.scene;
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
    t.anisotropy = G.renderer.capabilities.getMaxAnisotropy();
    return t;
}

function addAsphaltDecor() {
    const scene = G.scene;
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
    t.anisotropy = G.renderer.capabilities.getMaxAnisotropy();
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(CFG.ARENA_HALF * 2, CFG.ARENA_HALF * 2),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.02;
    scene.add(plane);
}

function addZoneRings() {
    const scene = G.scene;
    const spots = [[35, 0], [-35, 0], [0, 35], [0, -35],
                   [110, 0], [-110, 0], [0, 110], [0, -110]];
    for (const [x, z] of spots) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(11, 12.2, 40),
            new THREE.MeshBasicMaterial({
                color: 0x00c8ff, transparent: true, opacity: 0.28,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
                depthWrite: false, toneMapped: false,
            })
        );
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
    const scene = G.scene;
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

/* ============================================================
   ВВОД
   ============================================================ */
function initInput() {
    addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (!Music.started && !Music.muted) Music.start();

        /* ядерная бомба: ПРОБЕЛ — сбросить, O — отказаться */
        if (nukeModalOpen()) {
            if (k === ' ') {
                e.preventDefault();
                nukeUse();
                return;
            }
            if (k === 'o' || k === 'escape') {
                nukeDeny();
                return;
            }
        }
        if (k === 'escape') {
            if (settingsOpen()) {
                closeSettings();
                return;
            }
            if (pauseOpen()) {
                closePause();
                return;
            }
            if (world.shopOpen) {
                toggleShop(false);
                return;
            }
            if (G.running) {
                openPause();
                return;
            }
        }
        if (pauseOpen() || settingsOpen()) return;

        /* голосование за режим: 1 — с демонами, 2 — с ботами */
        if (voteOpen()) {
            if (k === '1') { castVote('defense'); return; }
            if (k === '2') { castVote('ffa'); return; }
        }

        if (k === 'tab') {
            e.preventDefault();
            if (G.running) {
                G.scoreboardVisible = true;
                if (DOM.scoreboard) DOM.scoreboard.classList.remove('hidden');
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
            G.scoreboardVisible = false;
            if (DOM.scoreboard) DOM.scoreboard.classList.add('hidden');
        }
        keys[k] = false;
    });
    addEventListener('blur', () => {
        for (const k in keys) keys[k] = false;
        mouseLeftDown = mouseRightDown = false;
        G.scoreboardVisible = false;
        if (DOM.scoreboard) DOM.scoreboard.classList.add('hidden');
    });
    addEventListener('mousemove', (e) => {
        if (!G.running || !G.pointerLocked) return;
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
        if (!G.running) return;
        if (e.button === 0) { mouseLeftDown = true; if (world.alive) tryShoot(); }
        else if (e.button === 2) mouseRightDown = true;
    });
    addEventListener('mouseup', (e) => {
        if (e.button === 0) mouseLeftDown = false;
        else if (e.button === 2) mouseRightDown = false;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
        G.pointerLocked = document.pointerLockElement === G.renderer.domElement;
        if (!G.pointerLocked && G.running && world.alive && !world.shopOpen
                && !pauseOpen() && !settingsOpen() && !nukeModalOpen()) {
            openPause();
        }
    });
}

/* ============================================================
   СМЕНА РЕЖИМА (ротация): свет, небо, туман
   ============================================================ */
export function applyModeVisuals(mode) {
    const defense = mode === 'defense';
    const scene = G.scene;
    if (scene) {
        if (scene.background && scene.background.setHex) {
            scene.background.setHex(defense ? 0x0a0508 : 0x9ec8ee);
        }
        if (scene.fog) {
            scene.fog.color.setHex(defense ? 0x14060a : 0xbcd6ee);
            scene.fog.density = defense ? 0.004 : 0.0011;
        }
    }
    if (G.ambient) {
        G.ambient.color.setHex(defense ? 0x664455 : 0xbcd4ee);
        G.ambient.intensity = defense ? 0.72 : 0.9;
    }
    if (G.hemi) {
        G.hemi.color.setHex(defense ? 0x442233 : 0xfff4e0);
        G.hemi.groundColor.setHex(defense ? 0x14080c : 0x556677);
        G.hemi.intensity = defense ? 0.65 : 1.0;
    }
    if (G.sun) {
        G.sun.color.setHex(defense ? 0xdd9999 : 0xfff2d8);
        G.sun.intensity = defense ? 0.7 : 1.6;
    }
    setNightMode(defense);
}

/* ============================================================
   ПАУЗА
   ============================================================ */
export function pauseOpen() {
    const el = $('pause');
    return el ? !el.classList.contains('hidden') : false;
}

export function openPause() {
    const el = $('pause');
    if (!el || pauseOpen()) return;
    el.classList.remove('hidden');
    mouseLeftDown = false;
    mouseRightDown = false;
    world.ads = false;
    if (document.pointerLockElement) document.exitPointerLock();
    AU.ui();
}

export function closePause() {
    const el = $('pause');
    if (!el) return;
    el.classList.add('hidden');
    if (G.running && world.alive && !document.pointerLockElement) {
        try { G.renderer.domElement.requestPointerLock(); } catch (e) { void e; }
    }
    AU.ui();
}

function exitToMenu() {
    closePause();
    if (settingsOpen()) closeSettings();
    if (ws) {
        try { ws.close(1000, 'menu'); } catch (e) { void e; }
    }
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
    } else if (k === 'i') {
        if (world.alive) inspectWeapon();
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
    if (DOM.weaponName) DOM.weaponName.textContent = CFG.WEAPONS[id].name;
    if (DOM.weaponClass) DOM.weaponClass.textContent = WEAPON_CLASS_LABEL[id] || '';
    if (DOM.weaponMode) DOM.weaponMode.textContent = weaponModeLabel(id);
    sendMsg({ type: 'weapon', weapon: id });
    if (DOM.crosshair) DOM.crosshair.classList.toggle('ads', world.ads);
}

/* ============================================================
   СТРЕЛЬБА + ПЕРЕЗАРЯДКА
   ============================================================ */
export function startReload() {
    if (!world.alive || world.reloadLeft > 0 || world.ammo >= effMag()) return;
    if (world.reserve <= 0) { AU.dry(0); return; }
    world.reloadTotal = effReloadTime();
    world.reloadLeft = world.reloadTotal;
    sendMsg({ type: 'reload' });
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
    G.scene.add(flashLight);
    setTimeout(() => G.scene.remove(flashLight), 50);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xffee99, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(origin);
    sprite.scale.set(0.5, 0.5, 0.5);
    G.scene.add(sprite);
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
    G.camera.rotation.x += kick * 0.5;
    world.shake = Math.min(0.35, world.shake + kick * 0.8);

    const shots = wp.burst ? 3 : 1;
    const vpellets = wp.visualPellets || 1;
    for (let s = 0; s < shots; s++) {
        const delay = s * 70;
        setTimeout(() => {
            if (!G.running || !world.alive) return;
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

    sendMsg({ type: 'shoot', rx: world.pitch, ry: world.yaw, ping: world.ping });
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
    sendMsg({ type: 'grenade', rx: world.pitch, ry: world.yaw, kind });
}

function tryMedkit(m) {
    if (!m || !m.available) return;
    sendMsg({ type: 'pickup_medkit', id: m.id });
}

/* ============================================================
   ДВИЖЕНИЕ
   ============================================================ */
function resolveAABBs(pos, radius) {
    /* 4 прохода: в углах и на пересечениях укрытий (крестовины, парные ящики)
       одного прохода мало — игрок клинился между двумя коллайдерами */
    for (let pass = 0; pass < 4; pass++) {
        let pushed = false;
        for (const c of collidersNear(pos.x, pos.z, radius + 1.0)) {
            const closestX = clamp(pos.x, c.x - c.hw, c.x + c.hw);
            const closestZ = clamp(pos.z, c.z - c.hd, c.z + c.hd);
            const dx = pos.x - closestX;
            const dz = pos.z - closestZ;
            const d2 = dx * dx + dz * dz;
            if (d2 < radius * radius) {
                pushed = true;
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
        if (!pushed) break;
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
        if (DOM.respawnCounter) DOM.respawnCounter.textContent = Math.max(0, world.respawnTimer).toFixed(1);
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
    const accel = CFG.ACCEL * dt * (world.grounded ? 1 : 0.35);
    world.velocity.x += clamp(targetVX - world.velocity.x, -accel, accel);
    world.velocity.z += clamp(targetVZ - world.velocity.z, -accel, accel);

    if (ilen < 0.001 && world.grounded) {
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

    /* прыжок и гравитация */
    if (world.grounded && keys[' ']) {
        world.velY = CFG.JUMP_V;
        world.grounded = false;
        AU.jump();
    }
    world.velY -= CFG.GRAVITY * dt;
    world.position.y += world.velY * dt;
    if (world.position.y <= 0) {
        if (!world.grounded && world.velY < -3.5) {
            world.shake = Math.min(0.3, world.shake + Math.min(0.12, -world.velY * 0.015));
            AU.land(Math.min(0.22, -world.velY * 0.03));
        }
        world.position.y = 0;
        world.velY = 0;
        world.grounded = true;
    } else {
        world.grounded = false;
    }

    const speedMag = Math.hypot(world.velocity.x, world.velocity.z);
    if (speedMag > 2.5 && G.pointerLocked && world.grounded) {
        const phase = Math.floor(world.bobPhase / Math.PI);
        if (phase !== world.lastStepPhase) {
            world.lastStepPhase = phase;
            AU.step(0, world.crouch ? 0.05 : (world.sprint ? 0.14 : 0.09));
        }
    }

    const targetFov = world.ads ? CFG.ADS_FOV[world.weapon] : CFG.CAM_FOV + (world.sprint ? 4 : 0);
    G.camera.fov += (targetFov - G.camera.fov) * Math.min(1, dt * 12);
    G.camera.updateProjectionMatrix();

    world.nearbyMedkit = null;
    let bestD = 2.5;
    for (const m of world.medkits.values()) {
        if (!m.available) continue;
        const d = Math.hypot(world.position.x - m.x, world.position.z - m.z);
        if (d < bestD) { bestD = d; world.nearbyMedkit = m; }
    }
    if (DOM.medkitPrompt) DOM.medkitPrompt.classList.toggle('active', !!world.nearbyMedkit);

    if (world.pickupCooldown <= 0 && world.pickups.size > 0) {
        for (const pk of world.pickups.values()) {
            const dx = world.position.x - pk.x;
            const dz = world.position.z - pk.z;
            if (dx * dx + dz * dz < 2.6) {
                world.pickupCooldown = 1.0;
                sendMsg({ type: 'pickup_ammo', id: pk.id });
                break;
            }
        }
    }
}

/* ============================================================
   КАМЕРА
   ============================================================ */
export function updateCamera(dt) {
    const camera = G.camera;
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
    if (speedMag > 0.5 && world.grounded) {
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

    if (G.sun) {
        G.sun.position.set(world.position.x + 140, 260, world.position.z + 90);
        G.sun.target.position.set(world.position.x, 0, world.position.z);
        G.sun.target.updateMatrixWorld();
    }

    const adsTarget = (world.ads && !world.crouch) ? 1 : 0;
    world.adsProgress += (adsTarget - world.adsProgress) * Math.min(1, dt / CFG.ADS_TIME);

    updateViewmodel(dt, speedMag);
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
   ЦИКЛ РЕНДЕРА
   ============================================================ */
let holoAccumulator = 0;
let fpsFrames = 0;
let fpsTime = 0;
let bloomFrames = 0;
let bloomTime = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(G.clock.getDelta(), 0.05);

    if (G.running) {
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

        G.sendAccumulator += dt;
        if (G.sendAccumulator >= CFG.SEND_INTERVAL) {
            G.sendAccumulator = 0;
            sendState();
        }
        G.hudAccumulator += dt;
        if (G.hudAccumulator >= 1 / 20) {
            G.hudAccumulator = 0;
            updateHUD();
        }
        G.minimapAccumulator += dt;
        if (G.minimapAccumulator >= 1 / 20) {
            G.minimapAccumulator = 0;
            drawMinimap();
        }
        G.pingAccumulator += dt;
        if (G.pingAccumulator >= 2.0) {
            G.pingAccumulator = 0;
            sendMsg({ type: 'ping', t: performance.now() });
        }
        if (G.scoreboardVisible) {
            G.scoreboardAccumulator += dt;
            if (G.scoreboardAccumulator >= 0.3) {
                G.scoreboardAccumulator = 0;
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
            if (DOM.leaderName) DOM.leaderName.textContent = leader ? (leader.name || '—') : '—';
            if (DOM.leaderKills) DOM.leaderKills.textContent = String(leader ? (leader.kills || 0) : 0);
        }

        fpsFrames++;
        fpsTime += dt;
        if (fpsTime >= 0.5) {
            const fps = Math.round(fpsFrames / fpsTime);
            if (DOM.fpsVal) DOM.fpsVal.textContent = String(fps);
            fpsFrames = 0;
            fpsTime = 0;

            /* авто-деградация bloom на слабых ПК */
            if (G.bloomEnabled) {
                bloomTime += 0.5;
                bloomFrames += fps;
                if (bloomTime >= 5) {
                    const avg = bloomFrames / (bloomTime / 0.5);
                    if (avg < 35) {
                        GFX.bloomAutoOff = true;
                        applyGraphics();
                        console.log('[BLOOM] отключён (низкий FPS:', Math.round(avg), ')');
                    }
                    bloomTime = 0;
                    bloomFrames = 0;
                }
            }
        }

        if (world.mode === 'defense') {
            const nowS = performance.now() * 0.001;
            let nearest = 1e9;
            for (const r of world.remote.values()) {
                if (r.kind === 'demon' && r.alive) {
                    nearest = Math.min(nearest, r.mesh.position.distanceTo(G.camera.position));
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
        const t = G.clock.getElapsedTime() * 0.12;
        G.camera.position.set(Math.sin(t) * 90, 35, Math.cos(t) * 90);
        G.camera.lookAt(0, 3, 0);
    }

    if (holoBoard) holoBoard.rotation.y = Math.sin(G.clock.getElapsedTime() * 0.25) * 0.5;

    updateShowcase(dt);
    updateDecor(dt);
    updateSky(dt);

    if (G.bloomEnabled && G.composer) {
        G.composer.render();
        G.renderer.clearDepth();
        G.renderer.render(G.viewScene, G.viewCamera);
    } else {
        G.renderer.clear();
        G.renderer.render(G.scene, G.camera);
        G.renderer.clearDepth();
        G.renderer.render(G.viewScene, G.viewCamera);
    }
}

function updateADS() {
    world.ads = mouseRightDown && !world.sprint;
}

/* ============================================================
   МЕНЮ
   ============================================================ */
function updateLoadoutFromCard(card) {
    if (!card) return;
    const h3 = card.querySelector('h3');
    if (DOM.loadoutName && h3) DOM.loadoutName.textContent = h3.textContent;
    if (DOM.loadoutAbility) DOM.loadoutAbility.textContent = card.dataset.ability || '';
    const bars = card.querySelectorAll('.mini-bar i');
    const targets = [DOM.lsDmg, DOM.lsRate, DOM.lsRange];
    const vals = [DOM.lsDmgVal, DOM.lsRateVal, DOM.lsRangeVal];
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
        } else if (kind === 'sniper') {
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
        let rotation = true;
        try {
            const r = await fetch('config.json', { cache: 'no-store' });
            if (r.ok) {
                const cfg = await r.json();
                if (cfg && cfg.mode) mode = String(cfg.mode).toLowerCase();
                if (cfg && cfg.rotation && cfg.rotation.enabled === false) rotation = false;
            }
        } catch (e) {
            console.warn('[CONFIG] fetch failed, ffa по умолчанию:', e);
        }
        world.rotation = rotation;
        /* при ротации карта всегда «Мегаполис» (FFA), режим меняется на лету */
        world.mode = rotation ? 'ffa' : ((mode === 'defense') ? 'defense' : 'ffa');
        CFG.ARENA_HALF = world.mode === 'defense' ? 150 : 200;
        console.log('[MODE]', world.mode, '| ротация:', rotation, '| арена', CFG.ARENA_HALF * 2);

        loadSettings();
        try {
            const savedName = localStorage.getItem('nss_name');
            if (savedName) DOM.nickname.value = savedName.slice(0, 16);
        } catch (e) { void e; }

        world.selectedWeapon = selectedWeapon;

        initThree();
        initInput();
        initSettingsUI();

        const resumeBtn = $('pause-resume');
        if (resumeBtn) resumeBtn.addEventListener('click', () => closePause());
        const pauseSetBtn = $('pause-settings');
        if (pauseSetBtn) pauseSetBtn.addEventListener('click', () => {
            const el = $('pause');
            if (el) el.classList.add('hidden');
            openSettings(true, (fromPause) => {
                if (fromPause) {
                    const p = $('pause');
                    if (p && G.running) p.classList.remove('hidden');
                }
            });
        });
        const pauseMenuBtn = $('pause-menu');
        if (pauseMenuBtn) pauseMenuBtn.addEventListener('click', () => exitToMenu());

        DOM.cards.forEach(card => {
            card.addEventListener('click', () => {
                DOM.cards.forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedWeapon = card.dataset.weapon;
                world.selectedWeapon = selectedWeapon;
                setJoinWeapon(selectedWeapon);
                updateLoadoutFromCard(card);
                setShowcaseWeapon(selectedWeapon);
                card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                AU.resume();
                AU.ui();
            });
        });
        updateLoadoutFromCard(document.querySelector('.car-card.selected'));
        setJoinWeapon(selectedWeapon);

        const scrollCarousel = (dir) => {
            const track = $('car-select');
            if (!track) return;
            const step = (track.querySelector('.car-card')?.offsetWidth || 240) + 12;
            track.scrollBy({ left: dir * step, behavior: 'smooth' });
            AU.ui();
        };
        if (DOM.carPrev) DOM.carPrev.addEventListener('click', () => scrollCarousel(-1));
        if (DOM.carNext) DOM.carNext.addEventListener('click', () => scrollCarousel(1));

        if (DOM.musicBtn) DOM.musicBtn.addEventListener('click', () => {
            AU.resume();
            Music.toggle();
        });

        DOM.connectBtn.addEventListener('click', () => {
            const name = (DOM.nickname.value || 'Боец').trim().slice(0, 16) || 'Боец';
            DOM.nickname.value = name;
            try { localStorage.setItem('nss_name', name); } catch (e) { void e; }
            DOM.connectBtn.disabled = true;
            DOM.status.textContent = 'Подключение...';
            AU.resume();
            connect(name);
        });

        DOM.nickname.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !DOM.connectBtn.disabled) DOM.connectBtn.click();
        });

        G.renderer.domElement.addEventListener('click', () => {
            if (G.running && !G.pointerLocked) {
                G.renderer.domElement.requestPointerLock();
            }
        });

        drawWeaponPreviews();
        initShowcase();
        animate();
        console.log('[BOOT] OK');
    } catch (err) {
        console.error('[BOOT] FAILED:', err);
        DOM.status.textContent = 'Ошибка запуска: ' + err.message;
    }
}

boot();
