Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
' The 0 at the end is the magic command that tells Windows to hide the window completely
WshShell.Run chr(34) & scriptDir & "\start.bat" & Chr(34), 0
Set WshShell = Nothing
Set fso = Nothing