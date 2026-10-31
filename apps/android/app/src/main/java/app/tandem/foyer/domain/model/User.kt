package app.tandem.foyer.domain.model

data class User(
    val id: String,
    val email: String,
    val displayName: String,
    /** Administrateur (ADMIN_EMAILS côté serveur). */
    val isAdmin: Boolean = false,
)
