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

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class OperatingPointResourceIT {

    private static final String TENANT_ID = "aaaaaaaa-0000-0000-0000-000000000001";

    @Inject
    EntityManager em;

    private UUID establishmentId;
    private UUID pointId;

    @BeforeEach
    void seed() {
        ensureTenant(UUID.fromString(TENANT_ID), "tenant-a", "Tenant A");
        establishmentId = UUID.randomUUID();
        pointId = UUID.randomUUID();

        QuarkusTransaction.requiringNew().run(() -> {
            em.createNativeQuery(
                    "INSERT INTO establishment (id, tenant_id, name, status) " +
                    "VALUES (:id, :tid, :name, 'ACTIVE')")
                .setParameter("id", establishmentId)
                .setParameter("tid", UUID.fromString(TENANT_ID))
                .setParameter("name", "Est IT " + establishmentId)
                .executeUpdate();

            em.createNativeQuery(
                    "INSERT INTO operating_point " +
                    "(id, tenant_id, establishment_id, name, address_street, address_city, address_state, " +
                    " address_postal_code, latitude, longitude, default_commission_pct, contract_type, " +
                    " status, priority_score) " +
                    "VALUES (:id, :tid, :eid, :name, :street, :city, :state, :zip, :lat, :lng, :comm, :ct, " +
                    " 'ACTIVE', :score)")
                .setParameter("id", pointId)
                .setParameter("tid", UUID.fromString(TENANT_ID))
                .setParameter("eid", establishmentId)
                .setParameter("name", "Ponto IT " + pointId)
                .setParameter("street", "Rua Teste 100")
                .setParameter("city", "São Paulo")
                .setParameter("state", "SP")
                .setParameter("zip", "01000-000")
                .setParameter("lat", new BigDecimal("-23.550520"))
                .setParameter("lng", new BigDecimal("-46.633308"))
                .setParameter("comm", new BigDecimal("15.50"))
                .setParameter("ct", "COMODATO")
                .setParameter("score", new BigDecimal("88.00"))
                .executeUpdate();
        });
    }

    @AfterEach
    void clear() {
        TenantContext.clear();
        QuarkusTransaction.requiringNew().run(() -> {
            em.createNativeQuery("DELETE FROM operating_point WHERE id = :id")
                .setParameter("id", pointId)
                .executeUpdate();
            em.createNativeQuery("DELETE FROM establishment WHERE id = :id")
                .setParameter("id", establishmentId)
                .executeUpdate();
        });
    }

    @Test
    void operating_points_endpoint_requires_authentication() {
        given()
        .when()
            .get("/api/v1/operating-points")
        .then()
            .statusCode(401);
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_ID),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void list_operating_points_returns_seeded_point() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/operating-points?size=100")
        .then()
            .statusCode(200)
            .body("content.id", hasItem(pointId.toString()))
            .body("content.find { it.id == '" + pointId + "' }.name", equalTo("Ponto IT " + pointId))
            .body("content.find { it.id == '" + pointId + "' }.establishmentName",
                equalTo("Est IT " + establishmentId))
            .body("content.find { it.id == '" + pointId + "' }.commissionPct", equalTo(15.50f))
            .body("content.find { it.id == '" + pointId + "' }.priorityScore", equalTo(88));
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_ID),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void create_and_get_operating_point_uses_schema_columns() {
        String name = "Novo Ponto " + UUID.randomUUID();

        String createdId = given()
            .contentType(ContentType.JSON)
            .body(Map.of(
                "establishmentId", establishmentId.toString(),
                "name", name,
                "addressCity", "Campinas",
                "addressState", "SP",
                "addressZip", "13000-000",
                "commissionPct", 12.5,
                "contractType", "COMODATO"
            ))
        .when()
            .post("/api/v1/operating-points")
        .then()
            .statusCode(201)
            .body("id", notNullValue())
            .extract()
            .path("id");

        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/operating-points/" + createdId)
        .then()
            .statusCode(200)
            .body("id", equalTo(createdId))
            .body("name", equalTo(name))
            .body("addressCity", equalTo("Campinas"))
            .body("commissionPct", equalTo(12.5f));

        QuarkusTransaction.requiringNew().run(() ->
            em.createNativeQuery("DELETE FROM operating_point WHERE id = :id")
                .setParameter("id", UUID.fromString(createdId))
                .executeUpdate()
        );
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
