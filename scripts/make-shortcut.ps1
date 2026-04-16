$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("C:\Users\tube1\OneDrive\Desktop\LLM Wiki Manager.lnk")
$Shortcut.TargetPath = "C:\Users\tube1\Projects\LLM WIKI\scripts\start-dashboard.bat"
$Shortcut.IconLocation = "C:\Users\tube1\Projects\LLM WIKI\public\icon.ico"
$Shortcut.WorkingDirectory = "C:\Users\tube1\Projects\LLM WIKI"
$Shortcut.Description = "LLM Wiki Dashboard"
$Shortcut.Save()
Write-Output "Shortcut created successfully."
