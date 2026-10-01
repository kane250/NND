# NewsNow Desktop & Mobile

基于 [newsnext/newsnow](https://github.com/newsnext/newsnow) 改造的**跨平台新闻聚合阅读器**，支持 **Linux、Windows、Android、iOS** 四平台。

| 平台 | 技术方案 | 状态 |
| --- | --- | --- |
| **Linux** | Electron 封装 + 内置 nitro 服务端 | ✅ 可用 |
| **Windows** | Electron 封装 + 内置 nitro 服务端 | ✅ 可用 |
| **Android** | Capacitor + 原生 HTTP 直抓（无后端） | ✅ 可构建 APK |
| **iOS** | Capacitor + 原生 HTTP 直抓（无后端） | 📱 代码已生成，需 Mac+Xcode 构建 |

## 功能特性

- **选择订阅**：浏览全部 66 个新闻源（知乎/微博/百度/36氪/B站等），星标订阅，分类管理
- **定期刷新**：自动刷新定时器（5/10/15/30/60 分钟可配），服务端按各源自身间隔缓存
- **按需刷新**：单源刷新按钮 + 一键刷新全部（Ctrl+R）
- **新闻列表**：卡片式热榜/时间线，含标题、热度、发布时间、排序变化
- **内置阅读器**（桌面端）：点击新闻在程序内部查看，支持后退/前进/地址栏导航
- **移动端适配**：响应式布局，原生 HTTP 绕过 CORS，本地缓存离线可用

## 项目结构

```
newsnow-desktop/
├── main.cjs              # Electron 主进程（桌面端）
├── viewer.html            # 桌面端内置阅读器 UI
├── settings.html          # 桌面端设置窗口
├── start.sh / start.bat   # 桌面端启动脚本
├── setup.sh / setup.bat   # 桌面端依赖安装
├── build.sh               # 从源码构建 NewsNow
├── app/                    # NewsNow 构建产物（nitro 服务端 + React 前端）
│   ├── server/           #   nitro(h3) + better-sqlite3 缓存
│   └── public/           #   React 静态资源
└── mobile/                 # 移动端（Capacitor）
    ├── capacitor.config.ts #   Capacitor 配置（原生 HTTP 已启用）
    ├── build-web.mjs      #   Web 资源构建脚本（esbuild）
    ├── src/               #   移动端源码
    │   ├── app.tsx        #     React 应用入口
    │   ├── fetch.ts       #     跨平台 HTTP 客户端（原生/浏览器自动切换）
    │   ├── api.ts         #     前端 API 层（替代后端 API）
    │   ├── getters.ts     #     66 源注册表 + fetchSource
    │   ├── cache.ts       #     本地缓存（Preferences/localStorage）
    │   ├── sources/       #     66 个新闻源抓取逻辑（移植自服务端）
    │   ├── date.ts        #     中文相对时间解析
    │   ├── rss.ts         #     RSS/Atom 解析
    │   └── sources-data.json # 源元数据
    ├── android/           #   Android 原生项目（Gradle 构建）
    ├── ios/               #   iOS 原生项目（需 Mac+Xcode 构建）
    ├── www/               #   构建产物（Capacitor webDir）
    └── release/           #   APK 输出
```

## 移动端架构

移动端无法运行 Node.js 服务端，采用**前端直抓**架构：

```
┌─────────────────────────────────────┐
│         Capacitor WebView           │
│  ┌───────────────────────────────┐  │
│  │      React 前端（app.tsx）      │  │
│  ├───────────────────────────────┤  │
│  │   前端 API 层（api.ts）         │  │
│  │   · getSourceData(id)         │  │
│  │   · 缓存检查 → 抓取 → 存缓存    │  │
│  ├───────────────────────────────┤  │
│  │   66 源抓取器（sources/*.ts）   │  │
│  │   · JSON API / HTML / RSS     │  │
│  ├───────────────────────────────┤  │
│  │   跨平台 HTTP（fetch.ts）       │  │
│  │   · Capacitor 原生 HTTP       │  │
│  │     （绕过 CORS）              │  │
│  │   · 浏览器 fallback: fetch     │  │
│  ├───────────────────────────────┤  │
│  │   本地缓存（cache.ts）          │  │
│  │   · Capacitor Preferences     │  │
│  │   · localStorage fallback     │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**关键设计**：
- `@capacitor/http`（Capacitor 8 内置 `CapacitorHttp` 插件）在原生平台拦截所有 fetch 请求，用原生 HTTP 发出，**天然绕过 CORS**
- 缓存用 `@capacitor/preferences`（Android SharedPreferences / iOS UserDefaults），按各源的 `interval` 控制刷新频率
- 66 个源的抓取逻辑从原项目 `server/sources/*.ts` 移植，依赖替换：
  - `cheerio`（HTML 解析）→ 使用其 browser 构建
  - `fast-xml-parser`（RSS 解析）→ 纯 JS，直接可用
  - `ofetch` → 自研 `fetch.ts` 兼容层（支持 query/headers/responseType/raw）
  - `iconv-lite`（GBK 编码）→ `TextDecoder("gbk")`
  - `better-sqlite3`（缓存）→ Preferences/localStorage

## 移动端构建

### 环境要求

| 工具 | Android | iOS |
| --- | --- | --- |
| Node.js v18+ | ✅ | ✅ |
| JDK 17+ | ✅ | - |
| Android SDK (API 36) | ✅ | - |
| Gradle 8.14+ | ✅（项目自带 gradlew） | - |
| macOS + Xcode 15+ | - | ✅ |

### Android APK 构建

```bash
cd mobile

# 1. 安装依赖
npm install

# 2. 构建 Web 资源
node build-web.mjs

# 3. 同步到 Android 项目
npx cap sync android

# 4. 构建 APK（debug）
cd android
export ANDROID_HOME=$HOME/Android/Sdk
./gradlew assembleDebug
# 产物: android/app/build/outputs/apk/debug/app-debug.apk

# 构建 Release APK（需签名配置）
./gradlew assembleRelease
```

### iOS 构建（需 Mac）

```bash
cd mobile

# 1. 安装依赖
npm install

# 2. 构建 Web 资源
node build-web.mjs

# 3. 同步到 iOS 项目
npx cap sync ios

# 4. 用 Xcode 打开构建
npx cap open ios
# 在 Xcode 中: Product → Build (Cmd+B) / Run (Cmd+R)
# 或命令行: npx cap build ios
```

### 移动端开发调试

```bash
cd mobile
node build-web.mjs --watch   # 监听 Web 资源变更
npx cap sync                 # 同步到原生项目
npx cap open android          # Android Studio 打开
npx cap open ios              # Xcode 打开
```

## 桌面端使用

### Linux

```bash
./setup.sh    # 安装原生依赖
./start.sh    # 启动
```

### Windows

```cmd
setup.bat    & :: 安装原生依赖
start.bat    & :: 启动
```

### 操作说明

| 操作 | 方式 |
| --- | --- |
| 刷新全部 | **Ctrl+R** |
| 打开设置 | **Ctrl+,** |
| 阅读新闻 | 点击标题 → 内置阅读器 |
| 阅读器后退/前进 | **Alt+← / Alt+→** |
| 返回新闻列表 | **Esc** |

## 数据源测试结果

移动端前端直抓架构下，66 个源中 **59 个可正常抓取**：

- ✅ 59 源正常（知乎、微博、百度、36氪、B站、Hacker News、GitHub Trending、财联社、华尔街见闻、IT之家等）
- ⚠️ 7 源受限（原因为外部限制，非代码问题）：
  - `douyin` / `xueqiu`：需要 cookie（原生 HTTP 环境下可获取，纯浏览器测试环境拿不到 set-cookie）
  - `pcbeta`：目标站有反爬滑块验证
  - `qqvideo`：腾讯视频 API 返回数据结构变化

## 许可

NewsNow 原项目遵循 MIT 协议，本项目同样基于 MIT。
