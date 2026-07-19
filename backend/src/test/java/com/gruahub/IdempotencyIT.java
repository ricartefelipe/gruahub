package com.gruahub;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class IdempotencyIT {

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
    void sandbox_confirm_requires_auth_or_secret_when_enabled() {
        given()
            .contentType(ContentType.JSON)
        .when()
            .post("/api/v1/payments/sandbox/confirm/00000000-0000-0000-0000-000000000000")
        .then()
            .statusCode(401);
    }

    @Test
    void api_root_returns_404() {
        given()
        .when()
            .get("/api/v1")
        .then()
            .statusCode(404);
    }

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
