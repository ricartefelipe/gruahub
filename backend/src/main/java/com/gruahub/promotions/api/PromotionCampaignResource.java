package com.gruahub.promotions.api;

import com.gruahub.plays.application.PlayGrantCalculator;
import com.gruahub.shared.api.PageResponse;
import com.gruahub.shared.domain.TenantContext;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Path("/api/v1/promotions/campaigns")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
@RequestScoped
@Tag(name = "Promotions", description = "Campanhas promocionais de jogadas")
public class PromotionCampaignResource {

    private static final Set<String> STATUSES = Set.of("DRAFT", "ACTIVE", "PAUSED");
    private static final Set<String> RULES = Set.of(
            PlayGrantCalculator.RULE_EXTRA_BONUS,
            PlayGrantCalculator.RULE_BUY_N_GET_M
    );

    @Inject
    EntityManager em;

    public record CampaignRequest(
            @NotBlank @Size(max = 160) String name,
            @NotBlank String status,
            @NotNull Instant startsAt,
            Instant endsAt,
            UUID machineId,
            @NotBlank String ruleType,
            @Min(0) Integer extraBonusPlays,
            @Min(1) Integer buyN,
            @Min(1) Integer getM
    ) {}

    public record CampaignResponse(
            UUID id,
            String name,
            String status,
            Instant startsAt,
            Instant endsAt,
            UUID machineId,
            String ruleType,
            int extraBonusPlays,
            Integer buyN,
            Integer getM,
            Instant createdAt,
            Instant updatedAt
    ) {}

    @GET
    @Operation(summary = "Listar campanhas promocionais")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "FINANCE"})
    public PageResponse<CampaignResponse> list(
            @QueryParam("status") String status,
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("50") int size
    ) {
        UUID tenantId = TenantContext.getTenantId();
        int lim = Math.min(Math.max(size, 1), 200);
        StringBuilder where = new StringBuilder("WHERE tenant_id = :tid ");
        if (status != null && !status.isBlank()) {
            where.append("AND status = :st ");
        }

        var countQ = em.createNativeQuery("SELECT COUNT(*) FROM promotion_campaign " + where)
                .setParameter("tid", tenantId);
        if (status != null && !status.isBlank()) {
            countQ.setParameter("st", status.trim().toUpperCase(Locale.ROOT));
        }
        long total = ((Number) countQ.getSingleResult()).longValue();

        var q = em.createNativeQuery(
                "SELECT id, name, status, starts_at, ends_at, machine_id, rule_type, " +
                "extra_bonus_plays, buy_n, get_m, created_at, updated_at " +
                "FROM promotion_campaign " + where +
                "ORDER BY created_at DESC LIMIT :lim OFFSET :off")
                .setParameter("tid", tenantId)
                .setParameter("lim", lim)
                .setParameter("off", page * lim);
        if (status != null && !status.isBlank()) {
            q.setParameter("st", status.trim().toUpperCase(Locale.ROOT));
        }

        @SuppressWarnings("unchecked")
        List<Object[]> rows = q.getResultList();
        return PageResponse.of(rows.stream().map(this::mapRow).toList(), page, lim, total);
    }

    @GET
    @Path("/{id}")
    @Operation(summary = "Detalhe de campanha")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "FINANCE"})
    public CampaignResponse get(@PathParam("id") UUID id) {
        return load(id);
    }

    @POST
    @Transactional
    @Operation(summary = "Criar campanha promocional")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER"})
    public Response create(@Valid CampaignRequest request) {
        validate(request);
        UUID tenantId = TenantContext.getTenantId();
        ensureMachine(tenantId, request.machineId());

        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        String status = normalizeStatus(request.status());
        String ruleType = normalizeRule(request.ruleType());

        em.createNativeQuery(
                "INSERT INTO promotion_campaign " +
                "(id, tenant_id, name, status, starts_at, ends_at, machine_id, rule_type, " +
                " extra_bonus_plays, buy_n, get_m, created_at, updated_at) " +
                "VALUES (:id, :tid, :name, :status, :starts, :ends, :mid, :rule, " +
                " :extra, :buyN, :getM, :now, :now)")
                .setParameter("id", id)
                .setParameter("tid", tenantId)
                .setParameter("name", request.name().trim())
                .setParameter("status", status)
                .setParameter("starts", request.startsAt())
                .setParameter("ends", request.endsAt())
                .setParameter("mid", request.machineId())
                .setParameter("rule", ruleType)
                .setParameter("extra", ruleType.equals(PlayGrantCalculator.RULE_EXTRA_BONUS)
                        ? Math.max(0, request.extraBonusPlays() == null ? 0 : request.extraBonusPlays())
                        : 0)
                .setParameter("buyN", ruleType.equals(PlayGrantCalculator.RULE_BUY_N_GET_M) ? request.buyN() : null)
                .setParameter("getM", ruleType.equals(PlayGrantCalculator.RULE_BUY_N_GET_M) ? request.getM() : null)
                .setParameter("now", now)
                .executeUpdate();

        return Response.status(201).entity(load(id)).build();
    }

    @PATCH
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Atualizar campanha promocional")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER"})
    public CampaignResponse update(@PathParam("id") UUID id, @Valid CampaignRequest request) {
        validate(request);
        UUID tenantId = TenantContext.getTenantId();
        load(id);
        ensureMachine(tenantId, request.machineId());

        String status = normalizeStatus(request.status());
        String ruleType = normalizeRule(request.ruleType());

        int updated = em.createNativeQuery(
                "UPDATE promotion_campaign SET " +
                " name = :name, status = :status, starts_at = :starts, ends_at = :ends, " +
                " machine_id = :mid, rule_type = :rule, extra_bonus_plays = :extra, " +
                " buy_n = :buyN, get_m = :getM, updated_at = :now " +
                "WHERE id = :id AND tenant_id = :tid")
                .setParameter("name", request.name().trim())
                .setParameter("status", status)
                .setParameter("starts", request.startsAt())
                .setParameter("ends", request.endsAt())
                .setParameter("mid", request.machineId())
                .setParameter("rule", ruleType)
                .setParameter("extra", ruleType.equals(PlayGrantCalculator.RULE_EXTRA_BONUS)
                        ? Math.max(0, request.extraBonusPlays() == null ? 0 : request.extraBonusPlays())
                        : 0)
                .setParameter("buyN", ruleType.equals(PlayGrantCalculator.RULE_BUY_N_GET_M) ? request.buyN() : null)
                .setParameter("getM", ruleType.equals(PlayGrantCalculator.RULE_BUY_N_GET_M) ? request.getM() : null)
                .setParameter("now", Instant.now())
                .setParameter("id", id)
                .setParameter("tid", tenantId)
                .executeUpdate();

        if (updated == 0) {
            throw new NotFoundException("Campaign not found: " + id);
        }
        return load(id);
    }

    private CampaignResponse load(UUID id) {
        UUID tenantId = TenantContext.getTenantId();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery(
                "SELECT id, name, status, starts_at, ends_at, machine_id, rule_type, " +
                "extra_bonus_plays, buy_n, get_m, created_at, updated_at " +
                "FROM promotion_campaign WHERE id = :id AND tenant_id = :tid")
                .setParameter("id", id)
                .setParameter("tid", tenantId)
                .getResultList();
        if (rows.isEmpty()) {
            throw new NotFoundException("Campaign not found: " + id);
        }
        return mapRow(rows.get(0));
    }

    private CampaignResponse mapRow(Object[] r) {
        return new CampaignResponse(
                UUID.fromString(r[0].toString()),
                (String) r[1],
                (String) r[2],
                toInstant(r[3]),
                r[4] == null ? null : toInstant(r[4]),
                r[5] == null ? null : UUID.fromString(r[5].toString()),
                (String) r[6],
                ((Number) r[7]).intValue(),
                r[8] == null ? null : ((Number) r[8]).intValue(),
                r[9] == null ? null : ((Number) r[9]).intValue(),
                toInstant(r[10]),
                toInstant(r[11])
        );
    }

    private static Instant toInstant(Object value) {
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof java.sql.Timestamp ts) {
            return ts.toInstant();
        }
        if (value instanceof java.util.Date date) {
            return date.toInstant();
        }
        return Instant.parse(value.toString());
    }

    private void validate(CampaignRequest request) {
        String status = normalizeStatus(request.status());
        String rule = normalizeRule(request.ruleType());
        if (!STATUSES.contains(status)) {
            throw new IllegalArgumentException("Invalid status: " + request.status());
        }
        if (!RULES.contains(rule)) {
            throw new IllegalArgumentException("Invalid ruleType: " + request.ruleType());
        }
        if (request.endsAt() != null && !request.endsAt().isAfter(request.startsAt())) {
            throw new IllegalArgumentException("endsAt must be after startsAt");
        }
        if (PlayGrantCalculator.RULE_EXTRA_BONUS.equals(rule)) {
            int extra = request.extraBonusPlays() == null ? 0 : request.extraBonusPlays();
            if (extra < 1) {
                throw new IllegalArgumentException("extraBonusPlays must be >= 1 for EXTRA_BONUS");
            }
        }
        if (PlayGrantCalculator.RULE_BUY_N_GET_M.equals(rule)) {
            if (request.buyN() == null || request.getM() == null) {
                throw new IllegalArgumentException("buyN and getM are required for BUY_N_GET_M");
            }
        }
    }

    private void ensureMachine(UUID tenantId, UUID machineId) {
        if (machineId == null) {
            return;
        }
        long count = ((Number) em.createNativeQuery(
                "SELECT COUNT(*) FROM machine WHERE id = :mid AND tenant_id = :tid")
                .setParameter("mid", machineId)
                .setParameter("tid", tenantId)
                .getSingleResult()).longValue();
        if (count == 0) {
            throw new NotFoundException("Machine not found: " + machineId);
        }
    }

    private static String normalizeStatus(String status) {
        return status.trim().toUpperCase(Locale.ROOT);
    }

    private static String normalizeRule(String ruleType) {
        return ruleType.trim().toUpperCase(Locale.ROOT);
    }
}
