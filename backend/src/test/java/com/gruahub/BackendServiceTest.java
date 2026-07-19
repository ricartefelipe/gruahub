package com.gruahub;

import com.gruahub.audit.application.AuditService;
import com.gruahub.fleet.api.CreateMachineRequest;
import com.gruahub.fleet.api.MachineResponse;
import com.gruahub.fleet.application.MachineService;
import com.gruahub.fleet.domain.MachineStatus;
import com.gruahub.shared.domain.JsonUtil;
import com.gruahub.shared.domain.TenantContext;
import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.TestTransaction;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * Suite de testes @QuarkusTest para a camada de serviço.
 * <p>
 * Usa PostgreSQL real via Testcontainers (devservices habilitado no perfil test).
 * Cada teste cria seus próprios dados e é revertido por @TestTransaction.
 * TenantContext é configurado manualmente no @BeforeEach / @AfterEach.
 * <p>
 * NOTA: AuditService usa REQUIRES_NEW — registros de auditoria são commitados
 * independentemente do rollback da transação de teste. Isso é comportamento
 * correto e intencional; os testes não interferem entre si porque usam UUIDs únicos.
 */
@QuarkusTest
class BackendServiceTest {

    // ── Constantes de tenant ─────────────────────────────────────────────────────

    private static final UUID TENANT_A = UUID.fromString("aaaaaaaa-0000-0000-0000-000000000001");
    private static final UUID TENANT_B = UUID.fromString("bbbbbbbb-0000-0000-0000-000000000002");

    // ── Injeções ─────────────────────────────────────────────────────────────────

    @Inject
    MachineService machineService;

    @Inject
    AuditService auditService;

    @Inject
    EntityManager em;

    // ── Setup ────────────────────────────────────────────────────────────────────

    @BeforeEach
    void setTenantA() {
        ensureTenant(TENANT_A, "tenant-a", "Tenant A");
        ensureTenant(TENANT_B, "tenant-b", "Tenant B");
        TenantContext.set(TENANT_A, "tenant-a", "user-a", "user-a@test.local");
    }

    private void ensureTenant(UUID id, String slug, String name) {
        QuarkusTransaction.requiringNew().run(() -> {
            em.createNativeQuery(
                    "INSERT INTO tenant (id, name, slug, status, settings, created_at, updated_at, version) " +
                    "VALUES (:id, :name, :slug, 'ACTIVE', CAST('{}' AS jsonb), NOW(), NOW(), 0) " +
                    "ON CONFLICT (id) DO NOTHING")
                    .setParameter("id", id)
                    .setParameter("name", name)
                    .setParameter("slug", slug)
                    .executeUpdate();
        });
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. JsonUtil — escaping correto (unidade pura, sem DB)
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    void jsonUtil_escapes_double_quotes_in_value() {
        String json = JsonUtil.obj("name", "João \"O\" Silva");
        assertThat(json).isEqualTo("{\"name\":\"João \\\"O\\\" Silva\"}");
    }

    @Test
    void jsonUtil_escapes_backslash() {
        String json = JsonUtil.obj("path", "C:\\Windows\\System32");
        assertThat(json).isEqualTo("{\"path\":\"C:\\\\Windows\\\\System32\"}");
    }

    @Test
    void jsonUtil_escapes_newline() {
        String json = JsonUtil.obj("msg", "line1\nline2");
        assertThat(json).isEqualTo("{\"msg\":\"line1\\nline2\"}");
    }

    @Test
    void jsonUtil_handles_null_value() {
        String json = JsonUtil.obj("x", (String) null);
        assertThat(json).isEqualTo("{\"x\":null}");
    }

    @Test
    void jsonUtil_two_fields() {
        String json = JsonUtil.obj("a", "1", "b", "2");
        assertThat(json)
            .contains("\"a\":\"1\"")
            .contains("\"b\":\"2\"")
            .startsWith("{")
            .endsWith("}");
    }

    @Test
    void jsonUtil_checklist_array_escapes_key_with_quotes() {
        var items = List.of(
            new FakeChecklistItem("key with \"quotes\"", true),
            new FakeChecklistItem("normal-key", false)
        );
        String json = JsonUtil.checklistArray(items);
        // Deve ter as aspas internas escapadas
        assertThat(json).contains("key with \\\"quotes\\\"");
        assertThat(json).contains("\"checked\":true");
        assertThat(json).contains("\"checked\":false");
        assertThat(json).startsWith("[").endsWith("]");
    }

    @Test
    void jsonUtil_checklist_empty_list_returns_empty_array() {
        assertThat(JsonUtil.checklistArray(List.of())).isEqualTo("[]");
    }

    @Test
    void jsonUtil_checklist_null_returns_empty_array() {
        assertThat(JsonUtil.checklistArray(null)).isEqualTo("[]");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. Isolamento de tenant — máquinas
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void machine_created_by_tenantA_is_not_visible_to_tenantB() {
        // Cria a máquina no contexto de Tenant A (já configurado no @BeforeEach)
        String assetNumber = "TEST-ISOLATION-" + UUID.randomUUID();
        MachineResponse created = machineService.create(new CreateMachineRequest(
            assetNumber, "Test Machine", 200L, "BRL",
            null, null, null, null, null, null, null
        ));
        UUID machineId = created.id();

        // Verifica que a máquina existe para Tenant A
        assertThat(machineService.getById(machineId).id()).isEqualTo(machineId);

        // Troca para Tenant B
        TenantContext.clear();
        TenantContext.set(TENANT_B, "tenant-b", "user-b", "user-b@test.local");

        // Tenant B NÃO pode ver a máquina de Tenant A — deve lançar NotFoundException
        assertThatThrownBy(() -> machineService.getById(machineId))
            .isInstanceOf(NotFoundException.class)
            .hasMessageContaining(machineId.toString());
    }

    @Test
    @TestTransaction
    void machine_list_is_scoped_to_tenant() {
        // Conta máquinas de Tenant A antes
        long beforeA = machineService.list(0, 1000).totalElements();

        // Cria uma máquina para Tenant A
        machineService.create(new CreateMachineRequest(
            "LIST-A-" + UUID.randomUUID(), "A Machine", 100L, "BRL",
            null, null, null, null, null, null, null
        ));

        // Verifica que Tenant A tem +1
        assertThat(machineService.list(0, 1000).totalElements()).isEqualTo(beforeA + 1);

        // Troca para Tenant B
        TenantContext.clear();
        TenantContext.set(TENANT_B, "tenant-b", "user-b", "user-b@test.local");

        long beforeB = machineService.list(0, 1000).totalElements();

        // Cria uma máquina para Tenant B
        machineService.create(new CreateMachineRequest(
            "LIST-B-" + UUID.randomUUID(), "B Machine", 100L, "BRL",
            null, null, null, null, null, null, null
        ));

        // Tenant B vê apenas suas próprias máquinas (+1, não a de Tenant A)
        assertThat(machineService.list(0, 1000).totalElements()).isEqualTo(beforeB + 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Máquina asset_number único por tenant
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void duplicate_asset_number_in_same_tenant_returns_409() {
        String assetNumber = "DUPE-" + UUID.randomUUID();
        machineService.create(new CreateMachineRequest(
            assetNumber, "First", 100L, "BRL",
            null, null, null, null, null, null, null
        ));

        // Segunda criação com mesmo asset number → WebApplicationException 409
        assertThatThrownBy(() -> machineService.create(new CreateMachineRequest(
            assetNumber, "Second", 100L, "BRL",
            null, null, null, null, null, null, null
        )))
            .isInstanceOf(WebApplicationException.class)
            .satisfies(e -> assertThat(((WebApplicationException) e).getResponse().getStatus())
                .isEqualTo(409));
    }

    @Test
    @TestTransaction
    void same_asset_number_in_different_tenants_is_allowed() {
        String assetNumber = "SHARED-" + UUID.randomUUID();

        // Cria em Tenant A
        machineService.create(new CreateMachineRequest(
            assetNumber, "Machine A", 100L, "BRL",
            null, null, null, null, null, null, null
        ));

        // Cria em Tenant B — deve funcionar sem conflito
        TenantContext.clear();
        TenantContext.set(TENANT_B, "tenant-b", "user-b", "user-b@test.local");

        assertThatCode(() -> machineService.create(new CreateMachineRequest(
            assetNumber, "Machine B", 100L, "BRL",
            null, null, null, null, null, null, null
        ))).doesNotThrowAnyException();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Máquina getById com ID inexistente → NotFoundException (não 500)
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void get_nonexistent_machine_throws_NotFoundException() {
        UUID nonexistentId = UUID.randomUUID();
        assertThatThrownBy(() -> machineService.getById(nonexistentId))
            .isInstanceOf(NotFoundException.class)
            .hasMessageContaining(nonexistentId.toString());
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. State machine de máquina
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void machine_can_transition_draft_to_active() {
        MachineResponse created = machineService.create(new CreateMachineRequest(
            "SM-ACT-" + UUID.randomUUID(), "SM Machine", 200L, "BRL",
            null, null, null, null, null, null, null
        ));
        assertThat(created.status()).isEqualTo(MachineStatus.DRAFT);

        MachineResponse activated = machineService.changeStatus(created.id(), MachineStatus.ACTIVE);
        assertThat(activated.status()).isEqualTo(MachineStatus.ACTIVE);
    }

    @Test
    @TestTransaction
    void machine_active_can_go_to_maintenance() {
        MachineResponse created = machineService.create(new CreateMachineRequest(
            "SM-MAINT-" + UUID.randomUUID(), "SM Machine", 200L, "BRL",
            null, null, null, null, null, null, null
        ));

        machineService.changeStatus(created.id(), MachineStatus.ACTIVE);
        MachineResponse inMaintenance = machineService.changeStatus(created.id(), MachineStatus.MAINTENANCE);
        assertThat(inMaintenance.status()).isEqualTo(MachineStatus.MAINTENANCE);
    }

    @Test
    @TestTransaction
    void machine_status_summary_counts_correctly() {
        // Cria máquinas em estados diferentes
        MachineResponse m1 = machineService.create(new CreateMachineRequest(
            "SUM-1-" + UUID.randomUUID(), "M1", 100L, "BRL",
            null, null, null, null, null, null, null
        ));
        machineService.changeStatus(m1.id(), MachineStatus.ACTIVE);

        MachineResponse m2 = machineService.create(new CreateMachineRequest(
            "SUM-2-" + UUID.randomUUID(), "M2", 100L, "BRL",
            null, null, null, null, null, null, null
        ));
        machineService.changeStatus(m2.id(), MachineStatus.ACTIVE);
        machineService.changeStatus(m2.id(), MachineStatus.MAINTENANCE);

        MachineService.MachineStatusSummary summary = machineService.getStatusSummary();
        // Verifica que os contadores são >= os criados (pode haver dados do seed)
        assertThat(summary.online()).isGreaterThanOrEqualTo(1);
        assertThat(summary.maintenance()).isGreaterThanOrEqualTo(1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. Audit — 4-arg overload usa TenantContext corretamente
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    void audit_record_4arg_uses_tenant_from_context() {
        String resourceId = UUID.randomUUID().toString();
        String action = "TEST_ACTION_" + UUID.randomUUID();

        // Chama o overload de 4 args (o que os resources usam)
        auditService.record(action, "test_resource", resourceId, "{\"test\":true}");

        // Verifica que o registro foi criado com o tenant correto
        Long count = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM audit_event " +
            "WHERE action = :action AND resource_id = :rid AND tenant_id = :tid"
        )
            .setParameter("action", action)
            .setParameter("rid", resourceId)
            .setParameter("tid", TENANT_A)
            .getSingleResult();

        assertThat(count).isEqualTo(1L);
    }

    @Test
    void audit_record_metadata_column_name_is_correct() {
        // Verifica que AuditResource usa 'metadata' (não 'details')
        // testando diretamente o schema do banco
        String resourceId = UUID.randomUUID().toString();
        auditService.record("SCHEMA_CHECK", "test", resourceId, "{\"v\":1}");

        // Se a coluna 'metadata' não existisse, a query abaixo falharia
        Long count = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM audit_event " +
            "WHERE resource_id = :rid AND metadata IS NOT NULL"
        )
            .setParameter("rid", resourceId)
            .getSingleResult();

        assertThat(count).isEqualTo(1L);
    }

    @Test
    void audit_record_actor_user_id_column_is_correct() {
        String resourceId = UUID.randomUUID().toString();
        auditService.record("ACTOR_CHECK", "test", resourceId, "{}");

        Long count = (Long) em.createNativeQuery(
            "SELECT COUNT(*) FROM audit_event " +
            "WHERE resource_id = :rid AND actor_user_id IS NULL"
        )
            .setParameter("rid", resourceId)
            .getSingleResult();

        assertThat(count).isEqualTo(1L);
    }

    @Test
    void audit_record_gracefully_handles_missing_tenant_context() {
        // Se TenantContext não estiver inicializado, o 4-arg overload deve
        // capturar a exceção e logar (não propagar)
        TenantContext.clear();

        // Não deve lançar exceção
        assertThatCode(() ->
            auditService.record("SAFE_FAIL", "test", "test-id", "{}")
        ).doesNotThrowAnyException();

        // Restaura tenant para @AfterEach funcionar
        TenantContext.set(TENANT_A, "tenant-a", "user-a", "user-a@test.local");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. Audit — metadata é JSON válido para jsonb cast
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    void audit_metadata_via_jsonutil_is_castable_as_jsonb() {
        String metadataFromJsonUtil = JsonUtil.obj("assetNumber", "ASSET-001");
        String resourceId = UUID.randomUUID().toString();

        assertThatCode(() ->
            auditService.record("JSON_CAST_CHECK", "machine", resourceId, metadataFromJsonUtil)
        ).doesNotThrowAnyException();
    }

    @Test
    void audit_metadata_with_special_chars_is_valid_json() {
        // JSON com aspas escapadas pelo JsonUtil — deve ser aceito pelo PostgreSQL jsonb
        String metadata = JsonUtil.obj("name", "Machine \"Alpha\" Pro");
        String resourceId = UUID.randomUUID().toString();

        assertThatCode(() ->
            auditService.record("SPECIAL_CHARS", "machine", resourceId, metadata)
        ).doesNotThrowAnyException();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. EstablishmentResource — getSingleResultOrNull + NotFoundException
    //    (validado via SQL direto, pois EstablishmentResource é um recurso REST)
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void establishment_not_found_query_returns_null() {
        UUID randomId = UUID.randomUUID();
        Object result = em.createNativeQuery(
            "SELECT id FROM establishment WHERE id = :id AND tenant_id = :tid"
        )
            .setParameter("id", randomId)
            .setParameter("tid", TENANT_A)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        // Antes da correção: getSingleResult() lançaria NoResultException → 500.
        // Após a correção: getSingleResultOrNull() retorna null → recurso lança NotFoundException → 404.
        assertThat(result).isNull();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. Estoque — UPSERT sequencial acumula corretamente
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void stock_upsert_accumulates_on_sequential_inserts() {
        UUID machineId = UUID.randomUUID();
        UUID prizeId = UUID.randomUUID();
        int delta1 = 10; // STOCK_IN
        int delta2 = -3; // PRIZE_GIVEN

        em.createNativeQuery(
            "INSERT INTO machine_stock_balance " +
            "  (id, tenant_id, machine_id, prize_id, quantity, minimum_quantity, version) " +
            "VALUES (:newId, :tid, :mid, :pid, GREATEST(0, :delta), 5, 0) " +
            "ON CONFLICT (machine_id, prize_id) DO UPDATE " +
            "  SET quantity = GREATEST(0, machine_stock_balance.quantity + :delta), " +
            "      updated_at = NOW(), version = machine_stock_balance.version + 1 " +
            "RETURNING quantity"
        )
            .setParameter("newId", UUID.randomUUID())
            .setParameter("tid", TENANT_A)
            .setParameter("mid", machineId)
            .setParameter("pid", prizeId)
            .setParameter("delta", delta1)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        Number afterSecond = (Number) em.createNativeQuery(
            "INSERT INTO machine_stock_balance " +
            "  (id, tenant_id, machine_id, prize_id, quantity, minimum_quantity, version) " +
            "VALUES (:newId, :tid, :mid, :pid, GREATEST(0, :delta), 5, 0) " +
            "ON CONFLICT (machine_id, prize_id) DO UPDATE " +
            "  SET quantity = GREATEST(0, machine_stock_balance.quantity + :delta), " +
            "      updated_at = NOW(), version = machine_stock_balance.version + 1 " +
            "RETURNING quantity"
        )
            .setParameter("newId", UUID.randomUUID())
            .setParameter("tid", TENANT_A)
            .setParameter("mid", machineId)
            .setParameter("pid", prizeId)
            .setParameter("delta", delta2)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        // 10 + (-3) = 7
        assertThat(afterSecond.intValue()).isEqualTo(7);
    }

    @Test
    @TestTransaction
    void stock_balance_never_goes_below_zero() {
        UUID machineId = UUID.randomUUID();
        UUID prizeId = UUID.randomUUID();

        em.createNativeQuery(
            "INSERT INTO machine_stock_balance " +
            "  (id, tenant_id, machine_id, prize_id, quantity, minimum_quantity, version) " +
            "VALUES (:newId, :tid, :mid, :pid, 5, 5, 0) " +
            "ON CONFLICT (machine_id, prize_id) DO NOTHING"
        )
            .setParameter("newId", UUID.randomUUID())
            .setParameter("tid", TENANT_A)
            .setParameter("mid", machineId)
            .setParameter("pid", prizeId)
            .executeUpdate();

        Number result = (Number) em.createNativeQuery(
            "INSERT INTO machine_stock_balance " +
            "  (id, tenant_id, machine_id, prize_id, quantity, minimum_quantity, version) " +
            "VALUES (:newId, :tid, :mid, :pid, GREATEST(0, :delta), 5, 0) " +
            "ON CONFLICT (machine_id, prize_id) DO UPDATE " +
            "  SET quantity = GREATEST(0, machine_stock_balance.quantity + :delta), " +
            "      updated_at = NOW(), version = machine_stock_balance.version + 1 " +
            "RETURNING quantity"
        )
            .setParameter("newId", UUID.randomUUID())
            .setParameter("tid", TENANT_A)
            .setParameter("mid", machineId)
            .setParameter("pid", prizeId)
            .setParameter("delta", -100)
            .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();

        assertThat(result.intValue()).isEqualTo(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. TenantContext — comportamento do filter (unidade)
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    void tenant_context_is_thread_local_isolated() throws InterruptedException {
        // TenantContext usa ThreadLocal — outra thread NÃO deve ver o tenant da thread principal
        UUID[] otherThreadTenant = {null};
        Thread other = new Thread(() -> {
            otherThreadTenant[0] = TenantContext.isInitialized()
                ? TenantContext.getTenantId()
                : null;
        });
        other.start();
        other.join(1000);

        // Thread principal tem TENANT_A; outra thread não tem nenhum tenant
        assertThat(TenantContext.getTenantId()).isEqualTo(TENANT_A);
        assertThat(otherThreadTenant[0]).isNull();
    }

    @Test
    void tenant_context_clear_removes_all_state() {
        assertThat(TenantContext.isInitialized()).isTrue();
        TenantContext.clear();
        assertThat(TenantContext.isInitialized()).isFalse();
        assertThatThrownBy(TenantContext::getTenantId)
            .isInstanceOf(IllegalStateException.class);

        // Restaura para @AfterEach
        TenantContext.set(TENANT_A, "tenant-a", "user-a", "user-a@test.local");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Helper
    // ═══════════════════════════════════════════════════════════════════════════

    /** Implementação de ChecklistEntry para testes de JsonUtil. */
    record FakeChecklistItem(String key, boolean checked) implements JsonUtil.ChecklistEntry {}
}
