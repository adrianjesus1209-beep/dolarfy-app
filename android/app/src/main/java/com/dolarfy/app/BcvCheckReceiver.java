package com.dolarfy.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BcvCheckReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        // Limpiar cualquier alarma residual de versiones anteriores; FCM gestiona las alertas push.
        BcvNativeHelper.cancelAllBackgroundAlarms(context.getApplicationContext());
    }
}
