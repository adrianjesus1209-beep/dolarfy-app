# ============================================================================
#  build-apk.ps1 - Compila la APK de Dolarfy y la publica con nombre oficial
#  Convención: Dolarfy-v{X.Y.Z}.apk → releases/
#  Requisitos: Node.js + npm, Android SDK (ANDROID_HOME) y Java 17.
# ============================================================================
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1. Leer la versión oficial desde package.json (fuente única de verdad)
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
if (-not $pkg.version) { throw 'No se pudo leer la versión desde package.json' }
$version = $pkg.version
Write-Host "==> Compilando Dolarfy v$version`n"

# 1.5. Generar bundle JavaScript único para compatibilidad total con WebView
Write-Host '==> Bundling JavaScript (app.bundle.js)...'
node scripts/bundle.js
if ($LASTEXITCODE -ne 0) { throw 'node scripts/bundle.js falló' }

# 2. Sincronizar assets web -> Capacitor (www)
Write-Host '==> Copiando assets a www/...'
$items = @('index.html', 'manifest.json', 'sw.js', 'package.json', 'js', 'assets')
foreach ($item in $items) {
    if (Test-Path $item) {
        Copy-Item -Path $item -Destination www -Recurse -Force
    }
}

# 3. Sincronizar plugins nativos de Capacitor
Write-Host '==> npx cap sync android...'
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'cap sync falló' }

# 4. Compilar APK debug (firmada con la clave de depuración)
Write-Host '==> gradlew assembleDebug...'
Push-Location android
try {
    if ($IsWindows -or $env:OS -eq 'Windows_NT') {
        & .\gradlew.bat assembleDebug
    } else {
        & ./gradlew assembleDebug
    }
    if ($LASTEXITCODE -ne 0) { throw 'gradle assembleDebug falló' }
} finally {
    Pop-Location
}

# 5. Copiar y renombrar la APK con el nombre oficial + versión
$source = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $source)) { throw "No se encontró la APK compilada en: $source" }

$releasesDir = Join-Path $root 'releases'
if (-not (Test-Path $releasesDir)) { New-Item -ItemType Directory -Path $releasesDir | Out-Null }

$dest = Join-Path $releasesDir "Dolarfy-v$version.apk"
Copy-Item -Path $source -Destination $dest -Force

Write-Host ''
Write-Host "==> APK publicada: $dest"
Write-Host "==> Tamaño: $([math]::Round((Get-Item $dest).Length / 1MB, 2)) MB"