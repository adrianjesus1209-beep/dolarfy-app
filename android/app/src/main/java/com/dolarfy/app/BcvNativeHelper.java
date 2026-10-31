package com.dolarfy.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

public class BcvNativeHelper {
    public static final String PREFS_NAME = "dolarfy_native_prefs";
    public static final String KEY_ENABLED = "notifications_enabled";
    public static final String KEY_LAST_NOTIFIED = "last_notified_key";
    public static final String KEY_LAST_PAYLOAD = "last_live_payload";
    public static final String CHANNEL_ID = "dolarfy_bcv_alerts";
    public static final int NOTIFICATION_ID = 9001;

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
            prefs.edit().putBoolean(KEY_ENABLED, enabled).apply();
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

    public static void setLastNotifiedKey(Context context, String key) {
        if (key == null || key.isEmpty()) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_LAST_NOTIFIED, key).apply();
        } catch (Exception ignored) {}
    }

    public static void scheduleRepeatingAlarm(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(context, BcvCheckReceiver.class);
            intent.setAction("com.dolarfy.app.ACTION_CHECK_BCV");
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(context, 7001, intent, flags);
            long intervalMs = 15 * 60 * 1000L; // Cada 15 minutos en segundo plano
            am.setInexactRepeating(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + 2 * 60 * 1000L,
                intervalMs,
                pi
            );
        } catch (Exception ignored) {}
    }

    public static JSONObject syncLiveAll(Context context) {
        JSONObject result = new JSONObject();
        try {
            JSONObject bcv = fetchBcvDirect();
            JSONObject binance = fetchBinanceDirect();
            result.put("bcv", bcv);
            result.put("binance", binance);
            result.put("timestamp", System.currentTimeMillis());

            if ("ok".equals(bcv.optString("status"))) {
                String jsonStr = result.toString();
                memoryPayload = jsonStr;
                if (context != null) {
                    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(KEY_LAST_PAYLOAD, jsonStr).apply();
                    checkAndNotifyBcv(context, bcv);
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

            double usd = bcv.optDouble("usd", 0);
            double eur = bcv.optDouble("eur", 0);
            String isoDate = bcv.optString("isoDate", "");
            String shortDate = bcv.optString("shortDate", "");
            if (usd <= 0 || isoDate.isEmpty()) return;

            String usdStr = String.format(Locale.US, "%.2f", usd);
            String eurStr = eur > 0 ? String.format(Locale.US, "%.2f", eur) : "0.00";
            String dedupKey = "VE_" + isoDate + "_" + usdStr + "_" + eurStr;

            String lastKey = getLastNotifiedKey(context);
            if (dedupKey.equals(lastKey)) return;

            if (showNativeNotification(context, "📢 Nueva Tasa BCV Disponible",
                    "USD = Bs. " + usdStr + " | EUR = Bs. " + eurStr + "\nFecha: " + shortDate)) {
                setLastNotifiedKey(context, dedupKey);
            }
        } catch (Exception ignored) {}
    }

    public static boolean showNativeNotification(Context context, String title, String body) {
        try {
            if (!canPostNotifications(context)) return false;
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Alertas BCV Oficial",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Notificaciones en tiempo real de nuevas tasas oficiales del BCV");
                channel.enableVibration(true);
                nm.createNotificationChannel(channel);
            }

            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent contentIntent = PendingIntent.getActivity(context, 0, launchIntent, piFlags);

            String firstLine = body != null && body.contains("\n") ? body.split("\n")[0] : (body != null ? body : "");

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title != null ? title : "📢 Nueva Tasa BCV Disponible")
                .setContentText(firstLine)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body != null ? body : ""))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(contentIntent);

            nm.notify(NOTIFICATION_ID, builder.build());
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static SSLContext createPermissiveSslContext() throws Exception {
        TrustManager[] trustAllCerts = new TrustManager[]{
            new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] certs, String authType) {}
                public void checkServerTrusted(X509Certificate[] certs, String authType) {}
            }
        };
        SSLContext sc = SSLContext.getInstance("TLS");
        sc.init(null, trustAllCerts, new SecureRandom());
        return sc;
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

    public static JSONObject fetchBcvDirect() {
        // 1. Conexión directa a https://www.bcv.org.ve/ ignorando certificado intermedio incompleto del BCV
        try {
            URL url = new URL("https://www.bcv.org.ve/");
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setSSLSocketFactory(createPermissiveSslContext().getSocketFactory());
            conn.setHostnameVerifier((hostname, session) -> true);
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(4500);
            conn.setReadTimeout(5500);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36");

            if (conn.getResponseCode() == 200) {
                String html = readStream(conn.getInputStream());
                JSONObject parsed = parseBcvText(html);
                if (parsed != null) return parsed;
            }
        } catch (Exception ignored) {}

        // 2. Respaldo vía lector en vivo r.jina.ai
        try {
            long cb = System.currentTimeMillis() / 15000L;
            URL url = new URL("https://r.jina.ai/https://www.bcv.org.ve/?_cb=" + cb);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(4500);
            conn.setReadTimeout(5500);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0");

            if (conn.getResponseCode() == 200) {
                String md = readStream(conn.getInputStream());
                JSONObject parsed = parseBcvText(md);
                if (parsed != null) return parsed;
            }
        } catch (Exception ignored) {}

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
