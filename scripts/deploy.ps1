#!/usr/bin/env pwsh
# Emergency manual deploy mirroring .github/workflows/deploy.yml.
# Use only when GHA is unavailable.
# Requires built-in Windows tools: ssh.exe, scp.exe, tar.exe (Win10 1803+ / Win11).
#
# Setup: copy scripts/deploy.local.example.ps1 to scripts/deploy.local.ps1
# and fill in DeployUser/DeployHost/DeployPath.
#
# Usage:
#   .\scripts\deploy.ps1                # overlay extract (safe default)
#   .\scripts\deploy.ps1 -Clean         # wipe deploy dir first (keeps .env + data/)
#   .\scripts\deploy.ps1 -SkipChecks
#   .\scripts\deploy.ps1 -ConfigFile .\scripts\deploy.other.ps1

[CmdletBinding()]
param(
    [string]$ConfigFile,
    [switch]$SkipChecks,
    [switch]$SkipInstall,
    # Wipe everything at $DeployPath except .env and data/ before extracting.
    # Mirrors the effect of rsync --delete with the workflow's exclude list.
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not $ConfigFile) {
    $ConfigFile = Join-Path $PSScriptRoot 'deploy.local.ps1'
}
if (-not (Test-Path $ConfigFile)) {
    throw "Config file not found: $ConfigFile`nCopy scripts/deploy.local.example.ps1 to scripts/deploy.local.ps1 and fill in values."
}
. $ConfigFile

foreach ($v in 'DeployUser', 'DeployHost', 'DeployPath') {
    if (-not (Get-Variable $v -ValueOnly -ErrorAction SilentlyContinue)) {
        throw "$v is not set in $ConfigFile"
    }
}

$SshArgs = @()
if ($IdentityFile) { $SshArgs += @('-i', $IdentityFile) }
$Remote = "${DeployUser}@${DeployHost}"

# Must match the rsync source list in .github/workflows/deploy.yml.
$Files = @(
    'src',
    'config',
    'AGENTS.md',
    'package.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    '.nvmrc',
    'ecosystem.config.cjs'
)

foreach ($f in $Files) {
    if (-not (Test-Path $f)) { throw "Missing path: $f" }
}

if (-not $SkipChecks) {
    Write-Host "==> pnpm run prettier:check" -ForegroundColor Cyan
    pnpm run prettier:check
    if ($LASTEXITCODE -ne 0) { throw "prettier:check failed" }
}

$Stamp = Get-Date -Format 'yyyyMMddHHmmss'
$TarName = "rooivalk-deploy-$Stamp.tar.gz"
$LocalTar = Join-Path $env:TEMP $TarName
$RemoteTar = "/tmp/$TarName"

Write-Host "==> Creating tarball: $LocalTar" -ForegroundColor Cyan
& tar -czf $LocalTar -- @Files
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

try {
    Write-Host "==> scp -> ${Remote}:${RemoteTar}" -ForegroundColor Cyan
    & scp @SshArgs $LocalTar "${Remote}:${RemoteTar}"
    if ($LASTEXITCODE -ne 0) { throw "scp failed" }

    $InstallStep = if ($SkipInstall) { 'echo "(skipping pnpm install)"' } else { 'pnpm install' }

    # `find ... -delete` everything at the deploy root except .env and data/.
    # Runs only with -Clean. node_modules is wiped too so pnpm install gets a clean slate.
    $CleanStep = if ($Clean) {
        @"
echo "==> Cleaning '$DeployPath' (keeping .env and data/)"
find '$DeployPath' -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'data' -exec rm -rf {} +
"@
    } else { '' }

    # Backtick-escaped `$ stays literal so bash sees $HOME / $NVM_DIR.
    # PowerShell variables ($DeployPath, $RemoteTar, $InstallStep, $CleanStep) interpolate.
    $RemoteScript = @"
set -e
export NVM_DIR="`$HOME/.nvm"
[ -s "`$NVM_DIR/nvm.sh" ] && . "`$NVM_DIR/nvm.sh"

mkdir -p '$DeployPath'
$CleanStep
tar -xzf '$RemoteTar' -C '$DeployPath'
rm -f '$RemoteTar'

cd '$DeployPath'
$InstallStep
pm2 delete rooivalk || true
pm2 start ecosystem.config.cjs
pm2 save || true
"@

    Write-Host "==> Remote: extract, pnpm install, pm2 restart" -ForegroundColor Cyan
    $RemoteScript | & ssh @SshArgs $Remote 'bash -s'
    if ($LASTEXITCODE -ne 0) { throw "remote deploy failed" }

    Write-Host "==> Deploy complete." -ForegroundColor Green
}
finally {
    if (Test-Path $LocalTar) { Remove-Item $LocalTar -Force }
}
