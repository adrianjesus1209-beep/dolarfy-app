package com.dolarfy.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {
    private ScheduledExecutorService scheduler;
    private final AtomicBoolean syncInFlight = new AtomicBoolean(false);
    private long lastSyncMs = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ensureNotificationPermission();
        BcvNativeHelper.scheduleRepeatingAlarm(getApplicationContext());

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.addJavascriptInterface(new DolarfyBridge(), "DolarfyNative");
            }
        } catch (Exception ignored) {}

        startBackgroundLoop();
    }

    @Override
    public void onResume() {
        super.onResume();
        triggerAsyncSync(true);
    }

    @Override
    public void onDestroy() {
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
        super.onDestroy();
    }

    private void ensureNotificationPermission() {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        1001
                    );
                }
            }
        } catch (Exception ignored) {}
    }

    private void startBackgroundLoop() {
        if (scheduler != null) return;
        scheduler = Executors.newSingleThreadScheduledExecutor();
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                BcvNativeHelper.syncLiveAll(getApplicationContext());
                lastSyncMs = System.currentTimeMillis();
                notifyWebView();
            } catch (Exception ignored) {}
        }, 0, 45, TimeUnit.SECONDS);
    }

    private void triggerAsyncSync(boolean force) {
        long now = System.currentTimeMillis();
        if (!force && (now - lastSyncMs) < 15000L) return;
        if (!syncInFlight.compareAndSet(false, true)) return;

        new Thread(() -> {
            try {
                BcvNativeHelper.syncLiveAll(getApplicationContext());
                lastSyncMs = System.currentTimeMillis();
                notifyWebView();
            } catch (Exception ignored) {
            } finally {
                syncInFlight.set(false);
            }
        }).start();
    }

    private void notifyWebView() {
        try {
            runOnUiThread(() -> {
                try {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(
                            "window.__onDolarfyNativeSync && window.__onDolarfyNativeSync();",
                            null
                        );
                    }
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    public class DolarfyBridge {
        @JavascriptInterface
        public String getCachedLivePayload() {
            return BcvNativeHelper.getCachedPayload(getApplicationContext());
        }

        @JavascriptInterface
        public void requestLiveSync(boolean force) {
            triggerAsyncSync(force);
        }

        @JavascriptInterface
        public void showNotification(String title, String body, String dedupKey) {
            if (dedupKey != null && !dedupKey.isEmpty()) {
                BcvNativeHelper.setLastNotifiedKey(getApplicationContext(), dedupKey);
            }
            BcvNativeHelper.showNativeNotification(getApplicationContext(), title, body);
        }

        @JavascriptInterface
        public void setNotificationsEnabled(boolean enabled) {
            BcvNativeHelper.setNotificationsEnabled(getApplicationContext(), enabled);
        }

        @JavascriptInterface
        public String getLastNotifiedKey() {
            return BcvNativeHelper.getLastNotifiedKey(getApplicationContext());
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::ensureNotificationPermission);
        }
    }
}
