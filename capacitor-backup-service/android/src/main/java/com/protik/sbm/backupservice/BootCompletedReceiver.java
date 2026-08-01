package com.protik.sbm.backupservice;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

// ডিভাইস রিবুট হলে AlarmManager-এর সব pending alarm হারিয়ে যায় (Android-এর
// ডিজাইন অনুযায়ী)। আগে scheduleExactBackupAlarm() চালু করা থাকলে (SharedPreferences
// flag, BackupServicePlugin.KEY_ACTIVE) রিবুটের পর এখানেই আবার শিডিউল করে দেওয়া
// হয় — ইউজারকে অ্যাপ ম্যানুয়ালি একবার খুলে "রিফ্রেশ" করতে হয় না।
public class BootCompletedReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences(
            BackupServicePlugin.PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(BackupServicePlugin.KEY_ACTIVE, false)) {
            BackupAlarmReceiver.scheduleNext(context, 60 * 1000L); // রিবুটের ১ মিনিট পর প্রথমবার
        }
    }
}
