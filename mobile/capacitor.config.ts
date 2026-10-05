import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.kane.nnd",
  appName: "NND",
  webDir: "www",
  backgroundColor: "#0f0f0f",
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      // 启动画面保持显示，直到首页首屏数据加载完成后手动隐藏（app.tsx 控制）
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: "#0f0f0f",
      androidSplashResourceName: "splash",
      iosSpinnerStyle: "small",
      showSpinner: false,
    },
    CapacitorHttp: {
      // 启用原生 HTTP（绕过 CORS），在原生平台拦截 fetch
      enabled: true,
    },
  },
}

export default config
