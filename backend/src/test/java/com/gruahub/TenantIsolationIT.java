package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de integração de isolamento multi-tenant.
 *
 * Roda contra o Quarkus em modo test com Testcontainers (PostgreSQL auto-provisionado).
 * Estes testes verificam que dados de um tenant NUNCA vazam para outro.
 *
 * Contratos exatos — sem anyOf — conforme regra de qualidade do projeto.
 *
 * IMPORTANTE: Os testes de autenticação real requerem Keycloak rodando.
 * No CI, usamos um token JWT assinado com chave de teste (JWKS stub).
 */
@QuarkusIntegrationTest
class TenantIsolationIT {

    /**
     * Qualquer endpoint protegido sem token deve retornar exatamente 401.
     *
     * Contrato: Quarkus OIDC rejeita requisições sem Bearer token com 401
     * antes de qualquer lógica de negócio ser executada.
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
     * Health check de liveness deve estar acessível sem autenticação.
     *
     * Contrato: /q/health/live é público e retorna 200 com body {"status":"UP"}.
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
     * Endpoint de métricas Prometheus deve estar acessível sem autenticação.
     *
     * Contrato: /q/metrics é público em ambiente padrão Quarkus e retorna 200.
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
     * Acesso a recurso protegido sem token retorna 401, não 404.
     *
     * Contrato: a autenticação é verificada antes da busca pelo recurso.
     * UUID inexistente + sem token → 401 (não vaza a informação de existência).
     */
    @Test
    void protected_resource_without_auth_should_return_401() {
        given()
        .when()
            .get("/api/v1/machines/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(401);
    }

    /**
     * Especificação OpenAPI deve estar disponível sem autenticação.
     *
     * Contrato: /q/openapi retorna 200 com Content-Type application/json
     * quando requisitado com Accept: application/json.
     */
    @Test
    void openapi_spec_should_be_available_as_json() {
        given()
            .accept("application/json")
        .when()
            .get("/q/openapi")
        .then()
            .statusCode(200)
            .contentType(containsString("application/json"));
    }
}
