package com.gruahub.payments.application;

import com.gruahub.payments.domain.PaymentProvider;
import com.gruahub.shared.domain.TenantContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class PaymentInitiationService {

    @Inject
    EntityManager em;

    @Inject
    PaymentProviderRegistry providerRegistry;

    public record InitiateResult(
            UUID id,
            String providerTransactionId,
            String provider,
            long amountCents,
            String currency,
            String status,
            String paymentMethod,
            String qrCodeBase64,
            String copyPaste,
            String ticketUrl
    ) {}

    @Transactional
    public InitiateResult initiate(UUID machineId, Long amountCentsOverride, String providerOverride) {
        UUID tenantId = TenantContext.getTenantId();

        Object[] machine = (Object[]) em.createNativeQuery(
                "SELECT id, play_price_cents FROM machine WHERE id = :mid AND tenant_id = :tid"
        )
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .unwrap(org.hibernate.query.Query.class).getSingleResultOrNull();
        if (machine == null) {
            throw new NotFoundException("Machine not found in tenant");
        }

        long amountCents = amountCentsOverride != null && amountCentsOverride > 0
                ? amountCentsOverride
                : ((Number) machine[1]).longValue();
        if (amountCents <= 0) {
            throw new BadRequestException("Invalid amount");
        }

        PaymentProvider provider = providerOverride != null && !providerOverride.isBlank()
                ? providerRegistry.require(providerOverride)
                : providerRegistry.requireDefault();

        UUID paymentId = UUID.randomUUID();
        PaymentProvider.PaymentCreateResult created = provider.createPayment(
                new PaymentProvider.PaymentCreateRequest(
                        paymentId,
                        machineId,
                        tenantId,
                        amountCents,
                        "BRL",
                        "Jogada máquina " + machineId
                )
        );

        em.createNativeQuery(
                "INSERT INTO payment_transaction " +
                "(id, tenant_id, machine_id, provider_transaction_id, provider, " +
                " amount_cents, currency, payment_method, status, metadata, created_at, updated_at) " +
                "VALUES (:id, :tid, :mid, :txId, :provider, :amount, 'BRL', :method, 'PENDING', " +
                " CAST(:metadata AS jsonb), :now, :now)"
        )
                .setParameter("id", paymentId)
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .setParameter("txId", created.providerTransactionId())
                .setParameter("provider", provider.providerName())
                .setParameter("amount", amountCents)
                .setParameter("method", created.paymentMethod())
                .setParameter("metadata", created.metadataJson() != null ? created.metadataJson() : "{}")
                .setParameter("now", Instant.now())
                .executeUpdate();

        return new InitiateResult(
                paymentId,
                created.providerTransactionId(),
                provider.providerName(),
                amountCents,
                "BRL",
                "PENDING",
                created.paymentMethod(),
                created.qrCodeBase64(),
                created.copyPaste(),
                created.ticketUrl()
        );
    }
}
