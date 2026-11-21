package com.kairo.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class AlarmSchedulerUnitTest {

    @Test
    public void slotKeyExtraction_correctlyIdentifiesDeletedSlotKeys() {
        String oldJson = "[" +
                "{\"slotKey\":\"alarm:alarm-1:2026-03-31:07:30\",\"triggerAtMs\":1774942200000}," +
                "{\"slotKey\":\"alarm:alarm-2:2026-03-31:09:55\",\"triggerAtMs\":1774950900000}" +
                "]";

        // Item 1 retained, Item 2 deleted
        String newJson = "[" +
                "{\"slotKey\":\"alarm:alarm-1:2026-03-31:07:30\",\"triggerAtMs\":1774942200000}" +
                "]";

        Set<String> oldKeys = extractSlotKeys(oldJson);
        Set<String> newKeys = extractSlotKeys(newJson);

        assertEquals(2, oldKeys.size());
        assertEquals(1, newKeys.size());

        assertTrue(oldKeys.contains("alarm:alarm-2:2026-03-31:09:55"));
        assertFalse(newKeys.contains("alarm:alarm-2:2026-03-31:09:55"));
    }

    private Set<String> extractSlotKeys(String json) {
        Set<String> keys = new HashSet<>();
        if (json == null || json.isEmpty()) return keys;
        Pattern pattern = Pattern.compile("\"slotKey\"\\s*:\\s*\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(json);
        while (matcher.find()) {
            keys.add(matcher.group(1));
        }
        return keys;
    }
}
