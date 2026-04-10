package com.splittracker

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.Telephony
import androidx.work.*
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.TimeUnit

class TransactionCheckWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        const val WORK_NAME = "transaction_check"
        private const val LAST_CHECK_KEY = "last_sms_check_time"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.NOT_REQUIRED)
                .build()

            val request = PeriodicWorkRequestBuilder<TransactionCheckWorker>(
                15, TimeUnit.MINUTES,
                5, TimeUnit.MINUTES  // flex interval
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(
                    WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    request
                )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }

    override suspend fun doWork(): Result {
        return try {
            val prefs = applicationContext.getSharedPreferences("txn_worker", Context.MODE_PRIVATE)
            val lastCheck = prefs.getLong(LAST_CHECK_KEY, System.currentTimeMillis() - 15 * 60 * 1000)

            // Read SMS received since last check
            val smsList = readRecentSms(lastCheck)

            if (smsList.isNotEmpty()) {
                // Emit event to React Native if context is available
                val reactContext = (applicationContext as? MainApplication)?.reactHost?.currentReactContext

                if (reactContext != null && reactContext.hasActiveReactInstance()) {
                    for (sms in smsList) {
                        val params = Arguments.createMap().apply {
                            putString("body", sms.body)
                            putString("sender", sms.sender)
                            putDouble("timestamp", sms.timestamp.toDouble())
                        }
                        reactContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("onBackgroundSmsDetected", params)
                    }
                    // Update last check time only when events were delivered
                    prefs.edit().putLong(LAST_CHECK_KEY, System.currentTimeMillis()).apply()
                }
            }

            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }

    private fun readRecentSms(sinceTimestamp: Long): List<SmsMessage> {
        val messages = mutableListOf<SmsMessage>()

        try {
            val uri = Telephony.Sms.Inbox.CONTENT_URI
            val projection = arrayOf(
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE
            )
            val selection = "${Telephony.Sms.DATE} > ?"
            val selectionArgs = arrayOf(sinceTimestamp.toString())
            val sortOrder = "${Telephony.Sms.DATE} DESC"

            val cursor: Cursor? = applicationContext.contentResolver.query(
                uri, projection, selection, selectionArgs, sortOrder
            )

            cursor?.use {
                val addressIdx = it.getColumnIndex(Telephony.Sms.ADDRESS)
                val bodyIdx = it.getColumnIndex(Telephony.Sms.BODY)
                val dateIdx = it.getColumnIndex(Telephony.Sms.DATE)

                if (addressIdx < 0 || bodyIdx < 0 || dateIdx < 0) return@use

                while (it.moveToNext()) {
                    val body = it.getString(bodyIdx) ?: continue
                    val sender = it.getString(addressIdx) ?: ""
                    val date = it.getLong(dateIdx)

                    // Skip sync protocol messages
                    if (body.startsWith("ST1")) continue

                    // Basic financial SMS filter - must contain amount patterns
                    val hasAmount = body.contains("Rs", ignoreCase = true) ||
                        body.contains("INR", ignoreCase = true) ||
                        body.contains("\u20B9") ||
                        body.contains("debited", ignoreCase = true) ||
                        body.contains("credited", ignoreCase = true)

                    if (hasAmount) {
                        messages.add(SmsMessage(sender, body, date))
                    }
                }
            }
        } catch (e: SecurityException) {
            // SMS permission not granted
        }

        return messages
    }

    data class SmsMessage(val sender: String, val body: String, val timestamp: Long)
}
