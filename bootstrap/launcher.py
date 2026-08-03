"""
MNR Launcher - bootstrap/launcher.py
--------------------------------------
This is the ONLY part of MNR Launcher that actually gets installed on a
user's machine. Its whole job: fetch the latest app code from GitHub,
then run it. When you push a change to the mnrLauncher GitHub repo,
every user gets it automatically the next time they open the app or
click Refresh, nothing to reinstall.

This file gets compiled into a single .exe (Windows) / .app (Mac) with
PyInstaller, which bundles Python plus pywebview/pythonnet/psutil into
that one file. Only the actual app logic (app/main.py, app/web/*) gets
re-downloaded each run, not the interpreter or the libraries.

If GitHub can't be reached (no internet), it falls back to whatever
was cached from the last successful run instead of refusing to open.
"""

import os
import sys
import shutil
import zipfile
import platform
import runpy
import tempfile
import subprocess
import urllib.request
import urllib.error

# ------------------------------------------------------------
# These imports are NOT used directly in this file. They exist only
# so PyInstaller's dependency scanner sees them and bundles them into
# the compiled .exe. main.py (fetched from GitHub at runtime, not
# visible to PyInstaller at build time) needs all of these. If main.py
# ever starts using a new library that isn't already imported
# somewhere in this file, add it here too, or the compiled app will
# crash with a ModuleNotFoundError for it.
# ------------------------------------------------------------
import json          # noqa: F401
import time          # noqa: F401
import webview        # noqa: F401
try:
    import psutil     # noqa: F401
except ImportError:
    pass
try:
    import requests   # noqa: F401  -- pre-bundled for future Kitsu API use
except ImportError:
    pass
try:
    from PIL import Image  # noqa: F401  -- pre-bundled for future image/thumbnail work
except ImportError:
    pass
try:
    import send2trash  # noqa: F401  -- pre-bundled for safer "delete original" later
except ImportError:
    pass
# ------------------------------------------------------------

# Replaced with a real build number by the GitHub Actions workflow at
# compile time. Stays as this placeholder when just running
# `python launcher.py` directly for local testing, which is fine, the
# self-update check below only ever runs in a compiled build anyway.
SHELL_VERSION = "0.0.0-dev"


def is_running_from_cloud_drive():
    """
    Checks whether this exe is currently running from inside the
    pCloud Drive mount (P:\\ on Windows, ~/pCloud Drive on Mac) instead
    of a normal local folder. Running the installed shell itself from
    the synced drive is exactly what NOT to do: the self-update
    mechanism deletes and replaces this exe file, and if several
    people are all pointed at that same shared file, that swap can
    fail, collide, or corrupt things for everyone. Only project files
    belong on pCloud, this app itself should live locally.
    """
    if not getattr(sys, "frozen", False):
        return False
    try:
        exe_path = os.path.abspath(sys.executable)
    except Exception:
        return False

    system = platform.system()
    if system == "Windows":
        return exe_path[:2].upper() == "P:"
    if system == "Darwin":
        return "pcloud drive" in exe_path.lower()
    return False


def warn_and_exit_if_on_cloud_drive():
    if not is_running_from_cloud_drive():
        return
    message = (
        "MNR Launcher is running from inside your pCloud Drive.\n\n"
        "Please copy this file to your Desktop (or anywhere else on "
        "your own computer) and run it from there instead.\n\n"
        "Running it directly from pCloud can break auto-updates and "
        "cause conflicts with other users sharing that same file.\n\n"
        "This will now close."
    )
    try:
        if platform.system() == "Windows":
            import ctypes
            MB_ICONWARNING = 0x30
            ctypes.windll.user32.MessageBoxW(0, message, "MNR Launcher", MB_ICONWARNING)
        elif platform.system() == "Darwin":
            safe_message = message.replace('"', '\\"')
            os.system(
                f'osascript -e \'display dialog "{safe_message}" '
                f'with title "MNR Launcher" buttons {{"OK"}} default button "OK" '
                f'with icon caution\''
            )
    except Exception:
        pass
    sys.exit(1)

GITHUB_OWNER = "projectMataNuiRising"
GITHUB_REPO = "mnrLauncher"
LATEST_RELEASE_API_URL = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"
ALL_RELEASES_API_URL = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases"

# Special exit code main.py uses to mean "refetch and run me again"
# (set when the user clicks Refresh, or flips a dev-mode toggle),
# instead of a normal quit.
REFRESH_EXIT_CODE = 42

# Used when the user clicks "Update Now" on the forced update gate:
# means "a shell update was applied, exit for good, the relay is
# taking over", as opposed to REFRESH_EXIT_CODE which just means
# "refetch app code and keep running".
SHELL_UPDATE_EXIT_CODE = 44


def get_dev_settings_path(cache_dir):
    return os.path.join(cache_dir, "dev_settings.json")


def read_dev_settings(cache_dir):
    """
    Two independent toggles, set from inside the running app's Debug
    panel: whether to pull app code from the dev branch instead of
    main, and whether to self-update from dev shell builds instead of
    the normal production release. Defaults to both off (production)
    if this file doesn't exist yet, or can't be read for any reason,
    a real user should never end up on a dev track by accident.
    """
    try:
        with open(get_dev_settings_path(cache_dir), "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "dev_app_code": bool(data.get("dev_app_code", False)),
            "dev_exe": bool(data.get("dev_exe", False)),
        }
    except Exception:
        return {"dev_app_code": False, "dev_exe": False}


def get_cache_dir():
    """
    Per-machine folder where the fetched app code is cached. This is
    just a local cache that gets overwritten from GitHub each run, not
    something shared or meant to be edited by hand.
    """
    system = platform.system()
    if system == "Windows":
        base = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    elif system == "Darwin":
        base = os.path.expanduser("~/Library/Application Support")
    else:
        base = os.path.expanduser("~/.cache")

    cache_dir = os.path.join(base, "MNR_Launcher", "app_cache")
    os.makedirs(cache_dir, exist_ok=True)
    return cache_dir


def fetch_latest_app(cache_dir, branch="main", status_callback=None):
    """
    Downloads the current GitHub code for the given branch and
    replaces the cached app/ folder with it. Returns True if the cache
    was updated, False if it fell back to whatever was already cached
    (e.g. no internet, or the download/extract failed partway through).
    """
    def report(msg):
        if status_callback:
            status_callback(msg)
        else:
            print(f"[MNR] {msg}")

    report(f"Checking for the latest app code from {GITHUB_OWNER}/{GITHUB_REPO} ({branch})...")

    zip_url = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/archive/refs/heads/{branch}.zip"
    tmp_zip = os.path.join(tempfile.gettempdir(), "mnr_launcher_latest.zip")
    tmp_extract = os.path.join(tempfile.gettempdir(), "mnr_launcher_extract")

    try:
        urllib.request.urlretrieve(zip_url, tmp_zip)
    except (urllib.error.URLError, OSError) as e:
        report(f"Could not reach GitHub ({e}), using the last downloaded copy.")
        return False

    try:
        if os.path.isdir(tmp_extract):
            shutil.rmtree(tmp_extract)
        with zipfile.ZipFile(tmp_zip, "r") as zf:
            zf.extractall(tmp_extract)

        # GitHub's branch-zip nests everything under "<repo>-<branch>/"
        nested_root = os.path.join(tmp_extract, f"{GITHUB_REPO}-{branch}")
        fetched_app_dir = os.path.join(nested_root, "app")

        if not os.path.isdir(fetched_app_dir):
            report("Downloaded zip did not contain an app/ folder, keeping the old cache.")
            return False

        target_app_dir = os.path.join(cache_dir, "app")
        if os.path.isdir(target_app_dir):
            shutil.rmtree(target_app_dir)
        shutil.copytree(fetched_app_dir, target_app_dir)

        report("App code updated.")
        return True

    except Exception as e:
        report(f"Update failed ({e}), using the last downloaded copy.")
        return False

    finally:
        for path in (tmp_zip, tmp_extract):
            try:
                if os.path.isfile(path):
                    os.remove(path)
                elif os.path.isdir(path):
                    shutil.rmtree(path)
            except Exception:
                pass


def run_cached_app(cache_dir, update_info=None):
    """
    Runs the cached app/main.py exactly as if it had been launched
    directly, so its "if __name__ == '__main__':" guard fires normally.
    It still imports pywebview/psutil from THIS already-running process,
    those are bundled in by PyInstaller, only the app logic itself came
    fresh from GitHub.

    update_info (a dict with version/asset_url, or None) and a
    matching apply-callback are injected directly into main.py's
    global namespace before it runs, so its UI can show a forced
    "Update Now" gate and, once clicked, trigger the actual download
    and swap without main.py needing to know anything about how that
    works under the hood.
    """
    main_py = os.path.join(cache_dir, "app", "main.py")
    if not os.path.isfile(main_py):
        print("[MNR] No app code available, and nothing cached from a previous run.")
        print("[MNR] Check your internet connection and try again.")
        input("Press Enter to close...")
        sys.exit(1)

    def apply_update_callback():
        return _do_apply_shell_update(update_info, status_callback=lambda m: _append_boot_log(cache_dir, m))

    injected_globals = {
        "_mnr_pending_shell_update": update_info,
        "_mnr_apply_shell_update_callback": apply_update_callback,
    }
    runpy.run_path(main_py, run_name="__main__", init_globals=injected_globals)


def get_boot_log_path(cache_dir):
    return os.path.join(cache_dir, "boot_log.txt")


def _append_boot_log(cache_dir, msg):
    try:
        with open(get_boot_log_path(cache_dir), "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def check_for_shell_update(dev_mode=False, status_callback=None):
    """
    Checks GitHub Releases for a newer compiled shell than this one.
    In normal mode, checks the latest production release (tag v<N>).
    In dev mode, checks the latest pre-release instead (tag dev-<N>),
    which real users' apps never see or pick up, since pre-releases
    never count as "Latest". Only checks, never downloads anything,
    that only happens once the user explicitly clicks "Update Now" on
    the forced gate in the app itself. Only does anything when
    actually running as a compiled PyInstaller build, plain
    `python launcher.py` for local testing never sees updates. Returns
    a dict with version/asset_url/track if an update is available, or
    None otherwise.
    """
    def report(msg):
        if status_callback:
            status_callback(msg)
        else:
            print(f"[MNR] {msg}")

    if not getattr(sys, "frozen", False):
        return None

    try:
        if dev_mode:
            req = urllib.request.Request(
                ALL_RELEASES_API_URL,
                headers={"Accept": "application/vnd.github+json"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                releases = json.loads(resp.read().decode("utf-8"))
            release = next((r for r in releases if r.get("prerelease")), None)
            if not release:
                report("No dev build published yet.")
                return None
        else:
            req = urllib.request.Request(
                LATEST_RELEASE_API_URL,
                headers={"Accept": "application/vnd.github+json"},
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                release = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        report(f"Could not check for a shell update ({e}), skipping.")
        return None

    raw_tag = release.get("tag_name") or ""
    latest_tag = raw_tag[4:] if raw_tag.startswith("dev-") else raw_tag.lstrip("v")
    track_label = "dev" if dev_mode else "main"
    if not latest_tag or latest_tag == SHELL_VERSION:
        report(f"Shell is up to date ({track_label} v{SHELL_VERSION}).")
        return None

    asset_url = None
    for asset in release.get("assets", []):
        if asset.get("name", "").lower().endswith(".exe"):
            asset_url = asset.get("browser_download_url")
            break

    if not asset_url:
        report(f"Newer {track_label} shell v{latest_tag} found but it has no .exe attached, skipping.")
        return None

    report(f"Newer {track_label} shell version available (v{latest_tag}).")
    return {"version": latest_tag, "asset_url": asset_url, "track": track_label}


def _do_apply_shell_update(update_info, status_callback=None):
    """
    The actual download-and-swap, only ever called from the injected
    callback main.py's "Update Now" button triggers, never
    automatically. No visible window of its own needed anymore, the
    app's own UI (the forced gate) shows the in-progress state now.
    """
    def report(msg):
        if status_callback:
            status_callback(msg)
        else:
            print(f"[MNR] {msg}")

    if not update_info:
        return False

    current_exe = sys.executable
    new_exe_path = current_exe + ".new"

    try:
        urllib.request.urlretrieve(update_info["asset_url"], new_exe_path)
    except Exception as e:
        report(f"Shell update download failed ({e}).")
        return False

    report("Update downloaded, restarting...")
    _refresh_windows_icon_cache()
    _spawn_update_relay(current_exe, new_exe_path)
    return True



def _refresh_windows_icon_cache():
    """
    Windows aggressively caches file icons per path, so even after a
    genuinely different icon is compiled into the exe at this same
    path, Explorer/taskbar can keep showing the old cached one. This
    calls Windows' own built-in, Microsoft-signed cache-clearing tool
    rather than manually touching the icon cache database or
    restarting Explorer, since a legitimate signed utility doing this
    is far less likely to raise any suspicion than an app reaching
    into Explorer's internals itself.
    """
    if platform.system() != "Windows":
        return
    try:
        subprocess.Popen(
            ["ie4uinit.exe", "-ClearIconCache"],
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except Exception:
        pass


def _spawn_update_relay(current_exe, new_exe_path):
    """
    Writes a small VBScript that waits for this process to fully exit
    (Windows can't overwrite an exe that's still running), swaps the
    new file into place, then relaunches it. Retries the swap a few
    times with short gaps, and after launching, actually checks that
    the new process is really running and retries the launch itself if
    not, since a brand new unsigned exe often gets briefly held up by
    antivirus real-time scanning on its very first run right after
    being written, which shows up as a misleading "Failed to load
    Python DLL" error rather than anything actually wrong with the
    build. Runs with zero visible window, same trick as
    mnr_launch_relay.vbs.
    """
    exe_name = os.path.basename(current_exe)
    relay_path = os.path.join(tempfile.gettempdir(), "mnr_shell_update_relay.vbs")
    script_lines = [
        'Set objShell = CreateObject("WScript.Shell")',
        'Set objFSO = CreateObject("Scripting.FileSystemObject")',
        'Set objWMI = GetObject("winmgmts:\\\\.\\root\\cimv2")',
        "WScript.Sleep 3000",
        "swapped = False",
        "For attempt = 1 To 6",
        "  On Error Resume Next",
        "  Err.Clear",
        f'  objFSO.DeleteFile "{current_exe}", True',
        "  didDelete = (Err.Number = 0)",
        "  Err.Clear",
        f'  If didDelete Then objFSO.MoveFile "{new_exe_path}", "{current_exe}"',
        "  If didDelete And Err.Number = 0 Then swapped = True",
        "  On Error Goto 0",
        "  If swapped Then Exit For",
        "  WScript.Sleep 1500",
        "Next",
        # Give antivirus real-time scanning a real chance to clear the
        # freshly written file before the first execution attempt.
        "WScript.Sleep 4000",
        f'exeName = "{exe_name}"',
        "launched = False",
        "For launchAttempt = 1 To 3",
        f'  objShell.Run Chr(34) & "{current_exe}" & Chr(34), 0, False',
        "  WScript.Sleep 2500",
        "  Set colProcesses = objWMI.ExecQuery(\"Select * from Win32_Process Where Name = '\" & exeName & \"'\")",
        "  If colProcesses.Count > 0 Then",
        "    launched = True",
        "    Exit For",
        "  End If",
        "  WScript.Sleep 2000",
        "Next",
    ]
    with open(relay_path, "w", encoding="utf-8") as f:
        f.write("\n".join(script_lines))

    subprocess.Popen(["wscript.exe", relay_path])


def main():
    warn_and_exit_if_on_cloud_drive()

    cache_dir = get_cache_dir()

    # Fresh log each launch, main.py reads this on startup so a Debug
    # panel can show whether the GitHub fetch actually succeeded, since
    # this whole phase happens before the window even opens.
    try:
        with open(get_boot_log_path(cache_dir), "w", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] MNR Launcher shell starting (v{SHELL_VERSION})...\n")
    except Exception:
        pass

    def log(msg):
        _append_boot_log(cache_dir, msg)

    while True:
        # Read fresh every loop, not just once, since a dev toggle
        # flipped from inside the app writes here and then triggers
        # this exact same refresh cycle to pick the new value up.
        dev_settings = read_dev_settings(cache_dir)

        # Only checks, never downloads. main.py's own UI shows a forced
        # "Update Now" gate if this is non-None, the actual download
        # only happens once that button is clicked.
        update_info = check_for_shell_update(dev_mode=dev_settings["dev_exe"], status_callback=log)

        os.environ["MNR_SHELL_VERSION"] = SHELL_VERSION
        os.environ["MNR_DEV_APP_CODE"] = "1" if dev_settings["dev_app_code"] else "0"
        os.environ["MNR_DEV_EXE"] = "1" if dev_settings["dev_exe"] else "0"

        app_branch = "dev" if dev_settings["dev_app_code"] else "main"
        fetch_latest_app(cache_dir, branch=app_branch, status_callback=log)

        try:
            run_cached_app(cache_dir, update_info=update_info)
        except SystemExit as e:
            if e.code == REFRESH_EXIT_CODE:
                log("Refresh requested, fetching again...")
                continue
            if e.code == SHELL_UPDATE_EXIT_CODE:
                log("Shell update applied, handing off to the new version...")
                return
            raise
        break


if __name__ == "__main__":
    main()
