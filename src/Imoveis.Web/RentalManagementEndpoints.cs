using System.Security.Cryptography;
using Npgsql;

static class RentalManagementEndpoints
{
    private sealed record ContractInput(Guid PropertyId, string OwnerName, string RenterName,
        DateOnly StartsOn, DateOnly EndsOn, decimal MonthlyRent, decimal ManagementFee, short DueDay);
    private sealed record InspectionInput(DateOnly InspectedOn, string Notes);
    private sealed record AdjustmentInput(DateOnly Month, decimal Rent, decimal Fee, string Reason);
    private sealed record MonthInput(DateOnly Month);
    private sealed record SettlementInput(string Reference);
    private sealed record OwnerAccess(string Token);

    public static void Map(WebApplication app, RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/locacoes").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        group.MapGet("", List);
        group.MapGet("/{id:guid}", Detail);
        group.MapPost("", Create);
        group.MapPost("/{id:guid}/encerrar", Close);
        group.MapPut("/{id:guid}/vistorias/{kind}", SaveInspection);
        group.MapPost("/{id:guid}/anexos/{kind}", AddAttachment);
        group.MapGet("/{id:guid}/anexos/{attachment:guid}", ReadAttachment);
        group.MapPost("/{id:guid}/reajustes", Adjust);
        group.MapPost("/{id:guid}/cobrancas", Charge);
        group.MapPost("/{id:guid}/cobrancas/{month}/pagamento", (Guid id, DateOnly month, SettlementInput input,
            NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) => Settle(id, month, input, false, db, tenant, ct));
        group.MapPost("/{id:guid}/cobrancas/{month}/repasse", (Guid id, DateOnly month, SettlementInput input,
            NpgsqlDataSource db, TenantContext tenant, CancellationToken ct) => Settle(id, month, input, true, db, tenant, ct));
        group.MapPost("/{id:guid}/acesso-proprietario", IssueAccess);
        group.MapDelete("/{id:guid}/acesso-proprietario", RevokeAccess);
        app.MapPost("/api/proprietario/locacao", OwnerStatement).RequireRateLimiting("interest")
            .WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(4096));
    }

    private static async Task<IResult> List(int? page, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var query = db.CreateCommand("""
            SELECT COALESCE(jsonb_agg(to_jsonb(item)), '[]'::jsonb)::text FROM (
                SELECT c.id,p.title,c.owner_name,c.renter_name,c.starts_on,c.ends_on,c.signed_at,c.closed_at
                FROM rental_contracts c JOIN properties p ON (p.tenant_id,p.id)=(c.tenant_id,c.property_id)
                WHERE c.tenant_id=@tenant ORDER BY c.starts_on DESC,c.id LIMIT 30 OFFSET @offset
            ) item
            """);
        query.Parameters.AddWithValue("tenant", tenant.Id);
        query.Parameters.AddWithValue("offset", (PropertyEndpoints.Page(page) - 1) * 30);
        return await Json(query, ct);
    }

    private static async Task<IResult> Detail(Guid id, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var query = ContractCommand(db, tenant.Id, id, """
            SELECT jsonb_build_object(
                'contract', (to_jsonb(c) - 'owner_token_hash') || jsonb_build_object('title',p.title),
                'inspections', COALESCE((SELECT jsonb_agg(to_jsonb(v) - 'tenant_id' - 'contract_id') FROM rental_inspections v
                    WHERE (v.tenant_id,v.contract_id)=(c.tenant_id,c.id)), '[]'::jsonb),
                'attachments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind)) FROM rental_attachments a
                    WHERE (a.tenant_id,a.contract_id)=(c.tenant_id,c.id)), '[]'::jsonb),
                'adjustments', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'tenant_id' - 'contract_id' ORDER BY r.month DESC)
                    FROM rental_adjustments r WHERE (r.tenant_id,r.contract_id)=(c.tenant_id,c.id)), '[]'::jsonb),
                'charges', COALESCE((SELECT jsonb_agg(to_jsonb(m) - 'tenant_id' - 'contract_id' ORDER BY m.month DESC)
                    FROM rental_charges m WHERE (m.tenant_id,m.contract_id)=(c.tenant_id,c.id)), '[]'::jsonb)
            )::text FROM rental_contracts c JOIN properties p ON (p.tenant_id,p.id)=(c.tenant_id,c.property_id)
            WHERE c.tenant_id=@tenant AND c.id=@id
            """);
        return await Json(query, ct);
    }

    private static async Task<IResult> Create(ContractInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        if (!PropertyValidation.Required(input.OwnerName, 160) || !PropertyValidation.Required(input.RenterName, 160)
            || input.StartsOn == default || input.StartsOn.Year > 9989 || input.EndsOn < input.StartsOn || input.EndsOn > input.StartsOn.AddYears(10)
            || input.DueDay is < 1 or > 28 || !ValidMoney(input.MonthlyRent,input.ManagementFee))
            return Results.BadRequest("Confira as partes, a vigência (até dez anos), o vencimento e os valores.");
        var id = Guid.NewGuid();
        await using var query = ContractCommand(db, tenant.Id, id, """
            INSERT INTO rental_contracts(id,tenant_id,property_id,owner_name,renter_name,starts_on,ends_on,monthly_rent,management_fee,due_day)
            SELECT @id,@tenant,id,@owner,@renter,@start,@end,@rent,@fee,@due FROM properties
            WHERE id=@property AND tenant_id=@tenant
            ON CONFLICT (tenant_id,property_id) WHERE closed_at IS NULL DO NOTHING
            """);
        query.Parameters.AddWithValue("property",input.PropertyId);
        query.Parameters.AddWithValue("owner",input.OwnerName.Trim());
        query.Parameters.AddWithValue("renter",input.RenterName.Trim());
        query.Parameters.AddWithValue("start",input.StartsOn);
        query.Parameters.AddWithValue("end",input.EndsOn);
        query.Parameters.AddWithValue("rent",input.MonthlyRent);
        query.Parameters.AddWithValue("fee",input.ManagementFee);
        query.Parameters.AddWithValue("due",input.DueDay);
        return await query.ExecuteNonQueryAsync(ct) == 1 ? Results.Created($"/api/admin/locacoes/{id}",new {id}) :
            Results.Conflict("Confira o imóvel. Pode haver um contrato aberto para ele.");
    }

    private static async Task<IResult> Close(Guid id, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var query = ContractCommand(db, tenant.Id, id, """
            UPDATE rental_contracts SET closed_at=now() WHERE tenant_id=@tenant AND id=@id AND closed_at IS NULL
            """);
        return await Saved(query, ct);
    }

    private static async Task<IResult> SaveInspection(Guid id, string kind, InspectionInput input,
        NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        if (kind is not ("entrada" or "saida") || input.InspectedOn == default || input.Notes is not { Length: <= 8000 }
            || input.Notes.Contains('\0'))
            return Results.BadRequest("Confira o tipo, a data e as observações da vistoria.");
        await using var query = ContractCommand(db, tenant.Id, id, """
            INSERT INTO rental_inspections(tenant_id,contract_id,kind,inspected_on,notes)
            SELECT tenant_id,id,@kind,@date,@notes FROM rental_contracts WHERE tenant_id=@tenant AND id=@id
            ON CONFLICT (tenant_id,contract_id,kind) DO UPDATE SET inspected_on=EXCLUDED.inspected_on,notes=EXCLUDED.notes
            """);
        query.Parameters.AddWithValue("kind",kind);
        query.Parameters.AddWithValue("date",input.InspectedOn);
        query.Parameters.AddWithValue("notes",input.Notes.Trim());
        return await Saved(query,ct);
    }

    private static async Task<IResult> AddAttachment(Guid id, string kind, HttpRequest request,
        NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        if (kind is not ("contrato" or "entrada" or "saida") || !request.HasFormContentType)
            return Results.BadRequest("Selecione o documento ou a foto.");
        if (request.ContentLength > MediaStore.MaxBytes + 65536) return Results.StatusCode(413);
        IFormCollection form;
        try { form = await request.ReadFormAsync(ct); }
        catch (InvalidDataException) { return Results.StatusCode(413); }
        if (form.Files.Count != 1 || form.Files.GetFile("file") is not { } file)
            return Results.BadRequest("Envie um arquivo por vez.");
        if (file.Length is < 12 or > MediaStore.MaxBytes) return Results.StatusCode(413);
        var bytes = new byte[(int)file.Length];
        await using (var stream = file.OpenReadStream()) await stream.ReadExactlyAsync(bytes, ct);
        var type = kind == "contrato" ? (bytes.AsSpan(0,5).SequenceEqual("%PDF-"u8) ? "application/pdf" : null)
            : MediaStore.Detect(bytes.AsSpan(0,12));
        if (type is null) return Results.BadRequest("Use PDF para o contrato ou JPEG, PNG e WebP para a vistoria.");

        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        await using var guard = new NpgsqlCommand("SELECT id FROM rental_contracts WHERE tenant_id=@tenant AND id=@id FOR UPDATE",connection,tx);
        Bind(guard,tenant.Id,id);
        if (await guard.ExecuteScalarAsync(ct) is null) return Results.NotFound();
        await using var query = new NpgsqlCommand("""
            INSERT INTO rental_attachments(id,tenant_id,contract_id,kind,content_type,data)
            SELECT @attachment,@tenant,@id,@kind,@type,@data
            WHERE (@kind='contrato' OR EXISTS (SELECT 1 FROM rental_inspections WHERE tenant_id=@tenant AND contract_id=@id AND kind=@kind))
              AND (SELECT count(*) FROM rental_attachments WHERE tenant_id=@tenant AND contract_id=@id AND kind=@kind)<10
            ON CONFLICT DO NOTHING
            """,connection,tx);
        Bind(query,tenant.Id,id);
        query.Parameters.AddWithValue("attachment",Guid.NewGuid());
        query.Parameters.AddWithValue("kind",kind);
        query.Parameters.AddWithValue("type",type);
        query.Parameters.AddWithValue("data",bytes);
        if (await query.ExecuteNonQueryAsync(ct) != 1)
            return Results.Conflict("Salve a vistoria antes de anexar fotos. O limite é de dez fotos por vistoria e um contrato assinado.");
        if (kind == "contrato")
        {
            await using var sign = new NpgsqlCommand("UPDATE rental_contracts SET signed_at=now() WHERE tenant_id=@tenant AND id=@id",connection,tx);
            Bind(sign,tenant.Id,id);
            await sign.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ReadAttachment(Guid id, Guid attachment, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var query = ContractCommand(db, tenant.Id,id, """
            SELECT data,content_type FROM rental_attachments WHERE tenant_id=@tenant AND contract_id=@id AND id=@attachment
            """);
        query.Parameters.AddWithValue("attachment",attachment);
        await using var reader = await query.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return Results.NotFound();
        var type = reader.GetString(1);
        return Results.File(reader.GetFieldValue<byte[]>(0), type, type=="application/pdf" ? "contrato-assinado.pdf" : null);
    }

    private static async Task<IResult> Adjust(Guid id, AdjustmentInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        if (input.Month.Day != 1 || input.Month == default || !ValidMoney(input.Rent,input.Fee) || !PropertyValidation.Required(input.Reason,500))
            return Results.BadRequest("Informe a competência, os valores e o motivo do reajuste.");
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        if (!await LockContract(connection,tx,tenant.Id,id,ct)) return Results.NotFound();
        await using var query = new NpgsqlCommand("""
            INSERT INTO rental_adjustments(tenant_id,contract_id,month,rent,fee,reason)
            SELECT tenant_id,id,@month,@rent,@fee,@reason FROM rental_contracts c
            WHERE c.tenant_id=@tenant AND c.id=@id AND c.signed_at IS NOT NULL AND c.closed_at IS NULL
                AND @month BETWEEN date_trunc('month',c.starts_on::timestamp)::date AND c.ends_on
                AND NOT EXISTS (SELECT 1 FROM rental_charges m WHERE m.tenant_id=@tenant AND m.contract_id=@id AND m.month>=@month)
            ON CONFLICT DO NOTHING
            """,connection,tx);
        Bind(query,tenant.Id,id);
        query.Parameters.AddWithValue("month",input.Month);
        query.Parameters.AddWithValue("rent",input.Rent);
        query.Parameters.AddWithValue("fee",input.Fee);
        query.Parameters.AddWithValue("reason",input.Reason.Trim());
        if (await query.ExecuteNonQueryAsync(ct)!=1)
            return Results.Conflict("Confira a vigência e a assinatura. Use uma competência sem reajuste ou cobranças já geradas a partir dela.");
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> Charge(Guid id, MonthInput input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        if (input.Month.Day != 1 || input.Month == default) return Results.BadRequest("Informe uma competência válida.");
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        if (!await LockContract(connection,tx,tenant.Id,id,ct)) return Results.NotFound();
        await using var query = new NpgsqlCommand("""
            INSERT INTO rental_charges(tenant_id,contract_id,month,due_on,rent,fee)
            SELECT c.tenant_id,c.id,@month,GREATEST(@month::date + (c.due_day-1),c.starts_on),COALESCE(r.rent,c.monthly_rent),COALESCE(r.fee,c.management_fee)
            FROM rental_contracts c LEFT JOIN LATERAL (
                SELECT rent,fee FROM rental_adjustments a WHERE (a.tenant_id,a.contract_id)=(c.tenant_id,c.id)
                    AND a.month<=@month ORDER BY a.month DESC LIMIT 1
            ) r ON true
            WHERE c.tenant_id=@tenant AND c.id=@id AND c.signed_at IS NOT NULL AND c.closed_at IS NULL
              AND @month BETWEEN date_trunc('month',c.starts_on::timestamp)::date AND c.ends_on
            ON CONFLICT DO NOTHING
            """,connection,tx);
        Bind(query,tenant.Id,id);
        query.Parameters.AddWithValue("month",input.Month);
        if (await query.ExecuteNonQueryAsync(ct)!=1) return Results.Conflict("Confira a vigência, a assinatura e se a cobrança já existe.");
        await tx.CommitAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> Settle(Guid id, DateOnly month, SettlementInput input, bool transfer,
        NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        if (!PropertyValidation.Required(input.Reference,160)) return Results.BadRequest("Informe a referência do comprovante.");
        await using var query = ContractCommand(db,tenant.Id,id, transfer ? """
            UPDATE rental_charges SET transferred_at=now(),transfer_ref=@reference
            WHERE tenant_id=@tenant AND contract_id=@id AND month=@month AND paid_at IS NOT NULL AND transferred_at IS NULL
            """ : """
            UPDATE rental_charges SET paid_at=now(),payment_ref=@reference
            WHERE tenant_id=@tenant AND contract_id=@id AND month=@month AND paid_at IS NULL
            """);
        query.Parameters.AddWithValue("month",month);
        query.Parameters.AddWithValue("reference",input.Reference.Trim());
        return await query.ExecuteNonQueryAsync(ct)==1 ? Results.NoContent() :
            Results.Conflict("Confira a competência e o estado da cobrança. O repasse exige pagamento registrado.");
    }

    private static async Task<IResult> IssueAccess(Guid id, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        await using var query = ContractCommand(db,tenant.Id,id, """
            UPDATE rental_contracts SET owner_token_hash=@hash,owner_token_expires_at=now()+interval '30 days'
            WHERE tenant_id=@tenant AND id=@id
            """);
        query.Parameters.AddWithValue("hash",TokenHash(token));
        return await query.ExecuteNonQueryAsync(ct)==1 ? Results.Ok(new { token }) : Results.NotFound();
    }

    private static async Task<IResult> RevokeAccess(Guid id, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var query = ContractCommand(db,tenant.Id,id, """
            UPDATE rental_contracts SET owner_token_hash=NULL,owner_token_expires_at=NULL WHERE tenant_id=@tenant AND id=@id
            """);
        return await Saved(query,ct);
    }

    private static async Task<IResult> OwnerStatement(OwnerAccess input, NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        if (input.Token is not { Length:64 } || !input.Token.All(Uri.IsHexDigit)) return Results.NotFound();
        await using var query = db.CreateCommand("""
            SELECT jsonb_build_object('title',p.title,'starts_on',c.starts_on,'ends_on',c.ends_on,
                'charges',COALESCE((SELECT jsonb_agg(jsonb_build_object('month',m.month,'due_on',m.due_on,
                    'rent',m.rent,'fee',m.fee,'paid_at',m.paid_at,'transferred_at',m.transferred_at) ORDER BY m.month DESC)
                    FROM rental_charges m WHERE (m.tenant_id,m.contract_id)=(c.tenant_id,c.id)), '[]'::jsonb))::text
            FROM rental_contracts c JOIN properties p ON (p.tenant_id,p.id)=(c.tenant_id,c.property_id)
            WHERE c.tenant_id=@tenant AND c.owner_token_hash=@hash AND c.owner_token_expires_at>now()
            """);
        query.Parameters.AddWithValue("hash",TokenHash(input.Token));
        query.Parameters.AddWithValue("tenant",tenant.Id);
        return await Json(query,ct);
    }

    private static byte[] TokenHash(string token) => SHA256.HashData(Convert.FromHexString(token));
    private static bool ValidMoney(decimal rent, decimal fee) =>
        rent is > 0 and < 10000000000000m && fee >= 0 && fee <= rent && decimal.Round(rent,2)==rent && decimal.Round(fee,2)==fee;

    private static async Task<bool> LockContract(NpgsqlConnection connection, NpgsqlTransaction tx, Guid tenant, Guid id, CancellationToken ct)
    {
        await using var query = new NpgsqlCommand("SELECT id FROM rental_contracts WHERE tenant_id=@tenant AND id=@id FOR UPDATE",connection,tx);
        Bind(query,tenant,id);
        return await query.ExecuteScalarAsync(ct) is Guid;
    }

    private static NpgsqlCommand ContractCommand(NpgsqlDataSource db, Guid tenant, Guid id, string sql)
    {
        var query = db.CreateCommand(sql);
        Bind(query,tenant,id);
        return query;
    }

    private static void Bind(NpgsqlCommand query, Guid tenant, Guid id)
    {
        query.Parameters.AddWithValue("tenant",tenant);
        query.Parameters.AddWithValue("id",id);
    }

    private static async Task<IResult> Saved(NpgsqlCommand query, CancellationToken ct) =>
        await query.ExecuteNonQueryAsync(ct)==1 ? Results.NoContent() : Results.NotFound();

    private static async Task<IResult> Json(NpgsqlCommand query, CancellationToken ct) =>
        await query.ExecuteScalarAsync(ct) is string json ? Results.Content(json,"application/json") : Results.NotFound();
}
