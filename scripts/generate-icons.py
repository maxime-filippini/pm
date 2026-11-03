"""Generate dependency-free PNG variants of the checklist icon (opaque, mask-safe)."""
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / "public" / "icons"
RECTS = [(128, 144, 40, 40), (200, 152, 184, 24),
         (128, 236, 40, 40), (200, 244, 144, 24),
         (128, 328, 40, 40), (200, 336, 104, 24)]


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))


for size, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    pixels = bytearray()
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            active = any(rx <= x * 512 / size < rx + w and ry <= y * 512 / size < ry + h for rx, ry, w, h in RECTS)
            pixels.extend((250, 250, 250) if active else (10, 10, 10))
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(pixels))
    png += chunk(b"IEND", b"")
    (ROOT / name).write_bytes(png)
