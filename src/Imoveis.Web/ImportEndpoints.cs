using System.Text.Json;
using Npgsql;

record ImportModel(string Source, string[] Mapping);
record ImportLookup(string Source, string[] Codes);
record ImportRow(Guid? Id, PropertyInput Data);
record ImportBatch(string Source, string Filename, ImportRow[] Rows, byte[]? OriginalFile = null);
record ImportHistory(long Id, string Source, string Filename, int Count, DateTime CreatedAt, bool HasOriginal);
record SavedImportModel(string Signature, string Source, int MappedFields, DateTime UpdatedAt);

static class ImportEndpoints
{
    private static readonly HashSet<string> Fields = [
        "", "code", "title", "kind", "bedrooms", "district", "city", "zone", "location", "price", "size", "notes"
    ];

    public static void Map(RouteGroupBuilder admin, Func<PropertyInput, string?> validate)
    {
        var group = admin.MapGroup("/importacoes");
        group.MapGet("/historico", async (NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            await using var query = db.CreateCommand("""
                SELECT id,source,filename,imported,created_at,original_file IS NOT NULL FROM import_history WHERE tenant_id=@tenant ORDER BY id DESC LIMIT 30
                """);
            query.Parameters.AddWithValue("tenant", tenant.Id);
            await using var reader = await query.ExecuteReaderAsync(ct);
            var result = new List<ImportHistory>();
            while (await reader.ReadAsync(ct))
                result.Add(new(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3), reader.GetDateTime(4), reader.GetBoolean(5)));
            return Results.Ok(result);
        });
        group.MapGet("/historico/{id:long}/arquivo", async (long id, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            await using var query = db.CreateCommand("""
                SELECT filename,original_file FROM import_history WHERE tenant_id=@tenant AND id=@id AND original_file IS NOT NULL
                """);
            query.Parameters.AddWithValue("tenant", tenant.Id);
            query.Parameters.AddWithValue("id", id);
            await using var reader = await query.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct)) return Results.NotFound();
            return Results.File(reader.GetFieldValue<byte[]>(1), "application/octet-stream", reader.GetString(0));
        });
        group.MapGet("/modelos", async (NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            await using var query = db.CreateCommand("""
                SELECT signature,source,(SELECT count(*)::int FROM jsonb_array_elements_text(mapping) AS f(field)
                    WHERE f.field <> ''), updated_at
                FROM import_models WHERE tenant_id=@tenant ORDER BY updated_at DESC
                """);
            query.Parameters.AddWithValue("tenant", tenant.Id);
            await using var reader = await query.ExecuteReaderAsync(ct);
            var result = new List<SavedImportModel>();
            while (await reader.ReadAsync(ct))
                result.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt32(2), reader.GetDateTime(3)));
            return Results.Ok(result);
        });
        group.MapGet("/modelos/{signature}", async (string signature, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            if (!ValidSignature(signature)) return Results.BadRequest();
            await using var query = db.CreateCommand("""
                SELECT source, mapping::text FROM import_models WHERE tenant_id=@tenant AND signature=@signature
                ORDER BY updated_at DESC LIMIT 50
                """);
            query.Parameters.AddWithValue("tenant", tenant.Id);
            query.Parameters.AddWithValue("signature", signature);
            await using var reader = await query.ExecuteReaderAsync(ct);
            var models = new List<ImportModel>();
            while (await reader.ReadAsync(ct))
                models.Add(new(reader.GetString(0), JsonSerializer.Deserialize<string[]>(reader.GetString(1))!));
            return Results.Ok(models);
        });
        group.MapPut("/modelos/{signature}", async (string signature, ImportModel model, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            if (!ValidSignature(signature) || !ValidSource(model.Source) || model.Mapping is not { Length: > 0 and <= 100 }
                || !model.Mapping.Contains("code") || model.Mapping.Any(field => field is null || !Fields.Contains(field)))
                return Results.BadRequest("Confira o modelo de importação.");
            await using var query = db.CreateCommand("""
                INSERT INTO import_models(tenant_id,signature,source,mapping) VALUES(@tenant,@signature,@source,@mapping::jsonb)
                ON CONFLICT (tenant_id,signature,source) DO UPDATE SET mapping=EXCLUDED.mapping, updated_at=CURRENT_TIMESTAMP
                """);
            query.Parameters.AddWithValue("tenant", tenant.Id);
            query.Parameters.AddWithValue("signature", signature);
            query.Parameters.AddWithValue("source", model.Source.Trim());
            query.Parameters.AddWithValue("mapping", JsonSerializer.Serialize(model.Mapping));
            await query.ExecuteNonQueryAsync(ct);
            return Results.NoContent();
        });
        group.MapPost("/conferencia", async (ImportLookup input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            if (!ValidSource(input.Source) || input.Codes is not { Length: <= 5000 }
                || input.Codes.Any(code => string.IsNullOrWhiteSpace(code) || code.Length > 80))
                return Results.BadRequest("Confira a origem e os códigos do arquivo.");
            await using var query = db.CreateCommand("""
                SELECT id, code, title, kind, district, city, price, bedrooms, size, status, album, version, notes, zone
                FROM properties
                WHERE tenant_id=@tenant AND lower(source)=lower(@source) AND lower(code) IN (SELECT lower(code) FROM unnest(@codes) AS input(code))
                """);
            query.Parameters.AddWithValue("tenant", tenant.Id);
            query.Parameters.AddWithValue("source", input.Source.Trim());
            query.Parameters.AddWithValue("codes", input.Codes);
            await using var reader = await query.ExecuteReaderAsync(ct);
            var result = new List<ImportRow>();
            while (await reader.ReadAsync(ct))
                result.Add(new(reader.GetGuid(0), new(reader.GetString(1), input.Source.Trim(), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetDecimal(6),
                    reader.GetInt32(7), reader.GetDecimal(8), reader.GetString(9),
                    reader.IsDBNull(10) ? null : reader.GetString(10), reader.GetInt32(11), Notes: reader.IsDBNull(12) ? null : reader.GetString(12),
                    Zone: reader.IsDBNull(13) ? null : reader.GetString(13))));
            return Results.Ok(result);
        });
        group.MapPost("/confirmacao", async (ImportBatch input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            if (!ValidSource(input.Source) || string.IsNullOrWhiteSpace(input.Filename) || input.Filename.Length > 255 || input.Rows is not { Length: > 0 and <= 5000 }
                || input.Rows.Any(row => row?.Data is null))
                return Results.BadRequest("Lote inválido.");
            if (input.OriginalFile is { } file && (file.Length is <= 0 or > 8_000_000
                || Path.GetExtension(input.Filename).ToLowerInvariant() is not (".csv" or ".txt" or ".xlsx" or ".pdf")))
                return Results.BadRequest("O arquivo original deve ser PDF, Excel, CSV ou TXT de até 8 MB.");
            var source = input.Source.Trim();
            var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                await using var connection = await db.OpenConnectionAsync(ct);
                await using var transaction = await connection.BeginTransactionAsync(ct);
                foreach (var row in input.Rows.OrderBy(row => row.Id ?? Guid.Empty))
                {
                    var data = row.Data with { Source = source };
                    if (row.Id is { } id)
                    {
                        await using var current = new NpgsqlCommand("""
                            SELECT code,status,album,category_id,notes FROM properties
                            WHERE id=@id AND tenant_id=@tenant AND version=@version AND lower(source)=lower(@source) FOR UPDATE
                            """, connection, transaction);
                        current.Parameters.AddWithValue("tenant", tenant.Id);
                        current.Parameters.AddWithValue("id", id);
                        current.Parameters.AddWithValue("version", data.Version);
                        current.Parameters.AddWithValue("source", source);
                        await using var reader = await current.ExecuteReaderAsync(ct);
                        if (!await reader.ReadAsync(ct) || !string.Equals(reader.GetString(0), data.Code, StringComparison.OrdinalIgnoreCase))
                            return Results.Conflict("Um imóvel mudou. Gere a prévia novamente antes de importar.");
                        data = data with { Code = reader.GetString(0), Status = reader.GetString(1),
                            Album = reader.IsDBNull(2) ? null : reader.GetString(2),
                            CategoryId = reader.IsDBNull(3) ? null : reader.GetGuid(3),
                            Notes = string.IsNullOrWhiteSpace(data.Notes) ? (reader.IsDBNull(4) ? null : reader.GetString(4)) : data.Notes };
                    }
                    else data = data with { Status = "Rascunho", Album = null, Version = 0, CategoryId = null };

                    if (validate(data) is { } error) return Results.BadRequest(error);
                    if (!codes.Add(data.Code.Trim())) return Results.BadRequest("O lote tem códigos repetidos.");
                    if (!await PropertyStore.Save(row.Id ?? Guid.NewGuid(), data, row.Id is null, connection, transaction, ct, tenant.Id))
                        return Results.Conflict("Um imóvel mudou. Gere a prévia novamente antes de importar.");
                }
                await using var history = new NpgsqlCommand("""
                    INSERT INTO import_history(tenant_id,source,filename,imported,original_file) VALUES(@tenant,@source,@filename,@imported,@original)
                    """, connection, transaction);
                history.Parameters.AddWithValue("tenant", tenant.Id);
                history.Parameters.AddWithValue("source", source);
                history.Parameters.AddWithValue("filename", input.Filename);
                history.Parameters.AddWithValue("imported", input.Rows.Length);
                history.Parameters.AddWithValue("original", NpgsqlTypes.NpgsqlDbType.Bytea, (object?)input.OriginalFile ?? DBNull.Value);
                await history.ExecuteNonQueryAsync(ct);
                await transaction.CommitAsync(ct);
                return Results.Ok(new { count = input.Rows.Length });
            }
            catch (PostgresException error) when (error.SqlState is PostgresErrorCodes.UniqueViolation or PostgresErrorCodes.DeadlockDetected)
            {
                return Results.Conflict("Outro cadastro interferiu na importação. Gere a prévia novamente.");
            }
        });
    }

    private static bool ValidSource(string? source) => !string.IsNullOrWhiteSpace(source) && source.Length <= 100;
    private static bool ValidSignature(string signature) => signature.Length == 64 && signature.All(Uri.IsHexDigit);
}
