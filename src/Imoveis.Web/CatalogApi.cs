using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.OpenApi.Models;
using Npgsql;

static class CatalogApi
{
    private const string Document = "catalogo-v1";
    private const string Scheme = "CatalogBearer";
    private const int RequestsPerMinute = 120;

    public static void Configure(IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc(Document, new OpenApiInfo { Title = "AdministraçãoImoveis – Catálogo", Version = "v1" });
            options.DocInclusionPredicate((document, endpoint) => endpoint.GroupName == document);
            options.AddSecurityDefinition(Scheme, new OpenApiSecurityScheme
            {
                Type = SecuritySchemeType.Http, Scheme = "bearer",
                Description = "Chave de leitura do catálogo da imobiliária. Use somente no servidor da integração."
            });
            options.AddSecurityRequirement(new OpenApiSecurityRequirement
            {
                [new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = Scheme } }] = []
            });
        });
    }

    public static void Map(WebApplication app, RouteGroupBuilder admin)
    {
        var assets = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["estilos"] = "swagger-ui.css",
            ["interface"] = "swagger-ui-bundle.js",
            ["layout"] = "swagger-ui-standalone-preset.js",
            ["icone-16"] = "favicon-16x16.png",
            ["icone-32"] = "favicon-32x32.png",
            ["especificacao"] = "catalogo-v1.json"
        };
        const string prefix = "/docs/catalogo";
        app.Use(async (context, next) =>
        {
            var original = context.Request.Path;
            if (!original.StartsWithSegments(prefix, out var remaining) ||
                !assets.TryGetValue(remaining.Value?.TrimStart('/') ?? "", out var file))
            {
                await next(context);
                return;
            }

            context.Request.Path = prefix + "/" + file;
            try { await next(context); }
            finally { context.Request.Path = original; }
        });
        app.UseSwagger(options => options.RouteTemplate = "docs/catalogo/{documentName}.json");
        app.UseSwaggerUI(options =>
        {
            options.RoutePrefix = "docs/catalogo";
            options.SwaggerEndpoint("./especificacao", "Catálogo v1");
            var originalIndex = options.IndexStream;
            options.IndexStream = () =>
            {
                using var reader = new StreamReader(originalIndex());
                var html = reader.ReadToEnd();
                foreach (var (alias, file) in assets)
                    html = html.Replace(file, alias, StringComparison.Ordinal);
                return new MemoryStream(System.Text.Encoding.UTF8.GetBytes(html));
            };
        });

        var credentials = admin.MapGroup("/integracoes/catalogo").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        credentials.MapPost("/chave", Rotate);
        credentials.MapDelete("/chave", Revoke);

        var catalog = app.MapGroup("/api/v1/catalogo").WithGroupName(Document).AddEndpointFilter(Authorize);
        catalog.MapGet("/imoveis", List).Produces<CatalogPage>().Produces(401).Produces(429);
        catalog.MapGet("/imoveis/{id:guid}", Find).Produces<CatalogProperty>().Produces(401).Produces(404).Produces(429);
        catalog.MapGet("/imoveis/{id:guid}/fotos/{photo:guid}", Photo)
            .Produces(200, contentType: "image/jpeg", additionalContentTypes: ["image/png", "image/webp"])
            .Produces(401).Produces(404).Produces(429);
    }

    private static async Task<IResult> Rotate(NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        var key = RandomNumberGenerator.GetBytes(32);
        await using var query = db.CreateCommand("""
            INSERT INTO catalog_api_access (tenant_id, token_hash) VALUES (@tenant, @hash)
            ON CONFLICT (tenant_id) DO UPDATE SET token_hash = EXCLUDED.token_hash
            """);
        query.Parameters.AddWithValue("tenant", tenant.Id);
        query.Parameters.AddWithValue("hash", SHA256.HashData(key));
        await query.ExecuteNonQueryAsync(ct);
        return Results.Ok(new { token = WebEncoders.Base64UrlEncode(key) });
    }

    private static async Task<IResult> Revoke(NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var query = db.CreateCommand("DELETE FROM catalog_api_access WHERE tenant_id=@tenant");
        query.Parameters.AddWithValue("tenant", tenant.Id);
        await query.ExecuteNonQueryAsync(ct);
        return Results.NoContent();
    }

    private static async ValueTask<object?> Authorize(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var header = http.Request.Headers.Authorization.ToString();
        if (header.Length != 50 || !header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return Challenge(http);

        byte[] key;
        try { key = WebEncoders.Base64UrlDecode(header[7..]); }
        catch (FormatException) { return Challenge(http); }
        if (key.Length != 32) return Challenge(http);

        var tenant = http.RequestServices.GetRequiredService<TenantContext>();
        var db = http.RequestServices.GetRequiredService<NpgsqlDataSource>();
        var hash = SHA256.HashData(key);
        await using var quota = db.CreateCommand("""
            UPDATE catalog_api_access
            SET requests = CASE WHEN window_start = date_trunc('minute', now()) THEN requests + 1 ELSE 1 END,
                window_start = date_trunc('minute', now())
            WHERE tenant_id=@tenant AND token_hash=@hash
                AND (window_start <> date_trunc('minute', now()) OR requests < @limit)
            RETURNING requests
            """);
        quota.Parameters.AddWithValue("tenant", tenant.Id);
        quota.Parameters.AddWithValue("hash", hash);
        quota.Parameters.AddWithValue("limit", RequestsPerMinute);
        if (await quota.ExecuteScalarAsync(http.RequestAborted) is not null) return await next(context);

        await using var access = db.CreateCommand("SELECT token_hash FROM catalog_api_access WHERE tenant_id=@tenant");
        access.Parameters.AddWithValue("tenant", tenant.Id);
        if (await access.ExecuteScalarAsync(http.RequestAborted) is not byte[] expected
            || !CryptographicOperations.FixedTimeEquals(hash, expected))
            return Challenge(http);

        http.Response.Headers.RetryAfter = (60 - DateTime.UtcNow.Second).ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Results.StatusCode(StatusCodes.Status429TooManyRequests);
    }

    private static IResult Challenge(HttpContext http)
    {
        http.Response.Headers.WWWAuthenticate = "Bearer";
        return Results.Unauthorized();
    }

    private static async Task<IResult> List(PropertyStore store, TenantContext tenant, string? q, int? page,
        string? kind, decimal? maxPrice, int? bedrooms, CancellationToken ct)
    {
        var pageNumber = PropertyEndpoints.Page(page);
        var rows = await store.Get(false, null, PropertyEndpoints.Search(q), pageNumber, ct,
            PropertyEndpoints.Search(kind), Math.Max(0, maxPrice ?? 0), Math.Max(0, bedrooms ?? 0), tenantId: tenant.Id);
        return Results.Ok(new CatalogPage(pageNumber, 30, rows.Select(Project).ToArray()));
    }

    private static async Task<IResult> Find(Guid id, PropertyStore store, TenantContext tenant, CancellationToken ct)
    {
        var rows = await store.Get(false, id, "", 1, ct, tenantId: tenant.Id);
        return rows.Count == 0 ? Results.NotFound() : Results.Ok(Project(rows[0]));
    }

    private static Task<IResult> Photo(Guid id, Guid photo, MediaStore media, TenantContext tenant, CancellationToken ct) =>
        media.Read(id, photo, false, ct, tenant.Id);

    private static CatalogProperty Project(Property property)
    {
        var data = property.Data;
        return new(property.Id, data.Code, data.Title, data.Kind, data.City, data.District, data.Zone,
            data.Price, data.Bedrooms, data.Size, property.Photos.Select(photo => $"/api/v1/catalogo/imoveis/{property.Id}/fotos/{photo}").ToArray(), data.Rental);
    }

    private sealed record CatalogPage(int Page, int PageSize, CatalogProperty[] Properties);
    private sealed record CatalogProperty(Guid Id, string Code, string Title, string Kind, string City,
        string District, string? Zone, decimal Price, int Bedrooms, decimal Size, string[] Photos, RentalTerms? Rental);
}
