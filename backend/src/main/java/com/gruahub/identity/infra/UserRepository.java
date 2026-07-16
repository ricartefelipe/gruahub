package com.gruahub.identity.infra;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.EntityManager;
import jakarta.inject.Inject;

import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class UserRepository {

    @Inject
    EntityManager em;

    public Optional<String> findRoleByKeycloakId(String keycloakId, UUID tenantId) {
        var result = em.createNativeQuery(
                "SELECT role FROM external_user WHERE keycloak_id = :kid AND tenant_id = :tid AND status = 'ACTIVE'")
                .setParameter("kid", keycloakId)
                .setParameter("tid", tenantId)
                .getResultList();
        return result.isEmpty() ? Optional.empty() : Optional.of(result.get(0).toString());
    }
}
