package com.dolarfy.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BcvCheckReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        final Context appContext = context.getApplicationContext();

        if (intent != null && Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            BcvNativeHelper.scheduleRepeatingAlarm(appContext);
        }

        final PendingResult result = goAsync();
        new Thread(() -> {
            try {
                BcvNativeHelper.syncLiveAll(appContext);
            } catch (Exception ignored) {
            } finally {
                try {
                    result.finish();
                } catch (Exception ignored) {}
            }
        }).start();
    }
}
