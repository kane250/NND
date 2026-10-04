package com.kane.newsnow;

import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ============================================================
        // Android 15+/16（含小米 HyperOS 3.0）状态栏适配终极方案
        // ============================================================
        // 前三次尝试失败的根因：
        //  1. setDecorFitsSystemWindows(true) — Android 15+ targetSdk 35+ 被系统忽略
        //  2. onCreate 时 evaluateJavascript 注入 CSS 变量 — 页面加载覆盖，竞态必输
        //  3. WebView.setPadding() — Android 已知缺陷：WebView 内容渲染忽略 View padding
        //  4. SystemBars 插件（decorView insets 监听）— 小米 HyperOS 等 ROM 劫持
        //     WindowInsetsController / insets 计算失准，监听器不生效或值不对
        //
        // 终极方案：完全不依赖 WindowInsets，直接读取系统状态栏高度资源
        // （android:status_bar_height，所有设备都有，不受 ROM insets 劫持影响），
        // 用 LayoutParams.topMargin 物理下移 WebView —— 这是 Android 布局系统
        // 的基础机制（比 padding 更底层），任何 ROM 都不可能劫持。
        // ============================================================
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) { // API 35+，Android 15+
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
                int statusBarHeight = resId > 0 ? getResources().getDimensionPixelSize(resId) : 0;
                if (statusBarHeight > 0) {
                    ViewGroup.LayoutParams lp = webView.getLayoutParams();
                    if (lp instanceof CoordinatorLayout.LayoutParams) {
                        ((CoordinatorLayout.LayoutParams) lp).topMargin = statusBarHeight;
                        webView.setLayoutParams(lp);
                    }
                }
            }
        }
        // Android 14 及以下：系统默认 decorFitsSystemWindows=true，
        // 窗口自动避开状态栏，不设 margin，避免双重留白。
    }
}
