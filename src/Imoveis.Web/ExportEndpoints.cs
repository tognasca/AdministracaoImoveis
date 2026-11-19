using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Npgsql;

record ExportPhoto(Guid Id, int Slot, string Url);
record ExportProperty(Guid Id, string Code, string Source, string Title, string Kind,
    string District, string City, decimal Price, int Bedrooms, decimal Size,
    string Status, string? Notes, string? Zone, DateTime ModifiedAt, ExportPhoto[] Photos);

static class ExportEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapGet("/exportacoes/imoveis", Export);
        admin.MapGet("/exportacoes/formatos", () => Results.Ok(new[] { "json", "csv", "xml" }));
    }

    // Prevent spreadsheet formula execution when users open CSV files.
    private static string SafeCsv(string value)
    {
        var trimmed = value.TrimStart();
        return trimmed.Length > 0 && "=+-@".Contains(trimmed[0]) ? "'" + value : value;
    }

    private static async Task<IResult> Export(HttpRequest request, NpgsqlDataSource db, TenantContext tenant,
        string? format, DateTimeOffset? since, int? limit, CancellationToken ct)
    {
        var type = (format ?? "json").Trim().ToLowerInvariant();
        if (type is not ("json" or "csv" or "xml"))
            return Results.BadRequest("Formato disponível: json, csv ou xml.");
        if (limit is < 1 or > 5000)
            return Results.BadRequest("O limite deve estar entre 1 e 5000.");
        var max = limit ?? 500;
        await using var command = db.CreateCommand("""
            SELECT p.id,p.code,p.source,p.title,p.kind,p.district,p.city,p.price,p.bedrooms,
                   p.size,p.status,p.notes,p.zone,p.modified_at,
                   COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'slot',f.slot)
                     ORDER BY f.slot) FILTER (WHERE f.id IS NOT NULL),'[]'::jsonb)::text
            FROM properties p LEFT JOIN photos f ON f.property_id=p.id
            WHERE p.tenant_id=@tenant AND (@since IS NULL OR p.modified_at >= @since)
            GROUP BY p.id ORDER BY p.modified_at,p.id LIMIT @limit
            """);
        command.Parameters.AddWithValue("since", NpgsqlTypes.NpgsqlDbType.TimestampTz,
            (object?)since?.UtcDateTime ?? DBNull.Value);
        command.Parameters.AddWithValue("limit", max);
        command.Parameters.AddWithValue("tenant", tenant.Id);
        var items = new List<ExportProperty>();
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                var id = reader.GetGuid(0);
                using var photos = JsonDocument.Parse(reader.GetString(14));
                var links = photos.RootElement.EnumerateArray().Select(p =>
                {
                    var photoId = p.GetProperty("id").GetGuid();
                    return new ExportPhoto(photoId, p.GetProperty("slot").GetInt32(),
                        $"/media/{id}/{photoId}");
                }).ToArray();
                items.Add(new(id,reader.GetString(1),reader.GetString(2),reader.GetString(3),
                    reader.GetString(4),reader.GetString(5),reader.GetString(6),reader.GetDecimal(7),
                    reader.GetInt32(8),reader.GetDecimal(9),reader.GetString(10),
                    reader.IsDBNull(11) ? null : reader.GetString(11),
                    reader.IsDBNull(12) ? null : reader.GetString(12),reader.GetDateTime(13),links));
            }
        }
        var stamp = DateTimeOffset.UtcNow;
        if (type == "json") return Results.Ok(new { exportedAt = stamp, count = items.Count,
            nextSince = items.Count == max ? items[^1].ModifiedAt : (DateTime?)null, properties = items });

        if (type == "csv")
        {
            var csv = new StringBuilder("id;code;source;title;kind;district;city;price;bedrooms;size;status;notes;zone;modifiedAt;photoUrls\r\n");
            foreach (var p in items)
            {
                string[] fields = [p.Id.ToString(),p.Code,p.Source,p.Title,p.Kind,p.District,p.City,
                    p.Price.ToString(CultureInfo.InvariantCulture),p.Bedrooms.ToString(CultureInfo.InvariantCulture),
                    p.Size.ToString(CultureInfo.InvariantCulture),p.Status,p.Notes ?? "",p.Zone ?? "",
                    p.ModifiedAt.ToString("O",CultureInfo.InvariantCulture),
                    string.Join("|",p.Photos.Select(photo => photo.Url))];
                csv.AppendLine(string.Join(";",fields.Select(value => "\"" + SafeCsv(value).Replace("\"","\"\"") + "\"")));
            }
            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(),
                "text/csv", "imoveis.csv");
        }
        var xml = new XDocument(new XElement("imoveis",
            new XAttribute("exportadoEm",stamp.ToString("O")),
            items.Select(p => new XElement("imovel",
                new XAttribute("id",p.Id),new XElement("codigo",p.Code),
                new XElement("origem",p.Source),new XElement("titulo",p.Title),
                new XElement("tipo",p.Kind),new XElement("bairro",p.District),
                new XElement("cidade",p.City),new XElement("preco",p.Price),
                new XElement("dormitorios",p.Bedrooms),new XElement("area",p.Size),
                new XElement("status",p.Status),new XElement("observacoes",p.Notes ?? ""),
                new XElement("zona",p.Zone ?? ""),new XElement("alteradoEm",p.ModifiedAt.ToString("O")),
                new XElement("fotos",p.Photos.Select(photo => new XElement("foto",
                    new XAttribute("ordem",photo.Slot),photo.Url)))))));
        return Results.File(Encoding.UTF8.GetBytes(xml.ToString()),"application/xml","imoveis.xml");
    }
}
