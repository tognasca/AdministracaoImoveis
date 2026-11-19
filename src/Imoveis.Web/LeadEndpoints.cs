using Npgsql;
using System.Security.Claims;

record LeadInput(Guid? PropertyId, string Name, string? Email, string? Phone, string Status, Guid? AssignedTo, string? Notes);
record LeadView(Guid Id, Guid? PropertyId, string Name, string? Email, string? Phone,
    string Status, Guid? AssignedTo, string? Notes, DateTime CreatedAt);

static class LeadEndpoints
{
    private static readonly HashSet<string> Statuses = ["new","contacted","visit","proposal","won","lost"];
    public static void Map(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/crm/leads");
        group.MapGet("", async (NpgsqlDataSource db, TenantContext tenant, string? status, CancellationToken ct) =>
        {
            if (!string.IsNullOrEmpty(status) && !Statuses.Contains(status)) return Results.BadRequest("Etapa inválida.");
            await using var command = db.CreateCommand("""
                SELECT id,property_id,name,email,phone,status,assigned_to,notes,created_at
                FROM saas_leads WHERE tenant_id=@tenant AND (@status='' OR status=@status)
                ORDER BY created_at DESC LIMIT 200
                """);
            command.Parameters.AddWithValue("tenant", tenant.Id);
            command.Parameters.AddWithValue("status", status ?? "");
            await using var reader = await command.ExecuteReaderAsync(ct);
            var leads = new List<LeadView>();
            while (await reader.ReadAsync(ct))
                leads.Add(new(reader.GetGuid(0),reader.IsDBNull(1)?null:reader.GetGuid(1),
                    reader.GetString(2),reader.IsDBNull(3)?null:reader.GetString(3),
                    reader.IsDBNull(4)?null:reader.GetString(4),reader.GetString(5),
                    reader.IsDBNull(6)?null:reader.GetGuid(6),
                    reader.IsDBNull(7)?null:reader.GetString(7),reader.GetDateTime(8)));
            return Results.Ok(leads);
        });
        group.MapPost("", async (LeadInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            if (Validate(input) is { } error) return Results.BadRequest(error);
            var id = Guid.NewGuid();
            await using var command = db.CreateCommand("""
                INSERT INTO saas_leads(id,tenant_id,property_id,name,email,phone,status,assigned_to,notes)
                SELECT @id,@tenant,@property,@name,@email,@phone,@status,@assigned,@notes
                WHERE (@property IS NULL OR EXISTS
                  (SELECT 1 FROM properties WHERE id=@property AND tenant_id=@tenant))
                  AND (@assigned IS NULL OR EXISTS
                  (SELECT 1 FROM staff_users WHERE id=@assigned AND tenant_id=@tenant AND active))
                """);
            Bind(command,id,input,tenant.Id);
            return await command.ExecuteNonQueryAsync(ct)==1
                ? Results.Created($"/api/admin/crm/leads/{id}",new {id})
                : Results.BadRequest("Imóvel ou responsável não pertence à imobiliária.");
        });
        group.MapPut("/{id:guid}", async (Guid id, LeadInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) =>
        {
            if (Validate(input) is { } error) return Results.BadRequest(error);
            await using var command = db.CreateCommand("""
                UPDATE saas_leads SET property_id=@property,name=@name,email=@email,phone=@phone,
                    status=@status,assigned_to=@assigned,notes=@notes,updated_at=now()
                WHERE id=@id AND tenant_id=@tenant
                  AND (@property IS NULL OR EXISTS
                    (SELECT 1 FROM properties WHERE id=@property AND tenant_id=@tenant))
                  AND (@assigned IS NULL OR EXISTS
                    (SELECT 1 FROM staff_users WHERE id=@assigned AND tenant_id=@tenant AND active))
                """);
            Bind(command,id,input,tenant.Id);
            return await command.ExecuteNonQueryAsync(ct)==1
                ? Results.NoContent() : Results.NotFound();
        });
    }

    private static string? Validate(LeadInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length>160
            || !Statuses.Contains(input.Status)) return "Confira nome e etapa do contato.";
        if (input.Email?.Length>254 || input.Phone?.Length>40 || input.Notes?.Length>4000)
            return "Um dos campos excede o tamanho permitido.";
        return null;
    }

    private static void Bind(NpgsqlCommand command, Guid id, LeadInput input, Guid tenantId)
    {
        command.Parameters.AddWithValue("id",id);
        command.Parameters.AddWithValue("tenant",tenantId);
        command.Parameters.AddWithValue("property",NpgsqlTypes.NpgsqlDbType.Uuid,(object?)input.PropertyId ?? DBNull.Value);
        command.Parameters.AddWithValue("name",input.Name.Trim());
        command.Parameters.AddWithValue("email",NpgsqlTypes.NpgsqlDbType.Text,(object?)input.Email?.Trim() ?? DBNull.Value);
        command.Parameters.AddWithValue("phone",NpgsqlTypes.NpgsqlDbType.Text,(object?)input.Phone?.Trim() ?? DBNull.Value);
        command.Parameters.AddWithValue("status",input.Status);
        command.Parameters.AddWithValue("assigned",NpgsqlTypes.NpgsqlDbType.Uuid,(object?)input.AssignedTo ?? DBNull.Value);
        command.Parameters.AddWithValue("notes",NpgsqlTypes.NpgsqlDbType.Text,(object?)input.Notes?.Trim() ?? DBNull.Value);
    }
}
