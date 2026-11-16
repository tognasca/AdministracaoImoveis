using Npgsql;

static class PropertyEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapGet("/imoveis", (PropertyStore db, string? q, int? page, CancellationToken ct) =>
            db.Get(true, null, Search(q), Page(page), ct));
        admin.MapGet("/imoveis/{id:guid}", async (Guid id, PropertyStore db, CancellationToken ct) =>
        {
            var result = await db.Get(true, id, "", 1, ct);
            return result.Count == 0 ? Results.NotFound() : Results.Ok(result[0]);
        });
        admin.MapPost("/imoveis", (PropertyInput input, PropertyStore store, CancellationToken ct) =>
            Save(Guid.NewGuid(), input, true, store, ct));
        admin.MapPut("/imoveis/{id:guid}", (Guid id, PropertyInput input, PropertyStore store, CancellationToken ct) =>
            Save(id, input, false, store, ct));
    }

    internal static string Search(string? q) => (q ?? "").Trim()[..Math.Min((q ?? "").Trim().Length, 120)];
    internal static int Page(int? page) => Math.Clamp(page ?? 1, 1, 10000);
    static async Task<IResult> Save(Guid id, PropertyInput input, bool create, PropertyStore store, CancellationToken ct)
    {
        if (PropertyValidation.Validate(input) is { } error) return Results.BadRequest(error);
        try
        {
            if (!await store.Save(id, input, create, ct))
                return Results.Conflict("O imóvel foi atualizado em outra tela. Reabra o cadastro.");
            return create ? Results.Created($"/api/admin/imoveis/{id}", new { id }) : Results.NoContent();
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return Results.Conflict("Já existe um imóvel com esse código nesta origem.");
        }
    }
}
