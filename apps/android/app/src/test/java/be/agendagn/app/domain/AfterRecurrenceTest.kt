package be.agendagn.app.domain

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.LocalDate

/** Répétition « après la dernière fois » : format du contrat et relecture d'une série. */
class AfterRecurrenceTest {
    private val date = LocalDate.parse("2026-09-27")

    @Test
    fun `règle AFTER sans nombre de fois ni rotation par semaine`() {
        val spec = RecurrenceSpec(
            preset = RepeatPreset.AFTER, interval = 3, unit = RepeatUnit.WEEK,
            end = RepeatEnd.COUNT, perWeek = true,
        )
        val json = Recurrences.toJson(spec, date, emptyList(), emptyList(), personal = false)!!
        val rule = json.getValue("rule").jsonObject
        assertEquals("AFTER", rule.getValue("freq").jsonPrimitive.content)
        assertEquals(3, rule.getValue("interval").jsonPrimitive.int)
        assertEquals("WEEK", rule.getValue("unit").jsonPrimitive.content)
        assertFalse(json.containsKey("count"))
        assertEquals(JsonPrimitive("PER_OCCURRENCE"), json["advance"])
    }

    @Test
    fun `série AFTER relue dans le formulaire`() {
        val series = SeriesInfo(
            id = "s", startDate = date, untilDate = null, count = null,
            rule = buildJsonObject { put("freq", "AFTER"); put("interval", 2); put("unit", "MONTH") },
            rotation = buildJsonObject { put("mode", "UNASSIGNED") },
            advance = "PER_OCCURRENCE",
        )
        val (spec, _) = Recurrences.fromSeries(series, emptyList())
        assertEquals(RepeatPreset.AFTER, spec.preset)
        assertEquals(2, spec.interval)
        assertEquals(RepeatUnit.MONTH, spec.unit)
    }
}
