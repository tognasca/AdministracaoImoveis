using System.Net.Mail;
using Npgsql;

static class PublicLeadEndpoints
{
    internal sealed record InterestInput(Guid SubmissionId, string? Name, string? Email, string? Phone, string? Message,
        string? RequestKind = null, DateOnly? PreferredVisitDate = null, string? ProposalOperation = null, decimal? ProposedPrice = null);

    public static async Task<IResult> Register(Guid property, Guid tenant, InterestInput input,
        NpgsqlDataSource db, CancellationToken ct)
    {
        var name = input.Name?.Trim() ?? "";
        var email = input.Email?.Trim() ?? "";
        var phone = input.Phone?.Trim() ?? "";
        var message = input.Message?.Trim() ?? "";
        if (input.SubmissionId == Guid.Empty || name.Length is < 2 or > 100 || name.Any(char.IsControl))
            return Results.BadRequest("Informe seu nome.");
        if (email.Length > 254 || (email.Length > 0 &&
            (!MailAddress.TryCreate(email, out var address) || address.Address != email)))
            return Results.BadRequest("Informe um e-mail válido.");
        if (phone.Length > 40 || (phone.Length > 0 &&
            (phone.Count(char.IsAsciiDigit) is < 8 or > 15 || phone.Any(c => !char.IsAsciiDigit(c) && !"+()- .".Contains(c)))))
            return Results.BadRequest("Informe um telefone válido com DDD.");
        if (email.Length == 0 && phone.Length == 0)
            return Results.BadRequest("Informe seu telefone ou e-mail para receber o retorno.");
        if (message.Length > 800)
            return Results.BadRequest("A mensagem pode ter até 800 caracteres.");

        if (input.RequestKind is not (null or "visit" or "proposal"))
            return Results.BadRequest("Selecione um tipo de contato válido.");
        if (input.RequestKind == "visit" && input.PreferredVisitDate is null)
            return Results.BadRequest("Informe a data de preferência para a visita.");
        if (input.RequestKind == "proposal" && (input.ProposalOperation is not ("sale" or "rent") ||
            input.ProposedPrice is not { } price || price is <= 0 or >= 10000000000000m ||
            decimal.Round(price, 2) != price))
            return Results.BadRequest("Informe a operação e um valor válido para a proposta.");

        await using var command = db.CreateCommand("""
            WITH published AS (
                SELECT id FROM properties p WHERE id=@property AND tenant_id=@tenant AND imoveis_property_visible(p)
                  AND (@operation IS NULL OR (@operation='rent' AND rental IS NOT NULL AND imoveis_offer_visible(rent_availability,rent_reserved_until))
                    OR (@operation='sale' AND price>0 AND imoveis_offer_visible(sale_availability,sale_reserved_until)))
                FOR SHARE
            ), created AS (
                INSERT INTO saas_leads (id,tenant_id,property_id,name,email,phone,status,notes,request_kind,preferred_visit_date,proposal_operation,proposed_price)
                SELECT @id,@tenant,id,@name,nullif(@email,''),nullif(@phone,''),'new',nullif(@message,''),@kind,@visit_date,@operation,@proposed_price
                FROM published
                ON CONFLICT (id) DO NOTHING
                RETURNING id
            ), history AS (
                INSERT INTO saas_lead_stage_history (tenant_id,lead_id,status)
                SELECT @tenant,id,'new' FROM created
            )
            SELECT EXISTS (SELECT 1 FROM published)
            """);
        command.Parameters.AddWithValue("id",input.SubmissionId);
        command.Parameters.AddWithValue("tenant",tenant);
        command.Parameters.AddWithValue("property",property);
        command.Parameters.AddWithValue("name",name);
        command.Parameters.AddWithValue("email",email);
        command.Parameters.AddWithValue("phone",phone);
        command.Parameters.AddWithValue("message",message);
        command.Parameters.AddWithValue("kind", NpgsqlTypes.NpgsqlDbType.Text, (object?)input.RequestKind ?? DBNull.Value);
        command.Parameters.AddWithValue("visit_date", NpgsqlTypes.NpgsqlDbType.Date,
            input.RequestKind == "visit" ? (object?)input.PreferredVisitDate ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("operation", NpgsqlTypes.NpgsqlDbType.Text,
            input.RequestKind == "proposal" ? (object?)input.ProposalOperation ?? DBNull.Value : DBNull.Value);
        command.Parameters.AddWithValue("proposed_price", NpgsqlTypes.NpgsqlDbType.Numeric,
            input.RequestKind == "proposal" ? (object?)input.ProposedPrice ?? DBNull.Value : DBNull.Value);
        return await command.ExecuteScalarAsync(ct) is true ? Results.NoContent() : Results.NotFound();
    }
}
