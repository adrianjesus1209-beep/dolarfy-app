package com.dolarfy.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

public class BcvSyncWorker extends Worker {
    public static final String UNIQUE_WORK_NAME = "dolarfy_bcv_periodic_worker";

    public BcvSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            BcvNativeHelper.syncLiveAll(getApplicationContext());
            // Mantener también activo el ciclo de AlarmManager
            BcvNativeHelper.scheduleNextAlarm(getApplicationContext());
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
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
        } catch (Exception ignored) {}
    }
}
