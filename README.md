# NewsNow Desktop

基于 [newsnext/newsnow](https://github.com/newsnext/newsnow) 改造的 **跨平台桌面新闻聚合阅读器**，支持 **Linux** 和 **Windows**。

使用 Electron 封装 NewsNow 完整服务端 + 前端，并增加桌面专属能力：选择订阅、定期/按需刷新、内置阅读器查看新闻。

## 功能特性

| 功能 | 说明 |
| --- | --- |
| **选择订阅** | 顶部「更多」标签打开新闻源订阅面板，按分类浏览全部 66 个新闻源，星标收藏 / 取消，点击查看。订阅状态与栏目布局持久化在本地。 |
| **定期刷新** | 自动刷新定时器，默认每 10 分钟刷新所有已加载的新闻源；可在「设置」中选择 5/10/15/30/60 分钟间隔或关闭。 |
| **按需刷新** | 每个新闻源卡片右上角 ↻ 按钮单独刷新；菜单「视图 → 刷新全部」或快捷键 **Ctrl+R** 一次刷新所有可见源。 |
| **新闻列表** | 主界面以卡片形式展示各订阅源的热榜 / 时间线列表，含标题、热度、发布时间、排序变化等。 |
| **内置阅读器** | 点击任意新闻 → 在同一窗口内弹出阅读器（顶部工具栏：后退 / 前进 / 重新加载 / 地址栏 / 在系统浏览器打开 / 返回列表），直接阅读正文，无需跳转外部浏览器。 |

## 截图

| 新闻列表 | 内置阅读器 | 选择订阅 |
|:---:|:---:|:---:|
| ![新闻列表](screenshots/01-news-list.png) | ![内置阅读器](screenshots/02-built-in-reader.png) | ![选择订阅](screenshots/03-subscribe.png) |

## 系统要求

| 依赖 | Linux | Windows |
| --- | --- | --- |
| **Node.js** v18+ | `sudo pacman -S nodejs` (Arch) / 从 [nodejs.org](https://nodejs.org/) 安装 | 从 [nodejs.org](https://nodejs.org/) 安装 |
| **Electron** | `sudo pacman -S electron` (Arch) / `sudo snap install electron` (Ubuntu) | `npm install -g electron` |
| 编译工具（仅 setup 时） | `sudo pacman -S base-devel python3` (Arch) / `sudo apt install build-essential python3` (Ubuntu) | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++ 桌面开发) |

## 快速开始

### 方式一：下载 Release（推荐）

1. 从 [GitHub Release](../../releases) 下载对应平台的压缩包
2. 解压后运行安装脚本安装原生依赖：
   - **Linux**: `./setup.sh`
   - **Windows**: 双击 `setup.bat`
3. 启动应用：
   - **Linux**: `./start.sh`
   - **Windows**: 双击 `start.bat`

### 方式二：从源码构建

```bash
git clone https://github.com/kane250/newsnow-desktop.git
cd newsnow-desktop

# 1. 构建 NewsNow 前端+服务端（需要 pnpm）
./build.sh        # Linux/macOS
# Windows: bash build.sh (需要 Git Bash)

# 2. 安装原生依赖
./setup.sh        # Linux/macOS
setup.bat         # Windows

# 3. 启动
./start.sh        # Linux/macOS
start.bat         # Windows
```

### Linux 桌面菜单集成

```bash
mkdir -p ~/.local/share/applications
cp NewsNow-Desktop.desktop ~/.local/share/applications/
update-desktop-database ~/.local/share/applications 2>/dev/null || true
```

安装后在应用列表搜索「NewsNow 桌面版」点击启动。

## 操作说明

| 操作 | 方式 |
| --- | --- |
| 刷新单个源 | 卡片右上角 ↻ 按钮 |
| 刷新全部 | 菜单「视图 → 刷新全部」或 **Ctrl+R** |
| 打开设置 | 菜单「NewsNow → 设置…」或 **Ctrl+,** |
| 阅读新闻 | 点击列表标题 → 内置阅读器打开 |
| 阅读器后退 / 前进 | 工具栏 ◀ ▶ 或 **Alt+← / Alt+→** |
| 阅读器地址栏导航 | 在地址栏输入网址回车 |
| 在系统浏览器打开 | 阅读器工具栏 ⤢ 按钮 |
| 返回新闻列表 | 阅读器工具栏 ✕ 或 **Esc** |
| 重新加载正文 | 工具栏 ↻ 或 **Ctrl+Shift+R** |

## 设置项

- **自动刷新**：开/关
- **刷新间隔**：5 / 10 / 15 / 30 / 60 分钟
- **内置阅读器查看**：开（点击在程序内打开）/ 关（点击用系统浏览器打开）

配置文件保存在用户数据目录下 `newsnow-desktop/config.json`（含窗口位置记忆）。

## 技术架构

```
newsnow-desktop/
├── app/                      # NewsNow 构建产物（自包含，不含 node_modules）
│   ├── server/               # nitro(h3) 服务端 + better-sqlite3 缓存
│   │   ├── index.mjs        # 服务端入口
│   │   ├── package.json      # 依赖声明（setup 时安装）
│   │   └── chunks/           # 服务端代码块
│   └── public/               # React 前端静态资源
├── main.cjs                  # Electron 主进程：启动 nitro 子进程、主窗口、内置阅读器、定时刷新、菜单
├── viewer.html               # 阅读器工具栏 UI
├── viewer-preload.cjs        # 阅读器预加载（IPC 桥）
├── settings.html             # 设置窗口 UI
├── settings-preload.cjs      # 设置预加载
├── start.sh / start.bat      # 跨平台启动脚本
├── setup.sh / setup.bat      # 跨平台依赖安装脚本
├── build.sh                  # 从源码构建 NewsNow
├── package.json
└── README.md
```

- **前端**：原版 NewsNow（React 19 + Vite + UnoCSS + TanStack Router），不做改动，整包构建后随程序分发。
- **后端**：原版 nitro(h3) node-server，本地 better-sqlite3 缓存，随机空闲端口监听 127.0.0.1。
- **桌面壳**：Electron 主进程拉起 nitro 子进程，就绪后加载 `http://127.0.0.1:<port>/`。
- **内置阅读器**：拦截 `target=_blank` / `window.open`，用 `WebContentsView` 在主窗口内覆盖一层工具栏 + 正文视图。
- **定时刷新**：`setInterval` 调用 `refreshAll()`，通过 `webContents.executeJavaScript` 点击页面内各源刷新按钮。
- **跨平台**：Linux 使用 `SIGTERM` 终止子进程；Windows 使用 `taskkill /f /t` 终止进程树。better-sqlite3 原生模块通过 setup 脚本在目标平台本地安装，确保 ABI 兼容。

## 许可

NewsNow 原项目遵循 MIT 协议，本桌面封装同样基于 MIT。
