@echo off
setlocal

set "MNR_ROOT=%~dp0"
set "PYTHONW=%MNR_ROOT%portable_python\pythonw.exe"
set "MAIN_PY=%MNR_ROOT%app\main.py"
set "RELAY_VBS=%MNR_ROOT%mnr_launch_relay.vbs"

if not exist "%PYTHONW%" (
    echo Could not find portable_python\pythonw.exe next to this launcher.
    echo Expected: %PYTHONW%
    echo See SETUP_NOTES.md for how to set that folder up.
    pause
    exit /b 1
)

if not exist "%MAIN_PY%" (
    echo Could not find app\main.py next to this launcher.
    echo Expected: %MAIN_PY%
    pause
    exit /b 1
)

wscript.exe "%RELAY_VBS%" "%PYTHONW%" "%MAIN_PY%"
