using System.Security.Claims;
using Npgsql;
using NpgsqlTypes;

static class AvailabilityEndpoints
{
    private sealed record Change(string Availability, DateTimeOffset? ReservedUntil, int Version);

    public static void Map(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/imoveis/{id:guid}/disponibilidade");
        group.MapGet("", Read);
        group.MapPut("/{operation}", Update);
    }

    private static async Task<IResult> Read(Guid id, TenantContext tenant, NpgsqlDataSource db, CancellationToken ct)
    {
        await using var query = db.CreateCommand("""
            SELECT jsonb_build_object('version',p.version,
                'sale',jsonb_build_object('availability',p.sale_availability,'reservedUntil',p.sale_reserved_until),
                'rent',jsonb_build_object('availability',p.rent_availability,'reservedUntil',p.rent_reserved_until),
                'history',COALESCE((SELECT jsonb_agg(to_jsonb(item)) FROM (
                    SELECT h.operation,h.availability,h.reserved_until,h.changed_at,u.username
                    FROM property_availability_history h JOIN staff_users u ON u.tenant_id=h.tenant_id AND u.id=h.changed_by
                    WHERE h.tenant_id=p.tenant_id AND h.property_id=p.id ORDER BY h.id DESC LIMIT 30
                ) item),'[]'::jsonb))::text
            FROM properties p WHERE p.id=@id AND p.tenant_id=@tenant
            """);
        query.Parameters.AddWithValue("id",id);
        query.Parameters.AddWithValue("tenant",tenant.Id);
        return await query.ExecuteScalarAsync(ct) is string json ? Results.Content(json,"application/json") : Results.NotFound();
    }

    private static async Task<IResult> Update(Guid id, string operation, Change input, ClaimsPrincipal user,
        TenantContext tenant, NpgsqlDataSource db, CancellationToken ct)
    {
        if (operation is not ("sale" or "rent") || input.Availability is not ("available" or "negotiating" or "reserved" or "closed"))
            return Results.BadRequest("Confira a operação e a disponibilidade.");
        if (input.Availability == "reserved" && !(input.ReservedUntil > DateTimeOffset.UtcNow))
            return Results.BadRequest("Informe um prazo futuro para a reserva.");

        await using var query = db.CreateCommand("""
            WITH changed AS (
                UPDATE properties SET
                    sale_availability=CASE WHEN @operation='sale' THEN @availability ELSE sale_availability END,
                    rent_availability=CASE WHEN @operation='rent' THEN @availability ELSE rent_availability END,
                    sale_reserved_until=CASE WHEN @operation='sale' THEN @until ELSE sale_reserved_until END,
                    rent_reserved_until=CASE WHEN @operation='rent' THEN @until ELSE rent_reserved_until END,
                    version=version+1
                WHERE id=@id AND tenant_id=@tenant AND version=@version
                    AND ((@operation='sale' AND price>0) OR (@operation='rent' AND rental IS NOT NULL))
                RETURNING id
            )
            INSERT INTO property_availability_history (tenant_id,property_id,operation,availability,reserved_until,changed_by)
            SELECT @tenant,id,@operation,@availability,@until,@actor FROM changed
            """);
        query.Parameters.AddWithValue("id",id);
        query.Parameters.AddWithValue("tenant",tenant.Id);
        query.Parameters.AddWithValue("version",input.Version);
        query.Parameters.AddWithValue("operation",operation);
        query.Parameters.AddWithValue("availability",input.Availability);
        query.Parameters.AddWithValue("until",NpgsqlDbType.TimestampTz,input.Availability == "reserved" && input.ReservedUntil is { } until
            ? (object)until.UtcDateTime : DBNull.Value);
        query.Parameters.AddWithValue("actor",Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!));
        return await query.ExecuteNonQueryAsync(ct) == 1 ? Results.NoContent() :
            Results.Conflict("A oferta mudou ou ainda não tem preço. Reabra o imóvel e tente novamente.");
    }
}
