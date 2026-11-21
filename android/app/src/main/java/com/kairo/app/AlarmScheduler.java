package com.kairo.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

public class AlarmScheduler {
    private static final String TAG = "KairoAlarmScheduler";
    public static final String ACTION_TRIGGER_ALARM = "com.kairo.app.ACTION_TRIGGER_ALARM";

    public static void syncAndScheduleAlerts(Context context, String newJson, String oldJson) {
        Set<String> oldSlotKeys = extractSlotKeys(oldJson);
        Set<String> newSlotKeys = extractSlotKeys(newJson);

        // 1. Cancel any previously scheduled AlarmManager PendingIntent that is NOT in the new list
        for (String oldKey : oldSlotKeys) {
            if (!newSlotKeys.contains(oldKey)) {
                cancelAlert(context, oldKey);
            }
        }

        // 2. Schedule all future items in the new list
        if (newJson != null && !newJson.isEmpty()) {
            try {
                JSONArray arr = new JSONArray(newJson);
                long now = System.currentTimeMillis();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    long triggerAtMs = obj.optLong("triggerAtMs", 0);
                    if (triggerAtMs > now + 500) {
                        scheduleSingleAlert(context, obj);
                    }
                }
            } catch (JSONException e) {
                Log.e(TAG, "Error scheduling alerts from JSON", e);
            }
        }
    }

    public static void scheduleAll(Context context) {
        String json = AlarmStorage.getInstance(context).getScheduledAlertsJson();
        syncAndScheduleAlerts(context, json, null);
    }

    private static Set<String> extractSlotKeys(String json) {
        Set<String> keys = new HashSet<>();
        if (json == null || json.isEmpty()) return keys;
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String slotKey = obj.optString("slotKey");
                if (slotKey != null && !slotKey.isEmpty()) {
                    keys.add(slotKey);
                }
            }
        } catch (JSONException ignored) {}
        return keys;
    }

    public static void clearAllAlerts(Context context) {
        String json = AlarmStorage.getInstance(context).getScheduledAlertsJson();
        Set<String> keys = extractSlotKeys(json);
        for (String key : keys) {
            cancelAlert(context, key);
        }
        AlarmStorage.getInstance(context).clearAllData();
    }

    public static void scheduleSingleAlert(Context context, JSONObject alertObj) {
        if (alertObj == null) return;
        String slotKey = alertObj.optString("slotKey");
        long triggerAtMs = alertObj.optLong("triggerAtMs", 0);
        if (slotKey.isEmpty() || triggerAtMs <= System.currentTimeMillis()) return;

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.setAction(ACTION_TRIGGER_ALARM);
        intent.putExtra("slotKey", slotKey);
        intent.putExtra("id", alertObj.optString("id"));
        intent.putExtra("type", alertObj.optString("type", "alarm"));
        intent.putExtra("name", alertObj.optString("name", "Kairo Alarm"));
        intent.putExtra("timeLabel", alertObj.optString("timeLabel"));
        intent.putExtra("snoozeMinutes", alertObj.optInt("snoozeMinutes", 5));
        intent.putExtra("vibrationMode", alertObj.optString("vibrationMode", "sound_and_vibrate"));
        intent.putExtra("triggerAtMs", triggerAtMs);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent alarmPendingIntent = PendingIntent.getBroadcast(
                context,
                slotKey.hashCode(),
                intent,
                flags
        );

        Intent appIntent = new Intent(context, MainActivity.class);
        PendingIntent showPendingIntent = PendingIntent.getActivity(
                context,
                slotKey.hashCode(),
                appIntent,
                flags
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                Log.w(TAG, "Exact alarms permission missing. Scheduling fallback alarm for: " + slotKey);
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, alarmPendingIntent);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(triggerAtMs, showPendingIntent);
                alarmManager.setAlarmClock(clockInfo, alarmPendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, alarmPendingIntent);
            }
            Log.d(TAG, "Scheduled alarm for slotKey: " + slotKey + " at " + triggerAtMs);
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException while scheduling exact alarm for " + slotKey, e);
            try {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, alarmPendingIntent);
            } catch (Exception ex) {
                Log.e(TAG, "Failed fallback alarm schedule", ex);
            }
        }
    }

    public static void cancelAlert(Context context, String slotKey) {
        if (slotKey == null || slotKey.isEmpty()) return;
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.setAction(ACTION_TRIGGER_ALARM);

        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                slotKey.hashCode(),
                intent,
                flags
        );

        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
            Log.d(TAG, "Canceled alarm for slotKey: " + slotKey);
        }
    }
}
