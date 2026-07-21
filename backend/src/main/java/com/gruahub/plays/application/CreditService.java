package com.gruahub.plays.application;

import com.gruahub.iot.application.ControllerAdapterRegistry;
import com.gruahub.iot.domain.ControllerAdapter;
import com.gruahub.shared.infra.OutboxPublisher;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.UUID;

/**
 * Serviço de crédito de jogadas.
 * <p>
 * Garantias de exactly-once credit:
 * <ol>
 *   <li>Unique constraint {@code uq_credit_grant_payment} em
 *       {@code credit_grant(payment_transaction_id)} — banco rejeita segundo INSERT.</li>
 *   <li>INSERT ON CONFLICT DO NOTHING — a aplicação trata silenciosamente.</li>
 *   <li>MQTT publish via outbox (tabela {@code outbox_event}) — nunca dentro da
 *       transação de negócio. Se MQTT estiver indisponível, o scheduler
 *       publica quando o broker se reconectar.</li>
 * </ol>
 */
@ApplicationScoped
public class CreditService {

    private static final Logger LOG = Logger.getLogger(CreditService.class);

    @ConfigProperty(name = "gruahub.mqtt.command-ttl-seconds", defaultValue = "300")
    int commandTtlSeconds;

    @Inject
    EntityManager em;

    @Inject
    OutboxPublisher outboxPublisher;

    @Inject
    ControllerAdapterRegistry controllerAdapterRegistry;

    /**
     * Cria um crédito para a máquina após confirmação de pagamento.
     * <p>
     * O MQTT command é enfileirado no outbox — não publicado diretamente.
     * Isso garante que o crédito não é perdido se o broker estiver fora.
     * <p>
     * Exactly-once: INSERT ON CONFLICT DO NOTHING + unique constraint.
     * Se duas chamadas concorrentes chegarem para o mesmo paymentTransactionId,
     * apenas uma insere. A outra recebe rows=0 e retorna null.
     *
     * @return UUID do credit_grant criado, ou null se já existia (idempotente)
     */
    @Transactional
    public UUID grantCreditForPayment(UUID tenantId, UUID machineId,
                                      UUID paymentTransactionId, long amountCents,
                                      int playsGranted) {
        UUID creditId  = UUID.randomUUID();
        String commandId = UUID.randomUUID().toString();

        // INSERT ON CONFLICT DO NOTHING — unique constraint garante exactly-once
        int rows = em.createNativeQuery(
                "INSERT INTO credit_grant " +
                "(id, tenant_id, machine_id, payment_transaction_id, " +
                " amount_cents, plays_granted, reason, status, command_id, created_at) " +
                "VALUES (:id, :tid, :mid, :pid, :amt, :plays, 'PAYMENT', 'PENDING', :cmdId, :now) " +
                "ON CONFLICT (payment_transaction_id) DO NOTHING")
                .setParameter("id",    creditId)
                .setParameter("tid",   tenantId)
                .setParameter("mid",   machineId)
                .setParameter("pid",   paymentTransactionId)
                .setParameter("amt",   amountCents)
                .setParameter("plays", playsGranted)
                .setParameter("cmdId", commandId)
                .setParameter("now",   Instant.now())
                .executeUpdate();

        if (rows == 0) {
            // Crédito já existia para este pagamento — retorno idempotente
            LOG.debugf("Credit already exists for payment %s (exactly-once guarantee) — no-op",
                    paymentTransactionId);
            return null;
        }

        // Enfileirar no outbox (mesma transação — atômica com o INSERT acima)
        // O OutboxPublisher scheduler publicará via MQTT quando o broker estiver disponível.
        String cmdPayload = buildGrantCreditPayload(commandId, creditId, playsGranted, amountCents, tenantId, machineId);
        outboxPublisher.enqueue(tenantId, "credit_grant", creditId, "GRANT_CREDIT", cmdPayload);
        insertDeviceCommand(tenantId, machineId, commandId, cmdPayload);

        LOG.infof("Credit granted and enqueued: creditId=%s payment=%s machine=%s plays=%d",
                creditId, paymentTransactionId, machineId, playsGranted);
        return creditId;
    }

    @Transactional
    public UUID grantCreditManual(UUID tenantId, UUID machineId, long amountCents,
                                  int playsGranted, String justification, String authorizedBy) {
        UUID creditId = UUID.randomUUID();
        String commandId = UUID.randomUUID().toString();

        em.createNativeQuery(
                "INSERT INTO credit_grant " +
                "(id, tenant_id, machine_id, payment_transaction_id, " +
                " amount_cents, plays_granted, reason, status, command_id, " +
                " manual_justification, manual_authorized_by, created_at) " +
                "VALUES (:id, :tid, :mid, NULL, :amt, :plays, 'MANUAL', 'PENDING', :cmdId, " +
                " :justification, :authorizedBy, :now)")
                .setParameter("id", creditId)
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .setParameter("amt", amountCents)
                .setParameter("plays", playsGranted)
                .setParameter("cmdId", commandId)
                .setParameter("justification", justification)
                .setParameter("authorizedBy", authorizedBy)
                .setParameter("now", Instant.now())
                .executeUpdate();

        String cmdPayload = buildGrantCreditPayload(commandId, creditId, playsGranted, amountCents, tenantId, machineId);
        outboxPublisher.enqueue(tenantId, "credit_grant", creditId, "GRANT_CREDIT", cmdPayload);
        insertDeviceCommand(tenantId, machineId, commandId, cmdPayload);

        LOG.infof("Manual credit granted and enqueued: creditId=%s machine=%s plays=%d by=%s",
                creditId, machineId, playsGranted, authorizedBy);
        return creditId;
    }

    /**
     * Registra ACK de crédito da máquina.
     * Idempotente: WHERE status IN ('PENDING','SENT') evita dupla transição.
     */
    @Transactional
    public void acknowledgeCredit(UUID creditGrantId, UUID tenantId) {
        int rows = em.createNativeQuery(
                "UPDATE credit_grant SET status = 'ACKNOWLEDGED', acked_at = :now " +
                "WHERE id = :id AND tenant_id = :tid AND status IN ('PENDING', 'SENT')")
                .setParameter("now", Instant.now())
                .setParameter("id",  creditGrantId)
                .setParameter("tid", tenantId)
                .executeUpdate();

        if (rows > 0) {
            LOG.debugf("Credit acknowledged: creditGrantId=%s", creditGrantId);
        } else {
            LOG.debugf("Duplicate ACK or unknown credit: creditGrantId=%s tenant=%s — ignored", creditGrantId, tenantId);
        }
    }

    /**
     * Consome o crédito após PLAY_COMPLETED.
     * Idempotente: WHERE status IN ('ACKNOWLEDGED','SENT') evita dupla transição.
     */
    @Transactional
    public void consumeCredit(UUID creditGrantId, UUID tenantId) {
        int rows = em.createNativeQuery(
                "UPDATE credit_grant SET status = 'CONSUMED', consumed_at = :now " +
                "WHERE id = :id AND tenant_id = :tid AND status IN ('ACKNOWLEDGED', 'SENT', 'PENDING')")
                .setParameter("now", Instant.now())
                .setParameter("id",  creditGrantId)
                .setParameter("tid", tenantId)
                .executeUpdate();

        if (rows > 0) {
            LOG.debugf("Credit consumed: creditGrantId=%s", creditGrantId);
        }
    }

    private String buildGrantCreditPayload(String commandId, UUID creditId, int plays,
                                           long amountCents, UUID tenantId, UUID machineId) {
        ControllerAdapter adapter = controllerAdapterRegistry.forMachine(tenantId, machineId);
        return adapter.buildGrantCreditCommand(new ControllerAdapter.GrantCreditCommand(
                tenantId,
                machineId,
                commandId,
                creditId,
                plays,
                amountCents,
                commandTtlSeconds
        ));
    }

    private void insertDeviceCommand(UUID tenantId, UUID machineId, String commandId, String cmdPayload) {
        em.createNativeQuery(
                "INSERT INTO device_command " +
                "(id, command_id, tenant_id, machine_id, command_type, payload, " +
                " status, expires_at, created_at) " +
                "VALUES (gen_random_uuid(), :cmdId, :tid, :mid, 'GRANT_CREDIT', CAST(:payload AS jsonb), " +
                "'PENDING', :expiry, :now)")
                .setParameter("cmdId", commandId)
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .setParameter("payload", cmdPayload)
                .setParameter("expiry", Instant.now().plusSeconds(commandTtlSeconds))
                .setParameter("now", Instant.now())
                .executeUpdate();
    }
}
