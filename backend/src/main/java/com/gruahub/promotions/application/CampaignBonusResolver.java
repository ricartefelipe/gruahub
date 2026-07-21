package com.gruahub.promotions.application;

import com.gruahub.plays.application.PlayGrantCalculator;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class CampaignBonusResolver {

    public record ActiveCampaign(
            UUID id,
            String ruleType,
            int extraBonusPlays,
            Integer buyN,
            Integer getM
    ) {}

    @Inject
    EntityManager em;

    public Optional<ActiveCampaign> findActive(UUID tenantId, UUID machineId, Instant at) {
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, rule_type, COALESCE(extra_bonus_plays, 0), buy_n, get_m " +
                "FROM promotion_campaign " +
                "WHERE tenant_id = :tid " +
                "  AND status = 'ACTIVE' " +
                "  AND starts_at <= :at " +
                "  AND (ends_at IS NULL OR ends_at > :at) " +
                "  AND (machine_id IS NULL OR machine_id = :mid) " +
                "ORDER BY CASE WHEN machine_id IS NOT NULL THEN 0 ELSE 1 END, created_at DESC " +
                "LIMIT 1")
                .setParameter("tid", tenantId)
                .setParameter("mid", machineId)
                .setParameter("at", at)
                .getResultList();

        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Object[] row = rows.get(0);
        return Optional.of(new ActiveCampaign(
                UUID.fromString(row[0].toString()),
                row[1].toString(),
                ((Number) row[2]).intValue(),
                row[3] == null ? null : ((Number) row[3]).intValue(),
                row[4] == null ? null : ((Number) row[4]).intValue()
        ));
    }

    public int extraPlaysForPayment(UUID tenantId, UUID machineId, int basePlays, Instant at) {
        return findActive(tenantId, machineId, at)
                .map(c -> PlayGrantCalculator.campaignExtraPlays(
                        basePlays, c.ruleType(), c.extraBonusPlays(), c.buyN(), c.getM()))
                .orElse(0);
    }
}
