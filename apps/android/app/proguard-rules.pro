# kotlinx.serialization : conserver les serializers générés des DTO.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers @kotlinx.serialization.Serializable class app.tandem.foyer.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
# Retrofit : conserver les interfaces d'API et les signatures génériques.
-keepattributes Signature, Exceptions
-keep,allowobfuscation interface app.tandem.foyer.data.remote.** { *; }
