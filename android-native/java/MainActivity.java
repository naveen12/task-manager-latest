package __PACKAGE__;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String PREFS_NAME = "kairo_native_prefs";
  private static final String KEY_PENDING_QUICK_ADD = "pending_quick_add_target";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(KairoAlarmPlugin.class);
    captureQuickAddIntent(getIntent());
    super.onCreate(savedInstanceState);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    captureQuickAddIntent(intent);
  }

  private void captureQuickAddIntent(Intent intent) {
    if (intent == null) return;
    String target = intent.getStringExtra("quick_add_target");
    if (target != null && !target.trim().isEmpty()) {
      SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
      prefs.edit().putString(KEY_PENDING_QUICK_ADD, target.trim()).apply();
      intent.removeExtra("quick_add_target");
    }
  }
}
