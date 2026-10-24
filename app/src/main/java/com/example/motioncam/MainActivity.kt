package com.example.motioncam

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.view.WindowManager
import android.widget.Button
import android.widget.SeekBar
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
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
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity(), MotionRecorder.Listener {

    private lateinit var previewView: PreviewView
    private lateinit var statusText: TextView
    private lateinit var clipsText: TextView
    private lateinit var armButton: Button
    private lateinit var sensitivityBar: SeekBar

    private lateinit var analysisExecutor: ExecutorService
    private val handler = Handler(Looper.getMainLooper())
    private val detector = MotionDetector { score, motion ->
        runOnUiThread { onFrameAnalyzed(score, motion) }
    }
    private var recorder: MotionRecorder? = null

    private var armed = false
    private var consecutiveMotionFrames = 0
    private var clipsSaved = 0

    private val requestCameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) startCamera() else statusText.setText(R.string.status_no_permission)
        }

    private val ticker = object : Runnable {
        override fun run() {
            recorder?.tick(SystemClock.elapsedRealtime())
            handler.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        // A security camera is usually a spare phone on a stand; keep the screen
        // (and therefore the camera) on while the app is open.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        previewView = findViewById(R.id.preview)
        statusText = findViewById(R.id.status)
        clipsText = findViewById(R.id.clips)
        armButton = findViewById(R.id.arm_button)
        sensitivityBar = findViewById(R.id.sensitivity)

        analysisExecutor = Executors.newSingleThreadExecutor()

        detector.threshold = thresholdFor(sensitivityBar.progress)
        sensitivityBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar: SeekBar, progress: Int, fromUser: Boolean) {
                detector.threshold = thresholdFor(progress)
            }
            override fun onStartTrackingTouch(bar: SeekBar) = Unit
            override fun onStopTrackingTouch(bar: SeekBar) = Unit
        })

        armButton.setOnClickListener { setArmed(!armed) }
        updateClipsText()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        } else {
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onStart() {
        super.onStart()
        handler.post(ticker)
    }

    override fun onStop() {
        // CameraX releases the camera when the activity stops; close the clip cleanly.
        recorder?.stop()
        handler.removeCallbacks(ticker)
        super.onStop()
    }

    override fun onDestroy() {
        analysisExecutor.shutdown()
        super.onDestroy()
    }

    private fun startCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            val provider = providerFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
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
                recorder = MotionRecorder(this, videoCapture, this)
                setArmed(armed)
            } catch (e: Exception) {
                Log.e(TAG, "Could not bind camera use cases", e)
                statusText.text = getString(R.string.status_camera_error, e.message)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun setArmed(value: Boolean) {
        armed = value
        consecutiveMotionFrames = 0
        if (!armed) recorder?.stop()
        armButton.setText(if (armed) R.string.disarm else R.string.arm)
        if (recorder?.isRecording != true) {
            statusText.setText(if (armed) R.string.status_watching else R.string.status_disarmed)
            statusText.setTextColor(Color.WHITE)
        }
    }

    private fun onFrameAnalyzed(score: Float, motion: Boolean) {
        val rec = recorder ?: return
        if (!armed) return
        // Require a few motion frames in a row so sensor noise doesn't trigger clips.
        consecutiveMotionFrames = if (motion) consecutiveMotionFrames + 1 else 0
        if (consecutiveMotionFrames >= MOTION_FRAMES_TO_TRIGGER) {
            rec.onMotion(SystemClock.elapsedRealtime())
        }
        if (!rec.isRecording) {
            statusText.text = getString(R.string.status_watching_score, score * 100)
        }
    }

    override fun onRecordingStarted() {
        statusText.setText(R.string.status_recording)
        statusText.setTextColor(Color.RED)
    }

    override fun onRecordingSaved(uri: Uri) {
        Log.i(TAG, "Saved clip $uri")
        clipsSaved++
        updateClipsText()
        setArmed(armed)
    }

    override fun onRecordingFailed(error: Int) {
        Log.w(TAG, "Recording finished with error $error")
        statusText.text = getString(R.string.status_recording_error, error)
        statusText.setTextColor(Color.WHITE)
    }

    private fun updateClipsText() {
        clipsText.text = resources.getQuantityString(R.plurals.clips_saved, clipsSaved, clipsSaved)
    }

    private companion object {
        const val TAG = "MotionCam"
        const val TICK_MS = 500L
        const val MOTION_FRAMES_TO_TRIGGER = 3

        /** Sensitivity 0..100 -> changed-area threshold from 10% down to 0.2% of the frame. */
        fun thresholdFor(sensitivity: Int): Float = 0.002f + 0.098f * (1f - sensitivity / 100f)
    }
}
