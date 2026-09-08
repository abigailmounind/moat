from pathlib import Path
import base64, binascii, re, struct, zlib, json

ROOT = Path('/home/landreth/projects/moat')
SRC = ROOT / 'assets/three-rivers/rivers-watercolor-hires.svg'
OUT_SVG = ROOT / 'assets/three-rivers/rivers-watercolor-hires-clean.svg'
OUT_PNG = ROOT / 'assets/three-rivers/rivers-watercolor-hires-clean.png'

PNG_SIG = b'\x89PNG\r\n\x1a\n'

def chunks(data):
    p = 8
    while p < len(data):
        length = struct.unpack('>I', data[p:p+4])[0]
        typ = data[p+4:p+8]
        payload = data[p+8:p+8+length]
        yield typ, payload
        p += 12 + length

def decode_rgba(data):
    if data[:8] != PNG_SIG:
        raise ValueError('not a PNG')
    ihdr = next(payload for typ, payload in chunks(data) if typ == b'IHDR')
    width, height, depth, color_type, comp, filt, interlace = struct.unpack('>IIBBBBB', ihdr)
    if (depth, color_type, comp, filt, interlace) != (8, 6, 0, 0, 0):
        raise ValueError(f'expected 8-bit RGBA non-interlaced PNG, got {(depth,color_type,comp,filt,interlace)}')
    compressed = b''.join(payload for typ, payload in chunks(data) if typ == b'IDAT')
    raw = zlib.decompress(compressed)
    stride = width * 4
    rows = []
    prev = bytearray(stride)
    pos = 0
    for _ in range(height):
        ft = raw[pos]; pos += 1
        scan = bytearray(raw[pos:pos+stride]); pos += stride
        for i in range(stride):
            left = scan[i-4] if i >= 4 else 0
            up = prev[i]
            ul = prev[i-4] if i >= 4 else 0
            if ft == 1: scan[i] = (scan[i] + left) & 255
            elif ft == 2: scan[i] = (scan[i] + up) & 255
            elif ft == 3: scan[i] = (scan[i] + ((left + up) >> 1)) & 255
            elif ft == 4:
                p = left + up - ul
                pa, pb, pc = abs(p-left), abs(p-up), abs(p-ul)
                pr = left if pa <= pb and pa <= pc else (up if pb <= pc else ul)
                scan[i] = (scan[i] + pr) & 255
            elif ft != 0: raise ValueError(f'unsupported filter {ft}')
        rows.append(scan); prev = scan
    return width, height, rows

def encode_rgba(width, height, rows):
    raw = b''.join(b'\x00' + bytes(row) for row in rows)
    def chunk(typ, payload):
        return struct.pack('>I', len(payload)) + typ + payload + struct.pack('>I', binascii.crc32(typ + payload) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return PNG_SIG + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

def dilate(mask, width, height, radius):
    horizontal = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            if mask[row + x]:
                for xx in range(max(0, x-radius), min(width, x+radius+1)):
                    horizontal[row + xx] = 1
    out = bytearray(width * height)
    for y in range(height):
        for yy in range(max(0, y-radius), min(height, y+radius+1)):
            src = yy * width; dst = y * width
            for x in range(width):
                if horizontal[src + x]: out[dst + x] = 1
    return out

def erode(mask, width, height, radius):
    horizontal = bytearray(width * height)
    span = radius * 2 + 1
    for y in range(height):
        base = y * width
        count = sum(mask[base:base + radius + 1])
        for x in range(width):
            entering = x + radius
            leaving = x - radius - 1
            if entering < width and entering >= radius + 1:
                count += mask[base + entering]
            if leaving >= 0:
                count -= mask[base + leaving]
            if radius <= x < width - radius and count == span:
                horizontal[base + x] = 1
    out = bytearray(width * height)
    for x in range(width):
        count = sum(horizontal[y * width + x] for y in range(radius + 1))
        for y in range(height):
            entering = y + radius
            leaving = y - radius - 1
            if entering < height and entering >= radius + 1:
                count += horizontal[entering * width + x]
            if leaving >= 0:
                count -= horizontal[leaving * width + x]
            if radius <= y < height - radius and count == span:
                out[y * width + x] = 1
    return out

svg = SRC.read_text(encoding='utf-8')
prefix = "data:image/png;base64,"; start = svg.index(prefix) + len(prefix); end = svg.index("\"", start); encoded = svg[start:end]
if not encoded: raise ValueError("embedded PNG not found")
source_png = base64.b64decode(encoded)
w, h, rows = decode_rgba(source_png)
alpha = bytearray(row[i] for row in rows for i in range(3, len(row), 4))
# Remove detached low-alpha pixels first, then attenuate only the pale cyan outer band.
# Interior pale watercolor and white flow texture stay untouched.
strong = bytearray(1 if a >= 96 else 0 for a in alpha)
keep = dilate(strong, w, h, 3)
removed = 0
for idx, row in enumerate(rows):
    base = idx * w
    for x in range(w):
        ai = base + x
        if not keep[ai]:
            if row[x*4+3]: removed += 1
            row[x*4+3] = 0
visible = bytearray(1 if row[x*4+3] >= 24 else 0 for row in rows for x in range(w))
interior = erode(visible, w, h, 18)
fringe_adjusted = 0
for y, row in enumerate(rows):
    base = y * w
    for x in range(w):
        if not visible[base + x] or interior[base + x]:
            continue
        i = x * 4
        red, green, blue, a = row[i:i+4]
        luminance = (54 * red + 183 * green + 19 * blue) / 256
        pale_cyan = blue >= red + 7 and green >= red + 4
        if pale_cyan and luminance > 158:
            factor = max(.12, .68 - (luminance - 158) * .009)
            row[i+3] = 0 if a * factor < 10 else round(a * factor)
            fringe_adjusted += 1
clean_png = encode_rgba(w, h, rows)
OUT_PNG.write_bytes(clean_png)
clean_b64 = base64.b64encode(clean_png).decode('ascii')
clean_svg = svg[:start] + clean_b64 + svg[end:]
OUT_SVG.write_text(clean_svg, encoding='utf-8', newline='\n')
meta = {
  'width': w, 'height': h, 'source_bytes': len(source_png), 'clean_bytes': len(clean_png),
  'removed_pixels': removed, 'fringe_adjusted_pixels': fringe_adjusted,
  'alpha_threshold': 96, 'dilation_radius': 3, 'edge_band_radius': 18, 'fringe_luminance': 158,
  'source_sha256': __import__('hashlib').sha256(source_png).hexdigest(),
  'clean_sha256': __import__('hashlib').sha256(clean_png).hexdigest(),
}
(ROOT / 'assets/three-rivers/rivers-watercolor-hires-clean.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(meta))
