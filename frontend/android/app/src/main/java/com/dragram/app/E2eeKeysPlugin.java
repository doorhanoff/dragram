package com.dragram.app;

import android.app.NotificationManager;
import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Мост между WebView и нативным хранилищем ключей.
 *
 * WebCrypto живёт внутри WebView, а push приходит, когда WebView не запущен,
 * поэтому ключи чатов дублируются в ChatKeyStore, откуда их берёт
 * DragramMessagingService.
 */
@CapacitorPlugin(name = "E2eeKeys")
public class E2eeKeysPlugin extends Plugin {

    @PluginMethod
    public void syncChatKey(PluginCall call) {
        String chatId = call.getString("chatId");
        String key = call.getString("key");
        if (chatId == null || key == null) {
            call.reject("chatId and key are required");
            return;
        }
        ChatKeyStore.put(getContext(), chatId, key);
        call.resolve();
    }

    @PluginMethod
    public void clearKeys(PluginCall call) {
        ChatKeyStore.clear(getContext());
        DragramMessagingService.forgetHistory();
        call.resolve();
    }

    /**
     * Снимает уведомления чата — пользователь открыл его и уже всё прочитал.
     */
    @PluginMethod
    public void clearChatNotifications(PluginCall call) {
        String chatId = call.getString("chatId");
        if (chatId == null) {
            call.reject("chatId is required");
            return;
        }
        NotificationManager manager =
            (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(DragramMessagingService.notificationId(chatId));
        }
        DragramMessagingService.forgetChat(chatId);
        call.resolve();
    }
}
