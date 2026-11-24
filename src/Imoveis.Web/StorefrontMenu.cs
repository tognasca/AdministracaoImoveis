using Npgsql;

record MenuItem(Guid Id, string Name, string Kind, int Position, bool Visible);

sealed class StorefrontMenu(NpgsqlDataSource db)
{
    public async Task<List<MenuItem>> List(bool publicOnly, CancellationToken ct, Guid tenantId)
    {
        await using var command = db.CreateCommand("""
            SELECT id, name, kind, position, visible FROM storefront_menu
            WHERE tenant_id=@tenant AND (NOT @public_only OR visible) ORDER BY position, lower(name), id
            """);
        command.Parameters.AddWithValue("tenant", tenantId);
        command.Parameters.AddWithValue("public_only", publicOnly);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var items = new List<MenuItem>();
        while (await reader.ReadAsync(ct))
            items.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetInt32(3), reader.GetBoolean(4)));
        return items;
    }

    public async Task<bool> DeleteCategory(Guid id, CancellationToken ct, Guid tenantId)
    {
        await using var command = db.CreateCommand("DELETE FROM storefront_menu WHERE id=@id AND tenant_id=@tenant AND kind='category'");
        command.Parameters.AddWithValue("tenant", tenantId);
        command.Parameters.AddWithValue("id", id);
        return await command.ExecuteNonQueryAsync(ct) == 1;
    }

    public async Task<bool> Save(Guid id, string name, int position, bool visible, bool create, CancellationToken ct, Guid tenantId)
    {
        await using var command = db.CreateCommand(create ? """
            INSERT INTO storefront_menu (id, name, kind, position, visible, tenant_id)
            VALUES (@id, @name, 'category', @position, @visible, @tenant)
            """ : """
            UPDATE storefront_menu SET name=@name, position=@position, visible=@visible WHERE id=@id AND tenant_id=@tenant
            """);
        command.Parameters.AddWithValue("tenant", tenantId);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("name", name);
        command.Parameters.AddWithValue("position", position);
        command.Parameters.AddWithValue("visible", visible);
        return await command.ExecuteNonQueryAsync(ct) == 1;
    }
}
