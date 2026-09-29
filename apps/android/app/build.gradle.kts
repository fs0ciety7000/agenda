plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

android {
    // Google Play : toutes les langues dans l'app installée, pour pouvoir changer de langue
    // dans les Réglages sans téléchargement (les textes pèsent quelques Ko).
    bundle {
        language { enableSplit = false }
    }
    namespace = "app.tandem.foyer"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.tandem.foyer"
        minSdk = 26
        targetSdk = 36
        // Numéro croissant fourni par la CI (android-release.yml) : indispensable aux mises à jour.
        versionCode = providers.gradleProperty("tandem.versionCode").orNull?.toInt() ?: 2
        versionName = providers.gradleProperty("tandem.versionName").orNull ?: "0.2.0"
        // Manifeste de mise à jour (version.json de la release) ; vide = pas de mise à jour auto.
        buildConfigField("String", "UPDATE_MANIFEST_URL", "\"${providers.gradleProperty("tandem.updateUrl").getOrElse("")}\"")
        // Notifications instantanées (Firebase, docs/android.md) : identifiants publics du projet,
        // fournis par la CI (variables du dépôt). Vides = désactivées.
        for ((field, prop) in listOf(
            "FCM_APP_ID" to "tandem.fcm.appId",
            "FCM_API_KEY" to "tandem.fcm.apiKey",
            "FCM_PROJECT_ID" to "tandem.fcm.projectId",
            "FCM_SENDER_ID" to "tandem.fcm.senderId",
        )) {
            buildConfigField("String", field, "\"${providers.gradleProperty(prop).getOrElse("")}\"")
        }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        // Clé de publication (docs/android.md) : jamais dans le dépôt, passée en propriétés Gradle.
        create("release") {
            providers.gradleProperty("tandem.keystore").orNull?.let { path ->
                storeFile = file(path)
                storePassword = providers.gradleProperty("tandem.keystorePassword").get()
                keyAlias = providers.gradleProperty("tandem.keyAlias").get()
                keyPassword = providers.gradleProperty("tandem.keyPassword").get()
            }
        }
    }

    buildTypes {
        debug {
            // 10.0.2.2 = machine hôte depuis l'émulateur Android.
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:4000/\"")
            // Pages web ouvertes depuis l'app (inscription, mot de passe oublié, Google Calendar).
            buildConfigField("String", "WEB_BASE_URL", "\"http://10.0.2.2:3000/\"")
        }
        release {
            signingConfig = when {
                providers.gradleProperty("tandem.keystore").isPresent -> signingConfigs.getByName("release")
                else -> null
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"${providers.gradleProperty("tandem.apiBaseUrl").getOrElse("https://api.example.invalid/")}\"",
            )
            // Même domaine que l'API (le web proxifie /v1/*) sauf indication contraire.
            buildConfigField(
                "String",
                "WEB_BASE_URL",
                "\"${providers.gradleProperty("tandem.webBaseUrl").orElse(providers.gradleProperty("tandem.apiBaseUrl")).getOrElse("https://api.example.invalid/")}\"",
            )
        }
        // Google Play (docs/play-store.md) : même build que la release, sans la mise à jour
        // automatique (interdite hors Play Store) ni la permission d'installer des APK.
        create("play") {
            initWith(getByName("release"))
            matchingFallbacks += "release"
            buildConfigField("String", "UPDATE_MANIFEST_URL", "\"\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    lint {
        // Versions épinglées volontairement (docs/architecture.md §12) : montées en PR dédiées.
        disable += setOf("GradleDependency", "AndroidGradlePluginVersion", "NewerVersionAvailable")
        abortOnError = true
    }
    // Schémas Room exportés, lus par le test de migration (MigrationTestHelper). Robolectric ne voit
    // que les assets de la variante testée : ajoutés à la variante debug seulement (pas à la release).
    sourceSets.getByName("debug").assets.srcDir("$projectDir/schemas")
    // Tests sur émulateur (MigrationTestHelper lit les schémas dans l'APK de test).
    sourceSets.getByName("androidTest").assets.srcDir("$projectDir/schemas")

    testOptions {
        unitTests.isReturnDefaultValues = true
        // Robolectric : tests Compose et Room sur la JVM (pas d'émulateur requis en CI).
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.systemProperty("robolectric.pixelCopyRenderMode", "hardware")
            // Captures d'écran (docs/screenshots) : ./gradlew testDebugUnitTest -Pscreenshots
            if (project.hasProperty("screenshots")) it.systemProperty("roborazzi.test.record", "true")
            // Test contre une vraie API locale : ./gradlew testDebugUnitTest -PliveApi=http://localhost:4000/
            project.findProperty("liveApi")?.let { url -> it.systemProperty("tandem.liveApi", url) }
        }
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.compose.material.icons.core)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.glance.appwidget)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    implementation(libs.androidx.glance.material3)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.junit)
    testImplementation(libs.androidx.work.testing)
    testImplementation(libs.androidx.glance.testing)
    testImplementation(libs.androidx.room.testing)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.room.testing)
    androidTestImplementation(libs.kotlinx.coroutines.test)
}
