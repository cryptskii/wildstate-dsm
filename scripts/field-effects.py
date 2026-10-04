#!/usr/bin/env python3
"""Render the Field prototype's map effects as Tiled tilesets.

The design's `Field mobile.dc.html` draws three effects over the map with CSS:
the meadow's glowing edge, ten twinkling sparkles inside it, and the flicker
around the campfire. RPGJS draws the map from Tiled, so each effect becomes a
tileset painted on its own layer. The two animated ones use Tiled tile
animations with a fixed horizontal stride, as the pond's water does. Every
number below is the prototype's.

    python3 scripts/field-effects.py   # writes src/tiled/{meadow-glow,meadow-sparkles,campfire-glow}.{png,tsx}
"""
import math
import os
import struct
import zlib

T = 32
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'tiled')


def png(path, w, h, px):
    """Write RGBA pixels (a list of rows of (r, g, b, a) tuples)."""
    raw = b''.join(b'\x00' + b''.join(struct.pack('4B', *p) for p in row) for row in px)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


def blank(w, h):
    return [[(0, 0, 0, 0) for _ in range(w)] for _ in range(h)]


def over(dst, src):
    """Source-over composite of one straight-alpha pixel onto another."""
    sr, sg, sb, sa = src[0], src[1], src[2], src[3] / 255
    dr, dg, db, da = dst[0], dst[1], dst[2], dst[3] / 255
    a = sa + da * (1 - sa)
    if a == 0:
        return (0, 0, 0, 0)
    mix = lambda s, d: round((s * sa + d * da * (1 - sa)) / a)
    return (mix(sr, dr), mix(sg, dg), mix(sb, db), round(a * 255))


def tsx(name, image, w, h, animations):
    cols, rows = w // T, h // T
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<tileset version="1.9" tiledversion="1.9.2" name="{name}" tilewidth="{T}" tileheight="{T}" tilecount="{cols * rows}" columns="{cols}">',
        f' <image source="{image}" width="{w}" height="{h}"/>',
    ]
    for tile, frames in animations:
        lines.append(f' <tile id="{tile}">')
        lines.append('  <animation>')
        lines += [f'   <frame tileid="{t}" duration="{d}"/>' for t, d in frames]
        lines.append('  </animation>')
        lines.append(' </tile>')
    lines.append('</tileset>')
    with open(os.path.join(OUT, f'{name}.tsx'), 'w') as f:
        f.write('\n'.join(lines) + '\n')


def phi(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


# ---- the meadow's edge: box-shadow inset 0 0 0 2px #f6ffc866, 0 0 24px #d9ff8a55 ----
BOX = (448, 192, 640, 352)            # left:448 top:192 width:192 height:160
GLOW = (416, 160, 672, 384)           # 8 x 7 tiles around it
SIGMA = 12                            # a 24px blur is a Gaussian of sigma 12


def meadow_glow():
    x0, y0, x1, y1 = GLOW
    w, h = x1 - x0, y1 - y0
    px = blank(w, h)
    bx0, by0, bx1, by1 = BOX
    for j in range(h):
        for i in range(w):
            x, y = x0 + i + 0.5, y0 + j + 0.5
            inside = bx0 <= x < bx1 and by0 <= y < by1
            if inside:
                edge = x < bx0 + 2 or x >= bx1 - 2 or y < by0 + 2 or y >= by1 - 2
                if edge:
                    px[j][i] = (0xf6, 0xff, 0xc8, 0x66)
            else:
                cover = (phi((x - bx0) / SIGMA) - phi((x - bx1) / SIGMA)) * (phi((y - by0) / SIGMA) - phi((y - by1) / SIGMA))
                a = round(0x55 * cover)
                if a:
                    px[j][i] = (0xd9, 0xff, 0x8a, a)
    png(os.path.join(OUT, 'meadow-glow.png'), w, h, px)
    tsx('meadow-glow', 'meadow-glow.png', w, h, [])


# ---- the sparkles: ten ✧ that twinkle (2.2s, 50%: opacity .2 and 6px up), 0.2s apart ----
SPARKLE_AREA = (448, 192, 640, 352)   # 6 x 5 tiles: the meadow
STAR = [
    '....#....',
    '....#....',
    '...#.#...',
    '..#...#..',
    '##.....##',
    '..#...#..',
    '...#.#...',
    '....#....',
    '....#....',
]
STEP_MS, CYCLE = 200, 11              # 2.2s in 0.2s steps: one frame per sparkle delay


def meadow_sparkles():
    x0, y0, x1, y1 = SPARKLE_AREA
    fw, fh = x1 - x0, y1 - y0
    w = fw * CYCLE
    px = blank(w, fh)
    for k in range(CYCLE):
        for n in range(10):
            left = 452 + ((n * 37) % 180)
            top = 196 + ((n * 23) % 140)
            p = ((k - n) % CYCLE) / CYCLE                     # where sparkle n is in its cycle at frame k
            v = (1 - math.cos(2 * math.pi * p)) / 2           # 0 at rest, 1 at the 50% keyframe
            alpha = round(255 * (1 - 0.8 * v))
            dy = round(-6 * v)
            for sy, row in enumerate(STAR):
                for sx, c in enumerate(row):
                    if c != '#':
                        continue
                    x = left + 1 + sx - x0
                    y = top + 2 + sy + dy - y0
                    if 0 <= x < fw and 0 <= y < fh:
                        px[y][k * fw + x] = over(px[y][k * fw + x], (0xfb, 0xff, 0xd6, alpha))
    png(os.path.join(OUT, 'meadow-sparkles.png'), w, fh, px)
    cols = w // T
    anims = []
    for ty in range(fh // T):
        for tx in range(fw // T):
            tile = ty * cols + tx
            anims.append((tile, [(tile + k * (fw // T), STEP_MS) for k in range(CYCLE)]))
    tsx('meadow-sparkles', 'meadow-sparkles.png', w, fh, anims)


# ---- the campfire's flicker: radial-gradient(#ffcf6a66, transparent 68%), 1.1s, .55↔.85 and 1↔1.15 ----
FIRE_AREA = (224, 384, 320, 480)      # 3 x 3 tiles around the fire
FIRE_FRAMES, FIRE_MS = 6, 183         # six steps of the 1.1s cycle


def campfire_glow():
    x0, y0, x1, y1 = FIRE_AREA
    fw, fh = x1 - x0, y1 - y0
    w = fw * FIRE_FRAMES
    px = blank(w, fh)
    cx, cy, rx, ry = 243 + 28, 410 + 22, 28, 22       # the 56 x 44 element, border-radius 50%
    for k in range(FIRE_FRAMES):
        v = (1 - math.cos(2 * math.pi * k / FIRE_FRAMES)) / 2
        opacity, scale = 0.55 + 0.30 * v, 1 + 0.15 * v
        for j in range(fh):
            for i in range(fw):
                x, y = x0 + i + 0.5, y0 + j + 0.5
                ex, ey = (x - cx) / (rx * scale), (y - cy) / (ry * scale)
                if ex * ex + ey * ey > 1:
                    continue                                   # outside the rounded element
                d = math.hypot(ex, ey) / math.sqrt(2)         # farthest-corner ellipse units
                stop = max(0.0, 1 - d / 0.68)
                a = round(0x66 * stop * opacity)
                if a:
                    px[j][k * fw + i] = (0xff, 0xcf, 0x6a, a)
    png(os.path.join(OUT, 'campfire-glow.png'), w, fh, px)
    cols = w // T
    anims = []
    for ty in range(fh // T):
        for tx in range(fw // T):
            tile = ty * cols + tx
            anims.append((tile, [(tile + k * (fw // T), FIRE_MS) for k in range(FIRE_FRAMES)]))
    tsx('campfire-glow', 'campfire-glow.png', w, fh, anims)


if __name__ == '__main__':
    meadow_glow()
    meadow_sparkles()
    campfire_glow()
