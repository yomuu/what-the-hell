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
import android.view.View
import android.widget.Button
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat

/**
 * Shows the camera, the arm switch and the settings. While disarmed the activity
 * runs its own preview so you can aim the phone; once armed, [MotionCameraService]
 * owns the camera and this screen just displays its picture and status.
 */
class MainActivity : AppCompatActivity(), MotionCameraService.Listener {

    private lateinit var settings: Settings
    private lateinit var previewView: PreviewView
    private lateinit var zoneOverlay: ZoneOverlayView
    private lateinit var statusText: TextView
    private lateinit var clipsText: TextView
    private lateinit var viewerText: TextView
    private lateinit var armButton: Button
    private lateinit var zonesButton: Button
    private lateinit var newCodeButton: Button
    private lateinit var sensitivityBar: SeekBar
    private lateinit var alertsSwitch: SwitchCompat
    private lateinit var nightSwitch: SwitchCompat
    private lateinit var viewerSwitch: SwitchCompat

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
            s.applySettings()
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
        settings = Settings(this)

        previewView = findViewById(R.id.preview)
        zoneOverlay = findViewById(R.id.zone_overlay)
        statusText = findViewById(R.id.status)
        clipsText = findViewById(R.id.clips)
        viewerText = findViewById(R.id.viewer_info)
        armButton = findViewById(R.id.arm_button)
        zonesButton = findViewById(R.id.zones_button)
        newCodeButton = findViewById(R.id.new_code_button)
        sensitivityBar = findViewById(R.id.sensitivity)
        alertsSwitch = findViewById(R.id.alerts_switch)
        nightSwitch = findViewById(R.id.night_switch)
        viewerSwitch = findViewById(R.id.viewer_switch)

        sensitivityBar.progress = settings.sensitivity
        sensitivityBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                if (!fromUser) return
                settings.sensitivity = progress
                service?.applySettings()
            }
            override fun onStartTrackingTouch(bar: SeekBar) = Unit
            override fun onStopTrackingTouch(bar: SeekBar) = Unit
        })

        alertsSwitch.isChecked = settings.alertsEnabled
        alertsSwitch.setOnCheckedChangeListener { _, checked ->
            settings.alertsEnabled = checked
            service?.applySettings()
        }
        nightSwitch.isChecked = settings.nightModeEnabled
        nightSwitch.setOnCheckedChangeListener { _, checked ->
            settings.nightModeEnabled = checked
            service?.applySettings()
        }
        viewerSwitch.isChecked = settings.remoteViewingEnabled
        viewerSwitch.setOnCheckedChangeListener { _, checked ->
            settings.remoteViewingEnabled = checked
            service?.applySettings()
            showViewerInfo()
        }
        newCodeButton.setOnClickListener {
            settings.newAccessCode()
            // The running viewer keeps the code it started with; restart it with the new one.
            if (settings.remoteViewingEnabled) {
                settings.remoteViewingEnabled = false
                service?.applySettings()
                settings.remoteViewingEnabled = true
                service?.applySettings()
            }
            showViewerInfo()
        }

        zoneOverlay.ignored = settings.ignoredZones
        zoneOverlay.onChanged = { zones ->
            settings.ignoredZones = zones
            service?.applySettings()
        }
        zonesButton.setOnClickListener {
            zoneOverlay.editing = !zoneOverlay.editing
            zonesButton.setText(if (zoneOverlay.editing) R.string.zones_done else R.string.zones_edit)
        }

        armButton.setOnClickListener {
            if (armRequested) service?.disarm() else arm()
        }
        showClips(0)
        showViewerInfo()

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
        // The Wi-Fi address may have changed while we were away.
        showViewerInfo()
        if (!hasCameraPermission()) return
        if (armRequested) connectToService() else startOwnPreview()
    }

    override fun onStop() {
        visible = false
        zoneOverlay.motionBox = null
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
        MotionCameraService.arm(this)
        connectToService()
    }

    override fun onDisarmed() {
        armRequested = false
        zoneOverlay.motionBox = null
        disconnectFromService()
        armButton.setText(R.string.arm)
        statusText.setText(R.string.status_disarmed)
        statusText.setTextColor(Color.WHITE)
        if (visible) startOwnPreview()
    }

    override fun onStateChanged(state: MotionCameraService.State) {
        showClips(state.clipsSaved)
        zoneOverlay.motionBox = state.motionBox
        val night = if (state.nightBoost) getString(R.string.night_on_suffix) else ""
        when {
            state.recording -> {
                statusText.text = getString(R.string.status_recording) + night
                statusText.setTextColor(Color.RED)
            }
            state.error != null -> {
                statusText.text = state.error
                statusText.setTextColor(Color.WHITE)
            }
            else -> {
                statusText.text = getString(R.string.status_watching_score, state.score * 100) + night
                statusText.setTextColor(Color.WHITE)
            }
        }
    }

    private fun showViewerInfo() {
        if (!settings.remoteViewingEnabled) {
            viewerText.visibility = View.GONE
            newCodeButton.visibility = View.GONE
            return
        }
        viewerText.visibility = View.VISIBLE
        newCodeButton.visibility = View.VISIBLE
        val address = ViewerServer.localAddress()
        val code = settings.accessCode.chunked(4).joinToString("-")
        viewerText.text = if (address == null) {
            getString(R.string.viewer_no_wifi)
        } else {
            getString(R.string.viewer_info, "http://$address:${ViewerServer.PORT}", code)
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

    /** Preview used while disarmed, so the phone can be aimed and zones drawn. */
    private fun startOwnPreview() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            if (!visible || armRequested) return@addListener
            val provider = providerFuture.get()
            cameraProvider = provider
            val preview = ownPreview ?: Preview.Builder()
                .setResolutionSelector(
                    ResolutionSelector.Builder()
                        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                        .build()
                )
                .build()
                .also { ownPreview = it }
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
    }
}
