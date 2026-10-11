package app.tandem.foyer.data.auth

import android.content.Context
import app.tandem.foyer.domain.repository.PasskeyOutcome

/**
 * Passkeys du téléphone (Credential Manager d'Android, gestionnaire de mots de passe Google ou
 * autre) : reçoit les options WebAuthn du serveur, rend la réponse JSON à lui renvoyer. Le domaine
 * des clés est celui du site ; Android vérifie que l'app y est associée (assetlinks.json).
 */
interface PasskeyAuthenticator {
    /** Connexion : l'utilisateur choisit une passkey du compte, puis la déverrouille. */
    suspend fun authenticate(context: Context, optionsJson: String): PasskeyOutcome

    /** Création, depuis les Réglages (compte connecté). */
    suspend fun register(context: Context, optionsJson: String): PasskeyOutcome
}
