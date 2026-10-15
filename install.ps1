# Custom Vencord installer (Windows)
# Builds a single exe with ALL userplugins from ../Vencord, then installs.
#
# Usage:
#   .\install.ps1
#   .\install.ps1 -Repair
#   .\install.ps1 -Uninstall
#   .\install.ps1 -SetupOnly

param(
    [switch]$Repair,
    [switch]$Uninstall,
    [switch]$SetupOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required."
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "pnpm is required. Run: npm i -g pnpm"
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git is required."
}

Push-Location $Root
try {
    if ($SetupOnly) {
        node "$Root\setup.mjs"
        exit 0
    }

    node "$Root\buildInstaller.mjs"

    $args = @()
    if ($Uninstall) {
        $args += "--uninstall"
    } elseif ($Repair) {
        $args += "--repair"
    } else {
        $args += "--install"
    }

    Write-Host "Close Discord before continuing." -ForegroundColor Yellow
    & "$Root\bin\CustomVencordInstaller.exe" @args
}
finally {
    Pop-Location
}
