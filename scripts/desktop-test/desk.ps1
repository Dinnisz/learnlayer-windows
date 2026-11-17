# Desktop test helper for the real LearnLayer app (physical pixels, DPI-aware).
#   desk.ps1 shot <file> [x y w h] [scale]   screenshot (whole screen by default), scaled down
#   desk.ps1 move x y                         move the pointer
#   desk.ps1 click x y [alt]                  left click, optionally holding Alt
#   desk.ps1 key <name>                       press a key: esc, enter, 1..4, tab
#   desk.ps1 keys <ctrl|shift|alt|win>+... <key>   a chord, e.g. "ctrl+shift" space
param([Parameter(Position = 0)][string]$verb, [Parameter(ValueFromRemainingArguments = $true)][string[]]$rest)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Desk {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
}
'@
[void][Desk]::SetProcessDPIAware()
Add-Type -AssemblyName System.Drawing

function KeyDown([byte]$vk) { [Desk]::keybd_event($vk, 0, 0, [UIntPtr]::Zero) }
function KeyUp([byte]$vk) { [Desk]::keybd_event($vk, 0, 2, [UIntPtr]::Zero) }
$codes = @{ esc = 0x1B; enter = 0x0D; tab = 0x09; space = 0x20; '1' = 0x31; '2' = 0x32; '3' = 0x33; '4' = 0x34;
  ctrl = 0x11; shift = 0x10; alt = 0x12; win = 0x5B; a = 0x41; c = 0x43; v = 0x56; l = 0x4C }

switch ($verb) {
  'shot' {
    $file = $rest[0]
    $W = [Desk]::GetSystemMetrics(0); $H = [Desk]::GetSystemMetrics(1)
    $x = 0; $y = 0; $w = $W; $h = $H; $scale = 0.5
    if ($rest.Count -ge 5) { $x = [int]$rest[1]; $y = [int]$rest[2]; $w = [int]$rest[3]; $h = [int]$rest[4] }
    if ($rest.Count -ge 6) { $scale = [double]$rest[5] } elseif ($rest.Count -eq 2) { $scale = [double]$rest[1] }
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size $w, $h))
    $out = New-Object System.Drawing.Bitmap $bmp, ([int]($w * $scale)), ([int]($h * $scale))
    $out.Save($file)
    "screen ${W}x${H}, saved ${w}x${h} at $scale"
  }
  'move' { [void][Desk]::SetCursorPos([int]$rest[0], [int]$rest[1]) }
  'click' {
    [void][Desk]::SetCursorPos([int]$rest[0], [int]$rest[1]); Start-Sleep -Milliseconds 120
    if ($rest.Count -ge 3 -and $rest[2] -eq 'alt') { KeyDown 0x12; Start-Sleep -Milliseconds 80 }
    [Desk]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60
    [Desk]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
    if ($rest.Count -ge 3 -and $rest[2] -eq 'alt') { Start-Sleep -Milliseconds 80; KeyUp 0x12 }
  }
  'drag' {
    $x1 = [int]$rest[0]; $y1 = [int]$rest[1]; $x2 = [int]$rest[2]; $y2 = [int]$rest[3]
    [void][Desk]::SetCursorPos($x1, $y1); Start-Sleep -Milliseconds 150
    [Desk]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
    for ($i = 1; $i -le 20; $i++) {
      [void][Desk]::SetCursorPos([int]($x1 + ($x2 - $x1) * $i / 20), [int]($y1 + ($y2 - $y1) * $i / 20)); Start-Sleep -Milliseconds 25
    }
    Start-Sleep -Milliseconds 80; [Desk]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  }
  'key' { $vk = [byte]$codes[$rest[0]]; KeyDown $vk; Start-Sleep -Milliseconds 50; KeyUp $vk }
  'keys' {
    $mods = $rest[0].Split('+') | ForEach-Object { [byte]$codes[$_] }
    foreach ($m in $mods) { KeyDown $m; Start-Sleep -Milliseconds 40 }
    if ($rest.Count -ge 2) { $vk = [byte]$codes[$rest[1]]; KeyDown $vk; Start-Sleep -Milliseconds 50; KeyUp $vk }
    [array]::Reverse($mods); foreach ($m in $mods) { KeyUp $m; Start-Sleep -Milliseconds 30 }
  }
}
