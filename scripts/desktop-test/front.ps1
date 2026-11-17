# Brings the window whose title starts with $title to the front, maximised.
param([string]$title)
$sig = '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'
if (-not ([System.Management.Automation.PSTypeName]'U.W').Type) { Add-Type -MemberDefinition $sig -Name W -Namespace U }
$p = Get-Process | Where-Object { $_.MainWindowTitle -like "$title*" } | Select-Object -First 1
if ($p) { [void][U.W]::ShowWindow($p.MainWindowHandle, 3); [void][U.W]::SetForegroundWindow($p.MainWindowHandle); "front: $($p.ProcessName)" } else { "not found: $title" }
