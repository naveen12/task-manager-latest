package com.kairo.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.RecognizerIntent;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

@CapacitorPlugin(
        name = "KairoAlarm",
        permissions = {
                @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
        }
)
public class KairoAlarmPlugin extends Plugin {

    @PluginMethod
    public void syncAlerts(PluginCall call) {
        String alertsJson = call.getString("alertsJson", "[]");
        boolean gradualVolume = call.getBoolean("gradualVolume", true);

        AlarmStorage storage = AlarmStorage.getInstance(getContext());
        storage.saveScheduledAlerts(alertsJson, gradualVolume);

        AlarmScheduler.scheduleAll(getContext());

        int count = 0;
        try {
            JSONArray arr = new JSONArray(alertsJson);
            count = arr.length();
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("scheduled", count);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPermissionStatus(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        // 1. Post Notifications
        boolean postNotifications = true;
        if (Build.VERSION.SDK_INT >= 33) {
            postNotifications = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        // 2. Exact Alarms
        boolean exactAlarms = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            exactAlarms = am != null && am.canScheduleExactAlarms();
        }

        // 3. Full Screen Intent
        boolean fullScreenIntent = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            fullScreenIntent = nm != null && nm.canUseFullScreenIntent();
        }

        // 4. Draw Overlay / System Alert Window
        boolean overlayPermission = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            overlayPermission = Settings.canDrawOverlays(context);
        }

        // 5. Battery Optimization Ignored
        boolean batteryOptimizationIgnored = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            batteryOptimizationIgnored = pm != null && pm.isIgnoringBatteryOptimizations(context.getPackageName());
        }

        // 6. DND Access
        boolean dndAccess = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            dndAccess = nm != null && nm.isNotificationPolicyAccessGranted();
        }

        ret.put("postNotifications", postNotifications);
        ret.put("exactAlarms", exactAlarms);
        ret.put("fullScreenIntent", fullScreenIntent);
        ret.put("overlayPermission", overlayPermission);
        ret.put("batteryOptimizationIgnored", batteryOptimizationIgnored);
        ret.put("dndAccess", dndAccess);

        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationPermCallback");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PermissionCallback
    private void notificationPermCallback(PluginCall call) {
        boolean granted = getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 34) {
            intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openDndSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openAppInfoSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void testLockScreenAlert(PluginCall call) {
        int delaySeconds = call.getInt("delaySeconds", 5);
        long triggerAtMs = System.currentTimeMillis() + (delaySeconds * 1000L);

        try {
            JSONObject obj = new JSONObject();
            obj.put("slotKey", "test-lockscreen-" + triggerAtMs);
            obj.put("id", "test-lockscreen");
            obj.put("type", "alarm");
            obj.put("name", "Test Lock-Screen Ring");
            obj.put("timeLabel", "TEST ALARM");
            obj.put("triggerAtMs", triggerAtMs);
            obj.put("snoozeMinutes", 5);
            obj.put("vibrationMode", "sound_and_vibrate");

            AlarmScheduler.scheduleSingleAlert(getContext(), obj);

            JSObject ret = new JSObject();
            ret.put("scheduled", true);
            ret.put("triggerAtMs", triggerAtMs);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to schedule test alert", e);
        }
    }

    @PluginMethod
    public void setFocusDndState(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        boolean enableDnd = call.getBoolean("enableDnd", false);
        long endsAtMs = call.getLong("endsAtMs", 0L);
        String focusLabel = call.getString("focusLabel", "Deep Work");

        Context context = getContext();
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean dndGranted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && nm != null) {
            dndGranted = nm.isNotificationPolicyAccessGranted();
        }

        Intent serviceIntent = new Intent(context, FocusService.class);
        if (enabled) {
            serviceIntent.setAction(FocusService.ACTION_START_FOCUS);
            serviceIntent.putExtra("endsAtMs", endsAtMs);
            serviceIntent.putExtra("focusLabel", focusLabel);
            serviceIntent.putExtra("enableDnd", enableDnd);
            ContextCompat.startForegroundService(context, serviceIntent);
        } else {
            serviceIntent.setAction(FocusService.ACTION_STOP_FOCUS);
            context.startService(serviceIntent);
        }

        JSObject ret = new JSObject();
        ret.put("dndGranted", dndGranted);
        ret.put("dndApplied", enabled && enableDnd && dndGranted);
        call.resolve(ret);
    }

    @PluginMethod
    public void stopActiveAlert(PluginCall call) {
        String actionStr = call.getString("action", "stop");
        Intent serviceIntent = new Intent(getContext(), AlarmService.class);
        if ("snooze".equalsIgnoreCase(actionStr)) {
            serviceIntent.setAction(AlarmService.ACTION_SNOOZE_ALARM);
        } else {
            serviceIntent.setAction(AlarmService.ACTION_STOP_ALARM);
        }
        getContext().startService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void consumeHandledAlerts(PluginCall call) {
        AlarmStorage storage = AlarmStorage.getInstance(getContext());
        String handledJson = storage.getHandledAlertsJson();
        boolean isAlertActive = storage.isAlertActive();
        String activeSlotKey = storage.getActiveSlotKey();
        long stoppedFocusEndMs = storage.getAndClearFocusStoppedEndMs();

        storage.clearHandledAlerts();

        JSObject ret = new JSObject();
        ret.put("handledJson", handledJson);
        ret.put("isAlertActive", isAlertActive);
        ret.put("activeSlotKey", activeSlotKey);
        ret.put("stoppedFocusEndMs", stoppedFocusEndMs);
        call.resolve(ret);
    }

    @PluginMethod
    public void markAlertHandled(PluginCall call) {
        String slotKey = call.getString("slotKey");
        if (slotKey != null && !slotKey.isEmpty()) {
            AlarmStorage.getInstance(getContext()).markAlertHandled(slotKey);
        }
        call.resolve();
    }

    @PluginMethod
    public void startVoiceDictation(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Speak your note..."));

        try {
            startActivityForResult(call, intent, "voiceDictationCallback");
        } catch (Exception e) {
            call.reject("Voice dictation is not available on this device", e);
        }
    }

    @ActivityCallback
    private void voiceDictationCallback(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> matches = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty()) {
                JSObject ret = new JSObject();
                ret.put("text", matches.get(0));
                call.resolve(ret);
                return;
            }
        }
        call.reject("Voice dictation was canceled or returned no results.");
    }

    @PluginMethod
    public void exportBackupFile(PluginCall call) {
        String fileName = call.getString("fileName", "kairo_backup.json");
        String content = call.getString("content", "");

        try {
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!downloadsDir.exists()) {
                downloadsDir.mkdirs();
            }
            File file = new File(downloadsDir, fileName);
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
            }

            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("location", file.getAbsolutePath());
            ret.put("fileName", fileName);
            call.resolve(ret);
        } catch (Exception e) {
            // Fallback to internal app storage
            try {
                File fallbackDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (fallbackDir != null && !fallbackDir.exists()) fallbackDir.mkdirs();
                File fallbackFile = new File(fallbackDir, fileName);
                try (FileOutputStream fos = new FileOutputStream(fallbackFile)) {
                    fos.write(content.getBytes(StandardCharsets.UTF_8));
                }
                JSObject ret = new JSObject();
                ret.put("saved", true);
                ret.put("location", fallbackFile.getAbsolutePath());
                ret.put("fileName", fileName);
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject("Failed to export backup file", ex);
            }
        }
    }

    @PluginMethod
    public void updateWidgetSummary(PluginCall call) {
        int tasksLeft = call.getInt("tasksLeft", 0);
        int remindersLeft = call.getInt("remindersLeft", 0);
        String nextAlarm = call.getString("nextAlarm", "None");
        String nextTaskTitle = call.getString("nextTaskTitle", "");
        String next3HoursJson = call.getString("next3HoursJson", "[]");
        int items3hCount = call.getInt("itemsInNext3HoursCount", 0);

        AlarmStorage storage = AlarmStorage.getInstance(getContext());
        storage.saveWidgetSummary(tasksLeft, remindersLeft, nextAlarm, nextTaskTitle, next3HoursJson, items3hCount);

        KairoWidgetProvider.updateAllWidgets(getContext());

        JSObject ret = new JSObject();
        ret.put("updated", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void consumePendingQuickAdd(PluginCall call) {
        String target = AlarmStorage.getInstance(getContext()).getAndClearPendingQuickAdd();
        JSObject ret = new JSObject();
        ret.put("target", target);
        call.resolve(ret);
    }
}
