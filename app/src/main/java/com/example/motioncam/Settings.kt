package com.example.motioncam

import android.content.Context
import java.security.SecureRandom

/** User settings shared by the screen and the camera service. */
class Settings(context: Context) {

    private val prefs = context.getSharedPreferences("motioncam", Context.MODE_PRIVATE)

    var sensitivity: Int
        get() = prefs.getInt(KEY_SENSITIVITY, 80)
        set(value) = prefs.edit().putInt(KEY_SENSITIVITY, value).apply()

    var alertsEnabled: Boolean
        get() = prefs.getBoolean(KEY_ALERTS, true)
        set(value) = prefs.edit().putBoolean(KEY_ALERTS, value).apply()

    var nightModeEnabled: Boolean
        get() = prefs.getBoolean(KEY_NIGHT, true)
        set(value) = prefs.edit().putBoolean(KEY_NIGHT, value).apply()

    var remoteViewingEnabled: Boolean
        get() = prefs.getBoolean(KEY_REMOTE, false)
        set(value) = prefs.edit().putBoolean(KEY_REMOTE, value).apply()

    /** Cells of the [MotionZones] grid to ignore, row by row, in screen orientation. */
    var ignoredZones: BooleanArray
        get() {
            val saved = prefs.getString(KEY_ZONES, null)
            return BooleanArray(MotionZones.CELLS) { saved != null && saved.getOrNull(it) == '1' }
        }
        set(value) = prefs.edit()
            .putString(KEY_ZONES, value.joinToString("") { if (it) "1" else "0" })
            .apply()

    /** Code a browser must enter to use remote viewing. Created on first use. */
    val accessCode: String
        get() = prefs.getString(KEY_ACCESS_CODE, null) ?: newAccessCode()

    fun newAccessCode(): String {
        val random = SecureRandom()
        // No 0/O or 1/I so the code is easy to read off the screen.
        val code = String(CharArray(ACCESS_CODE_LENGTH) { CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)] })
        prefs.edit().putString(KEY_ACCESS_CODE, code).apply()
        return code
    }

    /** Sensitivity 0..100 -> changed-area threshold from 10% down to 0.2% of the watched area. */
    fun threshold(): Float = thresholdFor(sensitivity)

    companion object {
        private const val KEY_SENSITIVITY = "sensitivity"
        private const val KEY_ALERTS = "alerts"
        private const val KEY_NIGHT = "night_mode"
        private const val KEY_REMOTE = "remote_viewing"
        private const val KEY_ZONES = "ignored_zones"
        private const val KEY_ACCESS_CODE = "access_code"
        private const val ACCESS_CODE_LENGTH = 8
        private const val CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

        fun thresholdFor(sensitivity: Int): Float = 0.002f + 0.098f * (1f - sensitivity / 100f)
    }
}
