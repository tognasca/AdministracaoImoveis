using System.IO.Compression;
using System.Text.Json;
using Npgsql;

static class StaticStorefrontPackage
{
    private static readonly string[] Assets =
    [
        "styles.css", "storefront.css", "property-detail.css",
        "api.js", "ui.js", "storefront.js", "property-detail.js", "storefront-theme.js",
        "property-kinds.js", "public-catalog.js", "public-menu.js"
    ];

    public static Uri? BaseUrl(IConfiguration configuration, IWebHostEnvironment environment)
    {
        if (!Uri.TryCreate(configuration["Saas:PublicCatalogBaseUrl"], UriKind.Absolute, out var url)
            || url.UserInfo.Length != 0 || url.AbsolutePath != "/" || url.Query.Length != 0 || url.Fragment.Length != 0)
            return null;
        return url.Scheme == Uri.UriSchemeHttps || (environment.IsDevelopment() && url.IsLoopback && url.Scheme == Uri.UriSchemeHttp)
            ? url : null;
    }

    public static void Map(RouteGroupBuilder admin)
    {
        var storefront = admin.MapGroup("/vitrine").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        storefront.MapGet("/publicacao-externa", (IConfiguration settings, IWebHostEnvironment environment) =>
            Results.Ok(new { Enabled = BaseUrl(settings, environment) is not null }));
        storefront.MapGet("/pacote", async (IConfiguration configuration, IWebHostEnvironment environment,
            NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            var baseUrl = BaseUrl(configuration, environment);
            if (baseUrl is null) return Results.NotFound();
            await using var query = db.CreateCommand("SELECT slug FROM saas_tenants WHERE id=@id AND status='active'");
            query.Parameters.AddWithValue("id", tenant.Id);
            if (await query.ExecuteScalarAsync(ct) is not string slug) return Results.NotFound();

            using var package = new MemoryStream();
            using (var zip = new ZipArchive(package, ZipArchiveMode.Create, leaveOpen: true))
            {
                foreach (var asset in Assets)
                    await CopyAsset(zip, asset, environment.WebRootFileProvider.GetFileInfo(asset).CreateReadStream(), ct);
                foreach (var asset in new[] { "index.html", "external-storefront.js" })
                {
                    var source = typeof(StaticStorefrontPackage).Assembly.GetManifestResourceStream($"Imoveis.Web.StaticStorefront.{asset}")
                        ?? throw new InvalidOperationException($"Arquivo da vitrine ausente: {asset}");
                    await CopyAsset(zip, asset, source, ct);
                }

                await using var config = new StreamWriter(zip.CreateEntry("catalog-config.js").Open());
                var catalog = new Uri(baseUrl, "/api/catalogo/" + Uri.EscapeDataString(slug));
                await config.WriteAsync($"export const catalogUrl = {JsonSerializer.Serialize(catalog.AbsoluteUri)};\n");
            }
            return Results.File(package.ToArray(), "application/zip", "vitrine-" + slug + ".zip");
        });
    }

    private static async Task CopyAsset(ZipArchive zip, string name, Stream source, CancellationToken ct)
    {
        await using var file = source;
        await using var entry = zip.CreateEntry(name).Open();
        await file.CopyToAsync(entry, ct);
    }
}
