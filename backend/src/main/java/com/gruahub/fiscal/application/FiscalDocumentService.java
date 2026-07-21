package com.gruahub.fiscal.application;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gruahub.fiscal.domain.FiscalDocumentStatus;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@ApplicationScoped
public class FiscalDocumentService {

    public static final String TYPE_PAYMENT_RECEIPT_DRAFT = "PAYMENT_RECEIPT_DRAFT";

    private static final Logger LOG = Logger.getLogger(FiscalDocumentService.class);

    @Inject
    EntityManager em;

    @Inject
    ObjectMapper objectMapper;

    public record FiscalDocumentView(
            UUID id,
            String documentType,
            String status,
            UUID paymentTransactionId,
            UUID settlementId,
            long amountCents,
            String currency,
            String issuerDocument,
            String issuerName,
            Instant issuedAt,
            Instant cancelledAt,
            Instant createdAt
    ) {}

    @Transactional
    public UUID createPaymentReceiptDraft(UUID tenantId, UUID paymentId) {
        Object existing = em.createNativeQuery(
                "SELECT id FROM fiscal_document " +
                "WHERE payment_transaction_id = :pid AND tenant_id = :tid")
                .setParameter("pid", paymentId)
                .setParameter("tid", tenantId)
                .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (existing != null) {
            return UUID.fromString(existing.toString());
        }

        @SuppressWarnings("unchecked")
        List<Object[]> payments = em.createNativeQuery(
                "SELECT pt.id, pt.amount_cents, pt.currency, pt.machine_id, m.asset_number, m.name, " +
                "t.name, t.document_number, pt.provider, pt.provider_transaction_id, pt.confirmed_at " +
                "FROM payment_transaction pt " +
                "JOIN machine m ON m.id = pt.machine_id AND m.tenant_id = pt.tenant_id " +
                "JOIN tenant t ON t.id = pt.tenant_id " +
                "WHERE pt.id = :pid AND pt.tenant_id = :tid AND pt.status = 'CONFIRMED'")
                .setParameter("pid", paymentId)
                .setParameter("tid", tenantId)
                .getResultList();
        if (payments.isEmpty()) {
            throw new NotFoundException("Confirmed payment not found: " + paymentId);
        }

        Object[] p = payments.get(0);
        long amountCents = ((Number) p[1]).longValue();
        String currency = p[2] == null ? "BRL" : p[2].toString();
        UUID machineId = UUID.fromString(p[3].toString());
        String assetNumber = p[4] == null ? null : p[4].toString();
        String machineName = p[5] == null ? null : p[5].toString();
        String issuerName = p[6] == null ? "Tenant" : p[6].toString();
        String issuerDocument = p[7] == null ? null : p[7].toString();
        String provider = p[8] == null ? null : p[8].toString();
        String providerTx = p[9] == null ? null : p[9].toString();
        String confirmedAt = p[10] == null ? Instant.now().toString() : p[10].toString();

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        Map<String, Object> snapshotMap = new LinkedHashMap<>();
        snapshotMap.put("paymentId", paymentId.toString());
        snapshotMap.put("machineId", machineId.toString());
        snapshotMap.put("assetNumber", assetNumber);
        snapshotMap.put("machineName", machineName);
        snapshotMap.put("amountCents", amountCents);
        snapshotMap.put("currency", currency);
        snapshotMap.put("provider", provider);
        snapshotMap.put("providerTransactionId", providerTx);
        snapshotMap.put("confirmedAt", confirmedAt);
        snapshotMap.put("issuerName", issuerName);
        snapshotMap.put("issuerDocument", issuerDocument);
        snapshotMap.put("disclaimer", "DOCUMENTO NAO FISCAL — STUB (sem transmissao SEFAZ)");

        String snapshot;
        try {
            snapshot = objectMapper.writeValueAsString(snapshotMap);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize fiscal snapshot", e);
        }

        em.createNativeQuery(
                "INSERT INTO fiscal_document " +
                "(id, tenant_id, document_type, status, payment_transaction_id, settlement_id, " +
                " amount_cents, currency, issuer_document, issuer_name, snapshot, " +
                " created_at, updated_at) " +
                "VALUES (:id, :tid, :dtype, 'DRAFT', :pid, NULL, :amount, :currency, " +
                " :issuerDoc, :issuerName, CAST(:snapshot AS jsonb), :now, :now)")
                .setParameter("id", id)
                .setParameter("tid", tenantId)
                .setParameter("dtype", TYPE_PAYMENT_RECEIPT_DRAFT)
                .setParameter("pid", paymentId)
                .setParameter("amount", amountCents)
                .setParameter("currency", currency)
                .setParameter("issuerDoc", issuerDocument)
                .setParameter("issuerName", issuerName)
                .setParameter("snapshot", snapshot)
                .setParameter("now", now)
                .executeUpdate();

        return id;
    }

    @Transactional
    public void tryCreatePaymentReceiptDraft(UUID tenantId, UUID paymentId) {
        try {
            createPaymentReceiptDraft(tenantId, paymentId);
        } catch (Exception e) {
            LOG.warnf("Fiscal draft skipped for payment %s: %s", paymentId, e.getMessage());
        }
    }

    @Transactional
    public FiscalDocumentView issueStub(UUID tenantId, UUID documentId) {
        FiscalDocumentView current = get(tenantId, documentId);
        FiscalDocumentStatus from = FiscalDocumentStatus.from(current.status());
        if (!from.canTransitionTo(FiscalDocumentStatus.ISSUED_STUB)) {
            throw new BadRequestException("Cannot issue stub from status " + current.status());
        }
        Instant now = Instant.now();
        em.createNativeQuery(
                "UPDATE fiscal_document SET status = 'ISSUED_STUB', issued_at = :now, updated_at = :now " +
                "WHERE id = :id AND tenant_id = :tid AND status = 'DRAFT'")
                .setParameter("now", now)
                .setParameter("id", documentId)
                .setParameter("tid", tenantId)
                .executeUpdate();
        return get(tenantId, documentId);
    }

    @Transactional
    public FiscalDocumentView cancel(UUID tenantId, UUID documentId) {
        FiscalDocumentView current = get(tenantId, documentId);
        FiscalDocumentStatus from = FiscalDocumentStatus.from(current.status());
        if (!from.canTransitionTo(FiscalDocumentStatus.CANCELLED)) {
            throw new BadRequestException("Cannot cancel from status " + current.status());
        }
        Instant now = Instant.now();
        em.createNativeQuery(
                "UPDATE fiscal_document SET status = 'CANCELLED', cancelled_at = :now, updated_at = :now " +
                "WHERE id = :id AND tenant_id = :tid AND status IN ('DRAFT', 'ISSUED_STUB')")
                .setParameter("now", now)
                .setParameter("id", documentId)
                .setParameter("tid", tenantId)
                .executeUpdate();
        return get(tenantId, documentId);
    }

    public FiscalDocumentView get(UUID tenantId, UUID documentId) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, document_type, status, payment_transaction_id, settlement_id, " +
                "amount_cents, currency, issuer_document, issuer_name, issued_at, cancelled_at, created_at " +
                "FROM fiscal_document WHERE id = :id AND tenant_id = :tid")
                .setParameter("id", documentId)
                .setParameter("tid", tenantId)
                .getResultList();
        if (rows.isEmpty()) {
            throw new NotFoundException("Fiscal document not found: " + documentId);
        }
        return map(rows.get(0));
    }

    public Map<String, Object> loadSnapshot(UUID tenantId, UUID documentId) {
        Object raw = em.createNativeQuery(
                "SELECT snapshot::text FROM fiscal_document WHERE id = :id AND tenant_id = :tid")
                .setParameter("id", documentId)
                .setParameter("tid", tenantId)
                .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (raw == null) {
            throw new NotFoundException("Fiscal document not found: " + documentId);
        }
        try {
            return objectMapper.readValue(raw.toString(), new TypeReference<>() {});
        } catch (Exception e) {
            throw new IllegalStateException("Invalid fiscal snapshot", e);
        }
    }

    private static FiscalDocumentView map(Object[] r) {
        return new FiscalDocumentView(
                UUID.fromString(r[0].toString()),
                r[1].toString(),
                r[2].toString(),
                r[3] == null ? null : UUID.fromString(r[3].toString()),
                r[4] == null ? null : UUID.fromString(r[4].toString()),
                ((Number) r[5]).longValue(),
                r[6] == null ? "BRL" : r[6].toString(),
                r[7] == null ? null : r[7].toString(),
                r[8] == null ? null : r[8].toString(),
                toInstant(r[9]),
                toInstant(r[10]),
                toInstant(r[11])
        );
    }

    private static Instant toInstant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof java.sql.Timestamp ts) {
            return ts.toInstant();
        }
        return Instant.parse(value.toString());
    }
}
