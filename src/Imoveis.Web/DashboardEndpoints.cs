using Npgsql;

static class DashboardEndpoints
{
    public static void Map(RouteGroupBuilder admin) =>
        admin.MapGet("/painel/resumo", Read);

    private static async Task<IResult> Read(NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var command = db.CreateCommand("""
            WITH inventory AS (
                SELECT count(*) AS total,
                    count(*) FILTER (WHERE status='Publicado') AS published,
                    count(*) FILTER (WHERE status='Rascunho') AS drafts,
                    count(*) FILTER (WHERE status='Vendido') AS sold
                FROM properties WHERE tenant_id=@tenant
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
            ORDER BY count(*) FILTER (WHERE lead.status='won') DESC,count(*) DESC,staff.username LIMIT 8
            """);
        command.Parameters.AddWithValue("tenant", tenant.Id);
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
        return Results.Ok(new { totals.total, totals.published, totals.drafts, totals.sold,
            totals.leads, totals.proposals, totals.visits, totals.won, activities, staff });
    }

    private sealed record DashboardActivity(Guid Id, string Label, DateTime At, string Kind);
    private sealed record DashboardStaff(string Username, long Assigned, long Won);
}
