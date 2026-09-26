package be.agendagn.app.ui.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import be.agendagn.app.R
import be.agendagn.app.domain.model.User
import be.agendagn.app.domain.repository.AuthRepository
import kotlinx.coroutines.launch

/** Écran « Aujourd'hui » (squelette Phase 1 ; tâches en Phase 5). */
@Composable
fun TodayScreen(authRepository: AuthRepository) {
    var user by remember { mutableStateOf<User?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { user = authRepository.currentUser() }

    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(horizontal = 20.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Text(
            text = stringResource(R.string.greeting, user?.displayName ?: ""),
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            stringResource(R.string.today).uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedCard(Modifier.fillMaxWidth()) {
            Column(
                Modifier.fillMaxWidth().padding(vertical = 40.dp, horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(stringResource(R.string.today_empty_title), style = MaterialTheme.typography.titleMedium)
                Text(
                    stringResource(R.string.today_empty_body),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        TextButton(onClick = { scope.launch { authRepository.logout() } }) {
            Text(stringResource(R.string.sign_out))
        }
    }
}
