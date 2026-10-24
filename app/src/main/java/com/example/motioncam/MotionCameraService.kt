package com.example.motioncam

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
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
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
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
import java.util.concurrent.Executors

/**
 * Owns the camera while the app is armed, so motion detection and recording keep
 * running with the screen off. Runs as a camera foreground service, which Android
 * only allows to start while the app is on screen.
 */
class MotionCameraService : LifecycleService(), MotionRecorder.Listener {

    data class State(
        val recording: Boolean = false,
        val score: Float = 0f,
        val clipsSaved: Int = 0,
        val error: String? = null,
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
    private val detector = MotionDetector { score, motion ->
        handler.post { onFrameAnalyzed(score, motion) }
    }

    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var surfaceProvider: Preview.SurfaceProvider? = null
    private var recorder: MotionRecorder? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var listener: Listener? = null
    private var consecutiveMotionFrames = 0
    private var state = State()

    private val ticker = object : Runnable {
        override fun run() {
            recorder?.tick(SystemClock.elapsedRealtime())
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel),
            NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
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
        intent?.let { detector.threshold = it.getFloatExtra(EXTRA_THRESHOLD, detector.threshold) }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)

        if (!isRunning) {
            isRunning = true
            acquireWakeLock()
            handler.post(ticker)
            startCamera()
        }
        // Don't let Android restart us later: the camera can't be opened from the background.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
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

    fun setThreshold(value: Float) {
        detector.threshold = value
    }

    fun disarm() {
        recorder?.stop()
        cameraProvider?.unbindAll()
        cameraProvider = null
        recorder = null
        preview = null
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

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(surfaceProvider)
            }

            // Motion detection only needs a small image.
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(
                    ResolutionSelector.Builder()
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
                provider.bindToLifecycle(
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

    private fun onFrameAnalyzed(score: Float, motion: Boolean) {
        val rec = recorder ?: return
        // Require a few motion frames in a row so sensor noise doesn't trigger clips.
        consecutiveMotionFrames = if (motion) consecutiveMotionFrames + 1 else 0
        if (consecutiveMotionFrames >= MOTION_FRAMES_TO_TRIGGER) {
            rec.onMotion(SystemClock.elapsedRealtime())
        }
        state = state.copy(score = score)
        listener?.onStateChanged(state)
    }

    override fun onRecordingStarted() {
        updateState(state.copy(recording = true, error = null))
    }

    override fun onRecordingSaved(uri: Uri) {
        Log.i(TAG, "Saved clip $uri")
        updateState(state.copy(recording = false, clipsSaved = state.clipsSaved + 1))
    }

    override fun onRecordingFailed(error: Int) {
        Log.w(TAG, "Recording finished with error $error")
        updateState(
            state.copy(recording = false, error = getString(R.string.status_recording_error, error))
        )
    }

    private fun updateState(value: State) {
        state = value
        listener?.onStateChanged(value)
        if (isRunning) {
            getSystemService(NotificationManager::class.java)
                .notify(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_menu_camera)
        .setContentTitle(
            getString(if (state.recording) R.string.status_recording else R.string.status_watching)
        )
        .setContentText(
            resources.getQuantityString(R.plurals.clips_saved, state.clipsSaved, state.clipsSaved)
        )
        .setContentIntent(
            PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
            )
        )
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

        const val EXTRA_THRESHOLD = "threshold"
        private const val ACTION_DISARM = "com.example.motioncam.DISARM"
        private const val CHANNEL_ID = "monitoring"
        private const val NOTIFICATION_ID = 1
        private const val TAG = "MotionCam"
        private const val TICK_MS = 500L
        private const val MOTION_FRAMES_TO_TRIGGER = 3

        fun arm(context: Context, threshold: Float) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, MotionCameraService::class.java).putExtra(EXTRA_THRESHOLD, threshold),
            )
        }
    }
}
