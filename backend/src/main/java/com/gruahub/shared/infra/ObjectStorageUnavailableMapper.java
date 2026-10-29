package com.gruahub.shared.infra;

import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import java.util.Map;

/** Armazenamento indisponivel e falha temporaria do servico, nao erro do cliente: 503 e nenhuma referencia gravada. */
@Provider
public class ObjectStorageUnavailableMapper implements ExceptionMapper<ObjectStorageUnavailableException> {

    @Override
    public Response toResponse(ObjectStorageUnavailableException e) {
        return Response.status(Response.Status.SERVICE_UNAVAILABLE)
            .type(MediaType.APPLICATION_JSON)
            .entity(Map.of("error", "object_storage_unavailable", "message", e.getMessage()))
            .build();
    }
}
