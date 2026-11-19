using Npgsql;

static class PublicEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/health", async (NpgsqlDataSource db, CancellationToken ct) =>
        {
            await using var query = db.CreateCommand("SELECT 1 FROM properties LIMIT 1");
            await query.ExecuteScalarAsync(ct);
            return Results.Ok(new { status = "ok" });
        });
        app.MapGet("/api/vitrine/configuracao", async (IConfiguration settings, StorefrontImages images, StorefrontBrand brand, StorefrontMenu menu, CancellationToken ct) =>
        {
            var (name, color, email, whatsapp, textColor, colorOpacity) = await brand.Read(ct);
            var number = whatsapp ?? settings["Vitrine:WhatsApp"] ?? "";
            return Results.Ok(new { name, color, colorOpacity, textColor, email, menu = await menu.List(true, ct), whatsapp = number.Length is >= 10 and <= 15 && number.All(char.IsAsciiDigit)
                ? number : "", banner = images.Exists(StorefrontImage.Banner) ? "/media/vitrine/banner" : null,
                logo = images.Exists(StorefrontImage.Logo) ? "/media/vitrine/logo" : null });
        });
        app.MapGet("/api/imoveis/tipos", (PropertyStore store, TenantContext tenant, CancellationToken ct) => store.ListKinds(false, ct, tenant.Id));
        app.MapGet("/api/imoveis", (PropertyStore db, TenantContext tenant, string? q, int? page, string? kind, decimal? maxPrice, int? bedrooms, Guid? category, bool? gallery, CancellationToken ct) =>
            db.Get(false, null, PropertyEndpoints.Search(q), PropertyEndpoints.Page(page), ct, PropertyEndpoints.Search(kind), Math.Max(0, maxPrice ?? 0), Math.Max(0, bedrooms ?? 0), category, gallery == true, tenant.Id));
        app.MapGet("/api/imoveis/{id:guid}", async (Guid id, PropertyStore db, TenantContext tenant, CancellationToken ct) =>
        {
            var result = await db.Get(false, id, "", 1, ct, tenantId: tenant.Id);
            return result.Count == 0 ? Results.NotFound() : Results.Ok(result[0]);
        });
        app.MapGet("/media/vitrine/banner", (StorefrontImages images, CancellationToken ct) => images.Read(StorefrontImage.Banner, ct));
        app.MapGet("/media/vitrine/logo", (StorefrontImages images, CancellationToken ct) => images.Read(StorefrontImage.Logo, ct));
        app.MapGet("/media/{property:guid}/{photo:guid}", (Guid property, Guid photo, HttpContext ctx, MediaStore media, TenantContext tenant, CancellationToken ct) =>
            media.Read(property, photo, ctx.User.Identity?.IsAuthenticated == true && TenantContext.AuthenticatedTenant(ctx.User) == tenant.Id, ct, tenant.Id));
    }
}
