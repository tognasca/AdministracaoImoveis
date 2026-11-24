using Npgsql;

static class PublicEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/health", async (NpgsqlDataSource db, CancellationToken ct) =>
        {
            await using var query = db.CreateCommand("SELECT 1");
            await query.ExecuteScalarAsync(ct);
            return Results.Ok(new { status = "ok" });
        });
        MapCatalog(app.MapGroup(""), false);
        var external = app.MapGroup("/api/catalogo/{slug}").RequireCors("PublicCatalog");
        external.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            var services = http.RequestServices;
            if (StaticStorefrontPackage.BaseUrl(services.GetRequiredService<IConfiguration>(),
                services.GetRequiredService<IWebHostEnvironment>()) is null
                || http.Request.RouteValues["slug"] is not string { Length: >= 1 and <= 80 } slug)
                return Results.NotFound();

            var db = services.GetRequiredService<NpgsqlDataSource>();
            await using var query = db.CreateCommand("SELECT id FROM saas_tenants WHERE slug=@slug AND status='active'");
            query.Parameters.AddWithValue("slug", slug);
            if (await query.ExecuteScalarAsync(http.RequestAborted) is not Guid id)
                return Results.NotFound();

            http.Items["PublicCatalogTenantId"] = id;
            return await next(context);
        });
        MapCatalog(external, true);
    }

    private static void MapCatalog(RouteGroupBuilder group, bool external)
    {
        var api = external ? "" : "/api";
        group.MapGet(api + "/vitrine/configuracao", async (HttpContext http, IConfiguration settings,
            StorefrontImages images, StorefrontBrand brand, StorefrontMenu menu, TenantContext tenant, CancellationToken ct) =>
        {
            var tenantId = CatalogTenant(http, tenant);
            var (name, color, email, whatsapp, textColor, colorOpacity) = await brand.Read(ct, tenantId);
            var number = whatsapp ?? (tenantId == TenantContext.LegacyId ? settings["Vitrine:WhatsApp"] : null) ?? "";
            var media = external ? $"/api/catalogo/{http.Request.RouteValues["slug"]}" : "";
            return Results.Ok(new { name, color, colorOpacity, textColor, email, menu = await menu.List(true, ct, tenantId), whatsapp = number.Length is >= 10 and <= 15 && number.All(char.IsAsciiDigit)
                ? number : "", banner = images.Exists(StorefrontImage.Banner, tenantId) ? media + "/media/vitrine/banner" : null,
                logo = images.Exists(StorefrontImage.Logo, tenantId) ? media + "/media/vitrine/logo" : null });
        });
        group.MapGet(api + "/vitrine/tema", (HttpContext http, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
            SaasThemeEndpoints.Read(db, CatalogTenant(http, tenant), ct));
        group.MapGet(api + "/imoveis/tipos", (HttpContext http, PropertyStore store, TenantContext tenant, CancellationToken ct) =>
            store.ListKinds(false, ct, CatalogTenant(http, tenant)));
        group.MapGet(api + "/imoveis", async (HttpContext http, PropertyStore db, TenantContext tenant, string? q,
            int? page, string? kind, decimal? maxPrice, int? bedrooms, Guid? category, bool? gallery, CancellationToken ct) =>
        {
            var properties = await db.Get(false, null, PropertyEndpoints.Search(q), PropertyEndpoints.Page(page), ct,
                PropertyEndpoints.Search(kind), Math.Max(0, maxPrice ?? 0), Math.Max(0, bedrooms ?? 0),
                category, gallery == true, CatalogTenant(http, tenant));
            return external ? Results.Ok(properties.Select(PublicProperty)) : Results.Ok(properties);
        });
        group.MapGet(api + "/imoveis/{id:guid}", async (Guid id, HttpContext http, PropertyStore db, TenantContext tenant, CancellationToken ct) =>
        {
            var result = await db.Get(false, id, "", 1, ct, tenantId: CatalogTenant(http, tenant));
            if (result.Count == 0) return Results.NotFound();
            return external ? Results.Ok(PublicProperty(result[0])) : Results.Ok(result[0]);
        });
        group.MapGet("/media/vitrine/banner", (HttpContext http, StorefrontImages images, TenantContext tenant, CancellationToken ct) =>
            images.Read(StorefrontImage.Banner, ct, CatalogTenant(http, tenant)));
        group.MapGet("/media/vitrine/logo", (HttpContext http, StorefrontImages images, TenantContext tenant, CancellationToken ct) =>
            images.Read(StorefrontImage.Logo, ct, CatalogTenant(http, tenant)));
        group.MapGet("/media/{property:guid}/{photo:guid}", (Guid property, Guid photo, HttpContext http, MediaStore media, TenantContext tenant, CancellationToken ct) =>
            media.Read(property, photo, !external && http.User.Identity?.IsAuthenticated == true
                && TenantContext.AuthenticatedTenant(http.User) == tenant.Id, ct, CatalogTenant(http, tenant)));
    }

    private static Guid CatalogTenant(HttpContext http, TenantContext tenant) =>
        http.Items["PublicCatalogTenantId"] is Guid id ? id : tenant.Id;

    private static object PublicProperty(Property property)
    {
        var data = property.Data;
        return new { property.Id, property.Photos, Data = new
        {
            data.Code, data.Title, data.Kind, data.District, data.City, data.Zone, data.Price,
            data.Bedrooms, data.Size, data.Album, data.CategoryId
        } };
    }
}
