"""
MNR Launcher - colour space handling for the Frames to MP4 tool.

Self-contained: standard library only, no numpy, no OCIO, no ACES install.
Everything is done by ffmpeg filters; the only generated asset is a 1D .cube
used to decode half-float TIFF, which ffmpeg would otherwise read as garbage.

Verified against reference maths - ACEScg 0.18 grey lands on sRGB 118/255.
"""

import base64
import os
import struct
import subprocess
import sys
import tempfile
import zlib

# ---------------------------------------------------------------- constants

# ACEScg (AP1 primaries, D60 white) -> linear Rec.709/sRGB (D65), Bradford CAT.
# Row sums are exactly 1.0, so white maps to white.
AP1_TO_REC709 = (
    ( 1.705051, -0.621792, -0.083259),
    (-0.130256,  1.140805, -0.010548),
    (-0.024003, -0.128969,  1.152972),
)

# What the UI offers. Keep this list short on purpose - the studio is ACES 1.3
# but only ever needs these two working spaces.
COLORSPACES = [
    {"id": "acescg", "label": "ACEScg",        "detail": "AP1 primaries, linear"},
    {"id": "srgb",   "label": "sRGB",          "detail": "Rec.709 primaries, sRGB curve"},
]

# Allowed pairs. Anything not listed is rejected in the UI before render.
TRANSFORMS = {
    ("acescg", "srgb"):   "matrix",      # the real conversion
    ("acescg", "acescg"): "passthrough", # keep linear values in the file
    ("srgb",   "srgb"):   "passthrough", # current behaviour, no colour work
}

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


# ------------------------------------------------------- TIFF format probing

def _tiff_tags(path):
    """Minimal classic-TIFF IFD reader. Returns {tag: value} or None."""
    try:
        with open(path, "rb") as fh:
            bo = fh.read(2)
            if bo not in (b"II", b"MM"):
                return None
            e = "<" if bo == b"II" else ">"
            magic, = struct.unpack(e + "H", fh.read(2))
            if magic == 43:
                return "bigtiff"                 # handled by the caller
            if magic != 42:
                return None                      # not a TIFF at all
            offset, = struct.unpack(e + "I", fh.read(4))
            fh.seek(offset)
            count, = struct.unpack(e + "H", fh.read(2))
            size = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1,
                    8: 2, 9: 4, 10: 8, 11: 4, 12: 8}
            fmt = {1: "B", 3: "H", 4: "I"}
            tags = {}
            for _ in range(count):
                tag, typ, n = struct.unpack(e + "HHI", fh.read(8))
                raw = fh.read(4)
                nbytes = size.get(typ, 1) * n
                if nbytes > 4:
                    ptr, = struct.unpack(e + "I", raw)
                    here = fh.tell()
                    fh.seek(ptr)
                    raw = fh.read(nbytes)
                    fh.seek(here)
                if typ in fmt:
                    vals = struct.unpack(e + fmt[typ] * n, raw[:size[typ] * n])
                    tags[tag] = vals[0] if n == 1 else vals
            return tags
    except Exception:
        return None


def _first(value, default=None):
    if isinstance(value, tuple):
        return value[0] if value else default
    return default if value is None else value


def decoded_pix_fmt(probe_exe, path):
    """
    Ask ffmpeg what pixel format it ACTUALLY decodes this file to.

    This matters because ffmpeg builds disagree about half-float TIFF.
    Some decode it properly to a float format; others hand back
    rgb48le, having treated each 16-bit half bit pattern as an
    unsigned integer. The repair LUT is only correct for the second
    kind, and applying it to the first kind destroys the image, so
    guessing from the TIFF tags alone is not good enough - the decoder
    itself has to be asked.

    Returns the pix_fmt string, or None if ffprobe is unavailable.
    """
    if not probe_exe or not os.path.isfile(probe_exe):
        return None
    try:
        result = subprocess.run(
            [probe_exe, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=30, creationflags=CREATE_NO_WINDOW,
        )
        if result.returncode != 0:
            return None
        fmt = result.stdout.decode("utf-8", "replace").strip()
        return fmt or None
    except Exception:
        return None


def _is_float_pix_fmt(fmt):
    """True when ffmpeg decoded to a real floating-point format."""
    return bool(fmt) and ("f32" in fmt or "f16" in fmt)


def probe_frame(path, probe_exe=None):
    """
    Work out what a frame really is, so the filter chain can be built correctly.

    Returns a dict with:
        kind            'exr' | 'tiff' | 'ldr'
        bit_depth       8 / 16 / 32 (None if unknown)
        is_float        True for IEEE float samples
        is_half         True for 16-bit float samples
        decoded_pix_fmt what ffmpeg really decodes this to, when known
        needs_half_lut  True only when this build misreads half as int
        supported       False means ffmpeg physically cannot process it
        note            plain-English reason when unsupported
    """
    ext = os.path.splitext(path)[1].lower()
    out = {"kind": "ldr", "bit_depth": 8, "is_float": False, "is_half": False,
           "decoded_pix_fmt": None, "needs_half_lut": False,
           "supported": True, "note": ""}

    if ext == ".exr":
        out.update(kind="exr", bit_depth=32, is_float=True)
        return out

    if ext not in (".tif", ".tiff"):
        return out                                  # jpg / png / etc

    out["kind"] = "tiff"
    tags = _tiff_tags(path)

    if tags == "bigtiff":
        # A BigTIFF's sample format cannot be read by the small parser
        # above, so there is no way to tell half-float from integer.
        # Decide on what the decoder actually produces instead.
        fmt = decoded_pix_fmt(probe_exe, path)
        out["decoded_pix_fmt"] = fmt
        out["bit_depth"] = None
        out["note"] = ("BigTIFF: the frame type could not be read from the "
                       "header, so no correction was applied. "
                       "Check the preview.")
        return out

    if not tags:
        out["note"] = "Could not read the TIFF header."
        return out

    bps = _first(tags.get(258), 8)
    sf = _first(tags.get(339), 1)                   # 1 = uint, 3 = IEEE float
    out["bit_depth"] = bps
    out["is_float"] = (sf == 3)
    out["is_half"] = (sf == 3 and bps == 16)

    if sf == 3 and bps == 32:
        # ffmpeg decodes these as packed rgbf32le, which swscale has no I/O
        # support for - the filter graph cannot be built at all.
        out["supported"] = False
        out["note"] = ("32-bit float TIFF cannot be processed by ffmpeg. "
                       "Render EXR, or 16-bit TIFF, instead.")
        return out

    if out["is_half"]:
        # Only this build's own decoder can settle whether the repair
        # LUT is needed. A float pix_fmt means it decoded correctly and
        # the LUT must NOT be applied; an integer one means it read the
        # half bit patterns as integers and the LUT fixes that.
        fmt = decoded_pix_fmt(probe_exe, path)
        out["decoded_pix_fmt"] = fmt
        if fmt is None:
            # Cannot ask, so do not guess. Leaving the LUT off is the
            # safe side: a missing repair is a flat image, a wrongly
            # applied one is unusable.
            out["needs_half_lut"] = False
            out["note"] = ("Could not confirm how ffmpeg reads this "
                           "16-bit float TIFF (ffprobe not found), so no "
                           "correction was applied. Check the preview.")
        elif fmt in ("unknown", "none", "") or _is_float_pix_fmt(fmt):
            # "unknown" means ffmpeg has no decoder path for this TIFF
            # variant (planar half-float is one). Applying the repair
            # LUT to something that will not decode helps nobody.
            out["needs_half_lut"] = False
            if fmt in ("unknown", "none", ""):
                out["supported"] = False
                out["note"] = ("ffmpeg cannot decode this TIFF variant. "
                               "Render EXR, or a non-planar 16-bit TIFF, "
                               "instead.")
        else:
            out["needs_half_lut"] = True

    return out


def probe_sequence(paths, probe_exe=None):
    """Probe the first frame and assume the sequence is homogeneous."""
    if not paths:
        return None
    return probe_frame(paths[0], probe_exe=probe_exe)


# ------------------------------------------------ half-float decoding LUT

_LUT_NAME = "mnr_half_decode_65536.cube"


def ensure_half_lut(cache_dir=None):
    """
    Build (once) the 1D LUT that turns ffmpeg's misreading of half-float TIFF
    back into correct linear values.

    ffmpeg decodes a half TIFF as rgb48le, treating each 16-bit half pattern
    as an unsigned integer. That is wrong but it is *deterministic*: the
    integer it hands us IS the half bit pattern, so a 65536-entry 1D LUT
    inverts it exactly, in C, at full speed.

    Returns the .cube path.
    """
    if cache_dir is None:
        cache_dir = os.path.join(tempfile.gettempdir(), "mnr_launcher")
    os.makedirs(cache_dir, exist_ok=True)
    path = os.path.join(cache_dir, _LUT_NAME)
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path

    unpack_half = struct.Struct("<e").unpack
    lines = [
        "# MNR Launcher - half-float bit pattern -> linear value",
        "# Generated automatically; safe to delete.",
        "LUT_1D_SIZE 65536",
        "DOMAIN_MIN 0 0 0",
        "DOMAIN_MAX 1 1 1",
        "",
    ]
    for i in range(65536):
        v = unpack_half(struct.pack("<H", i))[0]
        if v != v or abs(v) == float("inf"):        # NaN / Inf -> half max
            v = 65504.0
        v = max(0.0, v)                             # negatives clamp to 0
        lines.append("%.6f %.6f %.6f" % (v, v, v))

    tmp = path + ".part"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    os.replace(tmp, path)
    return path


# ------------------------------------------------------------ filter chains

def _mixer(matrix):
    keys = ("rr", "rg", "rb", "gr", "gg", "gb", "br", "bg", "bb")
    flat = [v for row in matrix for v in row]
    return "colorchannelmixer=" + ":".join(
        "%s=%.6f" % (k, v) for k, v in zip(keys, flat))


def _escape_for_filter(path):
    """ffmpeg filter args need \\ : and ' escaped - Windows paths hit all three."""
    return path.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def build_filters(input_cs, output_cs, info, extra=None, cache_dir=None):
    """
    Build the -vf chain for the chosen conversion.

    input_cs/output_cs : ids from COLORSPACES
    info               : dict from probe_frame()
    extra              : list of extra filters (scale, etc) appended at the end
    Returns (filter_string, output_flags_list).
    Raises ValueError when the pair or the format is not supported.
    """
    mode = TRANSFORMS.get((input_cs, output_cs))
    if mode is None:
        raise ValueError("%s to %s is not a supported conversion."
                         % (input_cs, output_cs))
    if info and not info.get("supported", True):
        raise ValueError(info.get("note") or "This frame format is unsupported.")

    chain = []

    # Only repair half-float TIFF on builds that actually misread it.
    # probe_frame decides that by asking the decoder, never by guessing
    # from the file's tags.
    repair_half = bool(info and info.get("needs_half_lut"))
    if repair_half:
        lut = ensure_half_lut(cache_dir)
        chain.append("format=gbrpf32le")
        chain.append("lut1d=file='%s':interp=nearest" % _escape_for_filter(lut))

    flags = []
    if mode == "matrix":
        if not repair_half:
            chain.append("format=gbrpf32le")        # work in float
        chain.append(_mixer(AP1_TO_REC709))         # AP1 -> Rec.709 primaries
        chain.append(                               # linear -> sRGB curve
            "zscale=tin=linear:min=gbr:pin=bt709:"
            "t=iec61966-2-1:m=bt709:p=bt709:r=tv"
        )
        flags = ["-colorspace", "bt709",
                 "-color_primaries", "bt709",
                 "-color_trc", "iec61966-2-1"]
    elif output_cs == "acescg":
        # Values stay linear. Tag it honestly so players at least know.
        flags = ["-color_trc", "linear"]

    if extra:
        chain.extend(extra)
    chain.append("format=yuv420p")
    return ",".join(chain), flags


# -------------------------------------------------------------- UI previews

def preview_pair(ffmpeg, frame_path, input_cs, output_cs,
                 width=480, cache_dir=None, probe_exe=None):
    """
    Render the two preview panes for the UI.

    left  - the frame as it is now, untransformed
    right - the frame as it will look after export

    Returns {"left": <data-uri>, "right": <data-uri>, "info": <probe dict>},
    or {"error": "..."} when the frame cannot be processed.
    """
    info = probe_frame(frame_path, probe_exe=probe_exe)
    if not info.get("supported", True):
        return {"error": info.get("note", "Unsupported frame format."),
                "info": info}

    try:
        decode = []
        repair_half = bool(info.get("needs_half_lut"))
        if repair_half:
            lut = ensure_half_lut(cache_dir)
            decode = ["format=gbrpf32le",
                      "lut1d=file='%s':interp=nearest" % _escape_for_filter(lut)]

        scale = "scale=%d:-1:flags=bicubic" % int(width)
        left_chain = decode + [scale, "format=rgb24"]

        right_chain = list(decode)
        if TRANSFORMS.get((input_cs, output_cs)) == "matrix":
            if not repair_half:
                right_chain.append("format=gbrpf32le")
            right_chain.append(_mixer(AP1_TO_REC709))
            right_chain.append("zscale=tin=linear:min=gbr:pin=bt709:"
                               "t=iec61966-2-1:m=bt709:p=bt709:r=tv")
        right_chain += [scale, "format=rgb24"]

        out = {}
        for side, chain in (("left", left_chain), ("right", right_chain)):
            png = _run_to_png(ffmpeg, frame_path, ",".join(chain))
            if png is None:
                return {"error": "ffmpeg could not render the preview.",
                        "info": info}
            out[side] = "data:image/png;base64," + base64.b64encode(png).decode("ascii")
        out["info"] = info
        return out
    except Exception as exc:
        return {"error": str(exc), "info": info}


def _run_to_png(ffmpeg, src, filters):
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
           "-i", src, "-vf", filters, "-frames:v", "1",
           "-f", "image2", "-c:v", "png", "-"]
    try:
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=45, creationflags=CREATE_NO_WINDOW)
    except Exception:
        return None
    return p.stdout if p.returncode == 0 and p.stdout else None
