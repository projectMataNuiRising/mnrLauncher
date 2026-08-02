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
import json
import time
import shutil
import platform
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


# ------------------------------------------------------------
# API exposed to the web UI (called as window.pywebview.api.X(...) in JS)
# ------------------------------------------------------------

class MnrApi:

    def get_app_info(self):
        return {"name": APP_NAME, "version": APP_VERSION, "shell_version": SHELL_VERSION}

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

    def list_dir_entries(self, relative_parts, show_hidden=False):
        """
        relative_parts is a list of path segments under 01-projects.
        Returns files and folders (folders first), each tagged with
        whether it is a "#" hidden pipeline folder.
        """
        root = get_pcloud_root()
        base = os.path.join(root, "01-projects", *relative_parts)
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

    def open_path(self, relative_parts):
        """Double-click behaviour: open a file or folder with the OS default app."""
        root = get_pcloud_root()
        full = os.path.join(root, "01-projects", *relative_parts)
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

    # If the Refresh button was used, exit with a code the bootstrap
    # shell recognizes as "fetch the latest code and run me again"
    # instead of a normal quit. Running main.py directly (no shell)
    # just exits normally either way.
    if _REFRESH_STATE["requested"]:
        sys.exit(42)


if __name__ == "__main__":
    main()
