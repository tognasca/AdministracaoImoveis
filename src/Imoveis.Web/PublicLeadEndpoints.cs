using System.Net.Mail;
using Npgsql;

static class PublicLeadEndpoints
{
    internal sealed record InterestInput(Guid SubmissionId, string? Name, string? Email, string? Phone, string? Message);

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

        await using var command = db.CreateCommand("""
            WITH published AS (
                SELECT id FROM properties WHERE id=@property AND tenant_id=@tenant AND status='Publicado'
                FOR SHARE
            ), created AS (
                INSERT INTO saas_leads (id,tenant_id,property_id,name,email,phone,status,notes)
                SELECT @id,@tenant,id,@name,nullif(@email,''),nullif(@phone,''),'new',nullif(@message,'')
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
        return await command.ExecuteScalarAsync(ct) is true ? Results.NoContent() : Results.NotFound();
    }
}
