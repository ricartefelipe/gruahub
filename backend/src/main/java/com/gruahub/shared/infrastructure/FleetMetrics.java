package com.gruahub.shared.infrastructure;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import org.jboss.logging.Logger;

import java.util.concurrent.atomic.AtomicLong;

/**
 * Bean de métricas customizadas do domínio GruaHub.
 *
 * Métricas exportadas (Prometheus):
 *  - gruahub_fleet_online_total        Gauge  — máquinas com status ACTIVE
 *  - gruahub_fleet_total               Gauge  — total de máquinas não RETIRED
 *  - gruahub_fleet_online_ratio        Gauge  — razão online/total [0.0, 1.0]
 *  - gruahub_payment_success_total     Counter — pagamentos confirmados
 *  - gruahub_payment_failure_total     Counter — pagamentos rejeitados/expirados
 *  - gruahub_alert_open_total          Gauge  — alertas com status OPEN
 *  - gruahub_ticket_open_total         Gauge  — chamados de manutenção abertos
 *  - gruahub_visit_duration_seconds    Timer  (incrementado pelo FieldVisitResource)
 *
 * Os Gauges são atualizados a cada 30 s pelo scheduler.
 * Os Counters são incrementados pelas chamadas de negócio via métodos públicos.
 */
@ApplicationScoped
public class FleetMetrics {

    private static final Logger LOG = Logger.getLogger(FleetMetrics.class);

    @Inject
    MeterRegistry registry;

    @Inject
    EntityManager em;

    // ── Estado interno dos Gauges ────────────────────────────────────────────────

    private final AtomicLong fleetOnline  = new AtomicLong(0);
    private final AtomicLong fleetTotal   = new AtomicLong(0);
    private final AtomicLong alertOpen    = new AtomicLong(0);
    private final AtomicLong ticketOpen   = new AtomicLong(0);

    // ── Counters (incrementados por eventos de negócio) ──────────────────────────

    private volatile Counter paymentSuccessCounter;
    private volatile Counter paymentFailureCounter;
    private volatile Counter playStartedCounter;
    private volatile Counter playCompletedWinCounter;

    // ── Timer ────────────────────────────────────────────────────────────────────

    private volatile Timer visitDurationTimer;

    // ── Inicialização ────────────────────────────────────────────────────────────

    void onStart(@jakarta.enterprise.event.Observes io.quarkus.runtime.StartupEvent ev) {
        LOG.info("Registrando métricas customizadas GruaHub");

        Gauge.builder("gruahub.fleet.online", fleetOnline, AtomicLong::get)
            .description("Máquinas com status ACTIVE")
            .register(registry);

        Gauge.builder("gruahub.fleet.total", fleetTotal, AtomicLong::get)
            .description("Total de máquinas ativas no sistema (exceto RETIRED)")
            .register(registry);

        Gauge.builder("gruahub.fleet.online.ratio", this, FleetMetrics::computeRatio)
            .description("Razão máquinas online / total (0.0 a 1.0)")
            .register(registry);

        Gauge.builder("gruahub.alert.open", alertOpen, AtomicLong::get)
            .description("Alertas com status OPEN")
            .register(registry);

        Gauge.builder("gruahub.ticket.open", ticketOpen, AtomicLong::get)
            .description("Chamados de manutenção com status OPEN ou IN_PROGRESS")
            .register(registry);

        paymentSuccessCounter = Counter.builder("gruahub.payment.success")
            .description("Pagamentos confirmados com sucesso")
            .register(registry);

        paymentFailureCounter = Counter.builder("gruahub.payment.failure")
            .description("Pagamentos rejeitados ou expirados")
            .register(registry);

        playStartedCounter = Counter.builder("gruahub.play.started")
            .description("Jogadas iniciadas")
            .register(registry);

        playCompletedWinCounter = Counter.builder("gruahub.play.win")
            .description("Jogadas vencidas (prêmio capturado)")
            .register(registry);

        visitDurationTimer = Timer.builder("gruahub.visit.duration")
            .description("Duração das visitas técnicas de campo (checkin → checkout)")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry);
    }

    // ── Scheduler: atualiza Gauges a cada 30 s ───────────────────────────────────

    @Scheduled(every = "30s", delayed = "5s")
    void refreshGauges() {
        try {
            Long online = (Long) em.createNativeQuery(
                "SELECT COUNT(*) FROM machine WHERE status = 'ACTIVE'"
            ).getSingleResult();
            fleetOnline.set(online != null ? online : 0L);

            Long total = (Long) em.createNativeQuery(
                "SELECT COUNT(*) FROM machine WHERE status <> 'RETIRED'"
            ).getSingleResult();
            fleetTotal.set(total != null ? total : 0L);

            Long alerts = (Long) em.createNativeQuery(
                "SELECT COUNT(*) FROM alert WHERE status = 'OPEN'"
            ).getSingleResult();
            alertOpen.set(alerts != null ? alerts : 0L);

            Long tickets = (Long) em.createNativeQuery(
                "SELECT COUNT(*) FROM maintenance_ticket WHERE status IN ('OPEN','IN_PROGRESS')"
            ).getSingleResult();
            ticketOpen.set(tickets != null ? tickets : 0L);

        } catch (Exception ex) {
            LOG.warnf("Falha ao atualizar gauges de frota: %s", ex.getMessage());
        }
    }

    // ── API pública para eventos de negócio ──────────────────────────────────────

    /**
     * Chame quando um pagamento for confirmado (PaymentWebhookService).
     */
    public void recordPaymentSuccess() {
        if (paymentSuccessCounter != null) paymentSuccessCounter.increment();
    }

    /**
     * Chame quando um pagamento falhar/expirar (PaymentWebhookService).
     */
    public void recordPaymentFailure() {
        if (paymentFailureCounter != null) paymentFailureCounter.increment();
    }

    /**
     * Chame quando uma jogada for iniciada (IoT event processor).
     */
    public void recordPlayStarted() {
        if (playStartedCounter != null) playStartedCounter.increment();
    }

    /**
     * Chame quando o resultado da jogada for WIN.
     */
    public void recordPlayWin() {
        if (playCompletedWinCounter != null) playCompletedWinCounter.increment();
    }

    /**
     * Registra a duração de uma visita.
     * @param durationSeconds duração total em segundos (checkout - checkin)
     */
    public void recordVisitDuration(long durationSeconds) {
        if (visitDurationTimer != null) {
            visitDurationTimer.record(durationSeconds, java.util.concurrent.TimeUnit.SECONDS);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    private double computeRatio() {
        long total = fleetTotal.get();
        if (total == 0) return 0.0;
        return (double) fleetOnline.get() / total;
    }
}
