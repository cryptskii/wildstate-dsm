package org.deterministicstatemachine.wildstate;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Native Android host for the online game; wallet authority stays in the DSM wallet. */
public final class MainActivity extends Activity {
    private WebView game;
    private LinearLayout connectionScreen;
    private TextView connectionMessage;
    private final Uri endpoint = Uri.parse(BuildConfig.GAME_URL);

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(16,37,27));
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(16,37,27));
        game.getSettings().setJavaScriptEnabled(true);
        game.getSettings().setDomStorageEnabled(true);
        game.getSettings().setAllowFileAccess(false);
        game.getSettings().setAllowContentAccess(false);
        game.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(game, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        root.addView(game, new FrameLayout.LayoutParams(-1,-1));
        connectionScreen = new LinearLayout(this);
        connectionScreen.setOrientation(LinearLayout.VERTICAL);
        connectionScreen.setGravity(android.view.Gravity.CENTER);
        connectionScreen.setPadding(32,32,32,32);
        connectionScreen.setBackgroundColor(Color.rgb(16,37,27));
        connectionMessage = new TextView(this);
        connectionMessage.setTextColor(Color.rgb(246,239,210));
        connectionMessage.setTextSize(20);
        connectionMessage.setGravity(android.view.Gravity.CENTER);
        connectionScreen.addView(connectionMessage);
        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(v -> loadGame());
        connectionScreen.addView(retry);
        root.addView(connectionScreen, new FrameLayout.LayoutParams(-1,-1));
        connectionScreen.setVisibility(View.GONE);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left,safe.top,safe.right,safe.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        game.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri destination = request.getUrl();
                if (sameOrigin(destination)) return false;
                if (!request.isForMainFrame()) return true;
                String scheme = destination.getScheme();
                if (!"dsm".equals(scheme) && !"https".equals(scheme) && !"http".equals(scheme)) return true;
                try { startActivity(new Intent(Intent.ACTION_VIEW, destination)); }
                catch (ActivityNotFoundException error) {
                    new AlertDialog.Builder(MainActivity.this).setTitle("DSM wallet needed")
                        .setMessage("Install the DSM wallet, then return here and tap OPEN DSM WALLET. You can also scan the code with a wallet on another device.")
                        .setPositiveButton("OK", null).show();
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (sameOrigin(Uri.parse(url))) hideSystemBars();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showConnectionError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, android.webkit.WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showConnectionError();
            }
        });
        if (savedState == null || game.restoreState(savedState) == null) loadGame();
    }
    private boolean sameOrigin(Uri url) {
        return endpoint.getScheme().equals(url.getScheme()) && endpoint.getHost().equalsIgnoreCase(url.getHost())
            && normalizedPort(endpoint) == normalizedPort(url);
    }
    private static int normalizedPort(Uri url) { return url.getPort() >= 0 ? url.getPort() : "https".equals(url.getScheme()) ? 443 : 80; }
    private void loadGame() { connectionScreen.setVisibility(View.GONE); game.loadUrl(BuildConfig.GAME_URL); }
    private void showConnectionError() {
        connectionMessage.setText(BuildConfig.DEBUG
            ? "Wildstate Preview cannot reach the game. Connect to the same Wi-Fi as the game server and try again."
            : "Wildstate cannot reach the game right now. Check your connection and try again.");
        connectionScreen.setVisibility(View.VISIBLE);
    }
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) { controller.hide(WindowInsets.Type.systemBars()); controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) hideSystemBars(); }
    @Override protected void onPause() { game.onPause(); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (game != null) game.onResume(); }
    @Override protected void onSaveInstanceState(Bundle state) { game.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() { new AlertDialog.Builder(this).setTitle("Leave Wildstate?").setMessage("Your wallet holdings and saved progress are kept.").setNegativeButton("Keep playing",null).setPositiveButton("Leave",(dialog,which)->finish()).show(); }
    @Override protected void onDestroy() { game.stopLoading(); ((android.view.ViewGroup)game.getParent()).removeView(game); game.destroy(); super.onDestroy(); }
}
