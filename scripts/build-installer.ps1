# Builds the Windows installer (NSIS) and copies it to dist\ (CLAUDE.md, phase 8).
#
#   powershell -ExecutionPolicy Bypass -File scripts\build-installer.ps1
#
# Optional, each only when its settings exist (docs/PARA-O-DINIS.md, points 4 and 5):
#   - Automatic updates: src-tauri\tauri.updater.conf.json (copy tauri.updater.conf.example.json and fill it in) and the
#     update signing key in TAURI_SIGNING_PRIVATE_KEY (and TAURI_SIGNING_PRIVATE_KEY_PASSWORD if it has one).
#     The build then also writes the update package, its .sig and latest.json for the update URL.
#   - Code signing with Azure Trusted Signing: AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT, AZURE_SIGNING_PROFILE
#     (and the Azure sign-in in AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID), with trusted-signing-cli
#     installed (`cargo install trusted-signing-cli`).
# Without them the installer is built unsigned and without updates, for testing on this computer only.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$configs = @()
$extra = Join-Path $root "src-tauri\tauri.updater.conf.json"
if (Test-Path $extra) {
  if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
    throw "tauri.updater.conf.json is there but TAURI_SIGNING_PRIVATE_KEY is not set: updates must be signed."
  }
  $configs += "--config", $extra
  Write-Host "Automatic updates: on"
} else {
  Write-Host "Automatic updates: off (no src-tauri\tauri.updater.conf.json)"
}

if ($env:AZURE_SIGNING_ENDPOINT -and $env:AZURE_SIGNING_ACCOUNT -and $env:AZURE_SIGNING_PROFILE) {
  $sign = "trusted-signing-cli -e $($env:AZURE_SIGNING_ENDPOINT) -a $($env:AZURE_SIGNING_ACCOUNT) -c $($env:AZURE_SIGNING_PROFILE) -d LearnLayer %1"
  $signing = Join-Path $env:TEMP "learnlayer-signing.conf.json"
  # Without a byte-order mark: Tauri reads the file as plain JSON.
  [IO.File]::WriteAllText($signing, (@{ bundle = @{ windows = @{ signCommand = $sign } } } | ConvertTo-Json -Depth 5))
  $configs += "--config", $signing
  Write-Host "Code signing: Azure Trusted Signing"
} else {
  Write-Host "Code signing: off (unsigned build, SmartScreen will warn)"
}

npx tauri build --bundles nsis @configs
if ($LASTEXITCODE -ne 0) { throw "tauri build failed." }

$bundle = Join-Path $root "src-tauri\target\release\bundle\nsis"
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
Get-ChildItem $bundle -File | Where-Object { $_.Extension -in ".exe", ".sig", ".zip" } | Copy-Item -Destination $dist -Force

# The update manifest (latest.json) to put at the update URL, when updates are on.
$installer = Get-ChildItem $bundle -Filter "*-setup.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
$signature = if ($installer) { Get-ChildItem $bundle -Filter "$($installer.Name).sig" | Select-Object -First 1 } else { $null }
if ((Test-Path $extra) -and $installer -and $signature) {
  # The installer sits next to latest.json, unless LEARNLAYER_DOWNLOAD_BASE says where it goes.
  $settings = Get-Content $extra -Raw | ConvertFrom-Json
  $endpoint = [string]$settings.plugins.updater.endpoints[0]
  $base = if ($env:LEARNLAYER_DOWNLOAD_BASE) { $env:LEARNLAYER_DOWNLOAD_BASE.TrimEnd("/") } else { $endpoint.Substring(0, $endpoint.LastIndexOf("/")) }
  $version = (Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version
  $manifest = [ordered]@{
    version = $version
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
      "windows-x86_64" = [ordered]@{
        signature = (Get-Content $signature.FullName -Raw).Trim()
        url = "$base/$($installer.Name)"
      }
    }
  }
  [IO.File]::WriteAllText((Join-Path $dist "latest.json"), ($manifest | ConvertTo-Json -Depth 5))
  Write-Host "Wrote dist\latest.json for version $version"
}

Get-ChildItem $dist | Format-Table Name, Length, LastWriteTime
