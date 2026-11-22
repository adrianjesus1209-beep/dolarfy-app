package com.dolarfy.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;

public class BcvNativeHelper {
    public static final String PREFS_NAME = "dolarfy_native_prefs";
    public static final String KEY_ENABLED = "notifications_enabled";
    public static final String KEY_LAST_NOTIFIED = "last_notified_key";
    public static final String KEY_MAX_ISO_DATE = "max_notified_iso_date";
    public static final String KEY_RECENT_KEYS = "recent_notified_keys";
    public static final String KEY_LAST_PAYLOAD = "last_live_payload";
    public static final String CHANNEL_ID = "dolarfy_bcv_alerts";
    public static final String ALERT_TAG = "dolarfy_bcv_alert";
    public static final int ALERT_ID = 0;

    private static volatile String memoryPayload = null;

    public static String getCachedPayload(Context context) {
        if (memoryPayload != null) return memoryPayload;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getString(KEY_LAST_PAYLOAD, null);
        } catch (Exception e) {
            return null;
        }
    }

    public static void setNotificationsEnabled(Context context, boolean enabled) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(KEY_ENABLED, enabled).commit();
        } catch (Exception ignored) {}
    }

    public static boolean isNotificationsEnabled(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getBoolean(KEY_ENABLED, true);
        } catch (Exception e) {
            return true;
        }
    }

    public static String getLastNotifiedKey(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getString(KEY_LAST_NOTIFIED, "");
        } catch (Exception e) {
            return "";
        }
    }

    public static String getMaxNotifiedIsoDate(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String stored = prefs.getString(KEY_MAX_ISO_DATE, "");
            if (stored != null && !stored.isEmpty()) return stored;
            String lastKey = prefs.getString(KEY_LAST_NOTIFIED, "");
            if (lastKey != null && lastKey.startsWith("VE_") && lastKey.length() >= 13) {
                return lastKey.substring(3, 13);
            }
        } catch (Exception ignored) {}
        return "";
    }

    private static List<String> loadRecentKeys(SharedPreferences prefs) {
        List<String> list = new ArrayList<>();
        try {
            String raw = prefs.getString(KEY_RECENT_KEYS, "");
            if (raw != null && !raw.isEmpty()) {
                for (String item : raw.split(",")) {
                    if (item != null && !item.trim().isEmpty()) {
                        list.add(item.trim());
                    }
                }
            }
        } catch (Exception ignored) {}
        return list;
    }

    public static void setLastNotifiedKey(Context context, String key) {
        String isoDate = "";
        if (key != null && key.startsWith("VE_") && key.length() >= 13) {
            isoDate = key.substring(3, 13);
        }
        markKeyNotified(context, isoDate, key);
    }

    public static synchronized void markKeyNotified(Context context, String isoDate, String dedupKey) {
        if (context == null || dedupKey == null || dedupKey.isEmpty()) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String currentMax = getMaxNotifiedIsoDate(context);
            String resolvedIso = (isoDate != null && isoDate.length() >= 10)
                ? isoDate.substring(0, 10)
                : (dedupKey.startsWith("VE_") && dedupKey.length() >= 13 ? dedupKey.substring(3, 13) : "");

            // Nunca retroceder KEY_MAX_ISO_DATE hacia una fecha menor
            String nextMax = currentMax;
            if (!resolvedIso.isEmpty() && (currentMax.isEmpty() || resolvedIso.compareTo(currentMax) >= 0)) {
                nextMax = resolvedIso;
            }

            List<String> recent = loadRecentKeys(prefs);
            List<String> updated = new ArrayList<>();
            updated.add(dedupKey);
            for (String existing : recent) {
                if (!dedupKey.equals(existing) && updated.size() < 15) {
                    updated.add(existing);
                }
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < updated.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(updated.get(i));
            }

            SharedPreferences.Editor editor = prefs.edit();
            if (currentMax.isEmpty() || resolvedIso.isEmpty() || resolvedIso.compareTo(currentMax) >= 0) {
                editor.putString(KEY_LAST_NOTIFIED, dedupKey);
            }
            if (!nextMax.isEmpty()) {
                editor.putString(KEY_MAX_ISO_DATE, nextMax);
            }
            editor.putString(KEY_RECENT_KEYS, sb.toString());
            editor.commit();
        } catch (Exception ignored) {}
    }

    public static synchronized boolean isRateAlreadyNotifiedOrStale(Context context, String isoDate, String dedupKey) {
        if (context == null) return true;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String maxIso = getMaxNotifiedIsoDate(context);
            String todayIso = getTodayVenezuelaIso();
            String resolvedIso = (isoDate != null && isoDate.length() >= 10) ? isoDate.substring(0, 10) : "";

            if (!resolvedIso.isEmpty() && !maxIso.isEmpty()) {
                // Bloqueo monotónico: jamás permitir fecha anterior a la máxima ya notificada
                if (resolvedIso.compareTo(maxIso) < 0) {
                    return true;
                }
                // Si ya notificamos el próximo día hábil (> hoy), ignorar cualquier lectura de hoy
                if (!todayIso.isEmpty() && maxIso.compareTo(todayIso) > 0 && resolvedIso.compareTo(todayIso) <= 0) {
                    return true;
                }
            }

            if (dedupKey != null && !dedupKey.isEmpty()) {
                String lastKey = prefs.getString(KEY_LAST_NOTIFIED, "");
                if (dedupKey.equals(lastKey)) return true;
                if (loadRecentKeys(prefs).contains(dedupKey)) return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    public static void markNotifiedFromFcmBundle(Context context, Bundle extras) {
        if (context == null || extras == null) return;
        try {
            String isoDate = extras.getString("isoDate", "");
            String usdStr = extras.getString("usd", "");
            String eurStr = extras.getString("eur", "0.00");
            String dedupKey = extras.getString("dedupKey", "");
            if (dedupKey.isEmpty() && !isoDate.isEmpty() && !usdStr.isEmpty()) {
                dedupKey = "VE_" + isoDate + "_" + usdStr + "_" + (eurStr != null && !eurStr.isEmpty() ? eurStr : "0.00");
            }
            if (!dedupKey.isEmpty()) {
                markKeyNotified(context, isoDate, dedupKey);
            }
        } catch (Exception ignored) {}
    }

    /**
     * Sincroniza el estado local si Google Play Services ya publicó una notificación activa
     * mientras la app estaba cerrada (evita re-notificar al abrir o reanudar la app).
     */
    public static void syncFromActiveNotifications(Context context) {
        if (context == null) return;
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            StatusBarNotification[] active = nm.getActiveNotifications();
            if (active == null) return;

            for (StatusBarNotification sbn : active) {
                if (sbn == null || !ALERT_TAG.equals(sbn.getTag())) continue;
                Notification notif = sbn.getNotification();
                if (notif == null || notif.extras == null) continue;

                CharSequence bigCs = notif.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
                CharSequence textCs = notif.extras.getCharSequence(Notification.EXTRA_TEXT);
                String text = bigCs != null ? bigCs.toString() : (textCs != null ? textCs.toString() : "");
                if (text.isEmpty()) continue;

                Matcher mUsd = Pattern.compile("USD\\s*=\\s*Bs\\.\\s*([\\d.]+)", Pattern.CASE_INSENSITIVE).matcher(text);
                Matcher mEur = Pattern.compile("EUR\\s*=\\s*Bs\\.\\s*([\\d.]+)", Pattern.CASE_INSENSITIVE).matcher(text);
                Matcher mFecha = Pattern.compile("Fecha:\\s*(\\d{2})/(\\d{2})/(\\d{4})", Pattern.CASE_INSENSITIVE).matcher(text);

                if (mUsd.find() && mFecha.find()) {
                    String usdStr = mUsd.group(1);
                    String eurStr = mEur.find() ? mEur.group(1) : "0.00";
                    String isoDate = mFecha.group(3) + "-" + mFecha.group(2) + "-" + mFecha.group(1);
                    String dedupKey = "VE_" + isoDate + "_" + usdStr + "_" + eurStr;
                    markKeyNotified(context, isoDate, dedupKey);
                }
            }
        } catch (Exception ignored) {}
    }

    public static String getTodayVenezuelaIso() {
        try {
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("America/Caracas"));
            return String.format(Locale.US, "%04d-%02d-%02d",
                cal.get(Calendar.YEAR),
                cal.get(Calendar.MONTH) + 1,
                cal.get(Calendar.DAY_OF_MONTH));
        } catch (Exception e) {
            return "";
        }
    }

    public static int getCurrentVenezuelaHour() {
        try {
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("America/Caracas"));
            return cal.get(Calendar.HOUR_OF_DAY);
        } catch (Exception e) {
            return 12;
        }
    }

    public static void cancelAllBackgroundAlarms(Context context) {
        if (context == null) return;
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                Intent intent = new Intent(context, BcvCheckReceiver.class);
                intent.setAction("com.dolarfy.app.ACTION_CHECK_BCV");
                int flags = PendingIntent.FLAG_NO_CREATE;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getBroadcast(context, 7001, intent, flags);
                if (pi != null) {
                    am.cancel(pi);
                    pi.cancel();
                }
            }
        } catch (Exception ignored) {}
        try {
            WorkManager.getInstance(context).cancelUniqueWork(BcvSyncWorker.UNIQUE_WORK_NAME);
            WorkManager.getInstance(context).cancelUniqueWork(BcvSyncWorker.UNIQUE_TURBO_WORK_NAME);
        } catch (Exception ignored) {}
    }

    public static void scheduleRepeatingAlarm(Context context) {
        // Las notificaciones push ahora operan exclusivamente vía Firebase Cloud Messaging (FCM)
        // para garantizar cero competencia y cero sonidos duplicados. Cancelar alarmas previas.
        cancelAllBackgroundAlarms(context);
    }

    public static JSONObject syncLiveAll(Context context) {
        return syncLiveAll(context, false);
    }

    public static JSONObject syncLiveAll(Context context, boolean allowNotify) {
        JSONObject result = new JSONObject();
        try {
            JSONObject bcv = fetchBcvDirect();
            JSONObject binance = fetchBinanceDirect();
            result.put("bcv", bcv);
            result.put("binance", binance);
            result.put("timestamp", System.currentTimeMillis());

            if ("ok".equals(bcv.optString("status")) || "ok".equals(binance.optString("status"))) {
                String jsonStr = result.toString();
                memoryPayload = jsonStr;
                if (context != null) {
                    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(KEY_LAST_PAYLOAD, jsonStr).apply();
                    if (allowNotify && "ok".equals(bcv.optString("status"))) {
                        checkAndNotifyBcv(context, bcv);
                    }
                }
            }
        } catch (Exception ignored) {}
        return result;
    }

    public static boolean canPostNotifications(Context context) {
        if (context == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
                    return false;
                }
            }
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !nm.areNotificationsEnabled()) {
                return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public static void checkAndNotifyBcv(Context context, JSONObject bcv) {
        if (context == null || bcv == null) return;
        try {
            if (!isNotificationsEnabled(context)) return;
            if (!canPostNotifications(context)) return;
            if (!"ok".equals(bcv.optString("status"))) return;

            syncFromActiveNotifications(context);

            double usd = bcv.optDouble("usd", 0);
            double eur = bcv.optDouble("eur", 0);
            String isoDate = bcv.optString("isoDate", "");
            String shortDate = bcv.optString("shortDate", "");
            if (usd <= 0 || isoDate.isEmpty()) return;

            String usdStr = String.format(Locale.US, "%.2f", usd);
            String eurStr = eur > 0 ? String.format(Locale.US, "%.2f", eur) : "0.00";
            String dedupKey = "VE_" + isoDate + "_" + usdStr + "_" + eurStr;

            if (isRateAlreadyNotifiedOrStale(context, isoDate, dedupKey)) return;

            markKeyNotified(context, isoDate, dedupKey);
            showNativeNotification(context, "📢 Nueva Tasa BCV Disponible",
                "USD = Bs. " + usdStr + " | EUR = Bs. " + eurStr + "\nFecha: " + shortDate);
        } catch (Exception ignored) {}
    }

    public static void ensureNotificationChannel(Context context) {
        if (context == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Alertas BCV Oficial",
                        NotificationManager.IMPORTANCE_HIGH
                    );
                    channel.setDescription("Notificaciones en tiempo real de nuevas tasas oficiales del BCV");
                    channel.enableVibration(true);
                    nm.createNotificationChannel(channel);
                }
            }
        } catch (Exception ignored) {}
    }

    public static boolean showNativeNotification(Context context, String title, String body) {
        try {
            if (!canPostNotifications(context)) return false;
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return false;

            ensureNotificationChannel(context);

            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent contentIntent = PendingIntent.getActivity(context, 0, launchIntent, piFlags);

            String collapsedText = body != null ? body.replace("\n", " ") : "";
            String expandedText = body != null ? body : "";

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title != null ? title : "📢 Nueva Tasa BCV Disponible")
                .setContentText(collapsedText)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(expandedText))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(contentIntent);

            nm.cancel(ALERT_TAG, ALERT_ID);
            nm.notify(ALERT_TAG, ALERT_ID, builder.build());
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String readStream(InputStream is) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append("\n");
        }
        reader.close();
        return sb.toString();
    }

    private static boolean isBetterCandidate(JSONObject candidate, JSONObject currentBest) {
        if (candidate == null || !"ok".equals(candidate.optString("status"))) return false;
        if (currentBest == null || !"ok".equals(currentBest.optString("status"))) return true;
        String candIso = candidate.optString("isoDate", "");
        String bestIso = currentBest.optString("isoDate", "");
        return candIso.compareTo(bestIso) > 0;
    }

    public static JSONObject fetchBcvDirect() {
        String todayIso = getTodayVenezuelaIso();
        boolean checkBackupIfNotTomorrow = getCurrentVenezuelaHour() >= 16;
        JSONObject best = null;

        // 1. Conexión directa oficial a https://www.bcv.org.ve/ (validada con CA Sectigo oficial en network_security_config.xml)
        try {
            long cb = System.currentTimeMillis() / 5000L;
            URL url = new URL("https://www.bcv.org.ve/?_cb=" + cb);
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(4500);
            conn.setReadTimeout(5500);
            conn.setUseCaches(false);
            conn.setRequestProperty("Cache-Control", "no-cache, no-store, must-revalidate");
            conn.setRequestProperty("Pragma", "no-cache");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36");

            if (conn.getResponseCode() == 200) {
                String html = readStream(conn.getInputStream());
                JSONObject parsed = parseBcvText(html);
                if (isBetterCandidate(parsed, best)) {
                    best = parsed;
                }
                // Si ya tenemos la tasa del próximo día hábil (> hoy) o aún no son las 4:00 PM VET, retornar al instante
                if (best != null) {
                    String iso = best.optString("isoDate", "");
                    if ((!todayIso.isEmpty() && iso.compareTo(todayIso) > 0) || !checkBackupIfNotTomorrow) {
                        return best;
                    }
                }
            }
        } catch (Exception ignored) {}

        // 2. DolarApi Históricos (USD y EUR con Fecha Valor oficial exacta)
        try {
            URL urlUsd = new URL("https://ve.dolarapi.com/v1/historicos/dolares/oficial");
            HttpURLConnection connUsd = (HttpURLConnection) urlUsd.openConnection();
            connUsd.setConnectTimeout(5000);
            connUsd.setReadTimeout(6000);
            connUsd.setUseCaches(false);
            connUsd.setRequestProperty("Cache-Control", "no-cache");
            connUsd.setRequestProperty("Accept", "application/json");
            connUsd.setRequestProperty("User-Agent", "Mozilla/5.0");

            if (connUsd.getResponseCode() == 200) {
                String rawUsd = readStream(connUsd.getInputStream());
                JSONArray arrUsd = new JSONArray(rawUsd);
                if (arrUsd.length() > 0) {
                    JSONObject lastUsd = arrUsd.getJSONObject(arrUsd.length() - 1);
                    double usd = lastUsd.optDouble("promedio", 0);
                    String isoDate = lastUsd.optString("fecha", "").trim();

                    if (usd > 0 && !isoDate.isEmpty()) {
                        double eur = 0;
                        try {
                            URL urlEur = new URL("https://ve.dolarapi.com/v1/historicos/euros/oficial");
                            HttpURLConnection connEur = (HttpURLConnection) urlEur.openConnection();
                            connEur.setConnectTimeout(4500);
                            connEur.setReadTimeout(5000);
                            connEur.setUseCaches(false);
                            connEur.setRequestProperty("Cache-Control", "no-cache");
                            connEur.setRequestProperty("Accept", "application/json");
                            connEur.setRequestProperty("User-Agent", "Mozilla/5.0");
                            if (connEur.getResponseCode() == 200) {
                                String rawEur = readStream(connEur.getInputStream());
                                JSONArray arrEur = new JSONArray(rawEur);
                                if (arrEur.length() > 0) {
                                    JSONObject matchedEur = null;
                                    for (int i = arrEur.length() - 1; i >= 0; i--) {
                                        JSONObject candidateEur = arrEur.optJSONObject(i);
                                        if (candidateEur != null && isoDate.equals(candidateEur.optString("fecha", "").trim())) {
                                            matchedEur = candidateEur;
                                            break;
                                        }
                                    }
                                    if (matchedEur == null) {
                                        matchedEur = arrEur.getJSONObject(arrEur.length() - 1);
                                    }
                                    eur = matchedEur.optDouble("promedio", 0);
                                    if (eur > 0 && eur < 100 && usd > 100) {
                                        eur = eur * 1000.0;
                                    }
                                }
                            }
                        } catch (Exception ignored) {}

                        JSONObject out = new JSONObject();
                        out.put("status", "ok");
                        out.put("usd", Math.round(usd * 100.0) / 100.0);
                        if (eur > 0) out.put("eur", Math.round(eur * 100.0) / 100.0);
                        out.put("isoDate", isoDate);
                        out.put("shortDate", isoToShortDate(isoDate));
                        out.put("fecha", isoToShortDate(isoDate));

                        if (isBetterCandidate(out, best)) {
                            best = out;
                        }
                        if (best != null) {
                            String iso = best.optString("isoDate", "");
                            if ((!todayIso.isEmpty() && iso.compareTo(todayIso) > 0) || !checkBackupIfNotTomorrow) {
                                return best;
                            }
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        // 3. Respaldo en vivo vía lector r.jina.ai (con X-No-Cache para lectura fresca)
        try {
            long cb = System.currentTimeMillis() / 5000L;
            URL url = new URL("https://r.jina.ai/https://www.bcv.org.ve/?_cb=" + cb);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(9500);
            conn.setUseCaches(false);
            conn.setRequestProperty("X-No-Cache", "true");
            conn.setRequestProperty("Cache-Control", "no-cache");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0");

            if (conn.getResponseCode() == 200) {
                String md = readStream(conn.getInputStream());
                JSONObject parsed = parseBcvText(md);
                if (isBetterCandidate(parsed, best)) {
                    best = parsed;
                }
            }
        } catch (Exception ignored) {}

        if (best != null) return best;

        JSONObject fail = new JSONObject();
        try { fail.put("status", "fail"); } catch (Exception ignored) {}
        return fail;
    }

    private static Double toCleanNumber(String raw) {
        if (raw == null) return null;
        try {
            String cleaned = raw.trim().replace(".", "").replace(",", ".");
            double val = Double.parseDouble(cleaned);
            if (val > 0) {
                return Math.round(val * 100.0) / 100.0;
            }
        } catch (Exception ignored) {}
        return null;
    }

    private static String parseSpanishDateToIso(String text) {
        if (text == null) return null;
        Map<String, String> months = new HashMap<>();
        months.put("enero", "01"); months.put("febrero", "02"); months.put("marzo", "03");
        months.put("abril", "04"); months.put("mayo", "05"); months.put("junio", "06");
        months.put("julio", "07"); months.put("agosto", "08"); months.put("septiembre", "09");
        months.put("setiembre", "09"); months.put("octubre", "10"); months.put("noviembre", "11");
        months.put("diciembre", "12");

        Pattern p = Pattern.compile("(\\d{1,2})\\s+(?:de\\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\\s+(?:de\\s+)?(\\d{4})", Pattern.CASE_INSENSITIVE);
        Matcher m = p.matcher(text);
        if (m.find()) {
            String day = m.group(1).length() == 1 ? "0" + m.group(1) : m.group(1);
            String month = months.get(m.group(2).toLowerCase(Locale.ROOT));
            String year = m.group(3);
            if (month != null) {
                return year + "-" + month + "-" + day;
            }
        }
        return null;
    }

    private static String isoToShortDate(String iso) {
        if (iso == null || iso.length() < 10) return "";
        String[] parts = iso.substring(0, 10).split("-");
        if (parts.length != 3) return iso;
        return parts[2] + "/" + parts[1] + "/" + parts[0];
    }

    public static JSONObject parseBcvText(String rawText) {
        if (rawText == null || rawText.isEmpty()) return null;
        try {
            // 1. Formato HTML de bcv.org.ve
            Matcher mUsd = Pattern.compile("id=\"dolar\"[\\s\\S]{0,800}?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>", Pattern.CASE_INSENSITIVE).matcher(rawText);
            if (mUsd.find()) {
                Double usd = toCleanNumber(mUsd.group(1));
                Matcher mEur = Pattern.compile("id=\"euro\"[\\s\\S]{0,800}?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>", Pattern.CASE_INSENSITIVE).matcher(rawText);
                Double eur = mEur.find() ? toCleanNumber(mEur.group(1)) : null;

                Matcher mIso = Pattern.compile("Fecha\\s+Valor[\\s\\S]{0,500}?content=\"(\\d{4}-\\d{2}-\\d{2})", Pattern.CASE_INSENSITIVE).matcher(rawText);
                String isoDate = mIso.find() ? mIso.group(1) : null;

                Matcher mFecha = Pattern.compile("Fecha\\s+Valor[\\s\\S]{0,500}?<span[^>]*>([^<]+)</span>", Pattern.CASE_INSENSITIVE).matcher(rawText);
                String fechaText = mFecha.find() ? mFecha.group(1).trim().replaceAll("\\s+", " ") : "";

                if (isoDate == null) isoDate = parseSpanishDateToIso(fechaText);

                if (usd != null && usd > 0) {
                    JSONObject out = new JSONObject();
                    out.put("status", "ok");
                    out.put("usd", usd);
                    if (eur != null) out.put("eur", eur);
                    if (isoDate != null) out.put("isoDate", isoDate);
                    out.put("shortDate", isoToShortDate(isoDate));
                    out.put("fecha", !fechaText.isEmpty() ? fechaText : isoToShortDate(isoDate));
                    return out;
                }
            }

            // 2. Formato Markdown de r.jina.ai
            Matcher mdUsd = Pattern.compile("\\bUSD\\b[\\s\\S]{0,120}?\\*\\*([\\d.,]+)\\*\\*", Pattern.CASE_INSENSITIVE).matcher(rawText);
            if (mdUsd.find()) {
                Double usd = toCleanNumber(mdUsd.group(1));
                Matcher mdEur = Pattern.compile("\\bEUR\\b[\\s\\S]{0,120}?\\*\\*([\\d.,]+)\\*\\*", Pattern.CASE_INSENSITIVE).matcher(rawText);
                Double eur = mdEur.find() ? toCleanNumber(mdEur.group(1)) : null;

                Matcher mdFecha = Pattern.compile("Fecha\\s+Valor\\s*:\\s*([^\\n\\r*]+)", Pattern.CASE_INSENSITIVE).matcher(rawText);
                String fechaText = mdFecha.find() ? mdFecha.group(1).trim().replaceAll("\\s+", " ") : "";
                String isoDate = parseSpanishDateToIso(fechaText);

                if (usd != null && usd > 0) {
                    JSONObject out = new JSONObject();
                    out.put("status", "ok");
                    out.put("usd", usd);
                    if (eur != null) out.put("eur", eur);
                    if (isoDate != null) out.put("isoDate", isoDate);
                    out.put("shortDate", isoToShortDate(isoDate));
                    out.put("fecha", !fechaText.isEmpty() ? fechaText : isoToShortDate(isoDate));
                    return out;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    public static JSONObject fetchBinanceDirect() {
        JSONObject out = new JSONObject();
        try {
            URL url = new URL("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search");
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4500);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0");

            String payload = "{\"fiat\":\"VES\",\"page\":1,\"rows\":10,\"tradeType\":\"BUY\",\"asset\":\"USDT\",\"countries\":[],\"payTypes\":[]}";
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }

            if (conn.getResponseCode() == 200) {
                String raw = readStream(conn.getInputStream());
                JSONObject json = new JSONObject(raw);
                JSONArray data = json.optJSONArray("data");
                if (data != null && data.length() > 0) {
                    List<Double> prices = new ArrayList<>();
                    for (int i = 0; i < data.length(); i++) {
                        JSONObject item = data.optJSONObject(i);
                        if (item == null) continue;
                        JSONObject adv = item.optJSONObject("adv");
                        if (adv == null) continue;
                        boolean promoted = item.optBoolean("isPromoted", false) || adv.optBoolean("isPromoted", false);
                        if (!promoted) {
                            double p = adv.optDouble("price", 0);
                            if (p > 0) prices.add(p);
                        }
                    }
                    if (prices.isEmpty()) {
                        for (int i = 0; i < data.length(); i++) {
                            JSONObject item = data.optJSONObject(i);
                            if (item == null) continue;
                            JSONObject adv = item.optJSONObject("adv");
                            if (adv == null) continue;
                            double p = adv.optDouble("price", 0);
                            if (p > 0) prices.add(p);
                        }
                    }
                    if (!prices.isEmpty()) {
                        Collections.sort(prices);
                        JSONArray arr = new JSONArray();
                        for (Double p : prices) arr.put(p);
                        out.put("status", "ok");
                        out.put("prices", arr);
                        return out;
                    }
                }
            }
        } catch (Exception ignored) {}
        try {
            out.put("status", "fail");
            out.put("prices", new JSONArray());
        } catch (Exception ignored) {}
        return out;
    }
}
