package com.dolarfy.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
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

        Context appContext = getApplicationContext();
        BcvNativeHelper.ensureNotificationChannel(appContext);
        BcvNativeHelper.cancelAllBackgroundAlarms(appContext);
        BcvNativeHelper.markNotifiedFromFcmBundle(appContext, getIntent() != null ? getIntent().getExtras() : null);
        BcvNativeHelper.syncFromActiveNotifications(appContext);
        ensureNotificationPermission();
        syncTopicSubscription(appContext);

        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                webView.addJavascriptInterface(new DolarfyBridge(), "DolarfyNative");
            }
        } catch (Exception ignored) {}

        startBackgroundLoop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Context appContext = getApplicationContext();
        BcvNativeHelper.markNotifiedFromFcmBundle(appContext, intent != null ? intent.getExtras() : null);
        BcvNativeHelper.syncFromActiveNotifications(appContext);
        triggerAsyncSync(true);
    }

    @Override
    public void onResume() {
        super.onResume();
        BcvNativeHelper.syncFromActiveNotifications(getApplicationContext());
        triggerAsyncSync(true);
    }

    private void syncTopicSubscription(Context context) {
        try {
            if (BcvNativeHelper.isNotificationsEnabled(context)) {
                com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("bcv_rates");
            } else {
                com.google.firebase.messaging.FirebaseMessaging.getInstance().unsubscribeFromTopic("bcv_rates");
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1001 && grantResults != null && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            triggerAsyncSync(true);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript(
                    "(function(){ return Boolean(window.__handleAndroidBack && window.__handleAndroidBack()); })()",
                    value -> {
                        if (!"true".equals(value)) {
                            MainActivity.super.onBackPressed();
                        }
                    }
                );
                return;
            }
        } catch (Exception ignored) {}
        super.onBackPressed();
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
            if (!syncInFlight.compareAndSet(false, true)) return;
            try {
                BcvNativeHelper.syncLiveAll(getApplicationContext(), false);
                lastSyncMs = System.currentTimeMillis();
                notifyWebView();
            } catch (Exception ignored) {
            } finally {
                syncInFlight.set(false);
            }
        }, 0, 45, TimeUnit.SECONDS);
    }

    private void triggerAsyncSync(boolean force) {
        long now = System.currentTimeMillis();
        if (!force && (now - lastSyncMs) < 15000L) return;
        if (!syncInFlight.compareAndSet(false, true)) return;

        new Thread(() -> {
            try {
                BcvNativeHelper.syncLiveAll(getApplicationContext(), false);
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
            Context ctx = getApplicationContext();
            BcvNativeHelper.syncFromActiveNotifications(ctx);
            String isoDate = (dedupKey != null && dedupKey.startsWith("VE_") && dedupKey.length() >= 13)
                ? dedupKey.substring(3, 13)
                : "";
            if (BcvNativeHelper.isRateAlreadyNotifiedOrStale(ctx, isoDate, dedupKey)) {
                return;
            }
            if (dedupKey != null && !dedupKey.isEmpty()) {
                BcvNativeHelper.markKeyNotified(ctx, isoDate, dedupKey);
            }
            BcvNativeHelper.showNativeNotification(ctx, title, body);
        }

        @JavascriptInterface
        public void setNotificationsEnabled(boolean enabled) {
            Context ctx = getApplicationContext();
            BcvNativeHelper.setNotificationsEnabled(ctx, enabled);
            syncTopicSubscription(ctx);
        }

        @JavascriptInterface
        public String getLastNotifiedKey() {
            Context ctx = getApplicationContext();
            BcvNativeHelper.syncFromActiveNotifications(ctx);
            return BcvNativeHelper.getLastNotifiedKey(ctx);
        }

        @JavascriptInterface
        public String getMaxNotifiedIsoDate() {
            Context ctx = getApplicationContext();
            BcvNativeHelper.syncFromActiveNotifications(ctx);
            return BcvNativeHelper.getMaxNotifiedIsoDate(ctx);
        }

        @JavascriptInterface
        public boolean isRateNotifiedOrStale(String isoDate, String dedupKey) {
            Context ctx = getApplicationContext();
            BcvNativeHelper.syncFromActiveNotifications(ctx);
            return BcvNativeHelper.isRateAlreadyNotifiedOrStale(ctx, isoDate, dedupKey);
        }

        @JavascriptInterface
        public void markNotified(String isoDate, String dedupKey) {
            BcvNativeHelper.markKeyNotified(getApplicationContext(), isoDate, dedupKey);
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::ensureNotificationPermission);
        }

        @JavascriptInterface
        public boolean isIgnoringBatteryOptimizations() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    return pm.isIgnoringBatteryOptimizations(getPackageName());
                }
            }
            return true;
        }

        @JavascriptInterface
        public void requestBatteryOptimizationExemption() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            });
        }
    }
}
