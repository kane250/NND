# NewsNow Desktop & Mobile

基于 [newsnext/newsnow](https://github.com/newsnext/newsnow) 改造的**跨平台新闻聚合阅读器**，支持 **Linux、Windows、Android、iOS** 四平台。

**v2.0 重大变更**：桌面端从「内置 nitro 服务端子进程」迁移为「**主进程直抓架构**」——无子进程、无原生模块（better-sqlite3 已移除）、零 setup 安装步骤，Windows/Linux 开箱即用；移动端数据层实测可用源从 59 个提升到 **61 个**（抖音、雪球 cookie 链修复）。

| 平台 | 技术方案 | 状态 |
| --- | --- | --- |
| **Linux** | Electron + 主进程直抓（app:// 协议） | ✅ 可用 |
| **Windows** | Electron + 主进程直抓（app:// 协议） | ✅ 可用（无编译依赖） |
| **Android** | Capacitor + 原生 HTTP 直抓 | ✅ 可构建 APK |
| **iOS** | Capacitor + 原生 HTTP 直抓 | 📱 代码已生成，需 Mac+Xcode 构建 |

## 功能特性

- **选择订阅**：浏览全部 66 个新闻源（知乎/微博/百度/36氪/B站等），星标订阅，分类管理
- **定期刷新**：自动刷新定时器（5/10/15/30/60 分钟可配），按各源自身间隔缓存
- **按需刷新**：单源刷新按钮 + 一键刷新全部（Ctrl+R）
- **新闻列表**：卡片式热榜/时间线，含标题、热度、发布时间、排序变化
- **内置阅读器**（桌面端）：点击新闻在程序内部查看，支持后退/前进/地址栏导航

## 项目结构

```
newsnow-desktop/
├── main.cjs              # Electron 主进程：app:// 协议 + 数据层运行时 + 阅读器/菜单/定时刷新
├── data-layer.mjs        # 数据层 bundle（66 源抓取+缓存，构建产物）
├── scripts/build-data.mjs # 数据层构建脚本（mobile/src → data-layer.mjs）
├── viewer.html / settings.html  # 内置阅读器 / 设置窗口 UI
├── start.sh / start.bat  # 启动脚本（仅需 electron）
├── build.sh              # 从源码构建前端（web/）+ 数据层
├── web/                  # NewsNow React 前端静态资源（构建产物）
└── mobile/               # 移动端（Capacitor）
    ├── src/               #   前端源码：数据层 + React App
    │   ├── fetch.ts       #     跨平台 HTTP（Electron主进程/Capacitor原生/浏览器 三分支）
    │   ├── api.ts         #     API 层（getSourceData/getEntireData）
    │   ├── getters.ts     #     66 源注册表
    │   ├── cache.ts       #     缓存（桌面JSON文件/Capacitor Preferences/localStorage 三分支）
    │   ├── sources/       #     66 个新闻源抓取逻辑
    │   └── app.tsx        #     移动端 React 入口
    ├── android/           #   Android 原生项目
    ├── ios/               #   iOS 原生项目
    └── www/               #   构建产物（gitignore）
```

## v2.0 架构（桌面端）

```
┌──────────────────────────────────────────────┐
│            Electron 进程（唯一进程）            │
│                                              │
│  ┌────────────── 主进程 ──────────────┐      │
│  │ data-layer.mjs（66源抓取+缓存）      │      │
│  │ · myFetch: Node fetch（无CORS）     │      │
│  │ · 缓存: userData/data-cache.json    │      │
│  └───────────────┬───────────────────┘      │
│                  │ import                    │
│  ┌───────────────┴───────────────────┐      │
│  │ protocol.handle("app")           │      │
│  │ · app://local/api/s?id=x → 数据层  │      │
│  │ · app://local/assets/... → web/   │      │
│  │ · SPA fallback → index.html       │      │
│  └───────────────┬───────────────────┘      │
│                  │ app:// 协议               │
│  ┌───────────────┴───────────────────┐      │
│  │ BrowserWindow（React 前端，零改动）  │      │
│  │ + 内置阅读器（WebContentsView）     │      │
│  └───────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

**v1 → v2 对比**：

| | v1.0 | v2.0 |
| --- | --- | --- |
| 服务端 | nitro(h3) 子进程（随机端口） | 主进程内数据层（app:// 协议） |
| 原生模块 | better-sqlite3（需编译/安装） | **无** |
| 安装步骤 | clone → setup → start | **clone → start** |
| Node.js 依赖 | 需要（运行子进程） | **不需要**（仅构建时用） |
| 启动 | 1~3 秒（服务就绪轮询） | 即时 |
| 内存 | +1 个 Node 子进程 | 单进程 |
| 可用源 | 59/66（同 nitro） | **61/66**（douyin/xueqiu 修复） |

## 快速开始（桌面端）

### 环境要求（仅需 1 项）

| 依赖 | Linux | Windows |
| --- | --- | --- |
| **Electron** | `sudo pacman -S electron` (Arch) / `sudo snap install electron` (Ubuntu) | `npm install -g electron` |

### 启动

```bash
git clone https://github.com/kane250/newsnow-desktop.git
cd newsnow-desktop
./start.sh        # Linux/macOS
start.bat         # Windows（双击或命令行）
```

**无需 setup、无需 Node.js、无原生模块编译。**

### 从源码重建（可选）

```bash
./build.sh        # 构建前端 web/ + 数据层 data-layer.mjs（需要 pnpm + Node）
```

单独重建数据层：`node scripts/build-data.mjs`（需 mobile 端 `npm install`）

### Linux 桌面菜单集成

```bash
mkdir -p ~/.local/share/applications
cp NewsNow-Desktop.desktop ~/.local/share/applications/
update-desktop-database ~/.local/share/applications 2>/dev/null || true
```

### 操作说明

| 操作 | 方式 |
| --- | --- |
| 刷新全部 | **Ctrl+R** 或菜单「视图 → 刷新全部」 |
| 打开设置 | **Ctrl+,** 或菜单「NewsNow → 设置…」 |
| 阅读新闻 | 点击标题 → 内置阅读器 |
| 阅读器后退/前进 | **Alt+← / Alt+→** |
| 返回新闻列表 | **Esc** |

## 移动端构建

```bash
cd mobile
npm install
node build-web.mjs          # 构建 Web 资源
npx cap sync android        # 同步 Android

# Android APK
cd android && export ANDROID_HOME=$HOME/Android/Sdk && ./gradlew assembleDebug
# 产物: android/app/build/outputs/apk/debug/app-debug.apk

# iOS（需 Mac）
npx cap sync ios && npx cap open ios   # Xcode 中 Build
```

## 数据源状态

**61/66 源实测可正常抓取**（知乎、微博、百度、36氪、B站、抖音、雪球、Hacker News、GitHub Trending、财联社、华尔街见闻、IT之家等）。

受限源（外部原因，非代码问题）：`pcbeta`（反爬滑块验证）、`qqvideo`（上游 API 数据结构变化）及 3 个子源。

## 截图

| 新闻列表 | 内置阅读器 | 选择订阅 | v2.0 主界面 |
|:---:|:---:|:---:|:---:|
| ![列表](screenshots/01-news-list.png) | ![阅读器](screenshots/02-built-in-reader.png) | ![订阅](screenshots/03-subscribe.png) | ![v2](screenshots/04-v2-desktop.png) |

## 许可

NewsNow 原项目遵循 MIT 协议，本项目同样基于 MIT。
