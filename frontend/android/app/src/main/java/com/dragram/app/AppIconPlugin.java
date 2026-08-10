package com.dragram.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

/**
 * Иконка приложения под выбранную палитру.
 *
 * Переключается activity-alias, а приложение запущено через один из них.
 * Выключить тот alias, из которого стартовала текущая задача, — значит
 * убить эту задачу: DONT_KILL_APP от этого не спасает, флаг относится к
 * процессу, а не к задаче. Выглядело это так: человек нажимает «Очаг»,
 * приложение закрывается, и он оказывается на рабочем столе, решив, что
 * сломал телефон.
 *
 * Поэтому выбор только ЗАПОМИНАЕТСЯ, а alias переключается позже — когда
 * активность и так закрывается (isFinishing). Иконка на рабочем столе
 * меняется к следующему запуску, а из работающего приложения не выбрасывает.
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {

    private static final String PREFS = "dragram_app_icon";
    private static final String KEY_PENDING = "pending_theme";
    private static final String KEY_APPLIED = "applied_theme";
    private static final String DEFAULT_THEME = "hearth";

    private static final Map<String, String> ALIASES = new HashMap<>();
    static {
        ALIASES.put("hearth", "com.dragram.app.IconHearth");
        ALIASES.put("forest", "com.dragram.app.IconForest");
        ALIASES.put("sky", "com.dragram.app.IconSky");
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        String requested = call.getString("theme", DEFAULT_THEME);
        String theme = ALIASES.containsKey(requested) ? requested : DEFAULT_THEME;

        prefs().edit().putString(KEY_PENDING, theme).apply();

        JSObject ret = new JSObject();
        ret.put("theme", theme);
        // pending: иконка сменится не сейчас, а при закрытии приложения.
        ret.put("pending", !theme.equals(appliedTheme()));
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        // isFinishing отделяет настоящее закрытие от пересоздания активности
        // при повороте экрана или смене темы системы: во втором случае
        // выключение alias убило бы приложение прямо посреди работы.
        if (getActivity() == null || !getActivity().isFinishing()) return;
        applyPending();
    }

    private void applyPending() {
        SharedPreferences prefs = prefs();
        String pending = prefs.getString(KEY_PENDING, null);
        if (pending == null || pending.equals(appliedTheme())) return;
        if (!ALIASES.containsKey(pending)) return;

        PackageManager pm = getContext().getPackageManager();
        String packageName = getContext().getPackageName();

        for (Map.Entry<String, String> entry : ALIASES.entrySet()) {
            ComponentName component = new ComponentName(packageName, entry.getValue());
            int state = entry.getKey().equals(pending)
                ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            pm.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP);
        }

        prefs.edit().putString(KEY_APPLIED, pending).apply();
    }

    private String appliedTheme() {
        return prefs().getString(KEY_APPLIED, DEFAULT_THEME);
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
