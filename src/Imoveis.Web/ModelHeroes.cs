using Npgsql;
using NpgsqlTypes;

static class ModelHeroes
{
    public static bool ValidTemplate(string template) =>
        template is "premium" or "minimal" or "modern" or "commercial" or "boutique";

    public static void Map(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/vitrine/hero/{template}")
            .RequireAuthorization(policy => policy.RequireRole("Administrador"));
        group.MapGet("", async (string template, TenantContext tenant, NpgsqlDataSource db, CancellationToken ct) =>
        {
            if (!ValidTemplate(template)) return Results.NotFound();
            await using var query = db.CreateCommand("""
                SELECT mode,property_id,photo_id,draft FROM storefront_model_heroes
                WHERE tenant_id=@tenant AND template=@template ORDER BY draft DESC LIMIT 1
                """);
            Bind(query, tenant.Id, template);
            await using var reader = await query.ExecuteReaderAsync(ct);
            return await reader.ReadAsync(ct)
                ? Results.Ok(new { mode=reader.GetString(0), propertyId=reader.IsDBNull(1) ? (Guid?)null : reader.GetGuid(1),
                    photoId=reader.IsDBNull(2) ? (Guid?)null : reader.GetGuid(2), draft=reader.GetBoolean(3) })
                : Results.Ok(new { mode="default", draft=false });
        });
        group.MapPut("", Save);
        group.MapGet("/imagem", (string template, TenantContext tenant, NpgsqlDataSource db, MediaStore media,
            StorefrontImages images, CancellationToken ct) =>
            ValidTemplate(template) ? Read(db, media, images, tenant.Id, template, true, ct) : Task.FromResult(Results.NotFound()));
    }

    private static async Task<IResult> Save(string template, HttpRequest request, TenantContext tenant,
        NpgsqlDataSource db, CancellationToken ct)
    {
        if (!ValidTemplate(template) || !request.HasFormContentType) return Results.BadRequest("Escolha um modelo e uma fonte de imagem.");
        IFormCollection form;
        try { form = await request.ReadFormAsync(ct); }
        catch (InvalidDataException) { return Results.StatusCode(413); }
        var mode = form["mode"].ToString();
        byte[]? image = null;
        string? mime = null;
        Guid? property = null, photo = null;
        if (mode == "upload")
        {
            if (form.Files.Count != 1 || form.Files.GetFile("image") is not { Length: >= 12 and <= MediaStore.MaxBytes } file)
                return Results.BadRequest("Envie uma imagem de até 8 MB.");
            await using var input = file.OpenReadStream();
            image = new byte[(int)file.Length];
            await input.ReadExactlyAsync(image,ct);
            mime = MediaStore.Detect(image.AsSpan(0,12));
            if (mime is null) return Results.StatusCode(415);
        }
        else if (mode == "property")
        {
            if (!Guid.TryParse(form["propertyId"],out var propertyId) || !Guid.TryParse(form["photoId"],out var photoId))
                return Results.BadRequest("Escolha uma foto de um imóvel publicado.");
            property = propertyId;
            photo = photoId;
        }
        else if (mode != "default") return Results.BadRequest("Escolha uma fonte de imagem.");

        await using var query = db.CreateCommand("""
            INSERT INTO storefront_model_heroes(tenant_id,template,draft,mode,image,mime,property_id,photo_id)
            SELECT @tenant,@template,true,@mode,@image,@mime,@property,@photo
            WHERE @mode <> 'property' OR EXISTS (
                SELECT 1 FROM properties p JOIN photos f ON f.property_id=p.id
                WHERE p.id=@property AND p.tenant_id=@tenant AND imoveis_property_visible(p) AND f.id=@photo)
            ON CONFLICT (tenant_id,template,draft) DO UPDATE SET
                mode=EXCLUDED.mode,image=EXCLUDED.image,mime=EXCLUDED.mime,
                property_id=EXCLUDED.property_id,photo_id=EXCLUDED.photo_id
            """);
        Bind(query,tenant.Id,template);
        query.Parameters.AddWithValue("mode",mode);
        query.Parameters.AddWithValue("image",NpgsqlDbType.Bytea,(object?)image ?? DBNull.Value);
        query.Parameters.AddWithValue("mime",NpgsqlDbType.Text,(object?)mime ?? DBNull.Value);
        query.Parameters.AddWithValue("property",NpgsqlDbType.Uuid,(object?)property ?? DBNull.Value);
        query.Parameters.AddWithValue("photo",NpgsqlDbType.Uuid,(object?)photo ?? DBNull.Value);
        return await query.ExecuteNonQueryAsync(ct) == 1 ? Results.NoContent() :
            Results.BadRequest("A foto precisa pertencer a um imóvel publicado desta imobiliária.");
    }

    public static async Task<bool> HasPublished(NpgsqlDataSource db, Guid tenant, CancellationToken ct)
    {
        await using var query = db.CreateCommand("""
            SELECT EXISTS (
                SELECT 1 FROM storefront_model_heroes h JOIN saas_tenant_themes t
                ON t.tenant_id=h.tenant_id AND t.template=h.template
                WHERE h.tenant_id=@tenant AND NOT h.draft AND h.mode <> 'default')
            """);
        query.Parameters.AddWithValue("tenant",tenant);
        return await query.ExecuteScalarAsync(ct) is true;
    }

    public static async Task<IResult> Read(NpgsqlDataSource db, MediaStore media, StorefrontImages images,
        Guid tenant, string? template, bool draft, CancellationToken ct)
    {
        await using var query = db.CreateCommand("""
            SELECT mode,image,mime,property_id,photo_id FROM storefront_model_heroes
            WHERE tenant_id=@tenant
                AND template=coalesce(@template,(SELECT template FROM saas_tenant_themes WHERE tenant_id=@tenant))
                AND (@draft OR NOT draft)
            ORDER BY draft DESC LIMIT 1
            """);
        Bind(query,tenant,template);
        query.Parameters.AddWithValue("draft",draft);
        Guid? property = null, photo = null;
        await using (var reader = await query.ExecuteReaderAsync(ct))
        {
            if (await reader.ReadAsync(ct))
            {
                var mode = reader.GetString(0);
                if (mode == "upload") return Results.File(reader.GetFieldValue<byte[]>(1),reader.GetString(2));
                if (mode == "property") { property=reader.GetGuid(3); photo=reader.GetGuid(4); }
            }
        }
        if (property is { } id && photo is { } photoId)
        {
            var result = await media.Read(id,photoId,false,ct,tenant);
            if (result is not IStatusCodeHttpResult { StatusCode: 404 }) return result;
        }
        return await images.Read(StorefrontImage.Banner,ct,tenant);
    }

    private static void Bind(NpgsqlCommand query, Guid tenant, string? template)
    {
        query.Parameters.AddWithValue("tenant",tenant);
        query.Parameters.AddWithValue("template",NpgsqlDbType.Text,(object?)template ?? DBNull.Value);
    }

    public const string PublishSql = """
        WITH pending AS (
            DELETE FROM storefront_model_heroes WHERE tenant_id=@tenant AND template=@template AND draft
            RETURNING tenant_id,template,mode,image,mime,property_id,photo_id
        )
        INSERT INTO storefront_model_heroes(tenant_id,template,draft,mode,image,mime,property_id,photo_id)
        SELECT tenant_id,template,false,mode,image,mime,property_id,photo_id FROM pending
        ON CONFLICT (tenant_id,template,draft) DO UPDATE SET
            mode=EXCLUDED.mode,image=EXCLUDED.image,mime=EXCLUDED.mime,
            property_id=EXCLUDED.property_id,photo_id=EXCLUDED.photo_id
        """;
}
