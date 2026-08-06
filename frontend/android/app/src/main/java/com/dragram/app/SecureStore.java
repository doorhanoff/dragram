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
 * Хранилище строк, зашифрованных мастер-ключом из Android Keystore.
 *
 * Общая основа для ChatKeyStore (ключи чатов) и NameStore (имена собеседников).
 * Мастер-ключ не экспортируется наружу: даже с root-доступом к файлу настроек
 * значения не прочитать, не выполнив код от имени этого приложения.
 *
 * Namespace: androidx.security (EncryptedSharedPreferences) делает ровно это,
 * но объявлена deprecated без замены — поэтому работаем с Keystore напрямую.
 * Отличие: ключи записей лежат в открытом виде, шифруются только значения.
 * Ключи записей — обычные UUID без личных данных.
 */
final class SecureStore {

    private static final String TAG = "DragramStore";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final int GCM_TAG_BITS = 128;
    private static final String SEP = ":";

    private final String file;
    private final String masterAlias;

    SecureStore(String file, String masterAlias) {
        this.file = file;
        this.masterAlias = masterAlias;
    }

    private SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(file, Context.MODE_PRIVATE);
    }

    /** Достаёт мастер-ключ из Keystore, создавая его при первом обращении. */
    private synchronized SecretKey masterKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(masterAlias, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(
                masterAlias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    void put(Context context, String key, String value) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            // IV для Keystore-ключа задаёт сам Keystore: свой передавать нельзя,
            // он требует рандомизированного шифрования.
            cipher.init(Cipher.ENCRYPT_MODE, masterKey());
            byte[] ct = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                + SEP
                + Base64.encodeToString(ct, Base64.NO_WRAP);
            prefs(context).edit().putString(key, stored).apply();
        } catch (Exception e) {
            // Не фатально: уведомление просто останется с общей подписью.
            Log.e(TAG, "Failed to store value in " + file, e);
        }
    }

    String get(Context context, String key) {
        String stored = prefs(context).getString(key, null);
        if (stored == null) return null;
        try {
            String[] parts = stored.split(SEP, 2);
            if (parts.length != 2) return null;
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ct = Base64.decode(parts[1], Base64.NO_WRAP);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, masterKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            Log.e(TAG, "Failed to read value from " + file, e);
            return null;
        }
    }

    void clear(Context context) {
        prefs(context).edit().clear().apply();
    }
}
