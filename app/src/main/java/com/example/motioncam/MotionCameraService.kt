package com.example.motioncam

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.RectF
import android.net.Uri
import android.os.Binder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import android.util.Size
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.VideoCapture
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
import java.util.concurrent.Executors

/**
 * Owns the camera while the app is armed, so motion detection and recording keep
 * running with the screen off. Runs as a camera foreground service, which Android
 * only allows to start while the app is on screen.
 *
 * Also posts motion alerts, brightens the camera in the dark (night mode) and,
 * if enabled, serves the Wi-Fi viewer.
 */
class MotionCameraService : LifecycleService(), MotionRecorder.Listener {

    data class State(
        val recording: Boolean = false,
        val score: Float = 0f,
        val clipsSaved: Int = 0,
        val error: String? = null,
        /** Wall-clock time of the last motion that started a clip, or 0. */
        val lastMotionAt: Long = 0,
        val nightBoost: Boolean = false,
        /** Where motion is in the latest frame, in 0..1 screen coordinates, or null. */
        val motionBox: RectF? = null,
    )

    interface Listener {
        fun onStateChanged(state: State)
        fun onDisarmed()
    }

    inner class LocalBinder : Binder() {
        val service: MotionCameraService get() = this@MotionCameraService
    }

    private val binder = LocalBinder()
    private val handler = Handler(Looper.getMainLooper())
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private val liveFrames = LiveFrameEncoder()
    private val detector = MotionDetector { score, motion, brightness, box ->
        handler.post { onFrameAnalyzed(score, motion, brightness, box) }
    }.also { it.frameSink = liveFrames::offer }

    private lateinit var settings: Settings
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var preview: Preview? = null
    private var surfaceProvider: Preview.SurfaceProvider? = null
    private var recorder: MotionRecorder? = null
    private var viewerServer: ViewerServer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var listener: Listener? = null
    private var consecutiveMotionFrames = 0
    private var brightness = -1f
    private var nightChangedAt = 0L
    private var alertsEnabled = true

    @Volatile
    private var state = State()

    private val ticker = object : Runnable {
        override fun run() {
            val now = SystemClock.elapsedRealtime()
            recorder?.tick(now)
            updateNightBoost(now)
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        settings = Settings(this)
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_MONITORING,
                getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW,
            )
        )
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ALERTS,
                getString(R.string.alert_channel),
                NotificationManager.IMPORTANCE_HIGH,
            )
        )
    }

    override fun onBind(intent: Intent): IBinder {
        super.onBind(intent)
        return binder
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        if (intent?.action == ACTION_DISARM) {
            disarm()
            return START_NOT_STICKY
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)

        if (!isRunning) {
            isRunning = true
            applySettings()
            acquireWakeLock()
            handler.post(ticker)
            startCamera()
        }
        // Don't let Android restart us later: the camera can't be opened from the background.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        stopViewer()
        analysisExecutor.shutdown()
        releaseWakeLock()
        isRunning = false
        super.onDestroy()
    }

    /** Show the live picture in [provider], or pass null when the screen goes away. */
    fun attachPreview(provider: Preview.SurfaceProvider?) {
        surfaceProvider = provider
        preview?.setSurfaceProvider(provider)
    }

    fun setListener(value: Listener?) {
        listener = value
        value?.onStateChanged(state)
    }

    /** Re-read [Settings] after the user changes something while armed. */
    fun applySettings() {
        detector.threshold = settings.threshold()
        detector.ignoredZones = settings.ignoredZones
        detector.nightMode = settings.nightModeEnabled
        alertsEnabled = settings.alertsEnabled
        if (!settings.nightModeEnabled && state.nightBoost) setNightBoost(false)
        if (settings.remoteViewingEnabled) startViewer() else stopViewer()
    }

    fun disarm() {
        recorder?.stop()
        cameraProvider?.unbindAll()
        cameraProvider = null
        camera = null
        recorder = null
        preview = null
        stopViewer()
        handler.removeCallbacks(ticker)
        releaseWakeLock()
        isRunning = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        listener?.onDisarmed()
        listener = null
        stopSelf()
    }

    private fun startCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            // Disarmed before the camera became available.
            if (!isRunning) return@addListener
            val provider = providerFuture.get()

            // 4:3 everywhere, so the preview, the zone grid and the analysed image line up.
            val preview = Preview.Builder()
                .setResolutionSelector(
                    ResolutionSelector.Builder()
                        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                        .build()
                )
                .build()
                .also { it.setSurfaceProvider(surfaceProvider) }

            // Motion detection only needs a small image.
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(
                    ResolutionSelector.Builder()
                        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                        .setResolutionStrategy(
                            ResolutionStrategy(
                                Size(640, 480),
                                ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
                            )
                        )
                        .build()
                )
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { it.setAnalyzer(analysisExecutor, detector) }

            val videoCapture = VideoCapture.withOutput(
                Recorder.Builder()
                    .setQualitySelector(
                        QualitySelector.from(
                            Quality.HD,
                            FallbackStrategy.lowerQualityOrHigherThan(Quality.HD),
                        )
                    )
                    .build()
            )

            try {
                provider.unbindAll()
                camera = provider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                    videoCapture,
                )
                cameraProvider = provider
                this.preview = preview
                recorder = MotionRecorder(this, videoCapture, this)
            } catch (e: Exception) {
                Log.e(TAG, "Could not bind camera use cases", e)
                updateState(state.copy(error = getString(R.string.status_camera_error, e.message)))
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun onFrameAnalyzed(score: Float, motion: Boolean, frameBrightness: Int, box: RectF?) {
        val rec = recorder ?: return
        brightness = if (brightness < 0) {
            frameBrightness.toFloat()
        } else {
            brightness * 0.95f + frameBrightness * 0.05f
        }
        // Require a few motion frames in a row so sensor noise doesn't trigger clips.
        consecutiveMotionFrames = if (motion) consecutiveMotionFrames + 1 else 0
        if (consecutiveMotionFrames >= MOTION_FRAMES_TO_TRIGGER) {
            rec.onMotion(SystemClock.elapsedRealtime())
        }
        state = state.copy(score = score, motionBox = box)
        listener?.onStateChanged(state)
    }

    /**
     * Night mode: when the scene stays dark, raise exposure compensation to its
     * maximum so both detection and the recorded video can see more. The boost
     * itself brightens the picture, so it is only turned off once the scene is
     * bright even with it, and changes are spaced out to avoid flicker.
     */
    private fun updateNightBoost(now: Long) {
        if (!settings.nightModeEnabled || brightness < 0) return
        if (now - nightChangedAt < NIGHT_MIN_DWELL_MS) return
        if (!state.nightBoost && brightness < DARK_BRIGHTNESS) {
            setNightBoost(true)
        } else if (state.nightBoost && brightness > BRIGHT_WITH_BOOST) {
            setNightBoost(false)
        }
    }

    private fun setNightBoost(on: Boolean) {
        val cam = camera ?: return
        val exposure = cam.cameraInfo.exposureState
        if (!exposure.isExposureCompensationSupported) return
        cam.cameraControl.setExposureCompensationIndex(if (on) exposure.exposureCompensationRange.upper else 0)
        // The whole picture changes brightness; learn the scene again instead of calling it motion.
        detector.resetBackground()
        nightChangedAt = SystemClock.elapsedRealtime()
        updateState(state.copy(nightBoost = on))
    }

    override fun onRecordingStarted() {
        val now = System.currentTimeMillis()
        updateState(state.copy(recording = true, error = null, lastMotionAt = now))
        if (alertsEnabled) postAlert(now, null)
    }

    override fun onRecordingSaved(uri: Uri) {
        Log.i(TAG, "Saved clip $uri")
        updateState(state.copy(recording = false, clipsSaved = state.clipsSaved + 1))
        // Add a "Play clip" button to the alert for this event.
        if (alertsEnabled && state.lastMotionAt != 0L) postAlert(state.lastMotionAt, uri)
    }

    override fun onRecordingFailed(error: Int) {
        Log.w(TAG, "Recording finished with error $error")
        updateState(
            state.copy(recording = false, error = getString(R.string.status_recording_error, error))
        )
    }

    private fun postAlert(at: Long, clip: Uri?) {
        if (!isRunning) return
        val time = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(at))
        val builder = NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle(getString(R.string.alert_title))
            .setContentText(getString(R.string.alert_text, time))
            .setWhen(at)
            .setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
        if (clip != null) {
            // Updating the same alert once the clip is saved shouldn't ring again.
            builder.setOnlyAlertOnce(true)
            val play = Intent(Intent.ACTION_VIEW)
                .setDataAndType(clip, "video/mp4")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            builder.addAction(
                0,
                getString(R.string.alert_play),
                PendingIntent.getActivity(this, 2, play, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT),
            )
        }
        getSystemService(NotificationManager::class.java).notify(ALERT_ID, builder.build())
    }

    private fun startViewer() {
        if (viewerServer != null) return
        val server = ViewerServer(this, settings.accessCode, liveFrames) { statusJson() }
        try {
            server.startServer()
            viewerServer = server
        } catch (e: Exception) {
            Log.e(TAG, "Could not start viewer", e)
            updateState(state.copy(error = getString(R.string.viewer_error, e.message)))
        }
    }

    private fun stopViewer() {
        viewerServer?.stop()
        viewerServer = null
    }

    private fun statusJson(): JSONObject {
        val s = state
        return JSONObject()
            .put("armed", isRunning)
            .put("recording", s.recording)
            .put("lastMotionAt", s.lastMotionAt)
            .put("clipsSaved", s.clipsSaved)
            .put("nightBoost", s.nightBoost)
            .put("rotation", liveFrames.rotationDegrees)
    }

    private fun updateState(value: State) {
        state = value
        listener?.onStateChanged(value)
        if (isRunning) {
            getSystemService(NotificationManager::class.java)
                .notify(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun openAppIntent() = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
    )

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_MONITORING)
        .setSmallIcon(android.R.drawable.ic_menu_camera)
        .setContentTitle(
            getString(if (state.recording) R.string.status_recording else R.string.status_watching)
        )
        .setContentText(
            resources.getQuantityString(R.plurals.clips_saved, state.clipsSaved, state.clipsSaved)
        )
        .setContentIntent(openAppIntent())
        .addAction(
            0,
            getString(R.string.disarm),
            PendingIntent.getService(
                this, 1, Intent(this, MotionCameraService::class.java).setAction(ACTION_DISARM),
                PendingIntent.FLAG_IMMUTABLE,
            ),
        )
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .build()

    private fun acquireWakeLock() {
        // Keep the CPU awake for motion analysis while the screen is off.
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MotionCam:armed")
            .apply {
                setReferenceCounted(false)
                acquire()
            }
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    companion object {
        /** True from arming until disarm; the activity checks it before touching the camera. */
        @Volatile
        var isRunning = false
            private set

        private const val ACTION_DISARM = "com.example.motioncam.DISARM"
        private const val CHANNEL_MONITORING = "monitoring"
        private const val CHANNEL_ALERTS = "alerts"
        private const val NOTIFICATION_ID = 1
        private const val ALERT_ID = 2
        private const val TAG = "MotionCam"
        private const val TICK_MS = 500L
        private const val MOTION_FRAMES_TO_TRIGGER = 3
        /** Average brightness (0..255) below which night mode turns on. */
        private const val DARK_BRIGHTNESS = 50f
        /** Night mode turns off only if the boosted picture is this bright. */
        private const val BRIGHT_WITH_BOOST = 170f
        private const val NIGHT_MIN_DWELL_MS = 30_000L

        fun arm(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, MotionCameraService::class.java))
        }
    }
}
