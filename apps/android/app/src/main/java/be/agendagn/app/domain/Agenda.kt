package be.agendagn.app.domain

import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.model.Visibility
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/**
 * Règles d'affichage calculées sur le cache local (fonctionnent hors ligne).
 * Mêmes définitions que l'API (`tasks.service.ts`) : « en retard » = date passée et à faire, etc.
 */
object Agenda {
    private val hidden = setOf(OccurrenceStatus.CANCELLED, OccurrenceStatus.SKIPPED)

    /** Tri de l'API : date (sans date en dernier), heure (sans heure en dernier), puis titre. */
    val order: Comparator<Occurrence> = compareBy<Occurrence>(
        { it.date == null },
        { it.date },
        { it.startMinute == null },
        { it.startMinute },
        { it.title.lowercase() },
    )

    data class TodaySections(
        val overdue: List<Occurrence>,
        val today: List<Occurrence>,
        val upcoming: List<Occurrence>,
        val unscheduledCount: Int,
        /** Sans date, à faire d'ici dimanche. */
        val dueThisWeek: List<Occurrence> = emptyList(),
    ) {
        val todayDone: Int get() = today.count { it.isDone }
    }

    fun todaySections(all: List<Occurrence>, today: LocalDate, weekDays: Long = 7): TodaySections {
        val visible = all.filter { it.status !in hidden }
        return TodaySections(
            // En retard : date passée, ou échéance souple dépassée.
            overdue = visible.filter { it.status == OccurrenceStatus.TODO && isOverdue(it, today) }
                .sortedWith(order),
            today = visible.filter { it.date == today }.sortedWith(compareBy<Occurrence> { it.isDone }.then(order)),
            upcoming = visible.filter {
                it.status == OccurrenceStatus.TODO && it.date != null && it.date > today &&
                    it.date <= today.plusDays(weekDays)
            }.sortedWith(order),
            unscheduledCount = visible.count { it.status == OccurrenceStatus.TODO && it.date == null },
            dueThisWeek = visible.filter {
                it.status == OccurrenceStatus.TODO && it.date == null && it.dueDate != null &&
                    it.dueDate >= today && it.dueDate <= endOfWeek(today)
            }.sortedBy { it.dueDate },
        )
    }

    fun isOverdue(o: Occurrence, today: LocalDate): Boolean =
        (o.date != null && o.date < today) || (o.date == null && o.dueDate != null && o.dueDate < today)

    /** Dimanche de la semaine (« cette semaine »). */
    fun endOfWeek(date: LocalDate): LocalDate = date.plusDays((7 - date.dayOfWeek.value).toLong())

    fun endOfMonth(date: LocalDate): LocalDate = date.withDayOfMonth(date.lengthOfMonth())

    /** Reporter « ce week-end » : samedi qui vient ; samedi → dimanche ; dimanche → samedi suivant. */
    fun postponeWeekend(today: LocalDate): LocalDate = when (today.dayOfWeek.value) {
        6 -> today.plusDays(1)
        7 -> today.plusDays(6)
        else -> today.plusDays((6 - today.dayOfWeek.value).toLong())
    }

    enum class View { TODO, UPCOMING, UNSCHEDULED, DONE }

    enum class Who { EVERYONE, ME }

    data class Filter(val view: View = View.TODO, val who: Who = Who.EVERYONE, val query: String = "")

    fun filter(all: List<Occurrence>, filter: Filter, today: LocalDate, myMemberId: String?): List<Occurrence> {
        val q = filter.query.trim().lowercase()
        return all.asSequence()
            .filter { it.status !in hidden }
            .filter {
                when (filter.view) {
                    // « À faire » : en retard, aujourd'hui et sans date.
                    View.TODO -> it.status == OccurrenceStatus.TODO && (it.date == null || it.date <= today)
                    View.UPCOMING -> it.status == OccurrenceStatus.TODO && it.date != null && it.date > today
                    View.UNSCHEDULED -> it.status == OccurrenceStatus.TODO && it.date == null
                    View.DONE -> it.isDone
                }
            }
            .filter { filter.who == Who.EVERYONE || (myMemberId != null && myMemberId in it.assigneeIds) }
            .filter { q.isEmpty() || it.title.lowercase().contains(q) || it.notes?.lowercase()?.contains(q) == true }
            .toList()
            .let { list ->
                if (filter.view == View.DONE) list.sortedByDescending { it.completedAt } else list.sortedWith(order)
            }
    }

    /** Occurrences d'un jour (vue calendrier), terminées en dernier. */
    fun onDay(all: List<Occurrence>, day: LocalDate): List<Occurrence> =
        all.filter { it.date == day && it.status !in hidden }.sortedWith(compareBy<Occurrence> { it.isDone }.then(order))

    /** Nombre de tâches à faire par jour (pastilles du calendrier mensuel). */
    fun countsByDay(all: List<Occurrence>): Map<LocalDate, Int> =
        all.filter { it.date != null && it.status == OccurrenceStatus.TODO }.groupingBy { it.date!! }.eachCount()

    data class Share(val count: Int, val minutes: Int)

    data class Balance(
        val from: LocalDate,
        val to: LocalDate,
        val members: List<Pair<Member, Share>>,
        val together: Share,
        val unassigned: Share,
    ) {
        val total: Int get() = members.sumOf { it.second.count } + together.count + unassigned.count
    }

    /** Répartition factuelle de la semaine (lundi → dimanche), tâches partagées uniquement, comme l'API. */
    fun weekBalance(all: List<Occurrence>, today: LocalDate, members: List<Member>): Balance {
        val from = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val to = from.plusDays(6)
        val rows = all.filter {
            it.visibility == Visibility.SHARED && it.status !in hidden && !it.isLocal &&
                it.date != null && it.date in from..to
        }
        fun share(list: List<Occurrence>) = Share(list.size, list.sumOf { it.durationMinutes ?: 0 })
        return Balance(
            from = from,
            to = to,
            members = members.map { m -> m to share(rows.filter { it.assigneeIds == listOf(m.id) }) },
            together = share(rows.filter { it.assigneeIds.size > 1 }),
            unassigned = share(rows.filter { it.assigneeIds.isEmpty() }),
        )
    }

    /**
     * Suggestion de répartition (même règle que le web, `packages/domain/src/balance.ts`) :
     * personne la moins chargée de la semaine, charge = minutes + 15 min par tâche ; égalité → aucune.
     */
    fun suggestAssignee(balance: Balance): Pair<Member, Share>? {
        if (balance.members.size < 2) return null
        fun load(s: Share) = s.minutes + s.count * 15
        val sorted = balance.members.sortedBy { load(it.second) }
        if (load(sorted[0].second) == load(sorted[1].second)) return null
        return sorted[0]
    }
}
