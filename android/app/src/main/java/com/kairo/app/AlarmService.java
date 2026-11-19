package com.kairo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

public class AlarmService extends Service {
    private static final String TAG = "KairoAlarmService";

    public static final String ACTION_START_ALARM = "com.kairo.app.ACTION_START_ALARM";
    public static final String ACTION_STOP_ALARM = "com.kairo.app.ACTION_STOP_ALARM";
    public static final String ACTION_SNOOZE_ALARM = "com.kairo.app.ACTION_SNOOZE_ALARM";

    private static final String CHANNEL_ID = "kairo_alarm_channel_v2";
    private static final int NOTIFICATION_ID = 2001;

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private Handler volumeHandler;
    private Runnable volumeRunnable;
    private float currentVolume = 0.1f;

    private String activeSlotKey;
    private String activeId;
    private String activeType;
    private String activeName;
    private String activeTimeLabel;
    private int activeSnoozeMinutes = 5;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_START_ALARM.equals(action)) {
            activeSlotKey = intent.getStringExtra("slotKey");
            activeId = intent.getStringExtra("id");
            activeType = intent.getStringExtra("type");
            activeName = intent.getStringExtra("name");
            activeTimeLabel = intent.getStringExtra("timeLabel");
            activeSnoozeMinutes = intent.getIntExtra("snoozeMinutes", 5);
            String vibrationMode = intent.getStringExtra("vibrationMode");

            startForegroundAlarm(activeType, activeTimeLabel, activeName, vibrationMode);
        } else if (ACTION_STOP_ALARM.equals(action)) {
            stopAlarm(false);
        } else if (ACTION_SNOOZE_ALARM.equals(action)) {
            stopAlarm(true);
        }

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Kairo Alarm Notifications",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("High priority notifications and full screen alerts for Kairo alarms");
            channel.setSound(null, null); // Sound handled via MediaPlayer
            channel.enableVibration(false); // Vibration handled via Vibrator

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundAlarm(String type, String timeLabel, String name, String vibrationMode) {
        // Build Full-Screen Intent for Ring Activity
        Intent ringIntent = new Intent(this, AlarmRingActivity.class);
        ringIntent.putExtra("slotKey", activeSlotKey);
        ringIntent.putExtra("id", activeId);
        ringIntent.putExtra("type", activeType);
        ringIntent.putExtra("name", activeName);
        ringIntent.putExtra("timeLabel", activeTimeLabel);
        ringIntent.putExtra("snoozeMinutes", activeSnoozeMinutes);
        ringIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
                this,
                NOTIFICATION_ID,
                ringIntent,
                pendingFlags
        );

        // Stop Action PendingIntent
        Intent stopIntent = new Intent(this, AlarmService.class);
        stopIntent.setAction(ACTION_STOP_ALARM);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 101, stopIntent, pendingFlags);

        // Snooze Action PendingIntent
        Intent snoozeIntent = new Intent(this, AlarmService.class);
        snoozeIntent.setAction(ACTION_SNOOZE_ALARM);
        PendingIntent snoozePendingIntent = PendingIntent.getService(this, 102, snoozeIntent, pendingFlags);

        String title = (type != null ? type.toUpperCase() : "ALARM") + " · " + (timeLabel != null ? timeLabel : "");
        String body = name != null && !name.isEmpty() ? name : "Kairo Alarm Triggered";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setFullScreenIntent(fullScreenPendingIntent, true)
                .setContentIntent(fullScreenPendingIntent)
                .addAction(R.mipmap.ic_launcher, "Stop", stopPendingIntent)
                .addAction(R.mipmap.ic_launcher, "Snooze " + activeSnoozeMinutes + "m", snoozePendingIntent);

        Notification notification = builder.build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
            if (Build.VERSION.SDK_INT >= 34) {
                try {
                    startForeground(NOTIFICATION_ID, notification, serviceType);
                } catch (Exception e) {
                    startForeground(NOTIFICATION_ID, notification);
                }
            } else {
                startForeground(NOTIFICATION_ID, notification, serviceType);
            }
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        startSoundAndVibration(vibrationMode);
    }

    private void startSoundAndVibration(String vibrationMode) {
        boolean allowVibrate = !"sound_only".equals(vibrationMode);

        // 1. Vibration
        if (allowVibrate) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    if (vm != null) vibrator = vm.getDefaultVibrator();
                } else {
                    vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                }

                if (vibrator != null && vibrator.hasVibrator()) {
                    long[] pattern = {0, 500, 500, 500};
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                    } else {
                        vibrator.vibrate(pattern, 0);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Error starting vibration", e);
            }
        }

        // 2. Sound / Ringtone
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmUri);

            AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            mediaPlayer.setAudioAttributes(aa);
            mediaPlayer.setLooping(true);

            boolean gradual = AlarmStorage.getInstance(this).isGradualVolume();
            if (gradual) {
                currentVolume = 0.05f;
                mediaPlayer.setVolume(currentVolume, currentVolume);
            } else {
                mediaPlayer.setVolume(1.0f, 1.0f);
            }

            mediaPlayer.prepare();
            mediaPlayer.start();

            if (gradual) {
                volumeHandler = new Handler(Looper.getMainLooper());
                volumeRunnable = new Runnable() {
                    @Override
                    public void run() {
                        if (mediaPlayer != null && mediaPlayer.isPlaying() && currentVolume < 1.0f) {
                            currentVolume = Math.min(1.0f, currentVolume + 0.1f);
                            try {
                                mediaPlayer.setVolume(currentVolume, currentVolume);
                            } catch (Exception ignored) {}
                            if (currentVolume < 1.0f) {
                                volumeHandler.postDelayed(this, 2000L);
                            }
                        }
                    }
                };
                volumeHandler.postDelayed(volumeRunnable, 2000L);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error playing alarm sound", e);
        }
    }

    private void stopAlarm(boolean snooze) {
        if (volumeHandler != null && volumeRunnable != null) {
            volumeHandler.removeCallbacks(volumeRunnable);
        }

        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }

        if (vibrator != null) {
            try {
                vibrator.cancel();
            } catch (Exception ignored) {}
            vibrator = null;
        }

        AlarmStorage storage = AlarmStorage.getInstance(this);
        storage.setActiveAlertState(false, "");

        if (activeSlotKey != null && !activeSlotKey.isEmpty()) {
            if (snooze) {
                long snoozeMins = activeSnoozeMinutes > 0 ? activeSnoozeMinutes : 5;
                long triggerAtMs = System.currentTimeMillis() + snoozeMins * 60 * 1000L;
                storage.addHandledAlert(activeSlotKey, activeId, activeType, activeName, activeTimeLabel, "snoozed", triggerAtMs);

                // Schedule snooze alarm
                try {
                    JSONObject obj = new JSONObject();
                    obj.put("slotKey", activeSlotKey + "-snooze-" + triggerAtMs);
                    obj.put("id", activeId);
                    obj.put("type", activeType);
                    obj.put("name", activeName != null ? activeName : "Snoozed Alert");
                    obj.put("timeLabel", activeTimeLabel);
                    obj.put("triggerAtMs", triggerAtMs);
                    obj.put("snoozeMinutes", activeSnoozeMinutes);
                    obj.put("vibrationMode", "sound_and_vibrate");

                    AlarmScheduler.scheduleSingleAlert(this, obj);
                } catch (Exception e) {
                    Log.e(TAG, "Error scheduling snoozed alert", e);
                }
            } else {
                storage.addHandledAlert(activeSlotKey, activeId, activeType, activeName, activeTimeLabel, "stopped", 0);
                storage.markAlertHandled(activeSlotKey);
            }
        }

        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopAlarm(false);
        super.onDestroy();
    }
}
