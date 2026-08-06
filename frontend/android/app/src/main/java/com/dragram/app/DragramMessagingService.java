package com.dragram.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Показывает push-уведомления с расшифрованным текстом.
 *
 * Сервер шлёт data-only push (без notification-блока), поэтому Android будит
 * этот сервис вместо того, чтобы рисовать уведомление самому. Текст сообщения
 * приезжает в поле "ct" зашифрованным — ключ чата берём из ChatKeyStore
 * и расшифровываем прямо здесь. Ни сервер, ни FCM открытый текст не видят.
 *
 * Если ключа нет или расшифровка не удалась, показываем общую подпись из "body" —
 * так же ведут себя Signal и WhatsApp, когда расшифровать не получилось.
 */
public class DragramMessagingService extends MessagingService {

    private static final String TAG = "DragramPush";
    private static final String CHANNEL_ID = "dragram_messages";
    private static final int GCM_TAG_BITS = 128;
    private static final int HISTORY_LIMIT = 6;

    /**
     * Последние показанные сообщения по чатам — нужны, чтобы уведомление
     * росло веткой переписки, а не заменялось одной строкой.
     * Только в памяти: класть расшифрованный текст на диск незачем,
     * после перезапуска процесса ветка просто начнётся заново.
     */
    private static final int HISTORY_CHATS = 20;

    private static final Map<String, List<Msg>> HISTORY = Collections.synchronizedMap(
        new LinkedHashMap<String, List<Msg>>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, List<Msg>> eldest) {
                return size() > HISTORY_CHATS;
            }
        }
    );

    /** Одна реплика в ветке уведомления. */
    private static final class Msg {
        final String sender;
        final String text;
        final long time;

        Msg(String sender, String text) {
            this.sender = sender;
            this.text = text;
            this.time = System.currentTimeMillis();
        }
    }

    static int notificationId(String chatId) {
        return chatId.hashCode();
    }

    static void forgetChat(String chatId) {
        HISTORY.remove(chatId);
    }

    static void forgetHistory() {
        HISTORY.clear();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        // Отдаём событие в JS: если WebView жив, приложение обновит список чатов.
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String chatId = data.get("chat_id");
        if (chatId == null || !"message".equals(data.get("event"))) return;

        // Имя отправителя и название чата приходят идентификаторами и
        // подставляются из локального справочника: серверу и FCM незачем знать,
        // кто кому пишет. Если имени ещё нет (справочник наполняется при
        // загрузке списка чатов) — показываем нейтральную подпись.
        String sender = orDefault(NameStore.get(this, data.get("sender_id")), "Dragram");
        String chatName = NameStore.get(this, chatId);
        String fallback = orDefault(data.get("body"), "Новое сообщение");

        String text = null;
        String ciphertext = data.get("ct");
        if (ciphertext != null) {
            byte[] key = ChatKeyStore.get(this, chatId);
            if (key != null) text = decrypt(ciphertext, key);
        }
        if (text == null || text.isEmpty()) text = fallback;

        showNotification(chatId, chatName, sender, text);
    }

    /**
     * Расшифровывает blob формата base64(JSON{iv, ct}) — тот же, что делает
     * encryptMessage() в frontend/src/crypto.js.
     *
     * WebCrypto дописывает 16-байтовый GCM-тег в конец шифротекста, и Java
     * ожидает его ровно там же, поэтому доп. разбор не нужен.
     */
    private static String decrypt(String blobBase64, byte[] key) {
        try {
            String json = new String(Base64.decode(blobBase64, Base64.DEFAULT), StandardCharsets.UTF_8);
            JSONObject obj = new JSONObject(json);
            byte[] iv = Base64.decode(obj.getString("iv"), Base64.DEFAULT);
            byte[] ct = Base64.decode(obj.getString("ct"), Base64.DEFAULT);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                Cipher.DECRYPT_MODE,
                new SecretKeySpec(key, "AES"),
                new GCMParameterSpec(GCM_TAG_BITS, iv)
            );
            return new String(cipher.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            // Обычная причина — сменился ключ чата (переустановка, другое
            // устройство), а не атака. Показываем запасную подпись.
            Log.w(TAG, "Failed to decrypt push payload: " + e.getMessage());
            return null;
        }
    }

    private void showNotification(String chatId, String chatName, String sender, String text) {
        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        ensureChannel(manager);

        List<Msg> history = HISTORY.get(chatId);
        if (history == null) {
            history = Collections.synchronizedList(new ArrayList<Msg>());
            HISTORY.put(chatId, history);
        }
        history.add(new Msg(sender, text));
        while (history.size() > HISTORY_LIMIT) history.remove(0);

        // MessagingStyle — тот самый вид ветки переписки, что в мессенджерах:
        // аватар-инициал отправителя и несколько последних реплик подряд.
        NotificationCompat.MessagingStyle style =
            new NotificationCompat.MessagingStyle(new Person.Builder().setName("Вы").build());
        if (chatName != null) {
            style.setConversationTitle(chatName);
            style.setGroupConversation(true);
        }
        synchronized (history) {
            for (Msg msg : history) {
                style.addMessage(msg.text, msg.time, new Person.Builder().setName(msg.sender).build());
            }
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setStyle(style)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openChatIntent(chatId));

        manager.notify(notificationId(chatId), builder.build());
    }

    private PendingIntent openChatIntent(String chatId) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("chat_id", chatId);
        return PendingIntent.getActivity(
            this,
            notificationId(chatId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void ensureChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Сообщения", NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Уведомления о новых сообщениях в чатах");
        manager.createNotificationChannel(channel);
    }

    private static String orDefault(String value, String fallback) {
        return (value == null || value.isEmpty()) ? fallback : value;
    }
}
