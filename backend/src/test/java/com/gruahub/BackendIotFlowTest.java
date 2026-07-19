package com.gruahub;

import com.gruahub.plays.application.CreditService;
import com.gruahub.reconciliation.application.ReconciliationScheduler;
import com.gruahub.shared.domain.TenantContext;
import io.quarkus.test.TestTransaction;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

/**
 * Testes de integração do fluxo completo IoT + Pagamento + Reconciliação.
 * <p>
 * Cobre:
 * <ol>
 *   <li>Exactly-once credit: segunda chamada retorna null sem criar segundo crédito</li>
 *   <li>Outbox enqueued: INSERT em outbox_event dentro da mesma transação</li>
 *   <li>Scheduler MATCHED: pagamento + crédito + play → caso MATCHED</li>
 *   <li>Scheduler PAYMENT_WITHOUT_CREDIT: sem crédito após janela → caso detectado</li>
 *   <li>Constraint de play_session: caminho feliz gera MATCHED, sem DUPLICATE_EVENT</li>
 *   <li>Idempotência do scheduler: segunda execução não cria casos duplicados</li>
 * </ol>
 * <p>
 * Usa clock injetável em ReconciliationScheduler para controle determinístico
 * de janelas de tempo — sem sleeps.
 */
@QuarkusTest
class BackendIotFlowTest {

    private static final UUID TENANT_ID  = UUID.fromString("cccccccc-0000-0000-0000-000000000003");
    private static final UUID MACHINE_ID = UUID.fromString("dddddddd-0000-0000-0000-000000000004");

    @Inject
    CreditService creditService;

    @Inject
    ReconciliationScheduler reconciliationScheduler;

    @Inject
    EntityManager em;

    @BeforeEach
    void setUp() {
        TenantContext.set(TENANT_ID, "test-tenant", "test-user", "test@test.local");
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. Exactly-once credit
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void credit_grant_is_exactly_once_for_same_payment() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);
        UUID paymentId = insertPaymentTransaction("CONFIRMED");

        UUID firstCreditId = creditService.grantCreditForPayment(
                TENANT_ID, MACHINE_ID, paymentId, 200L, 1);
        assertThat(firstCreditId).isNotNull();

        // Segunda chamada para o mesmo paymentId → exactly-once → retorna null
        UUID secondCreditId = creditService.grantCreditForPayment(
                TENANT_ID, MACHINE_ID, paymentId, 200L, 1);
        assertThat(secondCreditId).isNull();

        // Apenas um credit_grant no banco para este pagamento
        Number count = (Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM credit_grant WHERE payment_transaction_id = :pid AND tenant_id = :tid")
                .setParameter("pid", paymentId)
                .setParameter("tid", TENANT_ID)
                .getSingleResult();
        assertThat(count.longValue()).isEqualTo(1L);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. Outbox event enqueued atomically with credit grant
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void credit_grant_enqueues_outbox_event() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);
        UUID paymentId = insertPaymentTransaction("CONFIRMED");

        UUID creditId = creditService.grantCreditForPayment(
                TENANT_ID, MACHINE_ID, paymentId, 200L, 1);
        assertThat(creditId).isNotNull();

        // Deve existir um outbox_event PENDING para GRANT_CREDIT
        Number outboxCount = (Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM outbox_event " +
                "WHERE event_type = 'GRANT_CREDIT' AND aggregate_id = :cid " +
                "AND tenant_id = :tid AND status = 'PENDING'")
                .setParameter("cid", creditId)
                .setParameter("tid", TENANT_ID)
                .getSingleResult();
        assertThat(outboxCount.longValue()).isEqualTo(1L);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Scheduler MATCHED — fluxo feliz completo
    //    payment CONFIRMED + credit CONSUMED + play COMPLETED → caso MATCHED
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void scheduler_creates_matched_case_for_complete_flow() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);

        // Montar fluxo completo no banco
        UUID paymentId = insertPaymentTransaction("CONFIRMED");
        UUID creditId  = insertCreditGrant(paymentId, "CONSUMED");
        UUID playId    = insertPlaySession(creditId, "COMPLETED");

        // Usar relógio fixo no passado para que o cutoff seja no futuro
        // → scheduler usa now = T, cutoff = T - 5min
        // Para happy path não há cutoff, então qualquer clock funciona
        reconciliationScheduler.setClock(Clock.systemUTC());
        reconciliationScheduler.runReconciliation();

        // Deve existir caso MATCHED para este pagamento
        String status = queryReconciliationStatus(paymentId);
        assertThat(status).isEqualTo("MATCHED");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Scheduler PAYMENT_WITHOUT_CREDIT — pagamento sem crédito após janela
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void scheduler_creates_payment_without_credit_case_after_window() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);

        // Pagamento confirmado NO PASSADO (além da janela de 5 minutos)
        UUID paymentId = insertPaymentTransactionConfirmedAt(
                Instant.now().minus(10, ChronoUnit.MINUTES));

        // Nenhum credit_grant para este pagamento

        // Clock fixo: now = agora → cutoff = agora - 5min → pagamento de 10min atrás está além do cutoff
        Instant fixedNow = Instant.now();
        reconciliationScheduler.setClock(Clock.fixed(fixedNow, ZoneOffset.UTC));
        reconciliationScheduler.runReconciliation();

        String status = queryReconciliationStatus(paymentId);
        assertThat(status).isEqualTo("PAYMENT_WITHOUT_CREDIT");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. Constraint uq_play_session_credit_grant — sem DUPLICATE_EVENT no caminho feliz
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void scheduler_does_not_flag_duplicate_when_single_play_exists() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);

        UUID paymentId = insertPaymentTransaction("CONFIRMED");
        UUID creditId  = insertCreditGrant(paymentId, "CONSUMED");
        insertPlaySession(creditId, "COMPLETED");

        reconciliationScheduler.setClock(Clock.systemUTC());
        reconciliationScheduler.runReconciliation();

        Number dupCount = (Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM reconciliation_case " +
                "WHERE credit_grant_id = :cid AND status = 'DUPLICATE_EVENT'")
                .setParameter("cid", creditId)
                .getSingleResult();
        assertThat(dupCount.longValue()).isEqualTo(0L);
        assertThat(queryReconciliationStatus(paymentId)).isEqualTo("MATCHED");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. Scheduler idempotência — segunda execução não duplica casos
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void scheduler_is_idempotent_on_repeated_runs() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);

        UUID paymentId = insertPaymentTransactionConfirmedAt(
                Instant.now().minus(10, ChronoUnit.MINUTES));

        Instant fixedNow = Instant.now();
        reconciliationScheduler.setClock(Clock.fixed(fixedNow, ZoneOffset.UTC));

        // Executar duas vezes
        reconciliationScheduler.runReconciliation();
        reconciliationScheduler.runReconciliation();

        // Apenas um caso para este pagamento (NOT EXISTS previne duplicata)
        Number count = (Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM reconciliation_case " +
                "WHERE payment_transaction_id = :pid AND tenant_id = :tid")
                .setParameter("pid", paymentId)
                .setParameter("tid", TENANT_ID)
                .getSingleResult();
        assertThat(count.longValue()).isEqualTo(1L);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. acknowledgeCredit é idempotente
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void acknowledge_credit_is_idempotent() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);

        UUID paymentId = insertPaymentTransaction("CONFIRMED");
        UUID creditId  = insertCreditGrant(paymentId, "SENT");

        creditService.acknowledgeCredit(creditId, TENANT_ID);
        creditService.acknowledgeCredit(creditId, TENANT_ID); // segunda chamada — no-op

        String status = queryCreditStatus(creditId);
        assertThat(status).isEqualTo("ACKNOWLEDGED");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. consumeCredit é idempotente
    // ═══════════════════════════════════════════════════════════════════════════

    @Test
    @TestTransaction
    void consume_credit_is_idempotent() {
        insertMachine(MACHINE_ID, TENANT_ID, 200L);

        UUID paymentId = insertPaymentTransaction("CONFIRMED");
        UUID creditId  = insertCreditGrant(paymentId, "ACKNOWLEDGED");

        creditService.consumeCredit(creditId, TENANT_ID);
        creditService.consumeCredit(creditId, TENANT_ID); // no-op

        String status = queryCreditStatus(creditId);
        assertThat(status).isEqualTo("CONSUMED");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Helpers de inserção direta no banco (bypassa lógica de negócio)
    // ═══════════════════════════════════════════════════════════════════════════

    private void insertMachine(UUID machineId, UUID tenantId, long playPriceCents) {
        em.createNativeQuery(
                "INSERT INTO tenant (id, name, slug, status, settings, created_at, updated_at, version) " +
                "VALUES (:tid, 'IoT Flow Tenant', 'iot-flow-tenant', 'ACTIVE', CAST('{}' AS jsonb), NOW(), NOW(), 0) " +
                "ON CONFLICT (id) DO NOTHING")
                .setParameter("tid", tenantId)
                .executeUpdate();

        em.createNativeQuery(
                "INSERT INTO machine (id, tenant_id, asset_number, name, " +
                "play_price_cents, currency, status, created_at, updated_at) " +
                "VALUES (:id, :tid, :asset, 'Test Machine', :price, 'BRL', 'ACTIVE', NOW(), NOW()) " +
                "ON CONFLICT (id) DO NOTHING")
                .setParameter("id",    machineId)
                .setParameter("tid",   tenantId)
                .setParameter("asset", "TEST-" + machineId.toString().substring(0, 8))
                .setParameter("price", playPriceCents)
                .executeUpdate();
    }

    private UUID insertPaymentTransaction(String status) {
        UUID paymentId = UUID.randomUUID();
        em.createNativeQuery(
                "INSERT INTO payment_transaction " +
                "(id, tenant_id, machine_id, provider_transaction_id, provider, " +
                " amount_cents, currency, payment_method, status, " +
                " confirmed_at, created_at, updated_at) " +
                "VALUES (:id, :tid, :mid, :txId, 'SANDBOX', " +
                "200, 'BRL', 'SANDBOX_QR', :status, " +
                "CASE WHEN :status = 'CONFIRMED' THEN NOW() ELSE NULL END, NOW(), NOW())")
                .setParameter("id",     paymentId)
                .setParameter("tid",    TENANT_ID)
                .setParameter("mid",    MACHINE_ID)
                .setParameter("txId",   "SANDBOX-TEST-" + paymentId.toString().substring(0, 8))
                .setParameter("status", status)
                .executeUpdate();
        return paymentId;
    }

    private UUID insertPaymentTransactionConfirmedAt(Instant confirmedAt) {
        UUID paymentId = UUID.randomUUID();
        em.createNativeQuery(
                "INSERT INTO payment_transaction " +
                "(id, tenant_id, machine_id, provider_transaction_id, provider, " +
                " amount_cents, currency, payment_method, status, " +
                " confirmed_at, created_at, updated_at) " +
                "VALUES (:id, :tid, :mid, :txId, 'SANDBOX', " +
                "200, 'BRL', 'SANDBOX_QR', 'CONFIRMED', :confirmedAt, NOW(), NOW())")
                .setParameter("id",          paymentId)
                .setParameter("tid",         TENANT_ID)
                .setParameter("mid",         MACHINE_ID)
                .setParameter("txId",        "SANDBOX-TEST-" + paymentId.toString().substring(0, 8))
                .setParameter("confirmedAt", confirmedAt)
                .executeUpdate();
        return paymentId;
    }

    private UUID insertCreditGrant(UUID paymentId, String status) {
        UUID creditId = UUID.randomUUID();
        em.createNativeQuery(
                "INSERT INTO credit_grant " +
                "(id, tenant_id, machine_id, payment_transaction_id, " +
                " amount_cents, plays_granted, reason, status, command_id, " +
                " consumed_at, created_at) " +
                "VALUES (:id, :tid, :mid, :pid, " +
                "200, 1, 'PAYMENT', :status, :cmdId, " +
                "CASE WHEN :status = 'CONSUMED' THEN NOW() ELSE NULL END, NOW())")
                .setParameter("id",     creditId)
                .setParameter("tid",    TENANT_ID)
                .setParameter("mid",    MACHINE_ID)
                .setParameter("pid",    paymentId)
                .setParameter("status", status)
                .setParameter("cmdId",  UUID.randomUUID().toString())
                .executeUpdate();
        return creditId;
    }

    private UUID insertPlaySession(UUID creditGrantId, String status) {
        UUID playId = UUID.randomUUID();
        em.createNativeQuery(
                "INSERT INTO play_session " +
                "(id, tenant_id, machine_id, credit_grant_id, status, " +
                " started_at, completed_at, created_at) " +
                "VALUES (:id, :tid, :mid, :cid, :status, " +
                "NOW(), CASE WHEN :status = 'COMPLETED' THEN NOW() ELSE NULL END, NOW())")
                .setParameter("id",     playId)
                .setParameter("tid",    TENANT_ID)
                .setParameter("mid",    MACHINE_ID)
                .setParameter("cid",    creditGrantId)
                .setParameter("status", status)
                .executeUpdate();
        return playId;
    }

    private String queryReconciliationStatus(UUID paymentId) {
        Object result = em.createNativeQuery(
                "SELECT status FROM reconciliation_case " +
                "WHERE payment_transaction_id = :pid AND tenant_id = :tid " +
                "ORDER BY created_at DESC LIMIT 1")
                .setParameter("pid", paymentId)
                .setParameter("tid", TENANT_ID)
                .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        return result != null ? result.toString() : null;
    }

    private String queryCreditStatus(UUID creditId) {
        Object result = em.createNativeQuery(
                "SELECT status FROM credit_grant WHERE id = :id AND tenant_id = :tid")
                .setParameter("id",  creditId)
                .setParameter("tid", TENANT_ID)
                .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        return result != null ? result.toString() : null;
    }
}
