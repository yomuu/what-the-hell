package com.example.motioncam

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import android.widget.Button
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat

/**
 * Shows the camera and the arm switch. While disarmed the activity runs its own
 * preview so you can aim the phone; once armed, [MotionCameraService] owns the
 * camera and this screen just displays its picture and status.
 */
class MainActivity : AppCompatActivity(), MotionCameraService.Listener {

    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var clipsText: TextView
    private lateinit var armButton: Button
    private lateinit var sensitivityBar: SeekBar

    private var cameraProvider: ProcessCameraProvider? = null
    private var ownPreview: Preview? = null
    private var service: MotionCameraService? = null
    private var serviceBound = false
    private var visible = false
    // Set as soon as Arm is tapped, before the service reports that it is running.
    private var armRequested = false

    private val requestPermissions =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            if (hasCameraPermission()) {
                if (visible) startOwnPreview()
            } else {
                statusText.setText(R.string.status_no_permission)
            }
        }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            val s = (binder as MotionCameraService.LocalBinder).service
            service = s
            s.setThreshold(thresholdFor(sensitivityBar.progress))
            s.attachPreview(previewView.surfaceProvider)
            s.setListener(this@MainActivity)
            armButton.setText(R.string.disarm)
        }

        override fun onServiceDisconnected(name: ComponentName) {
            service = null
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        previewView = findViewById(R.id.preview)
        statusText = findViewById(R.id.status)
        clipsText = findViewById(R.id.clips)
        armButton = findViewById(R.id.arm_button)
        sensitivityBar = findViewById(R.id.sensitivity)

        sensitivityBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                service?.setThreshold(thresholdFor(progress))
            }
            override fun onStartTrackingTouch(bar: SeekBar) = Unit
            override fun onStopTrackingTouch(bar: SeekBar) = Unit
        })

        armButton.setOnClickListener {
            if (armRequested) service?.disarm() else arm()
        }
        showClips(0)

        val needed = buildList {
            if (!hasCameraPermission()) add(Manifest.permission.CAMERA)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (needed.isNotEmpty()) requestPermissions.launch(needed.toTypedArray())
    }

    override fun onStart() {
        super.onStart()
        visible = true
        armRequested = MotionCameraService.isRunning
        if (!hasCameraPermission()) return
        if (armRequested) connectToService() else startOwnPreview()
    }

    override fun onStop() {
        visible = false
        // The service keeps recording; it just stops drawing into this screen.
        disconnectFromService()
        super.onStop()
    }

    private fun arm() {
        if (!hasCameraPermission()) {
            requestPermissions.launch(arrayOf(Manifest.permission.CAMERA))
            return
        }
        armRequested = true
        // Hand the camera over to the service.
        ownPreview?.let { cameraProvider?.unbind(it) }
        MotionCameraService.arm(this, thresholdFor(sensitivityBar.progress))
        connectToService()
    }

    override fun onDisarmed() {
        armRequested = false
        disconnectFromService()
        armButton.setText(R.string.arm)
        statusText.setText(R.string.status_disarmed)
        statusText.setTextColor(Color.WHITE)
        if (visible) startOwnPreview()
    }

    override fun onStateChanged(state: MotionCameraService.State) {
        showClips(state.clipsSaved)
        when {
            state.recording -> {
                statusText.setText(R.string.status_recording)
                statusText.setTextColor(Color.RED)
            }
            state.error != null -> {
                statusText.text = state.error
                statusText.setTextColor(Color.WHITE)
            }
            else -> {
                statusText.text = getString(R.string.status_watching_score, state.score * 100)
                statusText.setTextColor(Color.WHITE)
            }
        }
    }

    private fun connectToService() {
        if (serviceBound) return
        serviceBound = bindService(
            Intent(this, MotionCameraService::class.java),
            connection,
            Context.BIND_AUTO_CREATE,
        )
    }

    private fun disconnectFromService() {
        service?.attachPreview(null)
        service?.setListener(null)
        service = null
        if (serviceBound) {
            unbindService(connection)
            serviceBound = false
        }
    }

    /** Preview used while disarmed, so the phone can be aimed. */
    private fun startOwnPreview() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            if (!visible || armRequested) return@addListener
            val provider = providerFuture.get()
            cameraProvider = provider
            val preview = ownPreview ?: Preview.Builder().build().also { ownPreview = it }
            preview.setSurfaceProvider(previewView.surfaceProvider)
            try {
                if (!provider.isBound(preview)) {
                    provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview)
                }
                armButton.setText(R.string.arm)
                statusText.setText(R.string.status_disarmed)
            } catch (e: Exception) {
                Log.e(TAG, "Could not start preview", e)
                statusText.text = getString(R.string.status_camera_error, e.message)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun showClips(count: Int) {
        clipsText.text = resources.getQuantityString(R.plurals.clips_saved, count, count)
    }

    private fun hasCameraPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    private companion object {
        const val TAG = "MotionCam"

        /** Sensitivity 0..100 -> changed-area threshold from 10% down to 0.2% of the frame. */
        fun thresholdFor(sensitivity: Int): Float = 0.002f + 0.098f * (1f - sensitivity / 100f)
    }
}
