import { THREE, G, world, clamp, disposeObj, tracers, impacts, shrapnel, flashes, explosionRings, DOM } from './core.js';
import { AU, spatialSound } from './audio.js';
import { GFX } from './settings.js';

/* ---------- текстуры ---------- */
let smokeTexture = null;
export function getSmokeTexture() {
    if (smokeTexture) return smokeTexture;
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
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

let particleTexture = null;
export function getParticleTexture() {
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

/* ---------- дым ---------- */
export function createSmokeVisual(x, y, z) {
    const N = Math.max(34, Math.round(110 * GFX.effectsFactor));
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
    G.scene.add(pts);
    return { group: pts, mat, geo, baseY: y, spin: (Math.random() - 0.5) * 0.08 + 0.03 };
}

export function removeSmoke(id) {
    const s = world.smokes.get(id);
    if (!s) return;
    G.scene.remove(s.group);
    disposeObj(s.group);
    world.smokes.delete(id);
}

export function removeSmokeSilent(s) {
    for (const [id, v] of world.smokes) {
        if (v === s) {
            G.scene.remove(v.group);
            disposeObj(v.group);
            world.smokes.delete(id);
            return;
        }
    }
}

export function updateSmokes(dt) {
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

/* ---------- трассеры и взрывы ---------- */
export function spawnTracerLimited(x, y, z, dx, dy, dz, color, length) {
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
    G.scene.add(beam);
    tracers.push({ mesh: beam, life: 0.09, age: 0 });
}

export function spawnExplosion(x, y, z) {
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({
            color: 0xffaa33, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })
    );
    sphere.position.set(x, y, z);
    G.scene.add(sphere);
    explosionRings.push({ mesh: sphere, life: 0.6, age: 0, maxScale: 5.0 });

    if (GFX.effectsFactor > 0.5) {
        const light = new THREE.PointLight(0xffaa44, 14, 24, 2);
        light.position.set(x, y + 0.5, z);
        G.scene.add(light);
        setTimeout(() => G.scene.remove(light), 240);
    }

    spawnGoreBurst(new THREE.Vector3(x, y, z), 0xffcc44, 60, 12, 0.4, true);
}

export function spawnGoreBurst(origin, color, count, speed, size, additive = false) {
    count = Math.max(3, Math.round(count * GFX.effectsFactor));
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
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false, toneMapped: false,
    });
    const points = new THREE.Points(geo, mat);
    G.scene.add(points);
    impacts.push({ points, geo, mat, vels, life: 1.3, age: 0 });
}

export function explodeHuman(mesh, color) {
    if (!mesh) return;
    const origin = new THREE.Vector3();
    mesh.getWorldPosition(origin);
    if (GFX.effectsFactor > 0.5) mesh.children.forEach(child => {
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
        G.scene.add(clone);
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
    spawnGoreBurst(new THREE.Vector3(origin.x, origin.y + 1.0, origin.z), 0xaa2233, 26, 10, 0.3);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        color, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    sprite.position.copy(origin); sprite.position.y += 1.0;
    sprite.scale.set(3.5, 3.5, 3.5);
    G.scene.add(sprite);
    flashes.push({ sprite, life: 0.5, age: 0, scale0: 3.5 });
}

export function explodeDemon(mesh, type) {
    if (!mesh) return;
    const origin = new THREE.Vector3();
    mesh.getWorldPosition(origin);
    origin.y += 1.0;

    mesh.children.forEach(child => {
        if (!child.visible || GFX.effectsFactor <= 0.5) return;
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
        G.scene.add(clone);
        shrapnel.push({
            mesh: clone,
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 16, 5 + Math.random() * 10, (Math.random() - 0.5) * 16),
            angVel: new THREE.Vector3(
                (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
            life: 1.5, age: 0,
        });
    });

    spawnGoreBurst(origin, 0xbb1414, 60, 16, 0.5);
    spawnGoreBurst(origin, 0x4a0505, 40, 11, 0.75);

    if (GFX.effectsFactor > 0.5) {
        const light = new THREE.PointLight(0xff2200, 16, 20, 2);
        light.position.copy(origin);
        G.scene.add(light);
        setTimeout(() => G.scene.remove(light), 220);
    }

    const ring = new THREE.Mesh(
        new THREE.SphereGeometry(1, 14, 10),
        new THREE.MeshBasicMaterial({
            color: 0x991111, transparent: true, opacity: 0.55,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })
    );
    ring.position.set(origin.x, 0.5, origin.z);
    G.scene.add(ring);
    explosionRings.push({ mesh: ring, life: 0.5, age: 0, maxScale: 3.2 });

    const snd = spatialSound(origin);
    AU.demonExplode(snd.pan, Math.max(0.25, snd.vol));
}

export function spawnAcidSplash(pos) {
    spawnGoreBurst(pos, 0x77ee44, 14, 6.5, 0.2, true);
}

export function spawnClawFX(pos) {
    for (let i = -1; i <= 1; i++) {
        const a = (Math.random() - 0.5) * 1.2;
        const dx = Math.sin(a + i * 0.4) * 0.3;
        const dz = Math.cos(a + i * 0.4) * 0.3;
        spawnTracerLimited(pos.x - dx * 0.5, pos.y + 0.3 + i * 0.12, pos.z - dz * 0.5,
                           dx, 0.05, dz, 0xff3333, 1.1);
    }
}

/* ---------- ядерный взрыв (награда за босса) ---------- */
export function spawnNuke(x, z) {
    const white = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        })
    );
    white.position.set(x, 5, z);
    G.scene.add(white);
    explosionRings.push({ mesh: white, life: 2.2, age: 0, maxScale: 42 });

    const colors = [0xffaa33, 0xff5533, 0x882222];
    for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 12),
            new THREE.MeshBasicMaterial({
                color: colors[i], transparent: true, opacity: 0.85,
                blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
            })
        );
        s.position.set(x, 2 + i * 3.5, z);
        G.scene.add(s);
        explosionRings.push({ mesh: s, life: 1.6 + i * 0.4, age: 0, maxScale: 18 + i * 9 });
    }
    spawnGoreBurst(new THREE.Vector3(x, 3, z), 0xffcc44, 120, 30, 0.6, true);
    spawnGoreBurst(new THREE.Vector3(x, 2, z), 0x3a3a3a, 90, 22, 0.9);
    world.flashScreen = { t: 0, dur: 2.2, int: 1 };
    world.shake = 1.2;
    AU.nuke();
}

export function updateEffects(dt) {
    for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.age += dt;
        t.mesh.material.opacity = Math.max(0, 0.85 * (1 - t.age / t.life));
        if (t.age >= t.life) {
            G.scene.remove(t.mesh);
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
            G.scene.remove(e.points);
            e.geo.dispose(); e.mat.dispose();
            impacts.splice(i, 1);
        }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.age += dt;
        if (f.age >= f.life) {
            G.scene.remove(f.sprite);
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
            G.scene.remove(s.mesh);
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
            G.scene.remove(e.mesh);
            e.mesh.geometry.dispose(); e.mesh.material.dispose();
            explosionRings.splice(i, 1);
        }
    }
}

/* ---------- кислотные снаряды ---------- */
export function createAcidGlob(msg) {
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
    G.scene.add(g);
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

export function removeAcid(id) {
    const g = world.acidGlobs.get(id);
    if (!g) return;
    G.scene.remove(g.mesh);
    disposeObj(g.mesh);
    world.acidGlobs.delete(id);
}

export function acidPop(msg) {
    removeAcid(msg.id);
    const pos = new THREE.Vector3(msg.x, msg.y, msg.z);
    spawnAcidSplash(pos);
    const snd = spatialSound(pos);
    AU.acidSizzle(snd.pan, Math.max(0.2, snd.vol));
}

export function updateAcid(dt) {
    for (const [id, g] of world.acidGlobs) {
        g.age += dt;
        g.mesh.position.x += g.vx * dt;
        g.mesh.position.z += g.vz * dt;
        g.mesh.position.y = 1.6 + Math.sin(g.age * 22) * 0.06;
        if (g.age >= g.life) removeAcid(id);
    }
}

/* ---------- прочее ---------- */
export function updatePickups(dt) {
    const t = performance.now() * 0.001;
    for (const p of world.pickups.values()) {
        if (!p.mesh) continue;
        p.mesh.rotation.y += dt * 1.8;
        p.mesh.position.y = 0.2 + Math.sin(t * 2.4 + p.x) * 0.09;
    }
}

export function updateNameLabels() {
    for (const r of world.remote.values()) {
        const label = r.mesh.userData.label;
        if (!label) continue;
        let hidden = false;
        if (r.mesh.position.distanceToSquared(G.camera.position) < 22) {
            hidden = true;
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

export function updateFlashScreen(dt) {
    if (!DOM.flashOverlay) return;
    const f = world.flashScreen;
    if (!f) return;
    f.t += dt;
    let o = 0;
    if (f.t < f.dur) {
        o = 1;
    } else if (f.t < f.dur + 0.6) {
        o = 1 - (f.t - f.dur) / 0.6;
    } else {
        world.flashScreen = null;
    }
    DOM.flashOverlay.style.opacity = o.toFixed(3);
}

/* ---------- меши гранат / аптечек / патронов ---------- */
export function createGrenadeMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'smoke') {
        g.add(new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.13, 0.34, 12),
            new THREE.MeshStandardMaterial({ color: 0x5a636e, roughness: 0.5, metalness: 0.6 })
        ));
        g.add(new THREE.Mesh(
            new THREE.CylinderGeometry(0.135, 0.135, 0.07, 12),
            new THREE.MeshBasicMaterial({ color: 0xd8dee6, toneMapped: false })
        ));
    } else if (kind === 'flash') {
        g.add(new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12),
            new THREE.MeshStandardMaterial({ color: 0x3d3a30, roughness: 0.45, metalness: 0.7 })
        ));
        g.add(new THREE.Mesh(
            new THREE.CylinderGeometry(0.125, 0.125, 0.08, 12),
            new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false })
        ));
    } else {
        g.add(new THREE.Mesh(
            new THREE.SphereGeometry(0.16, 12, 10),
            new THREE.MeshStandardMaterial({
                color: 0x3a4a3a, roughness: 0.6, metalness: 0.4,
                emissive: 0xff2200, emissiveIntensity: 0.35,
            })
        ));
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

export function createMedkitMesh() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.4, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6, emissive: 0x224422, emissiveIntensity: 0.25 })
    ));
    const crossMat = new THREE.MeshBasicMaterial({ color: 0x22ff66, toneMapped: false });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.12), crossMat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.5), crossMat));
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

export function createPickupMesh() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.4, 0.55),
        new THREE.MeshStandardMaterial({
            color: 0x3a3320, roughness: 0.5, metalness: 0.6,
            emissive: 0xffaa22, emissiveIntensity: 0.5,
        })
    ));
    g.add(new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.1, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false })
    ));
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

export function updateMedkits(dt) {
    const t = performance.now() * 0.001;
    for (const m of world.medkits.values()) {
        if (!m.mesh || !m.mesh.visible) continue;
        m.mesh.rotation.y += dt * 1.5;
        m.mesh.position.y = 0.2 + Math.sin(t * 2 + m.x) * 0.08;
    }
}

export function updateGrenadeMeshes(dt) {
    for (const g of world.grenades.values()) {
        g.mesh.position.lerp(g.target, 1 - Math.exp(-18 * dt));
        const ring = g.mesh.userData.ring;
        if (ring) ring.rotation.z += dt * 6;
    }
}
