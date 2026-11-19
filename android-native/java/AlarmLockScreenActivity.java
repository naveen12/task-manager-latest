package __PACKAGE__;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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

public class AlarmLockScreenActivity extends Activity {
  private final BroadcastReceiver closeReceiver = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      finish();
    }
  };

  @SuppressWarnings("deprecation")
  private void applyLockScreenWindowFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    }
    getWindow().addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
      WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
      WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
    );
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyLockScreenWindowFlags();

    String type = getIntent().getStringExtra("alert_type");
    String name = getIntent().getStringExtra("alert_name");
    String time = getIntent().getStringExtra("alert_time");
    int snoozeMinutes = Math.max(1, getIntent().getIntExtra("snooze_minutes", 5));

    String typeLabel = "ALARM";
    int accentColor = Color.parseColor("#F59E0B");
    if ("reminder".equalsIgnoreCase(type)) {
      typeLabel = "REMINDER";
      accentColor = Color.parseColor("#10B981");
    } else if ("task".equalsIgnoreCase(type)) {
      typeLabel = "TASK";
      accentColor = Color.parseColor("#818CF8");
    } else if ("focus".equalsIgnoreCase(type)) {
      typeLabel = "FOCUS COMPLETE";
      accentColor = Color.parseColor("#34D399");
    }

    String displayName = (name != null && !name.isEmpty()) ? name : "Kairo Alert";
    String headerMeta = typeLabel + (time != null && !time.isEmpty() ? "  ·  " + time : "");

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER);
    root.setBackgroundColor(Color.parseColor("#090A0F"));
    int pad = dp(24);
    root.setPadding(pad, pad, pad, pad);

    LinearLayout card = new LinearLayout(this);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setGravity(Gravity.CENTER_HORIZONTAL);
    int cardPad = dp(24);
    card.setPadding(cardPad, dp(28), cardPad, cardPad);
    GradientDrawable cardBg = new GradientDrawable();
    cardBg.setColor(Color.parseColor("#141622"));
    cardBg.setCornerRadius(dp(28));
    cardBg.setStroke(dp(1), Color.argb(120, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)));
    card.setBackground(cardBg);

    TextView typeView = new TextView(this);
    typeView.setText(headerMeta);
    typeView.setTextColor(accentColor);
    typeView.setTextSize(13);
    typeView.setTypeface(Typeface.DEFAULT_BOLD);
    typeView.setGravity(Gravity.CENTER);
    card.addView(typeView);

    TextView nameView = new TextView(this);
    nameView.setText(displayName);
    nameView.setTextColor(Color.parseColor("#F8FAFC"));
    nameView.setTextSize(24);
    nameView.setTypeface(Typeface.DEFAULT_BOLD);
    nameView.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    nameLp.topMargin = dp(14);
    nameLp.bottomMargin = dp(28);
    card.addView(nameView, nameLp);

    LinearLayout buttonRow = new LinearLayout(this);
    buttonRow.setOrientation(LinearLayout.HORIZONTAL);
    buttonRow.setGravity(Gravity.CENTER);

    Button snoozeBtn = new Button(this);
    snoozeBtn.setText("Snooze " + snoozeMinutes + "m");
    snoozeBtn.setAllCaps(false);
    snoozeBtn.setTextColor(Color.parseColor("#F8FAFC"));
    snoozeBtn.setTextSize(15);
    snoozeBtn.setTypeface(Typeface.DEFAULT_BOLD);
    GradientDrawable snoozeBg = new GradientDrawable();
    snoozeBg.setColor(Color.parseColor("#24283B"));
    snoozeBg.setCornerRadius(dp(16));
    snoozeBtn.setBackground(snoozeBg);
    LinearLayout.LayoutParams snoozeLp = new LinearLayout.LayoutParams(0, dp(56), 1f);
    snoozeLp.rightMargin = dp(8);
    buttonRow.addView(snoozeBtn, snoozeLp);

    Button stopBtn = new Button(this);
    stopBtn.setText("Stop");
    stopBtn.setAllCaps(false);
    stopBtn.setTextColor(Color.parseColor("#090A0F"));
    stopBtn.setTextSize(15);
    stopBtn.setTypeface(Typeface.DEFAULT_BOLD);
    GradientDrawable stopBg = new GradientDrawable();
    stopBg.setColor(accentColor);
    stopBg.setCornerRadius(dp(16));
    stopBtn.setBackground(stopBg);
    LinearLayout.LayoutParams stopLp = new LinearLayout.LayoutParams(0, dp(56), 1f);
    stopLp.leftMargin = dp(8);
    buttonRow.addView(stopBtn, stopLp);

    card.addView(buttonRow, new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ));

    LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    root.addView(card, cardLp);
    setContentView(root);

    snoozeBtn.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View v) {
        Intent i = new Intent(AlarmLockScreenActivity.this, AlarmForegroundService.class);
        i.setAction(AlarmForegroundService.ACTION_SNOOZE);
        startService(i);
        finish();
      }
    });

    stopBtn.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View v) {
        Intent i = new Intent(AlarmLockScreenActivity.this, AlarmForegroundService.class);
        i.setAction(AlarmForegroundService.ACTION_STOP);
        startService(i);
        finish();
      }
    });

    IntentFilter filter = new IntentFilter(AlarmForegroundService.ACTION_CLOSE_POPUP);
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(closeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    } else {
      registerReceiver(closeReceiver, filter);
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    applyLockScreenWindowFlags();
    recreate();
  }

  @Override
  protected void onDestroy() {
    try {
      unregisterReceiver(closeReceiver);
    } catch (Exception ignored) {}
    super.onDestroy();
  }

  private int dp(int value) {
    float density = getResources().getDisplayMetrics().density;
    return Math.round(value * density);
  }
}
