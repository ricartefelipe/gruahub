package com.gruahub.plays.application;

import com.gruahub.iot.infra.MqttClientService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class CreditService {

    private static final Logger LOG = Logger.getLogger(CreditService.class);

    @Inject
    EntityManager em;

    @Inject
    MqttClientService mqttClientService;

    /**
     * Cria e envia crédito para a máquina após confirmação de pagamento.
     * Garantia: apenas um crédito por payment_transaction_id (constraint UNIQUE).
     */
    @Transactional
    public UUID grantCreditForPayment(UUID tenantId, UUID machineId,
                                       UUID paymentTransactionId, long amountCents,
                                       int playsGranted) {
        UUID creditId = UUID.randomUUID();
        String commandId = UUID.randomUUID().toString();

        em.createNativeQuery(
                "INSERT INTO credit_grant (id, tenant_id, machine_id, payment_transaction_id, " +
                "amount_cents, plays_granted, reason, status, command_id, created_at) " +
                "VALUES (:id, :tid, :mid, :pid, :amt, :plays, 'PAYMENT', 'PENDING', :cmdId, :now)")
                .setParameter("id", creditId)
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .setParameter("pid", paymentTransactionId)
                .setParameter("amt", amountCents)
                .setParameter("plays", playsGranted)
                .setParameter("cmdId", commandId)
                .setParameter("now", Instant.now())
                .executeUpdate();

        // Publicar comando MQTT para a máquina (via outbox para garantir entrega)
        String cmdPayload = buildCreditCommand(commandId, creditId, playsGranted, amountCents, tenantId, machineId);
        mqttClientService.publishCommand(tenantId.toString(), machineId.toString(), cmdPayload);

        em.createNativeQuery(
                "UPDATE credit_grant SET status = 'SENT', sent_at = :now WHERE id = :id")
                .setParameter("now", Instant.now())
                .setParameter("id", creditId)
                .executeUpdate();

        LOG.infof("Credit granted: creditId=%s machineId=%s plays=%d", creditId, machineId, playsGranted);
        return creditId;
    }

    @Transactional
    public void acknowledgeCredit(UUID creditGrantId, UUID tenantId) {
        em.createNativeQuery(
                "UPDATE credit_grant SET status = 'ACKNOWLEDGED', acked_at = :now " +
                "WHERE id = :id AND tenant_id = :tid AND status IN ('SENT', 'PENDING')")
                .setParameter("now", Instant.now())
                .setParameter("id", creditGrantId)
                .setParameter("tid", tenantId)
                .executeUpdate();
    }

    @Transactional
    public void consumeCredit(UUID creditGrantId, UUID tenantId) {
        em.createNativeQuery(
                "UPDATE credit_grant SET status = 'CONSUMED', consumed_at = :now " +
                "WHERE id = :id AND tenant_id = :tid AND status IN ('ACKNOWLEDGED', 'SENT')")
                .setParameter("now", Instant.now())
                .setParameter("id", creditGrantId)
                .setParameter("tid", tenantId)
                .executeUpdate();
    }

    private String buildCreditCommand(String commandId, UUID creditId, int plays,
                                       long amountCents, UUID tenantId, UUID machineId) {
        return String.format("""
                {
                  "messageId": "%s",
                  "schemaVersion": 1,
                  "tenantId": "%s",
                  "machineId": "%s",
                  "type": "GRANT_CREDIT",
                  "occurredAt": "%s",
                  "payload": {
                    "commandId": "%s",
                    "creditGrantId": "%s",
                    "playsGranted": %d,
                    "amountCents": %d,
                    "ttlSeconds": 60
                  }
                }""",
                commandId, tenantId, machineId, Instant.now(), commandId, creditId, plays, amountCents);
    }
}
