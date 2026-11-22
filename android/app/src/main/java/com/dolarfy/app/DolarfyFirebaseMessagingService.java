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
        Context context = getApplicationContext();
        try {
            if (BcvNativeHelper.isNotificationsEnabled(context)) {
                FirebaseMessaging.getInstance().subscribeToTopic("bcv_rates");
            } else {
                FirebaseMessaging.getInstance().unsubscribeFromTopic("bcv_rates");
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Context context = getApplicationContext();

        try {
            if (!BcvNativeHelper.isNotificationsEnabled(context)) return;

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
                if (data.get("title") != null && !data.get("title").isEmpty()) {
                    title = data.get("title");
                }
                String usdStr = data.get("usd");
                String eurStr = data.get("eur");
                String shortDate = data.get("shortDate");
                String isoDate = data.get("isoDate");
                String expanded = data.get("expandedText");
                String dataKey = data.get("dedupKey");
                boolean isForce = "true".equalsIgnoreCase(data.get("force")) || "true".equalsIgnoreCase(data.get("test"));

                if (body == null && usdStr != null) {
                    body = "USD = Bs. " + usdStr + " | EUR = Bs. " + (eurStr != null ? eurStr : "0.00") + " Fecha: " + (shortDate != null ? shortDate : "");
                }

                String dedupKey = (dataKey != null && !dataKey.isEmpty())
                    ? dataKey
                    : (usdStr != null && isoDate != null
                        ? "VE_" + isoDate + "_" + usdStr + "_" + (eurStr != null ? eurStr : "0.00")
                        : "");

                if (!isForce && !dedupKey.isEmpty()) {
                    BcvNativeHelper.syncFromActiveNotifications(context);
                    if (BcvNativeHelper.isRateAlreadyNotifiedOrStale(context, isoDate, dedupKey)) {
                        return;
                    }
                    BcvNativeHelper.markKeyNotified(context, isoDate, dedupKey);
                }

                if (expanded != null) {
                    body = expanded;
                }
            }

            // En Android FCM, onMessageReceived se invoca cuando la app está abierta en primer plano.
            // Al validar monotónicamente la Fecha Valor y el historial reciente, garantizamos 1 solo aviso.
            if (body != null) {
                BcvNativeHelper.showNativeNotification(context, title, body);
            }
        } catch (Exception ignored) {}
    }
}
