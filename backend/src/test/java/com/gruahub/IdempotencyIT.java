package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de idempotência do backend.
 * Verifica que operações sem autenticação retornam exatamente 401,
 * e que endpoints inexistentes retornam exatamente 404.
 *
 * Contratos exatos — sem anyOf — conforme regra de qualidade do projeto.
 */
@QuarkusIntegrationTest
class IdempotencyIT {

    /**
     * Webhook sem assinatura HMAC válida deve retornar 401 Unauthorized.
     *
     * Contrato: o endpoint valida o header X-Signature antes de processar o body.
     * Ausência ou valor inválido → 401 (não 400, pois é falha de autenticação do
     * provedor, não de formato do body).
     */
    @Test
    void webhook_without_signature_should_return_401() {
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
            .statusCode(401);
    }

    /**
     * Endpoint sandbox sem token de autenticação deve retornar 401.
     *
     * Contrato: o endpoint /sandbox/confirm requer token JWT válido.
     * Sem token → 401 antes de qualquer busca pelo transactionId.
     */
    @Test
    void sandbox_confirm_without_auth_should_return_401() {
        given()
        .when()
            .post("/api/v1/payments/sandbox/confirm/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(401);
    }

    /**
     * /api/v1 não é um endpoint mapeado — deve retornar 404 Not Found.
     *
     * Contrato: o Quarkus retorna 404 para rotas não registradas.
     */
    @Test
    void api_root_unmapped_should_return_404() {
        given()
        .when()
            .get("/api/v1")
        .then()
            .statusCode(404);
    }
}
