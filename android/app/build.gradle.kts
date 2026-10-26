plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.androidphonecontrol"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.androidphonecontrol"
        minSdk = 33
        targetSdk = 35
        versionCode = 12
        versionName = "0.8.1"
        testInstrumentationRunner = "com.androidphonecontrol.TaskUiSmokeTest"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies { testImplementation("junit:junit:4.13.2") }
