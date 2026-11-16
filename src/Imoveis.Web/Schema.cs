using Npgsql;

static class Schema
{
    public static async Task Apply(NpgsqlDataSource db, CancellationToken ct)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await using var setup = new NpgsqlCommand("""
            SELECT pg_advisory_xact_lock(18462753);
            CREATE TABLE IF NOT EXISTS imoveis_schema (name text PRIMARY KEY);
            """, connection, transaction);
        await setup.ExecuteNonQueryAsync(ct);
        var assembly = typeof(Schema).Assembly;
        foreach (var name in assembly.GetManifestResourceNames().Where(name => name.EndsWith(".sql")).Order(StringComparer.Ordinal))
        {
            await using var check = new NpgsqlCommand("SELECT 1 FROM imoveis_schema WHERE name=@name", connection, transaction);
            check.Parameters.AddWithValue("name", name);
            if (await check.ExecuteScalarAsync(ct) is not null) continue;
            using var sql = new StreamReader(assembly.GetManifestResourceStream(name)!);
            await using var apply = new NpgsqlCommand(await sql.ReadToEndAsync(ct), connection, transaction);
            await apply.ExecuteNonQueryAsync(ct);
            await using var record = new NpgsqlCommand("INSERT INTO imoveis_schema(name) VALUES(@name)", connection, transaction);
            record.Parameters.AddWithValue("name", name);
            await record.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
    }
}
