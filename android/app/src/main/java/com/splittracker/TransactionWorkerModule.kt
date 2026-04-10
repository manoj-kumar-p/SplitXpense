package com.splittracker

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import androidx.work.WorkManager
import androidx.work.WorkInfo

class TransactionWorkerModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "TransactionWorkerModule"

    @ReactMethod
    fun startBackgroundCheck() {
        TransactionCheckWorker.schedule(reactApplicationContext)
    }

    @ReactMethod
    fun stopBackgroundCheck() {
        TransactionCheckWorker.cancel(reactApplicationContext)
    }

    @ReactMethod
    fun isBackgroundCheckRunning(promise: Promise) {
        Thread {
            try {
                val workManager = WorkManager.getInstance(reactApplicationContext)
                val workInfos = workManager.getWorkInfosForUniqueWork(TransactionCheckWorker.WORK_NAME).get()
                val isRunning = workInfos.any { info ->
                    info.state == WorkInfo.State.ENQUEUED ||
                    info.state == WorkInfo.State.RUNNING
                }
                promise.resolve(isRunning)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }.start()
    }
}
