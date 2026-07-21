package com.gruahub.shared;

import com.gruahub.shared.infra.ProductionSafetyGuard;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class ProductionSafetyGuardTest {

    @Test
    void blocksSandboxFlagInProduction() {
        assertNotNull(ProductionSafetyGuard.validateProdConfig(true, "mercadopago", false));
    }

    @Test
    void blocksSandboxPaymentProviderInProduction() {
        assertNotNull(ProductionSafetyGuard.validateProdConfig(false, "sandbox", false));
    }

    @Test
    void allowsRealProviderWhenSandboxOff() {
        assertNull(ProductionSafetyGuard.validateProdConfig(false, "mercadopago", false));
    }

    @Test
    void allowlistBypassesChecks() {
        assertNull(ProductionSafetyGuard.validateProdConfig(true, "sandbox", true));
    }
}
