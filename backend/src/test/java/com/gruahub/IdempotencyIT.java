package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de integração para endpoints de pagamento e APIs públicas.
 * <p>
 * Contratos derivados da análise do código-fonte — nenhum anyOf().
 *
 * Análise realizada em:
 * - PaymentWebhookResource: POST /webhook/{provider} — X-Tenant-Id obrigatório;
 *   UUID.fromString(null) lança IllegalArgumentException → catch → 400.
 * - SandboxPaymentProvider.sandboxConfirm: statusStore.put() sem throw → 200.
 * - GET /api/v1 — não existe rota → 404 do framework JAX-RS.
 */
@QuarkusIntegrationTest
class IdempotencyIT {

    /**
     * Webhook sem header X-Tenant-Id → 400 Bad Request.
     *
     * PaymentWebhookResource faz UUID.fromString(header "X-Tenant-Id").
     * Com header ausente, o valor é null → UUID.fromString(null) →
     * IllegalArgumentException → catch → Response.status(400).
     *
     * Contrato exato: 400 (não 401, não 403).
     */
    @Test
    void webhook_without_tenant_header_returns_400() {
        given()
            .contentType(ContentType.JSON)
            .body("""
                {
                  "eventKey": "test-key",
                  "eventType": "PAYMENT_CONFIRMED",
                  "transactionId": "txn-test-001"
                }
                """)
        .when()
            .post("/api/v1/payments/webhook/SANDBOX")
        .then()
            .statusCode(400);
    }

    @Test
    void sandbox_confirm_returns_404_when_sandbox_disabled_in_packaged_app() {
        given()
        .when()
            .post("/api/v1/payments/sandbox/confirm/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(404);
    }

    /**
     * GET /api/v1 — rota inexistente → 404.
     *
     * Nenhum recurso JAX-RS está mapeado para /api/v1 sem path adicional.
     * Quarkus retorna 404 para rotas não mapeadas.
     *
     * Contrato exato: 404 (não 200, não 301, não 302).
     */
    @Test
    void api_root_returns_404() {
        given()
        .when()
            .get("/api/v1")
        .then()
            .statusCode(404);
    }

    /**
     * Health endpoint da aplicação responde com UP.
     * Smoke test para garantir que a aplicação inicializou corretamente.
     */
    @Test
    void application_health_reports_up() {
        given()
        .when()
            .get("/q/health/live")
        .then()
            .statusCode(200)
            .body("status", equalTo("UP"));
    }
}
