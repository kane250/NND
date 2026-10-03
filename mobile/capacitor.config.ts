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
      launchShowDuration: 1000,
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
