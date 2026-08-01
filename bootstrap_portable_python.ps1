<#
MNR Launcher - Bootstrap Portable Python
------------------------------------------
Run this ONCE to build the portable_python folder that MNR Launcher needs.
This is a one-time setup step for whoever is building/updating the tool,
not something every artist has to do. Once portable_python exists next to
launch_mnr.bat, everyone else just double-clicks the launcher, nothing to
download, nothing to install.

Usage:
    Right click this file, choose "Run with PowerShell"
    (or open PowerShell in this folder and run: .\bootstrap_portable_python.ps1)

Needs internet access on THIS machine, only for this one-time setup run.
If Windows blocks the script: right click it, Properties, check "Unblock",
then try again.
#>

$ErrorActionPreference = "Stop"

$MnrRoot = $PSScriptRoot
$PortableDir = Join-Path $MnrRoot "portable_python"
$PythonVersion = "3.11.9"
$ZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$ZipPath = Join-Path $MnrRoot "python_embed_temp.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$GetPipPath = Join-Path $PortableDir "get-pip.py"
$RequirementsPath = Join-Path $MnrRoot "requirements.txt"

function Write-Step($text) {
    Write-Host "[MNR] $text"
}

Write-Step "Setting up portable Python $PythonVersion..."

if (Test-Path (Join-Path $PortableDir "pythonw.exe")) {
    Write-Step "[OK] portable_python already looks set up (pythonw.exe found)."
    Write-Step "Delete the portable_python folder first if you want to rebuild it."
    exit 0
}

New-Item -ItemType Directory -Force -Path $PortableDir | Out-Null

Write-Step "Downloading Python embeddable package..."
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath

Write-Step "Extracting..."
Expand-Archive -Path $ZipPath -DestinationPath $PortableDir -Force
Remove-Item $ZipPath -Force

Write-Step "Enabling pip and site-packages..."
$pthFile = Get-ChildItem -Path $PortableDir -Filter "*._pth" | Select-Object -First 1
if (-not $pthFile) {
    Write-Step "[FAIL] Could not find the ._pth file, something about the embeddable zip changed."
    exit 1
}
(Get-Content $pthFile.FullName) -replace '^#import site', 'import site' | Set-Content $pthFile.FullName

Write-Step "Downloading pip installer..."
Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipPath

Write-Step "Installing pip..."
& (Join-Path $PortableDir "python.exe") $GetPipPath --no-warn-script-location
Remove-Item $GetPipPath -Force

Write-Step "Installing required packages (pywebview, pythonnet, psutil)..."
& (Join-Path $PortableDir "python.exe") -m pip install -r $RequirementsPath --no-warn-script-location

if (Test-Path (Join-Path $PortableDir "pythonw.exe")) {
    Write-Step "[OK] portable_python is ready."
    Write-Step "You can now double-click launch_mnr.bat"
} else {
    Write-Step "[FAIL] pythonw.exe is missing, something went wrong above, scroll up to see which step failed."
}
