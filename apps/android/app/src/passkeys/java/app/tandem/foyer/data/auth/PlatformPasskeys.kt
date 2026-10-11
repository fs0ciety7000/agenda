package app.tandem.foyer.data.auth

import android.content.Context
import android.os.Build
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.exceptions.domerrors.InvalidStateError
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import app.tandem.foyer.domain.repository.PasskeyOutcome

/** Passkeys du système, à partir d'Android 9 (avant : pas de passkey, bouton masqué). */
fun platformPasskeys(): PasskeyAuthenticator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) CredentialManagerPasskeys else null

private object CredentialManagerPasskeys : PasskeyAuthenticator {
    override suspend fun authenticate(context: Context, optionsJson: String): PasskeyOutcome = try {
        val result = CredentialManager.create(context).getCredential(
            context,
            GetCredentialRequest(listOf(GetPublicKeyCredentialOption(optionsJson))),
        )
        when (val credential = result.credential) {
            is PublicKeyCredential -> PasskeyOutcome.Done(credential.authenticationResponseJson)
            else -> PasskeyOutcome.Failed
        }
    } catch (_: GetCredentialCancellationException) {
        PasskeyOutcome.Cancelled
    } catch (_: NoCredentialException) {
        PasskeyOutcome.NoPasskey
    } catch (_: GetCredentialException) {
        PasskeyOutcome.Failed
    }

    override suspend fun register(context: Context, optionsJson: String): PasskeyOutcome = try {
        val response = CredentialManager.create(context).createCredential(
            context,
            CreatePublicKeyCredentialRequest(optionsJson),
        )
        when (response) {
            is CreatePublicKeyCredentialResponse -> PasskeyOutcome.Done(response.registrationResponseJson)
            else -> PasskeyOutcome.Failed
        }
    } catch (_: CreateCredentialCancellationException) {
        PasskeyOutcome.Cancelled
    } catch (e: CreatePublicKeyCredentialDomException) {
        // Le téléphone a déjà une passkey de ce compte (liste d'exclusion du serveur).
        if (e.domError is InvalidStateError) PasskeyOutcome.AlreadyExists else PasskeyOutcome.Failed
    } catch (_: CreateCredentialException) {
        PasskeyOutcome.Failed
    }
}
