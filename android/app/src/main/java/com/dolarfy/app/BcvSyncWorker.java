package com.dolarfy.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class BcvSyncWorker extends Worker {
    public static final String UNIQUE_WORK_NAME = "dolarfy_bcv_periodic_worker";
    public static final String UNIQUE_TURBO_WORK_NAME = "dolarfy_bcv_turbo_worker";

    public BcvSyncWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        // Desactivar trabajos residuales de versiones previas; las alertas llegan vía FCM.
        BcvNativeHelper.cancelAllBackgroundAlarms(getApplicationContext());
        return Result.success();
    }

    public static void enqueuePeriodicSync(Context context) {
        BcvNativeHelper.cancelAllBackgroundAlarms(context);
    }
}
