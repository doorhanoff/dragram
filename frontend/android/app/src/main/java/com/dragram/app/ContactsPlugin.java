package com.dragram.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Чтение телефонной книги — чтобы найти в мессенджере уже знакомых людей.
 *
 * Наружу отдаются только номера, без имён: имя контакта приложению не нужно
 * (оно возьмёт имя из профиля найденного пользователя), а лишние данные,
 * которых можно не читать, лучше не читать.
 *
 * Номера не покидают телефон в открытом виде: JS хеширует их перед отправкой
 * (см. src/contacts/service.py — там объяснено, почему).
 */
@CapacitorPlugin(
    name = "Contacts",
    permissions = {
        @Permission(alias = ContactsPlugin.CONTACTS, strings = { Manifest.permission.READ_CONTACTS })
    }
)
public class ContactsPlugin extends Plugin {

    static final String CONTACTS = "contacts";

    /** Разрешение уже выдано? Спрашиваем без показа системного окна. */
    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", granted());
        call.resolve(res);
    }

    /**
     * Читает номера. Если разрешения нет — сначала спрашивает его системным
     * окном, и продолжает уже в ответе пользователя.
     */
    @PluginMethod
    public void getPhoneNumbers(PluginCall call) {
        if (granted()) {
            respondWithNumbers(call);
        } else {
            requestPermissionForAlias(CONTACTS, call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (granted()) {
            respondWithNumbers(call);
        } else {
            // Отказ — это не ошибка приложения: возвращаем пустой список и
            // отдельный признак, чтобы интерфейс не показывал ничего страшного.
            JSObject res = new JSObject();
            res.put("granted", false);
            res.put("numbers", new JSArray());
            call.resolve(res);
        }
    }

    private boolean granted() {
        return getPermissionState(CONTACTS) == com.getcapacitor.PermissionState.GRANTED
            || getContext().checkSelfPermission(Manifest.permission.READ_CONTACTS)
               == PackageManager.PERMISSION_GRANTED;
    }

    private void respondWithNumbers(PluginCall call) {
        // LinkedHashSet: у одного человека часто несколько записей с тем же
        // номером — дубликаты незачем гонять по сети.
        Set<String> numbers = new LinkedHashSet<>();
        String[] projection = { ContactsContract.CommonDataKinds.Phone.NUMBER };

        try (Cursor cursor = getContext().getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection, null, null, null)) {
            if (cursor != null) {
                int idx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                while (cursor.moveToNext() && numbers.size() < 2000) {
                    if (idx < 0) break;
                    String number = cursor.getString(idx);
                    if (number != null && !number.trim().isEmpty()) numbers.add(number);
                }
            }
        } catch (Exception e) {
            call.reject("Не удалось прочитать контакты: " + e.getMessage(), e);
            return;
        }

        JSArray arr = new JSArray();
        for (String n : numbers) arr.put(n);

        JSObject res = new JSObject();
        res.put("granted", true);
        res.put("numbers", arr);
        call.resolve(res);
    }
}
