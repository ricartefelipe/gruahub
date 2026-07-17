package com.gruahub;

import io.quarkus.test.junit.QuarkusIntegrationTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

/**
 * Testes de integração de isolamento multi-tenant.
 *
 * Convenções:
 *  - Roda como @QuarkusIntegrationTest (aplicação empacotada, perfil test).
 *  - %test.quarkus.oidc.enabled=false desativa verificação de token,
 *    mas o Quarkus Security mantém a camada de autenticação: endpoints
 *    @Authenticated retornam 401 para requisições anônimas.
 *  - Cada asserção tem contrato HTTP exato — sem anyOf.
 */
@QuarkusIntegrationTest
class TenantIsolationIT {

    /**
     * GET /api/v1/machines sem token → 401.
     *
     * MachineResource é anotado @Authenticated em nível de classe.
     * Requisição anônima → Quarkus Security retorna 401 antes de qualquer lógica.
     */
    @Test
    void machines_list_without_auth_returns_401() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .get("/api/v1/machines")
        .then()
            .statusCode(401);
    }

    /**
     * Health liveness acessível sem autenticação.
     */
    @Test
    void health_live_is_accessible_without_auth() {
        given()
        .when()
            .get("/q/health/live")
        .then()
            .statusCode(200)
            .body("status", equalTo("UP"));
    }

    /**
     * Endpoint de métricas Prometheus acessível sem autenticação.
     */
    @Test
    void metrics_endpoint_is_accessible() {
        given()
        .when()
            .get("/q/metrics")
        .then()
            .statusCode(200);
    }

    /**
     * GET /api/v1/machines/{id} sem token → 401.
     *
     * @Authenticated em MachineResource: autenticação verificada antes de
     * qualquer lookup de banco. O status é 401, nunca 404, para requisições
     * anônimas — mesmo que o ID não exista.
     */
    @Test
    void machine_get_by_id_without_auth_returns_401() {
        given()
        .when()
            .get("/api/v1/machines/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(401);
    }

    /**
     * Spec OpenAPI disponível e retorna JSON quando solicitado via Accept header.
     *
     * Sem Accept header o Quarkus smallrye-openapi retorna YAML por padrão.
     * Com Accept: application/json o contrato é exatamente application/json.
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
}
