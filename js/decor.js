import { THREE, CFG, G, collidersNear } from './core.js';

/* ============================================================
   ДЕКОР v2.1 «ЖИВОЙ МИР»
   Трава/кусты/цветы/камни по всей карте (InstancedMesh, ветер),
   фонари, провода, лужи, обломки; для обороны — мёртвые деревья,
   кости и жаровни.
   ============================================================ */

export const windUniform = { value: 0 };

function addWind(mat, amp = 0.16, freq = 1.6) {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uWindTime = windUniform;
        shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
            #include <begin_vertex>
            #ifdef USE_INSTANCING
                vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            #else
                vec4 wpos = vec4(0.0);
            #endif
            float wph = wpos.x * 0.35 + wpos.z * 0.27;
            float wsway = sin(uWindTime * ${freq.toFixed(3)} + wph) * 0.6
                        + sin(uWindTime * ${(freq * 2.3).toFixed(3)} + wph * 1.7) * 0.4;
            float wbend = smoothstep(0.0, 0.9, transformed.y);
            transformed.x += wsway * ${amp.toFixed(3)} * wbend;
            transformed.z += wsway * ${(amp * 0.6).toFixed(3)} * wbend;
        `);
    };
    mat.customProgramCacheKey = () => `wind_${amp}_${freq}`;
    return mat;
}

function mergeWithUV(geos) {
    const list = geos.map(g => (g.index ? g.toNonIndexed() : g));
    let total = 0;
    for (const g of list) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const norm = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let off = 0;
    for (const g of list) {
        pos.set(g.attributes.position.array, off * 3);
        if (g.attributes.normal) norm.set(g.attributes.normal.array, off * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
        off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
}

function crossPlanes(w, h, planes = 3) {
    const geos = [];
    for (let i = 0; i < planes; i++) {
        const p = new THREE.PlaneGeometry(w, h);
        p.rotateY((i / planes) * Math.PI);
        p.translate(0, h / 2, 0);
        geos.push(p);
    }
    return mergeWithUV(geos);
}

function grassTexture(dark) {
    const s = 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 16; i++) {
        const bx = 14 + Math.random() * (s - 28);
        const hgt = 40 + Math.random() * 80;
        const lean = (Math.random() - 0.5) * 30;
        const hue = dark ? 100 + Math.random() * 40 : 80 + Math.random() * 50;
        const light = dark ? 14 + Math.random() * 10 : 32 + Math.random() * 18;
        x.strokeStyle = `hsl(${hue}, ${dark ? 30 : 45}%, ${light}%)`;
        x.lineWidth = 2 + Math.random() * 3;
        x.beginPath();
        x.moveTo(bx, s);
        x.quadraticCurveTo(bx + lean * 0.3, s - hgt * 0.6, bx + lean, s - hgt);
        x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function flowerTexture() {
    const s = 64;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.clearRect(0, 0, s, s);
    const heads = [
        { x: 18, y: 16, col: '#ffd34d' },
        { x: 42, y: 12, col: '#ff7ab8' },
        { x: 30, y: 30, col: '#e8f4ff' },
    ];
    for (const h of heads) {
        x.strokeStyle = '#4a7a30';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(h.x, s);
        x.quadraticCurveTo(h.x - 2, h.y + 12, h.x, h.y);
        x.stroke();
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            x.fillStyle = h.col;
            x.beginPath();
            x.arc(h.x + Math.cos(a) * 4.5, h.y + Math.sin(a) * 4.5, 3.2, 0, Math.PI * 2);
            x.fill();
        }
        x.fillStyle = '#fff6c8';
        x.beginPath();
        x.arc(h.x, h.y, 2.2, 0, Math.PI * 2);
        x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

function scatter(count, clearance, minH, cb) {
    let placed = 0, guard = 0;
    while (placed < count && guard < count * 30) {
        guard++;
        const x = (Math.random() * 2 - 1) * (CFG.ARENA_HALF - 6);
        const z = (Math.random() * 2 - 1) * (CFG.ARENA_HALF - 6);
        let blocked = false;
        for (const c of collidersNear(x, z, 8)) {
            if (Math.abs(x - c.x) < c.hw + clearance && Math.abs(z - c.z) < c.hd + clearance && c.h >= minH) {
                blocked = true;
                break;
            }
        }
        if (blocked) continue;
        cb(x, z, placed);
        placed++;
    }
}

function makeInstanced(geo, mat, count, shadows = false) {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.castShadow = shadows;
    m.receiveShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
}

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V3 = new THREE.Vector3();
const S3 = new THREE.Vector3();

function setInst(mesh, i, x, y, z, ry, s, sy, rx = 0) {
    Q.setFromEuler(new THREE.Euler(rx, ry, 0));
    V3.set(x, y, z);
    S3.set(s, sy, s);
    M4.compose(V3, Q, S3);
    mesh.setMatrixAt(i, M4);
}

/* ============================================================
   Сборка декора
   ============================================================ */
let lampGlobes = null;
let braziers = [];
const natureMeshes = [];
const decorMeshes = [];

export function setDecorVisibility(natureOn, decorOn) {
    for (const m of natureMeshes) m.visible = !!natureOn;
    for (const m of decorMeshes) m.visible = !!decorOn;
    for (const b of braziers) {
        if (!decorOn) b.light.intensity = 0;
    }
}

export function buildDecor(dark) {
    const scene = G.scene;
    if (!scene) return;
    braziers = [];

    /* --- трава по всей карте (немного, для красоты) --- */
    const grassCount = dark ? 1400 : 3200;
    const grassMat = addWind(new THREE.MeshStandardMaterial({
        map: grassTexture(dark),
        alphaTest: 0.45, side: THREE.DoubleSide,
        roughness: 0.95, metalness: 0.0,
        color: dark ? 0x9a9a8a : 0xffffff,
    }), 0.14, 1.5);
    const grass = makeInstanced(crossPlanes(0.55, 0.55, 3), grassMat, grassCount);
    scatter(grassCount, 0.4, 0.9, (x, z, i) => {
        setInst(grass, i, x, 0, z, Math.random() * Math.PI, 0.7 + Math.random() * 0.8, 0.6 + Math.random() * 0.9);
    });
    scene.add(grass);
    natureMeshes.push(grass);

    /* --- цветы --- */
    const flowerCount = dark ? 0 : 420;
    if (flowerCount) {
        const flowerMat = addWind(new THREE.MeshStandardMaterial({
            map: flowerTexture(),
            alphaTest: 0.5, side: THREE.DoubleSide,
            roughness: 0.85, metalness: 0.0,
        }), 0.1, 1.9);
        const flowers = makeInstanced(crossPlanes(0.35, 0.32, 2), flowerMat, flowerCount);
        scatter(flowerCount, 0.5, 0.9, (x, z, i) => {
            setInst(flowers, i, x, 0, z, Math.random() * Math.PI, 0.8 + Math.random() * 0.6, 0.8 + Math.random() * 0.5);
        });
        scene.add(flowers);
        natureMeshes.push(flowers);
    }

    /* --- кусты --- */
    const bushGeo = new THREE.IcosahedronGeometry(0.65, 1);
    bushGeo.scale(1, 0.72, 1);
    const bushMat = new THREE.MeshStandardMaterial({
        color: dark ? 0x22301c : 0x3f6a2c, roughness: 0.95, metalness: 0.0,
    });
    const bushCount = dark ? 40 : 110;
    const bushes = makeInstanced(bushGeo, bushMat, bushCount, true);
    const bushCol = new THREE.Color();
    scatter(bushCount, 1.2, 1.2, (x, z, i) => {
        const s = 0.7 + Math.random() * 1.1;
        setInst(bushes, i, x, s * 0.3, z, Math.random() * Math.PI, s, s * (0.7 + Math.random() * 0.4));
        bushCol.setHSL(dark ? 0.28 : 0.26, dark ? 0.25 : 0.4, (dark ? 0.10 : 0.22) + Math.random() * 0.08);
        bushes.setColorAt(i, bushCol);
    });
    if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
    scene.add(bushes);
    natureMeshes.push(bushes);

    /* --- камни --- */
    const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMat = new THREE.MeshStandardMaterial({
        color: dark ? 0x3a3234 : 0x8d9099, roughness: 0.95, metalness: 0.03,
    });
    const rockCount = 70;
    const rocks = makeInstanced(rockGeo, rockMat, rockCount, true);
    scatter(rockCount, 0.8, 1.0, (x, z, i) => {
        const s = 0.4 + Math.random() * 1.0;
        setInst(rocks, i, x, s * 0.25, z, Math.random() * Math.PI, s, s * 0.8, Math.random() * 0.6);
    });
    scene.add(rocks);
    natureMeshes.push(rocks);

    if (!dark) {
        buildCityDecor();
    } else {
        buildNightDecor();
    }
}

/* ============================================================
   FFA «МЕГАПОЛИС»: фонари, провода, лужи, обломки
   ============================================================ */
function buildCityDecor() {
    const scene = G.scene;

    /* лужи с отражением окружения */
    const puddleMat = new THREE.MeshStandardMaterial({
        color: 0x1a2330, roughness: 0.06, metalness: 0.92,
        transparent: true, opacity: 0.85,
    });
    const puddleGeo = new THREE.CircleGeometry(1, 20);
    const puddles = makeInstanced(puddleGeo, puddleMat, 14);
    puddles.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    scatter(14, 1.6, 1.5, (x, z, i) => {
        const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
        m.setPosition(x, 0.012, z);
        const sc = new THREE.Matrix4().makeScale(1.4 + Math.random() * 2.6, 0.8 + Math.random() * 1.4, 1);
        puddles.setMatrixAt(i, m.multiply(sc));
    });
    scene.add(puddles);
    decorMeshes.push(puddles);

    /* обломки у стен и в лабиринтах */
    const debrisGeo = new THREE.BoxGeometry(0.7, 0.14, 0.22);
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x7a7f88, roughness: 0.9, metalness: 0.08 });
    const debrisCount = 90;
    const debris = makeInstanced(debrisGeo, debrisMat, debrisCount);
    scatter(debrisCount, 0.5, 0.9, (x, z, i) => {
        setInst(debris, i, x, 0.08, z, Math.random() * Math.PI, 0.6 + Math.random() * 1.2, 1, 0.1 + Math.random() * 0.3);
    });
    scene.add(debris);
    decorMeshes.push(debris);

    /* фонари по кольцу и вдоль осей */
    const lampSpots = [];
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        lampSpots.push([Math.cos(a) * 82, Math.sin(a) * 82]);
    }
    for (const d of [-1, 1]) {
        lampSpots.push([d * 130, 20], [d * 130, -20], [20, d * 130], [-20, d * 130]);
    }
    const postGeo = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2e3742, roughness: 0.55, metalness: 0.6 });
    const posts = makeInstanced(postGeo, postMat, lampSpots.length, true);
    const globeGeo = new THREE.SphereGeometry(0.3, 10, 8);
    const globeMat = new THREE.MeshBasicMaterial({ color: 0xaef4ff, toneMapped: false });
    lampGlobes = makeInstanced(globeGeo, globeMat, lampSpots.length);
    lampSpots.forEach(([x, z], i) => {
        setInst(posts, i, x, 3.2, z, 0, 1, 1);
        setInst(lampGlobes, i, x, 6.6, z, 0, 1, 1);
    });
    scene.add(posts);
    scene.add(lampGlobes);
    decorMeshes.push(posts, lampGlobes);

    /* провода между фонарями кольца */
    const pts = [];
    for (let i = 0; i < 12; i++) {
        const [x0, z0] = lampSpots[i];
        const [x1, z1] = lampSpots[(i + 1) % 12];
        const segs = 10;
        for (let k = 0; k < segs; k++) {
            const t0 = k / segs, t1 = (k + 1) / segs;
            const sag = (t) => 6.55 - Math.sin(t * Math.PI) * 0.9;
            pts.push(new THREE.Vector3(x0 + (x1 - x0) * t0, sag(t0), z0 + (z1 - z0) * t0));
            pts.push(new THREE.Vector3(x0 + (x1 - x0) * t1, sag(t1), z0 + (z1 - z0) * t1));
        }
    }
    const cableGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const cables = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x14181e }));
    scene.add(cables);
    decorMeshes.push(cables);
}

/* ============================================================
   Оборона: мёртвые деревья, кости, жаровни
   ============================================================ */
function buildNightDecor() {
    const scene = G.scene;

    const trunkGeo = mergeWithUV([
        new THREE.CylinderGeometry(0.18, 0.3, 4.2, 7).translate(0, 2.1, 0),
        new THREE.CylinderGeometry(0.07, 0.12, 1.8, 5).rotateZ(0.7).translate(0.6, 3.6, 0),
        new THREE.CylinderGeometry(0.05, 0.1, 1.5, 5).rotateZ(-0.9).rotateY(0.6).translate(-0.5, 3.2, 0.2),
        new THREE.CylinderGeometry(0.04, 0.08, 1.2, 5).rotateX(0.9).translate(0.1, 3.9, -0.4),
    ]);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.95, metalness: 0.0 });
    const treeCount = 34;
    const trees = makeInstanced(trunkGeo, trunkMat, treeCount, true);
    scatter(treeCount, 2.0, 2.0, (x, z, i) => {
        const s = 0.8 + Math.random() * 1.3;
        setInst(trees, i, x, 0, z, Math.random() * Math.PI, s, s * (0.85 + Math.random() * 0.3), (Math.random() - 0.5) * 0.12);
    });
    scene.add(trees);
    decorMeshes.push(trees);

    const boneGeo = mergeWithUV([
        new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6).rotateZ(Math.PI / 2).translate(0, 0.05, 0),
        new THREE.SphereGeometry(0.075, 6, 5).translate(-0.27, 0.05, 0),
        new THREE.SphereGeometry(0.075, 6, 5).translate(0.27, 0.05, 0),
    ]);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xb8ac96, roughness: 0.8, metalness: 0.02 });
    const boneCount = 60;
    const bones = makeInstanced(boneGeo, boneMat, boneCount);
    scatter(boneCount, 1.0, 1.0, (x, z, i) => {
        setInst(bones, i, x, 0.02, z, Math.random() * Math.PI, 0.7 + Math.random() * 1.1, 1);
    });
    scene.add(bones);
    decorMeshes.push(bones);

    /* жаровни с дрожащим огнём */
    const flameGeo = new THREE.ConeGeometry(0.3, 0.9, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false, transparent: true, opacity: 0.9 });
    const spots = [[0, 60], [0, -60], [60, 0], [-60, 0], [30, 30], [-30, -30]];
    const bowlGeo = new THREE.CylinderGeometry(0.5, 0.34, 0.4, 10);
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.6, metalness: 0.7 });
    braziers = [];
    for (const [x, z] of spots) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.6, 6), bowlMat);
        pole.position.set(x, 0.8, z);
        const bowl = new THREE.Mesh(bowlGeo, bowlMat);
        bowl.position.set(x, 1.7, z);
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(x, 2.25, z);
        const l = new THREE.PointLight(0xff6a20, 3.2, 14, 2);
        l.position.set(x, 2.3, z);
        scene.add(pole, bowl, flame, l);
        decorMeshes.push(pole, bowl, flame);
        braziers.push({ flame, light: l, seed: Math.random() * 10 });
    }
}

/* ============================================================
   Анимация декора (ветер, огонь)
   ============================================================ */
export function updateDecor(dt) {
    windUniform.value += dt;
    const t = windUniform.value;
    for (const b of braziers) {
        if (!b.flame.visible) continue;
        const f = 0.85 + Math.sin(t * 11 + b.seed) * 0.1 + Math.sin(t * 23 + b.seed * 2) * 0.06;
        b.flame.scale.set(f, 0.85 + Math.sin(t * 17 + b.seed) * 0.18, f);
        b.light.intensity = 2.6 + Math.sin(t * 13 + b.seed) * 0.9;
    }
}
