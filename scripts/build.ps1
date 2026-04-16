<#
.SYNOPSIS
    一键打包脚本 - 数据分析智能体
.DESCRIPTION
    编译 TypeScript、构建前端、打包为可执行程序。
    API Key 存储在用户本地 localStorage，不会被打包进安装包。
USAGE:
    .\scripts\build.ps1               # 打包 Windows（默认）
    .\scripts\build.ps1 -Target win   # 打包 Windows 单文件便携版 exe
    .\scripts\build.ps1 -Target mac   # 打包 macOS
    .\scripts\build.ps1 -Target all   # 同时打包 Windows 和 macOS
#>
param(
    [Parameter()][ValidateSet("win","mac","linux","all")][string]$Target = "win"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot

try {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  数据分析智能体 - 一键打包" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # 1. Check node_modules
    if (-not (Test-Path "node_modules")) {
        Write-Host "[1/4] 安装依赖..." -ForegroundColor Yellow
        npm install
    } else {
        Write-Host "[1/4] 依赖已安装，跳过" -ForegroundColor Green
    }

    # 2. Compile Electron main process
    Write-Host "[2/4] 编译 Electron 主进程..." -ForegroundColor Yellow
    npx tsc -p src/main/tsconfig.json
    if ($LASTEXITCODE -ne 0) { throw "TypeScript 编译失败" }
    Write-Host "  编译成功" -ForegroundColor Green

    # 3. Build frontend
    Write-Host "[3/4] 构建前端..." -ForegroundColor Yellow
    npx vite build
    if ($LASTEXITCODE -ne 0) { throw "Vite 构建失败" }
    Write-Host "  构建成功" -ForegroundColor Green

    # 4. Package with electron-builder
    Write-Host "[4/4] 打包中 ($Target)..." -ForegroundColor Yellow
    # 禁用代码签名（无签名证书时避免报错）
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    switch ($Target) {
        "win"   { npx electron-builder --win portable --publish=never }
        "mac"   { npx electron-builder --mac --publish=never }
        "linux" { npx electron-builder --linux --publish=never }
        "all"   { npx electron-builder --win portable --publish=never }
    }
    if ($LASTEXITCODE -ne 0) { throw "electron-builder 打包失败" }
    Write-Host "  打包成功" -ForegroundColor Green

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  打包完成！输出目录: release/" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "注意: API Key 由用户在应用内设置，保存在本地 localStorage 中，" -ForegroundColor DarkGray
    Write-Host "      不会包含在安装包内。" -ForegroundColor DarkGray

} catch {
    Write-Host ""
    Write-Host "打包失败: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
