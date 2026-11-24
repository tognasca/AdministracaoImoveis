using Npgsql;
using System.Text.RegularExpressions;

record ThemeInput(string Template, string AccentColor);
record ThemeView(string Template, string AccentColor);

static class SaasThemeEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        var theme = admin.MapGroup("/vitrine/tema").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        theme.MapPut("", (ThemeInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
            Save(input, false, db, tenant.Id, ct));
        theme.MapPut("/rascunho", (ThemeInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
            Save(input, true, db, tenant.Id, ct));
        theme.MapGet("/editor", Editor);
        theme.MapPost("/restaurar", async (NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            await using var command = db.CreateCommand("""
                UPDATE saas_tenant_themes
                SET template=previous_template,accent_color=previous_accent,
                    previous_template=template,previous_accent=accent_color,updated_at=now()
                WHERE tenant_id=@tenant AND previous_template IS NOT NULL
                """);
            command.Parameters.AddWithValue("tenant", tenant.Id);
            return await command.ExecuteNonQueryAsync(ct) == 1
                ? Results.NoContent() : Results.Conflict("Ainda não há uma versão anterior.");
        });
    }

    private static async Task<IResult> Save(ThemeInput input, bool draft, NpgsqlDataSource db, Guid tenant, CancellationToken ct)
    {
        if (input.Template is not ("modern" or "premium" or "commercial" or "minimal" or "boutique")
            || string.IsNullOrWhiteSpace(input.AccentColor)
            || !Regex.IsMatch(input.AccentColor, "^#[0-9a-fA-F]{6}$"))
            return Results.BadRequest("Escolha um modelo e uma cor hexadecimal válida.");
        const string saveDraft = """
            INSERT INTO saas_tenant_themes(tenant_id,draft_template,draft_accent) VALUES(@tenant,@template,@accent)
            ON CONFLICT (tenant_id) DO UPDATE SET draft_template=EXCLUDED.draft_template,draft_accent=EXCLUDED.draft_accent
            """;
        const string publish = """
            INSERT INTO saas_tenant_themes(tenant_id,template,accent_color,previous_template,previous_accent)
            VALUES(@tenant,@template,@accent,'modern','#6B5140')
            ON CONFLICT (tenant_id) DO UPDATE SET previous_template=saas_tenant_themes.template,
                previous_accent=saas_tenant_themes.accent_color,template=EXCLUDED.template,
                accent_color=EXCLUDED.accent_color,draft_template=NULL,draft_accent=NULL,updated_at=now()
            """;
        await using var command = db.CreateCommand(draft ? saveDraft : publish + ";\n" + ModelHeroes.PublishSql);
        command.Parameters.AddWithValue("tenant", tenant);
        command.Parameters.AddWithValue("template", input.Template);
        command.Parameters.AddWithValue("accent", input.AccentColor.ToUpperInvariant());
        await command.ExecuteNonQueryAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> Editor(NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var command = db.CreateCommand("""
            SELECT template,accent_color,draft_template,draft_accent,previous_template IS NOT NULL
            FROM saas_tenant_themes WHERE tenant_id=@tenant
            """);
        command.Parameters.AddWithValue("tenant", tenant.Id);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
            return Results.Ok(new { published = new ThemeView("modern", "#6B5140"), draft = (ThemeView?)null, canRestore = false });
        return Results.Ok(new
        {
            published = new ThemeView(reader.GetString(0), reader.GetString(1)),
            draft = reader.IsDBNull(2) ? null : new ThemeView(reader.GetString(2), reader.GetString(3)),
            canRestore = reader.GetBoolean(4)
        });
    }

    public static async Task<IResult> Read(NpgsqlDataSource db, Guid tenantId, CancellationToken ct)
    {
        await using var query = db.CreateCommand("SELECT template,accent_color FROM saas_tenant_themes WHERE tenant_id=@tenant");
        query.Parameters.AddWithValue("tenant", tenantId);
        await using var reader = await query.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct)
            ? Results.Ok(new ThemeView(reader.GetString(0), reader.GetString(1)))
            : Results.Ok(new ThemeView("modern", "#6B5140"));
    }
}
