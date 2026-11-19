package __PACKAGE__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    String action = intent != null ? intent.getAction() : null;
    if (
      Intent.ACTION_BOOT_COMPLETED.equals(action) ||
      "android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)
    ) {
      AlarmScheduler.rescheduleSaved(context);
    }
  }
}
