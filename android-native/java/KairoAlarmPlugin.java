package __PACKAGE__;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

@CapacitorPlugin(
  name = "KairoAlarm",
  permissions = {
    @Permission(
      strings = { Manifest.permission.POST_NOTIFICATIONS },
      alias = "notifications"
    )
  }
)
public class KairoAlarmPlugin extends Plugin {
  @PluginMethod
  public void syncAlerts(PluginCall call) {
    String alertsJson = call.getString("alertsJson", "[]");
    boolean gradualVolume = call.getBoolean("gradualVolume", true);
    AlarmScheduler.setGradualVolumeEnabled(getContext(), gradualVolume);
    AlarmScheduler.saveAndSchedule(getContext(), alertsJson);
    JSObject ret = new JSObject();
    ret.put("scheduled", true);
    call.resolve(ret);
  }

  @PluginMethod
  public void consumeHandledAlerts(PluginCall call) {
    Context ctx = getContext();
    JSObject ret = new JSObject();
    ret.put("handledJson", AlarmScheduler.getHandledAlertsJson(ctx));
    ret.put("isAlertActive", AlarmForegroundService.isAlertActive);
    ret.put("activeSlotKey", AlarmForegroundService.activeSlotKey);
    ret.put("stoppedFocusEndMs", FocusDndManager.consumeStoppedFocusEndMs(ctx));
    call.resolve(ret);
  }

  @PluginMethod
  public void markAlertHandled(PluginCall call) {
    String slotKey = call.getString("slotKey", "");
    AlarmScheduler.markSlotHandled(getContext(), slotKey);
    call.resolve();
  }

  @PluginMethod
  public void getPermissionStatus(PluginCall call) {
    Context ctx = getContext();

    boolean notificationsEnabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    boolean postRuntimeGranted = true;
    if (Build.VERSION.SDK_INT >= 33) {
      postRuntimeGranted =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED;
    }
    boolean channelAllowed = true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) {
        NotificationChannel ch = nm.getNotificationChannel(AlarmForegroundService.CHANNEL_ID);
        if (ch != null && ch.getImportance() == NotificationManager.IMPORTANCE_NONE) {
          channelAllowed = false;
        }
      }
    }
    boolean postNotifications = notificationsEnabled && postRuntimeGranted && channelAllowed;

    boolean exactAlarms = true;
    if (Build.VERSION.SDK_INT >= 31) {
      AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
      exactAlarms = am != null && am.canScheduleExactAlarms();
    }

    boolean fullScreenIntent = postNotifications;
    if (Build.VERSION.SDK_INT >= 34) {
      NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) {
        try {
          Object res = nm.getClass().getMethod("canUseFullScreenIntent").invoke(nm);
          if (res instanceof Boolean) {
            fullScreenIntent = (Boolean) res;
          }
        } catch (Exception ignored) {}
      }
    }

    boolean overlayPermission = true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      overlayPermission = Settings.canDrawOverlays(ctx);
    }

    boolean batteryIgnored = true;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
      batteryIgnored = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
    }

    boolean dndAccess = FocusDndManager.isDndAccessGranted(ctx);

    JSObject ret = new JSObject();
    ret.put("postNotifications", postNotifications);
    ret.put("exactAlarms", exactAlarms);
    ret.put("fullScreenIntent", fullScreenIntent);
    ret.put("overlayPermission", overlayPermission);
    ret.put("batteryOptimizationIgnored", batteryIgnored);
    ret.put("dndAccess", dndAccess);
    call.resolve(ret);
  }

  @PluginMethod
  public void requestNotificationPermission(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "notificationsPermsCallback");
      return;
    }
    if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
      openNotificationSettingsInternal();
    }
    JSObject ret = new JSObject();
    ret.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
    call.resolve(ret);
  }

  @PermissionCallback
  private void notificationsPermsCallback(PluginCall call) {
    boolean granted =
      getPermissionState("notifications") == PermissionState.GRANTED &&
      NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    JSObject ret = new JSObject();
    ret.put("granted", granted);
    call.resolve(ret);
  }

  @PluginMethod
  public void openNotificationSettings(PluginCall call) {
    openNotificationSettingsInternal();
    call.resolve();
  }

  private void openNotificationSettingsInternal() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        return;
      }
    } catch (Exception ignored) {}
    openAppInfoFallback();
  }

  @PluginMethod
  public void openExactAlarmSettings(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 31) {
      try {
        Intent intent = new Intent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM");
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      } catch (Exception e) {
        openAppInfoFallback();
      }
    }
    call.resolve();
  }

  @PluginMethod
  public void openFullScreenIntentSettings(PluginCall call) {
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        Intent intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      } else {
        openNotificationSettingsInternal();
      }
    } catch (Exception e) {
      openAppInfoFallback();
    }
    call.resolve();
  }

  @PluginMethod
  public void openOverlaySettings(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      try {
        Intent intent = new Intent(
          Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
          Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      } catch (Exception e) {
        try {
          Intent generic = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
          generic.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
          getContext().startActivity(generic);
        } catch (Exception e2) {
          openAppInfoFallback();
        }
      }
    }
    call.resolve();
  }

  @PluginMethod
  public void openAppInfoSettings(PluginCall call) {
    openAppInfoFallback();
    call.resolve();
  }

  private void openAppInfoFallback() {
    try {
      Intent intent = new Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.parse("package:" + getContext().getPackageName())
      );
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
    } catch (Exception ignored) {}
  }

  @PluginMethod
  public void openBatterySettings(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      try {
        Intent intent = new Intent(
          Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      } catch (Exception e) {
        openAppInfoFallback();
      }
    }
    call.resolve();
  }

  @PluginMethod
  public void openDndSettings(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      try {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      } catch (Exception e) {
        openAppInfoFallback();
      }
    }
    call.resolve();
  }

  @PluginMethod
  public void testLockScreenAlert(PluginCall call) {
    int delaySec = Math.max(2, Math.min(30, call.getInt("delaySeconds", 5)));
    long triggerAtMs = System.currentTimeMillis() + delaySec * 1000L;
    String timeLabel = new SimpleDateFormat("hh:mm a", Locale.US).format(new Date(triggerAtMs));
    String slotKey = "lockscreen-test-" + triggerAtMs;
    int reqCode = Math.abs(slotKey.hashCode());

    AlarmScheduler.scheduleSingle(
      getContext(),
      reqCode,
      "lockscreen-test",
      slotKey,
      "alarm",
      "Lock-Screen Alarm Test",
      timeLabel,
      triggerAtMs,
      5,
      "sound_and_vibrate"
    );

    JSObject ret = new JSObject();
    ret.put("scheduled", true);
    ret.put("triggerAtMs", triggerAtMs);
    call.resolve(ret);
  }

  @PluginMethod
  public void setFocusDndState(PluginCall call) {
    boolean enabled = call.getBoolean("enabled", false);
    boolean enableDnd = call.getBoolean("enableDnd", true);
    boolean allowAlarms = call.getBoolean("allowAlarms", true);
    long endsAtMs = call.getLong("endsAtMs", 0L);
    String focusLabel = call.getString("focusLabel", "Focus Session Complete");
    String timeLabel = call.getString("timeLabel", "");

    Context ctx = getContext();
    boolean dndGranted = FocusDndManager.isDndAccessGranted(ctx);
    boolean dndApplied = false;

    if (enabled) {
      if (enableDnd && dndGranted) {
        dndApplied = FocusDndManager.enableFocusDnd(ctx, allowAlarms);
      } else if (!enableDnd) {
        FocusDndManager.restoreFocusDnd(ctx);
      }
      if (endsAtMs > System.currentTimeMillis() + 500L) {
        FocusDndManager.scheduleFocusEnd(ctx, endsAtMs, focusLabel, timeLabel);
        FocusDndManager.startLockScreenCountdown(
          ctx,
          endsAtMs,
          focusLabel,
          timeLabel,
          dndApplied
        );
      }
    } else {
      FocusDndManager.cancelFocusEnd(ctx);
      FocusDndManager.restoreFocusDnd(ctx);
      FocusDndManager.stopLockScreenCountdown(ctx);
    }

    JSObject ret = new JSObject();
    ret.put("dndGranted", dndGranted);
    ret.put("dndApplied", dndApplied);
    call.resolve(ret);
  }

  @PluginMethod
  public void stopActiveAlert(PluginCall call) {
    String action = call.getString("action", "stop");
    Intent intent = new Intent(getContext(), AlarmForegroundService.class);
    intent.setAction("snooze".equals(action)
      ? AlarmForegroundService.ACTION_SNOOZE
      : AlarmForegroundService.ACTION_STOP);
    try {
      getContext().startService(intent);
    } catch (Exception ignored) {}
    call.resolve();
  }

  @PluginMethod
  public void startVoiceDictation(PluginCall call) {
    String prompt = call.getString("prompt", "Speak your note...");
    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
    intent.putExtra(
      RecognizerIntent.EXTRA_LANGUAGE_MODEL,
      RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
    );
    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
    intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
    try {
      startActivityForResult(call, intent, "handleVoiceResult");
    } catch (ActivityNotFoundException e) {
      call.reject("Voice dictation is not supported on this device.");
    }
  }

  @ActivityCallback
  private void handleVoiceResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    String text = "";
    if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
      ArrayList<String> matches = result
        .getData()
        .getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
      if (matches != null && !matches.isEmpty() && matches.get(0) != null) {
        text = matches.get(0);
      }
    }
    JSObject ret = new JSObject();
    ret.put("text", text);
    call.resolve(ret);
  }

  @PluginMethod
  public void exportBackupFile(PluginCall call) {
    String rawName = call.getString("fileName", "kairo-backup.json");
    String content = call.getString("content", "{}");
    String safeName = (rawName != null && !rawName.trim().isEmpty())
      ? rawName.trim().replaceAll("[^a-zA-Z0-9._-]", "_")
      : "kairo-backup.json";

    Context ctx = getContext();
    try {
      byte[] bytes = content.getBytes(StandardCharsets.UTF_8);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ContentResolver resolver = ctx.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
        values.put(
          MediaStore.Downloads.RELATIVE_PATH,
          Environment.DIRECTORY_DOWNLOADS + "/Kairo"
        );
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri != null) {
          try (OutputStream os = resolver.openOutputStream(uri)) {
            if (os != null) {
              os.write(bytes);
              os.flush();
              JSObject ret = new JSObject();
              ret.put("saved", true);
              ret.put("location", "Internal Storage/Download/Kairo/" + safeName);
              ret.put("fileName", safeName);
              call.resolve(ret);
              return;
            }
          }
        }
      }

      File baseDir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      if (baseDir == null) {
        baseDir = ctx.getFilesDir();
      }
      File dir = new File(baseDir, "Kairo");
      if (!dir.exists()) {
        dir.mkdirs();
      }
      File outFile = new File(dir, safeName);
      try (FileOutputStream fos = new FileOutputStream(outFile)) {
        fos.write(bytes);
        fos.flush();
      }

      JSObject ret = new JSObject();
      ret.put("saved", true);
      ret.put("location", outFile.getAbsolutePath());
      ret.put("fileName", safeName);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("Unable to export backup file: " + e.getMessage());
    }
  }

  @PluginMethod
  public void updateWidgetSummary(PluginCall call) {
    int tasksLeft = call.getInt("tasksLeft", 0);
    int remindersLeft = call.getInt("remindersLeft", 0);
    String nextAlarm = call.getString("nextAlarm", "Off");
    String nextTaskTitle = call.getString("nextTaskTitle", "All caught up today");

    Context ctx = getContext();
    SharedPreferences prefs = ctx.getSharedPreferences("kairo_native_prefs", Context.MODE_PRIVATE);
    prefs.edit()
      .putInt("widget_tasks_left", Math.max(0, tasksLeft))
      .putInt("widget_reminders_left", Math.max(0, remindersLeft))
      .putString("widget_next_alarm", nextAlarm != null ? nextAlarm : "Off")
      .putString("widget_next_task", nextTaskTitle != null ? nextTaskTitle : "All caught up today")
      .apply();

    KairoQuickWidgetProvider.updateAllWidgets(ctx);

    JSObject ret = new JSObject();
    ret.put("updated", true);
    call.resolve(ret);
  }

  @PluginMethod
  public void consumePendingQuickAdd(PluginCall call) {
    Context ctx = getContext();
    SharedPreferences prefs = ctx.getSharedPreferences("kairo_native_prefs", Context.MODE_PRIVATE);
    String target = prefs.getString("pending_quick_add_target", "");
    if (target != null && !target.isEmpty()) {
      prefs.edit().remove("pending_quick_add_target").apply();
    }
    JSObject ret = new JSObject();
    ret.put("target", target != null ? target : "");
    call.resolve(ret);
  }
}
