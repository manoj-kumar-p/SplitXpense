package com.splittracker

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Peripheral (GATT Server) module for SplitXpense.
 *
 * Lets the device act as a BLE peripheral so other SplitXpense devices acting
 * as centrals (via react-native-ble-plx) can discover and connect to it.
 *
 * This module is a transport only — protocol logic (handshake, pull, push)
 * stays in TypeScript. Kotlin just:
 *   1. Advertises the service UUID with a friendly device name.
 *   2. Receives raw chunks from connected centrals via the WRITE characteristic
 *      and emits them to JS as "BLEPeripheral_ChunkReceived" events.
 *   3. Accepts outgoing chunks from JS (sendChunk) and forwards them via the
 *      NOTIFY characteristic to the appropriate connected central.
 */
class BLEPeripheralModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BLEPeripheral"

        // Must match src/sync/ble/types.ts
        private val SERVICE_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
        private val WRITE_CHAR_UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
        private val NOTIFY_CHAR_UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")
        private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        const val EVENT_CHUNK = "BLEPeripheral_ChunkReceived"
        const val EVENT_CONNECTED = "BLEPeripheral_CentralConnected"
        const val EVENT_DISCONNECTED = "BLEPeripheral_CentralDisconnected"
        const val EVENT_STATE = "BLEPeripheral_StateChanged"
    }

    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var notifyCharacteristic: BluetoothGattCharacteristic? = null
    private var advertising = false

    // address → BluetoothDevice for connected centrals
    private val connectedDevices = ConcurrentHashMap<String, BluetoothDevice>()

    override fun getName(): String = "BLEPeripheralModule"

    private fun hasPermission(perm: String): Boolean =
        ContextCompat.checkSelfPermission(reactContext, perm) == PackageManager.PERMISSION_GRANTED

    private fun hasBlePermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            hasPermission(Manifest.permission.BLUETOOTH_ADVERTISE) &&
                hasPermission(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            true
        }
    }

    private fun getBluetoothAdapter(): BluetoothAdapter? {
        val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return manager?.adapter
    }

    private fun emit(event: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    private fun emitState(state: String, message: String? = null) {
        val map = Arguments.createMap()
        map.putString("state", state)
        if (message != null) map.putString("message", message)
        emit(EVENT_STATE, map)
    }

    @ReactMethod
    fun isSupported(promise: Promise) {
        try {
            val adapter = getBluetoothAdapter()
            if (adapter == null) {
                promise.resolve(false)
                return
            }
            promise.resolve(adapter.isMultipleAdvertisementSupported)
        } catch (e: Exception) {
            promise.reject("ERR_SUPPORT_CHECK", e.message, e)
        }
    }

    @ReactMethod
    fun start(deviceName: String, promise: Promise) {
        try {
            if (advertising) {
                promise.resolve(true)
                return
            }
            if (!hasBlePermissions()) {
                promise.reject("ERR_PERMISSION", "Bluetooth permissions not granted")
                return
            }
            val adapter = getBluetoothAdapter()
            if (adapter == null || !adapter.isEnabled) {
                promise.reject("ERR_BT_OFF", "Bluetooth is off")
                return
            }
            val advertiserInstance = adapter.bluetoothLeAdvertiser
            if (advertiserInstance == null) {
                promise.reject("ERR_NO_ADVERTISER", "BLE advertising not supported on this device")
                return
            }

            // Setting the adapter name globally is the only way to advertise a friendly
            // name in the LE advertisement on Android. Truncate to 8 chars to keep the
            // advertisement payload under the 31-byte cap.
            val safeName = deviceName.take(8)
            try { adapter.name = safeName } catch (_: Exception) {}

            startGattServer()
            startAdvertising(advertiserInstance, promise)
        } catch (e: Exception) {
            promise.reject("ERR_START", e.message, e)
        }
    }

    private fun startGattServer() {
        val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val server = manager.openGattServer(reactContext, gattServerCallback)
            ?: throw RuntimeException("Failed to open GATT server")

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

        val writeChar = BluetoothGattCharacteristic(
            WRITE_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_WRITE,
        )
        val notifyChar = BluetoothGattCharacteristic(
            NOTIFY_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ,
        )
        // CCCD descriptor required for notifications
        val cccd = BluetoothGattDescriptor(
            CCCD_UUID,
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE,
        )
        notifyChar.addDescriptor(cccd)

        service.addCharacteristic(writeChar)
        service.addCharacteristic(notifyChar)
        server.addService(service)

        gattServer = server
        notifyCharacteristic = notifyChar
    }

    private fun startAdvertising(advertiser: BluetoothLeAdvertiser, promise: Promise) {
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .build()

        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(true)
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                advertising = true
                this@BLEPeripheralModule.advertiser = advertiser
                advertiseCallbackRef = this
                emitState("started")
                promise.resolve(true)
            }

            override fun onStartFailure(errorCode: Int) {
                advertising = false
                val msg = when (errorCode) {
                    ADVERTISE_FAILED_DATA_TOO_LARGE -> "Advertise data too large"
                    ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                    ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                    ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                    ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                    else -> "Unknown error $errorCode"
                }
                emitState("failed", msg)
                promise.reject("ERR_ADVERTISE", msg)
            }
        }
        advertiser.startAdvertising(settings, data, callback)
    }

    private var advertiseCallbackRef: AdvertiseCallback? = null

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            advertiseCallbackRef?.let { cb ->
                try { advertiser?.stopAdvertising(cb) } catch (_: Exception) {}
            }
            advertiseCallbackRef = null
            advertiser = null

            gattServer?.let { server ->
                try { server.close() } catch (_: Exception) {}
            }
            gattServer = null
            notifyCharacteristic = null
            connectedDevices.clear()
            advertising = false
            emitState("stopped")
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP", e.message, e)
        }
    }

    @ReactMethod
    fun isAdvertising(promise: Promise) {
        promise.resolve(advertising)
    }

    /**
     * Send a single chunk of bytes to a connected central via the NOTIFY characteristic.
     * `data` must be a base64 string — same encoding the central uses on the way in.
     */
    @ReactMethod
    fun sendChunk(centralAddress: String, data: String, promise: Promise) {
        try {
            val server = gattServer ?: run {
                promise.reject("ERR_NOT_STARTED", "GATT server not started")
                return
            }
            val notify = notifyCharacteristic ?: run {
                promise.reject("ERR_NOT_STARTED", "Notify characteristic not initialized")
                return
            }
            val device = connectedDevices[centralAddress] ?: run {
                promise.reject("ERR_NOT_CONNECTED", "Central $centralAddress not connected")
                return
            }
            val bytes = android.util.Base64.decode(data, android.util.Base64.NO_WRAP)
            notify.value = bytes
            val ok = server.notifyCharacteristicChanged(device, notify, false)
            promise.resolve(ok)
        } catch (e: Exception) {
            promise.reject("ERR_SEND", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) { /* required for NativeEventEmitter */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* required for NativeEventEmitter */ }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    connectedDevices[device.address] = device
                    val map = Arguments.createMap()
                    map.putString("address", device.address)
                    emit(EVENT_CONNECTED, map)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    connectedDevices.remove(device.address)
                    val map = Arguments.createMap()
                    map.putString("address", device.address)
                    emit(EVENT_DISCONNECTED, map)
                }
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            if (characteristic.uuid == WRITE_CHAR_UUID) {
                val b64 = android.util.Base64.encodeToString(value, android.util.Base64.NO_WRAP)
                val map = Arguments.createMap()
                map.putString("address", device.address)
                map.putString("data", b64)
                emit(EVENT_CHUNK, map)
            }
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            // Acknowledge CCCD writes (subscribe/unsubscribe to notifications)
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }
    }
}
