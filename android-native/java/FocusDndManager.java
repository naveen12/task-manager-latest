package __PACKAGE__;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class FocusDndManager {
  public static final String ACTION_CLOSE_FOCUS_SCREEN = "com.kairo.app.ACTION_CLOSE_FOCUS_SCREEN";
  public static final String FOCUS_CHANNEL_ID = "kairo_focus_timer_v2";
  private static final int FOCUS_NOTIFICATION_ID = 42002;

  private static final String PREFS_NAME = "kairo_focus_dnd_prefs";
  private static final String KEY_DND_ACTIVE = "kairo_dnd_active";
  private static final String KEY_PREV_FILTER = "prev_interruption_filter";
  private static final String KEY_HAS_PREV_POLICY = "has_prev_policy";
  private static final String KEY_PREV_POLICY_CATS = "prev_policy_cats";
  private static final String KEY_PREV_POLICY_CALLS = "prev_policy_calls";
  private static final String KEY_PREV_POLICY_MSGS = "prev_policy_msgs";
  private static final String KEY_PREV_POLICY_VISUAL = "prev_policy_visual";
  private static final String KEY_ACTIVE_FOCUS_END_MS = "active_focus_end_ms";
  private static final String KEY_STOPPED_FOCUS_END_MS = "stopped_focus_end_ms";
  private static final int FOCUS_END_REQ_CODE = 77001;

  private FocusDndManager() {}

  public static boolean isDndAccessGranted(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return true;
    }
    NotificationManager nm =
      (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    return nm != null && nm.isNotificationPolicyAccessGranted();
  }

  public static boolean isFocusDndActive(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    return prefs.getBoolean(KEY_DND_ACTIVE, false);
  }

  public static long getActiveFocusEndMs(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    return prefs.getLong(KEY_ACTIVE_FOCUS_END_MS, 0L);
  }

  public static boolean enableFocusDnd(Context context, boolean allowAlarms) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return false;
    }
    NotificationManager nm =
      (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || !nm.isNotificationPolicyAccessGranted()) {
      return false;
    }

    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    boolean alreadyActive = prefs.getBoolean(KEY_DND_ACTIVE, false);
    SharedPreferences.Editor editor = prefs.edit();

    if (!alreadyActive) {
      int prevFilter = nm.getCurrentInterruptionFilter();
      if (prevFilter == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
        prevFilter = NotificationManager.INTERRUPTION_FILTER_ALL;
      }
      editor.putInt(KEY_PREV_FILTER, prevFilter);

      try {
        NotificationManager.Policy prevPolicy = nm.getNotificationPolicy();
        if (prevPolicy != null) {
          editor.putBoolean(KEY_HAS_PREV_POLICY, true);
          editor.putInt(KEY_PREV_POLICY_CATS, prevPolicy.priorityCategories);
          editor.putInt(KEY_PREV_POLICY_CALLS, prevPolicy.priorityCallSenders);
          editor.putInt(KEY_PREV_POLICY_MSGS, prevPolicy.priorityMessageSenders);
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            editor.putInt(KEY_PREV_POLICY_VISUAL, prevPolicy.suppressedVisualEffects);
          }
        }
      } catch (Exception ignored) {}
    }

    try {
      // Allow ONLY alarms (blocks WhatsApp messages, normal calls, repeat callers, events, reminders)
      // Do NOT suppress SUPPRESSED_EFFECT_FULL_SCREEN_INTENT or SUPPRESSED_EFFECT_NOTIFICATION_LIST
      // so Kairo's lock-screen Focus countdown and full-screen alarms remain visible.
      int focusCategories = allowAlarms && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
        ? NotificationManager.Policy.PRIORITY_CATEGORY_ALARMS
        : 0;

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        int suppressedVisual =
          NotificationManager.Policy.SUPPRESSED_EFFECT_PEEK |
          NotificationManager.Policy.SUPPRESSED_EFFECT_LIGHTS |
          NotificationManager.Policy.SUPPRESSED_EFFECT_BADGE;

        nm.setNotificationPolicy(
          new NotificationManager.Policy(
            focusCategories,
            NotificationManager.Policy.PRIORITY_SENDERS_STARRED,
            NotificationManager.Policy.PRIORITY_SENDERS_STARRED,
            suppressedVisual
          )
        );
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        nm.setNotificationPolicy(
          new NotificationManager.Policy(
            focusCategories,
            NotificationManager.Policy.PRIORITY_SENDERS_STARRED,
            NotificationManager.Policy.PRIORITY_SENDERS_STARRED,
            NotificationManager.Policy.SUPPRESSED_EFFECT_SCREEN_ON
          )
        );
      } else {
        nm.setNotificationPolicy(
          new NotificationManager.Policy(
            focusCategories,
            NotificationManager.Policy.PRIORITY_SENDERS_STARRED,
            NotificationManager.Policy.PRIORITY_SENDERS_STARRED
          )
        );
      }

      nm.setInterruptionFilter(
        allowAlarms
          ? NotificationManager.INTERRUPTION_FILTER_PRIORITY
          : NotificationManager.INTERRUPTION_FILTER_NONE
      );

      int appliedFilter = nm.getCurrentInterruptionFilter();
      boolean activeNow = appliedFilter != NotificationManager.INTERRUPTION_FILTER_ALL;
      editor.putBoolean(KEY_DND_ACTIVE, activeNow).apply();
      return activeNow;
    } catch (Exception e) {
      return false;
    }
  }

  public static boolean restoreFocusDnd(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    if (!prefs.getBoolean(KEY_DND_ACTIVE, false)) {
      return true;
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      prefs.edit().putBoolean(KEY_DND_ACTIVE, false).apply();
      return true;
    }

    NotificationManager nm =
      (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || !nm.isNotificationPolicyAccessGranted()) {
      prefs.edit().putBoolean(KEY_DND_ACTIVE, false).apply();
      return false;
    }

    if (prefs.getBoolean(KEY_HAS_PREV_POLICY, false)) {
      try {
        int cats = prefs.getInt(KEY_PREV_POLICY_CATS, 0);
        int calls = prefs.getInt(
          KEY_PREV_POLICY_CALLS,
          NotificationManager.Policy.PRIORITY_SENDERS_CONTACTS
        );
        int msgs = prefs.getInt(
          KEY_PREV_POLICY_MSGS,
          NotificationManager.Policy.PRIORITY_SENDERS_CONTACTS
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          int visual = prefs.getInt(KEY_PREV_POLICY_VISUAL, 0);
          nm.setNotificationPolicy(new NotificationManager.Policy(cats, calls, msgs, visual));
        } else {
          nm.setNotificationPolicy(new NotificationManager.Policy(cats, calls, msgs));
        }
      } catch (Exception ignored) {}
    }

    int prevFilter = prefs.getInt(KEY_PREV_FILTER, NotificationManager.INTERRUPTION_FILTER_ALL);
    if (prevFilter == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) {
      prevFilter = NotificationManager.INTERRUPTION_FILTER_ALL;
    }

    try {
      nm.setInterruptionFilter(prevFilter);
    } catch (Exception ignored) {}

    prefs
      .edit()
      .putBoolean(KEY_DND_ACTIVE, false)
      .putBoolean(KEY_HAS_PREV_POLICY, false)
      .apply();
    return true;
  }

  public static void scheduleFocusEnd(
    Context context,
    long endsAtMs,
    String focusLabel,
    String timeLabel
  ) {
    cancelFocusEnd(context);
    if (endsAtMs <= System.currentTimeMillis() + 500L) return;
    String safeLabel =
      (focusLabel != null && !focusLabel.trim().isEmpty())
        ? focusLabel.trim()
        : "Focus Session Complete";
    AlarmScheduler.scheduleSingle(
      context,
      FOCUS_END_REQ_CODE,
      "focus-session",
      "focus-" + endsAtMs,
      "focus",
      safeLabel,
      timeLabel != null ? timeLabel : "",
      endsAtMs
    );
  }

  public static void markFocusStoppedByUser(Context context, long endsAtMs) {
    if (endsAtMs <= 0L) return;
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    prefs.edit().putLong(KEY_STOPPED_FOCUS_END_MS, endsAtMs).apply();
  }

  public static long consumeStoppedFocusEndMs(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    long stopped = prefs.getLong(KEY_STOPPED_FOCUS_END_MS, 0L);
    if (stopped > 0L) {
      prefs.edit().remove(KEY_STOPPED_FOCUS_END_MS).apply();
    }
    return stopped;
  }

  private static void ensureFocusChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm =
      (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    if (nm.getNotificationChannel(FOCUS_CHANNEL_ID) != null) return;

    NotificationChannel channel = new NotificationChannel(
      FOCUS_CHANNEL_ID,
      "Focus Lock-Screen Countdown",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Live Focus countdown timer visible on the lock screen");
    channel.setSound(null, null);
    channel.enableVibration(false);
    channel.enableLights(false);
    channel.setShowBadge(false);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setBypassDnd(true);
    nm.createNotificationChannel(channel);
  }

  public static void startLockScreenCountdown(
    Context context,
    long endsAtMs,
    String focusLabel,
    String timeLabel,
    boolean dndActive
  ) {
    if (endsAtMs <= System.currentTimeMillis() + 500L) return;
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    prefs
      .edit()
      .putLong(KEY_ACTIVE_FOCUS_END_MS, endsAtMs)
      .remove(KEY_STOPPED_FOCUS_END_MS)
      .apply();

    try {
      ensureFocusChannel(context);

      String safeLabel = (focusLabel != null && !focusLabel.trim().isEmpty())
        ? focusLabel.trim()
        : "Deep Focus Session";
      String safeTime = (timeLabel != null && !timeLabel.trim().isEmpty())
        ? timeLabel.trim()
        : new SimpleDateFormat("hh:mm a", Locale.US).format(new Date(endsAtMs));

      Intent openAppIntent = new Intent(context, MainActivity.class);
      openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      PendingIntent openAppPi = PendingIntent.getActivity(
        context,
        9101,
        openAppIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );

      Intent fullScreenIntent = new Intent(context, FocusLockScreenActivity.class);
      fullScreenIntent.setFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK |
        Intent.FLAG_ACTIVITY_CLEAR_TOP |
        Intent.FLAG_ACTIVITY_SINGLE_TOP
      );
      fullScreenIntent.putExtra("ends_at_ms", endsAtMs);
      fullScreenIntent.putExtra("focus_label", safeLabel);
      fullScreenIntent.putExtra("time_label", safeTime);
      fullScreenIntent.putExtra("dnd_active", dndActive);
      PendingIntent fullScreenPi = PendingIntent.getActivity(
        context,
        9102,
        fullScreenIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );

      Intent stopIntent = new Intent(context, FocusActionReceiver.class);
      stopIntent.setAction(FocusActionReceiver.ACTION_STOP_FOCUS);
      stopIntent.putExtra("ends_at_ms", endsAtMs);
      PendingIntent stopPi = PendingIntent.getBroadcast(
        context,
        9103,
        stopIntent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );

      int smallIcon = context.getApplicationInfo().icon != 0
        ? context.getApplicationInfo().icon
        : android.R.drawable.ic_lock_idle_alarm;

      String title = dndActive ? "Focus Timer · DND ON" : "Focus Timer Active";
      String body = safeLabel + " · Ends " + safeTime;

      Notification notification = new NotificationCompat.Builder(context, FOCUS_CHANNEL_ID)
        .setSmallIcon(smallIcon)
        .setContentTitle(title)
        .setContentText(body)
        .setWhen(endsAtMs)
        .setShowWhen(true)
        .setUsesChronometer(true)
        .setChronometerCountDown(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(openAppPi)
        .addAction(0, "Full Screen", fullScreenPi)
        .addAction(0, "End Focus", stopPi)
        .build();

      NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) {
        nm.notify(FOCUS_NOTIFICATION_ID, notification);
      }
    } catch (Exception ignored) {}
  }

  public static void stopLockScreenCountdown(Context context) {
    try {
      SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
      prefs.edit().remove(KEY_ACTIVE_FOCUS_END_MS).apply();
    } catch (Exception ignored) {}
    try {
      NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) {
        nm.cancel(FOCUS_NOTIFICATION_ID);
      }
    } catch (Exception ignored) {}
    try {
      Intent closeScreen = new Intent(ACTION_CLOSE_FOCUS_SCREEN);
      closeScreen.setPackage(context.getPackageName());
      context.sendBroadcast(closeScreen);
    } catch (Exception ignored) {}
  }

  public static void cancelFocusEnd(Context context) {
    AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (am == null) return;
    try {
      Intent intent = new Intent(context, ExactAlarmReceiver.class);
      PendingIntent pi = PendingIntent.getBroadcast(
        context,
        FOCUS_END_REQ_CODE,
        intent,
        PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
      );
      if (pi != null) {
        am.cancel(pi);
        pi.cancel();
      }
    } catch (Exception ignored) {}
  }
}
