# kotlinx.serialization : conserver les serializers générés des DTO.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers @kotlinx.serialization.Serializable class be.agendagn.app.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
# Retrofit : conserver les interfaces d'API et les signatures génériques.
-keepattributes Signature, Exceptions
-keep,allowobfuscation interface be.agendagn.app.data.remote.** { *; }
