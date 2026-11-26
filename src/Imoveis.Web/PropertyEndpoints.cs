using Npgsql;

record PropertyPriceChange(decimal PreviousPrice, decimal NewPrice, DateTime ChangedAt, string? Filename);

static class PropertyEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapGet("/imoveis/tipos", (PropertyStore store, TenantContext tenant, CancellationToken ct) => store.ListKinds(true, ct, tenant.Id));
        admin.MapGet("/imoveis/cidades", (PropertyStore store, TenantContext tenant, CancellationToken ct) => store.ListCities(tenant.Id,ct));
        admin.MapGet("/imoveis", (PropertyStore db, TenantContext tenant, string? q, int? page, string? operation, string? status, string? city, CancellationToken ct) =>
            db.Get(true, null, Search(q), Page(page), ct, tenantId: tenant.Id, operation: Search(operation), status: Search(status), city: Search(city)));
        admin.MapGet("/imoveis/{id:guid}", async (Guid id, PropertyStore db, TenantContext tenant, CancellationToken ct) =>
        {
            var result = await db.Get(true, id, "", 1, ct, tenantId: tenant.Id);
            return result.Count == 0 ? Results.NotFound() : Results.Ok(result[0]);
        });
        admin.MapGet("/imoveis/{id:guid}/historico-precos", async (
            Guid id, int? page, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            await using var query = db.CreateCommand("""
                SELECT h.previous_price, h.new_price, h.changed_at, i.filename
                FROM property_price_history h
                JOIN properties p ON p.id=h.property_id AND p.tenant_id=h.tenant_id
                LEFT JOIN import_history i ON i.id=h.import_id AND i.tenant_id=h.tenant_id
                WHERE h.tenant_id=@tenant AND h.property_id=@id
                ORDER BY h.id DESC LIMIT 30 OFFSET @offset
                """);
            query.Parameters.AddWithValue("tenant", tenant.Id);
            query.Parameters.AddWithValue("id", id);
            query.Parameters.AddWithValue("offset", (Page(page) - 1) * 30);
            await using var reader = await query.ExecuteReaderAsync(ct);
            var history = new List<PropertyPriceChange>();
            while (await reader.ReadAsync(ct))
                history.Add(new(reader.GetDecimal(0), reader.GetDecimal(1), reader.GetDateTime(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3)));
            return Results.Ok(history);
        });
        admin.MapPost("/imoveis/publicar-rascunhos", async (PropertyStore store, TenantContext tenant, CancellationToken ct) =>
            Results.Ok(new { published = await store.PublishReadyDrafts(ct, tenant.Id) }))
            .RequireAuthorization(policy => policy.RequireRole("Administrador"));
        admin.MapPost("/imoveis", (PropertyInput input, PropertyStore store, StorefrontMenu menu, TenantContext tenant, CancellationToken ct) =>
            Save(Guid.NewGuid(), input, true, store, menu, tenant, ct));
        admin.MapPut("/imoveis/{id:guid}", (Guid id, PropertyInput input, PropertyStore store, StorefrontMenu menu, TenantContext tenant, CancellationToken ct) =>
            Save(id, input, false, store, menu, tenant, ct));
    }

    internal static string Search(string? q) => (q ?? "").Trim()[..Math.Min((q ?? "").Trim().Length, 120)];
    internal static int Page(int? page) => Math.Clamp(page ?? 1, 1, 10000);
    static async Task<IResult> Save(Guid id, PropertyInput input, bool create, PropertyStore store, StorefrontMenu menu, TenantContext tenant, CancellationToken ct)
    {
        if (PropertyValidation.Validate(input) is { } error) return Results.BadRequest(error);
        if (input.CategoryId is { } category && !(await menu.List(false, ct, tenant.Id)).Any(item => item.Id == category && item.Kind == "category"))
            return Results.BadRequest("Selecione uma categoria válida.");
        try
        {
            if (!await store.Save(id, input, create, ct, tenant.Id))
                return Results.Conflict("O imóvel foi atualizado em outra tela. Reabra o cadastro.");
            return create ? Results.Created($"/api/admin/imoveis/{id}", new { id }) : Results.NoContent();
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.ForeignKeyViolation)
        {
            return Results.Conflict("A categoria mudou. Reabra o cadastro e selecione outra categoria.");
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return Results.Conflict("Já existe um imóvel com esse código nesta origem.");
        }
    }
}
