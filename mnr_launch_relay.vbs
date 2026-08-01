' MNR Launch Relay
' -----------------
' Launches a program with zero visible console/window flash.
' Called from launch_mnr.bat like this:
'   wscript.exe mnr_launch_relay.vbs "<path to exe>" "<path to script>"
'
' This is a static file (not generated on the fly), so there is no
' batch-escaping to worry about, the .bat just passes paths in as args.

Set objShell = CreateObject("WScript.Shell")
Set objArgs = WScript.Arguments

exePath = objArgs(0)
scriptPath = objArgs(1)

cmdLine = Chr(34) & exePath & Chr(34) & " " & Chr(34) & scriptPath & Chr(34)
objShell.Run cmdLine, 0, False
