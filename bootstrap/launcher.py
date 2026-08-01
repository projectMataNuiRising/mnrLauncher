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
# ------------------------------------------------------------

GITHUB_OWNER = "projectMataNuiRising"
GITHUB_REPO = "mnrLauncher"
GITHUB_BRANCH = "main"
ZIP_URL = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/archive/refs/heads/{GITHUB_BRANCH}.zip"

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


def main():
    cache_dir = get_cache_dir()
    while True:
        fetch_latest_app(cache_dir)
        try:
            run_cached_app(cache_dir)
        except SystemExit as e:
            if e.code == REFRESH_EXIT_CODE:
                continue  # Refresh button was used, loop back and refetch
            raise
        break


if __name__ == "__main__":
    main()
