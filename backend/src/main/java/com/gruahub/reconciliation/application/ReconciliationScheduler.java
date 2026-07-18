package com.gruahub.reconciliation.application;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Job de conciliação: relaciona Pagamento → Crédito → ACK → Jogada.
 * <p>
 * Estados produzidos:
 * <ul>
 *   <li>MATCHED — fluxo feliz completo (pagamento + crédito + play concluído)</li>
 *   <li>PAYMENT_WITHOUT_CREDIT — pagamento confirmado sem credit_grant após janela</li>
 *   <li>CREDIT_NOT_ACKNOWLEDGED — crédito enviado sem ACK após janela</li>
 *   <li>CREDIT_WITHOUT_PLAY — crédito consumido sem play_session completada</li>
 *   <li>PLAY_WITHOUT_PAYMENT — play_session sem credit_grant associado (anomalia)</li>
 *   <li>DUPLICATE_EVENT — credit_grant com múltiplas play_sessions (anomalia)</li>
 *   <li>MANUAL_REVIEW — caso requer análise manual</li>
 *   <li>MANUALLY_RESOLVED — resolvido por operador</li>
 * </ul>
 * <p>
 * Idempotência: cada INSERT verifica ausência de caso aberto existente
 * via NOT EXISTS — re-execução produz o mesmo resultado.
 * <p>
 * Clock injetável para testes determinísticos.
 */
@ApplicationScoped
public class ReconciliationScheduler {

    private static final Logger LOG = Logger.getLogger(ReconciliationScheduler.class);

    /** Janela mínima antes de classificar como anomalia: 5 minutos */
    private static final int WINDOW_MINUTES = 5;

    @Inject
    EntityManager em;

    /** Clock substituível em testes via ReconciliationScheduler.setClock() */
    private Clock clock = Clock.systemUTC();

    /** Para testes: substituir o relógio por um controlado */
    public void setClock(Clock clock) {
        this.clock = clock;
    }

    @Scheduled(cron = "${gruahub.scheduler.reconciliation-cron:0 */5 * * * ?}")
    @Transactional
    public void runReconciliation() {
        LOG.debug("Running reconciliation job...");
        Instant now    = Instant.now(clock);
        Instant cutoff = now.minus(WINDOW_MINUTES, ChronoUnit.MINUTES);

        reconcileMatchedHappyPath(now);
        reconcilePaymentWithoutCredit(now, cutoff);
        reconcileCreditNotAcknowledged(now, cutoff);
        updateMatchedFromResolved(now);
        reconcileCreditWithoutPlay(now, cutoff);
        reconcilePlayWithoutPayment(now, cutoff);
        reconcileDuplicateEvents(now);

        LOG.debug("Reconciliation job completed");
    }

    /**
     * 0. MATCHED — fluxo feliz:
     * payment CONFIRMED + credit_grant CONSUMED + play_session COMPLETED
     * sem caso de conciliação aberto.
     */
    private void reconcileMatchedHappyPath(Instant now) {
        int rows = em.createNativeQuery("""
            INSERT INTO reconciliation_case
              (id, tenant_id, machine_id, payment_transaction_id,
               credit_grant_id, play_session_id, status, created_at, updated_at)
            SELECT gen_random_uuid(),
                   pt.tenant_id, pt.machine_id, pt.id,
                   cg.id,
                   ps.id,
                   'MATCHED', :now, :now
            FROM payment_transaction pt
            JOIN credit_grant  cg ON cg.payment_transaction_id = pt.id
            JOIN play_session   ps ON ps.credit_grant_id = cg.id
            WHERE pt.status = 'CONFIRMED'
              AND cg.status = 'CONSUMED'
              AND ps.status = 'COMPLETED'
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.payment_transaction_id = pt.id
              )
            """)
                .setParameter("now", now)
                .executeUpdate();

        if (rows > 0) LOG.infof("Reconciliation: created %d MATCHED cases (happy path)", rows);
    }

    /**
     * 1. PAYMENT_WITHOUT_CREDIT — pagamento confirmado sem crédito após janela.
     */
    private void reconcilePaymentWithoutCredit(Instant now, Instant cutoff) {
        int rows = em.createNativeQuery("""
            INSERT INTO reconciliation_case
              (id, tenant_id, machine_id, payment_transaction_id,
               status, created_at, updated_at)
            SELECT gen_random_uuid(), pt.tenant_id, pt.machine_id, pt.id,
                   'PAYMENT_WITHOUT_CREDIT', :now, :now
            FROM payment_transaction pt
            WHERE pt.status = 'CONFIRMED'
              AND pt.confirmed_at < :cutoff
              AND NOT EXISTS (
                SELECT 1 FROM credit_grant cg WHERE cg.payment_transaction_id = pt.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.payment_transaction_id = pt.id
                  AND rc.status NOT IN ('MANUALLY_RESOLVED')
              )
            """)
                .setParameter("now",    now)
                .setParameter("cutoff", cutoff)
                .executeUpdate();

        if (rows > 0) LOG.warnf("Reconciliation: created %d PAYMENT_WITHOUT_CREDIT cases", rows);
    }

    /**
     * 2. CREDIT_NOT_ACKNOWLEDGED — crédito SENT/PENDING sem ACK após janela.
     */
    private void reconcileCreditNotAcknowledged(Instant now, Instant cutoff) {
        int rows = em.createNativeQuery("""
            INSERT INTO reconciliation_case
              (id, tenant_id, machine_id, payment_transaction_id,
               credit_grant_id, status, created_at, updated_at)
            SELECT gen_random_uuid(), cg.tenant_id, cg.machine_id, cg.payment_transaction_id,
                   cg.id, 'CREDIT_NOT_ACKNOWLEDGED', :now, :now
            FROM credit_grant cg
            WHERE cg.status IN ('SENT', 'PENDING')
              AND cg.created_at < :cutoff
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.credit_grant_id = cg.id
                  AND rc.status NOT IN ('MANUALLY_RESOLVED')
              )
            """)
                .setParameter("now",    now)
                .setParameter("cutoff", cutoff)
                .executeUpdate();

        if (rows > 0) LOG.warnf("Reconciliation: created %d CREDIT_NOT_ACKNOWLEDGED cases", rows);
    }

    /**
     * 3. MATCHED — atualizar casos CREDIT_NOT_ACKNOWLEDGED que foram resolvidos
     * (crédito consumido + play concluída).
     */
    private void updateMatchedFromResolved(Instant now) {
        int rows = em.createNativeQuery("""
            UPDATE reconciliation_case rc
            SET status = 'MATCHED', updated_at = :now,
                play_session_id = (
                  SELECT ps.id FROM play_session ps
                  WHERE ps.credit_grant_id = rc.credit_grant_id
                    AND ps.status = 'COMPLETED'
                  LIMIT 1
                )
            WHERE rc.status = 'CREDIT_NOT_ACKNOWLEDGED'
              AND EXISTS (
                SELECT 1 FROM credit_grant cg
                WHERE cg.id = rc.credit_grant_id AND cg.status = 'CONSUMED'
              )
              AND EXISTS (
                SELECT 1 FROM play_session ps
                WHERE ps.credit_grant_id = rc.credit_grant_id AND ps.status = 'COMPLETED'
              )
            """)
                .setParameter("now", now)
                .executeUpdate();

        if (rows > 0) LOG.infof("Reconciliation: updated %d cases to MATCHED (from CREDIT_NOT_ACKNOWLEDGED)", rows);
    }

    /**
     * 4. CREDIT_WITHOUT_PLAY — crédito CONSUMED mas sem play_session COMPLETED após janela.
     */
    private void reconcileCreditWithoutPlay(Instant now, Instant cutoff) {
        int rows = em.createNativeQuery("""
            INSERT INTO reconciliation_case
              (id, tenant_id, machine_id, payment_transaction_id,
               credit_grant_id, status, created_at, updated_at)
            SELECT gen_random_uuid(), cg.tenant_id, cg.machine_id, cg.payment_transaction_id,
                   cg.id, 'CREDIT_WITHOUT_PLAY', :now, :now
            FROM credit_grant cg
            WHERE cg.status = 'CONSUMED'
              AND cg.consumed_at < :cutoff
              AND NOT EXISTS (
                SELECT 1 FROM play_session ps
                WHERE ps.credit_grant_id = cg.id AND ps.status = 'COMPLETED'
              )
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.credit_grant_id = cg.id
                  AND rc.status NOT IN ('MANUALLY_RESOLVED')
              )
            """)
                .setParameter("now",    now)
                .setParameter("cutoff", cutoff)
                .executeUpdate();

        if (rows > 0) LOG.warnf("Reconciliation: created %d CREDIT_WITHOUT_PLAY cases", rows);
    }

    /**
     * 5. PLAY_WITHOUT_PAYMENT — play_session sem credit_grant ou sem pagamento associado.
     * Detectável quando credit_grant_id é NULL ou o credit_grant não tem payment_transaction_id.
     */
    private void reconcilePlayWithoutPayment(Instant now, Instant cutoff) {
        int rows = em.createNativeQuery("""
            INSERT INTO reconciliation_case
              (id, tenant_id, machine_id, play_session_id, status, created_at, updated_at)
            SELECT gen_random_uuid(), ps.tenant_id, ps.machine_id, ps.id,
                   'PLAY_WITHOUT_PAYMENT', :now, :now
            FROM play_session ps
            WHERE ps.started_at < :cutoff
              AND (
                ps.credit_grant_id IS NULL
                OR NOT EXISTS (
                  SELECT 1 FROM credit_grant cg
                  WHERE cg.id = ps.credit_grant_id
                    AND cg.payment_transaction_id IS NOT NULL
                )
              )
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.play_session_id = ps.id
                  AND rc.status NOT IN ('MANUALLY_RESOLVED')
              )
            """)
                .setParameter("now",    now)
                .setParameter("cutoff", cutoff)
                .executeUpdate();

        if (rows > 0) LOG.warnf("Reconciliation: created %d PLAY_WITHOUT_PAYMENT cases", rows);
    }

    /**
     * 6. DUPLICATE_EVENT — credit_grant com mais de uma play_session COMPLETED.
     * Indica que a constraint uq_play_session_credit_grant foi violada antes da migration 018,
     * ou que houve anomalia de processamento.
     */
    private void reconcileDuplicateEvents(Instant now) {
        int rows = em.createNativeQuery("""
            INSERT INTO reconciliation_case
              (id, tenant_id, machine_id, credit_grant_id, status,
               status_reason, created_at, updated_at)
            SELECT gen_random_uuid(), cg.tenant_id, cg.machine_id, cg.id,
                   'DUPLICATE_EVENT',
                   'Multiple COMPLETED play sessions for same credit_grant',
                   :now, :now
            FROM credit_grant cg
            WHERE (
              SELECT COUNT(*) FROM play_session ps
              WHERE ps.credit_grant_id = cg.id AND ps.status = 'COMPLETED'
            ) > 1
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.credit_grant_id = cg.id AND rc.status = 'DUPLICATE_EVENT'
              )
            """)
                .setParameter("now", now)
                .executeUpdate();

        if (rows > 0) LOG.errorf("Reconciliation: created %d DUPLICATE_EVENT cases — investigate immediately!", rows);
    }
}
