"""
MNR Launcher - Image Inspector.

Reads everything an image file says about itself: colour space, when and
how it was shot (camera, lens, f-stop, shutter, ISO), what made it
(camera, Blender, Arnold, Houdini, After Effects...), resolution and bit
depth. Drop a file on the tool and inspect(path) returns it all, sorted
into a short summary and full sections.

Standard library only for the reading. Pillow is used, when present, for
thumbnails and for formats the readers here don't know. ffmpeg/ffprobe
are used, when found, for EXR thumbnails and for video files.

Formats: JPEG, TIFF, camera RAW (DNG, CR2, NEF, ARW, ORF, RW2, PEF, RAF,
CR3 metadata), PNG, OpenEXR (single and multi-part), HEIC/AVIF metadata,
anything else Pillow can open, and video through ffprobe.
"""

import base64
import datetime
import io
import json
import os
import re
import struct
import subprocess
import sys
import zlib

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

RAW_EXTS = {".dng", ".cr2", ".cr3", ".nef", ".nrw", ".arw", ".srf", ".sr2", ".orf",
            ".rw2", ".pef", ".raf", ".srw", ".3fr", ".iiq", ".erf", ".kdc", ".mos", ".x3f"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mxf", ".avi", ".mkv", ".webm", ".mts", ".m2ts"}

# Primaries (red x,y  green x,y  blue x,y) of the colour spaces we name.
PRIMARIES = [
    ("ACEScg (AP1)",    (0.713, 0.293, 0.165, 0.830, 0.128, 0.044)),
    ("ACES2065-1 (AP0)", (0.7347, 0.2653, 0.0, 1.0, 0.0001, -0.077)),
    ("Rec.709 / sRGB",  (0.640, 0.330, 0.300, 0.600, 0.150, 0.060)),
    ("Display P3 / DCI-P3", (0.680, 0.320, 0.265, 0.690, 0.150, 0.060)),
    ("Rec.2020",        (0.708, 0.292, 0.170, 0.797, 0.131, 0.046)),
    ("Adobe RGB (1998)", (0.640, 0.330, 0.210, 0.710, 0.150, 0.060)),
]


def _name_primaries(vals):
    best, err = None, 1e9
    for name, ref in PRIMARIES:
        e = sum(abs(a - b) for a, b in zip(vals[:6], ref))
        if e < err:
            best, err = name, e
    return best if err < 0.03 else None


# ------------------------------------------------------------ TIFF / EXIF

TAGS = {
    # Image (IFD0)
    0x00FE: "NewSubfileType", 0x0100: "ImageWidth", 0x0101: "ImageLength", 0x0102: "BitsPerSample",
    0x0103: "Compression", 0x0106: "PhotometricInterpretation", 0x010E: "ImageDescription",
    0x010F: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0115: "SamplesPerPixel",
    0x011A: "XResolution", 0x011B: "YResolution", 0x011C: "PlanarConfiguration", 0x0128: "ResolutionUnit",
    0x0131: "Software", 0x0132: "DateTime", 0x013B: "Artist", 0x013C: "HostComputer",
    0x0152: "ExtraSamples", 0x0153: "SampleFormat", 0x0201: "JPEGInterchangeFormat",
    0x0202: "JPEGInterchangeFormatLength", 0x0213: "YCbCrPositioning", 0x014A: "SubIFDs",
    0x02BC: "XMP", 0x8298: "Copyright", 0x8769: "ExifIFD", 0x8825: "GPSIFD", 0x8773: "ICCProfile",
    0x83BB: "IPTC", 0x8649: "PhotoshopData", 0x9C9B: "XPTitle", 0x9C9C: "XPComment", 0x9C9D: "XPAuthor",
    0x9C9E: "XPKeywords", 0x9C9F: "XPSubject", 0x4746: "Rating",
    # DNG
    0xC612: "DNGVersion", 0xC614: "UniqueCameraModel", 0xC621: "ColorMatrix1", 0xC65A: "CalibrationIlluminant1",
    0xC68B: "OriginalRawFileName",
    # Exif IFD
    0x829A: "ExposureTime", 0x829D: "FNumber", 0x8822: "ExposureProgram", 0x8827: "ISO",
    0x8830: "SensitivityType", 0x8832: "RecommendedExposureIndex", 0x9000: "ExifVersion",
    0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized", 0x9010: "OffsetTime",
    0x9011: "OffsetTimeOriginal", 0x9012: "OffsetTimeDigitized", 0x9101: "ComponentsConfiguration",
    0x9201: "ShutterSpeedValue", 0x9202: "ApertureValue", 0x9203: "BrightnessValue",
    0x9204: "ExposureBiasValue", 0x9205: "MaxApertureValue", 0x9206: "SubjectDistance",
    0x9207: "MeteringMode", 0x9208: "LightSource", 0x9209: "Flash", 0x920A: "FocalLength",
    0x927C: "MakerNote", 0x9286: "UserComment", 0x9290: "SubSecTime", 0x9291: "SubSecTimeOriginal",
    0x9292: "SubSecTimeDigitized", 0xA000: "FlashpixVersion", 0xA001: "ColorSpace",
    0xA002: "PixelXDimension", 0xA003: "PixelYDimension", 0xA005: "InteropIFD",
    0xA20E: "FocalPlaneXResolution", 0xA20F: "FocalPlaneYResolution", 0xA210: "FocalPlaneResolutionUnit",
    0xA217: "SensingMethod", 0xA300: "FileSource", 0xA301: "SceneType", 0xA401: "CustomRendered",
    0xA402: "ExposureMode", 0xA403: "WhiteBalance", 0xA404: "DigitalZoomRatio",
    0xA405: "FocalLengthIn35mmFilm", 0xA406: "SceneCaptureType", 0xA408: "Contrast",
    0xA409: "Saturation", 0xA40A: "Sharpness", 0xA40C: "SubjectDistanceRange",
    0xA420: "ImageUniqueID", 0xA430: "CameraOwnerName", 0xA431: "BodySerialNumber",
    0xA432: "LensSpecification", 0xA433: "LensMake", 0xA434: "LensModel", 0xA435: "LensSerialNumber",
    0xA460: "CompositeImage", 0xA500: "Gamma",
    # Interop
    0x0001: "InteropIndex",
}
GPS_TAGS = {0: "GPSVersionID", 1: "GPSLatitudeRef", 2: "GPSLatitude", 3: "GPSLongitudeRef", 4: "GPSLongitude",
            5: "GPSAltitudeRef", 6: "GPSAltitude", 7: "GPSTimeStamp", 16: "GPSImgDirectionRef",
            17: "GPSImgDirection", 29: "GPSDateStamp"}

TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4}
KEEP_BYTES = {0x02BC, 0x8773, 0x9286, 0x9C9B, 0x9C9C, 0x9C9D, 0x9C9E, 0x9C9F}


class _Tiff:
    """Classic TIFF reader over a file handle; base = where 'II*' starts."""

    def __init__(self, fh, base=0):
        self.fh, self.base = fh, base
        fh.seek(base)
        bo = fh.read(2)
        if bo not in (b"II", b"MM"):
            raise ValueError("not TIFF")
        self.e = "<" if bo == b"II" else ">"
        magic, self.first = struct.unpack(self.e + "HI", fh.read(6))
        if magic != 42 and magic not in (0x4F52, 0x5352, 0x55):   # ORF/RW2 variants
            raise ValueError("not classic TIFF")

    def _read(self, off, n):
        self.fh.seek(self.base + off)
        return self.fh.read(n)

    def ifd(self, off, names=TAGS):
        """{name: value} for one IFD, plus '_next' offset and '_raw' {tag: value}."""
        out, raw = {}, {}
        head = self._read(off, 2)
        if len(head) < 2:
            return out
        n, = struct.unpack(self.e + "H", head)
        if n > 1000:
            return out
        data = self._read(off + 2, n * 12 + 4)
        for i in range(n):
            ent = data[i * 12:(i + 1) * 12]
            if len(ent) < 12:
                break
            tag, typ, count = struct.unpack(self.e + "HHI", ent[:8])
            size = TYPE_SIZE.get(typ)
            if not size:
                continue
            total = size * count
            if total > 4 * 1024 * 1024:
                continue
            if count > 256 and tag not in KEEP_BYTES and typ != 2:
                raw[tag] = "(%d values)" % count
                continue
            body = ent[8:8 + total] if total <= 4 else self._read(struct.unpack(self.e + "I", ent[8:12])[0], total)
            if total > 4 and tag == 0x014A:   # SubIFDs: keep offsets
                pass
            raw[tag] = self._decode(typ, count, body, tag)
        nxt = data[n * 12:n * 12 + 4]
        out["_next"] = struct.unpack(self.e + "I", nxt)[0] if len(nxt) == 4 else 0
        out["_raw"] = raw
        for tag, val in raw.items():
            out[names.get(tag, "Tag 0x%04X" % tag)] = val
        return out

    def _decode(self, typ, count, b, tag):
        e = self.e
        try:
            if typ == 2:
                return b.split(b"\x00")[0].decode("utf-8", "replace").strip()
            if typ in (1, 7):
                if tag in KEEP_BYTES or count > 16:
                    return bytes(b)
                return list(b) if count > 1 else b[0]
            fmt = {3: "H", 4: "I", 6: "b", 8: "h", 9: "i", 11: "f", 12: "d", 13: "I"}.get(typ)
            if fmt:
                vals = list(struct.unpack(e + fmt * count, b[:struct.calcsize(fmt) * count]))
            elif typ in (5, 10):
                f = "I" if typ == 5 else "i"
                nums = struct.unpack(e + f * (2 * count), b[:8 * count])
                vals = [(nums[i], nums[i + 1]) for i in range(0, len(nums), 2)]
            else:
                return None
            return vals[0] if count == 1 else vals
        except Exception:
            return None

    def all(self):
        """Every IFD that matters: IFD0, IFD1, SubIFDs, Exif, GPS, Interop."""
        res = {"ifds": []}
        off, seen = self.first, set()
        while off and off not in seen and len(res["ifds"]) < 8:
            seen.add(off)
            d = self.ifd(off)
            if not d:
                break
            res["ifds"].append(d)
            off = d.get("_next", 0)
        subs = []
        for d in list(res["ifds"]):
            so = d["_raw"].get(0x014A)
            for o in (so if isinstance(so, list) else [so] if so else []):
                if isinstance(o, int) and o not in seen:
                    seen.add(o)
                    subs.append(self.ifd(o))
        res["subs"] = subs
        ifd0 = res["ifds"][0] if res["ifds"] else {}
        exif_off = ifd0.get("_raw", {}).get(0x8769)
        res["exif"] = self.ifd(exif_off) if isinstance(exif_off, int) else {}
        gps_off = ifd0.get("_raw", {}).get(0x8825)
        res["gps"] = self.ifd(gps_off, GPS_TAGS) if isinstance(gps_off, int) else {}
        io_off = res["exif"].get("_raw", {}).get(0xA005)
        res["interop"] = self.ifd(io_off) if isinstance(io_off, int) else {}
        return res

    def read_bytes(self, off, n):
        return self._read(off, n)


def _rat(v):
    if isinstance(v, tuple):
        return v[0] / v[1] if v[1] else 0.0
    if isinstance(v, list) and v and isinstance(v[0], tuple):
        return _rat(v[0])
    return float(v) if isinstance(v, (int, float)) else None


def _num(x):
    return ("%.2f" % x).rstrip("0").rstrip(".")


def _xp(v):
    if isinstance(v, (bytes, list)):
        b = bytes(v)
        try:
            return b.decode("utf-16-le").rstrip("\x00")
        except Exception:
            return None
    return v


EXPOSURE_PROGRAM = {0: "Not defined", 1: "Manual", 2: "Program", 3: "Aperture priority",
                    4: "Shutter priority", 5: "Creative", 6: "Action", 7: "Portrait", 8: "Landscape"}
METERING = {0: "Unknown", 1: "Average", 2: "Centre-weighted", 3: "Spot", 4: "Multi-spot",
            5: "Matrix / evaluative", 6: "Partial"}
WB = {0: "Auto", 1: "Manual"}
EXPOSURE_MODE = {0: "Auto", 1: "Manual", 2: "Auto bracket"}
LIGHT = {0: "Unknown", 1: "Daylight", 2: "Fluorescent", 3: "Tungsten", 4: "Flash", 9: "Fine weather",
         10: "Cloudy", 11: "Shade", 17: "Standard light A", 20: "D55", 21: "D65", 22: "D75", 23: "D50", 255: "Other"}
COMPRESSION = {1: "None", 5: "LZW", 6: "JPEG (old)", 7: "JPEG", 8: "Deflate (ZIP)", 32773: "PackBits",
               32946: "Deflate", 34713: "Nikon NEF", 34892: "Lossy JPEG", 50000: "ZSTD", 34887: "LERC"}
PHOTOMETRIC = {0: "White is zero", 1: "Black is zero", 2: "RGB", 3: "Palette", 5: "CMYK", 6: "YCbCr",
               32803: "CFA (raw sensor)", 34892: "Linear raw"}
ORIENT = {1: "Normal", 2: "Mirrored", 3: "Rotated 180", 4: "Flipped", 5: "Mirrored, 90 CW",
          6: "Rotated 90 CW", 7: "Mirrored, 90 CCW", 8: "Rotated 90 CCW"}


def _fmt_exif(name, v):
    """A readable value for one EXIF tag."""
    try:
        if name == "ExposureTime":
            t = _rat(v)
            return ("1/%d s" % round(1 / t)) if t and t < 0.5 else "%s s" % _num(t)
        if name in ("FNumber", "MaxApertureValue", "ApertureValue"):
            f = _rat(v)
            if name != "FNumber":
                f = 2 ** (f / 2)
            return "f/%s" % _num(f)
        if name == "ShutterSpeedValue":
            t = 2 ** (-_rat(v))
            return ("1/%d s" % round(1 / t)) if t < 0.5 else "%s s" % _num(t)
        if name in ("FocalLength", "FocalLengthIn35mmFilm"):
            return "%s mm" % _num(_rat(v))
        if name == "ExposureBiasValue":
            b = _rat(v)
            return "%+.1f EV" % b
        if name == "ExposureProgram":
            return EXPOSURE_PROGRAM.get(v, v)
        if name == "MeteringMode":
            return METERING.get(v, v)
        if name == "WhiteBalance":
            return WB.get(v, v)
        if name == "ExposureMode":
            return EXPOSURE_MODE.get(v, v)
        if name == "LightSource":
            return LIGHT.get(v, v)
        if name == "Flash":
            return ("Fired" if v & 1 else "Did not fire") + (", auto" if (v >> 3) & 3 == 3 else "")
        if name == "ColorSpace":
            return {1: "sRGB", 2: "Adobe RGB", 0xFFFF: "Uncalibrated"}.get(v, v)
        if name == "Compression":
            return COMPRESSION.get(v, v)
        if name == "PhotometricInterpretation":
            return PHOTOMETRIC.get(v, v)
        if name == "Orientation":
            return ORIENT.get(v, v)
        if name == "SampleFormat":
            vv = v[0] if isinstance(v, list) else v
            return {1: "Unsigned integer", 2: "Signed integer", 3: "Floating point"}.get(vv, vv)
        if name == "ResolutionUnit":
            return {1: "None", 2: "inch", 3: "cm"}.get(v, v)
        if name == "LensSpecification" and isinstance(v, list) and len(v) == 4:
            a, b, c, d = [_rat(x) for x in v]
            mm = _num(a) if a == b else "%s-%s" % (_num(a), _num(b))
            fs = _num(c) if c == d else "%s-%s" % (_num(c), _num(d))
            return "%s mm f/%s" % (mm, fs)
        if name == "SubjectDistance":
            return "%s m" % _num(_rat(v))
        if name in ("XResolution", "YResolution", "DigitalZoomRatio", "Gamma"):
            return _num(_rat(v))
        if name.startswith("XP"):
            return _xp(v)
        if name == "UserComment" and isinstance(v, (bytes, bytearray)):
            body = v[8:]
            enc = "utf-16" if v[:8].startswith(b"UNICODE") else "latin-1"
            return body.decode(enc, "replace").strip("\x00 ").strip() or None
        if name in ("ExifVersion", "FlashpixVersion") and isinstance(v, (list, bytes)):
            return bytes(v).decode("ascii", "replace")
    except Exception:
        pass
    if isinstance(v, tuple):
        return _num(_rat(v))
    if isinstance(v, (bytes, bytearray)):
        return "(%d bytes)" % len(v)
    if isinstance(v, list):
        if v and isinstance(v[0], tuple):
            return ", ".join(_num(_rat(x)) for x in v[:8])
        return ", ".join(str(x) for x in v[:8]) + (" ..." if len(v) > 8 else "")
    return v


def _gps(gps):
    try:
        def deg(vals, ref):
            d, m, s = [_rat(x) for x in vals]
            x = d + m / 60 + s / 3600
            return -x if ref in ("S", "W") else x
        lat = deg(gps["GPSLatitude"], gps.get("GPSLatitudeRef", "N"))
        lon = deg(gps["GPSLongitude"], gps.get("GPSLongitudeRef", "E"))
        return "%.6f, %.6f" % (lat, lon)
    except Exception:
        return None


# ------------------------------------------------------------- ICC / XMP

def _icc(data):
    """Profile description and basics from ICC bytes."""
    out = {}
    try:
        if len(data) < 132:
            return out
        out["Colour model"] = data[16:20].decode("ascii", "replace").strip()
        out["Profile class"] = {"mntr": "Display", "scnr": "Input", "prtr": "Output", "spac": "Colour space",
                                "abst": "Abstract", "link": "Device link"}.get(data[12:16].decode("ascii", "replace"),
                                                                                data[12:16].decode("ascii", "replace"))
        maj = data[8]
        out["ICC version"] = "%d.%d" % (maj, data[9] >> 4)
        n, = struct.unpack(">I", data[128:132])
        for i in range(min(n, 100)):
            sig, off, size = struct.unpack(">4sII", data[132 + i * 12:144 + i * 12])
            if sig in (b"desc", b"cprt"):
                t = data[off:off + size]
                text = None
                if t[:4] == b"desc":
                    ln, = struct.unpack(">I", t[8:12])
                    text = t[12:12 + ln].split(b"\x00")[0].decode("latin-1")
                elif t[:4] == b"mluc":
                    ro, rs = struct.unpack(">II", t[8:16])
                    ln, lo = struct.unpack(">II", t[20:28])
                    text = t[lo:lo + ln].decode("utf-16-be", "replace")
                elif t[:4] == b"text":
                    text = t[8:].split(b"\x00")[0].decode("latin-1")
                if text:
                    out["Description" if sig == b"desc" else "Copyright"] = text.strip()
    except Exception:
        pass
    return out


XMP_KEEP = re.compile(r"^(xmp|photoshop|tiff|exif|exifEX|aux|dc|crs|xmpMM|lr|Iptc4xmpCore|stEvt|"
                      r"xmpDM|darktable|digiKam|rawtherapee|MicrosoftPhoto)$")


def _xmp(text):
    """Flat [(prefix:name, value)] from an XMP packet (attributes and simple elements)."""
    rows, seen = [], set()
    for m in re.finditer(r'\b([A-Za-z][\w]*):([\w]+)="([^"]{1,300})"', text):
        p, n, v = m.groups()
        if p in ("xmlns", "x", "rdf") or not XMP_KEEP.match(p):
            continue
        k = p + ":" + n
        if (k, v) not in seen:
            seen.add((k, v))
            rows.append((k, v))
    for m in re.finditer(r"<([A-Za-z][\w]*):([\w]+)>([^<>]{1,300})</\1:\2>", text):
        p, n, v = m.groups()
        if not XMP_KEEP.match(p):
            continue
        k = p + ":" + n
        if (k, v.strip()) not in seen and v.strip():
            seen.add((k, v.strip()))
            rows.append((k, v.strip()))
    for m in re.finditer(r"<(dc:creator|dc:title|dc:description|dc:subject)>(.*?)</\1>", text, re.S):
        vals = re.findall(r"<rdf:li[^>]*>([^<]+)</rdf:li>", m.group(2))
        if vals:
            rows.append((m.group(1), ", ".join(v.strip() for v in vals)))
    return rows


def _find_xmp(path):
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as fh:
            chunks = [fh.read(8 * 1024 * 1024)]
            if size > 9 * 1024 * 1024:
                fh.seek(size - 1024 * 1024)
                chunks.append(fh.read())
        for c in chunks:
            a = c.find(b"<x:xmpmeta")
            if a < 0:
                continue
            b = c.find(b"</x:xmpmeta>", a)
            if b > a:
                return c[a:b + 12].decode("utf-8", "replace")
    except Exception:
        pass
    return None


# ------------------------------------------------------------ per format

def _read_jpeg(fh, r):
    fh.seek(2)
    icc = {}
    while True:
        m = fh.read(2)
        if len(m) < 2 or m[0] != 0xFF:
            break
        mk = m[1]
        if mk in (0xD8, 0x01) or 0xD0 <= mk <= 0xD7:
            continue
        if mk == 0xDA or mk == 0xD9:
            break
        ln, = struct.unpack(">H", fh.read(2))
        seg = fh.read(ln - 2)
        if mk == 0xE1 and seg[:6] == b"Exif\x00\x00":
            r["tiff"] = _Tiff(io.BytesIO(seg[6:])).all()
        elif mk == 0xE2 and seg[:12] == b"ICC_PROFILE\x00":
            icc[seg[12]] = seg[14:]
        elif mk == 0xE0 and seg[:5] == b"JFIF\x00":
            r["sections"].setdefault("File", []).append(("JFIF version", "%d.%02d" % (seg[5], seg[6])))
        elif mk == 0xEE and seg[:5] == b"Adobe":
            r["sections"].setdefault("File", []).append(("Adobe colour transform", {0: "None/CMYK", 1: "YCbCr", 2: "YCCK"}.get(seg[11], seg[11])))
        elif mk == 0xFE:
            r["comment"] = seg.decode("utf-8", "replace").strip("\x00 ")
        elif 0xC0 <= mk <= 0xCF and mk not in (0xC4, 0xC8, 0xCC):
            prec, h, w, nc = struct.unpack(">BHHB", seg[:6])
            r["width"], r["height"], r["bits"] = w, h, prec
            r["channels"] = nc
            r["sections"].setdefault("File", []).append(("Encoding", "Progressive" if mk == 0xC2 else "Baseline" if mk == 0xC0 else "SOF%d" % (mk - 0xC0)))
    if icc:
        r["icc"] = b"".join(icc[k] for k in sorted(icc))


def _read_png(fh, r):
    fh.seek(8)
    texts = r.setdefault("texts", [])
    while True:
        h = fh.read(8)
        if len(h) < 8:
            break
        ln, typ = struct.unpack(">I4s", h)
        if typ == b"IDAT" or ln > 50 * 1024 * 1024:
            fh.seek(ln + 4, 1)
            continue
        data = fh.read(ln)
        fh.read(4)
        try:
            if typ == b"IHDR":
                w, hh, bd, ct = struct.unpack(">IIBB", data[:10])
                r["width"], r["height"], r["bits"] = w, hh, bd
                r["channels"] = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(ct, 0)
                r["sections"].setdefault("File", []).append(("Colour type", {0: "Greyscale", 2: "RGB", 3: "Palette", 4: "Grey + alpha", 6: "RGBA"}.get(ct, ct)))
            elif typ == b"sRGB":
                r["png_srgb"] = ["Perceptual", "Relative colorimetric", "Saturation", "Absolute colorimetric"][data[0]] if data[0] < 4 else data[0]
            elif typ == b"gAMA":
                r["png_gamma"] = struct.unpack(">I", data)[0] / 100000.0
            elif typ == b"cHRM":
                v = [x / 100000.0 for x in struct.unpack(">8I", data)]
                r["png_chrm"] = v[2:]
            elif typ == b"iCCP":
                name, rest = data.split(b"\x00", 1)
                r["icc"] = zlib.decompress(rest[1:])
                r["icc_name"] = name.decode("latin-1")
            elif typ == b"tEXt":
                k, v = data.split(b"\x00", 1)
                texts.append((k.decode("latin-1"), v.decode("latin-1")))
            elif typ == b"zTXt":
                k, v = data.split(b"\x00", 1)
                texts.append((k.decode("latin-1"), zlib.decompress(v[1:]).decode("latin-1", "replace")))
            elif typ == b"iTXt":
                k, rest = data.split(b"\x00", 1)
                comp = rest[0]
                rest = rest[2:]
                _lang, rest = rest.split(b"\x00", 1)
                _tk, text = rest.split(b"\x00", 1)
                if comp:
                    text = zlib.decompress(text)
                k = k.decode("latin-1")
                if k != "XML:com.adobe.xmp":
                    texts.append((k, text.decode("utf-8", "replace")))
            elif typ == b"eXIf":
                r["tiff"] = _Tiff(io.BytesIO(data)).all()
            elif typ == b"tIME":
                y, mo, d, hh, mi, s = struct.unpack(">HBBBBB", data)
                r["png_time"] = "%04d-%02d-%02d %02d:%02d:%02d" % (y, mo, d, hh, mi, s)
            elif typ == b"pHYs":
                x, y, u = struct.unpack(">IIB", data)
                if u == 1:
                    r["sections"].setdefault("File", []).append(("Pixel density", "%d dpi" % round(x * 0.0254)))
        except Exception:
            pass
        if typ == b"IEND":
            break


def _read_tiff_file(fh, r):
    t = _Tiff(fh, 0)
    r["tiff"] = t.all()
    r["_tiffobj"] = t


EXR_COMP = ["None", "RLE", "ZIPS", "ZIP", "PIZ", "PXR24", "B44", "B44A", "DWAA", "DWAB", "HTJ2K256", "HTJ2K32"]
EXR_PIX = {0: "uint", 1: "half", 2: "float"}


def _read_exr(fh, r):
    fh.seek(4)
    ver, = struct.unpack("<I", fh.read(4))
    flags = []
    if ver & 0x200:
        flags.append("tiled")
    if ver & 0x800:
        flags.append("deep")
    multi = bool(ver & 0x1000)
    if multi:
        flags.append("multi-part")
    r["exr_flags"] = flags or ["scanline"]
    parts = []
    while True:
        attrs = {}
        while True:
            name = _cstr(fh)
            if name is None:
                break
            if name == "":
                break
            typ = _cstr(fh)
            size, = struct.unpack("<i", fh.read(4))
            data = fh.read(size) if 0 <= size < 64 * 1024 * 1024 else b""
            attrs[name] = (typ, _exr_val(typ, data))
        if not attrs:
            break
        parts.append(attrs)
        if not multi or len(parts) > 64:
            break
    r["exr_parts"] = parts


def _cstr(fh):
    b = bytearray()
    while True:
        c = fh.read(1)
        if not c:
            return None
        if c == b"\x00":
            return b.decode("latin-1")
        b += c
        if len(b) > 1024:
            return None


def _exr_val(typ, d):
    try:
        if typ == "string":
            return d.decode("utf-8", "replace")
        if typ == "int":
            return struct.unpack("<i", d)[0]
        if typ == "float":
            return struct.unpack("<f", d)[0]
        if typ == "double":
            return struct.unpack("<d", d)[0]
        if typ == "box2i":
            return struct.unpack("<4i", d)
        if typ == "box2f":
            return struct.unpack("<4f", d)
        if typ in ("v2i", "v3i"):
            return struct.unpack("<%di" % (len(d) // 4), d)
        if typ in ("v2f", "v3f", "m33f", "m44f"):
            return struct.unpack("<%df" % (len(d) // 4), d)
        if typ in ("v2d", "v3d", "m33d", "m44d"):
            return struct.unpack("<%dd" % (len(d) // 8), d)
        if typ == "chromaticities":
            return struct.unpack("<8f", d)
        if typ == "compression":
            return EXR_COMP[d[0]] if d[0] < len(EXR_COMP) else d[0]
        if typ == "lineOrder":
            return ["Increasing Y", "Decreasing Y", "Random Y"][d[0]] if d[0] < 3 else d[0]
        if typ == "envmap":
            return ["Lat-long", "Cube"][d[0]] if d[0] < 2 else d[0]
        if typ == "rational":
            n, dd = struct.unpack("<iI", d)
            return "%d/%d" % (n, dd)
        if typ == "timecode":
            tc, = struct.unpack("<I", d[:4])
            def bcd(v):
                return (v & 0xF) + 10 * ((v >> 4) & 0xF)
            return "%02d:%02d:%02d:%02d" % (bcd(tc >> 24 & 0x3F), bcd(tc >> 16 & 0x7F), bcd(tc >> 8 & 0x7F), bcd(tc & 0x3F))
        if typ == "tiledesc":
            x, y, m = struct.unpack("<IIB", d)
            return "%dx%d tiles" % (x, y)
        if typ == "stringvector":
            out, i = [], 0
            while i + 4 <= len(d):
                n, = struct.unpack("<i", d[i:i + 4])
                out.append(d[i + 4:i + 4 + n].decode("utf-8", "replace"))
                i += 4 + n
            return out
        if typ == "chlist":
            chans, i = [], 0
            while i < len(d) and d[i] != 0:
                j = d.index(b"\x00", i)
                nm = d[i:j].decode("latin-1")
                pt, = struct.unpack("<i", d[j + 1:j + 5])
                chans.append((nm, EXR_PIX.get(pt, pt)))
                i = j + 1 + 16
            return chans
        if typ == "preview":
            w, h = struct.unpack("<II", d[:8])
            return {"w": w, "h": h, "rgba": d[8:8 + w * h * 4]}
    except Exception:
        return None
    return "(%s, %d bytes)" % (typ, len(d))


def _read_bmff(fh, r, size):
    """CR3 / HEIC / AVIF: no full parser, just find the embedded TIFF/EXIF."""
    fh.seek(0)
    buf = fh.read(min(size, 8 * 1024 * 1024))
    # Colour: a 'colr' box holds an ICC profile ('prof') or coded primaries ('nclx').
    i = buf.find(b"colr")
    while i >= 4:
        bsize, = struct.unpack(">I", buf[i - 4:i])
        kind = buf[i + 4:i + 8]
        if kind in (b"prof", b"rICC") and 12 < bsize < 4 * 1024 * 1024:
            r["icc"] = buf[i + 8:i - 4 + bsize]
            break
        if kind == b"nclx":
            prim, trc, mat = struct.unpack(">HHH", buf[i + 8:i + 14])
            r["nclx"] = {1: "Rec.709 / sRGB", 9: "Rec.2020", 12: "Display P3", 11: "DCI-P3"}.get(prim, "primaries code %d" % prim)
            break
        i = buf.find(b"colr", i + 4)
    for pat in (b"II*\x00\x08\x00\x00\x00", b"MM\x00*\x00\x00\x00\x08"):
        i = buf.find(pat)
        if i >= 0:
            try:
                r["tiff"] = _Tiff(io.BytesIO(buf[i:])).all()
                # CR3 keeps the Exif IFD in a second TIFF block (CMT2).
                j = buf.find(pat, i + 8)
                if j >= 0 and not r["tiff"].get("exif"):
                    second = _Tiff(io.BytesIO(buf[j:])).ifd(8)
                    r["tiff"]["exif"] = second
                return
            except Exception:
                pass


# ------------------------------------------------------------- render hosts

RENDER_HINTS = [
    (r"blender", "Blender"), (r"arnold|kick|\bmtoa\b|\bhtoa\b", "Arnold"), (r"houdini|karma|mantra|\bsidefx\b", "Houdini"),
    (r"\bmaya\b", "Maya"), (r"\bnuke\b|foundry", "Nuke"), (r"after ?effects|\baftereffects\b", "After Effects"),
    (r"photoshop", "Photoshop"), (r"lightroom", "Lightroom"), (r"rawtherapee", "RawTherapee"),
    (r"darktable", "darktable"), (r"capture ?one", "Capture One"), (r"dragonframe", "Dragonframe"),
    (r"v-?ray", "V-Ray"), (r"redshift", "Redshift"), (r"renderman|prman", "RenderMan"),
    (r"cycles", "Blender Cycles"), (r"eevee", "Blender EEVEE"), (r"davinci|resolve", "DaVinci Resolve"),
    (r"substance", "Substance"), (r"unreal", "Unreal Engine"), (r"cinema ?4d|\bc4d\b", "Cinema 4D"),
    (r"gimp", "GIMP"), (r"krita", "Krita"), (r"affinity", "Affinity"), (r"openimageio|oiio", "OpenImageIO"),
    (r"ffmpeg|lavf|lavc", "ffmpeg"), (r"mnr", "MNR pipeline"),
]


def _hosts(text):
    found = []
    low = text.lower()
    for pat, name in RENDER_HINTS:
        if re.search(pat, low) and name not in found:
            found.append(name)
    return found


# ------------------------------------------------------------- thumbnails

def _thumb_pil(src):
    try:
        from PIL import Image
        im = Image.open(src)
        im.draft("RGB", (480, 480))
        if im.mode in ("F", "I", "I;16", "I;16B", "I;16L"):
            im = im.point(lambda v: v * (255.0 / 65535.0) if im.mode != "F" else v * 255.0).convert("L")
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
        im.thumbnail((480, 480))
        bio = io.BytesIO()
        im.save(bio, "PNG" if im.mode == "RGBA" else "JPEG", quality=85)
        mime = "png" if im.mode == "RGBA" else "jpeg"
        return "data:image/%s;base64,%s" % (mime, base64.b64encode(bio.getvalue()).decode("ascii"))
    except Exception:
        return None


def _thumb_ffmpeg(ffmpeg, path, exr=False):
    if not ffmpeg or not os.path.isfile(ffmpeg):
        return None
    try:
        cmd = [ffmpeg, "-v", "error"]
        if exr:
            cmd += ["-apply_trc", "iec61966_2_1"]
        cmd += ["-i", path, "-frames:v", "1", "-vf", "scale='min(480,iw)':-2", "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "4", "-"]
        res = subprocess.run(cmd, capture_output=True, timeout=30, creationflags=CREATE_NO_WINDOW)
        if res.returncode == 0 and res.stdout:
            return "data:image/jpeg;base64," + base64.b64encode(res.stdout).decode("ascii")
    except Exception:
        pass
    return None


# ------------------------------------------------------------- main entry

def _when(ts):
    return datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")


def _human(n):
    for u in ("bytes", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return ("%d %s" % (n, u)) if u == "bytes" else "%.1f %s" % (n, u)
        n /= 1024.0


def _exif_date(s):
    if not isinstance(s, str):
        return None
    m = re.match(r"(\d{4}):(\d\d):(\d\d)[ T](\d\d:\d\d:\d\d)", s)
    return "%s-%s-%s %s" % (m.group(1), m.group(2), m.group(3), m.group(4)) if m else s


def inspect(path, ffmpeg=None, ffprobe=None):
    """Everything we can tell about one file. See the module docstring."""
    if not path or not os.path.isfile(path):
        return {"ok": False, "detail": "File not found."}
    ext = os.path.splitext(path)[1].lower()
    st = os.stat(path)
    r = {"ok": True, "name": os.path.basename(path), "path": path, "sections": {}, "warnings": []}
    with open(path, "rb") as fh:
        head = fh.read(16)
    fmt = None
    try:
        with open(path, "rb") as fh:
            if head[:3] == b"\xff\xd8\xff":
                fmt = "JPEG"
                _read_jpeg(fh, r)
            elif head[:8] == b"\x89PNG\r\n\x1a\n":
                fmt = "PNG"
                _read_png(fh, r)
            elif head[:4] == b"\x76\x2f\x31\x01":
                fmt = "OpenEXR"
                _read_exr(fh, r)
            elif head[:2] in (b"II", b"MM"):
                fmt = "Camera RAW" if ext in RAW_EXTS else "TIFF"
                if head[:4] in (b"II+\x00", b"MM\x00+"):
                    fmt = "BigTIFF"
                    r["warnings"].append("BigTIFF: only basic details can be read.")
                else:
                    _read_tiff_file(fh, r)
            elif head[:8] == b"FUJIFILM":
                fmt = "Camera RAW"
                fh.seek(84)
                off, = struct.unpack(">I", fh.read(4))
                fh.seek(off)
                jpg = fh.read(2 * 1024 * 1024)
                _read_jpeg(io.BytesIO(jpg), r)
            elif head[4:8] == b"ftyp":
                brand = head[8:12].decode("latin-1")
                fmt = {"crx ": "Camera RAW (CR3)", "heic": "HEIC", "heix": "HEIC", "mif1": "HEIF",
                       "avif": "AVIF"}.get(brand)
                if fmt:
                    _read_bmff(fh, r, st.st_size)
                elif ext in VIDEO_EXTS:
                    fmt = "Video"
            elif ext in VIDEO_EXTS:
                fmt = "Video"
    except Exception as e:
        r["warnings"].append("Some of the file could not be read (%s)." % e)

    if fmt == "Video" or (fmt is None and ext in VIDEO_EXTS):
        fmt = "Video"
        _video(r, path, ffprobe)

    # Anything else: let Pillow have a go.
    if fmt is None:
        try:
            from PIL import Image
            with Image.open(path) as im:
                fmt = im.format or ext.upper().strip(".")
                r["width"], r["height"] = im.size
                r["pil_mode"] = im.mode
                try:
                    ex = im.getexif()
                    if ex:
                        bio = io.BytesIO(ex.tobytes())
                        r["tiff"] = _Tiff(bio).all()
                except Exception:
                    pass
                if im.info.get("icc_profile"):
                    r["icc"] = im.info["icc_profile"]
        except Exception:
            fmt = ext.upper().strip(".") or "Unknown"
            r["warnings"].append("Not an image format this tool knows.")

    r["format"] = fmt
    r["xmp"] = _find_xmp(path) if fmt not in ("Video",) else None
    _build(r, st, ext)

    # Thumbnail
    thumb = None
    if fmt == "OpenEXR":
        pv = None
        for a in (r.get("exr_parts") or [{}])[0].values():
            if a[0] == "preview" and isinstance(a[1], dict):
                pv = a[1]
        if pv:
            try:
                from PIL import Image
                im = Image.frombytes("RGBA", (pv["w"], pv["h"]), pv["rgba"])
                bio = io.BytesIO()
                im.save(bio, "PNG")
                thumb = "data:image/png;base64," + base64.b64encode(bio.getvalue()).decode("ascii")
            except Exception:
                pass
        if not thumb:
            thumb = _thumb_ffmpeg(ffmpeg, path, exr=True)
    elif fmt == "Video":
        thumb = _thumb_ffmpeg(ffmpeg, path)
    elif fmt and fmt.startswith("Camera RAW"):
        thumb = _raw_preview(path, r) or _thumb_pil(path)
    elif r.get("float"):
        thumb = _thumb_pil(path)          # ffmpeg misreads half-float TIFF
    else:
        thumb = _thumb_pil(path) or _thumb_ffmpeg(ffmpeg, path)
    r["thumb"] = thumb
    for k in [k for k in r if k.startswith("_") or k in ("tiff", "icc", "exr_parts", "xmp", "texts")]:
        r.pop(k, None)
    return r


def _raw_preview(path, r):
    """Largest embedded JPEG in a RAW (most cameras keep a full one)."""
    t = r.get("_tiffobj")
    tiff = r.get("tiff") or {}
    best = None
    for d in (tiff.get("ifds") or []) + (tiff.get("subs") or []):
        raw = d.get("_raw", {})
        off, ln = raw.get(0x0201), raw.get(0x0202)
        if not (isinstance(off, int) and isinstance(ln, int)):
            if raw.get(0x0103) in (6, 7) and isinstance(raw.get(0x0111), int) and isinstance(raw.get(0x0117), int):
                off, ln = raw.get(0x0111), raw.get(0x0117)
            else:
                continue
        if not best or ln > best[1]:
            best = (off, ln)
    if not best or not t:
        return None
    try:
        with open(path, "rb") as fh:
            fh.seek(best[0])
            data = fh.read(best[1])
        return _thumb_pil(io.BytesIO(data))
    except Exception:
        return None


def _video(r, path, ffprobe):
    if not ffprobe or not os.path.isfile(ffprobe):
        r["warnings"].append("ffprobe wasn't found, so video details can't be read.")
        return
    try:
        res = subprocess.run([ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
                             capture_output=True, text=True, timeout=30, creationflags=CREATE_NO_WINDOW)
        info = json.loads(res.stdout or "{}")
    except Exception as e:
        r["warnings"].append("ffprobe failed: %s" % e)
        return
    r["video"] = info


def _build(r, st, ext):
    """Turn what was read into summary cards and sections."""
    S = r["sections"]
    summary = []
    tiff = r.get("tiff") or {}
    ifd0 = (tiff.get("ifds") or [{}])[0] if tiff.get("ifds") else {}
    exif = tiff.get("exif") or {}
    gps = tiff.get("gps") or {}
    interop = tiff.get("interop") or {}
    xmp_rows = _xmp(r["xmp"]) if r.get("xmp") else []
    xmp = {}
    for k, v in xmp_rows:
        xmp.setdefault(k, v)
    icc = _icc(r["icc"]) if r.get("icc") else {}
    parts = r.get("exr_parts") or []
    exr = parts[0] if parts else {}
    video = r.get("video")

    # --- Image size / depth -------------------------------------------------
    main = ifd0
    if r["format"] in ("TIFF", "Camera RAW"):
        # The real image in a RAW is the biggest IFD, not the thumbnail.
        cands = (tiff.get("ifds") or []) + (tiff.get("subs") or [])
        def area(d):
            w, h = d.get("ImageWidth"), d.get("ImageLength")
            return (w or 0) * (h or 0) if isinstance(w, int) and isinstance(h, int) else 0
        if cands:
            main = max(cands, key=area)
        if area(main):
            r["width"], r["height"] = main.get("ImageWidth"), main.get("ImageLength")
        bps = main.get("BitsPerSample")
        r["bits"] = bps[0] if isinstance(bps, list) else bps
        r["channels"] = main.get("SamplesPerPixel")
        r["float"] = (main.get("SampleFormat") == 3 or (isinstance(main.get("SampleFormat"), list) and main["SampleFormat"][0] == 3))
    if exif.get("PixelXDimension") and not r.get("width"):
        r["width"], r["height"] = exif.get("PixelXDimension"), exif.get("PixelYDimension")

    if exr:
        dw = exr.get("dataWindow", (None, None))[1]
        dsp = exr.get("displayWindow", (None, None))[1]
        if dsp:
            r["width"], r["height"] = dsp[2] - dsp[0] + 1, dsp[3] - dsp[1] + 1
        chans = exr.get("channels", (None, []))[1] or []
        r["channels"] = len(chans)
        types = sorted({c[1] for c in chans})
        r["float"] = True
        r["bits_text"] = "/".join("16-bit half" if t == "half" else "32-bit float" if t == "float" else "32-bit uint" for t in types)
        rows = [("Layout", ", ".join(r.get("exr_flags", []))), ("Parts", len(parts))]
        comp = exr.get("compression", (None, None))[1]
        if comp is not None:
            rows.append(("Compression", comp))
        if dw:
            rows.append(("Data window", "%d,%d to %d,%d (%dx%d)" % (dw[0], dw[1], dw[2], dw[3], dw[2] - dw[0] + 1, dw[3] - dw[1] + 1)))
        if dsp:
            rows.append(("Display window", "%dx%d" % (dsp[2] - dsp[0] + 1, dsp[3] - dsp[1] + 1)))
        par = exr.get("pixelAspectRatio", (None, None))[1]
        if par:
            rows.append(("Pixel aspect", _num(par)))
        layers = {}
        for nm, t in chans:
            layer = nm.rsplit(".", 1)[0] if "." in nm else "(main)"
            layers.setdefault(layer, []).append(nm.rsplit(".", 1)[-1])
        rows.append(("Channels", "%d (%s)" % (len(chans), r["bits_text"])))
        rank = {"R": 0, "G": 1, "B": 2, "A": 3, "X": 4, "Y": 5, "Z": 6}
        for layer, cs in list(layers.items())[:40]:
            rows.append(("  " + layer, ", ".join(sorted(cs, key=lambda c: (rank.get(c, 9), c)))))
        if len(parts) > 1:
            rows.append(("Part names", ", ".join(str(p.get("name", ("", "?"))[1]) for p in parts)))
        S["OpenEXR"] = rows
        std = {"channels", "compression", "dataWindow", "displayWindow", "lineOrder", "pixelAspectRatio",
               "screenWindowCenter", "screenWindowWidth", "preview", "name", "type", "version", "chunkCount", "tiles"}
        meta = []
        for k, (t, v) in exr.items():
            if k in std:
                continue
            if isinstance(v, (tuple, list)) and len(v) > 4 and t not in ("chromaticities", "stringvector"):
                v = ", ".join(_num(x) if isinstance(x, float) else str(x) for x in v)
            elif isinstance(v, float):
                v = _num(v)
            elif isinstance(v, (tuple, list)):
                v = ", ".join(_num(x) if isinstance(x, float) else str(x) for x in v)
            meta.append((k, v))
        if meta:
            S["Render / file attributes"] = meta

    w, h = r.get("width"), r.get("height")
    depth = r.get("bits_text")
    if not depth and r.get("bits"):
        depth = "%s-bit%s" % (r["bits"], " float" if r.get("float") else "")
        if r.get("float") and r.get("bits") == 16:
            depth = "16-bit half float"
    if not depth and r.get("pil_mode"):
        depth = r["pil_mode"]

    # --- Colour space -------------------------------------------------------
    cs, note = _colour(r, exr, icc, exif, interop, xmp, ext)

    # --- When ---------------------------------------------------------------
    shot = _exif_date(exif.get("DateTimeOriginal"))
    if shot:
        sub = exif.get("SubSecTimeOriginal")
        off = exif.get("OffsetTimeOriginal")
        shot += ("." + str(sub) if sub else "") + (" " + off if off else "")
    created = (shot or _exif_date(ifd0.get("DateTime")) or xmp.get("xmp:CreateDate") or xmp.get("photoshop:DateCreated")
               or r.get("png_time"))
    for k in ("capDate", "Date", "DateTime", "date", "creation_time"):
        if not created and exr.get(k):
            created = str(exr[k][1])
    if not created and exr.get("Date"):
        created = exr["Date"][1]
    texts = dict(r.get("texts") or [])
    if not created:
        created = texts.get("Creation Time") or texts.get("Date") or texts.get("date:create")
    if video and not created:
        created = ((video.get("format") or {}).get("tags") or {}).get("creation_time")

    # --- What made it -------------------------------------------------------
    sw = []
    for v in (ifd0.get("Software"), xmp.get("xmp:CreatorTool"), texts.get("Software"), ifd0.get("HostComputer"),
              ifd0.get("ImageDescription"), texts.get("Comment"), texts.get("Description"), r.get("comment")):
        if v and isinstance(v, str) and v not in sw:
            sw.append(v)
    for k, (t, v) in exr.items():
        if t == "string" and k.lower() in ("software", "writer", "creator", "host", "comments", "owner",
                                            "oiio:software", "nuke/version", "renderer"):
            sw.append("%s: %s" % (k, v))
    agents = re.findall(r'stEvt:softwareAgent="([^"]+)"', r.get("xmp") or "")
    agents += re.findall(r"<stEvt:softwareAgent>([^<]+)<", r.get("xmp") or "")
    blob = " ".join(sw + agents + list(exr.keys()) + [str(v[1]) for v in exr.values() if v[0] == "string"] +
                    [k + " " + v for k, v in texts.items()])
    if video:
        blob += " " + json.dumps((video.get("format") or {}).get("tags") or {})
    hosts = _hosts(blob)
    if exr and any(k.startswith("arnold/") for k in exr):
        hosts = ["Arnold"] + [x for x in hosts if x != "Arnold"]
    camera = " ".join(x for x in (ifd0.get("Make"), ifd0.get("Model")) if x).strip()
    if camera and ifd0.get("Make") and ifd0.get("Model", "").lower().startswith(ifd0["Make"].lower().split()[0]):
        camera = ifd0["Model"]
    if not camera:
        camera = xmp.get("tiff:Model") or ""

    if camera:
        origin = "Shot on a camera (%s)" % camera
        if hosts:
            origin += ", then saved from " + ", ".join(hosts)
    elif hosts:
        origin = "Rendered / saved from " + ", ".join(hosts)
    elif r["format"] == "OpenEXR":
        origin = "Rendered (no software named in the file)"
    else:
        origin = "Not recorded in the file"

    # --- Summary cards ------------------------------------------------------
    summary.append({"label": "Colour space", "value": cs, "note": note, "key": True})
    summary.append({"label": "Made by", "value": origin, "note": "; ".join(sw[:3]) if sw else ""})
    summary.append({"label": "Shot / created", "value": created or "Not recorded",
                    "note": "" if created else "Using the file date instead: " + _when(st.st_mtime)})
    if w and h:
        summary.append({"label": "Resolution", "value": "%d x %d" % (w, h),
                        "note": ", ".join(x for x in (depth, "%s channels" % r["channels"] if r.get("channels") else "") if x)})
    expo = []
    if exif.get("FNumber"):
        expo.append(_fmt_exif("FNumber", exif["FNumber"]))
    if exif.get("ExposureTime"):
        expo.append(_fmt_exif("ExposureTime", exif["ExposureTime"]))
    iso = exif.get("ISO") or exif.get("RecommendedExposureIndex")
    if iso:
        expo.append("ISO %s" % (iso[0] if isinstance(iso, list) else iso))
    if exif.get("FocalLength"):
        expo.append(_fmt_exif("FocalLength", exif["FocalLength"]))
    if expo:
        bias = exif.get("ExposureBiasValue")
        summary.append({"label": "Exposure", "value": "  ".join(expo),
                        "note": ", ".join(x for x in ((_fmt_exif("ExposureProgram", exif["ExposureProgram"]) if "ExposureProgram" in exif else ""),
                                                       (_fmt_exif("ExposureBiasValue", bias) if bias else ""),
                                                       ("WB " + str(_fmt_exif("WhiteBalance", exif["WhiteBalance"])) if "WhiteBalance" in exif else ""))
                                          if x)})
    lens = exif.get("LensModel") or xmp.get("aux:Lens") or xmp.get("exifEX:LensModel")
    if camera or lens:
        summary.append({"label": "Camera / lens", "value": camera or "Unknown camera",
                        "note": " ".join(x for x in (exif.get("LensMake") if lens and exif.get("LensMake") and not str(lens).startswith(exif["LensMake"]) else "", lens or "") if x)})
    if exr.get("Camera") or exr.get("Scene") or exr.get("Frame") or exr.get("RenderTime"):
        bits = ["%s %s" % (k, exr[k][1]) for k in ("Scene", "Camera", "Frame", "RenderTime") if exr.get(k)]
        summary.append({"label": "Render", "value": ", ".join(bits), "note": ""})
    if texts.get("Scene") or texts.get("Camera") or texts.get("RenderTime") or texts.get("Frame"):
        bits = ["%s %s" % (k, texts[k]) for k in ("Scene", "Camera", "Frame", "RenderTime") if texts.get(k)]
        summary.append({"label": "Render", "value": ", ".join(bits), "note": ""})
    g = _gps(gps)
    if g:
        summary.append({"label": "Location", "value": g, "note": "GPS from the camera", "map": g})

    # --- Sections -----------------------------------------------------------
    file_rows = [("File", r["name"]), ("Folder", os.path.dirname(r["path"])), ("Format", r["format"]),
                 ("Size on disk", _human(st.st_size)), ("File modified", _when(st.st_mtime))]
    if sys.platform == "win32":
        file_rows.append(("File created", _when(st.st_ctime)))
    if r["format"] in ("TIFF", "Camera RAW") and main:
        for k in ("Compression", "PhotometricInterpretation", "PlanarConfiguration", "SampleFormat", "Orientation"):
            if k in main:
                file_rows.append((k, _fmt_exif(k, main[k])))
    S["File"] = file_rows + S.get("File", [])

    cam_rows = []
    order = ["Make", "Model", "BodySerialNumber", "CameraOwnerName", "LensMake", "LensModel", "LensSpecification",
             "LensSerialNumber", "DateTimeOriginal", "OffsetTimeOriginal", "ExposureTime", "FNumber", "ISO",
             "ExposureProgram", "ExposureMode", "ExposureBiasValue", "MeteringMode", "Flash", "FocalLength",
             "FocalLengthIn35mmFilm", "WhiteBalance", "LightSource", "SubjectDistance", "DigitalZoomRatio",
             "SceneCaptureType", "Contrast", "Saturation", "Sharpness"]
    pool = dict(ifd0)
    pool.update(exif)
    for k in order:
        if k in pool and pool[k] not in (None, "", 0) or (k in pool and k in ("Flash", "ExposureBiasValue")):
            if k in ("DigitalZoomRatio", "SubjectDistance") and not _rat(pool[k]):
                continue
            v = _fmt_exif(k, pool[k]) if k not in ("DateTimeOriginal",) else _exif_date(pool[k])
            if v not in (None, ""):
                cam_rows.append((k, v))
    if cam_rows:
        S["Camera"] = cam_rows

    tag_rows = []
    skip = set(order) | {"_next", "_raw", "ExifIFD", "GPSIFD", "InteropIFD", "XMP", "ICCProfile", "SubIFDs",
                         "MakerNote", "StripOffsets", "StripByteCounts", "JPEGInterchangeFormat",
                         "JPEGInterchangeFormatLength", "PhotoshopData", "IPTC"}
    for src in (ifd0, exif, interop):
        for k, v in src.items():
            if k in skip or k.startswith("Tag 0x"):
                continue
            fv = _fmt_exif(k, v)
            if fv not in (None, ""):
                tag_rows.append((k, fv))
    if tag_rows:
        S["EXIF / TIFF tags"] = tag_rows
    if gps:
        S["GPS"] = [(k, _fmt_exif(k, v)) for k, v in gps.items() if not k.startswith("_")]

    col_rows = [("Colour space", cs)]
    if note:
        col_rows.append(("Why", note))
    if icc:
        col_rows += [("ICC " + k.lower(), v) for k, v in icc.items()]
    if r.get("icc_name"):
        col_rows.append(("ICC name", r["icc_name"]))
    if r.get("png_srgb"):
        col_rows.append(("PNG sRGB chunk", r["png_srgb"]))
    if r.get("png_gamma"):
        col_rows.append(("PNG gamma", "%.5f (display gamma %.2f)" % (r["png_gamma"], 1 / r["png_gamma"])))
    if exif.get("ColorSpace"):
        col_rows.append(("EXIF ColorSpace", _fmt_exif("ColorSpace", exif["ColorSpace"])))
    if interop.get("InteropIndex"):
        col_rows.append(("Interop index", interop["InteropIndex"] + (" (Adobe RGB)" if interop["InteropIndex"] == "R03" else " (sRGB)" if interop["InteropIndex"] == "R98" else "")))
    ch = exr.get("chromaticities", (None, None))[1]
    if ch:
        col_rows.append(("Chromaticities", "R %.4f,%.4f  G %.4f,%.4f  B %.4f,%.4f  W %.4f,%.4f" % tuple(ch)))
    if depth:
        col_rows.append(("Bit depth", depth))
    S["Colour"] = col_rows

    if r.get("texts"):
        S["PNG text"] = [(k, (v[:300] + "...") if len(v) > 300 else v) for k, v in r["texts"]]
    if xmp_rows:
        S["XMP"] = xmp_rows[:120]
    if agents:
        S["Edit history"] = [("Saved with", a) for a in dict.fromkeys(agents)]

    if video:
        fmt = video.get("format") or {}
        vrows = [("Container", fmt.get("format_long_name") or fmt.get("format_name")),
                 ("Duration", "%s s" % _num(float(fmt.get("duration", 0) or 0))),
                 ("Bit rate", "%d kb/s" % (int(fmt.get("bit_rate", 0) or 0) // 1000))]
        for s in video.get("streams", []):
            if s.get("codec_type") == "video":
                fr = s.get("avg_frame_rate") or s.get("r_frame_rate") or "0/1"
                try:
                    a, b = fr.split("/")
                    fps = _num(float(a) / float(b)) if float(b) else "?"
                except Exception:
                    fps = fr
                r["width"], r["height"] = s.get("width"), s.get("height")
                vrows += [("Video codec", "%s (%s)" % (s.get("codec_long_name") or s.get("codec_name"), s.get("profile", ""))),
                          ("Resolution", "%sx%s" % (s.get("width"), s.get("height"))), ("Frame rate", "%s fps" % fps),
                          ("Frames", s.get("nb_frames")), ("Pixel format", s.get("pix_fmt")),
                          ("Colour primaries", s.get("color_primaries")), ("Transfer", s.get("color_transfer")),
                          ("Matrix", s.get("color_space")), ("Range", s.get("color_range"))]
                summary.insert(3, {"label": "Video", "value": "%sx%s  %s fps" % (s.get("width"), s.get("height"), fps),
                                   "note": "%s, %s s" % (s.get("codec_name"), _num(float(fmt.get("duration", 0) or 0)))})
            elif s.get("codec_type") == "audio":
                vrows.append(("Audio", "%s, %s Hz, %s ch" % (s.get("codec_name"), s.get("sample_rate"), s.get("channels"))))
        for k, v in (fmt.get("tags") or {}).items():
            vrows.append((k, v))
        S["Video"] = [(k, v) for k, v in vrows if v not in (None, "", "None")]

    r["summary"] = summary
    order_s = ["Colour", "Camera", "OpenEXR", "Render / file attributes", "Video", "File", "EXIF / TIFF tags",
               "PNG text", "GPS", "XMP", "Edit history"]
    r["sections"] = [{"title": k, "rows": [[str(a), str(b)] for a, b in S[k]]} for k in order_s if k in S] + \
                    [{"title": k, "rows": [[str(a), str(b)] for a, b in v]} for k, v in S.items() if k not in order_s]


def _colour(r, exr, icc, exif, interop, xmp, ext):
    """(colour space, why) - the best answer the file gives."""
    fmt = r["format"]
    if fmt == "Video":
        v = r.get("video") or {}
        for s in v.get("streams", []):
            if s.get("codec_type") == "video":
                p, t = s.get("color_primaries"), s.get("color_transfer")
                if p or t:
                    name = {"bt709": "Rec.709", "bt2020": "Rec.2020", "smpte432": "Display P3"}.get(p, p or "?")
                    return "%s (%s transfer)" % (name, t or "unknown"), "From the video stream's colour tags."
        return "Untagged (players assume Rec.709)", "The video has no colour tags."
    if exr:
        for k, (t, v) in exr.items():
            if t == "string" and re.search(r"colou?r ?space|ocio|colorspace", k, re.I) and v:
                return v, "Named in the EXR's '%s' attribute." % k
        ch = exr.get("chromaticities", (None, None))[1]
        if ch:
            nm = _name_primaries(ch)
            if nm:
                return "Linear, %s" % nm, "EXR is scene linear; the chromaticities attribute gives %s primaries." % nm
            return "Linear, custom primaries", "EXR chromaticities don't match a known space (see Colour)."
        return ("Linear (scene linear)", "EXRs are linear. No primaries are written in this one, so the space isn't "
                "recorded (Blender doesn't write it). In MNR renders this is normally ACEScg.")
    desc = icc.get("Description") or r.get("icc_name") or xmp.get("photoshop:ICCProfile")
    if desc:
        d = desc.lower()
        lin = r.get("float")
        why = "From the embedded ICC profile." if icc else "From the XMP ICC profile name."
        if re.search(r"acescg|aces ?- ?cg|\bap1\b", d):
            return "ACEScg", why
        if re.search(r"aces2065|\bap0\b", d):
            return "ACES2065-1", why
        return desc + (" (float data)" if lin else ""), why
    if r.get("nclx"):
        return r["nclx"], "From the file's colour box (nclx)."
    if r.get("png_srgb"):
        return "sRGB", "PNG sRGB chunk (%s intent)." % r["png_srgb"]
    if r.get("png_chrm"):
        nm = _name_primaries(r["png_chrm"][:6])
        g = r.get("png_gamma")
        return ("%s%s" % (nm or "Custom primaries", ", gamma %.2f" % (1 / g) if g else ""),
                "From the PNG cHRM/gAMA chunks.")
    if r.get("png_gamma"):
        g = 1 / r["png_gamma"]
        if abs(g - 1.0) < 0.05:
            return "Linear", "PNG gAMA says gamma 1.0."
        return "Gamma %.2f (likely sRGB)" % g, "From the PNG gAMA chunk."
    cs = exif.get("ColorSpace")
    if cs == 1:
        return "sRGB", "EXIF ColorSpace tag."
    if cs == 2 or interop.get("InteropIndex") == "R03":
        return "Adobe RGB (1998)", "EXIF says uncalibrated with the Adobe RGB interop index."
    if fmt.startswith("Camera RAW"):
        return ("Camera RAW (no colour space yet)", "RAW sensor data has no colour space until it's developed, "
                "e.g. in RawTherapee. The camera's setting (%s) only affects its JPEG preview." %
                (_fmt_exif("ColorSpace", cs) if cs else "not recorded"))
    if cs == 0xFFFF:
        return "Uncalibrated", "EXIF ColorSpace says uncalibrated and no profile is embedded."
    if r.get("float"):
        return ("Linear float, untagged", "Float data with no profile: scene linear. In MNR this is normally ACEScg.")
    texts = dict(r.get("texts") or [])
    for k, v in texts.items():
        if re.search(r"colou?r ?space|ocio", k, re.I):
            return v, "From the PNG text '%s'." % k
    return "Untagged (most likely sRGB)", "Nothing in the file names a colour space; 8/16-bit images without one are almost always sRGB."
