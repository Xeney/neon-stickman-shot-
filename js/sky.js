import { THREE, G } from './core.js';

/* ============================================================
   НЕБО v2.1: купол, облака, птицы/мыши, дирижабль
   ============================================================ */

let skyMesh = null;
let clouds = [];
let birdData = null;
let blimp = null;
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

function cloudTexture() {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
        const cx = s * 0.5 + (Math.random() - 0.5) * s * 0.62;
        const cy = s * 0.55 + (Math.random() - 0.5) * s * 0.34;
        const r = 18 + Math.random() * 44;
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

export function buildSky(dark = false) {
    const scene = G.scene;
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

        const moon = x.createRadialGradient(s * 0.68, s * 0.24, 0, s * 0.68, s * 0.24, 90);
        moon.addColorStop(0, 'rgba(255,120,90,0.95)');
        moon.addColorStop(0.35, 'rgba(220,70,50,0.55)');
        moon.addColorStop(1, 'rgba(180,40,30,0)');
        x.fillStyle = moon;
        x.beginPath(); x.arc(s * 0.68, s * 0.24, 90, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,150,120,0.9)';
        x.beginPath(); x.arc(s * 0.68, s * 0.24, 34, 0, Math.PI * 2); x.fill();

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

    skyMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2000, 32, 16),
        new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(c),
            side: THREE.BackSide, depthWrite: false, toneMapped: false,
        })
    );
    scene.add(skyMesh);

    /* --- облака --- */
    const ctex = cloudTexture();
    const cloudCount = 10;
    for (let i = 0; i < cloudCount; i++) {
        const mat = new THREE.SpriteMaterial({
            map: ctex, transparent: true, depthWrite: false,
            opacity: dark ? 0.4 : 0.85,
            color: dark ? 0x4a2a2c : 0xffffff,
        });
        const sp = new THREE.Sprite(mat);
        const ang = Math.random() * Math.PI * 2;
        const rad = 300 + Math.random() * 700;
        sp.position.set(Math.cos(ang) * rad, 130 + Math.random() * 160, Math.sin(ang) * rad);
        const sc = 160 + Math.random() * 240;
        sp.scale.set(sc, sc * 0.42, 1);
        sp.userData.speed = (Math.random() * 0.5 + 0.3) * (Math.random() < 0.5 ? -1 : 1);
        clouds.push(sp);
        scene.add(sp);
    }

    if (!dark) {
        buildBirds();
        buildBlimp();
    } else {
        buildBats();
    }
}

/* --- птицы: стая по кругу, взмахи крыльев --- */
function buildBirds() {
    const scene = G.scene;
    const count = 22;
    const wingGeo = new THREE.PlaneGeometry(1.0, 0.34);
    wingGeo.translate(0.5, 0, 0);
    wingGeo.rotateX(-Math.PI / 2);
    const bodyGeo = new THREE.ConeGeometry(0.09, 0.55, 5);
    bodyGeo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x23282e, side: THREE.DoubleSide });
    const wings = new THREE.InstancedMesh(wingGeo, mat, count * 2);
    const bodies = new THREE.InstancedMesh(bodyGeo, mat, count);
    wings.frustumCulled = false;
    bodies.frustumCulled = false;
    const list = [];
    for (let i = 0; i < count; i++) {
        const flock = i % 2;
        list.push({
            cx: flock ? 90 : -130, cz: flock ? -110 : 70,
            r: 70 + Math.random() * 70,
            h: 38 + Math.random() * 22,
            a: Math.random() * Math.PI * 2,
            w: (0.05 + Math.random() * 0.06) * (flock ? 1 : -1),
            phase: Math.random() * 10,
            s: 0.8 + Math.random() * 0.5,
        });
    }
    birdData = { wings, bodies, list, count };
    scene.add(wings, bodies);
}

/* --- мыши (оборона): мелкие, быстрые, хаотичные --- */
function buildBats() {
    const scene = G.scene;
    const count = 16;
    const wingGeo = new THREE.PlaneGeometry(0.6, 0.22);
    wingGeo.translate(0.3, 0, 0);
    wingGeo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0d0a10, side: THREE.DoubleSide });
    const wings = new THREE.InstancedMesh(wingGeo, mat, count * 2);
    wings.frustumCulled = false;
    const list = [];
    for (let i = 0; i < count; i++) {
        list.push({
            cx: (Math.random() - 0.5) * 240, cz: (Math.random() - 0.5) * 240,
            r: 25 + Math.random() * 55,
            h: 16 + Math.random() * 18,
            a: Math.random() * Math.PI * 2,
            w: (0.18 + Math.random() * 0.22) * (Math.random() < 0.5 ? 1 : -1),
            phase: Math.random() * 10,
            s: 0.7 + Math.random() * 0.5,
        });
    }
    birdData = { wings, bodies: null, list, count, bat: true };
    scene.add(wings);
}

function updateFliers(dt, t) {
    if (!birdData) return;
    const { wings, bodies, list, count, bat } = birdData;
    for (let i = 0; i < count; i++) {
        const b = list[i];
        b.a += b.w * dt;
        const jitter = bat ? Math.sin(t * 3.7 + b.phase) * 3 : 0;
        const px = b.cx + Math.cos(b.a) * b.r + jitter;
        const pz = b.cz + Math.sin(b.a) * b.r + jitter * 0.6;
        const py = b.h + Math.sin(t * 1.3 + b.phase) * 2.2;
        const heading = b.w > 0 ? (Math.PI - b.a) : (-b.a);
        const flap = Math.sin(t * (bat ? 16 : 9) + b.phase) * (bat ? 0.75 : 0.55);

        for (let side = 0; side < 2; side++) {
            const sign = side === 0 ? 1 : -1;
            E.set(0, heading, flap * sign * -1, 'YXZ');
            Q.setFromEuler(E);
            M4.compose(
                new THREE.Vector3(px, py, pz), Q,
                new THREE.Vector3(sign * b.s, b.s, b.s));
            wings.setMatrixAt(i * 2 + side, M4);
        }
        if (bodies) {
            E.set(0, heading, 0, 'YXZ');
            Q.setFromEuler(E);
            M4.compose(new THREE.Vector3(px, py, pz), Q, new THREE.Vector3(b.s, b.s, b.s));
            bodies.setMatrixAt(i, M4);
        }
    }
    wings.instanceMatrix.needsUpdate = true;
    if (bodies) bodies.instanceMatrix.needsUpdate = true;
}

/* --- дирижабль над городом --- */
function buildBlimp() {
    const scene = G.scene;
    blimp = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.SphereGeometry(5, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.5, metalness: 0.25 })
    );
    body.scale.set(3.4, 1, 1);
    blimp.add(body);
    const strip = new THREE.Mesh(
        new THREE.BoxGeometry(30, 0.5, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false })
    );
    strip.position.y = 5.3;
    blimp.add(strip);
    const gondola = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 1.6, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x2c3440, roughness: 0.5, metalness: 0.6 })
    );
    gondola.position.y = -5.6;
    blimp.add(gondola);
    const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 4.4, 0.3),
        new THREE.MeshStandardMaterial({ color: 0xff2d88, roughness: 0.5, metalness: 0.4 })
    );
    tail.position.set(-15.5, 1.4, 0);
    tail.rotation.z = 0.5;
    blimp.add(tail);
    blimp.position.set(240, 112, 0);
    scene.add(blimp);
    blimp.userData.a = 0;
}

export function setSkyVisibility(birdsOn, blimpOn) {
    if (birdData) {
        birdData.wings.visible = !!birdsOn;
        if (birdData.bodies) birdData.bodies.visible = !!birdsOn;
    }
    if (blimp) blimp.visible = !!blimpOn;
}

export function updateSky(dt) {
    const t = performance.now() * 0.001;

    for (const cl of clouds) {
        cl.position.x += cl.userData.speed * dt * 6;
        if (cl.position.x > 1100) cl.position.x = -1100;
        if (cl.position.x < -1100) cl.position.x = 1100;
    }

    updateFliers(dt, t);

    if (blimp) {
        blimp.userData.a += dt * 0.0075;
        const a = blimp.userData.a;
        const r = 265;
        blimp.position.set(Math.cos(a) * r, 112 + Math.sin(t * 0.4) * 2.5, Math.sin(a) * r);
        blimp.rotation.y = -a - Math.PI / 2;
    }
}
