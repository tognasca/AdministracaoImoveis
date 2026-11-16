using Npgsql;

sealed class StorefrontBrand(NpgsqlDataSource db)
{
    private const string DefaultName = "Imóveis Cotia";
    private const string DefaultColor = "#6B5140";

    public async Task<(string Name, string Color, string? Email, string? WhatsApp, string TextColor)> Read(CancellationToken ct)
    {
        await using var command = db.CreateCommand("SELECT name, color, email, whatsapp, text_color FROM storefront_brand WHERE singleton");
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct)
            ? (reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4))
            : (DefaultName, DefaultColor, null, null, "auto");
    }

    public async Task Save(string name, string? color, string? email, string? whatsapp, string? textColor, CancellationToken ct)
    {
        await using var command = db.CreateCommand("""
            INSERT INTO storefront_brand (singleton, name, color, email, whatsapp, text_color)
            VALUES (true, @name, coalesce(@color, @default_color), @email, @whatsapp, coalesce(@text_color, 'auto'))
            ON CONFLICT (singleton) DO UPDATE SET name = EXCLUDED.name, color = coalesce(@color, storefront_brand.color),
                email = coalesce(@email, storefront_brand.email), whatsapp = coalesce(@whatsapp, storefront_brand.whatsapp),
                text_color = coalesce(@text_color, storefront_brand.text_color)
            """);
        command.Parameters.AddWithValue("name", name);
        command.Parameters.AddWithValue("color", NpgsqlTypes.NpgsqlDbType.Text, (object?)color ?? DBNull.Value);
        command.Parameters.AddWithValue("email", NpgsqlTypes.NpgsqlDbType.Text, (object?)email ?? DBNull.Value);
        command.Parameters.AddWithValue("whatsapp", NpgsqlTypes.NpgsqlDbType.Text, (object?)whatsapp ?? DBNull.Value);
        command.Parameters.AddWithValue("text_color", NpgsqlTypes.NpgsqlDbType.Text, (object?)textColor ?? DBNull.Value);
        command.Parameters.AddWithValue("default_color", DefaultColor);
        await command.ExecuteNonQueryAsync(ct);
    }
}
