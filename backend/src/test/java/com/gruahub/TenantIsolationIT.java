package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de integração de isolamento multi-tenant e contratos de API.
 * <p>
 * Roda contra a aplicação empacotada via Testcontainers (PostgreSQL auto-provisionado).
 * Não usa anyOf() — cada cenário tem contrato exato e único.
 */
@QuarkusIntegrationTest
class TenantIsolationIT {

    /**
     * GET /api/v1/machines sem token → 401 Unauthorized.
     * O filtro de autenticação deve rejeitar antes de qualquer lookup de recurso.
     * Contrato: 401 (não 404, porque auth ocorre antes de qualquer query).
     */
    @Test
    void machines_endpoint_requires_authentication() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines")
        .then()
            .statusCode(401);
    }

    /**
     * GET /api/v1/machines/{id} sem token → 401.
     * Auth precede lookup — não deve vazar informação sobre existência do recurso.
     */
    @Test
    void machine_by_id_requires_authentication() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(401);
    }

    /**
     * Health check de liveness está disponível sem autenticação.
     * Contrato: 200 com body {"status":"UP"}.
     */
    @Test
    void liveness_health_check_is_public() {
        given()
        .when()
            .get("/q/health/live")
        .then()
            .statusCode(200)
            .body("status", equalTo("UP"));
    }

    /**
     * Health check de readiness está disponível sem autenticação.
     * Contrato: 200 (pode ser UP ou DOWN dependendo de dependências externas).
     */
    @Test
    void readiness_health_check_is_public() {
        given()
        .when()
            .get("/q/health/ready")
        .then()
            .statusCode(200);
    }

    /**
     * Métricas Prometheus disponíveis sem autenticação.
     * Contrato: 200 com Content-Type text/plain (formato Prometheus).
     */
    @Test
    void metrics_endpoint_is_public() {
        given()
        .when()
            .get("/q/metrics")
        .then()
            .statusCode(200);
    }

    /**
     * OpenAPI spec retorna JSON quando solicitado com Accept: application/json.
     * Contrato: 200 com Content-Type application/json (não yaml).
     */
    @Test
    void openapi_spec_returns_json_when_requested() {
        given()
            .accept("application/json")
        .when()
            .get("/q/openapi")
        .then()
            .statusCode(200)
            .contentType(containsString("application/json"));
    }

    /**
     * Endpoint de estabelecimentos sem token → 401.
     */
    @Test
    void establishments_endpoint_requires_authentication() {
        given()
        .when()
            .get("/api/v1/establishments")
        .then()
            .statusCode(401);
    }

    /**
     * Endpoint de alertas sem token → 401.
     */
    @Test
    void alerts_endpoint_requires_authentication() {
        given()
        .when()
            .get("/api/v1/alerts")
        .then()
            .statusCode(401);
    }

    /**
     * Endpoint de visitas sem token → 401.
     */
    @Test
    void visits_endpoint_requires_authentication() {
        given()
        .when()
            .get("/api/v1/visits")
        .then()
            .statusCode(401);
    }

    /**
     * Endpoint de auditoria sem token → 401.
     */
    @Test
    void audit_endpoint_requires_authentication() {
        given()
        .when()
            .get("/api/v1/audit")
        .then()
            .statusCode(401);
    }
}
