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

import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class InventoryMovementTenantIsolationIT {

    private static final String TENANT_A = "aaaaaaaa-0000-0000-0000-000000000001";
    private static final String TENANT_B = "bbbbbbbb-0000-0000-0000-000000000002";

    @Inject
    EntityManager em;

    private UUID machineB;
    private UUID prizeB;
    private UUID machineA;
    private UUID prizeA;

    @BeforeEach
    void seed() {
        ensureTenant(UUID.fromString(TENANT_A), "tenant-a", "Tenant A");
        ensureTenant(UUID.fromString(TENANT_B), "tenant-b", "Tenant B");

        machineB = UUID.randomUUID();
        prizeB = UUID.randomUUID();
        machineA = UUID.randomUUID();
        prizeA = UUID.randomUUID();

        QuarkusTransaction.requiringNew().run(() -> {
            insertMachine(machineB, UUID.fromString(TENANT_B), "ISO-B-" + machineB);
            insertPrize(prizeB, UUID.fromString(TENANT_B), "SKU-B-" + prizeB);
            insertBalance(machineB, prizeB, UUID.fromString(TENANT_B), 40);

            insertMachine(machineA, UUID.fromString(TENANT_A), "ISO-A-" + machineA);
            insertPrize(prizeA, UUID.fromString(TENANT_A), "SKU-A-" + prizeA);
            insertBalance(machineA, prizeA, UUID.fromString(TENANT_A), 10);
        });
    }

    @AfterEach
    void cleanup() {
        TenantContext.clear();
        QuarkusTransaction.requiringNew().run(() -> {
            em.createNativeQuery(
                    "DELETE FROM stock_movement WHERE machine_id IN (:a, :b) OR prize_id IN (:pa, :pb)")
                .setParameter("a", machineA)
                .setParameter("b", machineB)
                .setParameter("pa", prizeA)
                .setParameter("pb", prizeB)
                .executeUpdate();
            em.createNativeQuery(
                    "DELETE FROM machine_stock_balance WHERE machine_id IN (:a, :b)")
                .setParameter("a", machineA)
                .setParameter("b", machineB)
                .executeUpdate();
            em.createNativeQuery("DELETE FROM prize WHERE id IN (:pa, :pb)")
                .setParameter("pa", prizeA)
                .setParameter("pb", prizeB)
                .executeUpdate();
            em.createNativeQuery("DELETE FROM machine WHERE id IN (:a, :b)")
                .setParameter("a", machineA)
                .setParameter("b", machineB)
                .executeUpdate();
        });
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_A),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void tenant_a_cannot_mutate_tenant_b_stock_via_foreign_ids() {
        given()
            .contentType(ContentType.JSON)
            .body(Map.of(
                "clientOperationId", UUID.randomUUID().toString(),
                "machineId", machineB.toString(),
                "prizeId", prizeB.toString(),
                "movementType", "REPLENISHMENT",
                "quantityDelta", 5
            ))
        .when()
            .post("/api/v1/inventory/movements")
        .then()
            .statusCode(anyOf(is(400), is(404)));

        Number qtyB = (Number) QuarkusTransaction.requiringNew().call(() ->
            em.createNativeQuery(
                    "SELECT quantity FROM machine_stock_balance " +
                    "WHERE machine_id = :mid AND prize_id = :pid AND tenant_id = :tid")
                .setParameter("mid", machineB)
                .setParameter("pid", prizeB)
                .setParameter("tid", UUID.fromString(TENANT_B))
                .getSingleResult()
        );
        assertThat(qtyB.intValue()).isEqualTo(40);

        Number foreignMoves = (Number) QuarkusTransaction.requiringNew().call(() ->
            em.createNativeQuery(
                    "SELECT COUNT(*) FROM stock_movement " +
                    "WHERE tenant_id = :tid AND machine_id = :mid")
                .setParameter("tid", UUID.fromString(TENANT_A))
                .setParameter("mid", machineB)
                .getSingleResult()
        );
        assertThat(foreignMoves.longValue()).isZero();
    }

    @Test
    @TestSecurity(user = "user-a", roles = {"TENANT_ADMIN"})
    @OidcSecurity(claims = {
        @Claim(key = "tenant_id", value = TENANT_A),
        @Claim(key = "tenant_slug", value = "tenant-a"),
        @Claim(key = "email", value = "user-a@test.local")
    })
    void tenant_a_can_record_movement_for_own_machine_and_prize() {
        given()
            .contentType(ContentType.JSON)
            .body(Map.of(
                "clientOperationId", UUID.randomUUID().toString(),
                "machineId", machineA.toString(),
                "prizeId", prizeA.toString(),
                "movementType", "REPLENISHMENT",
                "quantityDelta", 3
            ))
        .when()
            .post("/api/v1/inventory/movements")
        .then()
            .statusCode(201)
            .body("id", notNullValue());

        Number qtyA = (Number) QuarkusTransaction.requiringNew().call(() ->
            em.createNativeQuery(
                    "SELECT quantity FROM machine_stock_balance " +
                    "WHERE machine_id = :mid AND prize_id = :pid AND tenant_id = :tid")
                .setParameter("mid", machineA)
                .setParameter("pid", prizeA)
                .setParameter("tid", UUID.fromString(TENANT_A))
                .getSingleResult()
        );
        assertThat(qtyA.intValue()).isEqualTo(13);
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

    private void insertMachine(UUID id, UUID tenantId, String asset) {
        em.createNativeQuery(
                "INSERT INTO machine (id, tenant_id, asset_number, name, status, play_price_cents, currency, " +
                " created_at, updated_at, version) " +
                "VALUES (:id, :tid, :asset, :name, 'ACTIVE', 100, 'BRL', NOW(), NOW(), 0)")
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .setParameter("asset", asset)
            .setParameter("name", "Machine " + asset)
            .executeUpdate();
    }

    private void insertPrize(UUID id, UUID tenantId, String sku) {
        em.createNativeQuery(
                "INSERT INTO prize (id, tenant_id, sku, name, active, created_at) " +
                "VALUES (:id, :tid, :sku, :name, true, NOW())")
            .setParameter("id", id)
            .setParameter("tid", tenantId)
            .setParameter("sku", sku)
            .setParameter("name", "Prize " + sku)
            .executeUpdate();
    }

    private void insertBalance(UUID machineId, UUID prizeId, UUID tenantId, int qty) {
        em.createNativeQuery(
                "INSERT INTO machine_stock_balance " +
                "(id, tenant_id, machine_id, prize_id, quantity, minimum_quantity, version) " +
                "VALUES (:id, :tid, :mid, :pid, :qty, 5, 0)")
            .setParameter("id", UUID.randomUUID())
            .setParameter("tid", tenantId)
            .setParameter("mid", machineId)
            .setParameter("pid", prizeId)
            .setParameter("qty", qty)
            .executeUpdate();
    }
}
