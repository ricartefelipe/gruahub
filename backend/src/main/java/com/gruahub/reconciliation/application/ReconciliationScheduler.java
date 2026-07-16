package com.gruahub.reconciliation.application;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Job de conciliação: relaciona Pagamento → Crédito → ACK → Jogada.
 * Executa periodicamente e cria/atualiza ReconciliationCase.
 */
@ApplicationScoped
public class ReconciliationScheduler {

    private static final Logger LOG = Logger.getLogger(ReconciliationScheduler.class);

    @Inject
    EntityManager em;

    @Scheduled(cron = "${gruahub.scheduler.reconciliation-cron:0 */5 * * * ?}")
    @Transactional
    public void runReconciliation() {
        LOG.debug("Running reconciliation job...");

        // 1. Pagamentos CONFIRMED sem credit_grant → PAYMENT_WITHOUT_CREDIT
        em.createNativeQuery("""
            INSERT INTO reconciliation_case (id, tenant_id, machine_id, payment_transaction_id,
                status, created_at, updated_at)
            SELECT gen_random_uuid(), pt.tenant_id, pt.machine_id, pt.id,
                'PAYMENT_WITHOUT_CREDIT', :now, :now
            FROM payment_transaction pt
            WHERE pt.status = 'CONFIRMED'
              AND NOT EXISTS (
                SELECT 1 FROM credit_grant cg WHERE cg.payment_transaction_id = pt.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.payment_transaction_id = pt.id
                  AND rc.status NOT IN ('REQUIRES_REVIEW')
              )
            """)
                .setParameter("now", Instant.now())
                .executeUpdate();

        // 2. CreditGrants SENT/ACKNOWLEDGED sem ACK por >5 min → CREDIT_NOT_ACKNOWLEDGED
        Instant cutoff5m = Instant.now().minus(5, ChronoUnit.MINUTES);
        em.createNativeQuery("""
            INSERT INTO reconciliation_case (id, tenant_id, machine_id, payment_transaction_id,
                credit_grant_id, status, created_at, updated_at)
            SELECT gen_random_uuid(), cg.tenant_id, cg.machine_id, cg.payment_transaction_id,
                cg.id, 'CREDIT_NOT_ACKNOWLEDGED', :now, :now
            FROM credit_grant cg
            WHERE cg.status IN ('SENT', 'PENDING')
              AND cg.created_at < :cutoff
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.credit_grant_id = cg.id
                  AND rc.status NOT IN ('REQUIRES_REVIEW')
              )
            """)
                .setParameter("now", Instant.now())
                .setParameter("cutoff", cutoff5m)
                .executeUpdate();

        // 3. Credits CONSUMED com jogada → MATCHED (atualizar cases existentes)
        em.createNativeQuery("""
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
                .setParameter("now", Instant.now())
                .executeUpdate();

        // 4. Credits CONSUMED com pagamento CONFIRMED mas sem play → CREDIT_WITHOUT_PLAY
        em.createNativeQuery("""
            INSERT INTO reconciliation_case (id, tenant_id, machine_id, payment_transaction_id,
                credit_grant_id, status, created_at, updated_at)
            SELECT gen_random_uuid(), cg.tenant_id, cg.machine_id, cg.payment_transaction_id,
                cg.id, 'CREDIT_WITHOUT_PLAY', :now, :now
            FROM credit_grant cg
            WHERE cg.status = 'CONSUMED'
              AND NOT EXISTS (
                SELECT 1 FROM play_session ps
                WHERE ps.credit_grant_id = cg.id AND ps.status = 'COMPLETED'
              )
              AND NOT EXISTS (
                SELECT 1 FROM reconciliation_case rc
                WHERE rc.credit_grant_id = cg.id AND rc.status IN ('MATCHED', 'REQUIRES_REVIEW')
              )
            """)
                .setParameter("now", Instant.now())
                .executeUpdate();

        LOG.debug("Reconciliation job completed");
    }
}
