plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "cl.gastos.widget"
    compileSdk = 34

    defaultConfig {
        applicationId = "cl.gastos.widget"
        // 26 es Android 8. Por debajo no hay ni WebView moderno ni ganas.
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

/* Ni una dependencia.
 *
 * Todo lo que hace esta app —una WebView, un mapa de bits y un RemoteViews— está
 * en el propio Android desde hace diez años. Meter AppCompat o Glance para esto
 * sería arrastrar medio megabyte y un sistema de temas por cuatro pantallas de
 * texto. Es la misma regla que la PWA: mira si ya lo hace la plataforma. */
dependencies { }
