"""
NEON STICKMAN SHOT — FPS Arena Server v4.0 "MAXIMUM NEON ARENA"
- HTTP      (8080): раздача статики
- WebSocket (8001): игровой протокол, 30 тиков/сек
- 16 ботов с тактическими классами (Призрак / Джаггернаут / Штурмовик)
- Пространственный хеш карты, резерв патронов, lag compensation,
  выпадение патронов, гранаты: фраг / дым / флеш, киллстрики.

Запуск: python server.py
"""

import asyncio
import json
import math
import random
import socket
import threading
import time
import uuid
from collections import deque
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import websockets

HTTP_PORT = 8080
WS_PORT = 8001
TICK_RATE = 30
TICK_INTERVAL = 1.0 / TICK_RATE

ARENA_HALF = 200.0
SPAWN_RANGE = 165.0

HEAD_OFFSET = 1.65
HEAD_RADIUS = 0.25
BODY_OFFSET = 1.00
BODY_RADIUS = 0.55
MUZZLE_HEIGHT = 1.70
HEADSHOT_MULT = 2.0

SHOOT_RANGE = 200.0
RESPAWN_TIME = 3.0
MAX_BOTS = 16

GRID_CELL = 20.0
RESERVE_MAGS = 3
PICKUP_LIFE = 45.0
PICKUP_CAP = 20
LAGCOMP_MAX = 0.25
HIST_LEN = 12

WEAPONS = {
    "pistol":   {"damage": 20, "cooldown": 0.20, "pellets": 1, "spread": 0.006, "auto": False, "falloff": 0.50, "mag": 15, "reload": 1.4},
    "revolver": {"damage": 45, "cooldown": 0.70, "pellets": 1, "spread": 0.004, "auto": False, "falloff": 0.60, "mag": 6,  "reload": 1.9},
    "dmr":      {"damage": 38, "cooldown": 0.30, "pellets": 1, "spread": 0.006, "auto": False, "falloff": 0.25, "mag": 12, "reload": 1.8},
    "rifle":    {"damage": 16, "cooldown": 0.095,"pellets": 1, "spread": 0.010, "auto": True,  "falloff": 0.35, "mag": 30, "reload": 2.0},
    "burst":    {"damage": 21, "cooldown": 0.55, "pellets": 3, "spread": 0.012, "auto": False, "falloff": 0.30, "mag": 30, "reload": 2.1},
    "smg":      {"damage": 11, "cooldown": 0.060,"pellets": 1, "spread": 0.022, "auto": True,  "falloff": 0.55, "mag": 35, "reload": 1.7},
    "lmg":      {"damage": 19, "cooldown": 0.100,"pellets": 1, "spread": 0.028, "auto": True,  "falloff": 0.30, "mag": 80, "reload": 3.4},
    "shotgun":  {"damage": 9,  "cooldown": 0.80, "pellets": 8, "spread": 0.075, "auto": False, "falloff": 0.85, "mag": 7,  "reload": 2.6},
    "sniper":   {"damage": 85, "cooldown": 1.30, "pellets": 1, "spread": 0.000, "auto": False, "falloff": 0.05, "mag": 8,  "reload": 2.8},
}
VALID_WEAPONS = tuple(WEAPONS.keys())
BOT_WEAPONS = ("pistol", "revolver", "smg", "rifle", "burst", "dmr", "lmg", "shotgun", "sniper")

GRENADE_FUSE = 2.0
GRENADE_RADIUS = 9.0
GRENADE_DAMAGE = 95
SMOKE_RADIUS = 3.6
SMOKE_LIFE = 12.0
FLASH_RANGE = 46.0
GRENADE_TYPES = ("frag", "smoke", "flash")
GRENADE_START = {"frag": 2, "smoke": 1, "flash": 1}
GRENADE_CAP = {"frag": 4, "smoke": 3, "flash": 3}

MEDKIT_HEAL = 50
MEDKIT_RESPAWN = 22.0

BLUE_COLORS = [0x0A84FF, 0x5AC8FA, 0x409CFF, 0x64D2FF, 0x1E90FF, 0x3FA9FF]
RED_COLORS = [0xFF3B30, 0xFF453A, 0xFF6B6B, 0xFF5E3A, 0xE63946, 0xFF4D4D]

BOT_NAMES = ["Rex","Bolt","Nyx","Zed","Ash","Kilo","Volt","Fang","Grit","Neon","Spark","Rogue","Vex","Drex","Hexa","Rumble"]

BASE_DIR = Path(__file__).resolve().parent

players: dict[str, dict] = {}
clients: dict[str, object] = {}
bots: dict[str, dict] = {}
grenades: dict[str, dict] = {}
medkits: dict[str, dict] = {}
smokes: dict[str, dict] = {}
pickups: dict[str, dict] = {}
player_hist: dict[str, deque] = {}


# ============================================================
#  КАРТА (должна совпадать с game.js)
# ============================================================
def build_wall_list():
    walls = []
    A = ARENA_HALF
    T = 3.0
    H = 16.0

    walls.append((0, A, A, T / 2, H, "outer"))
    walls.append((0, -A, A, T / 2, H, "outer"))
    walls.append((A, 0, T / 2, A, H, "outer"))
    walls.append((-A, 0, T / 2, A, H, "outer"))

    S, door, th, h = 42.0, 9.0, 2.4, 6.2
    half = S / 2
    seg = (S - door) / 2
    for sx in (-1, 1):
        cx = sx * (S / 2 - seg / 2)
        walls.append((cx, half, seg / 2, th / 2, h, "cwall"))
        walls.append((cx, -half, seg / 2, th / 2, h, "cwall"))
    for sz in (-1, 1):
        cz = sz * (S / 2 - seg / 2)
        walls.append((half, cz, th / 2, seg / 2, h, "cwall"))
        walls.append((-half, cz, th / 2, seg / 2, h, "cwall"))
    for dx, dz in ((-14, -14), (14, -14), (14, 14), (-14, 14)):
        walls.append((dx, dz, 1.1, 1.1, h, "pillar"))

    for qx in (-1, 1):
        for qz in (-1, 1):
            cx, cz = qx * 100.0, qz * 100.0
            s2, h2, th2, d2 = 34.0, 5.6, 2.0, 8.0
            seg2 = (s2 - d2) / 2
            half2 = s2 / 2
            for sx in (-1, 1):
                x = cx + sx * (s2 / 2 - seg2 / 2)
                walls.append((x, cz + half2, seg2 / 2, th2 / 2, h2, "bwall"))
                walls.append((x, cz - half2, seg2 / 2, th2 / 2, h2, "bwall"))
            for sz in (-1, 1):
                z = cz + sz * (s2 / 2 - seg2 / 2)
                walls.append((cx + half2, z, th2 / 2, seg2 / 2, h2, "bwall"))
                walls.append((cx - half2, z, th2 / 2, seg2 / 2, h2, "bwall"))

    for tx in (-1, 1):
        for tz in (-1, 1):
            cx, cz = tx * 162.0, tz * 162.0
            s3, h3, th3, d3 = 14.0, 9.5, 1.8, 6.0
            seg3 = (s3 - d3) / 2
            half3 = s3 / 2
            for sx in (-1, 1):
                x = cx + sx * (s3 / 2 - seg3 / 2)
                walls.append((x, cz + half3, seg3 / 2, th3 / 2, h3, "tower"))
                walls.append((x, cz - half3, seg3 / 2, th3 / 2, h3, "tower"))
            for sz in (-1, 1):
                z = cz + sz * (s3 / 2 - seg3 / 2)
                walls.append((cx + half3, z, th3 / 2, seg3 / 2, h3, "tower"))
                walls.append((cx - half3, z, th3 / 2, seg3 / 2, h3, "tower"))

    lanes = (-146.0, -92.0, -38.0, 38.0, 92.0, 146.0)
    for off in (-58.0, 58.0):
        for zc in lanes:
            walls.append((off, zc, 0.8, 13.0, 3.4, "lane"))
            walls.append((zc, off, 13.0, 0.8, 3.4, "lane"))

    covers = [
        (30, 10, 3.0, 0.6), (30, -10, 3.0, 0.6), (-30, 10, 3.0, 0.6), (-30, -10, 3.0, 0.6),
        (10, 30, 0.6, 3.0), (-10, 30, 0.6, 3.0), (10, -30, 0.6, 3.0), (-10, -30, 0.6, 3.0),
        (125, 0, 6.0, 0.7), (-125, 0, 6.0, 0.7), (0, 125, 0.7, 6.0), (0, -125, 0.7, 6.0),
        (85, 45, 2.4, 0.6), (85, -45, 2.4, 0.6), (-85, 45, 2.4, 0.6), (-85, -45, 2.4, 0.6),
        (45, 85, 0.6, 2.4), (45, -85, 0.6, 2.4), (-45, 85, 0.6, 2.4), (-45, -85, 0.6, 2.4),
    ]
    for (x, z, hw, hd) in covers:
        walls.append((x, z, hw, hd, 1.5, "cover"))

    clusters = [(70, 20), (20, 70), (-70, 20), (-20, 70),
                (70, -20), (20, -70), (-70, -20), (-20, -70)]
    offsets = [(0.0, 0.0), (2.05, 0.3), (0.4, 2.05)]
    for (cx, cz) in clusters:
        for (ox, oz) in offsets:
            walls.append((cx + ox, cz + oz, 0.85, 0.85, 1.7, "crate"))

    barrels = [(150, 30), (150, -30), (-150, 30), (-150, -30),
               (30, 150), (-30, 150), (30, -150), (-30, -150),
               (120, 120), (120, -120), (-120, 120), (-120, -120)]
    for (x, z) in barrels:
        walls.append((x, z, 0.55, 0.55, 2.1, "barrel"))

    return walls


WALLS = build_wall_list()
WALL_BOXES = [(w[0], w[1], w[2], w[3], w[4]) for w in WALLS]


# ============================================================
#  ПРОСТРАНСТВЕННЫЙ ХЕШ (сетка 20x20)
# ============================================================
_wall_cells: dict[tuple[int, int], list[int]] = {}


def _cell_range(v0: float, v1: float):
    return range(int(math.floor(v0 / GRID_CELL)), int(math.floor(v1 / GRID_CELL)) + 1)


def build_wall_grid():
    _wall_cells.clear()
    for i, (wx, wz, hw, hd, _h) in enumerate(WALL_BOXES):
        for cx in _cell_range(wx - hw, wx + hw):
            for cz in _cell_range(wz - hd, wz + hd):
                _wall_cells.setdefault((cx, cz), []).append(i)


def walls_near(x: float, z: float, r: float) -> list[int]:
    """Индексы стен в ячейках вокруг точки (дедуплицировано)."""
    seen = set()
    out = []
    for cx in _cell_range(x - r, x + r):
        for cz in _cell_range(z - r, z + r):
            cell = _wall_cells.get((cx, cz))
            if not cell:
                continue
            for i in cell:
                if i not in seen:
                    seen.add(i)
                    out.append(i)
    return out


def walls_in_seg(ax: float, az: float, bx: float, bz: float, pad: float = 0.0) -> list[int]:
    x0, x1 = (ax, bx) if ax <= bx else (bx, ax)
    z0, z1 = (az, bz) if az <= bz else (bz, az)
    return walls_near((x0 + x1) / 2, (z0 + z1) / 2,
                      max(x1 - x0, z1 - z0) / 2 + pad + GRID_CELL * 0.5)


def wall_at_point(x: float, z: float, clr: float = 0.0) -> bool:
    for i in walls_near(x, z, clr):
        wx, wz, hw, hd, h = WALL_BOXES[i]
        if h < 0.8:
            continue
        if abs(x - wx) < hw + clr and abs(z - wz) < hd + clr:
            return True
    return False


def seg_box_2d(ax, az, bx, bz, wx, wz, hw, hd) -> bool:
    dx = bx - ax
    dz = bz - az
    tmin = 0.0
    tmax = 1.0
    for (o, d, lo, hi) in ((ax, dx, wx - hw, wx + hw), (az, dz, wz - hd, wz + hd)):
        if abs(d) < 1e-9:
            if o < lo or o > hi:
                return False
        else:
            t1 = (lo - o) / d
            t2 = (hi - o) / d
            if t1 > t2:
                t1, t2 = t2, t1
            if t1 > tmin:
                tmin = t1
            if t2 < tmax:
                tmax = t2
            if tmin > tmax:
                return False
    return True


def seg_clear(ax, az, bx, bz, clr: float = 0.0, min_h: float = 0.0) -> bool:
    for i in walls_in_seg(ax, az, bx, bz, clr):
        wx, wz, hw, hd, h = WALL_BOXES[i]
        if h < min_h:
            continue
        if seg_box_2d(ax, az, bx, bz, wx, wz, hw + clr, hd + clr):
            return False
    return True


def seg_smoke_blocked(ax, az, bx, bz) -> bool:
    dx = bx - ax
    dz = bz - az
    seg_len2 = dx * dx + dz * dz
    if seg_len2 < 1e-6:
        return False
    for s in smokes.values():
        px = s["x"] - ax
        pz = s["z"] - az
        t = (px * dx + pz * dz) / seg_len2
        if t < 0.0 or t > 1.0:
            continue
        cx = ax + dx * t - s["x"]
        cz = az + dz * t - s["z"]
        if cx * cx + cz * cz < SMOKE_RADIUS * SMOKE_RADIUS:
            return True
    return False


def los_clear(ax, az, bx, bz, use_smoke: bool = True) -> bool:
    if not seg_clear(ax, az, bx, bz, 0.0, 1.25):
        return False
    if use_smoke and smokes and seg_smoke_blocked(ax, az, bx, bz):
        return False
    return True


# ============================================================
#  НАВИГАЦИЯ
# ============================================================
NAV_STEP = 15.0
NAV_CLEAR = 2.1
NAV_LIMIT = 13

nav_pts: list[tuple[float, float]] = []
nav_lookup: dict[tuple[int, int], int] = {}
nav_adj: list[list[int]] = []


def build_nav():
    global nav_pts, nav_lookup, nav_adj
    nav_pts = []
    nav_lookup = {}
    nav_adj = []

    def add_pt(x: float, z: float, clr: float = NAV_CLEAR):
        if wall_at_point(x, z, clr):
            return None
        key = (round(x), round(z))
        if key in nav_lookup:
            return nav_lookup[key]
        idx = len(nav_pts)
        nav_pts.append((x, z))
        nav_lookup[key] = idx
        return idx

    for ix in range(-NAV_LIMIT, NAV_LIMIT + 1):
        for iz in range(-NAV_LIMIT, NAV_LIMIT + 1):
            add_pt(ix * NAV_STEP, iz * NAV_STEP)

    portals = []
    portals += [(0, 21), (0, -21), (21, 0), (-21, 0)]
    for qx in (-1, 1):
        for qz in (-1, 1):
            cx, cz = qx * 100.0, qz * 100.0
            portals += [(cx, cz + 17), (cx, cz - 17), (cx + 17, cz), (cx - 17, cz)]
    for tx in (-1, 1):
        for tz in (-1, 1):
            cx, cz = tx * 162.0, tz * 162.0
            portals += [(cx, cz + 7), (cx, cz - 7), (cx + 7, cz), (cx - 7, cz)]
    portal_idx = []
    for (x, z) in portals:
        i = add_pt(x, z, 1.8)
        if i is not None:
            portal_idx.append(i)

    nav_adj = [[] for _ in nav_pts]
    for ix in range(-NAV_LIMIT, NAV_LIMIT + 1):
        for iz in range(-NAV_LIMIT, NAV_LIMIT + 1):
            i = nav_lookup.get((round(ix * NAV_STEP), round(iz * NAV_STEP)))
            if i is None:
                continue
            for (dx, dz) in ((1, 0), (0, 1), (1, 1), (1, -1)):
                ni = nav_lookup.get((round((ix + dx) * NAV_STEP), round((iz + dz) * NAV_STEP)))
                if ni is None:
                    continue
                ax, az = nav_pts[i]
                bx, bz = nav_pts[ni]
                if seg_clear(ax, az, bx, bz, 0.9, 1.0):
                    nav_adj[i].append(ni)
                    nav_adj[ni].append(i)
    for i in portal_idx:
        ax, az = nav_pts[i]
        for j in range(len(nav_pts)):
            if i == j:
                continue
            bx, bz = nav_pts[j]
            d2 = (ax - bx) ** 2 + (az - bz) ** 2
            if d2 > 900.0:
                continue
            if seg_clear(ax, az, bx, bz, 0.9, 1.0):
                if j not in nav_adj[i]:
                    nav_adj[i].append(j)
                    nav_adj[j].append(i)


def nearest_nav(x: float, z: float):
    if not nav_pts:
        return None
    best = None
    best_d = 1e18
    for i, (px, pz) in enumerate(nav_pts):
        d = (px - x) ** 2 + (pz - z) ** 2
        if d < best_d:
            best_d = d
            best = i
    return best


def find_path(sx: float, sz: float, gx: float, gz: float):
    start = nearest_nav(sx, sz)
    goal = nearest_nav(gx, gz)
    if start is None or goal is None:
        return [(gx, gz)]
    if start == goal:
        return [(gx, gz)]
    parent = [-1] * len(nav_pts)
    parent[start] = start
    q = deque([start])
    while q:
        cur = q.popleft()
        if cur == goal:
            break
        for nb in nav_adj[cur]:
            if parent[nb] == -1:
                parent[nb] = cur
                q.append(nb)
    if parent[goal] == -1:
        return [(gx, gz)]
    chain = []
    cur = goal
    while cur != start:
        chain.append(nav_pts[cur])
        cur = parent[cur]
    chain.reverse()
    smooth = []
    cur = (sx, sz)
    i = 0
    while i < len(chain):
        j = len(chain) - 1
        chosen = None
        while j > i:
            if seg_clear(cur[0], cur[1], chain[j][0], chain[j][1], 0.8, 1.0):
                chosen = j
                break
            j -= 1
        if chosen is None:
            smooth.append(chain[i])
            cur = chain[i]
            i += 1
        else:
            smooth.append(chain[chosen])
            cur = chain[chosen]
            i = chosen + 1
    if not smooth or abs(smooth[-1][0] - gx) + abs(smooth[-1][1] - gz) > 2.0:
        if seg_clear(cur[0], cur[1], gx, gz, 0.6, 1.0):
            smooth.append((gx, gz))
    return smooth


# ============================================================
#  ГЕОМЕТРИЯ
# ============================================================
def ray_sphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r):
    lx, ly, lz = cx - ox, cy - oy, cz - oz
    tca = lx * dx + ly * dy + lz * dz
    if tca < 0:
        return None
    l2 = lx * lx + ly * ly + lz * lz
    d2 = l2 - tca * tca
    r2 = r * r
    if d2 > r2:
        return None
    thc = math.sqrt(r2 - d2)
    t0 = tca - thc
    if t0 < 0:
        t0 = tca + thc
    return t0


def ray_aabb(ox, oy, oz, dx, dy, dz, wx, wz, hw, hd, h):
    if abs(dx) < 1e-8: dx = 1e-8
    if abs(dy) < 1e-8: dy = 1e-8
    if abs(dz) < 1e-8: dz = 1e-8
    tmin = -math.inf
    tmax = math.inf
    bounds = [
        (ox, dx, wx - hw, wx + hw),
        (oy, dy, 0.0, h),
        (oz, dz, wz - hd, wz + hd),
    ]
    for (o, d, lo, hi) in bounds:
        t1 = (lo - o) / d
        t2 = (hi - o) / d
        if t1 > t2:
            t1, t2 = t2, t1
        tmin = max(tmin, t1)
        tmax = min(tmax, t2)
        if tmin > tmax:
            return None
    if tmax < 0:
        return None
    return max(tmin, 0.0)


def wall_dist(ox, oy, oz, dx, dy, dz):
    ex = ox + dx * SHOOT_RANGE
    ez = oz + dz * SHOOT_RANGE
    best = None
    for i in walls_in_seg(ox, oz, ex, ez):
        wx, wz, hw, hd, h = WALL_BOXES[i]
        t = ray_aabb(ox, oy, oz, dx, dy, dz, wx, wz, hw, hd, h)
        if t is not None and t >= 0:
            if best is None or t < best:
                best = t
    return best


def smoke_ray_dist(ox, oy, oz, dx, dy, dz):
    best = None
    for s in smokes.values():
        t = ray_sphere(ox, oy, oz, dx, dy, dz, s["x"], 1.6, s["z"], SMOKE_RADIUS)
        if t is not None and t >= 0:
            if best is None or t < best:
                best = t
    return best


def make_spawn() -> tuple[float, float, float]:
    for _ in range(60):
        angle = random.uniform(0, math.tau)
        radius = random.uniform(SPAWN_RANGE * 0.5, SPAWN_RANGE)
        x = math.cos(angle) * radius
        z = math.sin(angle) * radius
        if wall_at_point(x, z, 2.2):
            continue
        safe = True
        for p in players.values():
            if p.get("is_dead"):
                continue
            if (p["x"] - x) ** 2 + (p["z"] - z) ** 2 < 30 * 30:
                safe = False
                break
        if safe:
            ry = math.atan2(-x, -z)
            return x, z, ry
    x = 0.0
    z = SPAWN_RANGE
    return x, z, math.atan2(-x, -z)


def make_medkits():
    medkits.clear()
    for (x, z) in MEDKIT_SPOTS:
        if wall_at_point(x, z, 1.0):
            continue
        mid = uuid.uuid4().hex[:6]
        medkits[mid] = {"id": mid, "x": float(x), "z": float(z),
                        "available": True, "respawn_at": 0.0}


MEDKIT_SPOTS = [
    (40, 40), (40, -40), (-40, 40), (-40, -40),
    (0, 60), (0, -60), (60, 0), (-60, 0),
    (100, 60), (60, 100), (-100, 60), (-60, 100),
    (100, -60), (60, -100), (-100, -60), (-60, -100),
]


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ============================================================
#  СЕТЬ
# ============================================================
async def broadcast(payload: dict) -> None:
    data = json.dumps(payload)
    dead = []
    for pid, ws in list(clients.items()):
        try:
            await ws.send(data)
        except Exception:
            dead.append(pid)
    for pid in dead:
        await drop_player(pid)


async def send_to(pid: str, payload: dict) -> None:
    ws = clients.get(pid)
    if ws is None:
        return
    try:
        await ws.send(json.dumps(payload))
    except Exception:
        await drop_player(pid)


async def drop_player(pid: str) -> None:
    clients.pop(pid, None)
    if players.pop(pid, None) is not None:
        bots.pop(pid, None)
        player_hist.pop(pid, None)
        print(f"[WS] - {pid}. В игре: {len(players)}")


# ============================================================
#  LAG COMPENSATION (история позиций)
# ============================================================
def hist_push(p: dict, now: float) -> None:
    pid = p.get("id")
    if pid is None:
        return
    h = player_hist.get(pid)
    if h is None:
        h = deque(maxlen=HIST_LEN)
        player_hist[pid] = h
    h.append((now, p["x"], p["z"], p.get("y", 0.0)))


def hist_at(pid: str, t: float):
    """Возвращает (x, y, z) позицию на момент времени t."""
    h = player_hist.get(pid)
    if not h or len(h) < 2:
        return None
    if t <= h[0][0]:
        e = h[0]
        return e[1], e[3], e[2]
    if t >= h[-1][0]:
        e = h[-1]
        return e[1], e[3], e[2]
    for i in range(1, len(h)):
        t1 = h[i][0]
        if t1 >= t:
            t0, x0, z0, y0 = h[i - 1]
            tt, x1, z1, y1 = h[i]
            k = (t - t0) / max(1e-6, tt - t0)
            return (x0 + (x1 - x0) * k,
                    y0 + (y1 - y0) * k,
                    z0 + (z1 - z0) * k)
    e = h[-1]
    return e[1], e[3], e[2]


# ============================================================
#  БОЙ
# ============================================================
def hitscan(shooter_pid: str, dx: float, dy: float, dz: float,
            base_damage: float, falloff: float, rewind_s: float = 0.0):
    s = players.get(shooter_pid)
    if not s:
        return None
    ox, oy, oz = s["x"], s["y"] + MUZZLE_HEIGHT, s["z"]

    wall_t = wall_dist(ox, oy, oz, dx, dy, dz)
    if wall_t is None:
        wall_t = SHOOT_RANGE * 2
    smoke_t = smoke_ray_dist(ox, oy, oz, dx, dy, dz)
    if smoke_t is not None and smoke_t < wall_t:
        wall_t = smoke_t

    rewound = None
    if rewind_s > 0.001:
        rewound = time.time() - min(rewind_s, LAGCOMP_MAX)

    best = None
    for opid, op in players.items():
        if opid == shooter_pid or op.get("is_dead"):
            continue
        tx, ty, tz = op["x"], op["y"], op["z"]
        if rewound is not None:
            hpos = hist_at(opid, rewound)
            if hpos:
                tx, ty, tz = hpos
        th = ray_sphere(ox, oy, oz, dx, dy, dz,
                        tx, ty + HEAD_OFFSET, tz, HEAD_RADIUS)
        tb = ray_sphere(ox, oy, oz, dx, dy, dz,
                        tx, ty + BODY_OFFSET, tz, BODY_RADIUS)

        chosen = None
        head = False
        if th is not None and (tb is None or th <= tb):
            chosen, head = th, True
        elif tb is not None:
            chosen, head = tb, False
        if chosen is None or chosen > SHOOT_RANGE:
            continue
        if chosen >= wall_t:
            continue
        if best is None or chosen < best[1]:
            best = (opid, chosen, head)

    if best is None:
        return None
    _, dist, head = best
    falloff_factor = max(0.35, 1.0 - falloff * (dist / SHOOT_RANGE))
    return best[0], dist, head, base_damage * falloff_factor


MULTI_LABELS = {2: "ДВОЙНОЕ УБИЙСТВО", 3: "ТРОЙНОЕ УБИЙСТВО", 4: "КВАДРА-КИЛЛ", 5: "МЕГА-КИЛЛ", 6: "УЛЬТРА-КИЛЛ"}


def finish_reload(p: dict) -> None:
    """Завершает перезарядку: переносит патроны из резерва в магазин."""
    if p.get("reload_end", 0.0) <= 0.0 or time.time() < p["reload_end"]:
        return
    wp = WEAPONS.get(p.get("weapon", "rifle"), WEAPONS["rifle"])
    need = max(0, wp["mag"] - int(p.get("ammo", 0)))
    take = min(int(p.get("reserve", 0)), need)
    p["ammo"] = int(p.get("ammo", 0)) + take
    p["reserve"] = int(p.get("reserve", 0)) - take
    if p.get("is_bot") and p["reserve"] < wp["mag"]:
        p["reserve"] = 10 ** 9
    p["reload_end"] = 0.0


def spawn_pickup(x: float, z: float) -> None:
    now = time.time()
    if len(pickups) >= PICKUP_CAP:
        oldest = min(pickups, key=lambda k: pickups[k]["born"])
        pickups.pop(oldest, None)
    pkid = "pk_" + uuid.uuid4().hex[:6]
    pickups[pkid] = {"id": pkid, "x": round(x, 2), "z": round(z, 2),
                     "born": now, "until": now + PICKUP_LIFE}


async def process_shoot(shooter_pid: str, msg: dict) -> None:
    shooter = players.get(shooter_pid)
    if not shooter or shooter.get("is_dead"):
        return

    now = time.time()
    weapon = shooter.get("weapon", "rifle")
    wp = WEAPONS.get(weapon, WEAPONS["rifle"])
    mag = wp["mag"]

    finish_reload(shooter)
    if now < shooter.get("reload_end", 0.0):
        return
    if now - shooter.get("last_shot", 0.0) < wp["cooldown"]:
        return

    ammo = int(shooter.get("ammo", mag))
    if ammo <= 0:
        if int(shooter.get("reserve", 0)) > 0:
            shooter["reload_end"] = now + wp["reload"]
        await send_to(shooter_pid, {"type": "no_ammo"})
        return
    shooter["last_shot"] = now
    ammo -= 1
    shooter["ammo"] = ammo
    if ammo <= 0 and int(shooter.get("reserve", 0)) > 0:
        shooter["reload_end"] = now + wp["reload"]

    try:
        ry = float(msg.get("ry", shooter.get("ry", 0.0)))
        rx = float(msg.get("rx", shooter.get("rx", 0.0)))
    except (TypeError, ValueError):
        ry, rx = shooter.get("ry", 0.0), shooter.get("rx", 0.0)
    try:
        ping_s = max(0.0, min(LAGCOMP_MAX, float(msg.get("ping", 0.0)) / 1000.0))
    except (TypeError, ValueError):
        ping_s = 0.0

    await broadcast({
        "type": "shoot",
        "shooter": shooter_pid,
        "x": shooter["x"], "y": shooter["y"], "z": shooter["z"],
        "rx": rx, "ry": ry, "weapon": weapon,
        "pellets": wp["pellets"],
    })

    hits: dict[str, dict] = {}
    for _ in range(wp["pellets"]):
        if wp["spread"] > 0:
            srx = rx + random.uniform(-wp["spread"], wp["spread"])
            sry = ry + random.uniform(-wp["spread"], wp["spread"])
            dx = -math.sin(sry) * math.cos(srx)
            dy = math.sin(srx)
            dz = -math.cos(sry) * math.cos(srx)
        else:
            dx = -math.sin(ry) * math.cos(rx)
            dy = math.sin(rx)
            dz = -math.cos(ry) * math.cos(rx)
        h = hitscan(shooter_pid, dx, dy, dz, wp["damage"], wp["falloff"], ping_s)
        if h:
            tgt_id, _, head, dmg = h
            entry = hits.setdefault(tgt_id, {"count": 0, "head": False, "dmg": 0.0})
            entry["count"] += 1
            entry["dmg"] += dmg
            if head:
                entry["head"] = True

    for tgt_id, info in hits.items():
        target = players.get(tgt_id)
        if not target or target.get("is_dead"):
            continue
        dmg = info["dmg"]
        if info["head"]:
            dmg *= HEADSHOT_MULT
        dmg = int(round(dmg))
        target["hp"] = max(0, int(target["hp"]) - dmg)

        if target["hp"] <= 0:
            await apply_death(tgt_id, shooter_pid, info["head"], False, weapon)
        else:
            await broadcast({
                "type": "hit",
                "shooter": shooter_pid,
                "target": tgt_id,
                "hp": target["hp"],
                "damage": dmg,
                "headshot": info["head"],
            })


async def apply_death(target_pid: str, killer_pid: str, headshot: bool, explosion: bool, weapon: str):
    target = players.get(target_pid)
    if not target or target.get("is_dead"):
        return
    now = time.time()
    target["is_dead"] = True
    target["respawn_at"] = now + RESPAWN_TIME
    target["deaths"] = int(target.get("deaths", 0)) + 1
    target["streak"] = 0
    target["multi"] = 0
    spawn_pickup(target["x"], target["z"])
    killer = players.get(killer_pid)
    killer_name = killer.get("name", "?") if killer else "?"

    if killer and killer_pid != target_pid:
        killer["kills"] = int(killer.get("kills", 0)) + 1
        killer["streak"] = int(killer.get("streak", 0)) + 1
        if now - killer.get("last_kill", 0.0) < 4.0:
            killer["multi"] = int(killer.get("multi", 0)) + 1
        else:
            killer["multi"] = 1
        killer["last_kill"] = now
        await grant_streak_rewards(killer)

    await broadcast({
        "type": "kill",
        "shooter": killer_pid,
        "target": target_pid,
        "shooter_name": killer_name,
        "target_name": target.get("name", "?"),
        "headshot": headshot,
        "explosion": explosion,
        "weapon": weapon,
        "shooter_kills": killer["kills"] if killer else 0,
        "shooter_streak": killer.get("streak", 0) if killer else 0,
        "target_deaths": target["deaths"],
        "target_x": target["x"], "target_y": target["y"], "target_z": target["z"],
    })


async def grant_streak_rewards(killer: dict):
    streak = int(killer.get("streak", 0))
    multi = int(killer.get("multi", 0))
    pid = killer.get("id")
    gn = killer.setdefault("grenades", dict(GRENADE_START))
    reward = None
    if streak == 3:
        killer["hp"] = min(100, int(killer["hp"]) + 50)
        reward = "+50 HP"
    elif streak == 5:
        gn["frag"] = min(GRENADE_CAP["frag"], int(gn.get("frag", 0)) + 2)
        reward = "+2 ГРАНАТЫ"
    elif streak == 7:
        gn["smoke"] = min(GRENADE_CAP["smoke"], int(gn.get("smoke", 0)) + 1)
        gn["flash"] = min(GRENADE_CAP["flash"], int(gn.get("flash", 0)) + 1)
        reward = "+ДЫМ +ФЛЕШ"
    elif streak == 12:
        killer["hp"] = 100
        for k in GRENADE_TYPES:
            gn[k] = GRENADE_CAP[k]
        reward = "ПОЛНЫЙ АРСЕНАЛ"
    label = MULTI_LABELS.get(multi)
    if label or streak in (3, 5, 7, 10, 12, 15, 20):
        await broadcast({
            "type": "streak",
            "player": pid,
            "name": killer.get("name", "?"),
            "streak": streak,
            "multi": label,
            "reward": reward,
        })


async def process_grenade(shooter_pid: str, msg: dict) -> None:
    s = players.get(shooter_pid)
    if not s or s.get("is_dead"):
        return
    kind = str(msg.get("kind", "frag"))
    if kind not in GRENADE_TYPES:
        kind = "frag"
    gn = s.setdefault("grenades", dict(GRENADE_START))
    if int(gn.get(kind, 0)) <= 0:
        await send_to(shooter_pid, {"type": "no_grenade", "kind": kind})
        return
    now = time.time()
    if now - s.get("last_grenade", 0.0) < 0.9:
        return
    s["last_grenade"] = now
    gn[kind] = int(gn.get(kind, 0)) - 1

    try:
        ry = float(msg.get("ry", s.get("ry", 0.0)))
        rx = float(msg.get("rx", s.get("rx", 0.0)))
    except (TypeError, ValueError):
        ry, rx = s.get("ry", 0.0), s.get("rx", 0.0)

    power = 22.0
    dx = -math.sin(ry) * math.cos(rx)
    dy = math.sin(rx) + 0.35
    dz = -math.cos(ry) * math.cos(rx)
    norm = math.hypot(dx, dy, dz) or 1.0
    dx, dy, dz = dx / norm, dy / norm, dz / norm

    gid = uuid.uuid4().hex[:8]
    grenades[gid] = {
        "id": gid, "owner": shooter_pid, "kind": kind,
        "x": s["x"] + dx * 0.6,
        "y": s["y"] + MUZZLE_HEIGHT + dy * 0.6,
        "z": s["z"] + dz * 0.6,
        "vx": dx * power, "vy": dy * power, "vz": dz * power,
        "fuse": now + GRENADE_FUSE,
    }
    await broadcast({"type": "grenade_spawn", "id": gid, "kind": kind,
                     "x": grenades[gid]["x"], "y": grenades[gid]["y"],
                     "z": grenades[gid]["z"],
                     "owner": shooter_pid})


async def step_grenades(dt: float):
    now = time.time()
    explode = []
    for gid, g in list(grenades.items()):
        if now >= g["fuse"]:
            explode.append(gid)
            continue
        g["vy"] -= 22.0 * dt
        nx = g["x"] + g["vx"] * dt
        ny = g["y"] + g["vy"] * dt
        nz = g["z"] + g["vz"] * dt
        if ny < 0.2:
            ny = 0.2
            g["vy"] *= -0.35
            g["vx"] *= 0.7
            g["vz"] *= 0.7
        for i in walls_near(nx, nz, 1.0):
            wx, wz, hw, hd, h = WALL_BOXES[i]
            if ny < h and abs(nx - wx) < hw + 0.2 and abs(nz - wz) < hd + 0.2:
                if abs(nx - wx) > abs(nz - wz):
                    nx = wx + math.copysign(hw + 0.2, nx - wx)
                    g["vx"] *= -0.5
                else:
                    nz = wz + math.copysign(hd + 0.2, nz - wz)
                    g["vz"] *= -0.5
        if abs(nx) > ARENA_HALF - 1:
            nx = math.copysign(ARENA_HALF - 1, nx)
            g["vx"] *= -0.5
        if abs(nz) > ARENA_HALF - 1:
            nz = math.copysign(ARENA_HALF - 1, nz)
            g["vz"] *= -0.5
        g["x"], g["y"], g["z"] = nx, ny, nz

    for gid in explode:
        await detonate(gid)


async def detonate(gid: str):
    g = grenades.pop(gid, None)
    if not g:
        return
    gx, gy, gz = g["x"], g["y"], g["z"]
    owner = g["owner"]
    kind = g.get("kind", "frag")

    if kind == "smoke":
        now = time.time()
        smokes[gid] = {"id": gid, "x": gx, "y": gy, "z": gz, "until": now + SMOKE_LIFE}
        await broadcast({"type": "smoke_spawn", "id": gid, "x": gx, "y": gy, "z": gz,
                         "life": SMOKE_LIFE})
        return

    if kind == "flash":
        now = time.time()
        await broadcast({"type": "flash_pop", "x": gx, "y": gy, "z": gz})
        for bid, b in bots.items():
            if b.get("is_dead"):
                continue
            d = math.hypot(b["x"] - gx, b["z"] - gz)
            if d > FLASH_RANGE:
                continue
            if not los_clear(gx, gz, b["x"], b["z"], use_smoke=False):
                continue
            fx, fz = -math.sin(b["ry"]), -math.cos(b["ry"])
            if d > 0.01:
                tox, toz = (gx - b["x"]) / d, (gz - b["z"]) / d
            else:
                tox, toz = fx, fz
            facing = fx * tox + fz * toz
            strength = max(0.15, facing * 0.5 + 0.6) * (1.0 - d / FLASH_RANGE)
            dur = 1.0 + 4.5 * strength
            b["blind_until"] = max(b.get("blind_until", 0.0), now + dur)
        return

    for pid, p in players.items():
        if p.get("is_dead"):
            continue
        d = math.hypot(p["x"] - gx, p["z"] - gz)
        if d > GRENADE_RADIUS:
            continue
        if not los_clear(gx, gz, p["x"], p["z"], use_smoke=False) and d > 2.5:
            continue
        fall = 1.0 - d / GRENADE_RADIUS
        dmg = int(GRENADE_DAMAGE * fall)
        if dmg <= 0:
            continue
        p["hp"] = max(0, int(p["hp"]) - dmg)
        await broadcast({
            "type": "hit", "shooter": owner, "target": pid,
            "hp": p["hp"], "damage": dmg, "headshot": False, "explosion": True,
        })
        if p["hp"] <= 0:
            await apply_death(pid, owner, False, True, "GRENADE")


# ============================================================
#  КЛАССЫ БОТОВ
# ============================================================
BOT_CLASSES = {
    "ghost": {"hp": 100, "aim": 0.5,  "fire": 1.7,  "speed": 3.1, "react": (0.30, 0.65), "range": (65, 85), "strafe": 0.5},
    "jugg":  {"hp": 150, "aim": 1.3,  "fire": 0.78, "speed": 4.3, "react": (0.05, 0.16), "range": (8, 15),  "strafe": 0.35},
    "storm": {"hp": 100, "aim": 1.0,  "fire": 1.0,  "speed": 3.4, "react": (0.12, 0.42), "range": (25, 45), "strafe": 0.8},
}


def bot_class_for(weapon: str) -> str:
    if weapon in ("dmr", "sniper"):
        return "ghost"
    if weapon in ("shotgun", "lmg"):
        return "jugg"
    return "storm"


def bot_base_hp(b) -> int:
    return BOT_CLASSES.get(b.get("cls", "storm"), BOT_CLASSES["storm"])["hp"]


def make_bot(_idx: int = 0):
    bid = "bot_" + uuid.uuid4().hex[:6]
    bot = new_bot(bid)
    bots[bid] = bot
    players[bid] = bot


def new_bot(bid: str):
    x, z, ry = make_spawn()
    weapon = random.choice(BOT_WEAPONS)
    cls = bot_class_for(weapon)
    cfg = BOT_CLASSES[cls]
    name = random.choice(BOT_NAMES) + str(random.randint(1, 99))
    wp = WEAPONS[weapon]
    return {
        "id": bid, "name": name, "color": random.choice(RED_COLORS), "weapon": weapon,
        "cls": cls,
        "x": x, "y": 0.0, "z": z, "ry": ry, "rx": 0.0,
        "hp": cfg["hp"], "kills": 0, "deaths": 0, "is_dead": False, "is_bot": True,
        "streak": 0, "multi": 0, "last_kill": 0.0,
        "ammo": wp["mag"], "reserve": 10 ** 9, "reload_end": 0.0, "last_shot": 0.0,
        "grenades": {"frag": 1, "smoke": 0, "flash": 0}, "last_grenade": 0.0,
        "respawn_at": 0.0,
        "target_pid": None, "engage_at": 0.0,
        "path": None, "path_i": 0, "repath_at": 0.0, "goal": None,
        "blind_until": 0.0, "strafe_dir": random.choice((-1, 1)), "strafe_at": 0.0,
        "aim_err": random.uniform(0.015, 0.07) * cfg["aim"],
        "react": random.uniform(*cfg["react"]),
        "pref": random.uniform(*cfg["range"]),
        "fire_pause_until": 0.0,
        "stuck": 0.0, "last_x": x, "last_z": z,
        "vx": 0.0, "vz": 0.0,
    }


def bot_respawn(b, now: float):
    x, z, ry = make_spawn()
    wp = WEAPONS.get(b.get("weapon", "rifle"), WEAPONS["rifle"])
    cfg = BOT_CLASSES.get(b.get("cls", "storm"), BOT_CLASSES["storm"])
    b.update({
        "x": x, "y": 0.0, "z": z, "ry": ry, "rx": 0.0,
        "hp": cfg["hp"], "is_dead": False, "ammo": wp["mag"], "reload_end": 0.0,
        "grenades": {"frag": 1, "smoke": 0, "flash": 0},
        "target_pid": None, "path": None, "path_i": 0, "repath_at": 0.0,
        "blind_until": 0.0, "stuck": 0.0, "last_x": x, "last_z": z,
    })


def bot_move(b, dx: float, dz: float, speed: float, dt: float):
    ln = math.hypot(dx, dz)
    if ln < 1e-6:
        return
    dx /= ln
    dz /= ln
    step = speed * dt
    nx = b["x"] + dx * step
    nz = b["z"] + dz * step
    nx = max(-ARENA_HALF + 2, min(ARENA_HALF - 2, nx))
    nz = max(-ARENA_HALF + 2, min(ARENA_HALF - 2, nz))
    moved = False
    if not wall_at_point(nx, nz, 0.55):
        b["x"], b["z"] = nx, nz
        moved = True
    else:
        if not wall_at_point(nx, b["z"], 0.55):
            b["x"] = nx
            moved = True
        elif not wall_at_point(b["x"], nz, 0.55):
            b["z"] = nz
            moved = True
        else:
            b["stuck"] += dt
    if not moved:
        b["stuck"] += dt * 0.5


def bot_follow_path(b, dt: float, speed: float) -> bool:
    path = b.get("path")
    if not path:
        return True
    i = b.get("path_i", 0)
    if i >= len(path):
        b["path"] = None
        return True
    tx, tz = path[i]
    dx = tx - b["x"]
    dz = tz - b["z"]
    d = math.hypot(dx, dz)
    if d < 2.4:
        b["path_i"] = i + 1
        if b["path_i"] >= len(path):
            b["path"] = None
            return True
        return False
    target_ry = math.atan2(-dx, -dz)
    d_ang = (target_ry - b["ry"] + math.pi) % (2 * math.pi) - math.pi
    b["ry"] += d_ang * min(1.0, dt * 4.0)
    bot_move(b, dx, dz, speed, dt)
    return False


def bot_repath(b, gx: float, gz: float, now: float):
    b["path"] = find_path(b["x"], b["z"], gx, gz)
    b["path_i"] = 0
    b["goal"] = (gx, gz)
    b["repath_at"] = now + random.uniform(1.6, 3.0)
    b["stuck"] = 0.0


async def update_bots_async(dt: float):
    now = time.time()
    human_count = len(clients)
    desired = min(16, max(8, human_count * 5))
    while len(bots) < desired:
        make_bot(len(bots))
    while len(bots) > desired:
        bid = next(iter(bots))
        bots.pop(bid, None)
        players.pop(bid, None)

    pending = []

    for bid, b in list(bots.items()):
        if b["is_dead"]:
            if now >= b.get("respawn_at", 0.0):
                bot_respawn(b, now)
            continue

        cfg = BOT_CLASSES.get(b.get("cls", "storm"), BOT_CLASSES["storm"])
        moved = math.hypot(b["x"] - b.get("last_x", b["x"]), b["z"] - b.get("last_z", b["z"]))
        b["last_x"], b["last_z"] = b["x"], b["z"]
        if moved < 0.6 * dt * 3:
            b["stuck"] += dt
        else:
            b["stuck"] = max(0.0, b.get("stuck", 0.0) - dt)
        if b.get("stuck", 0.0) > 0.7:
            b["path"] = None
            b["repath_at"] = 0.0
            b["stuck"] = 0.0
            b["strafe_dir"] *= -1

        if now < b.get("blind_until", 0.0):
            b["ry"] += random.uniform(-1.0, 1.0) * dt * 2.5
            dx = -math.sin(b["ry"])
            dz = -math.cos(b["ry"])
            if wall_at_point(b["x"] + dx, b["z"] + dz, 0.55):
                b["ry"] += math.pi * 0.7
            bot_move(b, dx, dz, 2.0, dt)
            continue

        wp = WEAPONS.get(b["weapon"], WEAPONS["rifle"])
        mag = wp["mag"]
        finish_reload(b)
        if b.get("ammo", mag) <= 0 and b.get("reload_end", 0.0) <= 0:
            b["reload_end"] = now + wp["reload"] + random.uniform(0, 0.4)

        best = None
        best_score = 1e18
        for pid, p in players.items():
            if pid == bid or p.get("is_dead"):
                continue
            d = math.hypot(p["x"] - b["x"], p["z"] - b["z"])
            if d > 92:
                continue
            if not los_clear(b["x"], b["z"], p["x"], p["z"]):
                continue
            score = d * (0.8 if not p.get("is_bot") else 1.0)
            if score < best_score:
                best_score = score
                best = (pid, p, d)

        if best:
            tpid, t, dist = best
            if b.get("target_pid") != tpid:
                b["target_pid"] = tpid
                b["engage_at"] = now + b["react"]
                b["strafe_at"] = now
            pref = b["pref"]
            lead = dist / 150.0
            tx = t["x"] + t.get("vx", 0.0) * lead
            tz = t["z"] + t.get("vz", 0.0) * lead
            dx = tx - b["x"]
            dz = tz - b["z"]
            target_ry = math.atan2(-dx, -dz)
            d_ang = (target_ry - b["ry"] + math.pi) % (2 * math.pi) - math.pi
            b["ry"] += d_ang * min(1.0, dt * (6.0 - min(4.0, dist / 25.0)))
            b["rx"] = 0.0

            if now >= b.get("strafe_at", 0.0):
                b["strafe_at"] = now + random.uniform(0.7, 1.8)
                b["strafe_dir"] = random.choice((-1, 1))

            mvx = 0.0
            mvz = 0.0
            speed = cfg["speed"]
            if b["cls"] == "jugg":
                if dist > pref:
                    mvx += dx
                    mvz += dz
                elif dist < pref * 0.55:
                    mvx -= dx
                    mvz -= dz
            elif b["cls"] == "ghost":
                if dist < 25.0:
                    mvx -= dx * 1.6
                    mvz -= dz * 1.6
                elif dist > pref + 6:
                    mvx += dx
                    mvz += dz
                elif dist < pref - 8:
                    mvx -= dx
                    mvz -= dz
            else:
                if dist > pref + 5:
                    mvx += dx
                    mvz += dz
                elif dist < pref - 5:
                    mvx -= dx
                    mvz -= dz
            if dist > 3:
                px, pz = -dz, dx
                pl = math.hypot(px, pz) or 1.0
                mvx += (px / pl) * b["strafe_dir"] * cfg["strafe"]
                mvz += (pz / pl) * b["strafe_dir"] * cfg["strafe"]
            bot_move(b, mvx, mvz, speed, dt)

            if now >= b.get("engage_at", 0.0) and abs(d_ang) < 0.22:
                if now >= b.get("fire_pause_until", 0.0):
                    if random.random() < 0.05:
                        b["fire_pause_until"] = now + random.uniform(0.25, 0.75) * cfg["fire"]
                    else:
                        err = b["aim_err"] * (0.5 + dist / 90.0)
                        if moved > 0.6 * dt * 3:
                            err *= 1.35
                        if b["cls"] == "jugg":
                            err *= 1.1
                        pending.append((bid, {
                            "ry": b["ry"] + random.uniform(-err, err),
                            "rx": b["rx"] + random.uniform(-err * 0.5, err * 0.5),
                        }))
                        if wp["auto"]:
                            b["fire_pause_until"] = now + wp["cooldown"] * cfg["fire"] * random.uniform(1.2, 2.0)
                        else:
                            b["fire_pause_until"] = now + wp["cooldown"] * cfg["fire"] * random.uniform(1.4, 2.4)

            if 10 < dist < 42 and now - b.get("last_grenade", 0.0) > 9.0:
                if random.random() < 0.02 and int(b.get("grenades", {}).get("frag", 0)) > 0:
                    pending.append(("__grenade__" + bid, {
                        "ry": b["ry"] + random.uniform(-0.05, 0.05),
                        "rx": 0.1,
                        "kind": "frag",
                    }))
                    b["last_grenade"] = now + 5.0
        else:
            b["target_pid"] = None
            seek = None
            if int(b["hp"]) < 55:
                best_d = 60.0
                for m in medkits.values():
                    if not m["available"]:
                        continue
                    d = math.hypot(m["x"] - b["x"], m["z"] - b["z"])
                    if d < best_d:
                        best_d = d
                        seek = m
            if seek is not None:
                d = math.hypot(seek["x"] - b["x"], seek["z"] - b["z"])
                if d < 2.5:
                    heal = min(MEDKIT_HEAL, bot_base_hp(b) - int(b["hp"]))
                    if heal > 0:
                        b["hp"] = int(b["hp"]) + heal
                        seek["available"] = False
                        seek["respawn_at"] = now + MEDKIT_RESPAWN
                        await broadcast({"type": "medkit_taken", "id": seek["id"],
                                         "player": bid, "hp": b["hp"]})
                    b["path"] = None
                else:
                    if (b.get("goal") is None or
                            math.hypot(b["goal"][0] - seek["x"], b["goal"][1] - seek["z"]) > 3.0 or
                            now >= b.get("repath_at", 0.0)):
                        bot_repath(b, seek["x"], seek["z"], now)
                    bot_follow_path(b, dt, cfg["speed"] * 1.1)
            else:
                if (b.get("goal") is None or b["path"] is None or
                        now >= b.get("repath_at", 0.0) or
                        math.hypot(b["x"] - b["goal"][0], b["z"] - b["goal"][1]) < 3.0):
                    gx = random.uniform(-ARENA_HALF * 0.88, ARENA_HALF * 0.88)
                    gz = random.uniform(-ARENA_HALF * 0.88, ARENA_HALF * 0.88)
                    if wall_at_point(gx, gz, 2.0):
                        gx, gz = 0.0, 120.0
                    bot_repath(b, gx, gz, now)
                bot_follow_path(b, dt, cfg["speed"] * 0.95)

    for who, params in pending:
        try:
            if who.startswith("__grenade__"):
                await process_grenade(who[len("__grenade__"):], params)
            else:
                await process_shoot(who, params)
        except Exception as e:
            print("[BOT ACT] err:", e)


async def bots_tick():
    last = time.time()
    while True:
        await asyncio.sleep(TICK_INTERVAL)
        now = time.time()
        dt = min(now - last, 0.1)
        last = now
        try:
            await step_grenades(dt)
            await update_bots_async(dt)
        except Exception as e:
            print("[BOT] err:", e)


# ============================================================
#  ЦИКЛ ВЕЩАНИЯ
# ============================================================
async def broadcast_loop() -> None:
    while True:
        await asyncio.sleep(TICK_INTERVAL)
        now = time.time()

        for pid, p in list(players.items()):
            finish_reload(p)
            if p.get("reload_end", 0.0) > 0.0:
                p["reload_left"] = max(0.01, round(p["reload_end"] - now, 2))
            else:
                p["reload_left"] = 0.0
            hist_push(p, now)

            if p.get("is_dead") and now >= p.get("respawn_at", 0.0) and not p.get("is_bot"):
                x, z, ry = make_spawn()
                wp = WEAPONS.get(p.get("weapon", "rifle"), WEAPONS["rifle"])
                p["x"] = round(x, 3)
                p["y"] = 0.0
                p["z"] = round(z, 3)
                p["ry"] = round(ry, 4)
                p["rx"] = 0.0
                p["hp"] = 100
                p["is_dead"] = False
                p["ammo"] = wp["mag"]
                p["reserve"] = wp["mag"] * RESERVE_MAGS
                p["reload_end"] = 0.0
                p["grenades"] = dict(GRENADE_START)
                p.pop("respawn_at", None)

        for mid, m in medkits.items():
            if not m["available"] and now >= m["respawn_at"]:
                m["available"] = True

        for pkid in [k for k, v in pickups.items() if now >= v["until"]]:
            pickups.pop(pkid, None)

        for sid, s in list(smokes.items()):
            if now >= s["until"]:
                smokes.pop(sid, None)
                await broadcast({"type": "smoke_end", "id": sid})

        if not clients:
            continue

        payload = json.dumps({
            "type": "state",
            "players": players,
            "grenades": list(grenades.values()),
            "medkits": list(medkits.values()),
            "smokes": [{"id": s["id"], "x": s["x"], "y": s["y"], "z": s["z"],
                        "left": round(max(0.0, s["until"] - now), 1)}
                       for s in smokes.values()],
            "pickups": list(pickups.values()),
            "time": now,
        })
        dead = []
        for pid, ws in list(clients.items()):
            try:
                await ws.send(payload)
            except Exception:
                dead.append(pid)
        for pid in dead:
            await drop_player(pid)


# ============================================================
#  WEBSOCKET
# ============================================================
async def ws_handler(ws) -> None:
    pid = None
    try:
        raw = await ws.recv()
        data = json.loads(raw)
        name = str(data.get("name", "Игрок")).strip()[:16] or "Игрок"
        weapon = str(data.get("weapon", "rifle"))[:16]
        if weapon not in VALID_WEAPONS:
            weapon = "rifle"

        pid = uuid.uuid4().hex[:8]
        color = random.choice(BLUE_COLORS)
        x, z, ry = make_spawn()
        wp = WEAPONS[weapon]

        players[pid] = {
            "id": pid,
            "x": round(x, 3), "y": 0.0, "z": round(z, 3),
            "ry": round(ry, 4), "rx": 0.0,
            "hp": 100, "kills": 0, "deaths": 0, "is_dead": False,
            "color": color, "name": name,
            "weapon": weapon, "last_shot": 0.0, "last_grenade": 0.0,
            "is_bot": False, "cls": "storm",
            "ammo": wp["mag"], "reserve": wp["mag"] * RESERVE_MAGS,
            "reload_end": 0.0, "reload_left": 0.0,
            "grenades": dict(GRENADE_START),
            "streak": 0, "multi": 0, "last_kill": 0.0,
            "vx": 0.0, "vz": 0.0,
        }
        clients[pid] = ws

        init_payload = {
            "type": "init",
            "id": pid, "color": color,
            "x": players[pid]["x"], "y": 0.0, "z": players[pid]["z"],
            "ry": players[pid]["ry"], "rx": 0.0,
            "hp": 100, "kills": 0, "is_dead": False,
            "weapon": weapon,
            "players": players,
            "grenades": list(grenades.values()),
            "medkits": list(medkits.values()),
            "smokes": [{"id": s["id"], "x": s["x"], "y": s["y"], "z": s["z"],
                        "left": round(max(0.0, s["until"] - time.time()), 1)}
                       for s in smokes.values()],
            "pickups": list(pickups.values()),
            "arena_half": ARENA_HALF,
        }
        await ws.send(json.dumps(init_payload))
        print(f"[WS] + {name} ({pid}) [{weapon}] | В игре: {len(players)}")

        last_state_t = time.time()
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mt = msg.get("type")

            if mt == "state" and pid in players:
                p = players[pid]
                if p.get("is_dead"):
                    continue
                try:
                    now_t = time.time()
                    dt_state = max(0.016, min(now_t - last_state_t, 0.5))
                    last_state_t = now_t
                    nx = max(-ARENA_HALF + 1.5, min(ARENA_HALF - 1.5, float(msg.get("x", p["x"]))))
                    nz = max(-ARENA_HALF + 1.5, min(ARENA_HALF - 1.5, float(msg.get("z", p["z"]))))
                    tvx = (nx - p["x"]) / dt_state
                    tvz = (nz - p["z"]) / dt_state
                    p["vx"] = p["vx"] * 0.7 + tvx * 0.3
                    p["vz"] = p["vz"] * 0.7 + tvz * 0.3
                    p["x"] = round(nx, 3)
                    p["z"] = round(nz, 3)
                    p["ry"] = round(float(msg.get("ry", p["ry"])), 4)
                    p["rx"] = round(float(msg.get("rx", p["rx"])), 4)
                    p["y"] = round(float(msg.get("y", 0.0)), 3)
                except (TypeError, ValueError):
                    pass

            elif mt == "shoot" and pid in players:
                await process_shoot(pid, msg)

            elif mt == "reload" and pid in players:
                p = players[pid]
                wp2 = WEAPONS.get(p.get("weapon", "rifle"), WEAPONS["rifle"])
                now_t = time.time()
                if (not p.get("is_dead") and p.get("reload_end", 0.0) <= now_t
                        and int(p.get("ammo", wp2["mag"])) < wp2["mag"]
                        and int(p.get("reserve", 0)) > 0):
                    p["reload_end"] = now_t + wp2["reload"]
                    await broadcast({"type": "reload", "player": pid,
                                     "duration": wp2["reload"], "ammo": p["ammo"],
                                     "mag": wp2["mag"]})

            elif mt == "grenade" and pid in players:
                await process_grenade(pid, msg)

            elif mt == "weapon" and pid in players:
                w = str(msg.get("weapon", "rifle"))[:16]
                if w in VALID_WEAPONS:
                    players[pid]["weapon"] = w
                    players[pid]["ammo"] = WEAPONS[w]["mag"]
                    players[pid]["reserve"] = WEAPONS[w]["mag"] * RESERVE_MAGS
                    players[pid]["reload_end"] = 0.0

            elif mt == "pickup_medkit" and pid in players:
                mid = str(msg.get("id", ""))
                m = medkits.get(mid)
                p = players.get(pid)
                if m and m["available"] and p and not p.get("is_dead"):
                    if math.hypot(p["x"] - m["x"], p["z"] - m["z"]) < 2.5:
                        heal = min(MEDKIT_HEAL, 100 - int(p["hp"]))
                        if heal > 0:
                            p["hp"] = int(p["hp"]) + heal
                            m["available"] = False
                            m["respawn_at"] = time.time() + MEDKIT_RESPAWN
                            await broadcast({"type": "medkit_taken",
                                             "id": mid, "player": pid,
                                             "hp": p["hp"]})

            elif mt == "pickup_ammo" and pid in players:
                p = players[pid]
                pkid = str(msg.get("id", ""))
                pk = pickups.get(pkid)
                if pk and not p.get("is_dead"):
                    if math.hypot(p["x"] - pk["x"], p["z"] - pk["z"]) < 2.6:
                        wp3 = WEAPONS.get(p.get("weapon", "rifle"), WEAPONS["rifle"])
                        p["reserve"] = int(p.get("reserve", 0)) + wp3["mag"] * 2
                        pickups.pop(pkid, None)
                        await broadcast({"type": "pickup_taken", "id": pkid,
                                         "player": pid, "reserve": p["reserve"]})

            elif mt == "ping":
                await send_to(pid, {"type": "pong", "t": msg.get("t", 0)})

    except websockets.ConnectionClosed:
        pass
    except Exception as exc:
        print(f"[WS] Ошибка: {exc}")
        import traceback
        traceback.print_exc()
    finally:
        if pid is not None:
            await drop_player(pid)


class QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, fmt, *args):
        pass


def start_http() -> None:
    httpd = HTTPServer(("0.0.0.0", HTTP_PORT), QuietHandler)
    httpd.serve_forever()


async def main() -> None:
    threading.Thread(target=start_http, daemon=True).start()
    build_wall_grid()
    make_medkits()

    t0 = time.time()
    build_nav()
    print(f"[NAV] Точек: {len(nav_pts)}  |  стен в хеше: "
          f"{sum(len(v) for v in _wall_cells.values())} ячеек: {len(_wall_cells)}  |  {time.time()-t0:.2f}с")

    for _ in range(6):
        make_bot(len(bots))

    ip = get_local_ip()
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT,
                                ping_interval=20, max_size=2**20):
        print("=" * 64)
        print(" NEON STICKMAN SHOT v4.0 — MAXIMUM NEON ARENA")
        print("=" * 64)
        print(f"  Локально:      http://localhost:{HTTP_PORT}")
        print(f"  По сети (LAN): http://{ip}:{HTTP_PORT}")
        print(f"  WebSocket:     ws://{ip}:{WS_PORT}")
        print(f"  Tickrate:      {TICK_RATE} Hz  |  Арена: {int(ARENA_HALF*2)}x{int(ARENA_HALF*2)}")
        print(f"  Стены:         {len(WALLS)}  |  Аптечки: {len(medkits)}  |  Боты: {len(bots)}/{MAX_BOTS}")
        print(f"  Классы ботов:  ghost / jugg / storm  |  Резерв: {RESERVE_MAGS} магазина")
        print(f"  Сетка:         {GRID_CELL:.0f}x{GRID_CELL:.0f}, {len(_wall_cells)} ячеек  |  Lagcomp: да")
        print("=" * 64)
        asyncio.create_task(broadcast_loop())
        asyncio.create_task(bots_tick())
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[SERVER] Остановлен")
