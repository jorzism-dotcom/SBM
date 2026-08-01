package com.protik.sbm.backupservice;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 🔴 এই প্লাগইনটা backup আপলোড নিজেই করে না — শুধু দুইটা জিনিসে সাহায্য করে
// যাতে App.jsx-এর বিদ্যমান JS setInterval-ভিত্তিক ব্যাকআপ টাইমার MIUI/Android
// কর্তৃক প্রসেস-কিলের কারণে থেমে না যায় (দেখুন BackupForegroundService.java-এর
// কমেন্ট এবং App.jsx-এ এই প্লাগইনের ব্যবহার)।
@CapacitorPlugin(name = "BackupService")
public class BackupServicePlugin extends Plugin {

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
}
