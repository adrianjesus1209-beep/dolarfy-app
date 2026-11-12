package com.dolarfy.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

public class BcvCheckReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        final Context appContext = context.getApplicationContext();

        // 1. Asegurar canal de notificaciones y siguiente ciclo de alarmas
        BcvNativeHelper.ensureNotificationChannel(appContext);
        BcvNativeHelper.scheduleNextAlarm(appContext);

        // 2. Asegurar también el trabajo periódico de WorkManager
        BcvSyncWorker.enqueuePeriodicSync(appContext);

        // 3. Adquirir WakeLock para que la CPU no se apague mientras se consulta el BCV/APIs en segundo plano
        PowerManager pm = (PowerManager) appContext.getSystemService(Context.POWER_SERVICE);
        final PowerManager.WakeLock wakeLock;
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dolarfy:bcv_sync_wakelock");
            try {
                wakeLock.acquire(45000L); // 45 segundos máximo
            } catch (Exception ignored) {}
        } else {
            wakeLock = null;
        }

        final PendingResult result = goAsync();
        new Thread(() -> {
            try {
                BcvNativeHelper.syncLiveAll(appContext);
            } catch (Exception ignored) {
            } finally {
                if (wakeLock != null && wakeLock.isHeld()) {
                    try {
                        wakeLock.release();
                    } catch (Exception ignored) {}
                }
                try {
                    result.finish();
                } catch (Exception ignored) {}
            }
        }).start();
    }
}
