package com.dolarfy.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

public class BcvSyncWorker extends Worker {
    public static final String UNIQUE_WORK_NAME = "dolarfy_bcv_periodic_worker";
    public static final String UNIQUE_TURBO_WORK_NAME = "dolarfy_bcv_turbo_worker";

    public BcvSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context appContext = getApplicationContext();
        try {
            BcvNativeHelper.ensureNotificationChannel(appContext);
            BcvNativeHelper.syncLiveAll(appContext);
            BcvNativeHelper.scheduleNextAlarm(appContext);

            // Si estamos en la ventana crítica del BCV (4:05 PM - 5:55 PM VET) y aún no ha salido
            // la tasa del próximo día hábil, mantenemos vigilancia activa cada 12 segundos hasta 8 minutos.
            long startMs = System.currentTimeMillis();
            long maxTurboMs = 8 * 60 * 1000L; // 8 minutos (dentro del límite de 10 min de WorkManager)

            while (!isStopped()
                    && BcvNativeHelper.isBcvWindowActive()
                    && !BcvNativeHelper.isFutureRateAlreadyNotified(appContext)
                    && (System.currentTimeMillis() - startMs) < maxTurboMs) {
                try {
                    Thread.sleep(12000L);
                } catch (InterruptedException ie) {
                    break;
                }
                if (isStopped()) break;
                BcvNativeHelper.syncLiveAll(appContext);
            }

            BcvNativeHelper.scheduleNextAlarm(appContext);
            if (BcvNativeHelper.isBcvWindowActive() && !BcvNativeHelper.isFutureRateAlreadyNotified(appContext)) {
                enqueueTurboWatch(appContext, 10);
            }

            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    public static void enqueueTurboWatch(Context context, long delaySeconds) {
        if (context == null) return;
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            OneTimeWorkRequest turboRequest = new OneTimeWorkRequest.Builder(BcvSyncWorker.class)
                .setConstraints(constraints)
                .setInitialDelay(Math.max(5L, delaySeconds), TimeUnit.SECONDS)
                .build();

            WorkManager.getInstance(context).enqueueUniqueWork(
                UNIQUE_TURBO_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                turboRequest
            );
        } catch (Exception ignored) {}
    }

    public static void enqueuePeriodicSync(Context context) {
        if (context == null) return;
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                BcvSyncWorker.class,
                15, TimeUnit.MINUTES
            )
            .setConstraints(constraints)
            .build();

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            );

            if (BcvNativeHelper.isBcvWindowActive() && !BcvNativeHelper.isFutureRateAlreadyNotified(context)) {
                enqueueTurboWatch(context, 5);
            }
        } catch (Exception ignored) {}
    }
}
