using Npgsql;
using System.Security.Claims;

static class DashboardEndpoints
{
    public static void Map(RouteGroupBuilder admin) =>
        admin.MapGet("/painel/resumo", Read);

    private static async Task<IResult> Read(NpgsqlDataSource db, TenantContext tenant, ClaimsPrincipal user, CancellationToken ct)
    {
        await using var command = db.CreateCommand("""
            WITH inventory AS (
                SELECT count(*) AS total,
                    count(*) FILTER (WHERE imoveis_property_visible(p)) AS published,
                    count(*) FILTER (WHERE status='Rascunho') AS drafts,
                    count(*) FILTER (WHERE status='Vendido') AS sold
                FROM properties p WHERE tenant_id=@tenant
            ), crm AS (
                SELECT count(*) AS leads,
                    count(*) FILTER (WHERE status='proposal') AS proposals,
                    count(*) FILTER (WHERE status='visit') AS visits,
                    count(*) FILTER (WHERE status='won') AS won
                FROM saas_leads WHERE tenant_id=@tenant
            )
            SELECT total,published,drafts,sold,leads,proposals,visits,won FROM inventory CROSS JOIN crm;
            SELECT id, title AS label, modified_at AS activity_at, 'imovel' AS kind FROM properties WHERE tenant_id=@tenant
            UNION ALL
            SELECT id, name, updated_at, 'lead' FROM saas_leads WHERE tenant_id=@tenant
            ORDER BY activity_at DESC, id LIMIT 6;
            SELECT staff.username, count(*), count(*) FILTER (WHERE lead.status='won')
            FROM saas_leads lead
            JOIN staff_users staff ON staff.tenant_id=lead.tenant_id AND staff.id=lead.assigned_to
            WHERE lead.tenant_id=@tenant
            GROUP BY staff.id,staff.username
            ORDER BY count(*) FILTER (WHERE lead.status='won') DESC,count(*) DESC,staff.username LIMIT 8;
            SELECT
                (SELECT count(*) FROM saas_leads WHERE tenant_id=@tenant AND preferred_visit_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date AND status NOT IN ('won','lost')),
                (SELECT count(*) FROM saas_leads l WHERE l.tenant_id=@tenant AND l.status NOT IN ('won','lost')
                    AND (l.status='proposal' OR l.request_kind='proposal')
                    AND COALESCE((SELECT h.action FROM saas_lead_stage_history h WHERE h.tenant_id=l.tenant_id AND h.lead_id=l.id
                        AND h.action IS NOT NULL ORDER BY h.id DESC LIMIT 1),'') NOT IN ('accepted','declined')),
                (SELECT count(*) FROM import_failures WHERE tenant_id=@tenant AND created_at>=now()-interval '7 days'),
                (SELECT count(*) FROM rental_charges WHERE @finance AND tenant_id=@tenant AND paid_at IS NULL
                    AND due_on<=(now() AT TIME ZONE 'America/Sao_Paulo')::date);
            SELECT l.id,p.title,l.name FROM saas_leads l LEFT JOIN properties p ON p.tenant_id=l.tenant_id AND p.id=l.property_id
            WHERE l.tenant_id=@tenant AND l.preferred_visit_date=(now() AT TIME ZONE 'America/Sao_Paulo')::date
                AND l.status NOT IN ('won','lost') ORDER BY l.created_at,l.id LIMIT 6
            """);
        command.Parameters.AddWithValue("tenant", tenant.Id);
        var finance = user.IsInRole("Administrador");
        command.Parameters.AddWithValue("finance",finance);
        await using var reader = await command.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);
        var totals = new
        {
            total = reader.GetInt64(0), published = reader.GetInt64(1), drafts = reader.GetInt64(2),
            sold = reader.GetInt64(3), leads = reader.GetInt64(4), proposals = reader.GetInt64(5),
            visits = reader.GetInt64(6), won = reader.GetInt64(7)
        };
        var activities = new List<DashboardActivity>();
        await reader.NextResultAsync(ct);
        while (await reader.ReadAsync(ct))
            activities.Add(new(reader.GetGuid(0),reader.GetString(1),reader.GetDateTime(2),reader.GetString(3)));
        var staff = new List<DashboardStaff>();
        await reader.NextResultAsync(ct);
        while (await reader.ReadAsync(ct))
            staff.Add(new(reader.GetString(0),reader.GetInt64(1),reader.GetInt64(2)));
        await reader.NextResultAsync(ct);
        await reader.ReadAsync(ct);
        var today = new { visits = reader.GetInt64(0), proposals = reader.GetInt64(1), importFailures = reader.GetInt64(2),
            overdueCharges = finance ? (long?)reader.GetInt64(3) : null };
        await reader.NextResultAsync(ct);
        var agenda = new List<object>();
        while (await reader.ReadAsync(ct))
            agenda.Add(new { id=reader.GetGuid(0), title=reader.IsDBNull(1) ? "Visita solicitada" : reader.GetString(1), name=reader.GetString(2) });
        return Results.Ok(new { totals.total, totals.published, totals.drafts, totals.sold,
            totals.leads, totals.proposals, totals.visits, totals.won, activities, staff, today, agenda });
    }

    private sealed record DashboardActivity(Guid Id, string Label, DateTime At, string Kind);
    private sealed record DashboardStaff(string Username, long Assigned, long Won);
}
