package com.dragram.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Сохранение файла из чата или альбома в память телефона.
 *
 * Почему нативно, а не ссылкой с атрибутом download: внутри WebView такая
 * ссылка ничего не сохраняет — файл «скачивается» в никуда. Штатный
 * DownloadManager тоже не подходит: медиа закрыто дверью и тикетом, а он
 * ходит по ссылке сам, без наших заголовков.
 *
 * Поэтому качаем здесь: заголовки берём из JS и передаём как есть, а файл
 * пишем потоком — так и видео на сотню мегабайт не окажется целиком в памяти.
 * Кладём через MediaStore, чтобы файл появился в «Загрузках» и в галерее,
 * а не в служебной папке приложения.
 */
@CapacitorPlugin(name = "Downloader")
public class DownloadPlugin extends Plugin {

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename");
        JSObject headers = call.getObject("headers", new JSObject());

        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        final String safeName = sanitize(filename, url);

        // Сеть и запись на диск — в фоне: держать на них главный поток нельзя.
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(60000);
                conn.setInstanceFollowRedirects(true);
                if (headers != null) {
                    java.util.Iterator<String> it = headers.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        conn.setRequestProperty(k, headers.getString(k));
                    }
                }
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    call.reject("Сервер ответил " + code);
                    return;
                }

                String mime = conn.getContentType();
                if (mime != null && mime.contains(";")) mime = mime.split(";")[0].trim();

                Uri saved;
                try (InputStream in = conn.getInputStream()) {
                    saved = writeToDownloads(safeName, mime, in);
                }

                JSObject res = new JSObject();
                res.put("uri", saved != null ? saved.toString() : "");
                res.put("name", safeName);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Не удалось сохранить файл: " + e.getMessage(), e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    /**
     * Android 10 и новее не дают писать в общие папки напрямую — только через
     * MediaStore. На старых версиях остаётся обычный путь к «Загрузкам».
     */
    private Uri writeToDownloads(String name, String mime, InputStream in) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            if (mime != null) values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.IS_PENDING, 1);

            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("MediaStore отказал в записи");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                copy(in, out);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }

        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Нет папки «Загрузки»");
        File target = uniqueFile(dir, name);
        try (OutputStream out = new FileOutputStream(target)) {
            copy(in, out);
        }
        return Uri.fromFile(target);
    }

    private void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[8192];
        int read;
        while ((read = in.read(buf)) != -1) out.write(buf, 0, read);
        out.flush();
    }

    /** «фото (2).jpg» вместо перезаписи уже сохранённого файла. */
    private File uniqueFile(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        String base = name, ext = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) { base = name.substring(0, dot); ext = name.substring(dot); }
        for (int i = 2; i < 1000; i++) {
            File candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) return candidate;
        }
        return f;
    }

    /**
     * Имя приходит из ссылки, то есть снаружи. Всё, кроме имени файла,
     * отрезаем: иначе «../» в нём увело бы запись из папки загрузок.
     */
    private String sanitize(String filename, String url) {
        String name = filename;
        if (name == null || name.trim().isEmpty()) {
            String path = Uri.parse(url).getLastPathSegment();
            name = path != null ? path : "dragram-file";
        }
        name = new File(name).getName().replaceAll("[\\\\/:*?\"<>|]", "_");
        if (name.isEmpty()) name = "dragram-file";
        if (!name.contains(".")) {
            String ext = MimeTypeMap.getFileExtensionFromUrl(url);
            if (ext != null && !ext.isEmpty()) name = name + "." + ext;
        }
        return name;
    }
}
