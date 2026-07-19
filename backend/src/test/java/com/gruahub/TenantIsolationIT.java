package com.gruahub;

import com.gruahub.fleet.api.CreateMachineRequest;
import com.gruahub.fleet.application.MachineService;
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
class TenantIsolationIT {

    private static final String TENANT_A = "aaaaaaaa-0000-0000-0000-000000000001";
    private static final String TENANT_B = "bbbbbbbb-0000-0000-0000-000000000002";

    @Inject
    MachineService machineService;

    @Inject
    EntityManager em;

    @BeforeEach
    void ensureTenantsExist() {
        ensureTenant(UUID.fromString(TENANT_A), "tenant-a", "Tenant A Isolation");
        ensureTenant(UUID.fromString(TENANT_B), "tenant-b", "Tenant B Isolation");
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void machines_endpoint_requires_authentication() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines")
        .then()
            .statusCode(401);
    }

    @Test
    void machine_by_id_requires_authentication() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(401);
    }

    @Test
    @TestSecurity(user = "no-tenant", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "email", value = "no-tenant@test.local")
    })
    void authenticated_user_without_tenant_id_is_forbidden() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines")
        .then()
            .statusCode(403);
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_A),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void tenant_a_sees_only_own_machines_in_list() {
        String assetA = "ISO-A-" + UUID.randomUUID();
        String assetB = "ISO-B-" + UUID.randomUUID();
        UUID machineA = createMachine(UUID.fromString(TENANT_A), "tenant-a", assetA, "Machine A");
        createMachine(UUID.fromString(TENANT_B), "tenant-b", assetB, "Machine B");

        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines?page=0&size=1000")
        .then()
            .statusCode(200)
            .body("content.id", hasItem(machineA.toString()))
            .body("content.assetNumber", hasItem(assetA))
            .body("content.assetNumber", not(hasItem(assetB)));
    }

    @Test
    @TestSecurity(user = "user-b", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_B),
        @Claim(key = "tenant_slug", value = "tenant-b"),
        @Claim(key = "email", value = "user-b@test.local")
    })
    void tenant_b_cannot_read_tenant_a_machine_by_id() {
        UUID machineA = createMachine(
            UUID.fromString(TENANT_A),
            "tenant-a",
            "ISO-CROSS-" + UUID.randomUUID(),
            "Machine A Secret"
        );

        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines/" + machineA)
        .then()
            .statusCode(404);
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_A),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void tenant_a_can_read_own_machine_by_id() {
        UUID machineA = createMachine(
            UUID.fromString(TENANT_A),
            "tenant-a",
            "ISO-OWN-" + UUID.randomUUID(),
            "Machine A Own"
        );

        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines/" + machineA)
        .then()
            .statusCode(200)
            .body("id", equalTo(machineA.toString()));
    }

    @Test
    void liveness_health_check_is_public() {
        given()
        .when()
            .get("/q/health/live")
        .then()
            .statusCode(200)
            .body("status", equalTo("UP"));
    }

    @Test
    void establishments_endpoint_requires_authentication() {
        given()
        .when()
            .get("/api/v1/establishments")
        .then()
            .statusCode(401);
    }

    @Test
    void alerts_endpoint_requires_authentication() {
        given()
        .when()
            .get("/api/v1/alerts")
        .then()
            .statusCode(401);
    }

    private UUID createMachine(UUID tenantId, String slug, String assetNumber, String name) {
        TenantContext.set(tenantId, slug, "seed-" + slug, "seed@" + slug + ".test");
        try {
            return machineService.create(new CreateMachineRequest(
                assetNumber, name, 100L, "BRL",
                null, null, null, null, null, null, null
            )).id();
        } finally {
            TenantContext.clear();
        }
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
