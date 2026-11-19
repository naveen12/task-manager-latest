package __PACKAGE__;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.app.NotificationCompat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class AlarmForegroundService extends Service {
  public static final String ACTION_START = "com.kairo.app.ACTION_START_ALERT";
  public static final String ACTION_SNOOZE = "com.kairo.app.ACTION_SNOOZE_ALERT";
  public static final String ACTION_STOP = "com.kairo.app.ACTION_STOP_ALERT";
  public static final String ACTION_CLOSE_POPUP = "com.kairo.app.ACTION_CLOSE_LOCK_POPUP";

  public static final String CHANNEL_ID = "kairo_urgent_alerts_v4";
  private static final int NOTIFICATION_ID = 42001;
  private static final long CRESCENDO_DURATION_MS = 15000L;

  public static volatile boolean isAlertActive = false;
  public static volatile String activeSlotKey = "";

  private MediaPlayer mediaPlayer;
  private Ringtone fallbackRingtone;
  private Vibrator vibrator;
  private PowerManager.WakeLock screenWakeLock;
  private final Handler volumeHandler = new Handler(Looper.getMainLooper());
  private Runnable volumeRunnable;

  private String currentId = "alert";
  private String currentSlotKey = "";
  private String currentType = "alarm";
  private String currentName = "Kairo Alert";
  private String currentTime = "";
  private int currentSnoozeMinutes = 5;
  private String currentVibrationMode = "sound_and_vibrate";

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      stopSelf();
      return START_NOT_STICKY;
    }

    String action = intent.getAction();
    if (ACTION_STOP.equals(action)) {
      AlarmScheduler.recordHandledAlert(
        this,
        currentSlotKey,
        currentId,
        currentType,
        currentName,
        currentTime,
        "stopped",
        0L
      );
      stopAlertAndSelf();
      return START_NOT_STICKY;
    }

    if (ACTION_SNOOZE.equals(action)) {
      long snoozeAtMs = scheduleSnooze();
      AlarmScheduler.recordHandledAlert(
        this,
        currentSlotKey,
        currentId,
        currentType,
        currentName,
        currentTime,
        "snoozed",
        snoozeAtMs
      );
      stopAlertAndSelf();
      return START_NOT_STICKY;
    }

    String id = intent.getStringExtra("alert_id");
    String slotKey = intent.getStringExtra("slot_key");
    String type = intent.getStringExtra("alert_type");
    String name = intent.getStringExtra("alert_name");
    String time = intent.getStringExtra("alert_time");
    int snoozeMins = intent.getIntExtra("snooze_minutes", 5);
    String vibMode = intent.getStringExtra("vibration_mode");

    if (id != null && !id.isEmpty()) currentId = id;
    currentSlotKey = (slotKey != null && !slotKey.isEmpty()) ? slotKey : currentId;
    if (type != null && !type.isEmpty()) currentType = type;
    if (name != null && !name.isEmpty()) currentName = name;
    if (time != null) currentTime = time;
    currentSnoozeMinutes = Math.max(1, snoozeMins);
    currentVibrationMode = (vibMode != null && !vibMode.isEmpty()) ? vibMode : "sound_and_vibrate";

    isAlertActive = true;
    activeSlotKey = currentSlotKey;

    wakeScreenIfNeeded();
    ensureNotificationChannel();
    Notification notification = buildUrgentNotification();
    promoteToForegroundAndNotify(notification);

    AlarmScheduler.recordHandledAlert(
      this,
      currentSlotKey,
      currentId,
      currentType,
      currentName,
      currentTime,
      "fired",
      0L
    );

    if (!"vibrate_only".equalsIgnoreCase(currentVibrationMode)) {
      startAlarmAudio();
    } else {
      stopAlarmAudio();
    }
    if (!"sound_only".equalsIgnoreCase(currentVibrationMode)) {
      startAlarmVibration();
    } else {
      stopAlarmVibration();
    }
    launchLockScreenActivity();

    return START_STICKY;
  }

  private void promoteToForegroundAndNotify(Notification notification) {
    boolean promoted = false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        );
        promoted = true;
      } catch (Exception ignored) {}
    }
    if (!promoted) {
      try {
        startForeground(NOTIFICATION_ID, notification);
      } catch (Exception ignored) {}
    }

    try {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) {
        nm.notify(NOTIFICATION_ID, notification);
      }
    } catch (Exception ignored) {}
  }

  @SuppressWarnings("deprecation")
  private void wakeScreenIfNeeded() {
    try {
      PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
      if (pm == null) return;
      KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
      boolean locked = km != null && km.isKeyguardLocked();
      if (!pm.isInteractive() || locked) {
        releaseScreenWakeLock();
        screenWakeLock = pm.newWakeLock(
          PowerManager.SCREEN_BRIGHT_WAKE_LOCK |
          PowerManager.ACQUIRE_CAUSES_WAKEUP |
          PowerManager.ON_AFTER_RELEASE,
          "Kairo::AlarmLockScreenWake"
        );
        screenWakeLock.acquire(15000L);
      }
    } catch (Exception ignored) {}
  }

  private void releaseScreenWakeLock() {
    if (screenWakeLock != null) {
      try {
        if (screenWakeLock.isHeld()) {
          screenWakeLock.release();
        }
      } catch (Exception ignored) {}
      screenWakeLock = null;
    }
  }

  private void ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;

    NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
    if (existing != null) return;

    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      "Alarms, Reminders & Task Alerts",
      NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("High-priority heads-up and lock-screen alerts with Snooze and Stop");
    channel.enableLights(true);
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setBypassDnd(true);
    nm.createNotificationChannel(channel);
  }

  private String formatTypeTitle() {
    if ("reminder".equalsIgnoreCase(currentType)) return "Reminder";
    if ("task".equalsIgnoreCase(currentType)) return "Task";
    if ("focus".equalsIgnoreCase(currentType)) return "Focus Complete";
    return "Alarm";
  }

  private Notification buildUrgentNotification() {
    Intent fullScreenIntent = new Intent(this, AlarmLockScreenActivity.class);
    fullScreenIntent.setFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK |
      Intent.FLAG_ACTIVITY_CLEAR_TOP |
      Intent.FLAG_ACTIVITY_SINGLE_TOP
    );
    fullScreenIntent.putExtra("alert_id", currentId);
    fullScreenIntent.putExtra("slot_key", currentSlotKey);
    fullScreenIntent.putExtra("alert_type", currentType);
    fullScreenIntent.putExtra("alert_name", currentName);
    fullScreenIntent.putExtra("alert_time", currentTime);
    fullScreenIntent.putExtra("snooze_minutes", currentSnoozeMinutes);

    PendingIntent fullScreenPi = PendingIntent.getActivity(
      this,
      9001,
      fullScreenIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Intent snoozeIntent = new Intent(this, AlarmForegroundService.class);
    snoozeIntent.setAction(ACTION_SNOOZE);
    PendingIntent snoozePi = PendingIntent.getService(
      this,
      9002,
      snoozeIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Intent stopIntent = new Intent(this, AlarmForegroundService.class);
    stopIntent.setAction(ACTION_STOP);
    PendingIntent stopPi = PendingIntent.getService(
      this,
      9003,
      stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    int smallIcon = getApplicationInfo().icon != 0
      ? getApplicationInfo().icon
      : android.R.drawable.ic_lock_idle_alarm;

    String title = formatTypeTitle() + (currentTime.isEmpty() ? "" : " · " + currentTime);

    return new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(smallIcon)
      .setContentTitle(title)
      .setContentText(currentName)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setDefaults(NotificationCompat.DEFAULT_LIGHTS)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(fullScreenPi)
      .setFullScreenIntent(fullScreenPi, true)
      .addAction(0, "Snooze " + currentSnoozeMinutes + "m", snoozePi)
      .addAction(0, "Stop", stopPi)
      .build();
  }

  private void launchLockScreenActivity() {
    try {
      Intent popupIntent = new Intent(this, AlarmLockScreenActivity.class);
      popupIntent.setFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK |
        Intent.FLAG_ACTIVITY_CLEAR_TOP |
        Intent.FLAG_ACTIVITY_SINGLE_TOP |
        Intent.FLAG_ACTIVITY_NO_USER_ACTION
      );
      popupIntent.putExtra("alert_id", currentId);
      popupIntent.putExtra("slot_key", currentSlotKey);
      popupIntent.putExtra("alert_type", currentType);
      popupIntent.putExtra("alert_name", currentName);
      popupIntent.putExtra("alert_time", currentTime);
      popupIntent.putExtra("snooze_minutes", currentSnoozeMinutes);
      startActivity(popupIntent);
    } catch (Exception ignored) {}
  }

  private Uri resolveAlarmUri() {
    Uri[] candidates = new Uri[]{
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
    };
    for (Uri uri : candidates) {
      if (uri != null) return uri;
    }
    return null;
  }

  private boolean tryStartMediaPlayer(Uri toneUri, boolean gradual) {
    if (toneUri == null) return false;
    MediaPlayer player = null;
    try {
      player = new MediaPlayer();
      player.setDataSource(this, toneUri);
      player.setAudioAttributes(
        new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      );
      player.setLooping(true);
      player.prepare();
      mediaPlayer = player;

      if (gradual) {
        mediaPlayer.setVolume(0.12f, 0.12f);
        final long startMs = System.currentTimeMillis();
        volumeRunnable = new Runnable() {
          @Override
          public void run() {
            if (mediaPlayer == null) return;
            long elapsed = Math.max(0L, System.currentTimeMillis() - startMs);
            float t = Math.min(1f, (float) elapsed / (float) CRESCENDO_DURATION_MS);
            float eased = 0.12f + 0.88f * (t * t * (3f - 2f * t));
            try {
              mediaPlayer.setVolume(eased, eased);
            } catch (Exception ignored) {}
            if (t < 1f) {
              volumeHandler.postDelayed(this, 450L);
            }
          }
        };
        volumeHandler.postDelayed(volumeRunnable, 450L);
      } else {
        mediaPlayer.setVolume(1.0f, 1.0f);
      }

      mediaPlayer.start();
      return true;
    } catch (Exception e) {
      if (player != null) {
        try {
          player.release();
        } catch (Exception ignored) {}
      }
      mediaPlayer = null;
      return false;
    }
  }

  private void startAlarmAudio() {
    stopAlarmAudio();
    boolean gradual = AlarmScheduler.isGradualVolumeEnabled(this);

    Uri[] candidates = new Uri[]{
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
    };
    for (Uri uri : candidates) {
      if (tryStartMediaPlayer(uri, gradual)) {
        return;
      }
    }

    // Final fallback using Android Ringtone API if MediaPlayer fails on a device
    try {
      Uri fallbackUri = resolveAlarmUri();
      if (fallbackUri != null) {
        fallbackRingtone = RingtoneManager.getRingtone(this, fallbackUri);
        if (fallbackRingtone != null) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            fallbackRingtone.setLooping(true);
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            fallbackRingtone.setAudioAttributes(
              new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            );
          }
          fallbackRingtone.play();
        }
      }
    } catch (Exception ignored) {}
  }

  private void stopAlarmAudio() {
    if (volumeRunnable != null) {
      volumeHandler.removeCallbacks(volumeRunnable);
      volumeRunnable = null;
    }
    volumeHandler.removeCallbacksAndMessages(null);
    if (mediaPlayer != null) {
      try {
        if (mediaPlayer.isPlaying()) {
          mediaPlayer.stop();
        }
        mediaPlayer.release();
      } catch (Exception ignored) {}
      mediaPlayer = null;
    }
    if (fallbackRingtone != null) {
      try {
        if (fallbackRingtone.isPlaying()) {
          fallbackRingtone.stop();
        }
      } catch (Exception ignored) {}
      fallbackRingtone = null;
    }
  }

  private void startAlarmVibration() {
    try {
      vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
      if (vibrator == null || !vibrator.hasVibrator()) return;
      long[] pattern = new long[]{0, 500, 300, 500};
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
      } else {
        vibrator.vibrate(pattern, 0);
      }
    } catch (Exception ignored) {}
  }

  private void stopAlarmVibration() {
    if (vibrator != null) {
      try {
        vibrator.cancel();
      } catch (Exception ignored) {}
      vibrator = null;
    }
  }

  private long scheduleSnooze() {
    long snoozeAtMs = System.currentTimeMillis() + (long) currentSnoozeMinutes * 60L * 1000L;
    String nextTime = new SimpleDateFormat("hh:mm a", Locale.US).format(new Date(snoozeAtMs));
    String snoozeSlotKey = currentId + "-snooze-" + snoozeAtMs;
    int reqCode = Math.abs(snoozeSlotKey.hashCode());
    AlarmScheduler.scheduleSingle(
      this,
      reqCode,
      currentId,
      snoozeSlotKey,
      currentType,
      currentName,
      nextTime,
      snoozeAtMs,
      currentSnoozeMinutes,
      currentVibrationMode
    );
    return snoozeAtMs;
  }

  private void stopAlertAndSelf() {
    isAlertActive = false;
    activeSlotKey = "";
    stopAlarmAudio();
    stopAlarmVibration();
    releaseScreenWakeLock();

    Intent closePopup = new Intent(ACTION_CLOSE_POPUP);
    closePopup.setPackage(getPackageName());
    sendBroadcast(closePopup);

    try {
      NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) {
        nm.cancel(NOTIFICATION_ID);
      }
    } catch (Exception ignored) {}

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE);
    } else {
      stopForeground(true);
    }
    stopSelf();
  }

  @Override
  public void onDestroy() {
    isAlertActive = false;
    activeSlotKey = "";
    stopAlarmAudio();
    stopAlarmVibration();
    releaseScreenWakeLock();
    super.onDestroy();
  }
}
