package com.splittracker

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class TransactionNotificationModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TransactionNotificationModule"

    @ReactMethod
    fun isNotificationListenerEnabled(promise: Promise) {
        try {
            val flat = Settings.Secure.getString(
                reactContext.contentResolver,
                "enabled_notification_listeners"
            )
            val componentName = ComponentName(
                reactContext,
                TransactionNotificationService::class.java
            ).flattenToString()

            val enabled = flat != null && flat.contains(componentName)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("ERR_CHECK_LISTENER", e.message, e)
        }
    }

    @ReactMethod
    fun openNotificationListenerSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(intent)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
