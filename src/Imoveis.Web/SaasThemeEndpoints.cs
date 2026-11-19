using Npgsql;
using System.Text.RegularExpressions;

record ThemeInput(string Template, string AccentColor);
record ThemeView(string Template, string AccentColor);

static class SaasThemeEndpoints
{
    public static void Map(WebApplication app, RouteGroupBuilder admin)
    {
        app.MapGet("/api/vitrine/tema", async (NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            await using var query = db.CreateCommand("SELECT template,accent_color FROM saas_tenant_themes WHERE tenant_id=@tenant");
            query.Parameters.AddWithValue("tenant", tenant.Id);
            await using var reader = await query.ExecuteReaderAsync(ct);
            return await reader.ReadAsync(ct)
                ? Results.Ok(new ThemeView(reader.GetString(0),reader.GetString(1)))
                : Results.Ok(new ThemeView("modern","#6B5140"));
        });
        admin.MapPut("/vitrine/tema", async (ThemeInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            if (input.Template is not ("modern" or "premium" or "commercial")
                || string.IsNullOrWhiteSpace(input.AccentColor)
                || !Regex.IsMatch(input.AccentColor, "^#[0-9a-fA-F]{6}$"))
                return Results.BadRequest("Escolha um modelo e uma cor hexadecimal válida.");
            await using var command = db.CreateCommand("""
                INSERT INTO saas_tenant_themes(tenant_id,template,accent_color)
                VALUES (@tenant,@template,@accent)
                ON CONFLICT (tenant_id) DO UPDATE SET template=EXCLUDED.template,
                    accent_color=EXCLUDED.accent_color,updated_at=now()
                """);
            command.Parameters.AddWithValue("tenant",tenant.Id);
            command.Parameters.AddWithValue("template",input.Template);
            command.Parameters.AddWithValue("accent",input.AccentColor.ToUpperInvariant());
            await command.ExecuteNonQueryAsync(ct);
            return Results.NoContent();
        }).RequireAuthorization(policy => policy.RequireRole("Administrador"));
    }
}
