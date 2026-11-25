# 安装脚本（Windows PowerShell）
# 把两个插件复制到 ~/.dsh/plugins-src/，然后告诉你去 DSH 里安装
# 用法：  powershell -ExecutionPolicy Bypass -File scripts\install.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$dest = Join-Path $dshHome 'plugins-src'

Write-Host "DSH_HOME = $dshHome"
Write-Host "插件目录 = $dest"

if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }

foreach ($name in @('dsh-pet-coo-link', 'dsh-shared-memory')) {
    $src = Join-Path $root "packages\$name"
    $dst = Join-Path $dest $name
    if (-not (Test-Path $src)) { throw "缺少 $src" }
    if (Test-Path $dst) {
        Write-Host "更新 $name ..."
        Copy-Item (Join-Path $src '*') $dst -Recurse -Force
    } else {
        Write-Host "复制 $name ..."
        Copy-Item $src $dst -Recurse -Force
    }
}

Write-Host ''
Write-Host '=== 下一步 ===' -ForegroundColor Cyan
Write-Host '1) 打开 DSH → 设置 → 插件 → 安装插件，分别填：'
Write-Host ("   file:" + (Join-Path $dest 'dsh-shared-memory'))
Write-Host ("   file:" + (Join-Path $dest 'dsh-pet-coo-link'))
Write-Host '2) 需要“小女仆记得共享记忆”的话，再跑：'
Write-Host '   node scripts\patch-dsh-pet.mjs'
Write-Host '3) 需要“同伴的闲聊不进会话”的话，再跑：'
Write-Host '   node scripts\patch-coopanion-connector.mjs'
Write-Host '4) 重启 DSH（或在插件页禁用再启用一次）。'
Write-Host ''
Write-Host '卸载：node scripts\patch-dsh-pet.mjs --undo，然后在插件页移除两个插件。'