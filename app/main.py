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
import platform

import webview

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

APP_NAME = "MNR Launcher"
APP_VERSION = "0.1.0-stage1"

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
        return {"name": APP_NAME, "version": APP_VERSION}

    def check_drive(self):
        """
        Step 1 of the boot checklist: is the pCloud Drive / network
        path even present and readable.
        """
        root = get_pcloud_root()
        found = os.path.isdir(root)
        projects_ok = found and os.path.isdir(os.path.join(root, "01-projects"))
        ok = bool(found and projects_ok)
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
        return self._list_folder_names(base)

    def list_episodes(self, project):
        """Dropdown 2: folder names under {project}\\03-shot."""
        root = get_pcloud_root()
        base = os.path.join(root, "01-projects", project, "03-shot")
        return self._list_folder_names(base)

    def list_children(self, relative_parts):
        """
        Dropdowns 3 and 4 (and anything deeper): lists whatever folders
        sit one level under the given path. relative_parts is a list of
        path segments under 01-projects, e.g. ["BFP", "03-shot", "102", "SQ04"].
        """
        root = get_pcloud_root()
        base = os.path.join(root, "01-projects", *relative_parts)
        return self._list_folder_names(base)

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
        _REFRESH_STATE["requested"] = True
        try:
            webview.windows[0].destroy()
        except Exception:
            pass
        return {"ok": True}


# ------------------------------------------------------------
# Window bootstrap
# ------------------------------------------------------------

_REFRESH_STATE = {"requested": False}

def _resolve_index_html():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "web", "index.html")


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
