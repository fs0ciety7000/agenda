package app.tandem.foyer.data

import android.app.Activity
import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import java.util.Locale

/**
 * Langue de l'app choisie dans les Réglages : "" (celle du téléphone), "fr", "en" ou "nl".
 * Android 13+ : langue par application du système (aussi réglable dans les paramètres Android,
 * cf. res/xml/locales_config.xml). Avant : préférence locale appliquée à l'activité.
 */
object AppLanguage {
    const val SYSTEM = ""
    val SUPPORTED = listOf("fr", "en", "nl")
    private const val PREFS = "app_language"
    private const val KEY = "tag"

    fun current(context: Context): String =
        if (Build.VERSION.SDK_INT >= 33) {
            val locales = context.getSystemService(LocaleManager::class.java).applicationLocales
            if (locales.isEmpty) SYSTEM else locales[0].language.takeIf { it in SUPPORTED } ?: SYSTEM
        } else {
            prefs(context).getString(KEY, SYSTEM) ?: SYSTEM
        }

    /** Applique la langue ; l'activité est recréée dans la nouvelle langue. */
    fun set(activity: Activity, tag: String) {
        if (Build.VERSION.SDK_INT >= 33) {
            activity.getSystemService(LocaleManager::class.java).applicationLocales =
                if (tag == SYSTEM) LocaleList.getEmptyLocaleList() else LocaleList.forLanguageTags(tag)
        } else {
            prefs(activity).edit().putString(KEY, tag).apply()
            activity.recreate()
        }
    }

    /** Langue effective (« fr », « en » ou « nl ») : pour le compte (e-mails). */
    fun effective(context: Context): String = supportedOrEnglish(context.resources.configuration.locales[0].language)

    /** Langue prise en charge, sinon l'anglais (comme les ressources par défaut). */
    fun supportedOrEnglish(language: String): String = if (language in SUPPORTED) language else "en"

    /** Avant Android 13 : contexte de l'activité dans la langue choisie (attachBaseContext). */
    fun wrap(base: Context): Context {
        if (Build.VERSION.SDK_INT >= 33) return base
        val tag = prefs(base).getString(KEY, SYSTEM)
        if (tag.isNullOrEmpty()) return base
        val locale = Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        val config = Configuration(base.resources.configuration).apply { setLocale(locale) }
        return base.createConfigurationContext(config)
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
