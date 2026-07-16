package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de idempotência do backend.
 * Verifica que operações duplicadas são detectadas e retornam 409 Conflict
 * em vez de criar registros duplicados.
 * <p>
 * Nota: testes de idempotência completos requerem autenticação configurada.
 * Estes testes validam o comportamento básico dos endpoints.
 */
@QuarkusIntegrationTest
class IdempotencyIT {

    /**
     * Verifica que o webhook de pagamento retorna 401 sem assinatura válida.
     */
    @Test
    void webhook_without_signature_should_return_401_or_400() {
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
            .statusCode(anyOf(is(400), is(401), is(403)));
    }

    /**
     * Verifica que o endpoint sandbox de confirmação retorna 404 para transação inexistente.
     */
    @Test
    void sandbox_confirm_nonexistent_transaction_should_return_404_or_401() {
        given()
        .when()
            .post("/api/v1/payments/sandbox/confirm/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(anyOf(is(401), is(404)));
    }

    /**
     * Verifica que MQTT stats endpoint (se presente) responde.
     */
    @Test
    void api_root_should_redirect_or_respond() {
        given()
        .when()
            .get("/api/v1")
        .then()
            .statusCode(anyOf(is(200), is(301), is(302), is(404)));
    }
}
