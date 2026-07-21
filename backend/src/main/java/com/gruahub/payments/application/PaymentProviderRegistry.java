package com.gruahub.payments.application;

import com.gruahub.payments.domain.PaymentProvider;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@ApplicationScoped
public class PaymentProviderRegistry {

    private final Map<String, PaymentProvider> byName = new ConcurrentHashMap<>();

    @ConfigProperty(name = "gruahub.payment.provider", defaultValue = "sandbox")
    String defaultProviderName;

    @Inject
    void register(Instance<PaymentProvider> providers) {
        for (PaymentProvider provider : providers) {
            byName.put(normalize(provider.providerName()), provider);
        }
    }

    public PaymentProvider requireDefault() {
        return require(defaultProviderName);
    }

    public PaymentProvider require(String providerName) {
        PaymentProvider provider = byName.get(normalize(providerName));
        if (provider == null) {
            throw new IllegalArgumentException("Unknown payment provider: " + providerName);
        }
        return provider;
    }

    public String defaultProviderName() {
        return normalize(defaultProviderName);
    }

    private static String normalize(String name) {
        return name == null ? "" : name.trim().toLowerCase(Locale.ROOT);
    }
}
