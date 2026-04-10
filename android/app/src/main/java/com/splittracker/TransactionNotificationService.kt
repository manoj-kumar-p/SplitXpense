package com.splittracker

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.app.Notification
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class TransactionNotificationService : NotificationListenerService() {

    companion object {
        private val MONITORED_PACKAGES = setOf(
            "com.google.android.apps.nbu.paisa.user", // GPay
            "com.phonepe.app",                         // PhonePe
            "net.one97.paytm",                         // Paytm
            "com.sbi.SBIFreedomPlus",                  // SBI
            "com.csam.icici.bank.imobile",             // ICICI
            "com.snapwork.hdfc",                       // HDFC
            "com.axis.mobile",                         // Axis
            "com.kotak.mobile.banking",                // Kotak
            "com.bob.mobile.banking",                  // BOB
            "com.google.android.gm",                   // Gmail
            "com.microsoft.office.outlook",            // Outlook
        )
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return

        val packageName = sbn.packageName ?: return
        if (packageName !in MONITORED_PACKAGES) return

        val extras = sbn.notification?.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
        val smallText = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val text = if (!bigText.isNullOrEmpty()) "$title\n$bigText" else "$title\n$smallText"
        val timestamp = sbn.postTime

        val reactContext = (application as? MainApplication)?.reactHost
            ?.currentReactContext

        if (reactContext != null && reactContext.hasActiveReactInstance()) {
            val params = Arguments.createMap().apply {
                putString("packageName", packageName)
                putString("title", title)
                putString("text", text)
                putDouble("timestamp", timestamp.toDouble())
            }

            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onTransactionNotification", params)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // No-op
    }
}
