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

BASE_DIR = Path(__file__).resolve().parent


def load_config() -> dict:
    cfg = {
        "mode": "ffa",
        "rotation": {"enabled": True, "ffa_duration": 1800, "ffa_kill_limit": 50,
                     "vote_seconds": 15, "defeat_vote_seconds": 5},
        "ffa": {"max_bots": 16, "boss_hp": 3000, "boss_spawn_delay": 60, "boss_respawn_seconds": 900},
        "defense": {
            "break_seconds": 30, "first_break_seconds": 12, "points_per_kill": 10,
            "wave_base": 6, "wave_growth": 3, "max_alive": 48, "spawn_interval": 1.4,
            "hp_growth": 0.12, "hp_cap": 4.0, "speed_growth": 0.02, "speed_cap": 1.4,
            "dmg_growth": 0.05, "dmg_cap": 2.0, "defeat_restart_seconds": 10,
            "heal_on_wave_clear": 50,
        },
    }
    try:
        raw = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))
        for k, v in raw.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    except FileNotFoundError:
        print("[CONFIG] config.json не найден — используются настройки по умолчанию")
    except Exception as e:
        print("[CONFIG] Ошибка чтения config.json:", e)
    return cfg


CONFIG = load_config()
MODE = str(CONFIG.get("mode", "ffa")).lower()
if MODE not in ("ffa", "defense"):
    print(f"[CONFIG] Неизвестный режим '{MODE}' — включён ffa")
    MODE = "ffa"
DEF = CONFIG["defense"]
FFA_CFG = CONFIG["ffa"]

# --- ротация режимов: FFA-раунд -> голосование -> оборона -> голосование ---
ROT = CONFIG.get("rotation", {}) if isinstance(CONFIG.get("rotation"), dict) else {}
ROTATION = bool(ROT.get("enabled", True))
FFA_DURATION = float(ROT.get("ffa_duration", 1800))
FFA_KILL_LIMIT = int(ROT.get("ffa_kill_limit", 50))
VOTE_SECONDS = float(ROT.get("vote_seconds", 15))
DEFEAT_VOTE_SECONDS = float(ROT.get("defeat_vote_seconds", 5))
if ROTATION:
    MODE = "ffa"  # ротация всегда начинается с арены «каждый сам за себя»

# карта: при ротации обе фазы идут на карте FFA «Мегаполис»
MAP_MODE = "ffa" if ROTATION else MODE

HTTP_PORT = 8080
WS_PORT = 8001
TICK_RATE = 30
TICK_INTERVAL = 1.0 / TICK_RATE

ARENA_HALF = 150.0 if MAP_MODE == "defense" else 200.0
SPAWN_RANGE = 165.0 if MAP_MODE == "ffa" else 118.0

HEAD_OFFSET = 1.65
HEAD_RADIUS = 0.25
BODY_OFFSET = 1.00
BODY_RADIUS = 0.55
MUZZLE_HEIGHT = 1.70
HEADSHOT_MULT = 2.0

SHOOT_RANGE = 200.0
RESPAWN_TIME = 3.0
MAX_BOTS = int(FFA_CFG.get("max_bots", 16))

# --- БОСС (только FFA): стоит в центре, за убийство — ядерная бомба ---
BOSS_HP = int(FFA_CFG.get("boss_hp", 3000))
BOSS_SPAWN_DELAY = float(FFA_CFG.get("boss_spawn_delay", 60))
BOSS_RESPAWN = float(FFA_CFG.get("boss_respawn_seconds", 900))
BOSS_POS = (0.0, 7.0)
boss_spawn_at = time.time() + BOSS_SPAWN_DELAY

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
    "boss_gun": {"damage": 22, "cooldown": 0.14, "pellets": 1, "spread": 0.02, "auto": True, "falloff": 0.20, "mag": 10 ** 9, "reload": 3.0},
}
VALID_WEAPONS = tuple(k for k in WEAPONS if k != "boss_gun")
BOT_WEAPONS = ("pistol", "revolver", "smg", "rifle", "burst", "dmr", "lmg", "shotgun", "sniper")

GRENADE_FUSE = 2.0
GRENADE_RADIUS = 9.0
GRENADE_DAMAGE = 95
SMOKE_RADIUS = 10.8
SMOKE_LIFE = 14.0
FLASH_RANGE = 46.0
FLASH_BLIND_TIME = 4.0
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
    if MAP_MODE == "defense":
        return build_wall_list_defense()
    return build_wall_list_ffa()


def build_wall_list_defense():
    """«Крепость»: центральный укреплённый периметр, руины, каналы.
    Должна совпадать с game.js buildWallList('defense')."""
    walls = []
    A = ARENA_HALF  # 150
    T = 3.0
    H = 18.0

    walls.append((0, A, A, T / 2, H, "outer"))
    walls.append((0, -A, A, T / 2, H, "outer"))
    walls.append((A, 0, T / 2, A, H, "outer"))
    walls.append((-A, 0, T / 2, A, H, "outer"))

    # Центральная крепость: квадрат 46x46, 4 широких входа (12), башни по углам
    S, door, th, h = 46.0, 12.0, 2.0, 5.0
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
    for tx in (-1, 1):
        for tz in (-1, 1):
            cx, cz = tx * half, tz * half
            walls.append((cx, cz, 2.2, 2.2, 7.5, "tower"))

    # Внутренние колонны и укрытия крепости
    for dx, dz in ((-13, -13), (13, -13), (13, 13), (-13, 13)):
        walls.append((dx, dz, 0.9, 0.9, h, "pillar"))
    walls.append((0, 0, 2.4, 2.4, 1.6, "crate"))
    for dx, dz in ((-17, 0), (17, 0), (0, -17), (0, 17)):
        walls.append((dx, dz, 2.6, 0.7, 1.4, "cover"))

    # Руины среднего кольца: 8 зданий 20x20 с дверями
    for qx in (-1, 1):
        for qz in (-1, 1):
            cx, cz = qx * 72.0, qz * 72.0
            s2, h2, th2, d2 = 20.0, 4.0, 1.6, 7.0
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
    for cx, cz in ((72, 0), (-72, 0), (0, 72), (0, -72)):
        s2, h2, th2, d2 = 20.0, 4.0, 1.6, 7.0
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

    # Каналы-стены на подходах (x = ±112 и z = ±112, с разрывами)
    for off in (-112.0, 112.0):
        for c in (-70.0, 0.0, 70.0):
            walls.append((off, c, 1.0, 22.0, 3.0, "lane"))
            walls.append((c, off, 22.0, 1.0, 3.0, "lane"))

    # Укрытия на открытых подходах
    covers = [
        (40, 40, 3.2, 0.7), (-40, 40, 3.2, 0.7), (40, -40, 3.2, 0.7), (-40, -40, 3.2, 0.7),
        (40, 40, 0.7, 3.2), (-40, 40, 0.7, 3.2), (40, -40, 0.7, 3.2), (-40, -40, 0.7, 3.2),
        (95, 35, 2.6, 0.7), (95, -35, 2.6, 0.7), (-95, 35, 2.6, 0.7), (-95, -35, 2.6, 0.7),
        (35, 95, 0.7, 2.6), (35, -95, 0.7, 2.6), (-35, 95, 0.7, 2.6), (-35, -95, 0.7, 2.6),
    ]
    for (x, z, hw, hd) in covers:
        walls.append((x, z, hw, hd, 1.5, "cover"))

    # Ящики и бочки
    clusters = [(55, 25), (-55, 25), (55, -25), (-55, -25),
                (25, 55), (-25, 55), (25, -55), (-25, -55)]
    offsets = [(0.0, 0.0), (1.9, 0.3)]
    for (cx, cz) in clusters:
        for (ox, oz) in offsets:
            walls.append((cx + ox, cz + oz, 0.85, 0.85, 1.7, "crate"))
    barrels = [(23, 23), (-23, 23), (23, -23), (-23, -23),
               (85, 0), (-85, 0), (0, 85), (0, -85)]
    for (x, z) in barrels:
        walls.append((x, z, 0.55, 0.55, 2.1, "barrel"))

    return walls


def build_wall_list_ffa():
    """«МЕГАПОЛИС»: центральная площадь, 4 туннеля, кольцевой коридор,
    4 угловые башни и лабиринты в квадрантах (стиль CS2).
    Должна совпадать с game.js buildWallListFFA()."""
    walls = []
    A = ARENA_HALF
    T = 3.0
    H = 16.0

    walls.append((0, A, A, T / 2, H, "outer"))
    walls.append((0, -A, A, T / 2, H, "outer"))
    walls.append((A, 0, T / 2, A, H, "outer"))
    walls.append((-A, 0, T / 2, A, H, "outer"))

    # --- Кольцевая стена (внутренний периметр) на ±172: проёмы у осей и углов ---
    for sgn in (-1, 1):
        for (cx, cz, hw, hd) in ((sgn * 172, -102.5, 1.25, 57.5), (sgn * 172, 102.5, 1.25, 57.5),
                                 (-102.5, sgn * 172, 57.5, 1.25), (102.5, sgn * 172, 57.5, 1.25)):
            walls.append((cx, cz, hw, hd, 10.0, "bwall"))

    # --- Центральная площадь: квадрат 104x104, входы 16 у каждой оси ---
    P = 52.0
    seg = 22.0
    for sgn in (-1, 1):
        walls.append((sgn * 30, P, seg, 1.25, 6.5, "cwall"))
        walls.append((sgn * 30, -P, seg, 1.25, 6.5, "cwall"))
        walls.append((P, sgn * 30, 1.25, seg, 6.5, "cwall"))
        walls.append((-P, sgn * 30, 1.25, seg, 6.5, "cwall"))

    # снабжение и укрытия в центре площади
    walls.append((0, 0, 1.2, 1.2, 1.7, "crate"))
    for (x, z, hw, hd) in ((16, 0, 2.6, 0.7), (-16, 0, 2.6, 0.7),
                           (0, 16, 0.7, 2.6), (0, -16, 0.7, 2.6)):
        walls.append((x, z, hw, hd, 1.4, "cover"))
    for (x, z) in ((30, 30), (-30, 30), (30, -30), (-30, -30)):
        walls.append((x, z, 0.9, 0.9, 6.0, "pillar"))

    # --- 4 главных туннеля (осевые коридоры с зигзаг-баффлами) ---
    for d in (-1, 1):
        # север/юг
        walls.append((8, d * 110, 0.8, 48, 4.5, "lane"))
        walls.append((-8, d * 110, 0.8, 48, 4.5, "lane"))
        walls.append((-5, d * 88, 5, 0.7, 4.0, "cover"))
        walls.append((5, d * 110, 5, 0.7, 4.0, "cover"))
        walls.append((-5, d * 132, 5, 0.7, 4.0, "cover"))
        # восток/запад
        walls.append((d * 110, 8, 48, 0.8, 4.5, "lane"))
        walls.append((d * 110, -8, 48, 0.8, 4.5, "lane"))
        walls.append((d * 88, -5, 0.7, 5, 4.0, "cover"))
        walls.append((d * 110, 5, 0.7, 5, 4.0, "cover"))
        walls.append((d * 132, -5, 0.7, 5, 4.0, "cover"))

    # --- Лабиринты в квадрантах (зеркалятся) ---
    maze = [
        (70, 55, 0.8, 30), (70, 95, 35, 0.8), (120, 65, 0.8, 40),
        (90, 135, 50, 0.8), (100, 151.5, 0.8, 16.5), (155, 62.5, 0.8, 32.5),
        (150, 60, 20, 0.8), (95, 77.5, 0.8, 17.5), (105, 30, 15, 0.8),
        (135, 100, 0.8, 20),
    ]
    for qx in (-1, 1):
        for qz in (-1, 1):
            for (x, z, hw, hd) in maze:
                walls.append((qx * x, qz * z, hw, hd, 5.0, "bwall"))

    # --- 4 угловые башни (двери внутрь карты) ---
    for (tx, tz) in ((155, 155), (-155, 155), (155, -155), (-155, -155)):
        half3 = 6.0
        th3 = 1.2
        door_half = 2.6
        seg3 = half3 - door_half
        # глухие внешние грани
        walls.append((tx, tz + math.copysign(half3, tz), 2 * half3, th3 / 2, 8.0, "tower"))
        walls.append((tx + math.copysign(half3, tx), tz, th3 / 2, 2 * half3, 8.0, "tower"))
        # внутренние грани с дверьми
        inner_x = tx - math.copysign(half3, tx)
        inner_z = tz - math.copysign(half3, tz)
        walls.append((inner_x, tz + math.copysign(half3 / 2 + door_half / 2, tz),
                      th3 / 2, seg3 / 2, 8.0, "tower"))
        walls.append((inner_x, tz - math.copysign(half3 / 2 + door_half / 2, tz),
                      th3 / 2, seg3 / 2, 8.0, "tower"))
        walls.append((tx + math.copysign(half3 / 2 + door_half / 2, tx), inner_z,
                      seg3 / 2, th3 / 2, 8.0, "tower"))
        walls.append((tx - math.copysign(half3 / 2 + door_half / 2, tx), inner_z,
                      seg3 / 2, th3 / 2, 8.0, "tower"))

    # --- Укрытия и ящики у входов площади и в кольце ---
    for d in (-1, 1):
        walls.append((d * 14, 60, 0.7, 3.0, 1.5, "cover"))
        walls.append((d * 60, 14, 3.0, 0.7, 1.5, "cover"))
    clusters = [(40, 70), (70, 40), (-40, 70), (-70, 40),
                (40, -70), (70, -40), (-40, -70), (-70, -40),
                (185, 60), (60, 185), (-185, 60), (-60, 185),
                (185, -60), (60, -185), (-185, -60), (-60, -185)]
    for (cx, cz) in clusters:
        for (ox, oz) in ((0.0, 0.0), (2.05, 0.3)):
            walls.append((cx + ox, cz + oz, 0.85, 0.85, 1.7, "crate"))

    barrels = [(120, 120), (-120, 120), (120, -120), (-120, -120),
               (0, 62), (0, -62), (62, 0), (-62, 0)]
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


def wall_at_point_h(x: float, z: float, y: float, clr: float = 0.0) -> bool:
    """Стена на высоте y (снаряды перелетают низкие укрытия)."""
    for i in walls_near(x, z, clr):
        wx, wz, hw, hd, h = WALL_BOXES[i]
        if h < y:
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
NAV_LIMIT = int(ARENA_HALF // NAV_STEP)

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
    if MODE == "defense":
        portals += [(0, 23), (0, -23), (23, 0), (-23, 0)]
        for qx in (-1, 1):
            for qz in (-1, 1):
                cx, cz = qx * 72.0, qz * 72.0
                portals += [(cx, cz + 10), (cx, cz - 10), (cx + 10, cz), (cx - 10, cz)]
        for cx, cz in ((72, 0), (-72, 0), (0, 72), (0, -72)):
            portals += [(cx, cz + 10), (cx, cz - 10), (cx + 10, cz), (cx - 10, cz)]
        portals += [(0, 135), (0, -135), (135, 0), (-135, 0),
                    (95, 95), (-95, 95), (95, -95), (-95, -95)]
    else:
        # входы площади
        portals += [(0, 52), (0, -52), (52, 0), (-52, 0)]
        # туннели (середина и концы)
        portals += [(0, 110), (0, -110), (110, 0), (-110, 0)]
        portals += [(0, 160), (0, -160), (160, 0), (-160, 0)]
        # проёмы кольцевой стены
        portals += [(0, 172), (0, -172), (172, 0), (-172, 0)]
        # двери угловых башен
        for (tx, tz) in ((155, 155), (-155, 155), (155, -155), (-155, -155)):
            ix = 155 - 6 if tx > 0 else -(155 - 6)
            iz = 155 - 6 if tz > 0 else -(155 - 6)
            portals += [(tx, iz), (ix, tz)]
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
#  FLOW-FIELD (демоны идут к центру — дёшево для десятков ботов)
# ============================================================
flow_dist: list[int] = []
flow_next: list[int] = []


def build_flow_field(gx: float, gz: float) -> None:
    """BFS-градиент по навмешу от цели. Демоны читают flow_next — O(1) на тик."""
    global flow_dist, flow_next
    n = len(nav_pts)
    flow_dist = [-1] * n
    flow_next = [-1] * n
    start = nearest_nav(gx, gz)
    if start is None:
        return
    flow_dist[start] = 0
    q = deque([start])
    while q:
        cur = q.popleft()
        for nb in nav_adj[cur]:
            if flow_dist[nb] == -1:
                flow_dist[nb] = flow_dist[cur] + 1
                flow_next[nb] = cur
                q.append(nb)


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
    if MODE == "defense":
        # игроки всегда в центре крепости, лицом наружу
        for _ in range(40):
            x = random.uniform(-15.0, 15.0)
            z = random.uniform(-15.0, 15.0)
            if wall_at_point(x, z, 1.2):
                continue
            safe = True
            for p in players.values():
                if p.get("is_dead") or not p.get("is_bot"):
                    continue
                if (p["x"] - x) ** 2 + (p["z"] - z) ** 2 < 12 * 12:
                    safe = False
                    break
            if safe:
                return x, z, math.atan2(-x, -z)
        return 0.0, 0.0, 0.0
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
            ry = math.atan2(x, z)  # FFA: лицом к центру карты
            return x, z, ry
    x = 0.0
    z = SPAWN_RANGE
    return x, z, math.atan2(x, z)


DEMON_SPAWNS = [
    (0, 135), (0, -135), (135, 0), (-135, 0),
    (95, 95), (-95, 95), (95, -95), (-95, -95),
]


def make_demon_spawn() -> tuple[float, float, float]:
    """Спавн демона на краю карты обороны, лицом к центру."""
    for _ in range(30):
        sx, sz = random.choice(DEMON_SPAWNS)
        x = sx + random.uniform(-8, 8)
        z = sz + random.uniform(-8, 8)
        if wall_at_point(x, z, 1.5):
            continue
        return x, z, math.atan2(-(0 - x), -(0 - z)) + math.pi
    sx, sz = random.choice(DEMON_SPAWNS)
    return sx, sz, math.atan2(-(0 - sx), -(0 - sz)) + math.pi


def make_medkits():
    medkits.clear()
    for (x, z) in MEDKIT_SPOTS:
        if wall_at_point(x, z, 1.0):
            continue
        mid = uuid.uuid4().hex[:6]
        medkits[mid] = {"id": mid, "x": float(x), "z": float(z),
                        "available": True, "respawn_at": 0.0}


MEDKIT_SPOTS = [
    (0, 30), (0, -30), (30, 0), (-30, 0),
    (0, 105), (0, -105), (105, 0), (-105, 0),
    (80, 75), (-80, 75), (80, -75), (-80, -75),
    (155, 120), (-155, 120), (155, -120), (-155, -120),
    (120, 155), (-120, 155), (120, -155), (-120, -155),
    (186, 0), (0, 186), (-186, 0), (0, -186),
] if MAP_MODE == "ffa" else [
    (0, 14), (0, -14), (14, 0), (-14, 0),
    (72, 14), (-72, 14), (72, -14), (-72, -14),
    (14, 72), (-14, 72), (14, -72), (-14, -72),
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
def hitbox_of(p: dict):
    """(head_off, head_r, body_off, body_r) — у демонов и босса масштабируется."""
    if p.get("boss"):
        s = 1.45
        return (HEAD_OFFSET * s, HEAD_RADIUS * s * 1.15, BODY_OFFSET * s, BODY_RADIUS * s)
    if p.get("is_demon"):
        cfg = DEMON_TYPES.get(p.get("dt", "runner"), DEMON_TYPES["runner"])
        s = float(cfg.get("scale", 1.0))
        return (2.2 * s, max(0.26, 0.32 * s), 1.05 * s, 0.85 * s)
    return (HEAD_OFFSET, HEAD_RADIUS, BODY_OFFSET, BODY_RADIUS)


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
        head_off, head_r, body_off, body_r = hitbox_of(op)
        th = ray_sphere(ox, oy, oz, dx, dy, dz,
                        tx, ty + head_off, tz, head_r)
        tb = ray_sphere(ox, oy, oz, dx, dy, dz,
                        tx, ty + body_off, tz, body_r)

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
    mag = mag_eff(p) if not p.get("is_bot") else weapon_of(p)["mag"]
    need = max(0, mag - int(p.get("ammo", 0)))
    take = min(int(p.get("reserve", 0)), need)
    p["ammo"] = int(p.get("ammo", 0)) + take
    p["reserve"] = int(p.get("reserve", 0)) - take
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
    mag = mag_eff(shooter)
    reload_time = reload_eff(shooter)

    finish_reload(shooter)
    if now < shooter.get("reload_end", 0.0):
        return
    if now - shooter.get("last_shot", 0.0) < wp["cooldown"]:
        return

    ammo = int(shooter.get("ammo", mag))
    if ammo <= 0:
        if int(shooter.get("reserve", 0)) > 0:
            shooter["reload_end"] = now + reload_time
        await send_to(shooter_pid, {"type": "no_ammo"})
        return
    shooter["last_shot"] = now
    ammo -= 1
    shooter["ammo"] = ammo
    if ammo <= 0 and int(shooter.get("reserve", 0)) > 0:
        shooter["reload_end"] = now + reload_time

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
        dmg = info["dmg"] * dmg_mult(shooter)
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
    is_demon = bool(target.get("is_demon"))
    target["is_dead"] = True
    target["respawn_at"] = now + RESPAWN_TIME
    target["deaths"] = int(target.get("deaths", 0)) + 1
    target["streak"] = 0
    target["multi"] = 0
    if not is_demon:
        spawn_pickup(target["x"], target["z"])
    killer = players.get(killer_pid)
    killer_name = killer.get("name", "?") if killer else "?"
    points_gain = 0

    if killer and killer_pid != target_pid:
        killer["kills"] = int(killer.get("kills", 0)) + 1
        killer["streak"] = int(killer.get("streak", 0)) + 1
        if now - killer.get("last_kill", 0.0) < 4.0:
            killer["multi"] = int(killer.get("multi", 0)) + 1
        else:
            killer["multi"] = 1
        killer["last_kill"] = now
        if MODE == "defense" and is_demon and not killer.get("is_bot"):
            points_gain = int(DEF["points_per_kill"])
            killer["points"] = int(killer.get("points", 0)) + points_gain
        await grant_streak_rewards(killer)
        # лимит убийств завершает FFA-раунд
        if (ROTATION and ROUND["phase"] == "ffa"
                and int(killer.get("kills", 0)) >= FFA_KILL_LIMIT):
            await end_ffa_round("kills")

    await broadcast({
        "type": "kill",
        "shooter": killer_pid,
        "target": target_pid,
        "shooter_name": killer_name,
        "target_name": target.get("name", "?"),
        "headshot": headshot,
        "explosion": explosion,
        "weapon": weapon,
        "demon": is_demon,
        "demon_type": target.get("dt", ""),
        "points_gain": points_gain,
        "shooter_kills": killer["kills"] if killer else 0,
        "shooter_streak": killer.get("streak", 0) if killer else 0,
        "target_deaths": target["deaths"],
        "target_x": target["x"], "target_y": target["y"], "target_z": target["z"],
    })

    # Босс повержен: награда убийце (ядерная бомба) + таймер респавна
    if target.get("boss"):
        await boss_defeated(target, killer)

    # Смерть демона = взрыв с уроном по радиусу (как граната)
    if is_demon:
        await demon_explode(target)
        if MODE == "defense":
            bots.pop(target_pid, None)
            players.pop(target_pid, None)


async def grant_streak_rewards(killer: dict):
    if killer.get("is_bot"):
        return
    streak = int(killer.get("streak", 0))
    multi = int(killer.get("multi", 0))
    pid = killer.get("id")
    gn = killer.setdefault("grenades", dict(GRENADE_START))
    reward = None
    if streak == 3:
        killer["hp"] = min(max_hp_of(killer), int(killer["hp"]) + 50)
        reward = "+50 HP"
    elif streak == 5:
        gn["frag"] = min(GRENADE_CAP["frag"], int(gn.get("frag", 0)) + 2)
        reward = "+2 ГРАНАТЫ"
    elif streak == 7:
        gn["smoke"] = min(GRENADE_CAP["smoke"], int(gn.get("smoke", 0)) + 1)
        gn["flash"] = min(GRENADE_CAP["flash"], int(gn.get("flash", 0)) + 1)
        reward = "+ДЫМ +ФЛЕШ"
    elif streak == 12:
        killer["hp"] = max_hp_of(killer)
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
        # ровно 4 секунды слепоты всем в зоне видимости
        for bid, b in bots.items():
            if b.get("is_dead"):
                continue
            d = math.hypot(b["x"] - gx, b["z"] - gz)
            if d > FLASH_RANGE:
                continue
            if not los_clear(gx, gz, b["x"], b["z"], use_smoke=False):
                continue
            b["blind_until"] = max(b.get("blind_until", 0.0), now + FLASH_BLIND_TIME)
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
#  ДЕМОНЫ (замена ботов) — типы, волны, экономика
# ============================================================
DEMON_TYPES = {
    "runner":   {"hp": 60,   "speed": 5.4, "dmg": 12, "scale": 0.85, "explode": 42,
                 "atk_cd": 1.1, "spit_cd": 3.2, "melee": 2.6, "color": 0xff3322, "label": "БЕГУН"},
    "brute":    {"hp": 240,  "speed": 2.7, "dmg": 30, "scale": 1.55, "explode": 85,
                 "atk_cd": 1.9, "spit_cd": 6.0, "melee": 3.0, "color": 0xaa1122, "label": "ГРОМИЛА"},
    "screamer": {"hp": 95,   "speed": 3.5, "dmg": 10, "scale": 1.0, "explode": 55,
                 "atk_cd": 1.5, "spit_cd": 4.0, "melee": 2.6, "color": 0xdd66ff, "label": "ВИЗГУН"},
    "spitter":  {"hp": 85,   "speed": 3.2, "dmg": 14, "scale": 1.0, "explode": 50,
                 "atk_cd": 1.5, "spit_cd": 2.2, "melee": 2.4, "color": 0x66dd44, "label": "ПЛЕВУН"},
    "titan":    {"hp": 1600, "speed": 2.3, "dmg": 55, "scale": 2.5, "explode": 140,
                 "atk_cd": 2.2, "spit_cd": 3.0, "melee": 3.6, "color": 0x660011, "label": "ТИТАН"},
}
DEMON_SPIT_RANGE = 34.0
DEMON_SPIT_FALLOFF = 0.45

wave_state = {"wave": 0, "phase": "idle", "next_at": 0.0,
              "to_spawn": 0, "spawned": 0, "last_spawn": 0.0}

UPGRADES = {
    "dmg":    {"costs": [100, 150, 225, 340, 500]},
    "mag":    {"costs": [80, 120, 180, 270, 400]},
    "reload": {"costs": [80, 120, 180, 270, 400]},
    "speed":  {"costs": [60, 90, 135, 200, 300]},
    "hp":     {"costs": [70, 105, 160, 240, 360]},
}
UPGRADE_MAX = 5


def upg(p: dict, key: str) -> int:
    return int(p.get("upgrades", {}).get(key, 0))


def weapon_of(p: dict) -> dict:
    return WEAPONS.get(p.get("weapon", "rifle"), WEAPONS["rifle"])


def mag_eff(p: dict) -> int:
    return int(round(weapon_of(p)["mag"] * (1.0 + 0.15 * upg(p, "mag"))))


def reload_eff(p: dict) -> float:
    return weapon_of(p)["reload"] * (1.0 - 0.08 * upg(p, "reload"))


def dmg_mult(p: dict) -> float:
    return 1.0 + 0.08 * upg(p, "dmg")


def max_hp_of(p: dict) -> int:
    return 100 + 20 * upg(p, "hp")


def wave_demon_count(w: int) -> int:
    return int(DEF["wave_base"]) + (w - 1) * int(DEF["wave_growth"])


def wave_type_mix(w: int):
    mix = ["runner"] * 4 + ["screamer"] * 2 + ["spitter"] * 2
    if w >= 2:
        mix += ["brute"] * (1 + w // 3)
    return mix


# --- люди-боты (режим FFA): тактические классы, стреляют из оружия ---
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


def make_bot(_idx: int = 0, dtype: str | None = None):
    bid = "bot_" + uuid.uuid4().hex[:6]
    if MODE == "defense":
        bot = new_demon(bid, dtype)
    else:
        bot = new_human_bot(bid)
    bots[bid] = bot
    players[bid] = bot


def new_human_bot(bid: str):
    """Бот-человек: оружие, стрельба, гранаты, аптечки."""
    x, z, ry = make_spawn()
    weapon = random.choice(BOT_WEAPONS)
    cls = bot_class_for(weapon)
    cfg = BOT_CLASSES[cls]
    name = random.choice(BOT_NAMES) + str(random.randint(1, 99))
    wp = WEAPONS[weapon]
    return {
        "id": bid, "name": name, "color": random.choice(RED_COLORS), "weapon": weapon,
        "cls": cls, "is_demon": False,
        "x": x, "y": 0.0, "z": z, "ry": ry, "rx": 0.0,
        "hp": cfg["hp"], "max_hp": cfg["hp"], "kills": 0, "deaths": 0,
        "is_dead": False, "is_bot": True,
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


def new_demon(bid: str, dtype: str | None = None):
    if dtype is None:
        dtype = random.choice(("runner", "runner", "screamer", "spitter", "brute"))
    cfg = DEMON_TYPES.get(dtype, DEMON_TYPES["runner"])
    if MODE == "defense":
        x, z, ry = make_demon_spawn()
        wave = max(1, int(wave_state.get("wave", 1)))
    else:
        x, z, ry = make_spawn()
        wave = 1
    hp_mult = min(float(DEF["hp_cap"]), 1.0 + float(DEF["hp_growth"]) * (wave - 1))
    spd_mult = min(float(DEF["speed_cap"]), 1.0 + float(DEF["speed_growth"]) * (wave - 1))
    dmg_mult_w = min(float(DEF["dmg_cap"]), 1.0 + float(DEF["dmg_growth"]) * (wave - 1))
    hp = int(cfg["hp"] * hp_mult)
    return {
        "id": bid, "name": cfg["label"] + " " + uuid.uuid4().hex[3:6].upper(),
        "color": cfg["color"], "weapon": dtype,
        "dt": dtype, "cls": dtype, "is_demon": True,
        "x": x, "y": 0.0, "z": z, "ry": ry, "rx": 0.0,
        "hp": hp, "max_hp": hp, "kills": 0, "deaths": 0, "is_dead": False, "is_bot": True,
        "streak": 0, "multi": 0, "last_kill": 0.0,
        "ammo": 0, "reserve": 0, "reload_end": 0.0, "last_shot": 0.0,
        "grenades": {}, "last_grenade": 0.0,
        "respawn_at": 0.0,
        "target_pid": None, "engage_at": 0.0,
        "path": None, "path_i": 0, "repath_at": 0.0, "goal": None,
        "flow_i": None, "flow_at": 0.0,
        "blind_until": 0.0, "strafe_dir": random.choice((-1, 1)), "strafe_at": 0.0,
        "speed": cfg["speed"] * spd_mult,
        "dmg": cfg["dmg"] * dmg_mult_w,
        "atk_cd": cfg["atk_cd"], "spit_cd": cfg["spit_cd"],
        "melee": cfg["melee"],
        "last_atk": 0.0, "last_spit": 0.0,
        "anim": "walk", "anim_until": 0.0,
        "scream_at": time.time() + random.uniform(4.0, 14.0),
        "rage_until": 0.0,
        "stuck": 0.0, "last_x": x, "last_z": z,
        "vx": 0.0, "vz": 0.0,
    }


def bot_respawn(b, now: float):
    """Респавн ботов (FFA: люди; демоны в обороне не возрождаются)."""
    fresh = new_human_bot(b["id"])
    keep = {k: b.get(k) for k in ("kills", "deaths")}
    b.update(fresh)
    b.update(keep)
    b["respawn_at"] = 0.0


# --- БОСС: неподвижный титан в центре карты, награда — ядерная бомба ---
def new_boss():
    return {
        "id": "boss", "name": "ТИТАН-БОСС", "color": 0xFF1512, "weapon": "boss_gun",
        "cls": "boss", "is_demon": False, "boss": True,
        "x": BOSS_POS[0], "y": 0.0, "z": BOSS_POS[1], "ry": math.pi, "rx": 0.0,
        "hp": BOSS_HP, "max_hp": BOSS_HP, "kills": 0, "deaths": 0, "is_dead": False, "is_bot": True,
        "streak": 0, "multi": 0, "last_kill": 0.0,
        "ammo": 10 ** 9, "reserve": 10 ** 9, "reload_end": 0.0, "last_shot": 0.0,
        "grenades": {}, "last_grenade": 0.0, "respawn_at": 0.0,
        "vx": 0.0, "vz": 0.0,
    }


async def update_boss(dt: float, now: float) -> None:
    """Босс стоит в центре, не уходит; стреляет по игрокам в радиусе."""
    if MODE != "ffa":
        return
    b = players.get("boss")
    if b is None:
        if now >= boss_spawn_at:
            players["boss"] = new_boss()
            await broadcast({"type": "boss_spawn"})
            print("[BOSS] ТИТАН-БОСС появился в центре арены")
        return
    if b.get("is_dead"):
        if now >= b.get("respawn_at", 1e18):
            players["boss"] = new_boss()
            await broadcast({"type": "boss_spawn"})
            print("[BOSS] новый ТИТАН-БОСС")
        return

    best = None
    best_d = 1e9
    for pid, p in players.items():
        if pid == "boss" or p.get("is_dead") or p.get("is_bot"):
            continue
        d = math.hypot(p["x"] - b["x"], p["z"] - b["z"])
        if d < best_d and los_clear(b["x"], b["z"], p["x"], p["z"]):
            best, best_d = p, d
    if best and best_d < 85.0:
        target_ry = math.atan2(-(best["x"] - b["x"]), -(best["z"] - b["z"]))
        d_ang = (target_ry - b["ry"] + math.pi) % (2 * math.pi) - math.pi
        b["ry"] += d_ang * min(1.0, dt * 2.5)
        if abs(d_ang) < 0.3:
            err = 0.04 + min(0.12, best_d / 400.0)
            await process_shoot("boss", {
                "ry": b["ry"] + random.uniform(-err, err),
                "rx": random.uniform(-0.06, 0.06),
            })


async def boss_defeated(target: dict, killer) -> None:
    """Босс убит: убийца получает ядерную бомбу, новый босс — через 15 минут."""
    target["respawn_at"] = time.time() + BOSS_RESPAWN
    target["next_boss_in"] = int(BOSS_RESPAWN)
    if killer and not killer.get("is_bot") and killer.get("id") != target.get("id"):
        killer["nuke_ready"] = True
        await send_to(killer["id"], {"type": "boss_down", "killer": killer["id"],
                                     "killer_name": killer.get("name", "?"),
                                     "next_in": int(BOSS_RESPAWN)})
        await broadcast({"type": "boss_defeated", "killer": killer["id"],
                         "killer_name": killer.get("name", "?"),
                         "next_in": int(BOSS_RESPAWN)})
    else:
        await broadcast({"type": "boss_defeated", "killer": "", "killer_name": "",
                         "next_in": int(BOSS_RESPAWN)})


# ============================================================
#  РОТАЦИЯ РЕЖИМОВ И ГОЛОСОВАНИЕ
# ============================================================
ROUND = {
    "phase": "ffa" if (ROTATION and MODE == "ffa") else MODE,
    "ends_at": (time.time() + FFA_DURATION) if ROTATION else 0.0,
    "vote_ends_at": 0.0,
    "votes": {},
    "winner": None,
}
VOTE_OPTIONS = ("defense", "ffa")


def vote_counts() -> dict:
    c = {"ffa": 0, "defense": 0}
    for v in ROUND["votes"].values():
        if v in c:
            c[v] += 1
    return c


def reset_player_for_round(p: dict) -> None:
    """Полный сброс игрока к началу раунда: возрождение, статы, экономика."""
    x, z, ry = make_spawn()
    p["x"] = round(x, 3)
    p["z"] = round(z, 3)
    p["y"] = 0.0
    p["ry"] = round(ry, 4)
    p["rx"] = 0.0
    p["is_dead"] = False
    p["upgrades"] = {k: 0 for k in UPGRADES}
    p["points"] = 0
    p["max_hp"] = 100
    p["hp"] = 100
    p["kills"] = 0
    p["deaths"] = 0
    p["streak"] = 0
    p["multi"] = 0
    p["last_kill"] = 0.0
    p["ammo"] = mag_eff(p)
    p["reserve"] = mag_eff(p) * RESERVE_MAGS
    p["reload_end"] = 0.0
    p["reload_left"] = 0.0
    p["grenades"] = dict(GRENADE_START)
    p["nuke_ready"] = False
    p.pop("respawn_at", None)


async def start_vote(reason: str, seconds: float) -> None:
    ROUND["phase"] = "defeat_vote" if reason == "defeat" else "vote"
    ROUND["votes"] = {}
    ROUND["vote_ends_at"] = time.time() + seconds
    await broadcast({"type": "vote_start", "options": list(VOTE_OPTIONS),
                     "seconds": int(seconds), "reason": reason})
    print(f"[ROT] голосование ({reason}) на {int(seconds)}с")


async def end_ffa_round(reason: str) -> None:
    best = None
    for p in players.values():
        if best is None or int(p.get("kills", 0)) > int(best.get("kills", 0)):
            best = p
    ROUND["winner"] = best
    await broadcast({"type": "round_end", "mode": "ffa", "reason": reason,
                     "winner_name": best.get("name", "?") if best else "",
                     "winner_kills": int(best.get("kills", 0)) if best else 0,
                     "kill_limit": FFA_KILL_LIMIT})
    await start_vote(reason, VOTE_SECONDS)


async def resolve_vote() -> None:
    counts = vote_counts()
    if counts["ffa"] == counts["defense"]:
        chosen = random.choice(VOTE_OPTIONS)  # ничья или нет голосов — рандом
    else:
        chosen = "ffa" if counts["ffa"] > counts["defense"] else "defense"
    await broadcast({"type": "vote_end", "chosen": chosen, "counts": counts})
    await apply_mode(chosen)


async def apply_mode(mode: str) -> None:
    """Переключение режима: сброс раунда, ботов и экономики."""
    global MODE, boss_spawn_at
    now = time.time()
    MODE = mode
    ROUND["phase"] = mode
    ROUND["votes"] = {}
    ROUND["winner"] = None
    ROUND["vote_ends_at"] = 0.0
    for bid in [pid for pid, p in players.items() if p.get("is_bot")]:
        players.pop(bid, None)
        bots.pop(bid, None)
    grenades.clear()
    acid_globs.clear()
    smokes.clear()
    if mode == "ffa":
        ROUND["ends_at"] = now + FFA_DURATION
        boss_spawn_at = now + BOSS_SPAWN_DELAY
        wave_state.update({"wave": 0, "phase": "idle", "next_at": 0.0,
                           "to_spawn": 0, "spawned": 0, "last_spawn": 0.0})
        for pid in list(clients):
            p = players.get(pid)
            if p:
                reset_player_for_round(p)
        await broadcast({"type": "mode_start", "mode": "ffa",
                         "duration": int(FFA_DURATION), "kill_limit": FFA_KILL_LIMIT})
        print("[ROT] режим: АРЕНА (с ботами)")
    else:
        ROUND["ends_at"] = 0.0
        wave_state.update({"wave": 0, "phase": "break",
                           "next_at": now + float(DEF["first_break_seconds"]),
                           "to_spawn": 0, "spawned": 0, "last_spawn": 0.0})
        for pid in list(clients):
            p = players.get(pid)
            if p:
                reset_player_for_round(p)
        await broadcast({"type": "mode_start", "mode": "defense", "wave": 0,
                         "break_seconds": int(DEF["first_break_seconds"])})
        print("[ROT] режим: ОБОРОНА (с демонами)")


async def rotation_tick(now: float) -> None:
    if not ROTATION:
        return
    ph = ROUND["phase"]
    if ph == "ffa":
        if ROUND["ends_at"] and now >= ROUND["ends_at"]:
            await end_ffa_round("time")
    elif ph in ("vote", "defeat_vote"):
        if clients and all(pid in ROUND["votes"] for pid in clients):
            await resolve_vote()  # проголосовали все — не ждём таймер
        elif now >= ROUND["vote_ends_at"]:
            await resolve_vote()


async def demon_explode(b: dict) -> None:
    """Смерть демона: урон по радиусу, как граната."""
    cfg = DEMON_TYPES.get(b.get("dt", "runner"), DEMON_TYPES["runner"])
    radius = 7.0 if MODE == "defense" else 5.0
    base = cfg["explode"] * (0.6 if MODE == "ffa" else 1.0)
    gx, gz = b["x"], b["z"]
    await broadcast({"type": "demon_explode", "id": b.get("id"),
                     "x": round(gx, 2), "z": round(gz, 2), "r": radius})
    for pid, p in list(players.items()):
        if p.get("is_bot") or p.get("is_dead"):
            continue
        d = math.hypot(p["x"] - gx, p["z"] - gz)
        if d > radius:
            continue
        if not los_clear(gx, gz, p["x"], p["z"], use_smoke=False) and d > 2.0:
            continue
        dmg = int(base * (1.0 - d / radius))
        if dmg <= 0:
            continue
        p["hp"] = max(0, int(p["hp"]) - dmg)
        await broadcast({"type": "hit", "shooter": b.get("id"), "target": pid,
                         "hp": p["hp"], "damage": dmg, "headshot": False, "explosion": True})
        if p["hp"] <= 0:
            await apply_death(pid, b.get("id"), False, True, "ДЕМОН")


acid_globs: dict[str, dict] = {}
ACID_SPEED = 26.0
ACID_RADIUS = 2.2


async def demon_acid_spit(b: dict, target: dict) -> None:
    """Плевун выпускает летящий кислотный снаряд (его можно уклонять)."""
    now = time.time()
    b["last_spit"] = now
    b["anim"] = "spit"
    b["anim_until"] = now + 0.55
    dx = target["x"] - b["x"]
    dz = target["z"] - b["z"]
    d = math.hypot(dx, dz) or 1.0
    lead = d / ACID_SPEED
    tx = target["x"] + target.get("vx", 0.0) * lead
    tz = target["z"] + target.get("vz", 0.0) * lead
    dx = tx - b["x"]
    dz = tz - b["z"]
    d = math.hypot(dx, dz) or 1.0
    gid = "ac_" + uuid.uuid4().hex[:6]
    acid_globs[gid] = {
        "id": gid, "owner": b.get("id"),
        "x": b["x"] + dx / d * 0.8, "y": 1.6, "z": b["z"] + dz / d * 0.8,
        "vx": dx / d * ACID_SPEED, "vz": dz / d * ACID_SPEED,
        "dmg": max(6, int(b.get("dmg", 12) * 1.2)),
        "until": now + 3.0,
    }
    await broadcast({"type": "acid_spawn", "id": gid, "owner": b.get("id"),
                     "x": round(acid_globs[gid]["x"], 2), "y": 1.6,
                     "z": round(acid_globs[gid]["z"], 2),
                     "vx": round(acid_globs[gid]["vx"], 2),
                     "vz": round(acid_globs[gid]["vz"], 2)})


async def step_acid(dt: float) -> None:
    now = time.time()
    pops = []
    for gid, g in list(acid_globs.items()):
        if now >= g["until"]:
            pops.append((gid, False))
            continue
        nx = g["x"] + g["vx"] * dt
        nz = g["z"] + g["vz"] * dt
        hit = False
        for pid, p in players.items():
            if p.get("is_bot") or p.get("is_dead"):
                continue
            if math.hypot(p["x"] - nx, p["z"] - nz) < 0.9:
                hit = True
                break
        if hit or wall_at_point_h(nx, nz, 1.4, 0.2):
            pops.append((gid, hit))
            continue
        g["x"], g["z"] = nx, nz
    for gid, hit_player in pops:
        g = acid_globs.pop(gid, None)
        if not g:
            continue
        await broadcast({"type": "acid_pop", "id": gid,
                         "x": round(g["x"], 2), "y": 0.6, "z": round(g["z"], 2),
                         "hit": hit_player})
        for pid, p in list(players.items()):
            if p.get("is_bot") or p.get("is_dead"):
                continue
            d = math.hypot(p["x"] - g["x"], p["z"] - g["z"])
            if d > ACID_RADIUS:
                continue
            dmg = int(g["dmg"] * (1.0 - d / ACID_RADIUS))
            if dmg <= 0:
                continue
            p["hp"] = max(0, int(p["hp"]) - dmg)
            await broadcast({"type": "hit", "shooter": g["owner"], "target": pid,
                             "hp": p["hp"], "damage": dmg, "headshot": False})
            if p["hp"] <= 0:
                await apply_death(pid, g["owner"], False, False, "КИСЛОТА")


async def demon_attack(b: dict, target: dict, kind: str) -> None:
    """Атаки демона: claw (когти), slam (удар по земле с волной)."""
    now = time.time()
    base = int(b.get("dmg", 10))

    if kind == "slam":
        radius = 7.0 if b.get("dt") == "titan" else 5.0
        b["last_atk"] = now
        b["anim"] = "slam"
        b["anim_until"] = now + 0.9
        await broadcast({"type": "demon_attack", "id": b.get("id"), "kind": "slam",
                         "x": round(b["x"], 2), "z": round(b["z"], 2), "r": radius})
        for pid, p in list(players.items()):
            if p.get("is_bot") or p.get("is_dead"):
                continue
            d = math.hypot(p["x"] - b["x"], p["z"] - b["z"])
            if d > radius:
                continue
            dmg = int(base * 1.4 * (1.0 - 0.6 * d / radius))
            if dmg <= 0:
                continue
            p["hp"] = max(0, int(p["hp"]) - dmg)
            await broadcast({"type": "hit", "shooter": b.get("id"), "target": pid,
                             "hp": p["hp"], "damage": dmg, "headshot": False,
                             "explosion": True})
            if p["hp"] <= 0:
                await apply_death(pid, b.get("id"), False, True, "УДАР")
        return

    # когти
    b["last_atk"] = now
    b["anim"] = "attack"
    b["anim_until"] = now + 0.55
    await broadcast({"type": "demon_attack", "id": b.get("id"), "kind": "claw",
                     "target": target.get("id"),
                     "x": round(b["x"], 2), "z": round(b["z"], 2),
                     "tx": round(target["x"], 2), "tz": round(target["z"], 2)})
    target["hp"] = max(0, int(target["hp"]) - base)
    if target["hp"] <= 0:
        await apply_death(target.get("id"), b.get("id"), False, False, "КОГТИ")
    else:
        await broadcast({"type": "hit", "shooter": b.get("id"), "target": target.get("id"),
                         "hp": target["hp"], "damage": base, "headshot": False})


async def wave_tick(now: float, dt: float) -> None:
    """Волны режима обороны: перерыв -> старт -> спавн -> зачистка -> перерыв."""
    if MODE != "defense":
        return
    st = wave_state
    if st["phase"] == "idle":
        if clients:
            st["phase"] = "break"
            st["next_at"] = now + float(DEF["first_break_seconds"])
            await broadcast({"type": "wave", "state": "break", "wave": 1,
                             "next_in": int(DEF["first_break_seconds"])})
        return

    if st["phase"] == "break":
        if now >= st["next_at"]:
            st["wave"] += 1
            st["phase"] = "active"
            st["to_spawn"] = wave_demon_count(st["wave"])
            st["spawned"] = 0
            st["last_spawn"] = now
            await broadcast({"type": "wave", "state": "start", "wave": st["wave"],
                             "count": st["to_spawn"]})
            if st["wave"] % 5 == 0:
                make_bot(dtype="titan")
                st["spawned"] += 1
        return

    if st["phase"] == "active":
        humans = [players[p] for p in clients if p in players]
        if humans and all(p.get("is_dead") for p in humans):
            st["phase"] = "defeat"
            st["next_at"] = now + float(DEF["defeat_restart_seconds"])
            await broadcast({"type": "wave", "state": "defeat", "wave": st["wave"]})
            if ROTATION:
                await start_vote("defeat", DEFEAT_VOTE_SECONDS)
            return

        if (st["spawned"] < st["to_spawn"] and len(bots) < int(DEF["max_alive"])
                and now - st["last_spawn"] >= float(DEF["spawn_interval"])):
            make_bot(dtype=random.choice(wave_type_mix(st["wave"])))
            st["spawned"] += 1
            st["last_spawn"] = now

        if st["spawned"] >= st["to_spawn"] and len(bots) == 0:
            st["phase"] = "break"
            st["next_at"] = now + float(DEF["break_seconds"])
            revived = 0
            for pid in list(clients):
                p = players.get(pid)
                if not p:
                    continue
                if p.get("is_dead"):
                    # павшие воскресают после зачистки волны
                    x, z, ry = make_spawn()
                    p["x"] = round(x, 3)
                    p["z"] = round(z, 3)
                    p["y"] = 0.0
                    p["ry"] = round(ry, 4)
                    p["is_dead"] = False
                    p["hp"] = max_hp_of(p)
                    p["ammo"] = mag_eff(p)
                    p["reserve"] = mag_eff(p) * RESERVE_MAGS
                    p["reload_end"] = 0.0
                    p["grenades"] = dict(GRENADE_START)
                    p.pop("respawn_at", None)
                    revived += 1
                else:
                    p["hp"] = min(max_hp_of(p), int(p["hp"]) + int(DEF["heal_on_wave_clear"]))
                    p["grenades"] = dict(GRENADE_START)
                    p["reserve"] = mag_eff(p) * RESERVE_MAGS
            await broadcast({"type": "wave", "state": "clear", "wave": st["wave"],
                             "next_in": int(DEF["break_seconds"]), "revived": revived})
        return

    if st["phase"] == "defeat":
        if ROTATION:
            return  # судьбу режима решает голосование
        if now >= st["next_at"]:
            for bid in list(bots.keys()):
                bots.pop(bid, None)
                players.pop(bid, None)
            st["wave"] = 0
            st["phase"] = "break"
            st["next_at"] = now + float(DEF["first_break_seconds"])
            await broadcast({"type": "wave", "state": "reset",
                             "next_in": int(DEF["first_break_seconds"])})
        return


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


async def update_human_bots(dt: float, now: float):
    """FFA: боты-люди — стреляют из оружия, стрейфят, лечатся, патрулируют."""
    human_count = len(clients)
    desired = min(MAX_BOTS, max(8, human_count * 5))
    while len(bots) < desired:
        make_bot()
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

        wp = weapon_of(b)
        mag = wp["mag"]
        finish_reload(b)
        if b.get("ammo", mag) <= 0 and b.get("reload_end", 0.0) <= 0:
            b["reload_end"] = now + wp["reload"] + random.uniform(0, 0.4)

        best = None
        best_score = 1e18
        for pid, p in players.items():
            if pid == bid or p.get("is_dead"):
                continue
            if p.get("boss"):
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
                        gx, gz = 0.0, ARENA_HALF * 0.6
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


async def update_demon_bots(dt: float, now: float):
    """Оборона: демоны — когти, слэм, визг и кислотные снаряды (без стрельбы)."""
    pending = []

    for bid, b in list(bots.items()):
        if b["is_dead"]:
            continue

        moved = math.hypot(b["x"] - b.get("last_x", b["x"]), b["z"] - b.get("last_z", b["z"]))
        b["last_x"], b["last_z"] = b["x"], b["z"]
        if moved < 0.6 * dt * 3:
            b["stuck"] += dt
        else:
            b["stuck"] = max(0.0, b.get("stuck", 0.0) - dt)
        if b.get("stuck", 0.0) > 0.8:
            b["stuck"] = 0.0
            b["path"] = None
            b["flow_i"] = None

        # ослеплён флешем — слепо мечется
        if now < b.get("blind_until", 0.0):
            b["anim"] = "stumble"
            b["anim_until"] = now + 0.3
            b["ry"] += random.uniform(-1.0, 1.0) * dt * 2.5
            dx = -math.sin(b["ry"])
            dz = -math.cos(b["ry"])
            if wall_at_point(b["x"] + dx, b["z"] + dz, 0.55):
                b["ry"] += math.pi * 0.7
            bot_move(b, dx, dz, b.get("speed", 3.0) * 0.5, dt)
            continue

        # крик: у визгуна — звуковая атака по площади, у остальных — устрашение
        if now >= b.get("scream_at", 1e18):
            b["scream_at"] = now + random.uniform(9.0, 20.0)
            b["anim"] = "scream"
            b["anim_until"] = now + 1.1
            await broadcast({"type": "demon_scream", "id": bid,
                             "x": round(b["x"], 2), "z": round(b["z"], 2),
                             "kind": b.get("dt", "runner")})
            if b.get("dt") == "screamer":
                for pid, p in list(players.items()):
                    if p.get("is_bot") or p.get("is_dead"):
                        continue
                    d = math.hypot(p["x"] - b["x"], p["z"] - b["z"])
                    if d < 13.0 and los_clear(b["x"], b["z"], p["x"], p["z"], use_smoke=False):
                        dmg = max(3, int(b.get("dmg", 10) * 0.6 * (1.0 - d / 13.0)))
                        p["hp"] = max(0, int(p["hp"]) - dmg)
                        await broadcast({"type": "hit", "shooter": bid, "target": pid,
                                         "hp": p["hp"], "damage": dmg, "headshot": False})
                        if p["hp"] <= 0:
                            await apply_death(pid, bid, False, False, "ВИЗГ")
                for ob in bots.values():
                    if ob is b or ob.get("is_dead"):
                        continue
                    if math.hypot(ob["x"] - b["x"], ob["z"] - b["z"]) < 22.0:
                        ob["rage_until"] = max(ob.get("rage_until", 0.0), now + 5.0)

        # поиск цели: только люди
        best = None
        best_score = 1e18
        for pid, p in players.items():
            if pid == bid or p.get("is_bot") or p.get("is_dead"):
                continue
            d = math.hypot(p["x"] - b["x"], p["z"] - b["z"])
            if d > 95:
                continue
            if not los_clear(b["x"], b["z"], p["x"], p["z"]):
                continue
            if d < best_score:
                best_score = d
                best = (p, d)

        speed = b.get("speed", 3.0)
        if now < b.get("rage_until", 0.0):
            speed *= 1.18

        if best:
            t, dist = best
            if b.get("target_pid") != t.get("id"):
                b["target_pid"] = t.get("id")
                b["engage_at"] = now + random.uniform(0.15, 0.45)

            dx = t["x"] - b["x"]
            dz = t["z"] - b["z"]
            target_ry = math.atan2(-dx, -dz)
            d_ang = (target_ry - b["ry"] + math.pi) % (2 * math.pi) - math.pi
            b["ry"] += d_ang * min(1.0, dt * (7.0 - min(4.0, dist / 20.0)))
            b["rx"] = 0.0

            if now >= b.get("engage_at", 0.0) and abs(d_ang) < 0.35:
                if dist <= b.get("melee", 2.6) and now - b.get("last_atk", 0.0) >= b.get("atk_cd", 1.5):
                    kind = "claw"
                    if b.get("dt") in ("brute", "titan") and random.random() < 0.45:
                        kind = "slam"
                    pending.append((bid, t, kind))
                elif (5.0 < dist <= DEMON_SPIT_RANGE and b.get("dt") in ("spitter", "screamer")
                      and now - b.get("last_spit", 0.0) >= b.get("spit_cd", 3.0)):
                    pending.append((bid, t, "acid"))

            mvx, mvz = dx, dz
            if dist < 1.6:
                mvx = mvz = 0.0
            bot_move(b, mvx, mvz, speed, dt)
        else:
            b["target_pid"] = None
            # идём по flow-field к центру крепости
            if b.get("flow_i") is None or now >= b.get("flow_at", 0.0):
                b["flow_i"] = nearest_nav(b["x"], b["z"])
                b["flow_at"] = now + 0.8
            i = b.get("flow_i")
            if i is not None and 0 <= i < len(flow_next):
                j = flow_next[i]
                if j is not None and j >= 0:
                    tx, tz = nav_pts[j]
                    ddx, ddz = tx - b["x"], tz - b["z"]
                    if math.hypot(ddx, ddz) < 3.0:
                        b["flow_i"] = j
                        b["flow_at"] = 0.0
                    target_ry = math.atan2(-ddx, -ddz)
                    d_ang = (target_ry - b["ry"] + math.pi) % (2 * math.pi) - math.pi
                    b["ry"] += d_ang * min(1.0, dt * 4.0)
                    bot_move(b, ddx, ddz, speed * 0.95, dt)
                else:
                    if now >= b.get("repath_at", 0.0):
                        b["repath_at"] = now + random.uniform(1.5, 3.0)
                        b["goal"] = (random.uniform(-14, 14), random.uniform(-14, 14))
                    if b.get("goal"):
                        bot_move(b, b["goal"][0] - b["x"], b["goal"][1] - b["z"],
                                 speed * 0.7, dt)

        if now >= b.get("anim_until", 0.0):
            b["anim"] = "walk" if moved > 0.6 * dt * 3 else "idle"

    for bid, target, kind in pending:
        try:
            b = bots.get(bid)
            if not b or b.get("is_dead") or not target or target.get("is_dead"):
                continue
            if kind == "acid":
                await demon_acid_spit(b, target)
            else:
                await demon_attack(b, target, kind)
        except Exception as e:
            print("[DEMON ATK] err:", e)


async def update_bots_async(dt: float):
    now = time.time()
    if MODE == "ffa":
        await update_human_bots(dt, now)
    else:
        await update_demon_bots(dt, now)


async def bots_tick():
    last = time.time()
    while True:
        await asyncio.sleep(TICK_INTERVAL)
        now = time.time()
        dt = min(now - last, 0.1)
        last = now
        try:
            await step_grenades(dt)
            await step_acid(dt)
            await wave_tick(now, dt)
            await update_bots_async(dt)
            await update_boss(dt, now)
            await rotation_tick(now)
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
                # в ротации павшие ждут зачистки волны (или голосования после поражения)
                if ROTATION and MODE == "defense" and wave_state.get("phase") == "active":
                    continue
                x, z, ry = make_spawn()
                p["x"] = round(x, 3)
                p["y"] = 0.0
                p["z"] = round(z, 3)
                p["ry"] = round(ry, 4)
                p["rx"] = 0.0
                p["hp"] = max_hp_of(p)
                p["max_hp"] = max_hp_of(p)
                p["is_dead"] = False
                p["ammo"] = mag_eff(p)
                p["reserve"] = mag_eff(p) * RESERVE_MAGS
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
            "phase": ROUND["phase"],
            "round_left": int(max(0.0, ROUND["ends_at"] - now))
                          if (ROTATION and ROUND["phase"] == "ffa") else 0,
            "vote_ends_in": int(max(0.0, ROUND["vote_ends_at"] - now))
                            if ROUND["phase"] in ("vote", "defeat_vote") else 0,
            "vote_counts": vote_counts() if ROUND["phase"] in ("vote", "defeat_vote") else None,
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
            "hp": 100, "max_hp": 100, "kills": 0, "deaths": 0, "is_dead": False,
            "color": color, "name": name,
            "weapon": weapon, "last_shot": 0.0, "last_grenade": 0.0,
            "is_bot": False, "cls": "hunter",
            "ammo": wp["mag"], "reserve": wp["mag"] * RESERVE_MAGS,
            "reload_end": 0.0, "reload_left": 0.0,
            "grenades": dict(GRENADE_START),
            "streak": 0, "multi": 0, "last_kill": 0.0,
            "points": 0, "upgrades": {k: 0 for k in UPGRADES},
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
            "mode": MODE,
            "rotation": ROTATION,
            "phase": ROUND["phase"],
            "round_left": int(max(0.0, ROUND["ends_at"] - time.time()))
                          if (ROTATION and ROUND["phase"] == "ffa") else 0,
            "vote": ({"options": list(VOTE_OPTIONS),
                      "ends_in": int(max(0.0, ROUND["vote_ends_at"] - time.time()))}
                     if ROUND["phase"] in ("vote", "defeat_vote") else None),
            "wave": wave_state.get("wave", 0),
            "wave_phase": wave_state.get("phase", "idle"),
            "break_seconds": int(DEF["break_seconds"]),
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

        # подсказка о боссе для вошедшего (если босс уже на карте)
        if MODE == "ffa":
            b = players.get("boss")
            if b is not None and not b.get("is_dead"):
                await send_to(pid, {"type": "boss_spawn"})

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
                mag2 = mag_eff(p)
                rl2 = reload_eff(p)
                now_t = time.time()
                if (not p.get("is_dead") and p.get("reload_end", 0.0) <= now_t
                        and int(p.get("ammo", mag2)) < mag2
                        and int(p.get("reserve", 0)) > 0):
                    p["reload_end"] = now_t + rl2
                    await broadcast({"type": "reload", "player": pid,
                                     "duration": rl2, "ammo": p["ammo"],
                                     "mag": mag2})

            elif mt == "upgrade" and pid in players:
                p = players[pid]
                key = str(msg.get("id", ""))
                u = UPGRADES.get(key)
                if MODE != "defense":
                    await send_to(pid, {"type": "upgrade_deny", "id": key, "reason": "mode"})
                elif not u or p.get("is_dead"):
                    await send_to(pid, {"type": "upgrade_deny", "id": key, "reason": "bad"})
                else:
                    lvl = upg(p, key)
                    if lvl >= UPGRADE_MAX:
                        await send_to(pid, {"type": "upgrade_deny", "id": key, "reason": "max"})
                    else:
                        cost = int(u["costs"][lvl])
                        if int(p.get("points", 0)) < cost:
                            await send_to(pid, {"type": "upgrade_deny", "id": key, "reason": "points"})
                        else:
                            p["points"] = int(p.get("points", 0)) - cost
                            p.setdefault("upgrades", {})[key] = lvl + 1
                            if key == "hp":
                                p["hp"] = min(max_hp_of(p), int(p["hp"]) + 20)
                            if key == "mag":
                                p["ammo"] = min(int(p.get("ammo", 0)) + int(round(weapon_of(p)["mag"] * 0.15)), mag_eff(p))
                            await send_to(pid, {"type": "upgrade_ok", "id": key,
                                                "lvl": lvl + 1, "points": p["points"],
                                                "max_hp": max_hp_of(p), "mag": mag_eff(p)})
                            await broadcast({"type": "upgrade_fx", "player": pid, "id": key})

            elif mt == "grenade" and pid in players:
                await process_grenade(pid, msg)

            elif mt == "nuke_use" and pid in players:
                p = players[pid]
                if p.get("nuke_ready") and not p.get("is_dead"):
                    p["nuke_ready"] = False
                    victims = [qid for qid, q in players.items()
                               if qid != pid and not q.get("is_dead") and not q.get("boss")]
                    for qid in victims:
                        await apply_death(qid, pid, False, True, "ЯДЕРКА")
                    await broadcast({"type": "nuke", "by": pid, "name": p.get("name", "?"),
                                     "x": 0.0, "z": 0.0, "victims": len(victims)})
                    print(f"[NUKE] {p.get('name')} сбросил ядерку: {len(victims)} жертв")

            elif mt == "nuke_deny" and pid in players:
                p = players[pid]
                if p.get("nuke_ready"):
                    p["nuke_ready"] = False
                    await broadcast({"type": "nuke_denied", "name": p.get("name", "?")})

            elif mt == "vote" and pid in players:
                if ROTATION and ROUND["phase"] in ("vote", "defeat_vote"):
                    vm = str(msg.get("mode", ""))[:16]
                    if vm in VOTE_OPTIONS:
                        ROUND["votes"][pid] = vm
                        await broadcast({"type": "vote_update", "counts": vote_counts(),
                                         "total": len(ROUND["votes"])})

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
                        heal = min(MEDKIT_HEAL, max_hp_of(p) - int(p["hp"]))
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
                        p["reserve"] = int(p.get("reserve", 0)) + mag_eff(p) * 2
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
    if MODE == "defense":
        build_flow_field(0.0, 0.0)
    print(f"[NAV] Точек: {len(nav_pts)}  |  стен в хеше: "
          f"{sum(len(v) for v in _wall_cells.values())} ячеек: {len(_wall_cells)}  |  {time.time()-t0:.2f}с")

    if MODE == "ffa":
        for _ in range(6):
            make_bot()

    ip = get_local_ip()
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT,
                                ping_interval=20, max_size=2**20):
        print("=" * 64)
        print(" NEON STICKMAN SHOT v3 — ЖИВОЙ МИР")
        print("=" * 64)
        print(f"  Режим:         {MODE.upper()}")
        if ROTATION:
            print(f"  Ротация:       FFA {int(FFA_DURATION)//60} мин или {FFA_KILL_LIMIT} киллов "
                  f"-> голосование ({int(VOTE_SECONDS)}с, поражение {int(DEFEAT_VOTE_SECONDS)}с)")
        print(f"  Локально:      http://localhost:{HTTP_PORT}")
        print(f"  По сети (LAN): http://{ip}:{HTTP_PORT}")
        print(f"  WebSocket:     ws://{ip}:{WS_PORT}")
        print(f"  Tickrate:      {TICK_RATE} Hz  |  Арена: {int(ARENA_HALF*2)}x{int(ARENA_HALF*2)}")
        print(f"  Стены:         {len(WALLS)}  |  Аптечки: {len(medkits)}")
        if MODE == "defense":
            print(f"  Волны:         база {DEF['wave_base']}, +{DEF['wave_growth']}/волна, "
                  f"перерыв {DEF['break_seconds']}с, {DEF['points_per_kill']} очков/килл")
        else:
            print(f"  Демоны:        до {MAX_BOTS}  |  Резерв: {RESERVE_MAGS} магазина")
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
