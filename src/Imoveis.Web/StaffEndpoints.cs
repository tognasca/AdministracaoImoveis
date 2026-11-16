using System.Security.Claims;

static class StaffEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        var users = admin.MapGroup("/usuarios").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        users.MapGet("/", (StaffStore staff, CancellationToken ct) => staff.List(ct));
        users.MapPost("/", async (StaffCreate input, StaffStore staff, CancellationToken ct) =>
        {
            if (!PropertyValidation.Required(input.Username, 80) || input.Password is not { Length: >= 16 and <= 256 }
                || input.Role is not ("Administrador" or "Operador")) return Results.BadRequest("Confira usuário, perfil e senha.");
            return await staff.Create(input, ct) ? Results.NoContent() : Results.Conflict("Este nome de usuário já existe.");
        });
        users.MapPut("/{id:guid}", async (Guid id, StaffState input, ClaimsPrincipal user, StaffStore staff, CancellationToken ct) =>
        {
            if (user.FindFirstValue(ClaimTypes.NameIdentifier) == id.ToString()) return Results.BadRequest("Seu usuário está em uso.");
            return await staff.ChangeState(id, input.Active, ct) ? Results.NoContent() : Results.NotFound();
        });
    }
}
