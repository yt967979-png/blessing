package `in`.blessingpowerguide.blessing_admin

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "blessing.admin/notifications"
    private val ORDER_CHANNEL_ID = "blessing_orders_native_v4"
    private val SUPPORT_CHANNEL_ID = "blessing_support_native_v4"
    private var requestedInitialPermission = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        ensureChannelsCreated()

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "requestPermission" -> {
                        val enabled = checkAndRequestPermission(openSettingsIfDenied = false)
                        result.success(enabled)
                    }
                    "openNotificationSettings" -> {
                        openAppNotificationSettings()
                        result.success(true)
                    }
                    "showNotification" -> {
                        val title = call.argument<String>("title") ?: "Blessing Admin Alert"
                        val body = call.argument<String>("body") ?: ""
                        val type = call.argument<String>("type") ?: "order"
                        val openSettingsOnFail = call.argument<Boolean>("openSettingsOnFail") ?: false
                        val status = showNativeNotification(title, body, type, openSettingsOnFail)
                        result.success(status)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    override fun onPostResume() {
        super.onPostResume()
        if (!requestedInitialPermission) {
            requestedInitialPermission = true
            ensureChannelsCreated()
            if (Build.VERSION.SDK_INT >= 33) {
                val granted = checkSelfPermission("android.permission.POST_NOTIFICATIONS") ==
                    PackageManager.PERMISSION_GRANTED
                if (!granted) {
                    requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1001)
                }
            }
        }
    }

    private fun ensureChannelsCreated() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val audioAttrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()

            val orderChannel = NotificationChannel(
                ORDER_CHANNEL_ID,
                "Instant Order Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Instant heads-up alerts when a student places an order"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 300, 150, 300)
                setSound(soundUri, audioAttrs)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            val supportChannel = NotificationChannel(
                SUPPORT_CHANNEL_ID,
                "Live Support Chat Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Instant heads-up alerts when a student sends a support message"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 120, 250)
                setSound(soundUri, audioAttrs)
                setShowBadge(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            nm.createNotificationChannel(orderChannel)
            nm.createNotificationChannel(supportChannel)
        }
    }

    private fun checkAndRequestPermission(openSettingsIfDenied: Boolean): Boolean {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 33) {
            val granted = checkSelfPermission("android.permission.POST_NOTIFICATIONS") ==
                PackageManager.PERMISSION_GRANTED
            if (!granted) {
                requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1001)
                if (openSettingsIfDenied) {
                    openAppNotificationSettings()
                }
                return false
            }
        }
        if (!nm.areNotificationsEnabled()) {
            if (openSettingsIfDenied) {
                openAppNotificationSettings()
            }
            return false
        }
        return true
    }

    private fun openAppNotificationSettings() {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = android.net.Uri.parse("package:$packageName")
                }
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        } catch (_: Exception) {}
    }

    private fun triggerVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator.vibrate(
                    VibrationEffect.createWaveform(longArrayOf(0, 220, 100, 220), -1)
                )
            } else {
                @Suppress("DEPRECATION")
                val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 220, 100, 220), -1))
                } else {
                    @Suppress("DEPRECATION")
                    v.vibrate(longArrayOf(0, 220, 100, 220), -1)
                }
            }
        } catch (_: Exception) {}
    }

    private fun showNativeNotification(
        title: String,
        body: String,
        type: String,
        openSettingsOnFail: Boolean
    ): String {
        try {
            ensureChannelsCreated()
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Always play sound and vibrate immediately so the admin is alerted even if OS banner is suppressed
            triggerVibration()
            try {
                val notificationUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val r = RingtoneManager.getRingtone(applicationContext, notificationUri)
                r?.play()
            } catch (_: Exception) {}

            if (!nm.areNotificationsEnabled()) {
                checkAndRequestPermission(openSettingsIfDenied = openSettingsOnFail)
                return "PERMISSION_DISABLED"
            }

            val channelId = if (type == "support") SUPPORT_CHANNEL_ID else ORDER_CHANNEL_ID
            val launchIntent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("notification_type", type)
            }
            val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val requestCode = (System.currentTimeMillis() and 0x7FFFFFFF).toInt()
            val pendingIntent = PendingIntent.getActivity(this, requestCode, launchIntent, pendingFlags)

            // Monochrome alpha vector icon for Android 5.0-15+ status bar compatibility
            val smallIconRes = resources.getIdentifier("ic_stat_bpg", "drawable", packageName).let { id ->
                if (id != 0) id else if (applicationInfo.icon != 0) applicationInfo.icon else android.R.drawable.ic_dialog_info
            }

            val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, channelId)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
                    .setPriority(Notification.PRIORITY_MAX)
                    .setDefaults(Notification.DEFAULT_ALL)
            }

            builder
                .setSmallIcon(smallIconRes)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setShowWhen(true)
                .setWhen(System.currentTimeMillis())
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setColor(0xFFFFB703.toInt())
                builder.setCategory(Notification.CATEGORY_CALL)
                builder.setVisibility(Notification.VISIBILITY_PUBLIC)
            }

            // Attach official Gold-and-Silver BPG emblem as Large Icon (scaled safely to 128x128)
            try {
                if (applicationInfo.icon != 0) {
                    val rawBmp = BitmapFactory.decodeResource(resources, applicationInfo.icon)
                    if (rawBmp != null) {
                        val scaled = Bitmap.createScaledBitmap(rawBmp, 128, 128, true)
                        builder.setLargeIcon(scaled)
                    }
                }
            } catch (_: Exception) {}

            val notifyId = (System.currentTimeMillis() and 0x7FFFFFFF).toInt()
            nm.notify(notifyId, builder.build())

            return "OK"
        } catch (e: Exception) {
            return "ERROR: ${e.message}"
        }
    }
}
