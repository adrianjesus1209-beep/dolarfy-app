package com.dolarfy.app;

import android.content.Context;
import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class DolarfyFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // Suscribir automáticamente al tema general de alertas del BCV
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("bcv_rates");
        } catch (Exception ignored) {}
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Context context = getApplicationContext();

        try {
            String title = "📢 Nueva Tasa BCV Disponible";
            String body = null;

            if (remoteMessage.getNotification() != null) {
                if (remoteMessage.getNotification().getTitle() != null) {
                    title = remoteMessage.getNotification().getTitle();
                }
                body = remoteMessage.getNotification().getBody();
            }

            Map<String, String> data = remoteMessage.getData();
            if (data != null && !data.isEmpty()) {
                String usdStr = data.get("usd");
                String eurStr = data.get("eur");
                String shortDate = data.get("shortDate");
                String isoDate = data.get("isoDate");
                String expanded = data.get("expandedText");

                if (body == null && usdStr != null) {
                    body = "USD = Bs. " + usdStr + " | EUR = Bs. " + (eurStr != null ? eurStr : "0.00") + " Fecha: " + (shortDate != null ? shortDate : "");
                }

                if (usdStr != null && isoDate != null) {
                    String dedupKey = "VE_" + isoDate + "_" + usdStr + "_" + (eurStr != null ? eurStr : "0.00");
                    String lastKey = BcvNativeHelper.getLastNotifiedKey(context);
                    if (dedupKey.equals(lastKey)) return;
                    BcvNativeHelper.setLastNotifiedKey(context, dedupKey);
                }

                if (expanded != null) {
                    body = expanded;
                }
            }

            if (body != null) {
                BcvNativeHelper.showNativeNotification(context, title, body);
            }
        } catch (Exception ignored) {}
    }
}
