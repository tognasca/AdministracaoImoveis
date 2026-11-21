using Npgsql;

sealed class MediaStore(NpgsqlDataSource db, IConfiguration configuration)
{
    public const int MaxBytes = 8 * 1024 * 1024;
    private readonly string root = Path.GetFullPath(configuration["Media:Path"] ?? "./midia");

    private string FilePath(Guid property, Guid photo, Guid tenantId)
    {
        var directory = tenantId == TenantContext.LegacyId ? root : Path.Combine(root, "tenants", tenantId.ToString("N"));
        return Path.Combine(directory, property.ToString("N"), photo.ToString("N"));
    }

    public async Task<int> Add(Guid property, IFormFile file, CancellationToken ct, Guid tenantId)
    {
        if (file.Length is <= 0 or > MaxBytes) return 413;
        await using var stream = file.OpenReadStream();
        var header = new byte[12];
        if (await stream.ReadAtLeastAsync(header, header.Length, false, ct) != header.Length) return 415;
        var contentType = Detect(header);
        if (contentType is null) return 415;
        stream.Position = 0;
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        if (!await LockProperty(connection, tx, property, ct, tenantId)) return 404;
        await using var find = new NpgsqlCommand("""
            SELECT n FROM generate_series(0,4) AS n
            WHERE NOT EXISTS (SELECT 1 FROM photos WHERE property_id=@property AND slot=n)
            ORDER BY (n > COALESCE((SELECT max(slot) FROM photos WHERE property_id=@property), -1)) DESC, n LIMIT 1
            """, connection, tx);
        find.Parameters.AddWithValue("property", property);
        if (await find.ExecuteScalarAsync(ct) is not int slot) return 409;

        var id = Guid.NewGuid();
        var path = FilePath(property, id, tenantId);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var written = false;
        try
        {
            await using (var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
                await stream.CopyToAsync(output, ct);
            written = true;
            await using var insert = new NpgsqlCommand("""
                INSERT INTO photos(property_id,id,slot,content_type) VALUES(@property,@id,@slot,@type)
                """, connection, tx);
            insert.Parameters.AddWithValue("property", property);
            insert.Parameters.AddWithValue("id", id);
            insert.Parameters.AddWithValue("slot", slot);
            insert.Parameters.AddWithValue("type", contentType);
            await insert.ExecuteNonQueryAsync(ct);
            await tx.CommitAsync(CancellationToken.None);
            return 201;
        }
        finally
        {
            // A complete file can remain after an uncertain database commit. It has no public route without a row.
            if (!written) File.Delete(path);
        }
    }

    public async Task<IResult> Read(Guid property, Guid id, bool admin, CancellationToken ct, Guid tenantId)
    {
        await using var command = db.CreateCommand("""
            SELECT f.content_type FROM photos f JOIN properties p ON p.id=f.property_id
            WHERE f.property_id=@property AND f.id=@id AND p.tenant_id=@tenant AND (@admin OR p.status='Publicado')
            """);
        command.Parameters.AddWithValue("property", property);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("admin", admin);
        command.Parameters.AddWithValue("tenant", tenantId);
        if (await command.ExecuteScalarAsync(ct) is not string type) return Results.NotFound();
        try
        {
            var stream = new FileStream(FilePath(property, id, tenantId), FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete);
            return Results.File(stream, type, enableRangeProcessing: true);
        }
        catch (FileNotFoundException) { return Results.NotFound(); }
        catch (DirectoryNotFoundException) { return Results.NotFound(); }
    }

    public async Task<bool> Remove(Guid property, Guid id, CancellationToken ct, Guid tenantId)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        if (!await LockProperty(connection, tx, property, ct, tenantId)) return false;
        await using var command = new NpgsqlCommand(
            "DELETE FROM photos WHERE property_id=@property AND id=@id", connection, tx);
        command.Parameters.AddWithValue("property", property);
        command.Parameters.AddWithValue("id", id);
        if (await command.ExecuteNonQueryAsync(ct) == 0) return false;
        await tx.CommitAsync(CancellationToken.None);
        File.Delete(FilePath(property, id, tenantId));
        return true;
    }

    public async Task<bool> SetCover(Guid property, Guid id, CancellationToken ct, Guid tenantId)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        if (!await LockProperty(connection, tx, property, ct, tenantId)) return false;
        await using var command = new NpgsqlCommand("""
            WITH chosen AS (SELECT slot FROM photos WHERE property_id=@property AND id=@id),
                 first AS (SELECT min(slot) AS slot FROM photos WHERE property_id=@property)
            UPDATE photos p SET slot=CASE WHEN p.id=@id THEN first.slot ELSE chosen.slot END
            FROM chosen, first
            WHERE p.property_id=@property AND p.slot IN (chosen.slot, first.slot)
            """, connection, tx);
        command.Parameters.AddWithValue("property", property);
        command.Parameters.AddWithValue("id", id);
        if (await command.ExecuteNonQueryAsync(ct) == 0) return false;
        await tx.CommitAsync(CancellationToken.None);
        return true;
    }

    private static async Task<bool> LockProperty(NpgsqlConnection connection, NpgsqlTransaction tx, Guid property, CancellationToken ct, Guid tenantId)
    {
        await using var command = new NpgsqlCommand("SELECT 1 FROM properties WHERE id=@id AND tenant_id=@tenant FOR UPDATE", connection, tx);
        command.Parameters.AddWithValue("id", property);
        command.Parameters.AddWithValue("tenant", tenantId);
        return await command.ExecuteScalarAsync(ct) is not null;
    }

    internal static string? Detect(ReadOnlySpan<byte> header)
    {
        if (header[..3].SequenceEqual(new byte[] { 255, 216, 255 })) return "image/jpeg";
        if (header[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        return header[..4].SequenceEqual("RIFF"u8) && header[8..].SequenceEqual("WEBP"u8) ? "image/webp" : null;
    }
}
