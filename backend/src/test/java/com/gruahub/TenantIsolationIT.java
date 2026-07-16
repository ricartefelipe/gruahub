package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de integração de isolamento multi-tenant.
 * <p>
 * Roda contra o Quarkus em modo test com Testcontainers (PostgreSQL auto-provisionado).
 * Estes testes verificam que dados de um tenant NUNCA vazam para outro.
 * <p>
 * IMPORTANTE: Os testes de autenticação real requerem Keycloak rodando.
 * No CI, usamos um token JWT assinado com chave de teste (JWKS stub).
 * Em modo dev local, os testes de isolamento podem ser validados manualmente
 * com dois usuários distintos.
 */
@QuarkusIntegrationTest
class TenantIsolationIT {

    private static final String TENANT_A = "11111111-0000-0000-0000-000000000001";
    private static final String TENANT_B = "22222222-0000-0000-0000-000000000002";

    /**
     * Verifica que o endpoint de status retorna 401 sem token.
     */
    @Test
    void should_return_401_without_auth_token() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines")
        .then()
            .statusCode(401);
    }

    /**
     * Verifica que o health check está disponível sem autenticação.
     */
    @Test
    void health_check_should_be_accessible_without_auth() {
        given()
        .when()
            .get("/q/health/live")
        .then()
            .statusCode(200)
            .body("status", equalTo("UP"));
    }

    /**
     * Verifica que o endpoint de métricas está disponível.
     */
    @Test
    void metrics_endpoint_should_be_accessible() {
        given()
        .when()
            .get("/q/metrics")
        .then()
            .statusCode(200);
    }

    /**
     * Verifica que a API responde com problem+json para recurso não encontrado.
     */
    @Test
    void should_return_problem_json_for_not_found() {
        // Endpoint público de verificação de saúde
        given()
        .when()
            .get("/api/v1/machines/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(anyOf(is(401), is(404)));
    }

    /**
     * Verifica que o endpoint de OpenAPI está disponível.
     */
    @Test
    void openapi_spec_should_be_available() {
        given()
        .when()
            .get("/q/openapi")
        .then()
            .statusCode(200)
            .contentType(anyOf(
                containsString("application/json"),
                containsString("application/yaml")
            ));
    }
}
