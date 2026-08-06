package com.dragram.app;

import android.content.Context;
import android.util.Base64;

/**
 * Хранилище AES-ключей чатов для расшифровки push-уведомлений.
 *
 * Ключи кладёт сюда WebView (через E2eeKeysPlugin), а читает
 * DragramMessagingService — ему они нужны в момент, когда WebView не запущен
 * и WebCrypto недоступен. Шифрованием занимается SecureStore.
 */
final class ChatKeyStore {

    private static final SecureStore STORE =
        new SecureStore("dragram_chat_keys", "dragram_chat_keys_master");

    private ChatKeyStore() {}

    static void put(Context context, String chatId, String keyBase64) {
        STORE.put(context, chatId, keyBase64);
    }

    /** Возвращает сырой AES-256 ключ чата или null, если его здесь нет. */
    static byte[] get(Context context, String chatId) {
        String keyBase64 = STORE.get(context, chatId);
        return keyBase64 == null ? null : Base64.decode(keyBase64, Base64.DEFAULT);
    }

    /** Вызывается при выходе из аккаунта: чужие уведомления расшифровывать нечем. */
    static void clear(Context context) {
        STORE.clear(context);
    }
}
