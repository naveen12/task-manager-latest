package com.kairo.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class AlarmStorage {
    private static final String PREF_NAME = "kairo_alarm_prefs_v2";
    private static final String KEY_SCHEDULED_ALERTS = "scheduled_alerts_json";
    private static final String KEY_GRADUAL_VOLUME = "gradual_volume";
    private static final String KEY_HANDLED_ALERTS = "handled_alerts_json";
    private static final String KEY_ALERT_ACTIVE = "is_alert_active";
    private static final String KEY_ACTIVE_SLOT = "active_slot_key";
    private static final String KEY_PENDING_QUICK_ADD = "pending_quick_add";
    private static final String KEY_STOPPED_FOCUS_END = "stopped_focus_end_ms";

    private static AlarmStorage instance;
    private final SharedPreferences prefs;

    private AlarmStorage(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    public static synchronized AlarmStorage getInstance(Context context) {
        if (instance == null) {
            instance = new AlarmStorage(context);
        }
        return instance;
    }

    public void saveScheduledAlerts(String alertsJson, boolean gradualVolume) {
        prefs.edit()
                .putString(KEY_SCHEDULED_ALERTS, alertsJson != null ? alertsJson : "[]")
                .putBoolean(KEY_GRADUAL_VOLUME, gradualVolume)
                .apply();
    }

    public String getScheduledAlertsJson() {
        return prefs.getString(KEY_SCHEDULED_ALERTS, "[]");
    }

    public boolean isGradualVolume() {
        return prefs.getBoolean(KEY_GRADUAL_VOLUME, true);
    }

    public JSONObject getScheduledAlertBySlot(String slotKey) {
        if (slotKey == null || slotKey.isEmpty()) return null;
        try {
            JSONArray arr = new JSONArray(getScheduledAlertsJson());
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                if (slotKey.equals(obj.optString("slotKey"))) {
                    return obj;
                }
            }
        } catch (JSONException ignored) {}
        return null;
    }

    public synchronized void addHandledAlert(String slotKey, String id, String type, String name,
                                             String timeLabel, String action, long snoozeUntilMs) {
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_HANDLED_ALERTS, "[]"));
            JSONObject obj = new JSONObject();
            obj.put("slotKey", slotKey);
            obj.put("id", id != null ? id : "");
            obj.put("type", type != null ? type : "alarm");
            obj.put("name", name != null ? name : "Kairo Alert");
            obj.put("timeLabel", timeLabel != null ? timeLabel : "");
            obj.put("action", action);
            obj.put("snoozeUntilMs", snoozeUntilMs);
            obj.put("updatedAtMs", System.currentTimeMillis());
            arr.put(obj);
            prefs.edit().putString(KEY_HANDLED_ALERTS, arr.toString()).apply();
        } catch (JSONException ignored) {}
    }

    public synchronized String getHandledAlertsJson() {
        return prefs.getString(KEY_HANDLED_ALERTS, "[]");
    }

    public synchronized void clearHandledAlerts() {
        prefs.edit().putString(KEY_HANDLED_ALERTS, "[]").apply();
    }

    public synchronized void markAlertHandled(String slotKey) {
        if (slotKey == null) return;
        try {
            JSONArray arr = new JSONArray(getScheduledAlertsJson());
            JSONArray updated = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                if (!slotKey.equals(obj.optString("slotKey"))) {
                    updated.put(obj);
                }
            }
            prefs.edit().putString(KEY_SCHEDULED_ALERTS, updated.toString()).apply();
        } catch (JSONException ignored) {}
    }

    public void setActiveAlertState(boolean active, String slotKey) {
        prefs.edit()
                .putBoolean(KEY_ALERT_ACTIVE, active)
                .putString(KEY_ACTIVE_SLOT, active && slotKey != null ? slotKey : "")
                .apply();
    }

    public boolean isAlertActive() {
        return prefs.getBoolean(KEY_ALERT_ACTIVE, false);
    }

    public String getActiveSlotKey() {
        return prefs.getString(KEY_ACTIVE_SLOT, "");
    }

    public void setPendingQuickAdd(String target) {
        prefs.edit().putString(KEY_PENDING_QUICK_ADD, target != null ? target : "").apply();
    }

    public String getAndClearPendingQuickAdd() {
        String target = prefs.getString(KEY_PENDING_QUICK_ADD, "");
        if (!target.isEmpty()) {
            prefs.edit().remove(KEY_PENDING_QUICK_ADD).apply();
        }
        return target;
    }

    public void setFocusStoppedEndMs(long ms) {
        prefs.edit().putLong(KEY_STOPPED_FOCUS_END, ms).apply();
    }

    public long getAndClearFocusStoppedEndMs() {
        long ms = prefs.getLong(KEY_STOPPED_FOCUS_END, 0);
        if (ms > 0) {
            prefs.edit().remove(KEY_STOPPED_FOCUS_END).apply();
        }
        return ms;
    }

    public void saveWidgetSummary(int tasksLeft, int remindersLeft, String nextAlarm, String nextTaskTitle, String next3HoursJson, int items3hCount) {
        prefs.edit()
                .putInt("widget_tasks_left", tasksLeft)
                .putInt("widget_reminders_left", remindersLeft)
                .putString("widget_next_alarm", nextAlarm != null ? nextAlarm : "None")
                .putString("widget_next_task", nextTaskTitle != null ? nextTaskTitle : "")
                .putString("widget_next_3h_json", next3HoursJson != null ? next3HoursJson : "[]")
                .putInt("widget_items_3h_count", items3hCount)
                .apply();
    }

    public int getWidgetTasksLeft() {
        return prefs.getInt("widget_tasks_left", 0);
    }

    public int getWidgetRemindersLeft() {
        return prefs.getInt("widget_reminders_left", 0);
    }

    public String getWidgetNextAlarm() {
        return prefs.getString("widget_next_alarm", "None");
    }

    public String getWidgetNextTaskTitle() {
        return prefs.getString("widget_next_task", "");
    }

    public String getWidgetNext3HoursJson() {
        return prefs.getString("widget_next_3h_json", "[]");
    }

    public int getWidgetItems3HoursCount() {
        return prefs.getInt("widget_items_3h_count", 0);
    }
}
