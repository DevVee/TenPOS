# ─────────────────────────────────────────────────────────────────────────────
# TenPOS — Production APK Build Script
# Run from the mobile/ directory: .\build-apk.ps1
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   TenPOS — Production APK Build      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Web build
Write-Host "► Step 1/3: Building web assets..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Web build failed" -ForegroundColor Red; exit 1 }
Write-Host "✓ Web assets built`n" -ForegroundColor Green

# 2. Capacitor sync
Write-Host "► Step 2/3: Syncing to Android..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "✗ Cap sync failed" -ForegroundColor Red; exit 1 }
Write-Host "✓ Android synced`n" -ForegroundColor Green

# 3. Gradle release build
Write-Host "► Step 3/3: Building release APK..." -ForegroundColor Yellow
Push-Location android
.\gradlew assembleRelease
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "✗ Gradle build failed" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "✓ Release APK built`n" -ForegroundColor Green

$apk = "android\app\build\outputs\apk\release\app-release.apk"
$size = [math]::Round((Get-Item $apk).Length / 1MB, 1)

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   BUILD COMPLETE ✓                   ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  APK: $apk" -ForegroundColor White
Write-Host " Size: ${size} MB" -ForegroundColor White
Write-Host ""
Write-Host "Install on device:  adb install -r $apk" -ForegroundColor Gray
Write-Host ""
