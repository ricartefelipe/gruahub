package com.gruahub.iot.application;

import com.gruahub.iot.domain.ControllerAdapter;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@ApplicationScoped
public class ControllerAdapterRegistry {

    private static final Logger LOG = Logger.getLogger(ControllerAdapterRegistry.class);

    private final Map<String, ControllerAdapter> byKey = new ConcurrentHashMap<>();

    @ConfigProperty(name = "gruahub.iot.default-adapter", defaultValue = "generic")
    String defaultAdapterKey;

    @Inject
    EntityManager em;

    @Inject
    void register(Instance<ControllerAdapter> adapters) {
        for (ControllerAdapter adapter : adapters) {
            byKey.put(normalize(adapter.adapterKey()), adapter);
        }
    }

    public ControllerAdapter requireDefault() {
        ControllerAdapter adapter = byKey.get(normalize(defaultAdapterKey));
        if (adapter == null) {
            throw new IllegalStateException(
                    "Default controller adapter not registered: " + defaultAdapterKey);
        }
        return adapter;
    }

    public ControllerAdapter require(String adapterKey) {
        ControllerAdapter adapter = byKey.get(normalize(adapterKey));
        if (adapter != null) {
            return adapter;
        }
        LOG.warnf("Unknown controller adapter '%s' — falling back to %s",
                adapterKey, defaultAdapterKey);
        return requireDefault();
    }

    public ControllerAdapter forMachine(UUID tenantId, UUID machineId) {
        Object modelType = em.createNativeQuery(
                "SELECT c.model_type FROM machine m " +
                "JOIN controller c ON c.id = m.controller_id AND c.tenant_id = m.tenant_id " +
                "WHERE m.id = :mid AND m.tenant_id = :tid"
        )
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        if (modelType == null || modelType.toString().isBlank()) {
            return requireDefault();
        }
        return require(modelType.toString());
    }

    private static String normalize(String key) {
        return key == null ? "" : key.trim().toLowerCase(Locale.ROOT);
    }
}
