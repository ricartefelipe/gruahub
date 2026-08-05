package com.gruahub.inventory;

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
class InventoryMovementsIT {

    private static final String TENANT_ID = "aaaaaaaa-0000-0000-0000-000000000001";

    @Inject
    EntityManager em;

    @BeforeEach
    void seedTenant() {
        QuarkusTransaction.requiringNew().run(() -> {
            Number count = (Number) em.createNativeQuery(
                    "SELECT COUNT(*) FROM tenant WHERE id = :id")
                .setParameter("id", UUID.fromString(TENANT_ID))
                .getSingleResult();
            if (count.longValue() > 0) {
                return;
            }
            em.createNativeQuery(
                    "INSERT INTO tenant (id, name, slug, status, settings, created_at, updated_at, version) " +
                    "VALUES (:id, :name, :slug, 'ACTIVE', CAST('{}' AS jsonb), NOW(), NOW(), 0)")
                .setParameter("id", UUID.fromString(TENANT_ID))
                .setParameter("name", "Tenant A")
                .setParameter("slug", "tenant-a")
                .executeUpdate();
        });
    }

    @AfterEach
    void clear() {
        TenantContext.clear();
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_ID),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void list_movements_returns_200_with_schema_aligned_columns() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/inventory/movements?size=50")
        .then()
            .statusCode(200)
            .body("content", notNullValue())
            .body("totalElements", greaterThanOrEqualTo(0));
    }
}
