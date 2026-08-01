package com.protik.sbm.backupservice;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

// 🔴 রুট-কজ ফিক্স (দেখুন App.jsx-এর সংশ্লিষ্ট useEffect কমেন্ট): SBM-এর
// অটো-ব্যাকআপ App.jsx-এর ভেতরে একটা প্লেইন JavaScript setInterval দিয়ে চলে,
// কোনো native background task না। MIUI-এর "Pause app activity if unused"
// (বা Android-এর App Standby/Doze) কয়েকদিন অ্যাপ ব্যবহার না হলে পুরো
// প্রসেসটাই force-stop করে দেয় — তখন এই JS টাইমারও থেমে যায়।
//
// এই Service-এর একমাত্র কাজ: একটা লো-প্রায়োরিটি (IMPORTANCE_MIN), নিঃশব্দ,
// স্থায়ী নোটিফিকেশন সহ Foreground Service হিসেবে চালু থেকে OS-কে বলা "এই
// অ্যাপের প্রসেসটা এখনো active কাজ করছে, সহজে kill কোরো না" — এটা backup
// লজিক নিজে চালায় না, শুধু process-টা বাঁচিয়ে রাখে যাতে বিদ্যমান JS
// setInterval স্বাভাবিকভাবেই চলতে থাকতে পারে।
//
// সীমাবদ্ধতা (সততার সাথে উল্লেখ): ইউজার যদি Recent Apps থেকে অ্যাপ সম্পূর্ণ
// swipe করে সরিয়ে দেন, stock Android-এ এই foreground service (২ আগস্ট ২০২৬
// থেকে explicit android:stopWithTask="false"-সহ) স্বাভাবিকভাবেই বেঁচে থাকার
// কথা। কিন্তু অনেক চাইনিজ OEM স্কিন (MIUI/ColorOS/FuntouchOS/HiOS ইত্যাদি —
// বাংলাদেশে কমন) এই স্ট্যান্ডার্ড আচরণ উপেক্ষা করে নিজস্ব agressive
// process-killer চালায়, সেক্ষেত্রে ইউজারকে ফোনের OEM-নির্দিষ্ট Autostart/
// battery no-restriction সেটিং নিজে চালু করতে হবে (Recent Apps কার্ডে 🔒
// থাকলে সেটাও একটা অপশন, MIUI-তে)। onTaskRemoved() override (নিচে) task
// swipe হওয়ার মুহূর্তে AlarmManager/WorkManager আবার re-arm করার একটা
// defensive চেষ্টা করে, কিন্তু প্রসেস সম্পূর্ণ মরে যাওয়ার পর headless ভাবে
// backup upload করার কোনো উপায় এখনো এই ডিজাইনে নেই।
public class BackupForegroundService extends Service {

    private static final String CHANNEL_ID = "sbm_backup_keepalive";
    private static final int NOTIF_ID = 4821;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "SBM ব্যাকআপ",
                NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("অ্যাপ ব্যাকগ্রাউন্ডে থাকা অবস্থায় অটো-ব্যাকআপ চালু রাখতে সাহায্য করে");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int iconRes = getResources().getIdentifier("ic_stat_pulse", "drawable", getPackageName());
        if (iconRes == 0) iconRes = android.R.drawable.stat_sys_upload;

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        Notification notification = builder
            .setContentTitle("SBM ব্যাকআপ সক্রিয়")
            .setContentText("অটো-ব্যাকআপ ব্যাকগ্রাউন্ডে চালু আছে")
            .setSmallIcon(iconRes)
            .setPriority(Notification.PRIORITY_MIN)
            .setOngoing(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notification);
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // 🆕 (২ আগস্ট ২০২৬) defensive re-arm — task swipe হওয়ার মুহূর্তে OS এই
    // callback দেয় (process পুরোপুরি মরে যাওয়ার ঠিক আগে, এখনো কয়েক মুহূর্তের
    // জন্য কোড চালানো যায়)। এখানে backup upload নিজে চালানো সম্ভব না (WebView
    // ইতিমধ্যে/শীঘ্রই অকেজো হয়ে যাচ্ছে) — কিন্তু AlarmManager ও WorkManager
    // দুটোকেই আবার schedule করার চেষ্টা করা হয়, যাতে OEM-এর aggressive
    // process-killer AlarmManager/WorkManager-এর নিজস্ব entry-ও মুছে দিলে
    // (কিছু OEM-এ এটা হয়) সেটা অন্তত এই মুহূর্তে রিকভার হয়। stock Android-এ
    // এই দুটো সিস্টেম process kill-এর পরও নিজে থেকেই বেঁচে থাকে, তাই এই কলটা
    // বেশিরভাগ ফোনে no-op/redundant — কিন্তু aggressive OEM-এর ক্ষেত্রে এটা
    // একটা সস্তা, ঝুঁকিহীন অতিরিক্ত সুরক্ষা।
    // সততার সাথে উল্লেখ: এটা headless backup চালানোর সমাধান না — process
    // সম্পূর্ণ মরে যাওয়ার আগে backup upload করা এখনো সম্ভব না। এটা শুধু
    // পরবর্তী alarm/worker চেইন যেন ভেঙে না যায় সেটা নিশ্চিত করে।
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        try { BackupAlarmReceiver.scheduleNext(getApplicationContext(), 60 * 1000L); } catch (Exception ignored) {}
        try {
            androidx.work.PeriodicWorkRequest request = new androidx.work.PeriodicWorkRequest.Builder(
                BackupWorker.class, 15, java.util.concurrent.TimeUnit.MINUTES
            ).build();
            androidx.work.WorkManager.getInstance(getApplicationContext()).enqueueUniquePeriodicWork(
                BackupServicePlugin.WORK_NAME, androidx.work.ExistingPeriodicWorkPolicy.KEEP, request
            );
        } catch (Exception ignored) {}
    }
}
