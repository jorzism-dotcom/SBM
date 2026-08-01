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
// swipe করে সরিয়ে দেন (task সম্পূর্ণ kill), তখন এই Service-সহ পুরো প্রসেসই
// শেষ হয়ে যায় — এটা ঠিক করতে ইউজারকে Recent Apps কার্ডে 🔒 lock করে রাখতে
// বলা হয়েছে (আগের সেশনে)। এটা প্রধানত "অ্যাপ ব্যাকগ্রাউন্ডে আছে কিন্তু
// task থেকে সরানো হয়নি" অবস্থায় MIUI-এর প্রি-এম্পটিভ hibernation ঠেকায়।
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
}
