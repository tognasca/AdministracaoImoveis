using System.Net.Mail;
using System.Xml.Linq;
using Npgsql;

static class OlxEndpoints
{
    private sealed record FeedInput(string? Origin, string? Email, string? ContactName, string? Phone, bool Enabled);
    private sealed record ListingInput(string? Zip, string? State, string? Description);
    private static readonly XNamespace Ns = "http://www.vivareal.com/schemas/1.0/VRSync";
    private const string Eligible = """
        p.status='Publicado' AND p.price>0 AND p.size>0
        AND imoveis_offer_visible(p.sale_availability,p.sale_reserved_until)
        AND length(trim(p.title)) BETWEEN 10 AND 100 AND trim(p.city)<>'' AND trim(p.district)<>''
        AND lower(p.kind) IN ('casa','apartamento')
        AND EXISTS (SELECT 1 FROM photos WHERE property_id=p.id)
        """;

    public static void Map(WebApplication app, RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/integracoes/olx").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        group.MapGet("", async (NpgsqlDataSource db,TenantContext tenant,CancellationToken ct) =>
        {
            var feed = await GetFeed(db,tenant.Id,ct);
            return Results.Ok(new { settings=feed, url=feed?.Origin+"/integracoes/olx/feed.xml" });
        });
        group.MapPut("", async (FeedInput input,NpgsqlDataSource db,TenantContext tenant,CancellationToken ct) =>
        {
            var email = input.Email?.Trim() ?? "";
            var name = input.ContactName?.Trim() ?? "";
            var phone = input.Phone?.Trim() ?? "";
            if (!Uri.TryCreate(input.Origin?.Trim(), UriKind.Absolute, out var origin) || origin.Scheme != "https"
                || origin.UserInfo.Length > 0 || origin.PathAndQuery != "/" || origin.Fragment.Length > 0)
                return Results.BadRequest("Informe somente o endereço base HTTPS da sua vitrine, sem caminho ou parâmetros.");
            if (origin.Host.Equals("olx.com.br", StringComparison.OrdinalIgnoreCase)
                || origin.Host.EndsWith(".olx.com.br", StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest("Informe o domínio HTTPS da sua vitrine para gerar o XML. Um endereço da OLX não é o domínio da vitrine.");
            if (name.Length is < 2 or > 100 || name.Any(char.IsControl) || phone.Count(char.IsAsciiDigit) is < 10 or > 15 ||
                phone.Length > 25 || phone.Any(c => !char.IsAsciiDigit(c) && !"+()- .".Contains(c)) ||
                email.Length > 254 || !MailAddress.TryCreate(email,out var address) || address.Address!=email)
                return Results.BadRequest("Informe a URL HTTPS da vitrine, nome, telefone e e-mail de contato.");
            await using var cmd = db.CreateCommand("""
                INSERT INTO olx_feeds VALUES (@tenant,@origin,@email,@name,@phone,@enabled)
                ON CONFLICT (tenant_id) DO UPDATE SET origin=EXCLUDED.origin,email=EXCLUDED.email,contact_name=EXCLUDED.contact_name,phone=EXCLUDED.phone,enabled=EXCLUDED.enabled
                """);
            cmd.Parameters.AddWithValue("tenant",tenant.Id);
            cmd.Parameters.AddWithValue("origin",origin.GetLeftPart(UriPartial.Authority));
            cmd.Parameters.AddWithValue("email",email);
            cmd.Parameters.AddWithValue("name",name);
            cmd.Parameters.AddWithValue("phone",phone);
            cmd.Parameters.AddWithValue("enabled",input.Enabled);
            await cmd.ExecuteNonQueryAsync(ct);
            return Results.NoContent();
        });
        group.MapPut("/imoveis/{id:guid}", async (Guid id,ListingInput input,NpgsqlDataSource db,TenantContext tenant,CancellationToken ct) =>
        {
            var zip = input.Zip?.Trim().Replace("-","") ?? "";
            var state = input.State?.Trim().ToUpperInvariant() ?? "";
            var description = input.Description?.Trim() ?? "";
            var states = " AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO ";
            if (zip.Length != 8 || !zip.All(char.IsAsciiDigit) || state.Length != 2 ||
                !states.Contains(" "+state+" ",StringComparison.Ordinal) || description.Length is < 50 or > 3000 || description.Any(c => char.IsControl(c) && c is not ('\r' or '\n' or '\t')))
                return Results.BadRequest("Informe CEP, UF e uma descrição pública com 50 a 3.000 caracteres.");
            await using var cmd = db.CreateCommand("""
                INSERT INTO olx_listings SELECT @tenant,p.id,@zip,@state,@description
                FROM properties p WHERE p.tenant_id=@tenant AND p.id=@id AND
                """+" "+Eligible+"""
                
                ON CONFLICT(tenant_id,property_id) DO UPDATE SET zip=EXCLUDED.zip,state=EXCLUDED.state,description=EXCLUDED.description
                """);
            cmd.Parameters.AddWithValue("tenant",tenant.Id);
            cmd.Parameters.AddWithValue("id",id);
            cmd.Parameters.AddWithValue("zip",zip);
            cmd.Parameters.AddWithValue("state",state);
            cmd.Parameters.AddWithValue("description",description);
            return await cmd.ExecuteNonQueryAsync(ct)==1 ? Results.NoContent() :
                Results.BadRequest("Selecione uma casa ou apartamento publicado com foto, área, preço, bairro, cidade e título de 10 a 100 caracteres.");
        });
        group.MapGet("/imoveis/{id:guid}", async (Guid id,NpgsqlDataSource db,TenantContext tenant,CancellationToken ct) =>
        {
            await using var cmd = db.CreateCommand("SELECT zip,state,description FROM olx_listings WHERE tenant_id=@tenant AND property_id=@id");
            cmd.Parameters.AddWithValue("tenant",tenant.Id);
            cmd.Parameters.AddWithValue("id",id);
            await using var reader=await cmd.ExecuteReaderAsync(ct);
            return Results.Ok(await reader.ReadAsync(ct) ? new ListingInput(reader.GetString(0),reader.GetString(1),reader.GetString(2)) :
                new ListingInput(null,null,null));
        });
        group.MapDelete("/imoveis/{id:guid}", async (Guid id,NpgsqlDataSource db,TenantContext tenant,CancellationToken ct) =>
        {
            await using var cmd = db.CreateCommand("DELETE FROM olx_listings WHERE tenant_id=@tenant AND property_id=@id");
            cmd.Parameters.AddWithValue("tenant",tenant.Id);
            cmd.Parameters.AddWithValue("id",id);
            await cmd.ExecuteNonQueryAsync(ct);
            return Results.NoContent();
        });
        app.MapGet("/integracoes/olx/feed.xml", Export);
    }

    private static async Task<FeedInput?> GetFeed(NpgsqlDataSource db,Guid tenant,CancellationToken ct)
    {
        await using var cmd = db.CreateCommand("SELECT origin,email,contact_name,phone,enabled FROM olx_feeds WHERE tenant_id=@tenant");
        cmd.Parameters.AddWithValue("tenant",tenant);
        await using var reader=await cmd.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new(reader.GetString(0),reader.GetString(1),reader.GetString(2),reader.GetString(3),reader.GetBoolean(4)) : null;
    }

    private static async Task<IResult> Export(NpgsqlDataSource db,TenantContext tenant,CancellationToken ct)
    {
        var feed = await GetFeed(db,tenant.Id,ct);
        if (feed is not {Enabled:true}) return Results.NotFound();
        await using var cmd = db.CreateCommand("""
            SELECT p.id,p.title,p.kind,p.district,p.city,p.price,p.bedrooms,p.size,o.zip,o.state,o.description,
                ARRAY(SELECT id FROM photos WHERE property_id=p.id ORDER BY slot)
            FROM olx_listings o JOIN properties p ON p.tenant_id=o.tenant_id AND p.id=o.property_id
            WHERE o.tenant_id=@tenant AND
            """+" "+Eligible+" ORDER BY p.id");
        cmd.Parameters.AddWithValue("tenant",tenant.Id);
        var listings = El("Listings");
        var contact = El("ContactInfo",El("Name",feed.ContactName!),El("Email",feed.Email!),El("Telephone",feed.Phone!));
        await using var reader=await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var id = reader.GetGuid(0);
            var media = El("Media",reader.GetFieldValue<Guid[]>(11).Select((photo,index) =>
                El("Item",new XAttribute("medium","image"),new XAttribute("caption",$"Foto {index+1}"),
                    new XAttribute("primary",index==0),$"{feed.Origin}/media/{id}/{photo}")));
            var details = El("Details",El("UsageType","Residential"),
                El("PropertyType",reader.GetString(2).Equals("casa",StringComparison.OrdinalIgnoreCase) ? "Residential / Home" : "Residential / Apartment"),
                El("Description",reader.GetString(10)),El("ListPrice",new XAttribute("currency","BRL"),reader.GetDecimal(5)),
                El("LivingArea",new XAttribute("unit","square metres"),reader.GetDecimal(7)),El("Bedrooms",reader.GetInt32(6)));
            var location = El("Location",new XAttribute("displayAddress","Neighborhood"),
                El("Country",new XAttribute("abbreviation","BR"),"Brasil"),
                El("State",new XAttribute("abbreviation",reader.GetString(9)),reader.GetString(9)),
                El("City",reader.GetString(4)),El("Neighborhood",reader.GetString(3)),El("PostalCode",reader.GetString(8)));
            listings.Add(El("Listing",El("ListingID",id.ToString()),El("Title",reader.GetString(1)),
                El("TransactionType","For Sale"),El("PublicationType","STANDARD"),El("DetailViewUrl",$"{feed.Origin}/#imovel/{id}"),
                media,details,location,new XElement(contact)));
        }
        XNamespace xsi = "http://www.w3.org/2001/XMLSchema-instance";
        var root = El("ListingDataFeed",new XAttribute(XNamespace.Xmlns+"xsi",xsi),
            new XAttribute(xsi+"schemaLocation",Ns.NamespaceName+" http://xml.vivareal.com/vrsync.xsd"),
            El("Header",El("Provider","AdministraçãoImoveis"),El("Email",feed.Email!),El("ContactName",feed.ContactName!),
                El("PublishDate",DateTime.UtcNow),El("Telephone",feed.Phone!)),listings);
        return Results.Content("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"+root,"application/xml; charset=utf-8");
    }

    private static XElement El(string name,params object[] content) => new(Ns+name,content);
}
