package be.agendagn.app.testing

import be.agendagn.app.domain.model.Category
import be.agendagn.app.domain.model.Household
import be.agendagn.app.domain.model.Member
import be.agendagn.app.domain.model.MemberColor
import be.agendagn.app.domain.model.Occurrence
import be.agendagn.app.domain.model.OccurrenceStatus
import be.agendagn.app.domain.model.Priority
import be.agendagn.app.domain.model.Visibility
import java.time.LocalDate

/** Jeu de données réaliste pour Grace & Nicolas (tests et captures d'écran). */
object Fixtures {
    const val GRACE = "11111111-1111-1111-1111-111111111111"
    const val NICOLAS = "22222222-2222-2222-2222-222222222222"
    const val HOUSEHOLD = "33333333-3333-3333-3333-333333333333"
    val TODAY: LocalDate = LocalDate.of(2026, 9, 29) // un mardi

    val grace = Member(GRACE, "u-grace", "Grace", MemberColor.SAGE)
    val nicolas = Member(NICOLAS, "u-nicolas", "Nicolas", MemberColor.OCEAN)
    val household = Household(HOUSEHOLD, "Grace & Nico", "Europe/Brussels", listOf(nicolas, grace))
    val cleaning = Category("c-cleaning", "Ménage", "🧹")
    val groceries = Category("c-groceries", "Courses", "🛒")

    fun occ(
        title: String,
        date: LocalDate? = TODAY,
        startMinute: Int? = null,
        assignees: List<String> = emptyList(),
        status: OccurrenceStatus = OccurrenceStatus.TODO,
        visibility: Visibility = Visibility.SHARED,
        duration: Int? = null,
        category: Category? = null,
        recurring: Boolean = false,
        priority: Priority = Priority.NORMAL,
        // Identifiant stable dérivé du titre : les tests peuvent reconstruire le jeu de données.
        id: String = "occ-" + title.lowercase().replace(Regex("[^a-z0-9]+"), "-"),
    ) = Occurrence(
        id = id, taskId = "task-$id", title = title, notes = null, category = category, priority = priority,
        visibility = visibility, status = status, date = date, startMinute = startMinute, durationMinutes = duration,
        assigneeIds = assignees, createdById = GRACE, isRecurring = recurring, syncToCalendar = false,
        calendarSync = null, completedAt = null, version = 1,
    )

    /** Une semaine type du foyer. */
    fun week(): List<Occurrence> = listOf(
        occ("Sortir les poubelles", TODAY, 20 * 60, listOf(NICOLAS), recurring = true, duration = 10),
        occ("Nettoyer la salle de bain", TODAY, 10 * 60, listOf(GRACE), duration = 45, category = cleaning, recurring = true),
        occ("Arroser les plantes", TODAY, assignees = listOf(GRACE), status = OccurrenceStatus.DONE),
        occ("Courses de la semaine", TODAY.plusDays(2), 18 * 60, listOf(GRACE, NICOLAS), duration = 60, category = groceries),
        occ("Payer l'assurance auto", TODAY.minusDays(2), priority = Priority.HIGH, assignees = listOf(NICOLAS)),
        occ("Changer les draps", TODAY.plusDays(4), duration = 30),
        occ("Appeler le plombier", null),
        occ("Rendez-vous dentiste", TODAY.plusDays(1), 9 * 60, listOf(GRACE), visibility = Visibility.PERSONAL),
    )
}
