using Npgsql;

record PropertyInput(string Code, string Source, string Title, string Kind, string District, string City,
    decimal Price, int Bedrooms, decimal Size, string Status, string? Album, int Version, Guid? CategoryId = null, string? Notes = null);
record Property(Guid Id, PropertyInput Data, Guid[] Photos);

sealed class PropertyStore(NpgsqlDataSource db)
{
    private const string Columns = """
        p.id, p.code, p.source, p.title, p.kind, p.district, p.city, p.price, p.bedrooms,
        p.size, p.status, p.album, p.version, p.category_id, CASE WHEN @admin THEN p.notes END,
        ARRAY(SELECT id FROM photos WHERE property_id=p.id ORDER BY slot)
        """;

    public async Task<List<Property>> Get(bool admin, Guid? id, string search, int page, CancellationToken ct, string kind = "", decimal maxPrice = 0, int bedrooms = 0, Guid? category = null, bool gallery = false)
    {
        await using var command = db.CreateCommand($"""
            SELECT {Columns} FROM properties p
            WHERE (@admin OR status='Publicado') AND (@all OR p.id=@id)
              AND (@search='' OR concat_ws(' ',title,city,district,code) ILIKE @pattern)
              AND (@kind='' OR lower(kind)=lower(@kind))
              AND (@max_price=0 OR price<=@max_price)
              AND (@bedrooms=0 OR bedrooms>=@bedrooms)
              AND (@category IS NULL OR EXISTS (
                  SELECT 1 FROM storefront_menu m WHERE m.id=@category AND m.id=p.category_id AND m.visible AND m.kind='category'))
              AND (NOT @gallery OR EXISTS (SELECT 1 FROM photos WHERE property_id=p.id))
            ORDER BY lower(title), p.id LIMIT 30 OFFSET @offset
            """);
        command.Parameters.AddWithValue("admin", admin);
        command.Parameters.AddWithValue("all", id is null);
        command.Parameters.AddWithValue("id", id ?? Guid.Empty);
        command.Parameters.AddWithValue("search", search);
        command.Parameters.AddWithValue("pattern", "%" + search + "%");
        command.Parameters.AddWithValue("kind", kind);
        command.Parameters.AddWithValue("max_price", maxPrice);
        command.Parameters.AddWithValue("bedrooms", bedrooms);
        command.Parameters.AddWithValue("category", NpgsqlTypes.NpgsqlDbType.Uuid, (object?)category ?? DBNull.Value);
        command.Parameters.AddWithValue("gallery", gallery);
        command.Parameters.AddWithValue("offset", (page - 1) * 30);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var result = new List<Property>();
        while (await reader.ReadAsync(ct))
            result.Add(new(reader.GetGuid(0), new(reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetString(6),
                reader.GetDecimal(7), reader.GetInt32(8), reader.GetDecimal(9), reader.GetString(10),
                reader.IsDBNull(11) ? null : reader.GetString(11), reader.GetInt32(12),
                reader.IsDBNull(13) ? null : reader.GetGuid(13),
                reader.IsDBNull(14) ? null : reader.GetString(14)), reader.GetFieldValue<Guid[]>(15)));
        return result;
    }

    public async Task<int> PublishReadyDrafts(CancellationToken ct)
    {
        await using var command = db.CreateCommand("""
            UPDATE properties
               SET status = 'Publicado', version = version + 1
             WHERE status = 'Rascunho' AND btrim(city) <> '' AND btrim(kind) <> '' AND price > 0
            """);
        return await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<bool> Save(Guid id, PropertyInput input, bool create, CancellationToken ct)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        return await Save(id, input, create, connection, null, ct);
    }

    public static async Task<bool> Save(Guid id, PropertyInput input, bool create,
        NpgsqlConnection connection, NpgsqlTransaction? transaction, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand(create ? """
            INSERT INTO properties(id,code,source,title,kind,district,city,price,bedrooms,size,status,album,category_id,notes)
            VALUES(@id,@code,@source,@title,@kind,@district,@city,@price,@bedrooms,@size,@status,@album,@category,NULLIF(@notes,''))
            """ : """
            UPDATE properties SET code=@code,source=@source,title=@title,kind=@kind,district=@district,
                city=@city,price=@price,bedrooms=@bedrooms,size=@size,status=@status,album=@album,category_id=@category,
                notes=CASE WHEN @notes IS NULL THEN notes ELSE NULLIF(@notes,'') END,version=version+1
            WHERE id=@id AND version=@version
            """, connection, transaction);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("code", input.Code.Trim());
        command.Parameters.AddWithValue("source", input.Source.Trim());
        command.Parameters.AddWithValue("title", input.Title.Trim());
        command.Parameters.AddWithValue("kind", input.Kind.Trim());
        command.Parameters.AddWithValue("district", input.District.Trim());
        command.Parameters.AddWithValue("city", input.City.Trim());
        command.Parameters.AddWithValue("price", input.Price);
        command.Parameters.AddWithValue("bedrooms", input.Bedrooms);
        command.Parameters.AddWithValue("size", input.Size);
        command.Parameters.AddWithValue("status", input.Status);
        command.Parameters.AddWithValue("album", NpgsqlTypes.NpgsqlDbType.Text,
            string.IsNullOrWhiteSpace(input.Album) ? DBNull.Value : input.Album.Trim());
        command.Parameters.AddWithValue("category", NpgsqlTypes.NpgsqlDbType.Uuid, (object?)input.CategoryId ?? DBNull.Value);
        command.Parameters.AddWithValue("notes", NpgsqlTypes.NpgsqlDbType.Text,
            (object?)input.Notes?.Trim() ?? DBNull.Value);
        command.Parameters.AddWithValue("version", input.Version);
        return await command.ExecuteNonQueryAsync(ct) == 1;
    }
}
