package com.gruahub.shared.infra;

import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

@ApplicationScoped
public class ProductionSafetyGuard {

    private static final Logger LOG = Logger.getLogger(ProductionSafetyGuard.class);

    @ConfigProperty(name = "gruahub.prod.enforce-safety", defaultValue = "false")
    boolean enforceSafety;

    @ConfigProperty(name = "gruahub.sandbox.enabled", defaultValue = "false")
    boolean sandboxEnabled;

    @ConfigProperty(name = "gruahub.payment.provider", defaultValue = "sandbox")
    String paymentProvider;

    @ConfigProperty(name = "gruahub.prod.allow-sandbox", defaultValue = "false")
    boolean allowSandboxInProd;

    void onStart(@Observes StartupEvent event) {
        if (!enforceSafety) {
            return;
        }
        String violation = validateProdConfig(sandboxEnabled, paymentProvider, allowSandboxInProd);
        if (violation != null) {
            throw new IllegalStateException(violation);
        }
        if (allowSandboxInProd) {
            LOG.warn("Production safety enabled with gruahub.prod.allow-sandbox=true — sandbox surfaces may be exposed");
            return;
        }
        LOG.info("Production safety checks passed (sandbox disabled, non-sandbox payment provider)");
    }

    public static String validateProdConfig(boolean sandboxEnabled, String paymentProvider, boolean allowSandboxInProd) {
        if (allowSandboxInProd) {
            return null;
        }
        if (sandboxEnabled) {
            return "Refusing to start: gruahub.sandbox.enabled=true with production safety enabled. "
                    + "Set GRUAHUB_SANDBOX_ENABLED=false or gruahub.prod.allow-sandbox=true.";
        }
        String provider = paymentProvider == null ? "" : paymentProvider.trim();
        if ("sandbox".equalsIgnoreCase(provider)) {
            return "Refusing to start: gruahub.payment.provider=sandbox with production safety enabled. "
                    + "Configure a real provider or set gruahub.prod.allow-sandbox=true.";
        }
        return null;
    }
}
