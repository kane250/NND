# NND — NewsNow Desktop

> **NND**（NewsNow Desktop）是基于 [newsnext/newsnow](https://github.com/newsnext/newsnow) （作者 ourongxing）改造的**跨平台新闻聚合阅读器**，支持 **Linux、Windows、Android、iOS** 四平台。

TeleAgent Vibe Coding 发布 
---

## 功能特性

- **70 个新闻源**：知乎、微博、百度、36氪、B站、抖音、雪球、Hacker News、Product Hunt、财联社、华尔街见闻、IT之家、央视新闻、人民网、虎嗅、财新网、FT中文网、纽约时报中文、法广等
- **选择订阅**：星标订阅，分类管理（科技/国内/国际/财经/体育）
- **定期刷新**：自动刷新定时器（5/10/15/30/60 分钟可配），按各源自身间隔缓存
- **按需刷新**：单源刷新按钮 + 一键刷新全部（Ctrl+R）
- **内置阅读器**：点击新闻在程序内部查看，支持后退/前进，移除地址栏仅显示来源域名
- **广告拦截**：阅读器内置 EasyList 精简规则，自动隐藏广告、弹窗、推广、「下载 App」浮层等干扰元素
- **禁止自动播放**：三层防护阻止媒体自动播放，退出阅读器时同步关闭
- **关闭按钮驻留托盘**：关闭窗口最小化到系统通知栏，右键菜单含显示/刷新/设置/关于/退出

## 下载安装

### Windows

从 [Releases](https://github.com/kane250/newsnow-desktop/releases/latest) 下载 `NND-x.x.x-win-x64-setup.exe`，双击安装即可。安装包会创建桌面快捷方式和开始菜单快捷方式（名称均为 NND）。

### Linux

| 格式 | 说明 |
| --- | --- |
| `NND-x.x.x-x86_64.AppImage` | 免安装运行，chmod +x 后直接执行 |
| `NND-x.x.x-amd64.deb` | Debian/Ubuntu 安装包 |
| `NND-vx.x.x-linux-x64.tar.gz` | 压缩包，解压后运行 `./start.sh` |

### Android

`NND-vx.x.x-android-debug.apk` — 直接安装（需开启「未知来源」）。

### 从源码运行

```bash
git clone https://github.com/kane250/newsnow-desktop.git
cd newsnow-desktop
npm install                # 安装 Electron
./start.sh                # Linux/macOS   |   start.bat   # Windows
```

无需 setup、无需 Node.js 运行时、无原生模块编译。

## v2.0 架构（桌面端）

```
┌──────────────────────────────────────────────┐
│            Electron 进程（唯一进程）            │
│                                              │
│  ┌────────────── 主进程 ──────────────┐      │
│  │ data-layer.mjs（70源抓取+缓存）      │      │
│  │ · myFetch: Node fetch（无CORS）     │      │
│  │ · 缓存: userData/data-cache.json    │      │
│  └───────────────┬───────────────────┘      │
│                  │ import                    │
│  ┌───────────────┴───────────────────┐      │
│  │ protocol.handle("app")           │      │
│  │ · app://local/api/s?id=x → 数据层  │      │
│  │ · app://local/assets/... → web/   │      │
│  │ · SPA fallback → index-v2.html    │      │
│  └───────────────┬───────────────────┘      │
│                  │ app:// 协议               │
│  ┌───────────────┴───────────────────┐      │
│  │ BrowserWindow（React 前端）        │      │
│  │ + 内置阅读器（WebContentsView）     │      │
│  │ + 广告拦截 + 禁止自动播放注入       │      │
│  └───────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

**v1 → v2 对比**：

| | v1.0 | v2.0+ |
| --- | --- | --- |
| 服务端 | nitro(h3) 子进程（随机端口） | 主进程内数据层（app:// 协议） |
| 原生模块 | better-sqlite3（需编译/安装） | **无** |
| 安装步骤 | clone → setup → start | **clone → start** |
| Node.js 依赖 | 需要（运行子进程） | **不需要**（仅构建时用） |
| 启动 | 1~3 秒（服务就绪轮询） | 即时 |
| 内存 | +1 个 Node 子进程 | 单进程 |
| 新闻源 | 59/66 | **69/70**（新增 10 源 + 清理 6 不可用源） |

## 项目结构

```
newsnow-desktop/
├── main.cjs                # Electron 主进程：app:// 协议 + 数据层 + 阅读器 + 托盘 + 菜单
├── data-layer.mjs          # 数据层 bundle（70 源抓取+缓存，构建产物）
├── viewer.html             # 内置阅读器工具栏 UI
├── viewer-preload.cjs      # 阅读器 IPC 桥
├── settings.html           # 设置窗口 UI（卡片式布局）
├── settings-preload.cjs    # 设置 IPC 桥
├── package.json            # electron-builder 构建配置（NND/nsis/AppImage/deb）
├── build-icon.png/.ico     # NND 统一图标（各平台）
├── build.sh                # 从源码构建前端 + 数据层 + 品牌补丁
├── start.sh / start.bat    # 启动脚本
├── scripts/
│   ├── build-data.mjs      #   数据层构建（mobile/src → data-layer.mjs）
│   ├── patch-web-sources.mjs #  前端源配置补丁（新源注入/废弃源清理/缓存修复）
│   └── patch-branding.mjs  #   品牌定制补丁（NND logo/版本号/GitHub链接/版权）
├── web/                    # React 前端静态资源（构建产物）
│   ├── assets/index-*.js   #   前端 bundle（含内联源配置，patch 后同步）
│   ├── index-v2.html       #   入口文件（规避 Chromium 缓存）
│   ├── icon.svg / pwa-*.png#   NND 图标
│   └── manifest.webmanifest
├── mobile/                 # 移动端（Capacitor）
│   ├── src/
│   │   ├── fetch.ts        #     跨平台 HTTP（Electron/Capacitor/浏览器 三分支）
│   │   ├── cache.ts        #     缓存（桌面JSON/Capacitor Preferences/localStorage）
│   │   ├── getters.ts      #     70 源注册表
│   │   ├── sources/        #     70 个新闻源抓取逻辑
│   │   └── sources-data.json #   源元数据
│   ├── android/            #   Android 原生项目
│   └── ios/                #   iOS 原生项目
├── .github/workflows/
│   └── build-release.yml   #   GitHub Actions 四平台并行构建 + Release 自动发布
└── NewsNow-Desktop.desktop #   Linux 桌面菜单集成
```

## 操作说明

| 操作 | 方式 |
| --- | --- |
| 刷新全部 | **Ctrl+R** 或菜单「视图 → 刷新全部」 |
| 打开设置 | **Ctrl+,** 或托盘右键「设置…」 |
| 阅读新闻 | 点击标题 → 内置阅读器 |
| 阅读器后退/前进 | **Alt+← / Alt+→** |
| 返回新闻列表 | **Esc** |
| 退出程序 | 托盘右键「退出」或菜单「NND → 退出」 |

## 从源码构建

### 构建前端 + 数据层

```bash
./build.sh        # 需要 pnpm + Node.js（克隆原项目 → pnpm build → 补丁 → 数据层）
```

`build.sh` 会自动执行：
1. 克隆原项目并 `pnpm build` 生成前端资源
2. `patch-web-sources.mjs` — 注入新源/清理废弃源/同步「更多」列表/修复 Chromium 缓存
3. `patch-branding.mjs` — NND logo/版本号/GitHub 链接/版权信息/页面标题

### 单独重建数据层

```bash
node scripts/build-data.mjs    # 需 mobile 端 npm install
```

### 构建 Release 产物

```bash
# Linux
npx electron-builder --linux AppImage tar.gz deb --publish never

# Windows
npx electron-builder --win nsis --publish never

# 全平台
npx electron-builder -mlw --publish never
```

或推送 git tag `v*` 触发 GitHub Actions 自动构建四平台并发布 Release。

## GitHub Actions CI

推送 `v*` tag 自动触发四平台并行构建：

| 平台 | 产物 | 运行环境 |
| --- | --- | --- |
| Linux | AppImage + deb + tar.gz | ubuntu-22.04 |
| Windows | nsis 安装包 (setup.exe) | windows-latest |
| Android | debug APK | ubuntu-22.04 |
| iOS | 未签名 ipa | macos-14 |

构建完成后自动创建 GitHub Release 并上传所有产物。

## 移动端构建

```bash
cd mobile
npm install
node build-web.mjs          # 构建 Web 资源
npx cap sync android        # 同步 Android

# Android APK
cd android && ./gradlew assembleDebug
# 产物: android/app/build/outputs/apk/debug/app-debug.apk

# iOS（需 Mac + Xcode）
npx cap sync ios && npx cap open ios
```

## 数据源

**70 个新闻源**，69/70 实测可正常抓取。

| 分类 | 数量 | 代表源 |
| --- | --- | --- |
| 科技 | 17 | 36氪、IT之家、Hacker News、Product Hunt、虎嗅、cnBeta、少数派、Solidot |
| 国内 | 25 | 知乎、微博、百度、抖音、澎湃新闻、央视新闻、人民网、百度贴吧 |
| 财经 | 19 | 华尔街见闻、财联社、雪球、财新网、FT中文网、金十数据 |
| 国际 | 7 | 联合早报、参考消息、法广、纽约时报中文、卫星通讯社 |
| 体育 | 2 | 虎扑、懂球帝 |

## 截图

| 新闻列表 | 内置阅读器 | 选择订阅 | 主界面 |
|:---:|:---:|:---:|:---:|
| ![列表](screenshots/01-news-list.png) | ![阅读器](screenshots/02-built-in-reader.png) | ![订阅](screenshots/03-subscribe.png) | ![v2](screenshots/04-v2-desktop.png) |

## 致敬

本项目基于 [newsnext/newsnow](https://github.com/newsnext/newsnow)（作者 [ourongxing](https://github.com/ourongxing)）改造，原项目遵循 MIT 协议，本项目同样基于 MIT。

## 许可

MIT License — Copyright © 2026 TeleAgent
