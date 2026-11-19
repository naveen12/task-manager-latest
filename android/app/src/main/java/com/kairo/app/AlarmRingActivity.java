package com.kairo.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AlarmRingActivity extends Activity {
    private String type;
    private String name;
    private String timeLabel;
    private int snoozeMinutes = 5;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Turn screen on and display over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        );

        Intent intent = getIntent();
        if (intent != null) {
            type = intent.getStringExtra("type");
            name = intent.getStringExtra("name");
            timeLabel = intent.getStringExtra("timeLabel");
            snoozeMinutes = intent.getIntExtra("snoozeMinutes", 5);
        }

        buildUi();
    }

    private void buildUi() {
        float density = getResources().getDisplayMetrics().density;

        // Outer Root View
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0B0F19"));
        root.setGravity(Gravity.CENTER);
        int pad = (int) (20 * density);
        root.setPadding(pad, pad, pad, pad);

        // Inner Card Container
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setOrientation(GradientDrawable.Orientation.TOP_BOTTOM);
        cardBg.setColors(new int[]{Color.parseColor("#172033"), Color.parseColor("#0F172A")});
        cardBg.setCornerRadius(28 * density);
        cardBg.setStroke((int) (1 * density), Color.parseColor("#334155"));
        card.setBackground(cardBg);

        int cardPad = (int) (28 * density);
        card.setPadding(cardPad, cardPad, cardPad, cardPad);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        card.setLayoutParams(cardParams);

        // Color Palette based on alert type
        String alertType = type != null ? type.toLowerCase() : "alarm";
        int badgeTextColor;
        int badgeBgColor;
        int badgeBorderColor;
        int stopStartColor;
        int stopEndColor;

        if ("reminder".equals(alertType)) {
            badgeTextColor = Color.parseColor("#34D399");
            badgeBgColor = Color.parseColor("#064E3B");
            badgeBorderColor = Color.parseColor("#10B981");
            stopStartColor = Color.parseColor("#059669");
            stopEndColor = Color.parseColor("#10B981");
        } else if ("task".equals(alertType)) {
            badgeTextColor = Color.parseColor("#A5B4FC");
            badgeBgColor = Color.parseColor("#1E1B4B");
            badgeBorderColor = Color.parseColor("#6366F1");
            stopStartColor = Color.parseColor("#4F46E5");
            stopEndColor = Color.parseColor("#6366F1");
        } else {
            // Alarm (Default)
            badgeTextColor = Color.parseColor("#FB7185");
            badgeBgColor = Color.parseColor("#4C0519");
            badgeBorderColor = Color.parseColor("#F43F5E");
            stopStartColor = Color.parseColor("#E11D48");
            stopEndColor = Color.parseColor("#FB7185");
        }

        // 1. Type Badge
        TextView badge = new TextView(this);
        badge.setText((type != null ? type.toUpperCase() : "ALARM") + " · ACTIVE");
        badge.setTextColor(badgeTextColor);
        badge.setTextSize(12);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        badge.setLetterSpacing(0.08f);

        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(badgeBgColor);
        badgeBg.setCornerRadius(20 * density);
        badgeBg.setStroke((int) (1 * density), badgeBorderColor);
        int badgePadH = (int) (18 * density);
        int badgePadV = (int) (7 * density);
        badge.setPadding(badgePadH, badgePadV, badgePadH, badgePadV);
        badge.setBackground(badgeBg);
        card.addView(badge);

        addSpace(card, 20);

        // 2. Large Time Display
        TextView timeTv = new TextView(this);
        timeTv.setText(timeLabel != null && !timeLabel.isEmpty() ? timeLabel : "ALARM");
        timeTv.setTextColor(Color.WHITE);
        timeTv.setTextSize(46);
        timeTv.setTypeface(Typeface.DEFAULT_BOLD);
        timeTv.setGravity(Gravity.CENTER);
        card.addView(timeTv);

        addSpace(card, 10);

        // 3. Name / Title
        TextView nameTv = new TextView(this);
        nameTv.setText(name != null && !name.isEmpty() ? name : "Kairo Alarm Triggered");
        nameTv.setTextColor(Color.parseColor("#CBD5E1"));
        nameTv.setTextSize(18);
        nameTv.setTypeface(Typeface.DEFAULT_BOLD);
        nameTv.setGravity(Gravity.CENTER);
        card.addView(nameTv);

        addSpace(card, 36);

        // 4. Buttons Layout
        LinearLayout buttonsLayout = new LinearLayout(this);
        buttonsLayout.setOrientation(LinearLayout.VERTICAL);
        buttonsLayout.setGravity(Gravity.CENTER);
        buttonsLayout.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        // Snooze Button
        Button snoozeBtn = new Button(this);
        snoozeBtn.setText("Snooze (" + snoozeMinutes + "m)");
        snoozeBtn.setTextColor(Color.parseColor("#F8FAFC"));
        snoozeBtn.setTextSize(15);
        snoozeBtn.setTypeface(Typeface.DEFAULT_BOLD);

        GradientDrawable snoozeBg = new GradientDrawable();
        snoozeBg.setOrientation(GradientDrawable.Orientation.TOP_BOTTOM);
        snoozeBg.setColors(new int[]{Color.parseColor("#1E293B"), Color.parseColor("#0F172A")});
        snoozeBg.setCornerRadius(16 * density);
        snoozeBg.setStroke((int) (1 * density), Color.parseColor("#334155"));
        snoozeBtn.setBackground(snoozeBg);

        LinearLayout.LayoutParams btnParams1 = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (int) (54 * density)
        );
        btnParams1.setMargins(0, 0, 0, (int) (12 * density));
        snoozeBtn.setLayoutParams(btnParams1);
        snoozeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onSnoozeClicked();
            }
        });
        buttonsLayout.addView(snoozeBtn);

        // Stop Button
        Button stopBtn = new Button(this);
        stopBtn.setText("STOP ALARM");
        stopBtn.setTextColor(Color.WHITE);
        stopBtn.setTextSize(17);
        stopBtn.setTypeface(Typeface.DEFAULT_BOLD);

        GradientDrawable stopBg = new GradientDrawable();
        stopBg.setOrientation(GradientDrawable.Orientation.LEFT_RIGHT);
        stopBg.setColors(new int[]{stopStartColor, stopEndColor});
        stopBg.setCornerRadius(16 * density);
        stopBtn.setBackground(stopBg);

        LinearLayout.LayoutParams btnParams2 = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (int) (60 * density)
        );
        stopBtn.setLayoutParams(btnParams2);
        stopBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onStopClicked();
            }
        });
        buttonsLayout.addView(stopBtn);

        card.addView(buttonsLayout);
        root.addView(card);

        setContentView(root);
    }

    private void addSpace(LinearLayout parent, int dp) {
        View v = new View(this);
        int pixels = (int) (dp * getResources().getDisplayMetrics().density);
        v.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, pixels));
        parent.addView(v);
    }

    private void onSnoozeClicked() {
        Intent serviceIntent = new Intent(this, AlarmService.class);
        serviceIntent.setAction(AlarmService.ACTION_SNOOZE_ALARM);
        startService(serviceIntent);
        finish();
    }

    private void onStopClicked() {
        Intent serviceIntent = new Intent(this, AlarmService.class);
        serviceIntent.setAction(AlarmService.ACTION_STOP_ALARM);
        startService(serviceIntent);
        finish();
    }
}
