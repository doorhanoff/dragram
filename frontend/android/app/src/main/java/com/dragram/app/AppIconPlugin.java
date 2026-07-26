package com.dragram.app;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {

    private static final Map<String, String> ALIASES = new HashMap<>();
    static {
        ALIASES.put("hearth", "com.dragram.app.IconHearth");
        ALIASES.put("forest", "com.dragram.app.IconForest");
        ALIASES.put("sky", "com.dragram.app.IconSky");
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        String requested = call.getString("theme", "hearth");
        String theme = ALIASES.containsKey(requested) ? requested : "hearth";

        PackageManager pm = getContext().getPackageManager();
        String packageName = getContext().getPackageName();

        for (Map.Entry<String, String> entry : ALIASES.entrySet()) {
            ComponentName component = new ComponentName(packageName, entry.getValue());
            int state = entry.getKey().equals(theme)
                ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            pm.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP);
        }

        JSObject ret = new JSObject();
        ret.put("theme", theme);
        call.resolve(ret);
    }
}
