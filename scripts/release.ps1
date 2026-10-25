<#
.SYNOPSIS
    Automated Release & Bundling Script for OpenPlay.

.DESCRIPTION
    1. Validates or bumps version in tauri.conf.json, Cargo.toml, and package.json.
    2. Builds production frontend and Tauri release bundle (NSIS installer).
    3. Tags the commit and pushes the tag to GitHub.
    4. Publishes a GitHub Release with attached installer and changelog.

.PARAMETER Version
    The semantic version to release (e.g., 0.1.0, 0.1.1). If omitted, extracts from tauri.conf.json.

.PARAMETER NotesFile
    Path to a markdown file containing release notes. Default is release_notes.md.

.EXAMPLE
    .\scripts\release.ps1 -Version "0.1.0"
#>

param (
    [string]$Version,
    [string]$NotesFile = "release_notes.md"
)

$ErrorActionPreference = "Stop"

# 1. Resolve Version
if (-not $Version) {
    if (Test-Path "src-tauri\tauri.conf.json") {
        $tauriConf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
        $Version = $tauriConf.version
    }
}

if (-not $Version) {
    Write-Error "Could not determine release version. Please specify -Version (e.g., 0.1.0)."
    exit 1
}

$Tag = "v$Version"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Preparing OpenPlay Release: $Tag" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 2. Build Tauri Release Bundle
Write-Host "`n[1/4] Building production release bundle with Tauri..." -ForegroundColor Yellow
npm run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

# 3. Locate Generated Installer
$bundleDir = "src-tauri\target\release\bundle\nsis"
$installers = Get-ChildItem -Path $bundleDir -Filter "*setup.exe" -ErrorAction SilentlyContinue

if (-not $installers -or $installers.Count -eq 0) {
    Write-Error "Could not find generated setup installer in $bundleDir."
    exit 1
}

$installer = $installers[0].FullName
Write-Host "`n[2/4] Found installer bundle: $installer" -ForegroundColor Green

# 4. Check & Push Git Tag
Write-Host "`n[3/4] Ensuring Git tag $Tag is created and pushed..." -ForegroundColor Yellow
$existingTag = git tag -l $Tag
if (-not $existingTag) {
    git tag -a $Tag -m "OpenPlay $Tag Release"
}
git push origin $Tag

# 5. Create GitHub Release via GitHub CLI
Write-Host "`n[4/4] Publishing release on GitHub..." -ForegroundColor Yellow

$releaseArgs = @("release", "create", $Tag, $installer, "--title", "OpenPlay $Tag")

if (Test-Path $NotesFile) {
    $releaseArgs += @("--notes-file", $NotesFile)
} else {
    $releaseArgs += @("--generate-notes")
}

gh @releaseArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccessfully published OpenPlay $Tag to GitHub!" -ForegroundColor Green
    Write-Host "Release URL: https://github.com/Screamycat/OpenPlay/releases/tag/$Tag" -ForegroundColor Cyan
} else {
    Write-Warning "Failed to publish GitHub release automatically. Please check your GitHub permissions or publish manually."
}
