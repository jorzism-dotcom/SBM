package com.protik.sbm.backupservice;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.lang.ref.WeakReference;
import java.util.concurrent.TimeUnit;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

// 🔴 এই প্লাগইনটা backup আপলোড নিজেই করে না — কয়েকটা জিনিসে সাহায্য করে যাতে
// App.jsx-এর বিদ্যমান JS setInterval-ভিত্তিক ব্যাকআপ টাইমার MIUI/Android
// কর্তৃক প্রসেস-কিলের কারণে থেমে না যায়, এবং (২ আগস্ট ২০২৬ সংযোজন — দেখুন
// BackupAlarmReceiver.java) app background/screen-lock অবস্থাতেও WebView-এর
// নিজস্ব JS-timer throttling এড়িয়ে ঠিক ২০ মিনিট cadence বজায় রাখে।
@CapacitorPlugin(name = "BackupService")
public class BackupServicePlugin extends Plugin {

    // BackupAlarmReceiver ও App.jsx দুই জায়গা থেকেই ব্যবহৃত হওয়ায় এখানে shared constant
    static final String PREFS = "sbm_backup_alarm";
    static final String KEY_ACTIVE = "active";
    static final long INTERVAL_MS = 20 * 60 * 1000L; // ২০ মিনিট

    // 🔴 BackupAlarmReceiver থেকে সরাসরি evaluateJavascript() কল করার জন্য Capacitor
    // Bridge-এর WebView রেফারেন্স static ভাবে ধরে রাখা হয় (WeakReference — মেমরি-লিক
    // এড়াতে, এবং Activity destroy হলে স্বাভাবিকভাবেই null হয়ে যায়)। এই ইনস্ট্যান্স
    // জীবিত মানে app প্রসেস kill হয়নি (background/screen-lock-এ থাকলেও শুধু OS
    // WebView-এর JS timer suspend/throttle করে রেখেছে) — native side থেকে
    // evaluateJavascript() ডাকা হলে সেই throttling এড়িয়ে জোর করে স্ক্রিপ্ট রান হয়
    // (দেখুন https://developer.chrome.com/blog/background_tabs — page-initiated
    // timer-ই শুধু throttle হয়, host app কর্তৃক ইনজেক্টেড script না)।
    static WeakReference<WebView> sWebViewRef;

    @Override
    public void load() {
        super.load();
        try {
            sWebViewRef = new WeakReference<>((WebView) getBridge().getWebView());
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        Context ctx = getContext();
        boolean ignoring = true; // Android M-এর নিচে battery optimization concept-ই নেই
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            ignoring = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoring);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Context ctx = getContext();
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + ctx.getPackageName()));
                    getActivity().startActivity(intent);
                }
            }
            JSObject ret = new JSObject();
            ret.put("requested", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("battery exemption request failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startForegroundKeepAlive(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent svc = new Intent(ctx, BackupForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(svc);
            } else {
                ctx.startService(svc);
            }
            JSObject ret = new JSObject();
            ret.put("started", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("could not start foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopForegroundKeepAlive(PluginCall call) {
        try {
            Context ctx = getContext();
            ctx.stopService(new Intent(ctx, BackupForegroundService.class));
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("could not stop foreground service: " + e.getMessage());
        }
    }

    // ── 🆕 নেটিভ ২০-মিনিট ব্যাকআপ অ্যালার্ম — মূল/প্রাইমারি cadence, AlarmManager
    // দিয়ে (setExactAndAllowWhileIdle Doze-কেও বাইপাস করে ঠিক ২০ মিনিটে ফায়ার
    // করে)। ২ আগস্ট ২০২৬ থেকে এর পাশে WorkManager-ভিত্তিক আরেকটা independent
    // সেফটি-নেট লেয়ার যোগ হয়েছে (নিচে schedulePeriodicSafetyNetWorker দেখুন) —
    // exact-alarm permission ছাড়াই কাজ করে, তাই AlarmManager path ব্যর্থ হলেও
    // ১৫ মিনিট cadence-এ (Doze-batched, তাই সময় অনিশ্চিত) ব্যাকআপ ট্রিগার হতে
    // পারে। দুটো layer-ই evaluateJavascript()-নির্ভর একই JS tick() কল করে। ──
    @PluginMethod
    public void scheduleExactBackupAlarm(PluginCall call) {
        try {
            Context ctx = getContext();
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ACTIVE, true).apply();
            BackupAlarmReceiver.scheduleNext(ctx, INTERVAL_MS);
            JSObject ret = new JSObject();
            ret.put("scheduled", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("could not schedule alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelExactBackupAlarm(PluginCall call) {
        try {
            Context ctx = getContext();
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ACTIVE, false).apply();
            BackupAlarmReceiver.cancel(ctx);
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("could not cancel alarm: " + e.getMessage());
        }
    }

    // Android 12+ (S)-এ exact alarm একটা special permission — ইউজারের Settings-এ
    // গিয়ে অনুমতি দিতে হয় (অন্য runtime permission-এর মতো ডায়ালগ আসে না)।
    @PluginMethod
    public void canScheduleExactAlarms(PluginCall call) {
        boolean can = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            can = am != null && am.canScheduleExactAlarms();
        }
        JSObject ret = new JSObject();
        ret.put("can", can);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestScheduleExactAlarmPermission(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("requested", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("could not request exact alarm permission: " + e.getMessage());
        }
    }

    // ── 🆕 (২ আগস্ট ২০২৬) তৃতীয় লেয়ার — WorkManager সেফটি-নেট (দেখুন
    // BackupWorker.java-র কমেন্টে বিস্তারিত রুট-কজ)। AlarmManager exact-alarm
    // permission-নির্ভর; WorkManager independent, permission ছাড়াই কাজ করে
    // এবং reboot-এর পরও নিজে থেকে টিকে থাকে। enqueueUniquePeriodicWork +
    // KEEP policy দিয়ে বারবার কল করলেও ডুপ্লিকেট schedule হয় না (idempotent),
    // তাই App.jsx-এর boot effect-এ নিশ্চিন্তে বারবার কল করা যায়।
    static final String WORK_NAME = "sbm_backup_safety_net";

    @PluginMethod
    public void schedulePeriodicSafetyNetWorker(PluginCall call) {
        try {
            Context ctx = getContext();
            PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                BackupWorker.class, 15, TimeUnit.MINUTES
            ).build();
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request
            );
            JSObject ret = new JSObject();
            ret.put("scheduled", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("could not schedule safety-net worker: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelPeriodicSafetyNetWorker(PluginCall call) {
        try {
            WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME);
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("could not cancel safety-net worker: " + e.getMessage());
        }
    }

    // App.jsx boot-এ এটা চেক করে দরকার হলে ইউজারকে সতর্ক করতে পারে —
    // "মিসড" মানে WorkManager চললেও ঐ মুহূর্তে process/WebView জীবিত ছিল না।
    @PluginMethod
    public void getMissedSafetyNetCount(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject ret = new JSObject();
        ret.put("missed", prefs.getInt(BackupWorker.MISSED_KEY, 0));
        call.resolve(ret);
    }
}
