Option Explicit

Dim arguments
Dim installDirectory
Dim iconFileName
Dim shell
Dim desktopDirectory
Dim shortcut

Set arguments = WScript.Arguments
If arguments.Count <> 2 Then
  WScript.Quit 2
End If

installDirectory = arguments.Item(0)
iconFileName = arguments.Item(1)
If Right(installDirectory, 1) <> "\" Then
  installDirectory = installDirectory & "\"
End If

Set shell = CreateObject("WScript.Shell")
desktopDirectory = shell.SpecialFolders("Desktop")
Set shortcut = shell.CreateShortcut(desktopDirectory & "\GrokDesk.lnk")
shortcut.TargetPath = installDirectory & "grokdesk.exe"
shortcut.WorkingDirectory = installDirectory
shortcut.IconLocation = installDirectory & iconFileName & ",0"
shortcut.Description = "GrokDesk"
shortcut.WindowStyle = 1
shortcut.Save
