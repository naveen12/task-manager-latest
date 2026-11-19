package __PACKAGE__;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

public final class AlarmScheduler {
  private static final String PREFS_NAME = "kairo_native_prefs";
  private static final String KEY_ALERTS_JSON = "alerts_json";
  private static final String KEY_REQ_CODES = "scheduled_request_codes";
  private static final String KEY_GRADUAL_VOLUME = "gradual_volume";
  private static final String KEY_HANDLED_ALERTS = "handled_alerts_json";
  private static final String KEY_MARKED_SLOTS = "marked_slots_set";

  private AlarmScheduler() {}

  public static void setGradualVolumeEnabled(Context context, boolean enabled) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    prefs.edit().putBoolean(KEY_GRADUAL_VOLUME, enabled).apply();
  }

  public static boolean isGradualVolumeEnabled(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    return prefs.getBoolean(KEY_GRADUAL_VOLUME, true);
  }

  public static void saveAndSchedule(Context context, String alertsJson) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    cancelExisting(context, prefs);
    prefs.edit().putString(KEY_ALERTS_JSON, alertsJson).apply();
    scheduleFromJson(context, alertsJson);
  }

  public static void rescheduleSaved(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    String json = prefs.getString(KEY_ALERTS_JSON, "[]");
    scheduleFromJson(context, json);
  }

  private static void cancelExisting(Context context, SharedPreferences prefs) {
    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;
    Set<String> codes = prefs.getStringSet(KEY_REQ_CODES, new HashSet<String>());
    for (String codeStr : codes) {
      try {
        int reqCode = Integer.parseInt(codeStr);
        Intent intent = new Intent(context, ExactAlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(
          context,
          reqCode,
          intent,
          PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (pi != null) {
          am.cancel(pi);
          pi.cancel();
        }
      } catch (Exception ignored) {}
    }
    prefs.edit().remove(KEY_REQ_CODES).apply();
  }

  public static void scheduleFromJson(Context context, String alertsJson) {
    if (alertsJson == null || alertsJson.trim().isEmpty()) return;
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    Set<String> newCodes = new HashSet<>();
    long nowMs = System.currentTimeMillis();

    try {
      JSONArray arr = new JSONArray(alertsJson);
      for (int i = 0; i < arr.length(); i++) {
        JSONObject obj = arr.getJSONObject(i);
        String id = obj.optString("id", "alert-" + i);
        String slotKey = obj.optString("slotKey", id);
        String type = obj.optString("type", "alarm");
        String name = obj.optString("name", "Kairo Alert");
        String timeLabel = obj.optString("timeLabel", "");
        long triggerAtMs = obj.optLong("triggerAtMs", 0L);

        int snoozeMinutes = Math.max(1, obj.optInt("snoozeMinutes", 5));
        String vibrationMode = obj.optString("vibrationMode", "sound_and_vibrate");

        if (triggerAtMs <= nowMs + 500L) continue;
        if (isSlotMarkedHandled(context, slotKey)) continue;

        int reqCode = Math.abs((slotKey + ":" + triggerAtMs).hashCode());
        scheduleSingle(
          context,
          reqCode,
          id,
          slotKey,
          type,
          name,
          timeLabel,
          triggerAtMs,
          snoozeMinutes,
          vibrationMode
        );
        newCodes.add(String.valueOf(reqCode));
      }
    } catch (Exception ignored) {}

    prefs.edit().putStringSet(KEY_REQ_CODES, newCodes).apply();
  }

  public static void scheduleSingle(
    Context context,
    int reqCode,
    String id,
    String slotKey,
    String type,
    String name,
    String timeLabel,
    long triggerAtMs
  ) {
    scheduleSingle(
      context,
      reqCode,
      id,
      slotKey,
      type,
      name,
      timeLabel,
      triggerAtMs,
      5,
      "sound_and_vibrate"
    );
  }

  public static void scheduleSingle(
    Context context,
    int reqCode,
    String id,
    String slotKey,
    String type,
    String name,
    String timeLabel,
    long triggerAtMs,
    int snoozeMinutes,
    String vibrationMode
  ) {
    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;

    Intent receiverIntent = new Intent(context, ExactAlarmReceiver.class);
    receiverIntent.putExtra("alert_id", id);
    receiverIntent.putExtra("slot_key", slotKey);
    receiverIntent.putExtra("alert_type", type);
    receiverIntent.putExtra("alert_name", name);
    receiverIntent.putExtra("alert_time", timeLabel);
    receiverIntent.putExtra("snooze_minutes", Math.max(1, snoozeMinutes));
    receiverIntent.putExtra(
      "vibration_mode",
      vibrationMode != null ? vibrationMode : "sound_and_vibrate"
    );

    PendingIntent pi = PendingIntent.getBroadcast(
      context,
      reqCode,
      receiverIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Intent showIntent = new Intent(context, MainActivity.class);
    PendingIntent showPi = PendingIntent.getActivity(
      context,
      reqCode + 1,
      showIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(triggerAtMs, showPi);
        am.setAlarmClock(info, pi);
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
      } else {
        am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
      }
    } catch (SecurityException secEx) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
      } else {
        am.set(AlarmManager.RTC_WAKEUP, triggerAtMs, pi);
      }
    }
  }

  public static synchronized void markSlotHandled(Context context, String slotKey) {
    if (slotKey == null || slotKey.isEmpty()) return;
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    Set<String> existing = new HashSet<>(prefs.getStringSet(KEY_MARKED_SLOTS, new HashSet<String>()));
    existing.add(slotKey);
    if (existing.size() > 120) {
      // Keep bounded
      Set<String> trimmed = new HashSet<>();
      int count = 0;
      for (String s : existing) {
        if (count++ >= 60) break;
        trimmed.add(s);
      }
      trimmed.add(slotKey);
      existing = trimmed;
    }
    prefs.edit().putStringSet(KEY_MARKED_SLOTS, existing).apply();
  }

  public static synchronized boolean isSlotMarkedHandled(Context context, String slotKey) {
    if (slotKey == null || slotKey.isEmpty()) return false;
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    Set<String> existing = prefs.getStringSet(KEY_MARKED_SLOTS, new HashSet<String>());
    return existing.contains(slotKey);
  }

  public static synchronized void recordHandledAlert(
    Context context,
    String slotKey,
    String id,
    String type,
    String name,
    String timeLabel,
    String action,
    long snoozeUntilMs
  ) {
    if (slotKey == null || slotKey.isEmpty()) return;
    markSlotHandled(context, slotKey);

    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    try {
      JSONArray existing = new JSONArray(prefs.getString(KEY_HANDLED_ALERTS, "[]"));
      JSONArray updated = new JSONArray();
      long nowMs = System.currentTimeMillis();

      for (int i = 0; i < existing.length(); i++) {
        JSONObject item = existing.getJSONObject(i);
        long itemTs = item.optLong("updatedAtMs", 0L);
        if (nowMs - itemTs > 24L * 60L * 60L * 1000L) continue;
        if (slotKey.equals(item.optString("slotKey"))) continue;
        updated.put(item);
      }

      JSONObject record = new JSONObject();
      record.put("slotKey", slotKey);
      record.put("id", id != null ? id : "");
      record.put("type", type != null ? type : "alarm");
      record.put("name", name != null ? name : "Kairo Alert");
      record.put("timeLabel", timeLabel != null ? timeLabel : "");
      record.put("action", action);
      record.put("snoozeUntilMs", snoozeUntilMs);
      record.put("updatedAtMs", nowMs);
      updated.put(record);

      prefs.edit().putString(KEY_HANDLED_ALERTS, updated.toString()).apply();
    } catch (Exception ignored) {}
  }

  public static synchronized String getHandledAlertsJson(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    return prefs.getString(KEY_HANDLED_ALERTS, "[]");
  }
}
