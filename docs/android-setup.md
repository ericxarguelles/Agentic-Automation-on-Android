# Android development setup

## Current milestone

The Android source includes a setup screen and a status-only accessibility service. It does not yet connect to a server, capture screens, or perform actions.

The initial minimum is Android 13 (API 33), matching the S23 generation's original Android version. This is an OS minimum, not a restriction to Samsung hardware. Real-device compatibility still needs testing.

## Required tools

1. Install Android Studio from https://developer.android.com/studio.
2. Let its setup wizard install the Android SDK.
3. In SDK Manager, install Android SDK Platform 35.
4. Use JDK 17 for this project's Gradle runtime.

The pinned build uses Android Gradle Plugin 8.9.2, Kotlin 2.1.20, and Gradle 8.11.1. A Gradle wrapper has not yet been generated. Once Gradle 8.11.1 and Java are available, run the following in the `android` directory:

```powershell
gradle wrapper --gradle-version 8.11.1 --distribution-type bin
.\gradlew.bat assembleDebug
```

Open the `android` folder as the project in Android Studio. Do not create a separate project over these files.

## First device check

1. Build and install the debug app using Android Studio's Run button. Initial installation can use USB or paired wireless debugging.
2. Open Android Phone Control.
3. Read the access explanation, then open accessibility settings.
4. Find Android Phone Control under installed accessibility apps and enable it if you want to grant access. Android may require allowing restricted settings for a sideloaded app.
5. Return to the app and check that its service status is enabled.
6. Tap Turn off companion service and confirm it returns to off.

The app does not request network access at this milestone. No phone control or ChatGPT integration is implemented yet.

## Verification status

Source and XML structure can be checked locally. Compilation and the device checks above require the Android development tools and a real phone. They have not yet been completed.
