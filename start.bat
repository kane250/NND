@echo off
REM NewsNow Desktop - Windows 启动脚本
REM 依赖：Node.js (v18+) 和 Electron

setlocal enabledelayedexpansion

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"

REM 查找 node
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js v18+ (https://nodejs.org/)
    pause
    exit /b 1
)

REM 查找 electron
where electron >nul 2>&1
if %errorlevel% neq 0 (
    REM 尝试 npx electron
    set "ELECTRON_CMD=npx electron"
) else (
    set "ELECTRON_CMD=electron"
)

REM 检查 app/server 是否已安装依赖
if not exist "%DIR%\app\server\node_modules\better-sqlite3" (
    echo [提示] 首次运行需要安装依赖，正在执行 setup...
    call "%DIR%\setup.bat"
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败，请手动运行 setup.bat
        pause
        exit /b 1
    )
)

REM 启动 Electron
%ELECTRON_CMD% "%DIR%" %*
if %errorlevel% neq 0 (
    echo.
    echo [错误] Electron 启动失败。请确保已安装 Electron：
    echo   npm install -g electron
    pause
)

endlocal
