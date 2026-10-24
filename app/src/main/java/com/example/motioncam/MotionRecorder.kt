package com.example.motioncam

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import androidx.camera.video.MediaStoreOutputOptions
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Starts a clip when motion is reported and stops it once the scene has been
 * still for [POST_MOTION_MS], or the clip reaches [MAX_CLIP_MS]. Clips are saved
 * to Movies/MotionCam in the phone's gallery.
 *
 * All methods must be called on the main thread.
 */
class MotionRecorder(
    private val context: Context,
    private val videoCapture: VideoCapture<Recorder>,
    private val listener: Listener,
) {
    interface Listener {
        fun onRecordingStarted()
        fun onRecordingSaved(uri: Uri)
        fun onRecordingFailed(error: Int)
    }

    // Non-null from start() until CameraX finalizes the file, so a new clip
    // never starts while the previous one is still being written.
    private var recording: Recording? = null
    private var stopping = false
    private var startedAt = 0L
    private var lastMotionAt = 0L

    val isRecording: Boolean get() = recording != null && !stopping

    /** [now] is SystemClock.elapsedRealtime(). */
    fun onMotion(now: Long) {
        lastMotionAt = now
        if (recording == null) start(now)
    }

    /** Call periodically; ends the clip once motion has stopped. */
    fun tick(now: Long) {
        val active = recording ?: return
        if (stopping) return
        if (now - lastMotionAt >= POST_MOTION_MS || now - startedAt >= MAX_CLIP_MS) {
            stopping = true
            active.stop()
        }
    }

    fun stop() {
        val active = recording ?: return
        if (!stopping) {
            stopping = true
            active.stop()
        }
    }

    private fun start(now: Long) {
        val name = "motion_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/MotionCam")
        }
        val options = MediaStoreOutputOptions.Builder(
            context.contentResolver,
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
        ).setContentValues(values).build()

        startedAt = now
        stopping = false
        recording = videoCapture.output
            .prepareRecording(context, options)
            .start(ContextCompat.getMainExecutor(context)) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> listener.onRecordingStarted()
                    is VideoRecordEvent.Finalize -> {
                        recording = null
                        stopping = false
                        if (event.hasError()) {
                            listener.onRecordingFailed(event.error)
                        } else {
                            listener.onRecordingSaved(event.outputResults.outputUri)
                        }
                    }
                }
            }
    }

    private companion object {
        /** Keep recording this long after the last motion. */
        const val POST_MOTION_MS = 10_000L
        /** Split long events into clips of at most this length. */
        const val MAX_CLIP_MS = 5 * 60_000L
    }
}
