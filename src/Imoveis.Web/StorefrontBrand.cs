using Npgsql;

sealed class StorefrontBrand(NpgsqlDataSource db)
{
    public const string DefaultName = "Imóveis Cotia";

    public async Task<string> Read(CancellationToken ct)
    {
        await using var command = db.CreateCommand("SELECT name FROM storefront_brand WHERE singleton");
        return await command.ExecuteScalarAsync(ct) as string ?? DefaultName;
    }

    public async Task Save(string name, CancellationToken ct)
    {
        await using var command = db.CreateCommand("""
            INSERT INTO storefront_brand (singleton, name) VALUES (true, @name)
            ON CONFLICT (singleton) DO UPDATE SET name = EXCLUDED.name
            """);
        command.Parameters.AddWithValue("name", name);
        await command.ExecuteNonQueryAsync(ct);
    }
}
