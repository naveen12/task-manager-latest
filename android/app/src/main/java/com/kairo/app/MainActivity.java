package com.kairo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KairoAlarmPlugin.class);
        super.onCreate(savedInstanceState);

        if (getIntent() != null && getIntent().hasExtra("quickAdd")) {
            String target = getIntent().getStringExtra("quickAdd");
            AlarmStorage.getInstance(this).setPendingQuickAdd(target);
        }
    }
}
