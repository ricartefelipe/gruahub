package com.gruahub.fleet.api;

import com.gruahub.fleet.application.MachineCommandService;
import com.gruahub.fleet.application.MachineService;
import com.gruahub.fleet.domain.MachineStatus;
import com.gruahub.shared.api.PageResponse;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.util.UUID;

@Path("/api/v1/machines")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
@Tag(name = "Machines", description = "Gestão da frota de máquinas")
public class MachineResource {

    @Inject
    MachineService machineService;

    @Inject
    MachineCommandService machineCommandService;

    public record RemoteCommandRequest(@NotBlank String commandType) {}

    @GET
    @Operation(summary = "Listar máquinas do tenant")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "FIELD_OPERATOR", "TECHNICIAN", "FINANCE"})
    public PageResponse<MachineResponse> list(
            @QueryParam("page") @DefaultValue("0") int page,
            @QueryParam("size") @DefaultValue("20") int size) {
        return machineService.list(page, size);
    }

    @POST
    @Operation(summary = "Cadastrar nova máquina")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER"})
    public Response create(@Valid CreateMachineRequest request) {
        MachineResponse machine = machineService.create(request);
        return Response.status(201).entity(machine).build();
    }

    @GET
    @Path("/{id}")
    @Operation(summary = "Detalhe de uma máquina")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "FIELD_OPERATOR", "TECHNICIAN", "FINANCE"})
    public MachineResponse get(@PathParam("id") UUID id) {
        return machineService.getById(id);
    }

    @PATCH
    @Path("/{id}")
    @Operation(summary = "Atualizar dados da máquina")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER"})
    public MachineResponse update(@PathParam("id") UUID id, @Valid UpdateMachineRequest request) {
        return machineService.update(id, request);
    }

    @POST
    @Path("/{id}/status")
    @Operation(summary = "Alterar status operacional da máquina")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "TECHNICIAN"})
    public MachineResponse changeStatus(
            @PathParam("id") UUID id,
            @QueryParam("status") MachineStatus targetStatus) {
        return machineService.changeStatus(id, targetStatus);
    }

    @GET
    @Path("/summary/status")
    @Operation(summary = "Resumo de status da frota (online/offline/manutenção)")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "FINANCE"})
    public MachineService.MachineStatusSummary statusSummary() {
        return machineService.getStatusSummary();
    }

    @POST
    @Path("/{id}/commands")
    @Operation(summary = "Enviar comando remoto à máquina (REBOOT, LOCK, UNLOCK)")
    @RolesAllowed({"PLATFORM_ADMIN", "TENANT_ADMIN", "OPERATIONS_MANAGER", "TECHNICIAN"})
    public Response sendCommand(
            @PathParam("id") UUID id,
            @Valid RemoteCommandRequest request) {
        var result = machineCommandService.enqueue(id, request.commandType());
        return Response.accepted(result).build();
    }
}
