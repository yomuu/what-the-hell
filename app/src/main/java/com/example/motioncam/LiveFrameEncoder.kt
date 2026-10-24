package com.example.motioncam

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.os.SystemClock
import androidx.camera.core.ImageProxy
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicInteger

/**
 * Turns analysis frames into JPEGs for the remote live view. Only encodes while
 * someone is watching, and at most [FRAME_INTERVAL_MS] apart, to save battery.
 */
class LiveFrameEncoder {

    class Frame(val jpeg: ByteArray, val rotationDegrees: Int, val sequence: Long)

    private val lock = Object()
    private var latest: Frame? = null
    private var lastEncodedAt = 0L
    private val viewers = AtomicInteger(0)

    /** How far the latest frame must be turned clockwise to look upright. */
    @Volatile
    var rotationDegrees = 0
        private set

    fun addViewer() = viewers.incrementAndGet()
    fun removeViewer() = viewers.decrementAndGet()

    /** Called on the analysis thread with each camera frame. */
    fun offer(image: ImageProxy) {
        rotationDegrees = image.imageInfo.rotationDegrees
        if (viewers.get() <= 0) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastEncodedAt < FRAME_INTERVAL_MS) return
        lastEncodedAt = now

        val nv21 = toNv21(image)
        val out = ByteArrayOutputStream()
        YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
            .compressToJpeg(Rect(0, 0, image.width, image.height), JPEG_QUALITY, out)
        synchronized(lock) {
            latest = Frame(out.toByteArray(), image.imageInfo.rotationDegrees, (latest?.sequence ?: 0) + 1)
            lock.notifyAll()
        }
    }

    /** Waits up to [timeoutMs] for a frame newer than [afterSequence]. */
    fun awaitFrame(afterSequence: Long, timeoutMs: Long): Frame? {
        val deadline = SystemClock.elapsedRealtime() + timeoutMs
        synchronized(lock) {
            while (true) {
                val frame = latest
                if (frame != null && frame.sequence > afterSequence) return frame
                val wait = deadline - SystemClock.elapsedRealtime()
                if (wait <= 0) return null
                lock.wait(wait)
            }
        }
    }

    /** Copies a YUV_420_888 image into NV21 (Y plane, then interleaved V/U), honouring strides. */
    private fun toNv21(image: ImageProxy): ByteArray {
        val width = image.width
        val height = image.height
        val out = ByteArray(width * height * 3 / 2)

        val y = image.planes[0]
        val yBuffer = y.buffer
        var pos = 0
        for (row in 0 until height) {
            val rowStart = row * y.rowStride
            for (col in 0 until width) {
                out[pos++] = yBuffer.get(rowStart + col * y.pixelStride)
            }
        }

        val u = image.planes[1]
        val v = image.planes[2]
        val uBuffer = u.buffer
        val vBuffer = v.buffer
        for (row in 0 until height / 2) {
            for (col in 0 until width / 2) {
                out[pos++] = vBuffer.get(row * v.rowStride + col * v.pixelStride)
                out[pos++] = uBuffer.get(row * u.rowStride + col * u.pixelStride)
            }
        }
        return out
    }

    private companion object {
        const val FRAME_INTERVAL_MS = 200L
        const val JPEG_QUALITY = 70
    }
}
