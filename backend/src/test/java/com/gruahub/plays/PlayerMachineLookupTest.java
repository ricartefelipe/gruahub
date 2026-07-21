package com.gruahub.plays;

import com.gruahub.plays.application.PlayerMachineLookup;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PlayerMachineLookupTest {

    @Test
    void normalizesDeepLinkAndPlainTokens() {
        assertEquals(
                "66666666-0000-0000-0000-000000000001",
                PlayerMachineLookup.normalizeToken("gruahub://machine/66666666-0000-0000-0000-000000000001")
        );
        assertEquals("GH-MAQUINA-001", PlayerMachineLookup.normalizeToken(" GH-MAQUINA-001 "));
        assertEquals("MAQUINA-001", PlayerMachineLookup.normalizeToken("MAQUINA-001"));
    }

    @Test
    void normalizesPlayerStickerUrls() {
        assertEquals(
                "GH-MAQUINA-001",
                PlayerMachineLookup.normalizeToken("http://localhost:3000/play/GH-MAQUINA-001")
        );
        assertEquals(
                "GH-MAQUINA-002",
                PlayerMachineLookup.normalizeToken("https://play.gruahub.local/play/GH-MAQUINA-002?utm=sticker")
        );
    }
}
