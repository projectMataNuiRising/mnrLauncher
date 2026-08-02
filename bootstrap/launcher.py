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

GITHUB_OWNER = "projectMataNuiRising"
GITHUB_REPO = "mnrLauncher"
GITHUB_BRANCH = "main"
ZIP_URL = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/archive/refs/heads/{GITHUB_BRANCH}.zip"
LATEST_RELEASE_API_URL = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"

# Special exit code main.py uses to mean "refetch and run me again"
# (set when the user clicks the Refresh button), instead of a normal quit.
REFRESH_EXIT_CODE = 42


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


def fetch_latest_app(cache_dir, status_callback=None):
    """
    Downloads the current GitHub code and replaces the cached app/
    folder with it. Returns True if the cache was updated, False if it
    fell back to whatever was already cached (e.g. no internet, or the
    download/extract failed partway through).
    """
    def report(msg):
        if status_callback:
            status_callback(msg)
        else:
            print(f"[MNR] {msg}")

    report(f"Checking for the latest app code from {GITHUB_OWNER}/{GITHUB_REPO}...")

    tmp_zip = os.path.join(tempfile.gettempdir(), "mnr_launcher_latest.zip")
    tmp_extract = os.path.join(tempfile.gettempdir(), "mnr_launcher_extract")

    try:
        urllib.request.urlretrieve(ZIP_URL, tmp_zip)
    except (urllib.error.URLError, OSError) as e:
        report(f"Could not reach GitHub ({e}), using the last downloaded copy.")
        return False

    try:
        if os.path.isdir(tmp_extract):
            shutil.rmtree(tmp_extract)
        with zipfile.ZipFile(tmp_zip, "r") as zf:
            zf.extractall(tmp_extract)

        # GitHub's branch-zip nests everything under "<repo>-<branch>/"
        nested_root = os.path.join(tmp_extract, f"{GITHUB_REPO}-{GITHUB_BRANCH}")
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


def run_cached_app(cache_dir):
    """
    Runs the cached app/main.py exactly as if it had been launched
    directly, so its "if __name__ == '__main__':" guard fires normally.
    It still imports pywebview/psutil from THIS already-running process,
    those are bundled in by PyInstaller, only the app logic itself came
    fresh from GitHub.
    """
    main_py = os.path.join(cache_dir, "app", "main.py")
    if not os.path.isfile(main_py):
        print("[MNR] No app code available, and nothing cached from a previous run.")
        print("[MNR] Check your internet connection and try again.")
        input("Press Enter to close...")
        sys.exit(1)

    runpy.run_path(main_py, run_name="__main__")


def get_boot_log_path(cache_dir):
    return os.path.join(cache_dir, "boot_log.txt")


def _append_boot_log(cache_dir, msg):
    try:
        with open(get_boot_log_path(cache_dir), "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def check_and_apply_shell_update(status_callback=None):
    """
    Checks the latest GitHub Release for a newer compiled shell than
    this one. If found, downloads the new .exe and arranges for it to
    replace this running one and relaunch, once this process exits.
    Only does anything when actually running as a compiled PyInstaller
    build, plain `python launcher.py` for local testing never self-updates.
    Returns True if an update was found and is being applied (caller
    should exit right after), False otherwise.
    """
    def report(msg):
        if status_callback:
            status_callback(msg)
        else:
            print(f"[MNR] {msg}")

    if not getattr(sys, "frozen", False):
        return False

    try:
        req = urllib.request.Request(
            LATEST_RELEASE_API_URL,
            headers={"Accept": "application/vnd.github+json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            release = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        report(f"Could not check for a shell update ({e}), skipping.")
        return False

    latest_tag = (release.get("tag_name") or "").lstrip("v")
    if not latest_tag or latest_tag == SHELL_VERSION:
        report(f"Shell is up to date (v{SHELL_VERSION}).")
        return False

    asset_url = None
    for asset in release.get("assets", []):
        if asset.get("name", "").lower().endswith(".exe"):
            asset_url = asset.get("browser_download_url")
            break

    if not asset_url:
        report(f"Newer shell v{latest_tag} found but it has no .exe attached, skipping.")
        return False

    report(f"Newer shell version available (v{latest_tag}), downloading...")

    current_exe = sys.executable
    new_exe_path = current_exe + ".new"

    try:
        urllib.request.urlretrieve(asset_url, new_exe_path)
    except Exception as e:
        report(f"Shell update download failed ({e}), continuing with current version.")
        return False

    report("Update downloaded, restarting...")
    _spawn_update_relay(current_exe, new_exe_path)
    return True


def _spawn_update_relay(current_exe, new_exe_path):
    """
    Writes a small VBScript that waits for this process to fully exit
    (Windows can't overwrite an exe that's still running), then swaps
    the new file into place and relaunches it. Retries the swap a few
    times with short gaps, since a single fixed wait isn't always
    enough, either this process taking a moment longer to fully let go
    of the file, or Windows/antivirus briefly touching the freshly
    written one. Runs with zero visible window, same trick as
    mnr_launch_relay.vbs.
    """
    relay_path = os.path.join(tempfile.gettempdir(), "mnr_shell_update_relay.vbs")
    script_lines = [
        'Set objShell = CreateObject("WScript.Shell")',
        'Set objFSO = CreateObject("Scripting.FileSystemObject")',
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
        "WScript.Sleep 500",
        f'objShell.Run Chr(34) & "{current_exe}" & Chr(34), 0, False',
    ]
    with open(relay_path, "w", encoding="utf-8") as f:
        f.write("\n".join(script_lines))

    subprocess.Popen(["wscript.exe", relay_path])


def main():
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

    if check_and_apply_shell_update(status_callback=log):
        return  # a newer .exe is about to take over, this process is done

    os.environ["MNR_SHELL_VERSION"] = SHELL_VERSION

    while True:
        fetch_latest_app(cache_dir, status_callback=log)
        try:
            run_cached_app(cache_dir)
        except SystemExit as e:
            if e.code == REFRESH_EXIT_CODE:
                log("Refresh requested, fetching again...")
                continue
            raise
        break


if __name__ == "__main__":
    main()
