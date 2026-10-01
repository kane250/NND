@echo off
REM NewsNow Desktop - Windows 安装脚本
REM 在 app\server 目录安装原生依赖（better-sqlite3 等平台特定模块）

setlocal enabledelayedexpansion
set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
set "SERVER_DIR=%DIR%\app\server"

echo === NewsNow Desktop 依赖安装 (Windows) ===

if not exist "%SERVER_DIR%\package.json" (
    echo [错误] 未找到 %SERVER_DIR%\package.json
    echo 请先运行 build.sh 构建 NewsNow，或从 Release 下载预构建的 app 目录。
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 npm，请先安装 Node.js v18+ (https://nodejs.org/)
    pause
    exit /b 1
)

echo → 在 %SERVER_DIR% 安装依赖...
cd /d "%SERVER_DIR%"
npm install --omit=dev --no-package-lock

REM 验证 better-sqlite3
if exist "node_modules\better-sqlite3\build\Release\better_sqlite3.node" (
    echo ✓ better-sqlite3 原生模块安装成功
) else (
    echo ! better-sqlite3 prebuild 未找到，尝试重新编译...
    cd node_modules\better-sqlite3
    npm run build-release 2>&1 || (
        echo [错误] better-sqlite3 编译失败。
        echo 请确保已安装 Visual Studio Build Tools (C++ 桌面开发工作负载)
        echo 下载: https://visualstudio.microsoft.com/visual-cpp-build-tools/
        pause
        exit /b 1
    )
)

echo.
echo ✓ 安装完成！现在可以运行 start.bat 启动应用。
pause
endlocal
