# MotionCam

An Android security camera app that records a video clip when it sees motion.
Put a spare phone on a stand, open the app, tap **Arm**, and every time
something moves it saves a clip to **Movies/MotionCam** in the gallery.

## How it works

- **Motion detection** (`MotionDetector.kt`): every camera frame is shrunk to
  an 80×60 brightness grid and compared with the previous frame. If more than
  the threshold fraction of the grid changed, the frame counts as motion. Each
  frame is normalised by its average brightness, so auto-exposure and slow
  light changes aren't treated as motion.
- **Triggering** (`MainActivity.kt`): 3 motion frames in a row start a clip,
  so single noisy frames don't. The **Sensitivity** slider moves the threshold
  between 10% of the frame (low) and 0.2% (high).
- **Recording** (`MotionRecorder.kt`): CameraX records 720p video (or the
  closest quality available). Recording stops 10 s after the last motion, and
  clips are split every 5 minutes.

## Build and install

1. Open this folder in Android Studio (Ladybug or newer) and let it sync.
2. Plug in your phone with USB debugging on and press **Run**, or run
   `./gradlew installDebug`.

Requires Android 10 (API 29) or newer. Only the camera permission is needed.
Audio is not recorded.

## Current limits

- Only records while the app is on screen. The screen stays on while it runs.
  Recording with the screen off would need a foreground service.
- No notifications or remote viewing yet. Clips stay on the phone.

## Studying another app for ideas

To have its design analyzed, pull the APK from your phone with
[adb](https://developer.android.com/tools/adb):

```bash
adb shell pm list packages | grep -i <part-of-app-name>
adb shell pm path <package.name>      # may print several split APKs
adb pull <path-from-above> app-to-study.apk
```

APK files are ignored by git (see `.gitignore`), so they aren't committed by
accident.
