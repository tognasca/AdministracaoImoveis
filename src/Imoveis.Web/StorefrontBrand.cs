using Npgsql;

sealed class StorefrontBrand(NpgsqlDataSource db)
{
    private const string DefaultName = "Imóveis Cotia";
    private const string DefaultColor = "#6B5140";

    public async Task<(string Name, string Color)> Read(CancellationToken ct)
    {
        await using var command = db.CreateCommand("SELECT name, color FROM storefront_brand WHERE singleton");
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? (reader.GetString(0), reader.GetString(1)) : (DefaultName, DefaultColor);
    }

    public async Task Save(string name, string? color, CancellationToken ct)
    {
        await using var command = db.CreateCommand("""
            INSERT INTO storefront_brand (singleton, name, color) VALUES (true, @name, coalesce(@color, @default_color))
            ON CONFLICT (singleton) DO UPDATE SET name = EXCLUDED.name, color = coalesce(@color, storefront_brand.color)
            """);
        command.Parameters.AddWithValue("name", name);
        command.Parameters.AddWithValue("color", NpgsqlTypes.NpgsqlDbType.Text, (object?)color ?? DBNull.Value);
        command.Parameters.AddWithValue("default_color", DefaultColor);
        await command.ExecuteNonQueryAsync(ct);
    }
}
