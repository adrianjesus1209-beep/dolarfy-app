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
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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

    public static boolean isFutureRateAlreadyNotified(Context context) {
        try {
            String lastKey = getLastNotifiedKey(context);
            if (lastKey != null && lastKey.startsWith("VE_") && lastKey.length() >= 13) {
                String notifiedIso = lastKey.substring(3, 13);
                String todayIso = getTodayVenezuelaIso();
                return !todayIso.isEmpty() && notifiedIso.compareTo(todayIso) > 0;
            }
        } catch (Exception ignored) {}
        return false;
    }

    public static boolean isBcvWindowActive() {
        try {
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("America/Caracas"));
            int dayOfWeek = cal.get(Calendar.DAY_OF_WEEK);
            int hour = cal.get(Calendar.HOUR_OF_DAY);
            int minute = cal.get(Calendar.MINUTE);

            boolean isWeekday = (dayOfWeek >= Calendar.MONDAY && dayOfWeek <= Calendar.FRIDAY);
            // Ventana activa de publicación oficial del BCV: 16:05 a 17:55 (4:05 PM a 5:55 PM VET)
            return isWeekday && (
                (hour == 16 && minute >= 5) ||
                (hour == 17 && minute <= 55)
            );
        } catch (Exception ignored) {
            return false;
        }
    }

    public static long getNextCheckDelayMs() {
        try {
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("America/Caracas"));
            int dayOfWeek = cal.get(Calendar.DAY_OF_WEEK);
            int hour = cal.get(Calendar.HOUR_OF_DAY);
            int minute = cal.get(Calendar.MINUTE);

            boolean isWeekday = (dayOfWeek >= Calendar.MONDAY && dayOfWeek <= Calendar.FRIDAY);
            if (isWeekday) {
                // 16:05 a 17:55: Ventana crítica de publicación del BCV -> Cada 30 segundos
                if ((hour == 16 && minute >= 5) || (hour == 17 && minute <= 55)) {
                    return 30 * 1000L;
                }
                // 15:40 a 16:05: Pre-ventana -> Cada 3 minutos
                if (hour == 15 && minute >= 40) {
                    return 3 * 60 * 1000L;
                }
                // 17:55 a 18:45: Post-ventana -> Cada 5 minutos
                if (hour == 17 || hour == 18) {
                    return 5 * 60 * 1000L;
                }
            }
        } catch (Exception ignored) {}
        return 15 * 60 * 1000L; // 15 minutos en horario regular
    }

    public static void scheduleNextAlarm(Context context) {
        if (context == null) return;
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

            long delayMs = getNextCheckDelayMs();
            boolean isCriticalWindow = isBcvWindowActive();

            boolean alarmScheduled = false;

            if (isCriticalWindow && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                // En la ventana crítica usamos setAlarmClock:
                // Es inmune a Doze Mode, App Standby y optimizaciones agresivas de batería.
                // NOTA CRÍTICA AOSP: showIntent DEBE ser un PendingIntent de Activity (no Broadcast).
                try {
                    Intent showIntent = new Intent(context, MainActivity.class);
                    showIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    PendingIntent showPi = PendingIntent.getActivity(context, 7002, showIntent, flags);

                    long triggerWallClock = System.currentTimeMillis() + delayMs;
                    am.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerWallClock, showPi), pi);
                    alarmScheduled = true;
                } catch (Throwable t) {
                    // Fallback inmediato si el fabricante restringe setAlarmClock
                }
            }

            if (!alarmScheduled) {
                long triggerAt = SystemClock.elapsedRealtime() + delayMs;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        try {
                            if (am.canScheduleExactAlarms()) {
                                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
                                alarmScheduled = true;
                            }
                        } catch (Throwable ignored) {}
                    } else {
                        try {
                            am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
                            alarmScheduled = true;
                        } catch (Throwable ignored) {}
                    }

                    if (!alarmScheduled) {
                        try {
                            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
                            alarmScheduled = true;
                        } catch (Throwable ignored) {}
                    }
                } else {
                    am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
                }
            }
        } catch (Exception ignored) {}
    }

    public static void scheduleRepeatingAlarm(Context context) {
        scheduleNextAlarm(context);
        BcvSyncWorker.enqueuePeriodicSync(context);
    }

    public static JSONObject syncLiveAll(Context context) {
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
                    if ("ok".equals(bcv.optString("status"))) {
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

            nm.cancel(NOTIFICATION_ID);
            nm.notify("dolarfy_bcv_alert", 0, builder.build());
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
        boolean inWindow = isBcvWindowActive();
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
                // Si ya tenemos la tasa del próximo día hábil (> hoy) o estamos fuera de ventana crítica, retornar al instante
                if (best != null) {
                    String iso = best.optString("isoDate", "");
                    if ((!todayIso.isEmpty() && iso.compareTo(todayIso) > 0) || !inWindow) {
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
                                    JSONObject lastEur = arrEur.getJSONObject(arrEur.length() - 1);
                                    eur = lastEur.optDouble("promedio", 0);
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
                            if ((!todayIso.isEmpty() && iso.compareTo(todayIso) > 0) || !inWindow) {
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
