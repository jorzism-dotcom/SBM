package com.protik.sbm.backupservice;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

// 🆕 (২ আগস্ট ২০২৬) তৃতীয় ব্যাকআপ-রিলায়েবিলিটি লেয়ার — WorkManager সেফটি-নেট।
//
// কেন দরকার: এখনকার ২০-মিনিট cadence BackupAlarmReceiver (AlarmManager.
// setExactAndAllowWhileIdle) দিয়ে চলে, যেটা SCHEDULE_EXACT_ALARM permission-এর
// ওপর নির্ভরশীল। এই permission ইউজার নিজে বন্ধ করে দিতে পারেন, অথবা Android
// নিজে থেকেই "unused app" মনে করে কিছু runtime permission auto-revoke করতে
// পারে (Android 13+, app কয়েকদিন না খুললে)। তখন AlarmManager পুরোপুরি
// inexact fallback-এ নেমে যায় (কখন ফায়ার করবে অনিশ্চিত)। WorkManager-এর
// জন্য কোনো special permission লাগে না এবং reboot-এর পরও নিজে থেকেই
// re-enqueue হয় (BootCompletedReceiver-এর ওপর নির্ভর করে না) — তাই
// AlarmManager path সম্পূর্ণ ব্যর্থ হলেও এটা independent দ্বিতীয় ট্রিগার
// হিসেবে কাজ চালিয়ে যায়।
//
// 🔴 সীমাবদ্ধতা (সততার সাথে): PeriodicWorkRequest-এর সর্বনিম্ন ইন্টারভাল ১৫
// মিনিট, এবং Doze mode-এ OS নিজের সুবিধামতো ব্যাচ/দেরি করতে পারে (AlarmManager-
// এর setExactAndAllowWhileIdle-এর মতো নিশ্চিত exact টাইমিং নেই) — তাই এটা
// "বদলি" নয়, শুধু সেফটি-নেট। আর এটাও evaluateJavascript()-নির্ভর — app
// প্রসেস/WebView সম্পূর্ণ kill হয়ে গেলে এটাও backup চালাতে পারবে না (headless
// WebView তৈরি করা এই ডিজাইনের বাইরে, single-source-of-truth JS backup logic
// রাখার সিদ্ধান্তের সাথে সামঞ্জস্যপূর্ণ)। সেক্ষেত্রে চুপচাপ ব্যর্থ না হয়ে
// "মিসড" কাউন্টার বাড়ানো হয়, যাতে পরের বার app খোলা হলে ইউজারকে জানানো যায়।
public class BackupWorker extends Worker {

    static final String MISSED_KEY = "workmanager_missed_count";

    public BackupWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        SharedPreferences prefs = getApplicationContext()
            .getSharedPreferences(BackupServicePlugin.PREFS, Context.MODE_PRIVATE);
        boolean active = prefs.getBoolean(BackupServicePlugin.KEY_ACTIVE, false);
        if (!active) return Result.success(); // ইউজার/অ্যাপ ব্যাকআপ বন্ধ রেখেছে — কিছু করার দরকার নেই

        WebView webView = BackupServicePlugin.sWebViewRef != null
            ? BackupServicePlugin.sWebViewRef.get() : null;

        if (webView == null) {
            // প্রসেস/WebView বেঁচে নেই — AlarmManager receiver-এর মতোই silently
            // return না করে, সততার সাথে মিসড কাউন্ট বাড়িয়ে রাখা হয়
            int missed = prefs.getInt(MISSED_KEY, 0) + 1;
            prefs.edit().putInt(MISSED_KEY, missed).apply();
            return Result.success(); // retry-এর দরকার নেই, পরের ১৫-মিনিট periodic run-ই যথেষ্ট
        }

        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                // 🆕 (২ আগস্ট ২০২৬) শপ tick-এর পাশাপাশি Viewer Mode-এর
                // refresh() hook-ও কল করা হয় (দেখুন BackupAlarmReceiver-এর
                // একই কমেন্ট — দুই native trigger path-ই একই স্ক্রিপ্ট ব্যবহার করে)
                webView.evaluateJavascript(
                    "(function(){" +
                    "try{if(window.__sbmNativeBackupTick)window.__sbmNativeBackupTick();}catch(e){}" +
                    "try{if(window.__sbmViewerRefreshTick)window.__sbmViewerRefreshTick();}catch(e){}" +
                    "})();",
                    null
                );
            } catch (Exception ignored) {}
        });

        // WebView জীবিত পাওয়া গেছে মানে সফল ট্রিগার — মিসড কাউন্টার রিসেট
        prefs.edit().putInt(MISSED_KEY, 0).apply();
        return Result.success();
    }
}
