package com.protik.sbm.backupservice;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

// 🆕 (২ আগস্ট ২০২৬) রুট-কজ ফিক্স — স্ক্রিনশট বিশ্লেষণে দেখা গিয়েছিল: app খোলা
// অবস্থায়ও JS setInterval(60s) + visibilitychange catch-up যথেষ্ট নিখুঁত ছিল না,
// কারণ Android WebView স্ক্রিন লক/background হলে নিজে থেকেই page-এর ভেতরের
// JS timer suspend/throttle করে দেয় (Chrome "background tab freezing") — app
// ফিরে এলে তখনই এক লাফে catch-up হতো (২০ মিনিটের বদলে ৪০-৪৫ মিনিট গ্যাপ)।
//
// এই receiver প্রতি ২০ মিনিটে (app খোলা/বন্ধ/background যেকোনো অবস্থায়, শুধু
// প্রসেস পুরোপুরি kill না হলে) AlarmManager.setExactAndAllowWhileIdle দিয়ে
// ঠিক-সময়ে ফায়ার হয় (Doze mode-কেও বাইপাস করে)। এটা backup upload নিজে করে
// না — শুধু বিদ্যমান JS tick() ফাংশনটা জোর করে evaluateJavascript() দিয়ে কল
// করে, যেটা WebView-এর নিজস্ব page-timer throttling এড়িয়ে যায় (host app কর্তৃক
// native side থেকে ইনজেক্ট করা script এই throttling-এর আওতায় পড়ে না)।
//
// সীমাবদ্ধতা (সততার সাথে উল্লেখ): ইউজার Recent Apps থেকে অ্যাপ সম্পূর্ণ
// swipe-kill করলে পুরো প্রসেস (এবং WebView instance) হারিয়ে যায় — তখন
// sWebViewRef null থাকে, এই receiver নিজেকে পরের বারের জন্য রি-শিডিউল করে
// চুপচাপ রিটার্ন করে (কোনো ব্যাকআপ চলে না, ঠিক আগের অবস্থার মতোই)। এটা
// BackupForegroundService-এর "সহজে kill কোরো না" অনুরোধের সাথে মিলিয়ে
// ব্যবহারের কথা — Recent Apps-এ 🔒 lock করা থাকলে বেশিরভাগ ডিভাইসে প্রসেস
// বেঁচে থাকে এবং এই alarm নিয়মিত ফায়ার করতে পারে।
public class BackupAlarmReceiver extends BroadcastReceiver {

    private static final int REQ_CODE = 7724;
    private static final String ACTION = "com.protik.sbm.backupservice.ACTION_TICK";

    @Override
    public void onReceive(Context context, Intent intent) {
        SharedPreferences prefs = context.getSharedPreferences(
            BackupServicePlugin.PREFS, Context.MODE_PRIVATE);
        boolean active = prefs.getBoolean(BackupServicePlugin.KEY_ACTIVE, false);
        if (active) {
            // সবার আগে নিজেকে রি-শিডিউল করা হয় — নিচের evaluateJavascript() ব্যর্থ
            // হলেও (WebView null) পরের ২০ মিনিটের চেইন যেন না ভাঙে।
            scheduleNext(context, BackupServicePlugin.INTERVAL_MS);
        }

        final WebView webView = BackupServicePlugin.sWebViewRef != null
            ? BackupServicePlugin.sWebViewRef.get() : null;
        if (webView == null) return; // প্রসেস kill হয়ে গেছে — পরের alarm-এর অপেক্ষা

        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                // 🆕 (২ আগস্ট ২০২৬) শপ tick-এর পাশাপাশি Viewer Mode-এর
                // refresh() hook-ও কল করা হয় (দুটোর একটাই সাধারণত define
                // থাকবে, ডিভাইসের মোড অনুযায়ী — window.X চেক না পেলে চুপচাপ
                // স্কিপ হয়, কোনো এরর হয় না)
                webView.evaluateJavascript(
                    "(function(){" +
                    "try{if(window.__sbmNativeBackupTick)window.__sbmNativeBackupTick();}catch(e){}" +
                    "try{if(window.__sbmViewerRefreshTick)window.__sbmViewerRefreshTick();}catch(e){}" +
                    "})();",
                    null
                );
            } catch (Exception ignored) {}
        });
    }

    static void scheduleNext(Context context, long delayMs) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = buildPendingIntent(context);
        long triggerAt = System.currentTimeMillis() + delayMs;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
        } catch (SecurityException e) {
            // SCHEDULE_EXACT_ALARM পারমিশন নেই (Android 12+, ইউজার বন্ধ করে দিয়েছেন
            // বা এখনো অনুমতি দেননি) — inexact fallback (Android নিজের বিবেচনায় কিছুটা
            // দেরি করে ফায়ার করতে পারে, কিন্তু app বন্ধ থাকলেও একেবারে থেমে যায় না)।
            am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
    }

    static void cancel(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(buildPendingIntent(context));
    }

    private static PendingIntent buildPendingIntent(Context context) {
        Intent intent = new Intent(context, BackupAlarmReceiver.class);
        intent.setAction(ACTION);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, REQ_CODE, intent, flags);
    }
}
