@echo off
REM NewsNow Desktop v2.0 - Windows 启动脚本
REM 依赖：仅需系统 electron（数据层在 Electron 主进程内运行，无需 Node.js、无原生模块）
REM 安装：npm install -g electron

setlocal enabledelayedexpansion

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"

REM 查找 electron
where electron >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 electron，请先安装：npm install -g electron
    pause
    exit /b 1
)

cd /d "%DIR%"
electron "%DIR%" %*
if %errorlevel% neq 0 (
    echo.
    echo [错误] Electron 启动失败。请确保已安装 Electron：
    echo   npm install -g electron
    pause
)

endlocal
