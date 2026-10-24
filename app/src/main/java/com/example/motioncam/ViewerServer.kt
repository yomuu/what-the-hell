package com.example.motioncam

import android.content.ContentUris
import android.content.Context
import android.provider.MediaStore
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import fi.iki.elonen.NanoHTTPD.IHTTPSession
import fi.iki.elonen.NanoHTTPD.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileInputStream
import java.io.InputStream
import java.net.Inet4Address
import java.net.NetworkInterface
import java.security.MessageDigest

/**
 * Small web server for watching the camera from another phone or computer on the
 * same Wi-Fi: a live view, the saved clips and motion alerts. Every request needs
 * the access code shown in the app.
 *
 * This is plain HTTP, so anyone on the same network who can see the traffic could
 * read the code; use it only on a network you trust.
 */
class ViewerServer(
    private val context: Context,
    private val accessCode: String,
    private val frames: LiveFrameEncoder,
    private val status: () -> JSONObject,
) : NanoHTTPD(PORT) {

    private val failedAttempts = ArrayDeque<Long>()

    @Volatile
    private var stopped = false

    fun startServer() {
        start(SOCKET_READ_TIMEOUT, true)
    }

    override fun stop() {
        // Live streams wait for frames rather than reading the socket; tell them to end.
        stopped = true
        super.stop()
    }

    override fun serve(session: IHTTPSession): Response {
        val path = session.uri

        // Signing in: /login?code=... sets a cookie, then sends the browser to the viewer.
        if (path == "/login") {
            val code = session.parameters["code"]?.firstOrNull().orEmpty()
                .uppercase().filter { it.isLetterOrDigit() }
            if (tooManyFailures()) {
                return text(Response.Status.FORBIDDEN, "Too many wrong codes. Wait a minute and try again.")
            }
            if (!codeMatches(code)) {
                recordFailure()
                return redirect("/?wrong=1")
            }
            return redirect("/").apply {
                addHeader("Set-Cookie", "$COOKIE=$code; Path=/; HttpOnly; SameSite=Strict")
            }
        }

        val signedIn = codeMatches(session.cookies.read(COOKIE).orEmpty())
        if (!signedIn) {
            return if (path == "/") html(LOGIN_PAGE) else text(Response.Status.UNAUTHORIZED, "Sign in first")
        }

        return try {
            when {
                path == "/" -> html(context.assets.open("viewer.html").bufferedReader().readText())
                path == "/api/status" -> json(status())
                path == "/api/clips" -> json(JSONObject().put("clips", listClips()))
                path == "/live.mjpg" -> liveStream()
                path.startsWith("/clips/") -> clip(path.removePrefix("/clips/").toLongOrNull(), session)
                else -> text(Response.Status.NOT_FOUND, "Not found")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Request $path failed", e)
            text(Response.Status.INTERNAL_ERROR, "Something went wrong")
        }
    }

    private fun liveStream(): Response {
        val response = newChunkedResponse(
            Response.Status.OK,
            "multipart/x-mixed-replace; boundary=$BOUNDARY",
            MjpegStream(),
        )
        response.addHeader("Cache-Control", "no-store")
        return response
    }

    private fun listClips(): JSONArray {
        val clips = JSONArray()
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE,
        )
        context.contentResolver.query(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            projection,
            "${MediaStore.Video.Media.RELATIVE_PATH} = ?",
            arrayOf(MotionRecorder.RELATIVE_PATH + "/"),
            "${MediaStore.Video.Media.DATE_ADDED} DESC",
        )?.use { c ->
            while (c.moveToNext() && clips.length() < MAX_CLIPS_LISTED) {
                clips.put(
                    JSONObject()
                        .put("id", c.getLong(0))
                        .put("name", c.getString(1))
                        .put("addedAt", c.getLong(2) * 1000)
                        .put("durationMs", c.getLong(3))
                        .put("bytes", c.getLong(4))
                )
            }
        }
        return clips
    }

    /** Serves one clip, with Range support so browsers can seek (Safari requires it). */
    private fun clip(id: Long?, session: IHTTPSession): Response {
        if (id == null) return text(Response.Status.NOT_FOUND, "Not found")
        val uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
        val pfd = try {
            context.contentResolver.openFileDescriptor(uri, "r")
        } catch (e: Exception) {
            null
        } ?: return text(Response.Status.NOT_FOUND, "Not found")

        val length = pfd.statSize
        val input = ParcelFileInputStream(pfd)
        val range = parseRange(session.headers["range"], length)
        if (range == null) {
            return newFixedLengthResponse(Response.Status.OK, "video/mp4", input, length).apply {
                addHeader("Accept-Ranges", "bytes")
            }
        }
        val (start, end) = range
        input.channel.position(start)
        return newFixedLengthResponse(Response.Status.PARTIAL_CONTENT, "video/mp4", input, end - start + 1).apply {
            addHeader("Accept-Ranges", "bytes")
            addHeader("Content-Range", "bytes $start-$end/$length")
        }
    }

    private fun parseRange(header: String?, length: Long): Pair<Long, Long>? {
        val spec = header?.removePrefix("bytes=")?.split(",")?.firstOrNull()?.trim() ?: return null
        val parts = spec.split("-", limit = 2)
        if (parts.size != 2 || length == 0L) return null
        val (a, b) = parts
        return when {
            a.isEmpty() -> {
                val suffix = b.toLongOrNull() ?: return null
                (length - suffix).coerceAtLeast(0) to length - 1
            }
            else -> {
                val start = a.toLongOrNull() ?: return null
                val end = b.toLongOrNull()?.coerceAtMost(length - 1) ?: (length - 1)
                if (start > end) null else start to end
            }
        }
    }

    private fun codeMatches(candidate: String) =
        MessageDigest.isEqual(candidate.toByteArray(), accessCode.toByteArray())

    @Synchronized
    private fun tooManyFailures(): Boolean {
        val cutoff = System.currentTimeMillis() - LOCKOUT_WINDOW_MS
        while (failedAttempts.isNotEmpty() && failedAttempts.first() < cutoff) failedAttempts.removeFirst()
        return failedAttempts.size >= MAX_FAILED_ATTEMPTS
    }

    @Synchronized
    private fun recordFailure() {
        failedAttempts.addLast(System.currentTimeMillis())
    }

    private fun html(body: String) = newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", body)
    private fun json(body: JSONObject) =
        newFixedLengthResponse(Response.Status.OK, "application/json", body.toString()).apply {
            addHeader("Cache-Control", "no-store")
        }
    private fun text(status: Response.Status, body: String) =
        newFixedLengthResponse(status, "text/plain; charset=utf-8", body)
    private fun redirect(to: String) =
        newFixedLengthResponse(Response.Status.REDIRECT_SEE_OTHER, "text/plain", "").apply {
            addHeader("Location", to)
        }

    /** Endless multipart stream of JPEG frames; closing it (viewer left) stops the encoding. */
    private inner class MjpegStream : InputStream() {
        private var buffer: ByteArray = ByteArray(0)
        private var pos = 0
        private var sequence = 0L
        @Volatile
        private var closed = false

        init {
            frames.addViewer()
        }

        override fun read(): Int {
            val one = ByteArray(1)
            return if (read(one, 0, 1) == -1) -1 else one[0].toInt() and 0xFF
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            while (pos >= buffer.size) {
                if (closed || stopped) return -1
                val frame = frames.awaitFrame(sequence, 5_000) ?: continue
                sequence = frame.sequence
                val header = "--$BOUNDARY\r\nContent-Type: image/jpeg\r\n" +
                    "Content-Length: ${frame.jpeg.size}\r\n\r\n"
                buffer = header.toByteArray() + frame.jpeg + "\r\n".toByteArray()
                pos = 0
            }
            val n = minOf(len, buffer.size - pos)
            System.arraycopy(buffer, pos, b, off, n)
            pos += n
            return n
        }

        override fun close() {
            if (!closed) {
                closed = true
                frames.removeViewer()
            }
        }
    }

    /** FileInputStream that also closes the ParcelFileDescriptor it reads from. */
    private class ParcelFileInputStream(
        private val pfd: android.os.ParcelFileDescriptor,
    ) : FileInputStream(pfd.fileDescriptor) {
        override fun close() {
            try {
                super.close()
            } finally {
                pfd.close()
            }
        }
    }

    companion object {
        const val PORT = 8080
        private const val TAG = "MotionCam"
        private const val COOKIE = "motioncam"
        private const val BOUNDARY = "motioncamframe"
        private const val MAX_CLIPS_LISTED = 200
        private const val MAX_FAILED_ATTEMPTS = 10
        private const val LOCKOUT_WINDOW_MS = 60_000L

        private val LOGIN_PAGE = """
            <!doctype html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>MotionCam</title>
            <style>
              body { font-family: system-ui, sans-serif; background: #111; color: #eee;
                     display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
              form { display: grid; gap: 12px; width: min(320px, 100%); }
              input, button { font-size: 20px; padding: 12px; border-radius: 8px; border: 1px solid #444; }
              input { background: #222; color: #eee; letter-spacing: 3px; text-transform: uppercase; }
              button { background: #e53935; color: white; border: none; }
              .error { color: #ff8a80; }
            </style></head><body>
            <form action="/login" method="get">
              <h1>MotionCam</h1>
              <label for="code">Access code shown in the app</label>
              <input id="code" name="code" autocomplete="off" autocapitalize="characters" required autofocus>
              <p class="error" id="wrong" hidden>That code didn't match.</p>
              <button type="submit">View camera</button>
            </form>
            <script>if (location.search.includes('wrong')) document.getElementById('wrong').hidden = false;</script>
            </body></html>
        """.trimIndent()

        /** This phone's address on the local network, if it has one. */
        fun localAddress(): String? = try {
            NetworkInterface.getNetworkInterfaces().toList()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { it.inetAddresses.toList() }
                .filterIsInstance<Inet4Address>()
                .firstOrNull { it.isSiteLocalAddress }
                ?.hostAddress
        } catch (e: Exception) {
            null
        }
    }
}
