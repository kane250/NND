package com.kane.newsnow;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 防止 edge-to-edge（Android 15+ targetSdk 35+ 强制开启）：
        // 明确要求系统栏不与内容重叠，WebView 从状态栏下方开始渲染
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // 保险层：读取实际状态栏高度（设备像素→CSS 像素），注入 CSS 变量
        // 即使个别机型 setDecorFitsSystemWindows 不生效，Web 层仍有正确留白
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            View rootView = webView.getRootView();
            float density = getResources().getDisplayMetrics().density;
            rootView.post(() -> {
                androidx.core.view.WindowInsetsCompat insets =
                    androidx.core.view.ViewCompat.getRootWindowInsets(rootView);
                if (insets != null) {
                    int statusBarPx = insets.getInsets(
                        androidx.core.view.WindowInsetsCompat.Type.statusBars()
                    ).top;
                    float cssPx = statusBarPx / density;
                    webView.evaluateJavascript(
                        "document.documentElement.style.setProperty('--safe-top', '" + cssPx + "px');",
                        null
                    );
                }
            });
        }
    }
}
