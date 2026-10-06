package org.deterministicstatemachine.wildstate;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewAssetLoader;

/**
 * Native Android host for the online game. The game's client (art, sound, code) ships in the APK
 * and is served from a fixed HTTPS origin; it connects to the game server named at build time.
 * Wallet authority stays in the DSM wallet.
 */
public final class MainActivity extends Activity {
    private static final Uri GAME = Uri.parse("https://" + WebViewAssetLoader.DEFAULT_DOMAIN + "/index.html");
    /** What a player owns lives in this wallet: without it on the phone there is no game. */
    private static final String WALLET = "com.dsm.wallet";
    private WebView game;
    private View walletNeeded;
    private Bundle restored;

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
        // A debug build may reach a development server on the LAN over plain http/ws.
        game.getSettings().setMixedContentMode(BuildConfig.DEBUG ? WebSettings.MIXED_CONTENT_ALWAYS_ALLOW : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(game, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        root.addView(game, new FrameLayout.LayoutParams(-1,-1));
        walletNeeded = walletNeededScreen();
        root.addView(walletNeeded, new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(safe.left,safe.top,safe.right,safe.bottom);
                return WindowInsets.CONSUMED;
            });
        }
        // The bundled client is packaged under assets/game/ and served as the origin's root.
        WebViewAssetLoader.AssetsPathHandler bundled = new WebViewAssetLoader.AssetsPathHandler(this);
        WebViewAssetLoader client = new WebViewAssetLoader.Builder().addPathHandler("/", path -> bundled.handle("game/" + path)).build();
        game.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return client.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri destination = request.getUrl();
                if (sameOrigin(destination)) return false;
                if (!request.isForMainFrame()) return true;
                String scheme = destination.getScheme();
                if (!"dsm".equals(scheme) && !"https".equals(scheme) && !"http".equals(scheme)) return true;
                // "dsm:wallet": the wallet itself, where a request waits for the player's approval.
                if ("dsm".equals(scheme) && "wallet".equals(destination.getSchemeSpecificPart())) {
                    Intent wallet = getPackageManager().getLaunchIntentForPackage(WALLET);
                    if (wallet != null) { startActivity(wallet); return true; }
                }
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
        });
        restored = savedState;
        requireWallet();
    }
    private boolean walletInstalled() {
        try { getPackageManager().getPackageInfo(WALLET, 0); return true; }
        catch (PackageManager.NameNotFoundException missing) { return false; }
    }
    /** The game loads only while the DSM wallet is installed; removing it closes the game. */
    private void requireWallet() {
        boolean present = walletInstalled();
        walletNeeded.setVisibility(present ? View.GONE : View.VISIBLE);
        if (!present) {
            game.setVisibility(View.GONE);
            game.loadUrl("about:blank");
            return;
        }
        game.setVisibility(View.VISIBLE);
        String shown = game.getUrl();
        if (shown != null && sameOrigin(Uri.parse(shown))) return;
        if (restored == null || game.restoreState(restored) == null) game.loadUrl(GAME.toString());
        restored = null;
    }
    private View walletNeededScreen() {
        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setGravity(android.view.Gravity.CENTER);
        screen.setPadding(48, 48, 48, 48);
        screen.setBackgroundColor(Color.rgb(16,37,27));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.wildstate_logo);
        logo.setAdjustViewBounds(true);
        screen.addView(logo, new LinearLayout.LayoutParams(-1, -2));
        TextView title = new TextView(this);
        title.setText("Wildstate needs the DSM wallet");
        title.setTextColor(Color.rgb(246,239,210));
        title.setTextSize(22);
        title.setGravity(android.view.Gravity.CENTER);
        title.setPadding(0, 48, 0, 16);
        screen.addView(title);
        TextView detail = new TextView(this);
        detail.setText("Your creatures and WILD live in your DSM wallet. Install it on this phone, then come back.");
        detail.setTextColor(Color.rgb(207,227,203));
        detail.setTextSize(16);
        detail.setGravity(android.view.Gravity.CENTER);
        detail.setPadding(0, 0, 0, 32);
        screen.addView(detail);
        Button retry = new Button(this);
        retry.setText("I've installed it");
        retry.setOnClickListener(v -> requireWallet());
        screen.addView(retry);
        return screen;
    }
    private static boolean sameOrigin(Uri url) {
        return GAME.getScheme().equals(url.getScheme()) && GAME.getHost().equalsIgnoreCase(url.getHost()) && url.getPort() < 0;
    }
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) { controller.hide(WindowInsets.Type.systemBars()); controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    @Override public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) hideSystemBars(); }
    @Override protected void onPause() { game.onPause(); CookieManager.getInstance().flush(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (game != null) { game.onResume(); requireWallet(); } }
    @Override protected void onSaveInstanceState(Bundle state) { game.saveState(state); super.onSaveInstanceState(state); }
    @Override public void onBackPressed() { new AlertDialog.Builder(this).setTitle("Leave Wildstate?").setMessage("Your wallet holdings and saved progress are kept.").setNegativeButton("Keep playing",null).setPositiveButton("Leave",(dialog,which)->finish()).show(); }
    @Override protected void onDestroy() { game.stopLoading(); ((android.view.ViewGroup)game.getParent()).removeView(game); game.destroy(); super.onDestroy(); }
}
