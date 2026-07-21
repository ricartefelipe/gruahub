package com.gruahub.iot;

import com.gruahub.iot.application.ControllerAdapterRegistry;
import com.gruahub.iot.domain.ControllerAdapter;
import com.gruahub.iot.infra.EletekControllerAdapter;
import com.gruahub.iot.infra.GenericMqttAdapter;
import com.gruahub.iot.infra.SegaControllerAdapter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Locale;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

class ControllerAdapterRegistryTest {

    private ControllerAdapterRegistry registry;
    private GenericMqttAdapter generic;
    private EletekControllerAdapter eletek;
    private SegaControllerAdapter sega;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() throws Exception {
        generic = new GenericMqttAdapter();
        eletek = new EletekControllerAdapter();
        sega = new SegaControllerAdapter();

        registry = new ControllerAdapterRegistry();
        setField(registry, "defaultAdapterKey", "generic");

        Map<String, ControllerAdapter> byKey =
                (Map<String, ControllerAdapter>) getField(registry, "byKey");
        byKey.put(normalize(generic.adapterKey()), generic);
        byKey.put(normalize(eletek.adapterKey()), eletek);
        byKey.put(normalize(sega.adapterKey()), sega);
        assertEquals(3, byKey.size());
    }

    @Test
    void resolvesKnownAdaptersByModelType() {
        assertSame(eletek, registry.require("ELETEK"));
        assertSame(sega, registry.require("sega"));
        assertSame(generic, registry.require("GENERIC"));
    }

    @Test
    void fallsBackToDefaultForUnknownModelType() {
        assertSame(generic, registry.require("UNKNOWN_VENDOR"));
    }

    private static String normalize(String key) {
        return key.trim().toLowerCase(Locale.ROOT);
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static Object getField(Object target, String name) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return field.get(target);
    }
}
