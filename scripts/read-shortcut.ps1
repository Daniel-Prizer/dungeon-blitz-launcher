param([Parameter(Mandatory=$true)][string]$Shortcut)
$ErrorActionPreference = 'Stop'
$shortcutShell = New-Object -ComObject WScript.Shell
$launcherLink = $shortcutShell.CreateShortcut($Shortcut)
@{target=$launcherLink.TargetPath; directory=$launcherLink.WorkingDirectory} | ConvertTo-Json -Compress
