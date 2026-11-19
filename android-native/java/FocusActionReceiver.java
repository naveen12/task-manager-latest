package __PACKAGE__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class FocusActionReceiver extends BroadcastReceiver {
  public static final String ACTION_STOP_FOCUS = "com.kairo.app.ACTION_STOP_FOCUS_TIMER";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    if (ACTION_STOP_FOCUS.equals(intent.getAction())) {
      long endsAtMs = intent.getLongExtra(
        "ends_at_ms",
        FocusDndManager.getActiveFocusEndMs(context)
      );
      FocusDndManager.cancelFocusEnd(context);
      FocusDndManager.restoreFocusDnd(context);
      FocusDndManager.markFocusStoppedByUser(context, endsAtMs);
      FocusDndManager.stopLockScreenCountdown(context);
    }
  }
}
