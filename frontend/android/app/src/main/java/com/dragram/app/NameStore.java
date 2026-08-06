package com.dragram.app;

import android.content.Context;

/**
 * Локальный справочник имён: id пользователя или чата → отображаемое имя.
 *
 * Нужен, чтобы в push-уведомлении не приходилось передавать имя отправителя и
 * название чата. Раньше они ехали в data-payload открытым текстом, и Google
 * видел, кто кому и когда пишет, даже не имея возможности прочитать сам текст.
 * Теперь сервер шлёт только идентификаторы, а имя подставляется здесь —
 * так же, как это делает Signal.
 *
 * Справочник наполняет WebView (E2eeKeysPlugin.syncNames) при загрузке списка
 * чатов. Если имени нет — уведомление покажет нейтральную подпись.
 */
final class NameStore {

    private static final SecureStore STORE =
        new SecureStore("dragram_names", "dragram_names_master");

    private NameStore() {}

    static void put(Context context, String id, String name) {
        STORE.put(context, id, name);
    }

    static String get(Context context, String id) {
        return id == null ? null : STORE.get(context, id);
    }

    static void clear(Context context) {
        STORE.clear(context);
    }
}
