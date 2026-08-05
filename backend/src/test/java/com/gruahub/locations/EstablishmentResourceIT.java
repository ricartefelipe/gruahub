package com.gruahub.locations;

import com.gruahub.shared.domain.TenantContext;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.quarkus.test.security.oidc.Claim;
import io.quarkus.test.security.oidc.OidcSecurity;
import io.restassured.http.ContentType;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class EstablishmentResourceIT {

    private static final String TENANT_ID = "aaaaaaaa-0000-0000-0000-000000000001";

    @Inject
    EntityManager em;

    private UUID establishmentId;

    @BeforeEach
    void seed() {
        ensureTenant(UUID.fromString(TENANT_ID), "tenant-a", "Tenant A");
        establishmentId = UUID.randomUUID();
        QuarkusTransaction.requiringNew().run(() ->
            em.createNativeQuery(
                    "INSERT INTO establishment (id, tenant_id, name, status) " +
                    "VALUES (:id, :tid, :name, 'ACTIVE')")
                .setParameter("id", establishmentId)
                .setParameter("tid", UUID.fromString(TENANT_ID))
                .setParameter("name", "Estabelecimento IT " + establishmentId)
                .executeUpdate()
        );
    }

    @AfterEach
    void clear() {
        TenantContext.clear();
        QuarkusTransaction.requiringNew().run(() ->
            em.createNativeQuery("DELETE FROM establishment WHERE id = :id")
                .setParameter("id", establishmentId)
                .executeUpdate()
        );
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_ID),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void list_establishments_maps_created_at_without_500() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/establishments?size=100")
        .then()
            .statusCode(200)
            .body("content.id", hasItem(establishmentId.toString()))
            .body("content.find { it.id == '" + establishmentId + "' }.createdAt", notNullValue());
    }

    private void ensureTenant(UUID id, String slug, String name) {
        QuarkusTransaction.requiringNew().run(() -> {
            Number count = (Number) em.createNativeQuery(
                    "SELECT COUNT(*) FROM tenant WHERE id = :id")
                .setParameter("id", id)
                .getSingleResult();
            if (count.longValue() > 0) {
                return;
            }
            em.createNativeQuery(
                    "INSERT INTO tenant (id, name, slug, status, settings, created_at, updated_at, version) " +
                    "VALUES (:id, :name, :slug, 'ACTIVE', CAST('{}' AS jsonb), NOW(), NOW(), 0)")
                .setParameter("id", id)
                .setParameter("name", name)
                .setParameter("slug", slug)
                .executeUpdate();
        });
    }
}
