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
- **Screen off** (`MotionCameraService.kt`): tapping **Arm** hands the camera
  to a foreground service, so you can lock the phone or switch apps and it keeps
  watching. A notification shows the status and the clip count, and has a
  **Disarm** button. While disarmed, the app shows its own preview so you can
  aim the phone.
- **Motion alerts**: each new clip posts a "Motion detected" notification.
  When the clip is saved, the notification gets a **Play clip** button.
- **Motion zones** (`ZoneOverlayView.kt`): tap **Zones**, then tap or drag
  across the 6×8 grid to ignore areas such as a tree, a TV or a busy street.
  Ignored cells are shaded; tap **Done** to finish.
- **Night mode**: once the picture has been dark for a while, the camera's
  exposure is raised to its maximum and the detector needs smaller brightness
  changes to count as motion. It switches back when it's bright again.
- **Wi-Fi viewer** (`ViewerServer.kt`, `assets/viewer.html`): turn on
  **View from another device on Wi-Fi**, arm the camera, then open the address
  shown in the app on any phone or computer on the same Wi-Fi and enter the
  access code. You get the live picture (about 5 frames a second), the clip
  list with playback, and a banner with optional sound and vibration whenever
  motion starts.

## Build and install

1. Open this folder in Android Studio (Ladybug or newer) and let it sync.
2. Plug in your phone with USB debugging on and press **Run**, or run
   `./gradlew installDebug`.

Requires Android 10 (API 29) or newer. It asks for camera access and, on
Android 13+, permission to show its status notification. Audio is not recorded.

Arm it while the app is open: Android only lets apps start using the camera
in the background if they start while on screen. Keep the phone charging, since
running the camera all night uses a lot of battery.

## Current limits

- The viewer only works on the same Wi-Fi, not over the internet; that would
  need a cloud service. It uses plain HTTP, so only use it on a network you
  trust. **New access code** locks out every browser that had the old one.
- Alerts appear on the camera phone itself. On another device, keep the viewer
  page open to get its alert banner and sound.
- The app is locked to portrait so the zone grid lines up with the picture.

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
