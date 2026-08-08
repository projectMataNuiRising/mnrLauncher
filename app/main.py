"""
MNR Launcher - main.py
------------------------
Backend + window bootstrap for the MNR Launcher app.

This runs inside a portable Python (bundled once, shipped next to this
folder as portable_python/). It opens a native window (pywebview) that
shows app/web/index.html, and exposes a small API class to that page so
the HTML/JS side can ask Python to do real filesystem work (check
pCloud, list users, etc). Browsers can't touch local paths at all, so
all of that has to happen here in Python, not in the web page.

Stage 1 scope:
  - Detect pCloud Drive / network path
  - Best-effort "is pCloud still transferring" heuristic
  - List users from 00-temp
  - Remember the last-picked user on this machine
  - Home screen with tiles (Stop Motion Upload is a placeholder for Stage 2)

Requires (installed into the bundled portable Python, see requirements.txt):
  pywebview, pythonnet, psutil
"""

import os
import sys
import re
import json
import time
import shutil
import zipfile
import platform
import subprocess
import threading
import webbrowser

import webview

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

APP_NAME = "MNR Launcher"
APP_VERSION = "0.1.0-stage1"

# Set by bootstrap/launcher.py before it runs this file, so the UI can
# show which compiled shell version is currently running. Defaults to
# "dev" when main.py is run directly (not through the installed shell).
SHELL_VERSION = os.environ.get("MNR_SHELL_VERSION", "dev")

# ------------------------------------------------------------
# Paths
# ------------------------------------------------------------

def get_pcloud_root():
    """Returns the expected pCloud Drive root for this OS."""
    system = platform.system()
    if system == "Windows":
        return "P:\\"
    if system == "Darwin":
        return os.path.expanduser("~/pCloud Drive")
    # Not an officially supported OS yet, best guess.
    return os.path.expanduser("~/pCloud Drive")


def get_users_folder():
    """Where the per-user folders live, used for the user picker."""
    root = get_pcloud_root()
    return os.path.join(root, "00-temp")


def _path_to_relative_parts(absolute_path, base_root):
    """
    Converts an absolute path (typed into an address bar, pasted, or
    picked via the native folder browser) into the relative path parts
    the tree/browser tools already work with, relative to base_root.
    Returns None if the path is outside base_root or doesn't exist.
    Case-insensitive on Windows, since paths there are.
    """
    try:
        abs_norm = os.path.normpath(os.path.abspath(absolute_path))
        base_norm = os.path.normpath(os.path.abspath(base_root))
    except Exception:
        return None

    if platform.system() == "Windows":
        abs_cmp, base_cmp = abs_norm.lower(), base_norm.lower()
    else:
        abs_cmp, base_cmp = abs_norm, base_norm

    if abs_cmp == base_cmp:
        return []

    # base_cmp might already end in a separator, a bare drive root like
    # "P:\" normalizes to itself (unlike a normal subfolder path), so
    # strip any trailing separator before adding exactly one back.
    # Skipping this produced a double separator ("P:\\") that could
    # never match a real path, breaking every whole-drive path check.
    prefix = base_cmp.rstrip(os.sep) + os.sep
    if not abs_cmp.startswith(prefix):
        return None

    rel = os.path.relpath(abs_norm, base_norm)
    return [p for p in rel.split(os.sep) if p]


def get_local_state_dir():
    """
    A per-machine folder for small local state (like 'last selected user').
    This must NOT live on the shared network drive, since it is different
    per machine, not shared between users.
    """
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("APPDATA", os.path.expanduser("~"))
    elif system == "Darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.path.expanduser("~/.config")

    state_dir = os.path.join(base, "MNR_Launcher")
    os.makedirs(state_dir, exist_ok=True)
    return state_dir


def get_local_state_path():
    return os.path.join(get_local_state_dir(), "state.json")


def get_shell_cache_dir():
    """
    Must compute the SAME path as bootstrap/launcher.py's get_cache_dir().
    That is where the installed shell caches the fetched app/ code AND
    writes its boot log, this lets us read that log once this app starts,
    to see whether the GitHub fetch actually succeeded on this launch.
    """
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    elif system == "Darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.path.expanduser("~/.cache")
    return os.path.join(base, "MNR_Launcher", "app_cache")


def get_dev_settings_path():
    """Same file launcher.py's read_dev_settings() reads on every launch."""
    return os.path.join(get_shell_cache_dir(), "dev_settings.json")


def read_dev_settings():
    try:
        with open(get_dev_settings_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "dev_app_code": bool(data.get("dev_app_code", False)),
            "dev_exe": bool(data.get("dev_exe", False)),
        }
    except Exception:
        return {"dev_app_code": False, "dev_exe": False}


def write_dev_settings(dev_app_code, dev_exe):
    try:
        os.makedirs(get_shell_cache_dir(), exist_ok=True)
        with open(get_dev_settings_path(), "w", encoding="utf-8") as f:
            json.dump({"dev_app_code": bool(dev_app_code), "dev_exe": bool(dev_exe)}, f)
        return True
    except Exception:
        return False


_DEBUG_LOG = []


def _log(msg):
    timestamp = time.strftime("%H:%M:%S")
    _DEBUG_LOG.append(f"[{timestamp}] {msg}")
    if len(_DEBUG_LOG) > 500:
        del _DEBUG_LOG[:100]


def _load_shell_boot_log():
    """Pulls in whatever the installed shell logged before this app even
    opened, most importantly whether the GitHub code fetch succeeded."""
    try:
        boot_log_path = os.path.join(get_shell_cache_dir(), "boot_log.txt")
        if os.path.isfile(boot_log_path):
            with open(boot_log_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        _DEBUG_LOG.append(line)
    except Exception as e:
        _DEBUG_LOG.append(f"Could not read the shell's boot log: {e}")


_load_shell_boot_log()
_log("main.py started")


# ------------------------------------------------------------
# Local state (per machine, not shared on the network drive)
# ------------------------------------------------------------

def read_local_state():
    path = get_local_state_path()
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def write_local_state(data):
    path = get_local_state_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception:
        return False


# ------------------------------------------------------------
# Generic folder listing helpers, used by the dropdown cascade and
# the read-only folder explorer on the right side of tool pages.
# ------------------------------------------------------------

_JUNK_NAMES = (".DS_Store", "Thumbs.db", "desktop.ini")


def _safe_listdir(path):
    try:
        return os.listdir(path)
    except Exception:
        return None


def _is_junk(name):
    return name in _JUNK_NAMES or name.startswith(".")


def _find_first_subfolder(path):
    """
    Same convention as the existing Blender launch .bat: the first
    (alphabetically sorted) folder found. Matches "01-latest" always
    holding exactly one current build folder that gets swapped out.
    """
    entries = _safe_listdir(path)
    if not entries:
        return None
    for entry in sorted(entries, key=str.lower):
        if _is_junk(entry):
            continue
        full = os.path.join(path, entry)
        if os.path.isdir(full):
            return full
    return None


def _resolve_blender_paths():
    root = get_pcloud_root()
    blender_root = os.path.join(root, "02-pipeline", "apps", "blender", "01-latest")

    pipeline_build_dir = _find_first_subfolder(blender_root)
    if not pipeline_build_dir:
        return None

    blender_version_dir = _find_first_subfolder(pipeline_build_dir)
    if not blender_version_dir:
        return None

    exe_path = os.path.join(blender_version_dir, "blender.exe")
    if not os.path.isfile(exe_path):
        return None

    return {
        "pipeline_build_dir": pipeline_build_dir,
        "blender_version_dir": blender_version_dir,
        "exe_path": exe_path,
    }


_BLENDER_VERSION_RE = re.compile(r"blender-([\d.]+)", re.IGNORECASE)


def _extract_blender_version(blender_version_dir):
    match = _BLENDER_VERSION_RE.search(os.path.basename(blender_version_dir))
    return match.group(1) if match else "?"


def _resolve_rawtherapee_paths():
    root = get_pcloud_root()
    rt_root = os.path.join(root, "02-pipeline", "apps", "rawTherapee", "01-latest")

    pipeline_build_dir = _find_first_subfolder(rt_root)
    if not pipeline_build_dir:
        return None

    rt_version_dir = _find_first_subfolder(pipeline_build_dir)
    if not rt_version_dir:
        return None

    exe_path = os.path.join(rt_version_dir, "RawTherapee.exe")
    if not os.path.isfile(exe_path):
        return None

    return {
        "pipeline_build_dir": pipeline_build_dir,
        "rt_version_dir": rt_version_dir,
        "exe_path": exe_path,
    }


_RT_VERSION_RE = re.compile(r"rawtherapee-([\d.]+)", re.IGNORECASE)


def _extract_rawtherapee_version(rt_version_dir):
    match = _RT_VERSION_RE.search(os.path.basename(rt_version_dir))
    return match.group(1) if match else "?"


def _resolve_ffmpeg_paths():
    root = get_pcloud_root()
    ff_root = os.path.join(root, "02-pipeline", "apps", "ffmpeg", "01-latest")

    pipeline_build_dir = _find_first_subfolder(ff_root)
    if not pipeline_build_dir:
        return None

    ff_version_dir = _find_first_subfolder(pipeline_build_dir)
    if not ff_version_dir:
        return None

    # Real gyan.dev/BtbN builds put the exe inside a bin/ subfolder,
    # but check the root too in case someone flattens it.
    for candidate in (os.path.join(ff_version_dir, "bin", "ffmpeg.exe"), os.path.join(ff_version_dir, "ffmpeg.exe")):
        if os.path.isfile(candidate):
            return {
                "pipeline_build_dir": pipeline_build_dir,
                "ffmpeg_version_dir": ff_version_dir,
                "exe_path": candidate,
            }
    return None


_FFMPEG_VERSION_RE = re.compile(r"ffmpeg-([\d.]+)", re.IGNORECASE)


def _extract_ffmpeg_version(ff_version_dir):
    match = _FFMPEG_VERSION_RE.search(os.path.basename(ff_version_dir))
    return match.group(1) if match else "?"


# ------------------------------------------------------------
# Frames to MP4 tool. Detects a numbered image sequence matching the
# basename.NNNN.ext convention already used throughout the pipeline
# (e.g. BFP102_SQ06_SH07_smAnim_gali01-main_v001.1001.jpg), reads the
# real resolution off the first frame, and runs ffmpeg on a background
# thread so the UI can show live frame-based progress.
# ------------------------------------------------------------

_FRAME_SEQ_RE = re.compile(r"^(.+)\.(\d+)\.(\w+)$")
_FRAME_SEQ_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".exr", ".cr2", ".cr3", ".dpx"}


def _detect_frame_sequence(folder_path):
    entries = _safe_listdir(folder_path)
    if not entries:
        return None

    groups = {}  # (prefix, ext, padding) -> [(frame_num, filename), ...]
    for name in entries:
        full = os.path.join(folder_path, name)
        if not os.path.isfile(full):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in _FRAME_SEQ_IMAGE_EXTS:
            continue
        m = _FRAME_SEQ_RE.match(name)
        if not m:
            continue
        prefix, frame_str, file_ext = m.group(1), m.group(2), m.group(3)
        key = (prefix, file_ext.lower(), len(frame_str))
        groups.setdefault(key, []).append((int(frame_str), name))

    if not groups:
        return None

    # The biggest group is almost certainly the real sequence, in case
    # a stray differently-named file or two is sitting in the folder.
    best_key = max(groups.keys(), key=lambda k: len(groups[k]))
    prefix, ext, padding = best_key
    frames = sorted(groups[best_key], key=lambda x: x[0])
    frame_numbers = [f[0] for f in frames]
    start_frame = frame_numbers[0]
    end_frame = frame_numbers[-1]
    expected_count = end_frame - start_frame + 1
    actual_count = len(frame_numbers)

    return {
        "prefix": prefix,
        "ext": ext,
        "padding": padding,
        "start_frame": start_frame,
        "end_frame": end_frame,
        "frame_count": actual_count,
        "has_gaps": actual_count != expected_count,
        "first_file": frames[0][1],
    }


_FFMPEG_PROGRESS = {
    "active": False,
    "done": False,
    "ok": False,
    "detail": "",
    "total_frames": 0,
    "current_frame": 0,
}

_FFMPEG_FRAME_LOG_RE = re.compile(r"frame=\s*(\d+)")


def _run_ffmpeg_worker(exe_path, folder_path, seq, framerate, bitrate_kbps, scale_percent, output_path):
    input_pattern = os.path.join(folder_path, f"{seq['prefix']}.%0{seq['padding']}d.{seq['ext']}")
    scale_factor = scale_percent / 100.0

    cmd = [
        exe_path,
        "-y",
        "-start_number", str(seq["start_frame"]),
        "-framerate", str(framerate),
        "-i", input_pattern,
        "-vf", f"scale=iw*{scale_factor}:ih*{scale_factor}",
        "-c:v", "libx264",
        "-b:v", f"{bitrate_kbps}k",
        "-pix_fmt", "yuv420p",
        output_path,
    ]

    _FFMPEG_PROGRESS["total_frames"] = seq["frame_count"]

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        for line in process.stdout:
            m = _FFMPEG_FRAME_LOG_RE.search(line)
            if m:
                _FFMPEG_PROGRESS["current_frame"] = int(m.group(1))
        process.wait()

        if process.returncode == 0 and os.path.isfile(output_path):
            _FFMPEG_PROGRESS["ok"] = True
            _FFMPEG_PROGRESS["detail"] = os.path.basename(output_path)
        else:
            _FFMPEG_PROGRESS["ok"] = False
            _FFMPEG_PROGRESS["detail"] = f"ffmpeg exited with code {process.returncode}"
    except Exception as e:
        _FFMPEG_PROGRESS["ok"] = False
        _FFMPEG_PROGRESS["detail"] = str(e)

    _FFMPEG_PROGRESS["active"] = False
    _FFMPEG_PROGRESS["done"] = True


# ------------------------------------------------------------
# pCloud process heuristic (best-effort, there is no official API)
# ------------------------------------------------------------

_PCLOUD_PROCESS_NAMES = ("pcloud", "pcloud drive", "pclouddrive", "pcloud.exe")


def _find_pcloud_process():
    if not HAS_PSUTIL:
        return None
    for proc in psutil.process_iter(["name"]):
        try:
            name = (proc.info.get("name") or "").lower()
        except Exception:
            continue
        if any(tag in name for tag in _PCLOUD_PROCESS_NAMES):
            return proc
    return None


def _sample_io_bytes(proc):
    try:
        io = proc.io_counters()
        return io.read_bytes + io.write_bytes
    except Exception:
        # io_counters() is not supported on every OS (e.g. macOS raises here).
        return None


def _resolve_pcloud_path(relative_parts, from_root=False):
    """
    Normal mode: paths are relative to 01-projects, exactly as every
    other tool in the app already works. Override mode: paths are
    relative to the pCloud drive root itself, so literally anything on
    the drive can be reached, used only by the Archive/Restore tool's
    explicit, off-by-default override toggle.
    """
    root = get_pcloud_root()
    if from_root:
        return os.path.join(root, *relative_parts)
    return os.path.join(root, "01-projects", *relative_parts)


# ------------------------------------------------------------
# Archive/Restore queue runs on a background thread so the UI can show
# a live byte-based progress bar and estimated time remaining instead
# of freezing while a big folder zips or unzips. Progress is tracked
# in bytes rather than item count, since queued folders can vary
# wildly in size, item count alone would jump unevenly.
# ------------------------------------------------------------

_ARCHIVE_PROGRESS = {
    "active": False,
    "done": False,
    "cancelled": False,
    "cancel_requested": False,
    "total_bytes": 0,
    "processed_bytes": 0,
    "current_item": "",
    "started_at": 0,
    "results": [],
}


class _ArchiveCancelled(Exception):
    pass


def _check_cancel():
    if _ARCHIVE_PROGRESS["cancel_requested"]:
        raise _ArchiveCancelled()


def _folder_byte_size(path):
    total = 0
    for dirpath, _dirnames, filenames in os.walk(path):
        for name in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
            except Exception:
                pass
    return total


def _run_archive_queue_worker(archive_items, restore_items, delete_source, delete_zip):
    try:
        for item in archive_items:
            path_parts = item.get("pathParts", [])
            name = item.get("name", "")
            from_root = bool(item.get("fromRoot", False))
            folder_path = _resolve_pcloud_path(path_parts, from_root)
            _ARCHIVE_PROGRESS["current_item"] = f"Archiving {name}..."
            _check_cancel()

            if not os.path.isdir(folder_path):
                _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": False, "detail": "Folder not found"})
                continue

            zip_path = folder_path.rstrip("\\/") + ".zip"
            if os.path.exists(zip_path):
                _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": False, "detail": "A zip with that name already exists here"})
                continue

            ok, detail = True, os.path.basename(zip_path)
            try:
                with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
                    for dirpath, _dirnames, filenames in os.walk(folder_path):
                        for fname in filenames:
                            _check_cancel()
                            file_full = os.path.join(dirpath, fname)
                            arcname = os.path.relpath(file_full, folder_path)
                            zf.write(file_full, arcname)
                            try:
                                _ARCHIVE_PROGRESS["processed_bytes"] += os.path.getsize(file_full)
                            except Exception:
                                pass
            except _ArchiveCancelled:
                # Delete the incomplete zip, the source folder was
                # never touched at this point, so it is already exactly
                # back to how it was, nothing further to undo.
                try:
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
                except Exception:
                    pass
                _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": False, "detail": "Cancelled, original folder untouched"})
                raise
            except Exception as e:
                ok, detail = False, f"Zip creation failed: {e}"
                try:
                    if os.path.exists(zip_path):
                        os.remove(zip_path)
                except Exception:
                    pass

            if ok and delete_source:
                try:
                    shutil.rmtree(folder_path)
                except Exception as e:
                    detail = f"Zipped, but could not delete the original folder: {e}"

            _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": ok, "detail": detail})

        for item in restore_items:
            path_parts = item.get("pathParts", [])
            name = item.get("name", "")
            from_root = bool(item.get("fromRoot", False))
            zip_path = _resolve_pcloud_path(path_parts, from_root)
            _ARCHIVE_PROGRESS["current_item"] = f"Restoring {name}..."
            _check_cancel()

            if not os.path.isfile(zip_path) or not zip_path.lower().endswith(".zip"):
                _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": False, "detail": "Not a zip file"})
                continue

            dest_folder = zip_path[:-4]
            if os.path.exists(dest_folder):
                _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": False, "detail": "A folder with that name already exists here"})
                continue

            ok, detail = True, os.path.basename(dest_folder)
            try:
                os.makedirs(dest_folder, exist_ok=True)
                with zipfile.ZipFile(zip_path, "r") as zf:
                    for zi in zf.infolist():
                        _check_cancel()
                        zf.extract(zi, dest_folder)
                        _ARCHIVE_PROGRESS["processed_bytes"] += zi.file_size
            except _ArchiveCancelled:
                # Delete the partially-extracted folder, the original
                # zip was never touched, so it is already back to how
                # it was, nothing further to undo.
                try:
                    shutil.rmtree(dest_folder)
                except Exception:
                    pass
                _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": False, "detail": "Cancelled, original zip untouched"})
                raise
            except Exception as e:
                ok, detail = False, f"Extraction failed: {e}"

            if ok and delete_zip:
                try:
                    os.remove(zip_path)
                except Exception as e:
                    detail = f"Extracted, but could not delete the zip: {e}"

            _ARCHIVE_PROGRESS["results"].append({"name": name, "ok": ok, "detail": detail})

    except _ArchiveCancelled:
        _ARCHIVE_PROGRESS["cancelled"] = True

    _ARCHIVE_PROGRESS["current_item"] = ""
    _ARCHIVE_PROGRESS["active"] = False
    _ARCHIVE_PROGRESS["done"] = True


# ------------------------------------------------------------
# API exposed to the web UI (called as window.pywebview.api.X(...) in JS)
# ------------------------------------------------------------

class MnrApi:

    def get_app_info(self):
        return {
            "name": APP_NAME,
            "version": APP_VERSION,
            "shell_version": SHELL_VERSION,
            "dev_exe": os.environ.get("MNR_DEV_EXE") == "1",
            "dev_app_code": os.environ.get("MNR_DEV_APP_CODE") == "1",
            "platform": platform.system(),
        }

    def get_dev_settings(self):
        return read_dev_settings()

    def set_dev_settings(self, dev_app_code, dev_exe):
        write_dev_settings(dev_app_code, dev_exe)
        _log(f"Dev settings changed: app_code={bool(dev_app_code)} exe={bool(dev_exe)}, restarting...")
        _REFRESH_STATE["requested"] = True
        try:
            webview.windows[0].destroy()
        except Exception:
            pass
        return {"ok": True}

    def check_drive(self):
        """
        Step 1 of the boot checklist: is the pCloud Drive / network
        path even present and readable.
        """
        root = get_pcloud_root()
        found = os.path.isdir(root)
        projects_ok = found and os.path.isdir(os.path.join(root, "01-projects"))
        ok = bool(found and projects_ok)
        _log(f"check_drive: root={root} ok={ok}")
        return {
            "ok": ok,
            "root": root,
            "detail": root if ok else "Not found or not accessible",
        }

    def check_transfer_activity(self, sample_seconds=1.0):
        """
        Best-effort heuristic for 'is pCloud actively busy right now'.
        There is no official pCloud API for this. We watch the pCloud
        process's disk IO counters over a short window instead. Treat
        this as approximate, not a guarantee.

        This runs a short time.sleep(), pywebview calls js_api methods
        on a background thread so this does not freeze the window.
        """
        if not HAS_PSUTIL:
            return {"state": "unknown", "detail": "psutil not available"}

        proc = _find_pcloud_process()
        if proc is None:
            return {"state": "unknown", "detail": "pCloud process not found"}

        before = _sample_io_bytes(proc)
        if before is None:
            return {"state": "unknown", "detail": "IO counters not supported on this OS"}

        time.sleep(max(0.2, min(sample_seconds, 3.0)))

        after = _sample_io_bytes(proc)
        if after is None:
            return {"state": "unknown", "detail": "IO counters not supported on this OS"}

        delta = after - before
        # Threshold is a starting guess, tune it once you've watched real uploads.
        busy = delta > 200_000  # roughly 200 KB moved during the sample window
        return {
            "state": "busy" if busy else "idle",
            "detail": f"{delta} bytes moved during sample",
        }

    def list_users(self):
        """Reads P:\\00-temp (or the mac equivalent) for the user picker."""
        folder = get_users_folder()
        if not os.path.isdir(folder):
            return {"ok": False, "users": [], "detail": f"Folder not found: {folder}"}

        names = []
        for entry in os.listdir(folder):
            full = os.path.join(folder, entry)
            if not os.path.isdir(full):
                continue
            if entry.startswith("."):
                continue
            if entry.startswith("#"):
                continue
            names.append(entry)

        names.sort(key=str.lower)
        return {"ok": True, "users": names}

    def get_saved_user(self):
        state = read_local_state()
        return state.get("current_user")

    def set_current_user(self, username):
        state = read_local_state()
        state["current_user"] = username
        write_local_state(state)
        return {"ok": True, "current_user": username}

    # --------------------------------------------------------
    # Project / Episode / Sequence / Shot dropdown cascade.
    # These are all position-based, not name-based: dropdown 3 just
    # lists whatever is one level under dropdown 2's pick, dropdown 4
    # lists whatever is one level under dropdown 3's pick. That is what
    # makes DEV/TESTS/T01 work the same way as 102/SQ04/SH08 without
    # any special-casing.
    # --------------------------------------------------------

    def _list_folder_names(self, base):
        entries = _safe_listdir(base)
        if entries is None:
            return {"ok": False, "items": [], "detail": f"Folder not found: {base}"}

        names = []
        for entry in entries:
            if _is_junk(entry):
                continue
            if entry.startswith("#"):
                continue
            full = os.path.join(base, entry)
            if os.path.isdir(full):
                names.append(entry)

        names.sort(key=str.lower)
        return {"ok": True, "items": names}

    def list_projects(self):
        """Dropdown 1: folder names directly under 01-projects."""
        root = get_pcloud_root()
        base = os.path.join(root, "01-projects")
        result = self._list_folder_names(base)
        _log(f"list_projects: {len(result.get('items', []))} found, ok={result['ok']}")
        return result

    def list_episodes(self, project):
        """Dropdown 2: folder names under {project}\\03-shot."""
        root = get_pcloud_root()
        base = os.path.join(root, "01-projects", project, "03-shot")
        result = self._list_folder_names(base)
        _log(f"list_episodes({project}): {len(result.get('items', []))} found, ok={result['ok']}")
        return result

    def list_children(self, relative_parts):
        """
        Dropdowns 3 and 4 (and anything deeper): lists whatever folders
        sit one level under the given path. relative_parts is a list of
        path segments under 01-projects, e.g. ["BFP", "03-shot", "102", "SQ04"].
        """
        root = get_pcloud_root()
        base = os.path.join(root, "01-projects", *relative_parts)
        result = self._list_folder_names(base)
        _log(f"list_children({'/'.join(relative_parts)}): {len(result.get('items', []))} found, ok={result['ok']}")
        return result

    # --------------------------------------------------------
    # Read-only folder explorer (right side panel). Lazy-loaded: the
    # frontend asks for one folder's immediate contents at a time as
    # the user expands nodes, rather than scanning the whole tree up front.
    # --------------------------------------------------------

    def list_dir_entries(self, relative_parts, show_hidden=False, from_root=False):
        """
        relative_parts is a list of path segments under 01-projects,
        or under the pCloud drive root itself when from_root is True.
        Returns files and folders (folders first), each tagged with
        whether it is a "#" hidden pipeline folder.
        """
        base = _resolve_pcloud_path(relative_parts, from_root)
        entries = _safe_listdir(base)
        if entries is None:
            return {"ok": False, "items": [], "detail": f"Folder not found: {base}"}

        items = []
        for entry in entries:
            if _is_junk(entry):
                continue
            hidden = entry.startswith("#")
            if hidden and not show_hidden:
                continue
            full = os.path.join(base, entry)
            items.append({
                "name": entry,
                "is_dir": os.path.isdir(full),
                "hidden": hidden,
            })

        items.sort(key=lambda i: (not i["is_dir"], i["name"].lower()))
        return {"ok": True, "items": items}

    def open_path(self, relative_parts, from_root=False):
        """Double-click behaviour: open a file or folder with the OS default app."""
        full = _resolve_pcloud_path(relative_parts, from_root)
        try:
            system = platform.system()
            if system == "Windows":
                os.startfile(full)
            elif system == "Darwin":
                import subprocess
                subprocess.call(["open", full])
            else:
                import subprocess
                subprocess.call(["xdg-open", full])
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    # --------------------------------------------------------
    # Archive / Restore tool. Plain zip, STORED (no compression), since
    # the content here is JPEGs and raw camera files that are already
    # compressed, further compression buys almost nothing and only
    # costs time. Internal paths are stored relative to the folder
    # being zipped, and restoring creates a folder named after the zip
    # and extracts directly into it, so the structure round-trips
    # exactly, no nested duplicate folder on the way back out.
    # --------------------------------------------------------

    def get_folder_size(self, relative_parts, from_root=False):
        full = _resolve_pcloud_path(relative_parts, from_root)
        total = 0
        file_count = 0
        try:
            for dirpath, _dirnames, filenames in os.walk(full):
                for name in filenames:
                    file_count += 1
                    try:
                        total += os.path.getsize(os.path.join(dirpath, name))
                    except Exception:
                        pass
            return {"ok": True, "bytes": total, "file_count": file_count}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    def archive_folder(self, relative_parts, delete_source=True, from_root=False):
        folder_path = _resolve_pcloud_path(relative_parts, from_root)

        if not os.path.isdir(folder_path):
            return {"ok": False, "detail": "Folder not found"}

        zip_path = folder_path.rstrip("\\/") + ".zip"
        if os.path.exists(zip_path):
            return {"ok": False, "detail": "A zip with that name already exists here"}

        try:
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
                for dirpath, _dirnames, filenames in os.walk(folder_path):
                    for name in filenames:
                        file_full = os.path.join(dirpath, name)
                        arcname = os.path.relpath(file_full, folder_path)
                        zf.write(file_full, arcname)
            _log(f"archive_folder: created {zip_path}")
        except Exception as e:
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
            except Exception:
                pass
            return {"ok": False, "detail": f"Zip creation failed: {e}"}

        if delete_source:
            try:
                shutil.rmtree(folder_path)
            except Exception as e:
                return {"ok": True, "detail": f"Zipped, but could not delete the original folder: {e}"}

        return {"ok": True, "detail": os.path.basename(zip_path)}

    def dearchive_zip(self, relative_parts, delete_archive=True, from_root=False):
        zip_path = _resolve_pcloud_path(relative_parts, from_root)

        if not os.path.isfile(zip_path) or not zip_path.lower().endswith(".zip"):
            return {"ok": False, "detail": "Not a zip file"}

        dest_folder = zip_path[:-4]  # strip ".zip", same name as the original folder
        if os.path.exists(dest_folder):
            return {"ok": False, "detail": "A folder with that name already exists here"}

        try:
            os.makedirs(dest_folder, exist_ok=True)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(dest_folder)
            _log(f"dearchive_zip: extracted to {dest_folder}")
        except Exception as e:
            return {"ok": False, "detail": f"Extraction failed: {e}"}

        if delete_archive:
            try:
                os.remove(zip_path)
            except Exception as e:
                return {"ok": True, "detail": f"Extracted, but could not delete the zip: {e}"}

        return {"ok": True, "detail": os.path.basename(dest_folder)}

    def run_archive_queue(self, archive_items, restore_items, delete_source=True, delete_zip=True):
        """
        Runs the whole queue on a background thread so the UI can poll
        get_archive_progress() for a live percentage and ETA instead of
        freezing. archive_folder/dearchive_zip above still exist for
        one-off calls, this is the bulk version the Run button uses.
        """
        if _ARCHIVE_PROGRESS["active"]:
            return {"ok": False, "detail": "A previous run is still in progress"}

        total_bytes = 0
        for item in archive_items:
            path = _resolve_pcloud_path(item.get("pathParts", []), bool(item.get("fromRoot", False)))
            if os.path.isdir(path):
                total_bytes += _folder_byte_size(path)
        for item in restore_items:
            path = _resolve_pcloud_path(item.get("pathParts", []), bool(item.get("fromRoot", False)))
            try:
                total_bytes += os.path.getsize(path)
            except Exception:
                pass

        _ARCHIVE_PROGRESS["total_bytes"] = total_bytes
        _ARCHIVE_PROGRESS["processed_bytes"] = 0
        _ARCHIVE_PROGRESS["results"] = []
        _ARCHIVE_PROGRESS["current_item"] = ""
        _ARCHIVE_PROGRESS["started_at"] = time.time()
        _ARCHIVE_PROGRESS["done"] = False
        _ARCHIVE_PROGRESS["cancelled"] = False
        _ARCHIVE_PROGRESS["cancel_requested"] = False
        _ARCHIVE_PROGRESS["active"] = True

        thread = threading.Thread(
            target=_run_archive_queue_worker,
            args=(archive_items, restore_items, delete_source, delete_zip),
            daemon=True,
        )
        thread.start()
        return {"ok": True}

    def cancel_archive_queue(self):
        """
        Asks the background worker to stop as soon as it safely can,
        checked between every single file rather than only between
        queue items, so even one huge folder responds quickly. Whatever
        item was in progress at that moment gets cleaned up: an
        incomplete zip is deleted, or a partially-extracted folder is
        deleted, leaving the original exactly as it was either way.
        Anything already fully completed before this point stays done.
        """
        _ARCHIVE_PROGRESS["cancel_requested"] = True
        return {"ok": True}

    def get_archive_progress(self):
        total = _ARCHIVE_PROGRESS["total_bytes"]
        processed = _ARCHIVE_PROGRESS["processed_bytes"]
        elapsed = time.time() - _ARCHIVE_PROGRESS["started_at"] if _ARCHIVE_PROGRESS["started_at"] else 0

        percent = 100 if total <= 0 else min(100, int((processed / total) * 100))

        eta_seconds = None
        if total > 0 and processed > 0 and elapsed > 1:
            rate = processed / elapsed
            if rate > 0:
                eta_seconds = max(total - processed, 0) / rate

        return {
            "active": _ARCHIVE_PROGRESS["active"],
            "done": _ARCHIVE_PROGRESS["done"],
            "cancelled": _ARCHIVE_PROGRESS["cancelled"],
            "percent": percent,
            "current_item": _ARCHIVE_PROGRESS["current_item"],
            "eta_seconds": eta_seconds,
            "results": list(_ARCHIVE_PROGRESS["results"]),
        }

    # --------------------------------------------------------
    # Frames to MP4 tool
    # --------------------------------------------------------

    def get_ffmpeg_info(self):
        if platform.system() != "Windows":
            return {"ok": False, "supported": False, "detail": "Windows only for now"}

        paths = _resolve_ffmpeg_paths()
        if not paths:
            return {"ok": False, "supported": True, "detail": "No ffmpeg build found in the pipeline folder"}

        version = _extract_ffmpeg_version(paths["ffmpeg_version_dir"])
        return {"ok": True, "supported": True, "version": version}

    def inspect_frame_sequence(self, relative_parts, from_root=False):
        folder_path = _resolve_pcloud_path(relative_parts, from_root)
        if not os.path.isdir(folder_path):
            return {"ok": False, "detail": "Folder not found"}

        seq = _detect_frame_sequence(folder_path)
        if not seq:
            return {"ok": False, "detail": "No numbered image sequence found in this folder"}

        first_file_path = os.path.join(folder_path, seq["first_file"])
        try:
            from PIL import Image
            with Image.open(first_file_path) as img:
                width, height = img.size
        except Exception as e:
            return {"ok": False, "detail": f"Could not read frame resolution: {e}"}

        return {
            "ok": True,
            "prefix": seq["prefix"],
            "frame_count": seq["frame_count"],
            "start_frame": seq["start_frame"],
            "end_frame": seq["end_frame"],
            "has_gaps": seq["has_gaps"],
            "width": width,
            "height": height,
        }

    def run_ffmpeg_convert(self, relative_parts, framerate, bitrate_kbps, scale_percent, output_name, output_folder_parts=None, from_root=False):
        if _FFMPEG_PROGRESS["active"]:
            return {"ok": False, "detail": "A previous conversion is still in progress"}

        paths = _resolve_ffmpeg_paths()
        if not paths:
            return {"ok": False, "detail": "Could not find ffmpeg in the pipeline folder"}

        folder_path = _resolve_pcloud_path(relative_parts, from_root)
        seq = _detect_frame_sequence(folder_path)
        if not seq:
            return {"ok": False, "detail": "No numbered image sequence found in this folder"}

        if output_folder_parts:
            output_dir = _resolve_pcloud_path(output_folder_parts, from_root)
        else:
            output_dir = os.path.dirname(folder_path)

        if not os.path.isdir(output_dir):
            return {"ok": False, "detail": "Output folder does not exist"}

        clean_name = output_name if output_name.lower().endswith(".mp4") else f"{output_name}.mp4"
        output_path = os.path.join(output_dir, clean_name)
        if os.path.exists(output_path):
            return {"ok": False, "detail": "A file with that output name already exists"}

        _FFMPEG_PROGRESS["active"] = True
        _FFMPEG_PROGRESS["done"] = False
        _FFMPEG_PROGRESS["ok"] = False
        _FFMPEG_PROGRESS["detail"] = ""
        _FFMPEG_PROGRESS["current_frame"] = 0

        thread = threading.Thread(
            target=_run_ffmpeg_worker,
            args=(paths["exe_path"], folder_path, seq, framerate, bitrate_kbps, scale_percent, output_path),
            daemon=True,
        )
        thread.start()
        return {"ok": True}

    def get_ffmpeg_progress(self):
        total = _FFMPEG_PROGRESS["total_frames"]
        current = _FFMPEG_PROGRESS["current_frame"]
        percent = 100 if total <= 0 else min(100, int((current / total) * 100))
        return {
            "active": _FFMPEG_PROGRESS["active"],
            "done": _FFMPEG_PROGRESS["done"],
            "ok": _FFMPEG_PROGRESS["ok"],
            "detail": _FFMPEG_PROGRESS["detail"],
            "percent": percent,
            "current_frame": current,
            "total_frames": total,
        }

    # --------------------------------------------------------
    # Refresh: when this app was launched by the installed bootstrap
    # shell (which fetches this exact code fresh from GitHub each run),
    # this closes the window with a special exit code that tells the
    # shell "re-download the latest code and start me again", instead
    # of just quitting. If someone runs main.py directly (no shell),
    # this just closes the window like a normal quit.
    # --------------------------------------------------------

    def request_refresh(self):
        _log("Refresh requested by user")
        _REFRESH_STATE["requested"] = True
        try:
            webview.windows[0].destroy()
        except Exception:
            pass
        return {"ok": True}

    def get_pending_shell_update(self):
        """
        The installed shell checks for an update before this app even
        opens and, if one exists, injects it here rather than
        downloading it automatically. The UI shows a forced "Update
        Now" gate if this comes back available, nothing else in the
        app is usable until it's handled, on purpose, so nobody ends
        up running a stale, mismatched version without realizing it.
        """
        info = globals().get("_mnr_pending_shell_update")
        return {"available": bool(info), "info": info}

    def apply_shell_update(self):
        """
        Only ever called from the forced update gate's button click,
        never automatically. Downloads the new exe and hands off to
        the swap-and-relaunch relay, this process exits right after.
        """
        callback = globals().get("_mnr_apply_shell_update_callback")
        if not callback:
            return {"ok": False, "detail": "No update available to apply"}

        success = callback()
        if not success:
            return {"ok": False, "detail": "Download failed, check your internet connection and try again"}

        _log("Shell update applied by user, restarting...")
        _SHELL_UPDATE_STATE["requested"] = True
        try:
            webview.windows[0].destroy()
        except Exception:
            pass
        return {"ok": True}

    def get_debug_log(self):
        return {"lines": list(_DEBUG_LOG)}

    def log_frontend_error(self, msg):
        _log(f"[frontend error] {msg}")
        return {"ok": True}

    def open_url(self, url):
        """Opens a URL in the user's default browser, for Launch tiles
        that point at external sites (Kitsu, docs, etc)."""
        try:
            webbrowser.open(url)
            _log(f"open_url: {url}")
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    # --------------------------------------------------------
    # Blender launch. Windows only for now, no Mac/Linux plans. This
    # always re-scans the shared pipeline folder live, never caching a
    # path, so dropping in a new Blender build there is picked up
    # automatically, nothing to update on the MNR Launcher side.
    # --------------------------------------------------------

    def get_blender_info(self):
        if platform.system() != "Windows":
            return {"ok": False, "supported": False, "detail": "Windows only for now"}

        paths = _resolve_blender_paths()
        if not paths:
            return {"ok": False, "supported": True, "detail": "No Blender build found in the pipeline folder"}

        version = _extract_blender_version(paths["blender_version_dir"])
        return {"ok": True, "supported": True, "version": version}

    def is_blender_running(self):
        """Used by the persistent launch notice to know when to dismiss
        itself, since a first launch can take a long time waiting on
        pCloud rather than actually starting quickly."""
        if not HAS_PSUTIL:
            return {"ok": False, "detail": "psutil not available"}
        try:
            for proc in psutil.process_iter(["name"]):
                name = (proc.info.get("name") or "").lower()
                if name == "blender.exe":
                    return {"ok": True, "running": True}
            return {"ok": True, "running": False}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    def launch_blender(self):
        if platform.system() != "Windows":
            return {"ok": False, "detail": "Windows only for now"}

        paths = _resolve_blender_paths()
        if not paths:
            return {"ok": False, "detail": "Could not find a Blender build in the pipeline folder"}

        try:
            appdata = os.environ.get("APPDATA", os.path.expanduser("~"))
            resources_dir = os.path.join(appdata, "Blender Foundation", "Blender", "4.2")
            os.makedirs(resources_dir, exist_ok=True)

            env = os.environ.copy()
            env["BLENDER_USER_RESOURCES"] = resources_dir

            # Shared, read-only addons every artist gets automatically,
            # no per-user install. Additive only, if a shared-scripts
            # folder doesn't exist here yet, Blender just ignores the
            # unset path, this can't conflict with any other addon
            # loading mechanism already in place.
            root = get_pcloud_root()
            shared_scripts_dir = os.path.join(root, "02-pipeline", "apps", "blender", "shared-scripts")
            if os.path.isdir(shared_scripts_dir):
                env["BLENDER_SYSTEM_SCRIPTS"] = shared_scripts_dir
            # Lets Blender-side pipeline scripts know who is running it,
            # without asking again, since MNR Launcher already knows.
            env["MNR_CURRENT_USER"] = read_local_state().get("current_user") or ""

            _log(f"launch_blender: {paths['exe_path']}")
            subprocess.Popen(
                [paths["exe_path"], "--app-template", "MNR_Pipeline"],
                env=env,
                cwd=paths["blender_version_dir"],
            )
            return {"ok": True}
        except Exception as e:
            _log(f"launch_blender failed: {e}")
            return {"ok": False, "detail": str(e)}

    # --------------------------------------------------------
    # RawTherapee launch. Windows only for now. Same live-scan pattern
    # as Blender, no install step, since a genuinely portable build
    # works exactly like Blender's portable one. RT_SETTINGS/RT_CACHE
    # redirect config and cache to a writable per-user folder, since
    # the shared copy on pCloud is read-only. Deliberately does NOT
    # touch the "MultiUser" option some guides mention, a real bug
    # report found that setting can conflict with these two
    # environment variables.
    # --------------------------------------------------------

    def get_rawtherapee_info(self):
        if platform.system() != "Windows":
            return {"ok": False, "supported": False, "detail": "Windows only for now"}

        paths = _resolve_rawtherapee_paths()
        if not paths:
            return {"ok": False, "supported": True, "detail": "No RawTherapee build found in the pipeline folder"}

        version = _extract_rawtherapee_version(paths["rt_version_dir"])
        return {"ok": True, "supported": True, "version": version}

    def is_rawtherapee_running(self):
        if not HAS_PSUTIL:
            return {"ok": False, "detail": "psutil not available"}
        try:
            for proc in psutil.process_iter(["name"]):
                name = (proc.info.get("name") or "").lower()
                if name == "rawtherapee.exe":
                    return {"ok": True, "running": True}
            return {"ok": True, "running": False}
        except Exception as e:
            return {"ok": False, "detail": str(e)}

    def launch_rawtherapee(self):
        if platform.system() != "Windows":
            return {"ok": False, "detail": "Windows only for now"}

        paths = _resolve_rawtherapee_paths()
        if not paths:
            return {"ok": False, "detail": "Could not find a RawTherapee build in the pipeline folder"}

        try:
            appdata = os.environ.get("APPDATA", os.path.expanduser("~"))
            settings_dir = os.path.join(appdata, "RawTherapee", "config")
            cache_dir = os.path.join(appdata, "RawTherapee", "cache")
            os.makedirs(settings_dir, exist_ok=True)
            os.makedirs(cache_dir, exist_ok=True)

            # Copy the shared, pipeline-controlled defaults (options file,
            # default processing profile, ACEScg output ICC, etc) into this
            # artist's own writable config folder before every launch. This
            # is a merge, not a wipe, files that exist in both places get
            # refreshed from the master copy, but anything the artist has
            # added on their own that isn't part of the shared set is left
            # alone. The master itself lives outside artists' normal
            # working area on purpose, protected by being out of the way
            # rather than by file permissions, since RawTherapee needs to
            # be able to write to its own config folder to function at all.
            root = get_pcloud_root()
            master_config_dir = os.path.join(root, "02-pipeline", "colorManagement", "rawTherapeeDefaults")
            if os.path.isdir(master_config_dir):
                try:
                    shutil.copytree(master_config_dir, settings_dir, dirs_exist_ok=True)
                except Exception as e:
                    _log(f"launch_rawtherapee: config sync from {master_config_dir} failed: {e}")

            env = os.environ.copy()
            env["RT_SETTINGS"] = settings_dir
            env["RT_CACHE"] = cache_dir

            _log(f"launch_rawtherapee: {paths['exe_path']}")
            subprocess.Popen(
                [paths["exe_path"]],
                env=env,
                cwd=paths["rt_version_dir"],
            )
            return {"ok": True}
        except Exception as e:
            _log(f"launch_rawtherapee failed: {e}")
            return {"ok": False, "detail": str(e)}

    # --------------------------------------------------------
    # File browsing (native OS picker, since a webview cannot read the
    # local filesystem on its own) and the real Stop Motion publish
    # upload: copies and renames the chosen local files into
    # .../smAnim/export/publish/media/ following the MNR naming
    # convention.
    # --------------------------------------------------------

    def browse_files(self, multiple=True):
        """Opens a native file picker and returns the chosen absolute path(s)."""
        try:
            result = webview.windows[0].create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=multiple,
            )
            if not result:
                _log("browse_files: cancelled, nothing chosen")
                return {"ok": True, "paths": []}
            _log(f"browse_files: {len(result)} file(s) chosen")
            return {"ok": True, "paths": list(result)}
        except Exception as e:
            _log(f"browse_files failed: {e}")
            return {"ok": False, "detail": str(e)}

    def browse_folder(self):
        """Opens a native folder picker and returns the chosen absolute path."""
        try:
            result = webview.windows[0].create_file_dialog(webview.FOLDER_DIALOG)
            if not result:
                _log("browse_folder: cancelled, nothing chosen")
                return {"ok": True, "path": None}
            _log(f"browse_folder: {result[0]} chosen")
            return {"ok": True, "path": result[0]}
        except Exception as e:
            _log(f"browse_folder failed: {e}")
            return {"ok": False, "detail": str(e)}

    def resolve_path_to_parts(self, absolute_path, from_root=False):
        """
        Converts an absolute path, typed into an address bar, pasted,
        or picked via browse_folder, into the relative path parts the
        tree browsers use. Used by every folder browser's editable
        path bar. Returns ok:False with a plain-language reason when
        the path is outside the allowed root or doesn't exist, so the
        UI can show why it was rejected rather than just silently
        resetting.
        """
        root = get_pcloud_root()
        base_root = root if from_root else os.path.join(root, "01-projects")

        parts = _path_to_relative_parts(absolute_path, base_root)
        if parts is None:
            label = "the pCloud drive" if from_root else "01-projects"
            return {"ok": False, "detail": f"That path is outside {label}"}

        full = os.path.join(base_root, *parts) if parts else base_root
        if not os.path.isdir(full):
            return {"ok": False, "detail": "That folder does not exist"}

        return {"ok": True, "parts": parts}

    def upload_layer_publish(self, payload):
        """
        payload: {
          "shot_parts": [project, "03-shot", episode, sequence, shot],
          "base_name": "BFP102_SQ04_SH08_smAnim_gali01-main_v001",
          "mp4": {"enabled": bool, "path": str or null},
          "raw": {"enabled": bool, "paths": [str], "handle_front": int},
          "jpeg": {"enabled": bool, "paths": [str], "handle_front": int},
          "production_data": {"enabled": bool, "paths": [str]},
        }
        Copies (never moves) the selected local files into the shot's
        publish/media folder, renamed to match the MNR convention.
        Returns a per-section result summary.
        """
        try:
            root = get_pcloud_root()
            media_dir = os.path.join(
                root, "01-projects", *payload["shot_parts"],
                "smAnim", "export", "publish", "media",
            )
            os.makedirs(media_dir, exist_ok=True)
        except Exception as e:
            _log(f"upload_layer_publish: could not prepare media folder: {e}")
            return {"ok": False, "detail": f"Could not prepare the media folder: {e}"}

        base_name = payload["base_name"]
        _log(f"upload_layer_publish: starting {base_name}")
        results = {}

        # ---- mp4 / mov preview (single file) ----
        mp4 = payload.get("mp4") or {}
        if mp4.get("enabled") and mp4.get("path"):
            try:
                src = mp4["path"]
                ext = os.path.splitext(src)[1] or ".mp4"
                dest = os.path.join(media_dir, f"{base_name}{ext}")
                shutil.copy2(src, dest)
                results["mp4"] = {"ok": True, "detail": os.path.basename(dest)}
            except Exception as e:
                results["mp4"] = {"ok": False, "detail": str(e)}

        # ---- raw / jpeg image sequences ----
        for section_key in ("raw", "jpeg"):
            section = payload.get(section_key) or {}
            if not section.get("enabled") or not section.get("paths"):
                continue
            try:
                results[section_key] = self._copy_frame_sequence(media_dir, base_name, section)
            except Exception as e:
                results[section_key] = {"ok": False, "detail": str(e)}

        # ---- production data (dump, original names, no renaming) ----
        prod = payload.get("production_data") or {}
        if prod.get("enabled") and prod.get("paths"):
            try:
                prod_dir = os.path.join(media_dir, f"{base_name}-productionData")
                os.makedirs(prod_dir, exist_ok=True)
                copied = 0
                for src in prod["paths"]:
                    dest = os.path.join(prod_dir, os.path.basename(src))
                    shutil.copy2(src, dest)
                    copied += 1
                results["production_data"] = {"ok": True, "detail": f"{copied} file(s)"}
            except Exception as e:
                results["production_data"] = {"ok": False, "detail": str(e)}

        _log(f"upload_layer_publish: finished {base_name}: {results}")
        return {"ok": True, "results": results}

    def _copy_frame_sequence(self, media_dir, base_name, section):
        """
        Renames an image sequence to <base_name>.<frame>.<ext> inside a
        subfolder named after the file type (e.g. cr3, jpg), starting
        the frame count at 1001 minus the front handle, exactly like:
        handle 3/6 means their frame 1 becomes our frame 998, and their
        4th frame becomes our frame 1001.
        """
        paths = section["paths"]
        handle_front = int(section.get("handle_front") or 0)
        ext = os.path.splitext(paths[0])[1].lstrip(".").lower() or "seq"

        seq_folder = os.path.join(media_dir, base_name, ext)
        os.makedirs(seq_folder, exist_ok=True)

        start_frame = 1001 - handle_front
        copied = 0
        for i, src in enumerate(paths):
            frame_number = start_frame + i
            src_ext = os.path.splitext(src)[1]
            dest_name = f"{base_name}.{frame_number:04d}{src_ext}"
            dest = os.path.join(seq_folder, dest_name)
            shutil.copy2(src, dest)
            copied += 1

        return {"ok": True, "detail": f"{copied} frame(s) into {ext}/"}


# ------------------------------------------------------------
# Window bootstrap
# ------------------------------------------------------------

_REFRESH_STATE = {"requested": False}
_SHELL_UPDATE_STATE = {"requested": False}

def _resolve_index_html():
    here = os.path.dirname(os.path.abspath(__file__))
    web_dir = os.path.join(here, "web")
    original_path = os.path.join(web_dir, "index.html")

    # Cache-busting: the WebView engine can cache app.js/style.css by URL
    # even though the underlying file was just replaced by a fresh GitHub
    # fetch. Giving each asset a fresh query string every launch forces a
    # real reload instead of silently serving a stale cached copy.
    try:
        with open(original_path, "r", encoding="utf-8") as f:
            html = f.read()
        cache_bust = str(int(time.time()))
        html = html.replace('href="style.css"', f'href="style.css?v={cache_bust}"')
        html = html.replace('src="app.js"', f'src="app.js?v={cache_bust}"')
        bust_path = os.path.join(web_dir, "_index_bust.html")
        with open(bust_path, "w", encoding="utf-8") as f:
            f.write(html)
        return bust_path
    except Exception:
        return original_path


def main():
    api = MnrApi()
    webview.create_window(
        APP_NAME,
        _resolve_index_html(),
        js_api=api,
        width=1100,
        height=750,
        min_size=(900, 600),
    )
    webview.start()

    # If a shell update was applied, exit with the code the bootstrap
    # shell recognizes as "the relay is taking over, exit for good"
    # rather than looping back to keep running. Checked first since
    # it takes priority over a normal refresh.
    if _SHELL_UPDATE_STATE["requested"]:
        sys.exit(44)

    # If the Refresh button was used, exit with a code the bootstrap
    # shell recognizes as "fetch the latest code and run me again"
    # instead of a normal quit. Running main.py directly (no shell)
    # just exits normally either way.
    if _REFRESH_STATE["requested"]:
        sys.exit(42)


if __name__ == "__main__":
    main()
