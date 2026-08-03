package com.dragram.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Хранилище AES-ключей чатов для расшифровки push-уведомлений.
 *
 * Ключи кладёт сюда WebView (через E2eeKeysPlugin), а читает
 * DragramMessagingService — ему они нужны в момент, когда WebView не запущен
 * и WebCrypto недоступен.
 *
 * Каждое значение шифруется мастер-ключом из Android Keystore. Сам мастер-ключ
 * не экспортируется наружу: даже с root-доступом к файлу настроек ключи чатов
 * не прочитать, не выполнив код от имени этого приложения.
 *
 * Namespace: androidx.security (EncryptedSharedPreferences) делает ровно это,
 * но объявлена deprecated без замены — поэтому работаем с Keystore напрямую.
 * Отличие: id чатов здесь лежат в открытом виде, шифруются только сами ключи.
 * Это обычные UUID без личных данных.
 */
final class ChatKeyStore {

    private static final String TAG = "DragramKeys";
    private static final String FILE = "dragram_chat_keys";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String MASTER_ALIAS = "dragram_chat_keys_master";
    private static final int GCM_TAG_BITS = 128;
    private static final String SEP = ":";

    private ChatKeyStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** Достаёт мастер-ключ из Keystore, создавая его при первом обращении. */
    private static synchronized SecretKey masterKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(MASTER_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(
                MASTER_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    static void put(Context context, String chatId, String keyBase64) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            // IV для Keystore-ключа задаёт сам Keystore: свой передавать нельзя,
            // он требует рандомизированного шифрования.
            cipher.init(Cipher.ENCRYPT_MODE, masterKey());
            byte[] ct = cipher.doFinal(keyBase64.getBytes(StandardCharsets.UTF_8));
            String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                + SEP
                + Base64.encodeToString(ct, Base64.NO_WRAP);
            prefs(context).edit().putString(chatId, stored).apply();
        } catch (Exception e) {
            // Не фатально: уведомления этого чата останутся с общей подписью.
            Log.e(TAG, "Failed to store chat key", e);
        }
    }

    /** Возвращает сырой AES-256 ключ чата или null, если его здесь нет. */
    static byte[] get(Context context, String chatId) {
        String stored = prefs(context).getString(chatId, null);
        if (stored == null) return null;
        try {
            String[] parts = stored.split(SEP, 2);
            if (parts.length != 2) return null;
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ct = Base64.decode(parts[1], Base64.NO_WRAP);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, masterKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            String keyBase64 = new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
            return Base64.decode(keyBase64, Base64.DEFAULT);
        } catch (Exception e) {
            Log.e(TAG, "Failed to read chat key", e);
            return null;
        }
    }

    /** Вызывается при выходе из аккаунта: чужие уведомления расшифровывать нечем. */
    static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }
}
