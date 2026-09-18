"""
Minimal pure-Python Adobe Photoshop (.PSD) writer.

Writes 8-bit RGB documents with:
  * tightly-bounded raster layers (RGBA) using PackBits/RLE compression
  * real layer groups (open/closed folders) via 'lsct' section dividers
  * unicode layer names ('luni'), blend modes, opacity, visibility
  * a ResolutionInfo image resource so Photoshop reports the correct PPI
  * a flattened composite so non-Photoshop viewers show the artwork

Layer data is supplied as RGBA PIL images; each layer is cropped to its
non-transparent bounding box before being written, which keeps file size sane
at 300 ppi.
"""

import struct
from PIL import Image

# ---------------------------------------------------------------- primitives

def _u8(v):  return struct.pack('>B', v)
def _u16(v): return struct.pack('>H', v)
def _i16(v): return struct.pack('>h', v)
def _u32(v): return struct.pack('>I', v)
def _i32(v): return struct.pack('>i', v)


def _pascal(s, pad=4):
    """Pascal string: 1 length byte + bytes, total padded to a multiple of `pad`."""
    b = s.encode('macroman', 'replace')[:255]
    out = _u8(len(b)) + b
    while len(out) % pad:
        out += b'\x00'
    return out


def _unicode_str(s):
    """PSD unicode string: 4-byte char count then UTF-16BE code units."""
    u = s.encode('utf-16-be')
    return _u32(len(u) // 2) + u


def _pad(data, mult):
    r = len(data) % mult
    return data + b'\x00' * (mult - r) if r else data


def _addl(key, data, pad=2):
    """Additional-layer-information block: '8BIM' + key + length + padded data."""
    body = _pad(data, pad)
    return b'8BIM' + key + _u32(len(body)) + body


# ------------------------------------------------------------- RLE/PackBits

def _packbits(src):
    """PackBits-compress one scanline (the encoding PSD calls 'RLE')."""
    out = bytearray()
    n = len(src)
    i = 0
    while i < n:
        # Look for a run of 3+ identical bytes.
        run = 1
        while i + run < n and run < 128 and src[i + run] == src[i]:
            run += 1
        if run >= 3:
            out.append(257 - run)          # -(run-1) as unsigned
            out.append(src[i])
            i += run
            continue
        # Otherwise accumulate a literal block.
        start = i
        i += 1
        while i < n and (i - start) < 128:
            if i + 2 < n and src[i] == src[i + 1] == src[i + 2]:
                break
            i += 1
        lit = src[start:i]
        out.append(len(lit) - 1)
        out.extend(lit)
    return bytes(out)


def _rle_channel(plane, width, height):
    """Compress a single channel plane. Returns (row_counts_bytes, packed_bytes)."""
    counts = bytearray()
    body = bytearray()
    for y in range(height):
        row = plane[y * width:(y + 1) * width]
        packed = _packbits(row)
        counts += _u16(len(packed))
        body += packed
    return bytes(counts), bytes(body)


# ------------------------------------------------------------------- layers

BLEND_MODES = {
    'normal': b'norm', 'dissolve': b'diss', 'darken': b'dark',
    'multiply': b'mul ', 'color_burn': b'idiv', 'linear_burn': b'lbrn',
    'lighten': b'lite', 'screen': b'scrn', 'color_dodge': b'div ',
    'linear_dodge': b'lddg', 'overlay': b'over', 'soft_light': b'sLit',
    'hard_light': b'hLit', 'vivid_light': b'vLit', 'linear_light': b'lLit',
    'pin_light': b'pLit', 'hard_mix': b'hMix', 'difference': b'diff',
    'exclusion': b'smud', 'subtract': b'fsub', 'divide': b'fdiv',
    'hue': b'hue ', 'saturation': b'sat ', 'color': b'colr',
    'luminosity': b'lum ',
}


class Layer:
    """A raster layer. `image` is an RGBA PIL image placed at (left, top)."""

    def __init__(self, name, image=None, left=0, top=0, opacity=255,
                 blend='normal', visible=True, divider=None, clipping=0):
        self.name = name
        self.image = image
        self.left = left
        self.top = top
        self.opacity = opacity
        self.blend = blend
        self.visible = visible
        self.divider = divider      # None | 1 open folder | 2 closed | 3 divider
        self.clipping = clipping    # 1 = clip to layer below

    # -- record + channel data ------------------------------------------------

    def _bbox_and_planes(self):
        """Crop to content and split into (A, R, G, B) byte planes."""
        if self.image is None:
            return (0, 0, 0, 0), []
        img = self.image.convert('RGBA')
        bbox = img.getbbox()            # None when fully transparent
        if bbox is None:
            return (0, 0, 0, 0), []
        img = img.crop(bbox)
        left = self.left + bbox[0]
        top = self.top + bbox[1]
        w, h = img.size
        r, g, b, a = img.split()
        planes = [a.tobytes(), r.tobytes(), g.tobytes(), b.tobytes()]
        return (top, left, top + h, left + w), planes

    def build(self):
        (top, left, bottom, right), planes = self._bbox_and_planes()
        width, height = right - left, bottom - top

        channels = []               # (channel_id, full channel bytes)
        if planes and width and height:
            for cid, plane in zip((-1, 0, 1, 2), planes):
                counts, body = _rle_channel(plane, width, height)
                channels.append((cid, _u16(1) + counts + body))
        else:
            # Folder markers and empty layers still need channel entries.
            for cid in (-1, 0, 1, 2):
                channels.append((cid, _u16(0)))

        rec = _i32(top) + _i32(left) + _i32(bottom) + _i32(right)
        rec += _u16(len(channels))
        for cid, data in channels:
            rec += _i16(cid) + _u32(len(data))
        rec += b'8BIM' + BLEND_MODES.get(self.blend, b'norm')
        rec += _u8(self.opacity)
        rec += _u8(self.clipping)
        rec += _u8(0 if self.visible else 2)   # bit 1 = hidden
        rec += _u8(0)                          # filler

        extra = _u32(0)                        # no layer mask
        extra += _u32(0)                       # no blending ranges
        extra += _pascal(self.name)
        extra += _addl(b'luni', _unicode_str(self.name))
        if self.divider is not None:
            extra += _addl(b'lsct', _u32(self.divider) + b'8BIM' +
                           BLEND_MODES.get(self.blend, b'norm'))
        rec += _u32(len(extra)) + extra

        return rec, b''.join(d for _, d in channels)


class Group:
    """A layer group. `children` are drawn bottom-of-list = bottom of stack."""

    def __init__(self, name, children=None, opacity=255, blend='normal',
                 visible=True, open=True):
        self.name = name
        self.children = children or []
        self.opacity = opacity
        self.blend = blend
        self.visible = visible
        self.open = open


def _flatten(nodes):
    """Expand groups into the bottom-to-top layer sequence Photoshop expects."""
    out = []
    for node in nodes:
        if isinstance(node, Group):
            # bottom: section divider, then children, then the folder header
            out.append(Layer('</Layer group>', divider=3, visible=True))
            out.extend(_flatten(node.children))
            out.append(Layer(node.name, divider=1 if node.open else 2,
                             opacity=node.opacity, blend=node.blend,
                             visible=node.visible))
        else:
            out.append(node)
    return out


# ------------------------------------------------------------------ document

class PSD:
    def __init__(self, width, height, resolution=300.0):
        self.width = width
        self.height = height
        self.resolution = resolution
        self.nodes = []

    def add(self, node):
        self.nodes.append(node)
        return node

    # -- sections -------------------------------------------------------------

    def _header(self):
        return (b'8BPS' + _u16(1) + b'\x00' * 6 + _u16(3) +
                _u32(self.height) + _u32(self.width) + _u16(8) + _u16(3))

    def _image_resources(self):
        fixed = int(round(self.resolution * 65536))
        res_info = (_u32(fixed) + _u16(1) + _u16(1) +
                    _u32(fixed) + _u16(1) + _u16(1))
        block = b'8BIM' + _u16(1005) + b'\x00\x00' + _u32(len(res_info)) + _pad(res_info, 2)
        return _u32(len(block)) + block

    def _layer_section(self):
        layers = _flatten(self.nodes)
        if not layers:
            return _u32(0)

        records, chandata = [], []
        for lyr in layers:
            rec, data = lyr.build()
            records.append(rec)
            chandata.append(data)

        info = _i16(len(layers)) + b''.join(records) + b''.join(chandata)
        info = _pad(info, 2)
        layer_info = _u32(len(info)) + info
        global_mask = _u32(0)
        body = layer_info + global_mask
        return _u32(len(body)) + body

    def _composite(self, flat):
        """Merged image data: planar R,G,B with a single RLE count table."""
        flat = flat.convert('RGB')
        w, h = flat.size
        r, g, b = flat.split()
        counts, bodies = b'', b''
        for plane in (r.tobytes(), g.tobytes(), b.tobytes()):
            c, d = _rle_channel(plane, w, h)
            counts += c
            bodies += d
        return _u16(1) + counts + bodies

    # -- output ---------------------------------------------------------------

    def save(self, path, composite=None):
        if composite is None:
            composite = self.render()
        with open(path, 'wb') as fh:
            fh.write(self._header())
            fh.write(_u32(0))                  # colour mode data
            fh.write(self._image_resources())
            fh.write(self._layer_section())
            fh.write(self._composite(composite))
        return path

    def render(self):
        """Alpha-composite every visible layer into a flat RGB preview."""
        canvas = Image.new('RGBA', (self.width, self.height), (255, 255, 255, 255))

        def walk(nodes, parent_visible=True):
            for node in nodes:
                if isinstance(node, Group):
                    walk(node.children, parent_visible and node.visible)
                elif node.image is not None and node.visible and parent_visible:
                    layer = node.image.convert('RGBA')
                    if node.opacity < 255:
                        alpha = layer.getchannel('A').point(
                            lambda v: int(v * node.opacity / 255))
                        layer.putalpha(alpha)
                    canvas.alpha_composite(layer, (node.left, node.top))

        walk(self.nodes)
        return canvas.convert('RGB')
