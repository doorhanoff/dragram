package com.dragram.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppIconPlugin.class);
        registerPlugin(E2eeKeysPlugin.class);
        registerPlugin(DownloadPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
