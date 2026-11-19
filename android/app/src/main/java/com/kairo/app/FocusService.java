package com.kairo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;

public class FocusService extends Service {
    private static final String TAG = "KairoFocusService";

    public static final String ACTION_START_FOCUS = "com.kairo.app.ACTION_START_FOCUS";
    public static final String ACTION_STOP_FOCUS = "com.kairo.app.ACTION_STOP_FOCUS";

    private static final String CHANNEL_ID = "kairo_focus_channel_v2";
    private static final int NOTIFICATION_ID = 3001;

    private Handler handler;
    private Runnable runnable;

    private long endsAtMs;
    private String focusLabel;
    private boolean dndApplied = false;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        handler = new Handler(Looper.getMainLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();
        if (ACTION_START_FOCUS.equals(action)) {
            endsAtMs = intent.getLongExtra("endsAtMs", 0);
            focusLabel = intent.getStringExtra("focusLabel");
            boolean enableDnd = intent.getBooleanExtra("enableDnd", false);

            if (enableDnd) {
                applyDndMode(true);
            }

            startForegroundFocus();
            startCountdown();
        } else if (ACTION_STOP_FOCUS.equals(action)) {
            stopFocus(false);
        }

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Kairo Focus Sessions",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Ongoing notification for active Kairo focus timer session");
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundFocus() {
        Intent appIntent = new Intent(this, MainActivity.class);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, NOTIFICATION_ID, appIntent, pendingFlags);

        Intent stopIntent = new Intent(this, FocusService.class);
        stopIntent.setAction(ACTION_STOP_FOCUS);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 103, stopIntent, pendingFlags);

        long diffMs = Math.max(0, endsAtMs - System.currentTimeMillis());
        long mins = diffMs / 60000;
        long secs = (diffMs % 60000) / 1000;
        String timeStr = String.format("%02d:%02d", mins, secs);

        String title = "Focus Session · " + timeStr;
        String text = focusLabel != null && !focusLabel.isEmpty() ? focusLabel : "Deep Work Sprint";

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(R.mipmap.ic_launcher, "End Focus", stopPendingIntent)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE;
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
    }

    private void updateNotification() {
        Intent appIntent = new Intent(this, MainActivity.class);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, NOTIFICATION_ID, appIntent, pendingFlags);

        Intent stopIntent = new Intent(this, FocusService.class);
        stopIntent.setAction(ACTION_STOP_FOCUS);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 103, stopIntent, pendingFlags);

        long diffMs = Math.max(0, endsAtMs - System.currentTimeMillis());
        long mins = diffMs / 60000;
        long secs = (diffMs % 60000) / 1000;
        String timeStr = String.format("%02d:%02d", mins, secs);

        String title = "Focus Session · " + timeStr;
        String text = focusLabel != null && !focusLabel.isEmpty() ? focusLabel : "Deep Work Sprint";

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .addAction(R.mipmap.ic_launcher, "End Focus", stopPendingIntent)
                .build();

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, notification);
        }
    }

    private void startCountdown() {
        if (runnable != null) handler.removeCallbacks(runnable);
        runnable = new Runnable() {
            @Override
            public void run() {
                long now = System.currentTimeMillis();
                if (endsAtMs > 0 && now >= endsAtMs) {
                    stopFocus(true);
                } else {
                    updateNotification();
                    handler.postDelayed(this, 1000L);
                }
            }
        };
        handler.postDelayed(runnable, 1000L);
    }

    private void applyDndMode(boolean enable) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && nm.isNotificationPolicyAccessGranted()) {
            try {
                if (enable) {
                    nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS);
                    dndApplied = true;
                } else if (dndApplied) {
                    nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL);
                    dndApplied = false;
                }
            } catch (Exception ignored) {}
        }
    }

    private void stopFocus(boolean timerCompleted) {
        if (runnable != null) {
            handler.removeCallbacks(runnable);
        }

        applyDndMode(false);

        if (timerCompleted) {
            AlarmStorage.getInstance(this).setFocusStoppedEndMs(endsAtMs);
            try {
                Uri notifUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                RingtoneManager.getRingtone(this, notifUri).play();
            } catch (Exception ignored) {}
        }

        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopFocus(false);
        super.onDestroy();
    }
}
