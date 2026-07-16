package com.gruahub.shared.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProblemResponse(
        String type,
        String title,
        int status,
        String detail,
        String instance,
        String correlationId,
        Instant timestamp,
        List<FieldError> errors
) {
    public static final String CONTENT_TYPE = "application/problem+json";

    public record FieldError(String field, String message) {}

    public static Response badRequest(String detail, String correlationId) {
        return build(400, "Bad Request", detail, correlationId, null);
    }

    public static Response unauthorized(String correlationId) {
        return build(401, "Unauthorized", "Authentication required", correlationId, null);
    }

    public static Response forbidden(String correlationId) {
        return build(403, "Forbidden", "You do not have permission to access this resource", correlationId, null);
    }

    public static Response notFound(String detail, String correlationId) {
        return build(404, "Not Found", detail, correlationId, null);
    }

    public static Response conflict(String detail, String correlationId) {
        return build(409, "Conflict", detail, correlationId, null);
    }

    public static Response unprocessable(String detail, List<FieldError> errors, String correlationId) {
        return build(422, "Unprocessable Entity", detail, correlationId, errors);
    }

    public static Response internalError(String correlationId) {
        return build(500, "Internal Server Error", "An unexpected error occurred", correlationId, null);
    }

    private static Response build(int status, String title, String detail, String correlationId, List<FieldError> errors) {
        var problem = new ProblemResponse(
                "about:blank",
                title,
                status,
                detail,
                null,
                correlationId,
                Instant.now(),
                errors
        );
        return Response.status(status)
                .type(CONTENT_TYPE)
                .entity(problem)
                .build();
    }
}
