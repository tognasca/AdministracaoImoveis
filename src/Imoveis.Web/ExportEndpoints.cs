using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
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
        admin.MapGet("/exportacoes/formatos", () => Results.Ok(new[] { "json", "csv", "xml", "impressao" }));
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
        if (type is not ("json" or "csv" or "xml" or "impressao"))
            return Results.BadRequest("Formato disponível: json, csv, xml ou impressao.");
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
        if (type == "impressao") return PrintCatalog(items, max);

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

    private static IResult PrintCatalog(List<ExportProperty> items, int limit)
    {
        var culture = CultureInfo.GetCultureInfo("pt-BR");
        var html = new StringBuilder("""
            <!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>Catálogo de imóveis</title>
            <style>
            body{font:14px system-ui,sans-serif;color:#171717;margin:24px}
            table{width:100%;border-collapse:collapse}
            th,td{padding:8px;border-bottom:1px solid #bbb;text-align:left;overflow-wrap:anywhere}
            th:last-child,td:last-child{text-align:right}
            tr{break-inside:avoid}
            button{font:inherit;padding:8px 12px;cursor:pointer}
            @media print{button,.screen-only{display:none}body{margin:0}thead{display:table-header-group}}
            </style><main><h1>Catálogo de imóveis</h1>
            <button type="button" onclick="window.print()">Imprimir ou salvar como PDF</button>
            <p class="screen-only">Selecione Salvar como PDF na janela de impressão.</p>
            """);
        html.Append("<p>Imóveis neste relatório: ").Append(items.Count).Append("</p>");
        if (items.Count == limit)
            html.Append("<p>O relatório atingiu o limite de registros da exportação.</p>");
        html.Append("<table><thead><tr><th>Código</th><th>Imóvel</th><th>Cidade</th><th>Status</th><th>Preço</th></tr></thead><tbody>");
        foreach (var item in items)
        {
            html.Append("<tr>");
            foreach (var field in new[] { item.Code, item.Title, item.City, item.Status, item.Price.ToString("C", culture) })
                html.Append("<td>").Append(HtmlEncoder.Default.Encode(field)).Append("</td>");
            html.Append("</tr>");
        }
        html.Append("</tbody></table></main></html>");
        return Results.Content(html.ToString(), "text/html; charset=utf-8");
    }
}
