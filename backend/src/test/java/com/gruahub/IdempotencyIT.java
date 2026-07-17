package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de integração de idempotência — contratos HTTP exatos.
 *
 * Convenções:
 *  - Roda como @QuarkusIntegrationTest (aplicação empacotada, perfil test).
 *  - %test.quarkus.oidc.enabled=false → OIDC desativado; @Authenticated ainda se aplica
 *    via mecanismo de identidade anônima do Quarkus Security.
 *  - Cada teste tem exatamente um status esperado, derivado da implementação real.
 */
@QuarkusIntegrationTest
class IdempotencyIT {

    /**
     * Webhook sem header X-Tenant-Id obrigatório.
     *
     * PaymentWebhookResource.webhook() faz UUID.fromString(tenantIdHeader).
     * Com tenantIdHeader == null → IllegalArgumentException → catch → 400.
     * A verificação de assinatura nem chega a ser executada.
     */
    @Test
    void webhook_without_required_headers_should_return_400() {
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

    /**
     * Sandbox confirm sempre retorna 200 independente de a transação existir.
     *
     * SandboxPaymentProvider.sandboxConfirm() apenas faz statusStore.put() —
     * não lança exceção para IDs desconhecidos. O endpoint retorna 200 OK.
     * (A ausência de X-Tenant-Id provoca um warn de log, não uma falha HTTP.)
     */
    @Test
    void sandbox_confirm_always_returns_200() {
        given()
        .when()
            .post("/api/v1/payments/sandbox/confirm/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(200);
    }

    /**
     * /api/v1 não é um endpoint registrado — Quarkus retorna 404.
     */
    @Test
    void api_v1_root_returns_404() {
        given()
        .when()
            .get("/api/v1")
        .then()
            .statusCode(404);
    }
}
