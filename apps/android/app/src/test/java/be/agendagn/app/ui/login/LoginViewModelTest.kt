package be.agendagn.app.ui.login

import be.agendagn.app.domain.model.User
import be.agendagn.app.domain.repository.AuthError
import be.agendagn.app.domain.repository.AuthRepository
import be.agendagn.app.domain.repository.AuthResult
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
}
