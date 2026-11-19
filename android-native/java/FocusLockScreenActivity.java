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
import android.os.CountDownTimer;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Locale;

public class FocusLockScreenActivity extends Activity {
  private CountDownTimer timer;
  private TextView countdownView;

  private final BroadcastReceiver closeReceiver = new BroadcastReceiver() {
    @Override
    public void onReceive(Context context, Intent intent) {
      finish();
    }
  };

  @SuppressWarnings("deprecation")
  private void applyLockFlags() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
    }
    getWindow().addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
    );
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applyLockFlags();

    long endsAtMs = getIntent().getLongExtra("ends_at_ms", FocusDndManager.getActiveFocusEndMs(this));
    String focusLabel = getIntent().getStringExtra("focus_label");
    String timeLabel = getIntent().getStringExtra("time_label");
    boolean dndActive = getIntent().getBooleanExtra("dnd_active", false);

    String displayLabel = (focusLabel != null && !focusLabel.trim().isEmpty())
      ? focusLabel.trim()
      : "Deep Focus Session";
    int accentColor = dndActive ? Color.parseColor("#34D399") : Color.parseColor("#818CF8");

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
    card.setPadding(cardPad, dp(32), cardPad, cardPad);
    GradientDrawable cardBg = new GradientDrawable();
    cardBg.setColor(Color.parseColor("#141622"));
    cardBg.setCornerRadius(dp(28));
    cardBg.setStroke(dp(1), Color.argb(120, Color.red(accentColor), Color.green(accentColor), Color.blue(accentColor)));
    card.setBackground(cardBg);

    TextView statusView = new TextView(this);
    statusView.setText(dndActive ? "FOCUS TIMER · DND ACTIVE" : "FOCUS TIMER");
    statusView.setTextColor(accentColor);
    statusView.setTextSize(12);
    statusView.setTypeface(Typeface.DEFAULT_BOLD);
    statusView.setGravity(Gravity.CENTER);
    card.addView(statusView);

    countdownView = new TextView(this);
    countdownView.setTextColor(Color.parseColor("#F8FAFC"));
    countdownView.setTextSize(54);
    countdownView.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
    countdownView.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams timerLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    timerLp.topMargin = dp(18);
    timerLp.bottomMargin = dp(10);
    card.addView(countdownView, timerLp);

    TextView labelView = new TextView(this);
    labelView.setText(displayLabel + (timeLabel != null && !timeLabel.isEmpty() ? "\nEnds at " + timeLabel : ""));
    labelView.setTextColor(Color.parseColor("#94A3B8"));
    labelView.setTextSize(14);
    labelView.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams labelLp = new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    );
    labelLp.bottomMargin = dp(28);
    card.addView(labelView, labelLp);

    LinearLayout buttonRow = new LinearLayout(this);
    buttonRow.setOrientation(LinearLayout.HORIZONTAL);
    buttonRow.setGravity(Gravity.CENTER);

    Button closeBtn = new Button(this);
    closeBtn.setText("Hide");
    closeBtn.setAllCaps(false);
    closeBtn.setTextColor(Color.parseColor("#F8FAFC"));
    closeBtn.setTextSize(15);
    closeBtn.setTypeface(Typeface.DEFAULT_BOLD);
    GradientDrawable closeBg = new GradientDrawable();
    closeBg.setColor(Color.parseColor("#24283B"));
    closeBg.setCornerRadius(dp(16));
    closeBtn.setBackground(closeBg);
    LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(0, dp(52), 1f);
    closeLp.rightMargin = dp(8);
    buttonRow.addView(closeBtn, closeLp);

    Button endBtn = new Button(this);
    endBtn.setText("End Focus");
    endBtn.setAllCaps(false);
    endBtn.setTextColor(Color.parseColor("#090A0F"));
    endBtn.setTextSize(15);
    endBtn.setTypeface(Typeface.DEFAULT_BOLD);
    GradientDrawable endBg = new GradientDrawable();
    endBg.setColor(accentColor);
    endBg.setCornerRadius(dp(16));
    endBtn.setBackground(endBg);
    LinearLayout.LayoutParams endLp = new LinearLayout.LayoutParams(0, dp(52), 1f);
    endLp.leftMargin = dp(8);
    buttonRow.addView(endBtn, endLp);

    card.addView(buttonRow, new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ));

    root.addView(card, new LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ));
    setContentView(root);

    closeBtn.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View v) {
        finish();
      }
    });

    endBtn.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View v) {
        Intent i = new Intent(FocusLockScreenActivity.this, FocusActionReceiver.class);
        i.setAction(FocusActionReceiver.ACTION_STOP_FOCUS);
        i.putExtra("ends_at_ms", endsAtMs);
        sendBroadcast(i);
        finish();
      }
    });

    startCountdown(endsAtMs);

    IntentFilter filter = new IntentFilter(FocusDndManager.ACTION_CLOSE_FOCUS_SCREEN);
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(closeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
    } else {
      registerReceiver(closeReceiver, filter);
    }
  }

  private void startCountdown(long endsAtMs) {
    if (timer != null) {
      timer.cancel();
      timer = null;
    }
    long remaining = Math.max(0L, endsAtMs - System.currentTimeMillis());
    updateTimerText(remaining);
    if (remaining <= 0L) {
      finish();
      return;
    }
    timer = new CountDownTimer(remaining, 1000L) {
      @Override
      public void onTick(long millisUntilFinished) {
        updateTimerText(millisUntilFinished);
      }

      @Override
      public void onFinish() {
        updateTimerText(0L);
        finish();
      }
    }.start();
  }

  private void updateTimerText(long millis) {
    long totalSecs = Math.max(0L, (long) Math.ceil(millis / 1000.0));
    long mins = totalSecs / 60L;
    long secs = totalSecs % 60L;
    if (countdownView != null) {
      countdownView.setText(String.format(Locale.US, "%02d:%02d", mins, secs));
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    applyLockFlags();
    long endsAtMs = intent.getLongExtra("ends_at_ms", FocusDndManager.getActiveFocusEndMs(this));
    startCountdown(endsAtMs);
  }

  @Override
  protected void onDestroy() {
    if (timer != null) {
      timer.cancel();
      timer = null;
    }
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
