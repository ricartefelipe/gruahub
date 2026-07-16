# GruaHub — Observabilidade

## Stack

| Sinal    | Coleta              | Armazenamento  | Visualização |
|----------|---------------------|----------------|--------------|
| Métricas | Micrometer          | Prometheus     | Grafana      |
| Traces   | OpenTelemetry OTLP  | Jaeger         | Jaeger UI    |
| Logs     | JBoss Logging (JSON)| Loki / ELK     | Grafana      |
| Health   | SmallRye Health     | —              | `/q/health`  |

## Endpoints

| Endpoint         | Descrição                           |
|------------------|-------------------------------------|
| `/q/health`      | Agregado (live + ready)             |
| `/q/health/live` | Liveness probe (k8s/ECS)            |
| `/q/health/ready`| Readiness probe (k8s/ECS)           |
| `/q/metrics`     | Prometheus scrape endpoint          |
| `/q/openapi`     | OpenAPI 3.1 spec (JSON/YAML)        |

## Métricas Customizadas do Domínio (FleetMetrics)

Todas com prefixo `gruahub_` no formato Prometheus:

| Métrica                       | Tipo    | Descrição                                   |
|-------------------------------|---------|---------------------------------------------|
| `gruahub_fleet_online_total`  | Gauge   | Máquinas com status `ACTIVE`                |
| `gruahub_fleet_total`         | Gauge   | Total de máquinas (excl. RETIRED)           |
| `gruahub_fleet_online_ratio`  | Gauge   | Razão online/total [0.0–1.0]                |
| `gruahub_payment_success_total`| Counter| Pagamentos confirmados                      |
| `gruahub_payment_failure_total`| Counter| Pagamentos rejeitados/expirados             |
| `gruahub_play_started_total`  | Counter | Jogadas iniciadas                           |
| `gruahub_play_win_total`      | Counter | Jogadas vencidas (prêmio capturado)         |
| `gruahub_alert_open_total`    | Gauge   | Alertas com status OPEN                     |
| `gruahub_ticket_open_total`   | Gauge   | Chamados abertos / em andamento             |
| `gruahub_visit_duration_seconds`| Timer | Duração visitas de campo (p50, p95, p99)    |

Atualização dos Gauges: scheduler a cada 30 s.
Counters: incrementados em tempo real pelos eventos de negócio.

## Logs Estruturados

Todos os logs saem em JSON no stdout com os campos:

```json
{
  "timestamp": "2026-07-16T12:00:00.123Z",
  "level": "INFO",
  "loggerName": "com.gruahub.fleet.api.MachineResource",
  "message": "[tid=11111111-0000-0000-0000-000000000001] GET /machines",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "traceId": "abcdef1234567890",
  "spanId": "1234567890abcdef"
}
```

**Regras de logs:**
- Nunca logar tokens, senhas, `client_secret` ou `client_operation_id` de forma integral
- Nunca logar payloads financeiros completos (apenas IDs e valores agregados)
- Usar `LOG.debugf("[%s] ...", tenantId, ...)` para rastreabilidade
- Nível INFO ou acima em produção; DEBUG apenas em dev/staging

## Correlation ID

Cada requisição HTTP recebe um `X-Correlation-Id` (gerado pelo frontend se ausente,
propagado pelo backend para todos os logs, eventos de domínio e audit records).

Configuração no Quarkus:
```properties
quarkus.log.console.json=true
quarkus.opentelemetry.enabled=true
quarkus.opentelemetry.tracer.exporter.otlp.endpoint=http://jaeger:4317
```

## Alertas Operacionais (Prometheus Alertmanager)

Exemplos de regras sugeridas para produção:

```yaml
groups:
  - name: gruahub
    rules:
      - alert: FleetOnlineRatioCritical
        expr: gruahub_fleet_online_ratio < 0.5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Menos de 50% das máquinas online"

      - alert: OpenAlertsHigh
        expr: gruahub_alert_open_total > 10
        for: 10m
        labels:
          severity: warning

      - alert: PaymentFailureRateHigh
        expr: rate(gruahub_payment_failure_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
```

## Dashboards Grafana

Importar painéis da pasta `infra/grafana/dashboards/` (a criar em pós-MVP):
- **GruaHub Fleet Overview** — ratio online, alertas, tickets
- **GruaHub Payments** — success/failure rate, latência de webhook
- **GruaHub Field Ops** — visitas por dia, duração média, cash coletado
