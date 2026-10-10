import { THREE, CFG, G, world, clamp, disposeObj, DOM } from './core.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AU } from './audio.js';

/* ============================================================
   Процедурные PBR-текстуры (только для УЛЬТРА-графики, ленивые)
   ============================================================ */
function normalFromCanvas(srcCanvas, strength = 2.2) {
    const s = srcCanvas.width;
    const sc = srcCanvas.getContext('2d');
    const data = sc.getImageData(0, 0, s, s).data;
    const out = document.createElement('canvas');
    out.width = out.height = s;
    const oc = out.getContext('2d');
    const img = oc.createImageData(s, s);
    const h = (x, y) => {
        const i = (((y + s) % s) * s + ((x + s) % s)) * 4;
        return (data[i] + data[i + 1] + data[i + 2]) / 765;
    };
    for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
            const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
            const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
            const len = Math.hypot(dx, dy, 1);
            const i = (y * s + x) * 4;
            img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
            img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
            img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
            img.data[i + 3] = 255;
        }
    }
    oc.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(out);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
}

function makeMaps(drawBase, drawHeight, strength = 2.2) {
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = baseCanvas.height = 256;
    drawBase(baseCanvas.getContext('2d'), 256);
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = heightCanvas.height = 256;
    drawHeight(heightCanvas.getContext('2d'), 256);
    const map = new THREE.CanvasTexture(baseCanvas);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const normalMap = normalFromCanvas(heightCanvas, strength);
    return { map, normalMap, heightCanvas };
}

function roughFrom(heightCanvas, base, contrast) {
    const c = document.createElement('canvas');
    c.width = c.height = heightCanvas.width;
    const x = c.getContext('2d');
    x.drawImage(heightCanvas, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) {
        const v = d.data[i];
        const r = clamp(base + (v / 255 - 0.5) * contrast, 0, 1);
        d.data[i] = d.data[i + 1] = d.data[i + 2] = r * 255;
    }
    x.putImageData(d, 0, 0);
    const rt = new THREE.CanvasTexture(c);
    rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
    return rt;
}

/* базовые материалы: без текстур (обычные уровни графики) */
function buildGunMaterials() {
    const mk = (color, rough, metal) => {
        const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
        m.userData.noTexColor = color;
        return m;
    };
    return {
        body: mk(0x2b3038, 0.68, 0.30),
        dark: mk(0x4e545e, 0.46, 0.92),
        metal: mk(0xb4bac4, 0.34, 0.98),
        grip: mk(0x1c1f24, 0.9, 0.06),
        wood: mk(0x7a5430, 0.7, 0.0),
        accent:  new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false }),
        accentP: new THREE.MeshBasicMaterial({ color: 0xff2d88, toneMapped: false }),
        accentO: new THREE.MeshBasicMaterial({ color: 0xffa02e, toneMapped: false }),
        lens: new THREE.MeshStandardMaterial({
            color: 0x0a1a2a, roughness: 0.06, metalness: 0.95,
            emissive: 0x00e5ff, emissiveIntensity: 0.35,
        }),
        hand: mk(0x2b2e34, 0.86, 0.05),
        brass: new THREE.MeshStandardMaterial({ color: 0xd8a944, roughness: 0.35, metalness: 0.95 }),
    };
}

export const GUNMAT = buildGunMaterials();

/* текстуры для максимального уровня графики — строятся лениво */
let gunMaps = null;

function buildGunTextureMaps() {
    const poly = makeMaps(
        (x, s) => {
            x.fillStyle = '#23262c';
            x.fillRect(0, 0, s, s);
            for (let i = 0; i < 2600; i++) {
                x.fillStyle = `rgba(${20 + Math.random() * 40},${22 + Math.random() * 40},${26 + Math.random() * 40},0.5)`;
                x.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6);
            }
            for (let i = 0; i < 26; i++) {
                x.strokeStyle = 'rgba(150,155,165,0.10)';
                x.lineWidth = 0.8;
                const px = Math.random() * s, py = Math.random() * s;
                x.beginPath();
                x.moveTo(px, py);
                x.lineTo(px + (Math.random() - 0.5) * 60, py + (Math.random() - 0.5) * 60);
                x.stroke();
            }
        },
        (x, s) => {
            x.fillStyle = '#808080';
            x.fillRect(0, 0, s, s);
            for (let i = 0; i < 2600; i++) {
                x.fillStyle = Math.random() > 0.5 ? '#8a8a8a' : '#767676';
                x.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6);
            }
        }, 1.6);

    const metal = makeMaps(
        (x, s) => {
            x.fillStyle = '#4a4f57';
            x.fillRect(0, 0, s, s);
            for (let i = 0; i < 700; i++) {
                x.strokeStyle = `rgba(${120 + Math.random() * 80},${125 + Math.random() * 80},${135 + Math.random() * 80},0.12)`;
                x.lineWidth = 0.7;
                const y = Math.random() * s;
                x.beginPath();
                x.moveTo(0, y);
                x.lineTo(s, y + (Math.random() - 0.5) * 3);
                x.stroke();
            }
            for (let i = 0; i < 40; i++) {
                x.strokeStyle = 'rgba(210,215,225,0.25)';
                x.lineWidth = 0.6;
                const px = Math.random() * s, py = Math.random() * s;
                x.beginPath();
                x.moveTo(px, py);
                x.lineTo(px + (Math.random() - 0.5) * 90, py + (Math.random() - 0.5) * 20);
                x.stroke();
            }
        },
        (x, s) => {
            x.fillStyle = '#808080';
            x.fillRect(0, 0, s, s);
            for (let i = 0; i < 700; i++) {
                const y = Math.random() * s;
                x.fillStyle = Math.random() > 0.5 ? '#8c8c8c' : '#747474';
                x.fillRect(0, y, s, 1);
            }
        }, 1.4);

    const rubber = makeMaps(
        (x, s) => {
            x.fillStyle = '#191b1f';
            x.fillRect(0, 0, s, s);
            x.fillStyle = '#22242a';
            for (let gy = 0; gy < s; gy += 8) {
                for (let gx = 0; gx < s; gx += 8) {
                    x.beginPath();
                    x.arc(gx + 4, gy + 4, 2.4, 0, Math.PI * 2);
                    x.fill();
                }
            }
        },
        (x, s) => {
            x.fillStyle = '#707070';
            x.fillRect(0, 0, s, s);
            x.fillStyle = '#9a9a9a';
            for (let gy = 0; gy < s; gy += 8) {
                for (let gx = 0; gx < s; gx += 8) {
                    x.beginPath();
                    x.arc(gx + 4, gy + 4, 2.4, 0, Math.PI * 2);
                    x.fill();
                }
            }
        }, 2.4);

    const wood = makeMaps(
        (x, s) => {
            const g = x.createLinearGradient(0, 0, s, s);
            g.addColorStop(0, '#6e4a28');
            g.addColorStop(0.5, '#7d5730');
            g.addColorStop(1, '#5f3f22');
            x.fillStyle = g;
            x.fillRect(0, 0, s, s);
            for (let i = 0; i < 90; i++) {
                x.strokeStyle = `rgba(${40 + Math.random() * 30},${26 + Math.random() * 20},${12 + Math.random() * 12},0.35)`;
                x.lineWidth = 0.8 + Math.random() * 1.4;
                const y = Math.random() * s;
                x.beginPath();
                x.moveTo(0, y);
                x.bezierCurveTo(s * 0.33, y + (Math.random() - 0.5) * 16, s * 0.66, y + (Math.random() - 0.5) * 16, s, y + (Math.random() - 0.5) * 10);
                x.stroke();
            }
        },
        (x, s) => {
            x.fillStyle = '#7a7a7a';
            x.fillRect(0, 0, s, s);
            for (let i = 0; i < 90; i++) {
                x.strokeStyle = 'rgba(150,150,150,0.8)';
                x.lineWidth = 1 + Math.random() * 1.6;
                const y = Math.random() * s;
                x.beginPath();
                x.moveTo(0, y);
                x.bezierCurveTo(s * 0.33, y + (Math.random() - 0.5) * 16, s * 0.66, y + (Math.random() - 0.5) * 16, s, y + (Math.random() - 0.5) * 10);
                x.stroke();
            }
        }, 1.8);

    const cloth = makeMaps(
        (x, s) => {
            x.fillStyle = '#26282d';
            x.fillRect(0, 0, s, s);
            x.strokeStyle = 'rgba(60,64,72,0.5)';
            x.lineWidth = 1;
            for (let i = 0; i < s; i += 4) {
                x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke();
                x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke();
            }
        },
        (x, s) => {
            x.fillStyle = '#7a7a7a';
            x.fillRect(0, 0, s, s);
            x.strokeStyle = 'rgba(150,150,150,0.9)';
            x.lineWidth = 1;
            for (let i = 0; i < s; i += 4) {
                x.beginPath(); x.moveTo(i, 0); x.lineTo(i, s); x.stroke();
                x.beginPath(); x.moveTo(0, i); x.lineTo(s, i); x.stroke();
            }
        }, 1.2);

    gunMaps = {
        body:  { map: poly.map, normalMap: poly.normalMap, roughness: roughFrom(poly.heightCanvas, 0.55, 0.3) },
        dark:  { map: metal.map, normalMap: metal.normalMap, roughness: roughFrom(metal.heightCanvas, 0.42, 0.25) },
        metal: { map: metal.map, normalMap: metal.normalMap, roughness: roughFrom(metal.heightCanvas, 0.3, 0.2) },
        grip:  { map: rubber.map, normalMap: rubber.normalMap, roughness: null },
        wood:  { map: wood.map, normalMap: wood.normalMap, roughness: null },
        hand:  { map: cloth.map, normalMap: cloth.normalMap, roughness: null },
    };
}

export function setWeaponTextures(on) {
    if (on && !gunMaps) buildGunTextureMaps();
    for (const key of ['body', 'dark', 'metal', 'grip', 'wood', 'hand']) {
        const m = GUNMAT[key];
        const maps = on && gunMaps ? gunMaps[key] : null;
        if (maps) {
            m.map = maps.map;
            m.normalMap = maps.normalMap;
            m.roughnessMap = maps.roughness || null;
            m.color.setHex(0xffffff);
        } else {
            m.map = null;
            m.normalMap = null;
            m.roughnessMap = null;
            m.color.setHex(m.userData.noTexColor);
        }
        m.needsUpdate = true;
    }
}

/* ============================================================
   merge-помощники (используются и персонажами)
   ============================================================ */
export function mergeGeoList(geos) {
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

export function mergeParts(parts) {
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

/* ============================================================
   Хелперы сборки
   ============================================================ */
function rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
}
function cyl(rt, rb, h, seg, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    return m;
}
/* ствол вдоль -Z: цилиндр, повёрнутый вокруг X */
function tube(mat, r, len, x, y, z, seg = 12) {
    return cyl(r, r, len, seg, mat, x, y, z, Math.PI / 2);
}

function buildHand(side) {
    const g = new THREE.Group();
    const palm = rbox(0.062, 0.085, 0.105, 0.028, GUNMAT.hand);
    g.add(palm);
    for (let i = 0; i < 4; i++) {
        const f = rbox(0.017, 0.062, 0.02, 0.008, GUNMAT.hand, 0, 0, 0);
        f.position.set(-0.021 + i * 0.014, -0.062, 0.012);
        f.rotation.x = 0.55;
        g.add(f);
    }
    const thumb = rbox(0.018, 0.05, 0.02, 0.008, GUNMAT.hand);
    thumb.position.set(side * 0.035, -0.02, 0.03);
    thumb.rotation.set(0.6, 0, side * 0.7);
    g.add(thumb);
    return g;
}

function addRightHand(parent, x, y, z) {
    const h = buildHand(-1);
    h.position.set(x, y, z);
    h.rotation.set(0.35, 0, -0.2);
    parent.add(h);
}
function addLeftHand(parent, x, y, z) {
    const h = buildHand(1);
    h.position.set(x, y, z);
    h.rotation.set(-0.25, 0, 0.15);
    parent.add(h);
}

/* прицельные приспособления: задняя планка с прорезью + мушка */
function addSights(g, zRear, zFront, y = 0.075) {
    g.add(box(0.012, 0.014, 0.012, GUNMAT.metal, -0.009, y, zRear));
    g.add(box(0.012, 0.014, 0.012, GUNMAT.metal, 0.009, y, zRear));
    g.add(box(0.006, 0.024, 0.008, GUNMAT.metal, 0, y, zFront));
}

function addTrigger(g, y = -0.045, z = 0.0, mat = GUNMAT.metal) {
    g.add(box(0.008, 0.026, 0.01, mat, 0, y + 0.012, z - 0.01, 0.12));
    g.add(box(0.006, 0.008, 0.052, mat, 0, y - 0.014, z - 0.018));
    g.add(box(0.006, 0.03, 0.008, mat, 0, y + 0.004, z - 0.044));
}

function addMagazine(g, x, y, z, rx, w, h, d, mat = GUNMAT.dark, curved = false) {
    const grp = new THREE.Group();
    if (curved) {
        const s1 = rbox(w, h * 0.55, d, 0.012, mat, 0, 0, 0, rx);
        const s2 = rbox(w, h * 0.55, d * 0.96, 0.012, mat, 0, -h * 0.42, -d * 0.16, rx + 0.42);
        grp.add(s1, s2);
        grp.add(cyl(0.008, 0.008, w * 0.62, 8, GUNMAT.brass, 0, h * 0.26, d * 0.12, Math.PI / 2));
    } else {
        grp.add(rbox(w, h, d, 0.012, mat, 0, 0, 0, rx));
        grp.add(cyl(0.008, 0.008, w * 0.62, 8, GUNMAT.brass, 0, h / 2 + 0.005, d * 0.15, Math.PI / 2));
    }
    grp.position.set(x, y, z);
    g.add(grp);
    return grp;
}

function addBolt(g, x, y, z, len = 0.07) {
    const bolt = cyl(0.008, 0.008, len, 8, GUNMAT.metal, x, y, z, 0, 0, Math.PI / 2);
    g.add(bolt);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), GUNMAT.metal);
    knob.position.set(x + len / 2 + 0.008, y, z);
    g.add(knob);
    return bolt;
}

/* ствол с дульным тормозом и прорезями */
function addBarrel(g, x, y, zStart, len, r = 0.013, muzzle = true) {
    g.add(tube(GUNMAT.metal, r, len, x, y, zStart - len / 2, 12));
    if (muzzle) {
        const mz = tube(GUNMAT.dark, r * 1.45, r * 5, x, y, zStart - len - r * 2.2, 12);
        g.add(mz);
        g.add(box(r * 1.6, r * 1.6, r * 2.6, GUNMAT.metal, x, y + r * 1.3, zStart - len - r * 2.2));
    }
}

/* деревянный приклад с затыльником */
function addStock(g, mat, w, h, len, x, y, z, rx = 0.05) {
    g.add(rbox(w, h, len, 0.02, mat, x, y, z, rx));
    g.add(rbox(w * 1.04, h * 1.2, 0.024, 0.012, GUNMAT.grip, x, y - Math.sin(rx) * len * 0.5, z + len / 2 + 0.012, rx));
}

/* ============================================================
   Модели оружия v3: аккуратная сборка, единый силуэт
   ============================================================ */
function createPistol() {
    const g = new THREE.Group();
    g.add(rbox(0.056, 0.052, 0.2, 0.012, GUNMAT.body, 0, -0.005, -0.045));
    g.add(rbox(0.052, 0.05, 0.24, 0.01, GUNMAT.dark, 0, 0.048, -0.05));
    for (let i = 0; i < 5; i++) {
        g.add(box(0.054, 0.034, 0.006, GUNMAT.metal, 0, 0.048, 0.018 + i * 0.013));
    }
    g.add(tube(GUNMAT.metal, 0.0115, 0.012, 0, 0.048, -0.172, 10));
    g.add(tube(GUNMAT.grip, 0.0055, 0.014, 0, 0.048, -0.178, 8));
    g.add(box(0.028, 0.01, 0.05, GUNMAT.metal, 0, 0.078, -0.02));
    g.add(rbox(0.046, 0.125, 0.058, 0.014, GUNMAT.grip, 0, -0.095, 0.062, -0.24));
    g.add(box(0.05, 0.008, 0.064, GUNMAT.dark, 0, -0.157, 0.076, -0.24));
    addTrigger(g, -0.045, -0.005);
    addSights(g, 0.035, -0.15, 0.082);
    g.add(box(0.0025, 0.007, 0.13, GUNMAT.accent, -0.027, 0.042, -0.06));
    g.add(box(0.0025, 0.007, 0.13, GUNMAT.accent, 0.027, 0.042, -0.06));
    addRightHand(g, 0.038, -0.085, 0.062);
    g.userData = { magMesh: null, boltMesh: null, magVisible: false };
    return g;
}

function createRevolver() {
    const g = new THREE.Group();
    g.add(rbox(0.05, 0.075, 0.16, 0.012, GUNMAT.dark, 0, 0.005, 0.0));
    g.add(tube(GUNMAT.metal, 0.0145, 0.2, 0, 0.032, -0.16, 12));
    g.add(tube(GUNMAT.metal, 0.011, 0.18, 0, -0.004, -0.15, 8));
    g.add(box(0.016, 0.01, 0.2, GUNMAT.dark, 0, 0.05, -0.16));
    g.add(box(0.006, 0.02, 0.01, GUNMAT.metal, 0, 0.062, -0.245));
    const drum = tube(GUNMAT.metal, 0.043, 0.078, 0, 0.018, 0.0, 14);
    g.add(drum);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(box(0.009, 0.012, 0.08, GUNMAT.dark, Math.sin(a) * 0.041, 0.018 + Math.cos(a) * 0.041, 0.0, a));
    }
    g.add(box(0.014, 0.03, 0.016, GUNMAT.dark, 0, 0.065, 0.072, -0.5));
    g.add(box(0.02, 0.009, 0.024, GUNMAT.dark, 0, 0.083, 0.086));
    g.add(rbox(0.046, 0.13, 0.06, 0.02, GUNMAT.wood, 0, -0.1, 0.078, -0.32));
    addTrigger(g, -0.045, 0.01);
    g.add(box(0.03, 0.005, 0.14, GUNMAT.accentP, 0, 0.055, -0.15));
    addRightHand(g, 0.04, -0.09, 0.075);
    g.userData = { magMesh: null, boltMesh: null, magVisible: false };
    return g;
}

function createDMR() {
    const g = new THREE.Group();
    g.add(rbox(0.06, 0.09, 0.42, 0.014, GUNMAT.body, 0, 0, -0.05));
    addBarrel(g, 0, 0.012, -0.26, 0.42, 0.0135);
    g.add(box(0.05, 0.012, 0.3, GUNMAT.metal, 0, 0.055, -0.05));
    g.add(box(0.036, 0.004, 0.2, GUNMAT.accentO, 0, 0.063, -0.08));
    /* оптика */
    g.add(box(0.022, 0.022, 0.16, GUNMAT.dark, 0, 0.078, -0.02));
    g.add(tube(GUNMAT.dark, 0.024, 0.24, 0, 0.103, 0.02, 14));
    g.add(tube(GUNMAT.dark, 0.031, 0.045, 0, 0.103, -0.115, 14));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 14), GUNMAT.lens);
    lens.rotation.y = Math.PI;
    lens.position.set(0, 0.103, -0.139);
    g.add(lens);
    g.add(tube(GUNMAT.dark, 0.027, 0.035, 0, 0.103, 0.155, 14));
    g.add(cyl(0.012, 0.012, 0.024, 8, GUNMAT.dark, 0, 0.132, 0.02));
    g.add(cyl(0.011, 0.011, 0.024, 8, GUNMAT.dark, 0.02, 0.103, 0.02, 0, 0, Math.PI / 2));
    const bolt = addBolt(g, 0.042, 0.012, 0.13, 0.06);
    g.add(rbox(0.048, 0.12, 0.055, 0.014, GUNMAT.wood, 0, -0.11, 0.13, -0.22));
    g.add(rbox(0.062, 0.06, 0.18, 0.016, GUNMAT.wood, 0, -0.008, -0.34));
    addStock(g, GUNMAT.wood, 0.052, 0.085, 0.3, 0, -0.028, 0.31, 0.06);
    g.add(rbox(0.044, 0.028, 0.12, 0.01, GUNMAT.wood, 0, 0.02, 0.3));
    const mag = addMagazine(g, 0, -0.115, -0.02, 0.12, 0.042, 0.15, 0.062, GUNMAT.dark, true);
    addTrigger(g, -0.05, 0.03);
    addRightHand(g, 0.048, -0.1, 0.13);
    addLeftHand(g, -0.048, -0.07, -0.33);
    g.userData = { magMesh: mag, boltMesh: bolt, magVisible: true };
    return g;
}

function createRifle() {
    const g = new THREE.Group();
    g.add(rbox(0.066, 0.1, 0.4, 0.014, GUNMAT.body, 0, 0, 0));
    g.add(rbox(0.058, 0.026, 0.26, 0.01, GUNMAT.dark, 0, 0.055, -0.06));
    g.add(box(0.05, 0.02, 0.06, GUNMAT.dark, 0, 0.072, -0.16));
    g.add(tube(GUNMAT.metal, 0.013, 0.24, 0, 0.062, -0.3, 10));
    addBarrel(g, 0, 0.02, -0.3, 0.4, 0.0135);
    g.add(box(0.008, 0.05, 0.01, GUNMAT.metal, 0, 0.085, -0.7));
    g.add(box(0.008, 0.05, 0.01, GUNMAT.metal, -0.016, 0.085, -0.7));
    g.add(box(0.008, 0.05, 0.01, GUNMAT.metal, 0.016, 0.085, -0.7));
    g.add(rbox(0.07, 0.07, 0.2, 0.016, GUNMAT.wood, 0, -0.005, -0.33));
    g.add(box(0.074, 0.012, 0.02, GUNMAT.wood, 0, -0.005, -0.3));
    g.add(box(0.074, 0.012, 0.02, GUNMAT.wood, 0, -0.005, -0.38));
    const mag = addMagazine(g, 0, -0.13, 0.02, 0.16, 0.045, 0.2, 0.058, GUNMAT.dark, true);
    g.add(rbox(0.048, 0.125, 0.05, 0.014, GUNMAT.grip, 0, -0.115, 0.14, -0.3));
    addTrigger(g, -0.05, 0.04);
    const bolt = addBolt(g, 0.042, 0.03, 0.06, 0.05);
    addStock(g, GUNMAT.wood, 0.05, 0.075, 0.28, 0, -0.02, 0.34, 0.1);
    g.add(box(0.03, 0.004, 0.16, GUNMAT.accent, 0, 0.07, -0.08));
    addSights(g, 0.06, -0.68, 0.09);
    addRightHand(g, 0.046, -0.1, 0.14);
    addLeftHand(g, -0.048, -0.075, -0.32);
    g.userData = { magMesh: mag, boltMesh: bolt, magVisible: true };
    return g;
}

function createBurst() {
    const g = new THREE.Group();
    g.add(rbox(0.058, 0.09, 0.36, 0.014, GUNMAT.body, 0, 0, -0.02));
    g.add(box(0.02, 0.025, 0.18, GUNMAT.dark, 0, 0.068, -0.03));
    g.add(box(0.014, 0.02, 0.05, GUNMAT.dark, 0, 0.068, -0.12, 0.35));
    g.add(box(0.008, 0.03, 0.008, GUNMAT.metal, 0, 0.09, -0.1));
    g.add(tube(GUNMAT.body, 0.028, 0.2, 0, 0, -0.28, 12));
    g.add(box(0.06, 0.014, 0.02, GUNMAT.dark, 0, -0.026, -0.24));
    g.add(box(0.06, 0.014, 0.02, GUNMAT.dark, 0, -0.026, -0.32));
    addBarrel(g, 0, 0, -0.38, 0.24, 0.011);
    g.add(rbox(0.045, 0.115, 0.05, 0.014, GUNMAT.grip, 0, -0.105, 0.12, -0.3));
    addTrigger(g, -0.045, 0.02);
    const mag = addMagazine(g, 0, -0.135, -0.02, 0.1, 0.04, 0.16, 0.058);
    g.add(tube(GUNMAT.dark, 0.014, 0.2, 0, -0.012, 0.3, 8));
    g.add(rbox(0.05, 0.11, 0.03, 0.01, GUNMAT.body, 0, -0.022, 0.42));
    g.add(box(0.04, 0.004, 0.14, GUNMAT.accent, 0, 0.05, -0.04));
    addRightHand(g, 0.045, -0.095, 0.12);
    addLeftHand(g, -0.045, -0.07, -0.26);
    g.userData = { magMesh: mag, boltMesh: null, magVisible: true };
    return g;
}

function createSMG() {
    const g = new THREE.Group();
    g.add(rbox(0.06, 0.085, 0.3, 0.014, GUNMAT.body, 0, 0, -0.02));
    g.add(tube(GUNMAT.dark, 0.011, 0.24, 0, 0.052, -0.16, 8));
    g.add(box(0.016, 0.02, 0.03, GUNMAT.dark, 0.032, 0.052, 0.0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.004, 6, 12), GUNMAT.metal);
    ring.position.set(0, 0.072, -0.275);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    g.add(cyl(0.013, 0.013, 0.02, 10, GUNMAT.dark, 0, 0.068, 0.02));
    g.add(tube(GUNMAT.body, 0.026, 0.14, 0, 0, -0.24, 12));
    addBarrel(g, 0, 0, -0.31, 0.12, 0.0105, false);
    g.add(tube(GUNMAT.metal, 0.014, 0.03, 0, 0, -0.44, 10));
    g.add(tube(GUNMAT.metal, 0.012, 0.02, 0, 0, -0.415, 10));
    g.add(rbox(0.046, 0.115, 0.05, 0.014, GUNMAT.grip, 0, -0.105, 0.11, -0.28));
    addTrigger(g, -0.045, 0.015);
    const mag = addMagazine(g, 0, -0.125, 0.0, 0.12, 0.042, 0.19, 0.058, GUNMAT.dark, true);
    g.add(tube(GUNMAT.dark, 0.008, 0.24, -0.02, -0.015, 0.28, 8));
    g.add(tube(GUNMAT.dark, 0.008, 0.24, 0.02, -0.015, 0.28, 8));
    g.add(rbox(0.05, 0.09, 0.024, 0.01, GUNMAT.dark, 0, -0.012, 0.4));
    g.add(box(0.05, 0.004, 0.12, GUNMAT.accent, 0, 0.048, -0.06));
    addRightHand(g, 0.045, -0.095, 0.11);
    addLeftHand(g, -0.042, -0.07, -0.24);
    g.userData = { magMesh: mag, boltMesh: null, magVisible: true };
    return g;
}

function createLMG() {
    const g = new THREE.Group();
    g.add(rbox(0.085, 0.12, 0.55, 0.016, GUNMAT.body, 0, 0, -0.05));
    g.add(rbox(0.075, 0.03, 0.34, 0.01, GUNMAT.dark, 0, 0.075, -0.1));
    g.add(box(0.05, 0.014, 0.1, GUNMAT.dark, 0, 0.1, -0.05));
    addBarrel(g, 0, 0.02, -0.32, 0.5, 0.016);
    for (let i = 0; i < 4; i++) {
        g.add(tube(GUNMAT.dark, 0.026, 0.014, 0, 0.02, -0.44 - i * 0.05, 12));
    }
    g.add(cyl(0.008, 0.008, 0.2, 8, GUNMAT.dark, -0.035, -0.055, -0.6, 1.25, 0, 0.4));
    g.add(cyl(0.008, 0.008, 0.2, 8, GUNMAT.dark, 0.035, -0.055, -0.6, 1.25, 0, -0.4));
    g.add(cyl(0.012, 0.012, 0.02, 8, GUNMAT.metal, -0.085, -0.145, -0.63, 0, 0, 0.4));
    g.add(cyl(0.012, 0.012, 0.02, 8, GUNMAT.metal, 0.085, -0.145, -0.63, 0, 0, -0.4));
    g.add(rbox(0.048, 0.125, 0.05, 0.014, GUNMAT.grip, 0, -0.115, 0.16, -0.25));
    addTrigger(g, -0.05, 0.05);
    const mag = addMagazine(g, 0, -0.16, -0.02, 0, 0.13, 0.17, 0.2, GUNMAT.dark);
    for (let i = 0; i < 3; i++) {
        g.add(box(0.012, 0.012, 0.03, GUNMAT.brass, 0.065, -0.05 + i * 0.022, -0.14, 0, 0.35, 0));
    }
    addStock(g, GUNMAT.dark, 0.06, 0.09, 0.24, 0, -0.03, 0.35, 0.08);
    g.add(box(0.08, 0.004, 0.3, GUNMAT.accentP, 0, 0.068, -0.14));
    addSights(g, 0.09, -0.8, 0.09);
    addRightHand(g, 0.052, -0.11, 0.16);
    addLeftHand(g, -0.055, -0.085, -0.32);
    g.userData = { magMesh: mag, boltMesh: null, magVisible: true };
    return g;
}

function createShotgun() {
    const g = new THREE.Group();
    g.add(rbox(0.075, 0.1, 0.34, 0.016, GUNMAT.body, 0, 0, 0.02));
    g.add(box(0.04, 0.03, 0.06, GUNMAT.dark, 0.03, 0.01, 0.06));
    addBarrel(g, 0, 0.03, -0.15, 0.5, 0.02, false);
    g.add(tube(GUNMAT.metal, 0.02, 0.02, 0, 0.03, -0.66, 12));
    g.add(tube(GUNMAT.dark, 0.015, 0.42, 0, -0.018, -0.4, 10));
    g.add(rbox(0.07, 0.062, 0.18, 0.016, GUNMAT.wood, 0, -0.022, -0.36));
    for (let i = 0; i < 5; i++) {
        g.add(box(0.074, 0.01, 0.014, GUNMAT.wood, 0, -0.022, -0.3 - i * 0.03));
    }
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), GUNMAT.metal);
    bead.position.set(0, 0.062, -0.64);
    g.add(bead);
    addTrigger(g, -0.045, 0.02);
    addStock(g, GUNMAT.wood, 0.06, 0.1, 0.3, 0, -0.03, 0.33, 0.05);
    g.add(box(0.076, 0.005, 0.24, GUNMAT.accentP, 0, 0.052, 0.0));
    addRightHand(g, 0.05, -0.095, 0.06);
    addLeftHand(g, -0.05, -0.075, -0.36);
    g.userData = { magMesh: null, boltMesh: null, magVisible: false };
    return g;
}

function createSniper() {
    const g = new THREE.Group();
    g.add(rbox(0.06, 0.095, 0.5, 0.014, GUNMAT.body, 0, 0, 0.05));
    addBarrel(g, 0, 0.015, -0.2, 0.6, 0.0145, false);
    g.add(tube(GUNMAT.dark, 0.021, 0.1, 0, 0.015, -0.85, 12));
    g.add(box(0.045, 0.012, 0.06, GUNMAT.metal, 0, 0.036, -0.83));
    g.add(box(0.012, 0.03, 0.06, GUNMAT.metal, 0.02, 0.015, -0.83));
    g.add(box(0.012, 0.03, 0.06, GUNMAT.metal, -0.02, 0.015, -0.83));
    /* большая оптика */
    g.add(box(0.024, 0.022, 0.22, GUNMAT.dark, 0, 0.088, 0.05));
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.005, 6, 14), GUNMAT.dark);
    ring1.position.set(0, 0.115, -0.01);
    g.add(ring1);
    const ring2 = ring1.clone();
    ring2.position.z = 0.12;
    g.add(ring2);
    g.add(tube(GUNMAT.dark, 0.028, 0.3, 0, 0.115, 0.05, 16));
    g.add(tube(GUNMAT.dark, 0.038, 0.06, 0, 0.115, -0.125, 16));
    g.add(tube(GUNMAT.dark, 0.042, 0.014, 0, 0.115, -0.16, 16));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.033, 16), GUNMAT.lens);
    lens.rotation.y = Math.PI;
    lens.position.set(0, 0.115, -0.168);
    g.add(lens);
    g.add(tube(GUNMAT.dark, 0.03, 0.045, 0, 0.115, 0.222, 16));
    g.add(cyl(0.014, 0.014, 0.03, 10, GUNMAT.dark, 0, 0.152, 0.05));
    g.add(cyl(0.013, 0.013, 0.028, 10, GUNMAT.dark, 0.028, 0.115, 0.05, 0, 0, Math.PI / 2));
    const bolt = addBolt(g, 0.045, 0.02, 0.24, 0.09);
    g.add(rbox(0.048, 0.12, 0.05, 0.014, GUNMAT.wood, 0, -0.11, 0.16, -0.2));
    g.add(rbox(0.06, 0.06, 0.16, 0.016, GUNMAT.wood, 0, -0.005, -0.28));
    addStock(g, GUNMAT.wood, 0.055, 0.09, 0.34, 0, -0.03, 0.47, 0.04);
    g.add(rbox(0.048, 0.032, 0.14, 0.012, GUNMAT.wood, 0, 0.025, 0.43));
    const mag = addMagazine(g, 0, -0.14, -0.02, 0.08, 0.045, 0.15, 0.068);
    addTrigger(g, -0.05, 0.04);
    g.add(box(0.05, 0.005, 0.34, GUNMAT.accent, 0, 0.052, -0.02));
    addRightHand(g, 0.05, -0.1, 0.16);
    addLeftHand(g, -0.046, -0.07, -0.26);
    g.userData = { magMesh: mag, boltMesh: bolt, magVisible: true };
    return g;
}

export function createWeaponModel(id) {
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

/* Упрощённое оружие в руках ботов (2-3 меша) */
export function createSimpleGun(id) {
    const parts = [];
    const skinParts = [];
    const len = { pistol: 0.24, revolver: 0.26, dmr: 0.62, rifle: 0.66, burst: 0.52, smg: 0.44, lmg: 0.75, shotgun: 0.6, sniper: 0.8 }[id] || 0.6;
    const isPistol = (id === 'pistol' || id === 'revolver');
    parts.push({ geo: new THREE.BoxGeometry(isPistol ? 0.06 : 0.08, isPistol ? 0.1 : 0.12, len), mat: GUNMAT.dark });
    parts.push({ geo: new THREE.CylinderGeometry(0.016, 0.016, len * 0.5, 8), mat: GUNMAT.metal, pos: [0, 0.012, -len * 0.6], rot: [Math.PI / 2, 0, 0] });
    if (!isPistol) {
        parts.push({ geo: new THREE.BoxGeometry(0.05, 0.16, 0.07), mat: GUNMAT.dark, pos: [0, -0.16, 0.02], rot: [0.15, 0, 0] });
        parts.push({ geo: new THREE.BoxGeometry(0.05, 0.13, 0.06), mat: GUNMAT.grip, pos: [0, -0.12, 0.12], rot: [-0.25, 0, 0] });
        skinParts.push({ geo: new THREE.BoxGeometry(0.06, 0.08, 0.24), mat: GUNMAT.wood, pos: [0, -0.02, len * 0.6] });
        if (id === 'sniper' || id === 'dmr') {
            parts.push({ geo: new THREE.CylinderGeometry(0.028, 0.028, 0.24, 10), mat: GUNMAT.dark, pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] });
        }
    } else {
        parts.push({ geo: new THREE.BoxGeometry(0.05, 0.15, 0.06), mat: GUNMAT.grip, pos: [0, -0.12, 0.06], rot: [-0.22, 0, 0] });
    }
    const g = mergeParts(parts);
    if (skinParts.length) g.add(mergeParts(skinParts));
    return g;
}

/* ============================================================
   Viewmodel: сборка, инспекция, стадийная перезарядка, спринт
   ============================================================ */
export function buildWeaponModel(id) {
    if (G.currentWeaponModel) {
        G.weaponHolder.remove(G.currentWeaponModel);
        disposeObj(G.currentWeaponModel);
    }
    G.currentWeaponModel = createWeaponModel(id);
    G.weaponHolder.add(G.currentWeaponModel);
}

export function inspectWeapon() {
    if (world.reloadLeft > 0) return;
    world.inspectT = 0.9;
    AU.ui();
}

export function updateViewmodel(dt, speedMag) {
    if (!G.weaponHolder) return;
    const holder = G.weaponHolder;

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

    const sprintTarget = (world.sprint && speedMag > 3 && t < 0.2) ? 1 : 0;
    world.sprintBlend = (world.sprintBlend || 0) + (sprintTarget - (world.sprintBlend || 0)) * Math.min(1, dt * 7);
    const sp = world.sprintBlend;

    if (world.inspectT > 0) world.inspectT = Math.max(0, world.inspectT - dt);
    const insp = world.inspectT > 0 ? Math.sin((1 - world.inspectT / 0.9) * Math.PI) : 0;

    let magOut = 0, boltPull = 0, tiltY = 0;
    const reloadProgress = (world.reloadTotal > 0 && world.reloadLeft > 0)
        ? 1 - world.reloadLeft / world.reloadTotal : 0;
    const dip = world.reloadLeft > 0 ? Math.sin(clamp(reloadProgress, 0, 1) * Math.PI) : 0;
    if (world.reloadLeft > 0 && world.reloadTotal > 0) {
        const p = clamp(reloadProgress, 0, 1);
        if (p < 0.4) magOut = Math.min(1, p / 0.22);
        else magOut = Math.max(0, 1 - (p - 0.4) / 0.2);
        boltPull = p > 0.72 ? (p - 0.72) / 0.28 : 0;
        tiltY = Math.sin(p * Math.PI) * 0.35;
        const stage = p < 0.4 ? 0 : (p < 0.72 ? 1 : 2);
        if (stage !== world.reloadStage) {
            world.reloadStage = stage;
            if (stage === 0) AU.reloadStart(0);
            else if (stage === 1) AU.reloadMag(0);
            else AU.reloadBolt(0);
        }
    } else {
        world.reloadStage = -1;
    }

    const recoilZ = world.recoilPitch * 0.35;
    const recoilPitchVM = world.recoilPitch * 1.6;

    holder.position.set(
        baseX + bobX + swayX + sp * 0.05 + insp * 0.02,
        baseY + bobY + swayY - dip * 0.22 - sp * 0.12 + insp * 0.05,
        baseZ + recoilZ
    );
    holder.rotation.x = recoilPitchVM * 0.9 + dip * 0.7 + sp * 0.4 + insp * 0.15;
    holder.rotation.y = world.recoilYaw * 3 + swayX * 4 - sp * 0.55 + tiltY + insp * 0.85;
    holder.rotation.z = swayX * 2.5 + -world.velocity.x * 0.005 * (1 - t) + dip * 0.35 + sp * 0.18 + insp * 0.35;

    const model = G.currentWeaponModel;
    if (model && model.userData) {
        const ud = model.userData;
        if (ud.magMesh && ud.magVisible) {
            ud.magMesh.position.y = ud.magMesh.userData.baseY ?? (ud.magMesh.userData.baseY = ud.magMesh.position.y);
            ud.magMesh.position.y -= magOut * 0.26;
            ud.magMesh.rotation.x += magOut * 0.25;
        }
        if (ud.boltMesh) {
            ud.boltMesh.position.z = (ud.boltMesh.userData.baseZ ?? (ud.boltMesh.userData.baseZ = ud.boltMesh.position.z)) + boltPull * 0.06;
        }
    }

    if (world.weapon === 'sniper' && t > 0.6) holder.visible = false;
    else holder.visible = true;

    if (DOM.scope) {
        if (world.weapon === 'sniper' && t > 0.5) DOM.scope.classList.add('active');
        else DOM.scope.classList.remove('active');
    }
    if (DOM.crosshair) DOM.crosshair.classList.toggle('ads', world.adsProgress > 0.4);
}

/* ============================================================
   3D-витрина в меню
   ============================================================ */
let showcaseRenderer = null;
let showcaseScene = null;
let showcaseCamera = null;
let showcasePivot = null;
let showcaseModel = null;
let showcaseRing = null;
let showcaseT = 0;
let showcaseBroken = false;

export function initShowcase() {
    const canvas = document.getElementById('weapon-showcase');
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
    setShowcaseWeapon(world.selectedWeapon || 'pistol');
}

export function setShowcaseWeapon(id) {
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
            o.material.color.multiplyScalar(1.7);
            o.material.metalness = Math.min(o.material.metalness, 0.75);
            o.material.roughness = Math.max(o.material.roughness, 0.3);
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

export function updateShowcase(dt) {
    if (!showcaseRenderer || G.running || showcaseBroken) return;
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
