# MNR Launcher, Stage 1/2a setup notes

This is the skeleton plus the Stop Motion Upload nav cascade and folder
explorer. The upload logic itself (layers, renaming, frame counts) comes
in a later stage.

## One-time setup (do this once, on one machine, not per artist)

Easiest path: run `bootstrap_portable_python.ps1` (right click it, "Run
with PowerShell"). It downloads a portable Python, enables pip, and
installs pywebview/pythonnet/psutil into a `portable_python` folder next
to `launch_mnr.bat`. Takes a minute or two, needs internet on this one
machine only.

Manual path, if you'd rather not run that script:

1. Download an embeddable/portable Python for Windows (python.org, "Windows
   embeddable package, 64-bit" works, or a full portable Python distro).
   Put it in a folder named `portable_python` right next to `launch_mnr.bat`.

2. Install the needed packages into that portable Python:
   ```
   portable_python\python.exe -m pip install -r requirements.txt
   ```
   (The embeddable package needs pip enabled first, there are short guides
   online for "enable pip in python embeddable package" if `pip` isn't
   already there.)

3. Make sure `portable_python\pythonw.exe` exists, it ships alongside
   `python.exe` in normal CPython distributions. That is what the launcher
   uses so no console window ever appears.

## Using it after setup

Double-click `launch_mnr.bat`. First run it will ask you to pick your
name from the 00-temp list, after that it remembers you on this machine.
No downloads, no installs, this is what every artist experiences.

## Why this launcher looks different from the old VBScript relay pattern

The old pattern generated a temp VBScript on the fly from inside the batch
file, which needed careful escaping of `&`, `(`, and `)` characters. This
version ships `mnr_launch_relay.vbs` as a plain static file, and the batch
file just passes it two paths as arguments. Same end result (zero console
flash), fewer places for batch/VBS escaping bugs to hide.

## Notes

- Needs the Microsoft Edge WebView2 Runtime for the window to render. This
  is already installed on basically all Windows 10/11 machines, if one is
  missing it, pywebview falls back to an old, ugly renderer, installing
  WebView2 Runtime fixes it.
- The pCloud "still transferring" indicator is a best-effort guess, there
  is no official pCloud API for this. It watches the pCloud process's
  disk activity. Treat it as approximate, not a guarantee.
- Everything in `app/` is meant to live on the shared network drive so
  edits are instant for every user, same idea as the Blender MNR addons.
  `launch_mnr.bat`, `mnr_launch_relay.vbs`, and `portable_python` are the
  only per-machine parts.
