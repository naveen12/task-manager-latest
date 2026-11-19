package com.kairo.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.content.ContextCompat;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "KairoAlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String slotKey = intent.getStringExtra("slotKey");
        if (slotKey == null || slotKey.isEmpty()) return;

        Log.d(TAG, "Alarm triggered for slotKey: " + slotKey);

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "kairo:AlarmReceiverWakeLock"
            );
            wakeLock.acquire(30000L); // 30 seconds
        }

        String id = intent.getStringExtra("id");
        String type = intent.getStringExtra("type");
        String name = intent.getStringExtra("name");
        String timeLabel = intent.getStringExtra("timeLabel");
        int snoozeMinutes = intent.getIntExtra("snoozeMinutes", 5);
        String vibrationMode = intent.getStringExtra("vibrationMode");

        AlarmStorage storage = AlarmStorage.getInstance(context);
        storage.setActiveAlertState(true, slotKey);
        storage.addHandledAlert(slotKey, id, type, name, timeLabel, "fired", 0);

        // Start Foreground Service to play alarm ringtone & vibration
        Intent serviceIntent = new Intent(context, AlarmService.class);
        serviceIntent.setAction(AlarmService.ACTION_START_ALARM);
        serviceIntent.putExtras(intent.getExtras());

        try {
            ContextCompat.startForegroundService(context, serviceIntent);
        } catch (Exception e) {
            Log.e(TAG, "Error starting AlarmService", e);
        }

        // Launch full-screen Ring Activity
        Intent activityIntent = new Intent(context, AlarmRingActivity.class);
        if (intent.getExtras() != null) {
            activityIntent.putExtras(intent.getExtras());
        }
        activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);

        try {
            context.startActivity(activityIntent);
        } catch (Exception e) {
            Log.e(TAG, "Error launching AlarmRingActivity", e);
        }
    }
}
