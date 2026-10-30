package app.tandem.foyer.ui.today

import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.tandem.foyer.R
import app.tandem.foyer.domain.ShoppingLive
import app.tandem.foyer.domain.model.Member
import app.tandem.foyer.ui.components.MemberAvatar
import app.tandem.foyer.ui.theme.Tokens
import java.time.Duration
import java.time.Instant

/** Au-delà, une barre continue plutôt qu'un segment par article. */
private const val MAX_SEGMENTS = 12

/** Qui fait les courses et où il en est, ou ce qu'il reste à acheter. Touchée : la liste. */
@Composable
fun ShoppingLiveCard(
    summary: ShoppingLive.Summary,
    members: Map<String, Member>,
    myMemberId: String?,
    now: Instant,
    onOpen: () -> Unit,
) {
    val shopper = summary.shopperId?.let { members[it] }
    val title = when {
        !summary.live -> stringResource(R.string.shopping_title)
        shopper != null && shopper.id != myMemberId -> stringResource(R.string.today_shopping_live, shopper.displayName)
        else -> stringResource(R.string.today_shopping_live_me)
    }
    val minutes = summary.lastDoneAt?.let { Duration.between(it, now).toMinutes().toInt().coerceAtLeast(0) } ?: 0
    val subtitle = if (summary.live) {
        if (minutes == 0) stringResource(R.string.today_shopping_live_now)
        else pluralStringResource(R.plurals.today_shopping_live_since, minutes, minutes)
    } else {
        pluralStringResource(R.plurals.today_shopping_to_buy, summary.toBuy, summary.toBuy)
    }
    val progress = pluralStringResource(R.plurals.today_shopping_progress, summary.total, summary.done, summary.total)
    Card(
        onClick = onOpen,
        shape = RoundedCornerShape(Tokens.Radius.lg),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
    ) {
        Column(
            Modifier.padding(16.dp).clearAndSetSemantics { contentDescription = "$title. $subtitle. $progress" },
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (shopper != null && summary.live) {
                    MemberAvatar(shopper, 44)
                } else {
                    Box(
                        Modifier.size(44.dp).background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Outlined.ShoppingCart, contentDescription = null) }
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    if (summary.live) {
                        val success = if (isSystemInDarkTheme()) Tokens.Dark.success else Tokens.Light.success
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(8.dp).background(success, CircleShape))
                            Text(subtitle, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = success)
                        }
                    } else {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Text(
                    buildAnnotatedString {
                        append(summary.done.toString())
                        withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Normal)) {
                            append(" / ${summary.total}")
                        }
                    },
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                val filled = MaterialTheme.colorScheme.onSurface
                val empty = MaterialTheme.colorScheme.outlineVariant
                if (summary.total <= MAX_SEGMENTS) {
                    repeat(summary.total) { i ->
                        Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(if (i < summary.done) filled else empty))
                    }
                } else {
                    Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(empty)) {
                        Box(Modifier.fillMaxWidth(summary.done.toFloat() / summary.total).fillMaxHeight().clip(CircleShape).background(filled))
                    }
                }
            }
        }
    }
}
