package com.kane.newsnow;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.webkit.WebView;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private int currentMargin = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) { // Android 15+
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                int resId = getResources().getIdentifier("status_bar_height", "dimen", "android");
                int statusBarHeight = resId > 0 ? getResources().getDimensionPixelSize(resId) : 0;
                if (statusBarHeight > 0) {
                    // 第一层（保守值）：先设 margin = 状态栏高度，
                    // 保证任何 ROM 上第一帧内容都不会被状态栏遮挡
                    setTopMargin(webView, statusBarHeight);

                    // 第二层（动态自适配）：部分 ROM（实测小米 HyperOS 3.0 / Android 16）
                    // 会像模拟器一样在窗口层自动处理 insets，把内容容器下移到状态栏下方，
                    // 与我们的 margin 叠加造成"双倍状态栏高度"的过大间距。
                    // 布局完成后通过 WebView 实际屏幕位置反推系统已下移的量：
                    //   系统位移 = WebView 当前位置 - 我们设置的 margin
                    // 然后将 margin 修正为差值，使 WebView 归一化到状态栏正下方——
                    //   系统已处理（位移=状态栏高度）→ margin 修正为 0，无双重间距
                    //   系统未处理（位移=0）        → margin 保持状态栏高度，正确遮挡防护
                    final View content = findViewById(android.R.id.content);
                    if (content != null) {
                        content.getViewTreeObserver().addOnGlobalLayoutListener(
                            new ViewTreeObserver.OnGlobalLayoutListener() {
                                @Override
                                public void onGlobalLayout() {
                                    int[] loc = new int[2];
                                    webView.getLocationOnScreen(loc);
                                    int systemOffset = Math.max(0, loc[1] - currentMargin);
                                    int targetMargin = Math.max(0, statusBarHeight - systemOffset);
                                    setTopMargin(webView, targetMargin);
                                }
                            }
                        );
                    }
                }
            }
        }
        // Android 14 及以下：系统默认 decorFitsSystemWindows=true，自动避开状态栏，无需处理
    }

    /** 设置 WebView 顶部 margin（值变化才触发重布局，防止监听器循环） */
    private void setTopMargin(View view, int margin) {
        ViewGroup.LayoutParams lp = view.getLayoutParams();
        if (lp instanceof CoordinatorLayout.LayoutParams) {
            CoordinatorLayout.LayoutParams clp = (CoordinatorLayout.LayoutParams) lp;
            if (clp.topMargin != margin) {
                clp.topMargin = margin;
                view.setLayoutParams(clp);
            }
        }
        currentMargin = margin;
    }
}
