package app.tandem.foyer.ui.login

import app.tandem.foyer.domain.model.User
import app.tandem.foyer.domain.repository.AuthError
import app.tandem.foyer.domain.repository.AuthRepository
import app.tandem.foyer.domain.repository.AuthResult
import app.tandem.foyer.domain.repository.PasskeyOutcome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    private class FakeAuthRepository(var result: AuthResult) : AuthRepository {
        var calls = 0
        override val isSignedIn = MutableStateFlow(false)
        override suspend fun login(email: String, password: String): AuthResult {
            calls++
            return result
        }
        override suspend fun currentUser(): User? = null
        override suspend fun logout() = Unit
        var googleResult: AuthResult = AuthResult.Failure(AuthError.GOOGLE_FAILED)
        var googleCalls = mutableListOf<Pair<String?, String?>>()
        override suspend fun googleAvailable() = true
        override suspend fun googleSignInUrl(webBaseUrl: String) = "${webBaseUrl}v1/auth/google/start"
        override suspend fun completeGoogleSignIn(code: String?, error: String?): AuthResult {
            googleCalls += code to error
            return googleResult
        }
        var codes = mutableListOf<Pair<String, String>>()
        override suspend fun completeTwoFactor(challengeId: String, code: String): AuthResult {
            codes += challengeId to code
            return if (code == "123456") AuthResult.Success(User("1", "emma@example.be", "Emma"))
            else AuthResult.Failure(AuthError.TWO_FACTOR_INVALID)
        }
        override suspend fun passkeysAvailable() = true
        override suspend fun loginWithPasskey(sign: suspend (optionsJson: String) -> PasskeyOutcome): AuthResult =
            when (sign("{\"challenge\":\"abc\"}")) {
                is PasskeyOutcome.Done -> AuthResult.Success(User("1", "emma@example.be", "Emma"))
                PasskeyOutcome.Cancelled -> AuthResult.Failure(AuthError.PASSKEY_CANCELLED)
                else -> AuthResult.Failure(AuthError.NO_PASSKEY)
            }
    }

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `ne soumet pas un formulaire incomplet`() = runTest(dispatcher) {
        val repo = FakeAuthRepository(AuthResult.Failure(AuthError.UNKNOWN))
        val vm = LoginViewModel(repo)
        vm.onEmailChange("grace@example.be")
        vm.submit()
        advanceUntilIdle()
        assertEquals(0, repo.calls)
        assertFalse(vm.state.value.canSubmit)
    }

    @Test
    fun `connexion reussie`() = runTest(dispatcher) {
        val vm = LoginViewModel(FakeAuthRepository(AuthResult.Success(User("1", "grace@example.be", "Grace"))))
        vm.onEmailChange("grace@example.be")
        vm.onPasswordChange("correct horse battery")
        vm.submit()
        assertTrue(vm.state.value.isSubmitting)
        advanceUntilIdle()
        assertTrue(vm.state.value.signedIn)
        assertFalse(vm.state.value.isSubmitting)
    }

    @Test
    fun `identifiants invalides puis correction efface l erreur`() = runTest(dispatcher) {
        val vm = LoginViewModel(FakeAuthRepository(AuthResult.Failure(AuthError.INVALID_CREDENTIALS)))
        vm.onEmailChange("grace@example.be")
        vm.onPasswordChange("wrong")
        vm.submit()
        advanceUntilIdle()
        assertEquals(AuthError.INVALID_CREDENTIALS, vm.state.value.error)
        vm.onPasswordChange("wrong2")
        assertNull(vm.state.value.error)
    }

    @Test
    fun `retour Google - succes connecte, erreur affichee`() = runTest(dispatcher) {
        val repo = FakeAuthRepository(AuthResult.Failure(AuthError.UNKNOWN))
        val vm = LoginViewModel(repo)
        advanceUntilIdle()
        assertTrue(vm.state.value.googleAvailable)

        repo.googleResult = AuthResult.Failure(AuthError.GOOGLE_EMAIL_EXISTS)
        vm.onGoogleCallback(null, "GOOGLE_EMAIL_EXISTS")
        advanceUntilIdle()
        assertEquals(AuthError.GOOGLE_EMAIL_EXISTS, vm.state.value.error)
        assertFalse(vm.state.value.signedIn)

        repo.googleResult = AuthResult.Success(User("1", "grace@example.be", "Grace"))
        vm.onGoogleCallback("code", null)
        advanceUntilIdle()
        assertTrue(vm.state.value.signedIn)
        assertEquals(listOf<Pair<String?, String?>>(null to "GOOGLE_EMAIL_EXISTS", "code" to null), repo.googleCalls)
    }

    @Test
    fun `passkey - connexion, fenetre fermee sans message, aucune passkey`() = runTest(dispatcher) {
        val vm = LoginViewModel(FakeAuthRepository(AuthResult.Failure(AuthError.UNKNOWN)))
        advanceUntilIdle()
        assertTrue(vm.state.value.passkeysAvailable)

        vm.signInWithPasskey { PasskeyOutcome.Cancelled }
        advanceUntilIdle()
        assertNull(vm.state.value.error)
        assertFalse(vm.state.value.signedIn)

        vm.signInWithPasskey { PasskeyOutcome.NoPasskey }
        advanceUntilIdle()
        assertEquals(AuthError.NO_PASSKEY, vm.state.value.error)

        var options: String? = null
        vm.signInWithPasskey { options = it; PasskeyOutcome.Done("{}") }
        advanceUntilIdle()
        assertEquals("{\"challenge\":\"abc\"}", options)
        assertTrue(vm.state.value.signedIn)
        assertFalse(vm.state.value.isSubmitting)
    }

    @Test
    fun `double authentification - code demande apres le mot de passe`() = runTest(dispatcher) {
        val repo = FakeAuthRepository(AuthResult.TwoFactorRequired("ch1"))
        val vm = LoginViewModel(repo)
        vm.onEmailChange("emma@example.be")
        vm.onPasswordChange("correct horse battery")
        vm.submit()
        advanceUntilIdle()
        assertEquals("ch1", vm.state.value.twoFactorChallenge)
        assertFalse(vm.state.value.signedIn)
        assertFalse(vm.state.value.canSubmitCode)

        vm.onTwoFactorCodeChange("000000")
        vm.submitTwoFactor()
        advanceUntilIdle()
        assertEquals(AuthError.TWO_FACTOR_INVALID, vm.state.value.error)

        vm.onTwoFactorCodeChange("123456")
        assertNull(vm.state.value.error)
        vm.submitTwoFactor()
        advanceUntilIdle()
        assertTrue(vm.state.value.signedIn)
        assertEquals(listOf("ch1" to "000000", "ch1" to "123456"), repo.codes)

        vm.restartSignIn()
        assertNull(vm.state.value.twoFactorChallenge)
    }
}
