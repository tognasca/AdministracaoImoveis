using Npgsql;

static class MenuEndpoints
{
    private sealed record MenuInput(string? Name, int Position, bool Visible);

    public static void Map(RouteGroupBuilder admin)
    {
        var menu = admin.MapGroup("/vitrine/menu");
        menu.MapGet("", (StorefrontMenu store, CancellationToken ct) => store.List(false, ct));
        menu.MapPost("", (MenuInput input, StorefrontMenu store, CancellationToken ct) =>
            Save(Guid.NewGuid(), input, store, true, ct))
            .RequireAuthorization(policy => policy.RequireRole("Administrador"));
        menu.MapPut("/{id:guid}", (Guid id, MenuInput input, StorefrontMenu store, CancellationToken ct) =>
            Save(id, input, store, false, ct))
            .RequireAuthorization(policy => policy.RequireRole("Administrador"));
        menu.MapDelete("/{id:guid}", DeleteCategory)
            .RequireAuthorization(policy => policy.RequireRole("Administrador"));
    }

    private static async Task<IResult> DeleteCategory(Guid id, StorefrontMenu store, CancellationToken ct)
    {
        try
        {
            return await store.DeleteCategory(id, ct) ? Results.NoContent() : Results.NotFound();
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.ForeignKeyViolation)
        {
            return Results.Conflict("Há imóveis vinculados a esta categoria. Remova os vínculos ou oculte a categoria no menu.");
        }
    }

    private static async Task<IResult> Save(Guid id, MenuInput input, StorefrontMenu store, bool create, CancellationToken ct)
    {
        var name = input.Name?.Trim();
        if (name is null || name.Length is < 1 or > 48 || name.Any(char.IsControl) || input.Position is < 0 or > 999)
            return Results.BadRequest("Informe um nome de até 48 caracteres e uma posição de 0 a 999.");
        try
        {
            return await store.Save(id, name, input.Position, input.Visible, create, ct)
                ? Results.NoContent() : Results.NotFound();
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return Results.Conflict("Já existe uma categoria com esse nome.");
        }
    }
}
