using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Npgsql;

// Tenant provisioning is opt-in and restricted to the legacy administrator plus an independent key.
// New domains must be verified through a trusted operational channel before being marked verified.
static class SaasAdministrationEndpoints
{
    private sealed record TenantRequest(string Slug, string Name, string Username, string Password);
    private sealed record DomainRequest(string Hostname);
    private sealed record TenantStateRequest(string Status);
    private static readonly Regex SlugPattern = new("^[a-z0-9]+(-[a-z0-9]+)*$", RegexOptions.Compiled);

    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/api/platform").RequireAuthorization();
        group.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            var configured = http.RequestServices.GetRequiredService<IConfiguration>()["Saas:PlatformAdminKey"];
            var provided = http.Request.Headers["X-Saas-Platform-Key"].ToString();
            if (string.IsNullOrEmpty(configured) || configured.Length < 32
                || provided.Length != configured.Length
                || !CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(configured), Encoding.UTF8.GetBytes(provided)))
                return Results.NotFound();
            if (!http.User.IsInRole("Administrador")
                || TenantContext.AuthenticatedTenant(http.User) != TenantContext.LegacyId)
                return Results.Forbid();
            return await next(context);
        });

        group.MapPost("/imobiliarias", async (TenantRequest input, ClaimsPrincipal principal, NpgsqlDataSource db, CancellationToken ct) =>
        {
            if (input.Slug is null || input.Slug.Length > 80 || !SlugPattern.IsMatch(input.Slug)
                || string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 120
                || string.IsNullOrWhiteSpace(input.Username) || input.Username.Trim().Length > 80
                || input.Username.Any(char.IsControl)
                || input.Password is not { Length: >= 16 and <= 256 })
                return Results.BadRequest("Confira imobiliária, usuário inicial e senha de 16 a 256 caracteres.");
            var id = Guid.NewGuid();
            var user = new StaffUser(Guid.NewGuid(), input.Username.Trim(), "Administrador", true);
            var hash = new PasswordHasher<StaffUser>().HashPassword(user, input.Password);
            await using var connection = await db.OpenConnectionAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(ct);
            try
            {
                await using var insert = new NpgsqlCommand("""
                    INSERT INTO saas_tenants(id, slug, display_name) VALUES (@id,@slug,@name);
                    INSERT INTO staff_users(id,username,password_hash,role,tenant_id)
                    VALUES (@user,@username,@hash,'Administrador',@id);
                    INSERT INTO saas_tenant_themes(tenant_id) VALUES (@id);
                    """, connection, transaction);
                insert.Parameters.AddWithValue("id", id);
                insert.Parameters.AddWithValue("slug", input.Slug);
                insert.Parameters.AddWithValue("name", input.Name.Trim());
                insert.Parameters.AddWithValue("user", user.Id);
                insert.Parameters.AddWithValue("username", user.Username);
                insert.Parameters.AddWithValue("hash", hash);
                await insert.ExecuteNonQueryAsync(ct);
                await Audit(connection, transaction, id, principal, "tenant_created", input.Slug, ct);
                await transaction.CommitAsync(ct);
                return Results.Created($"/api/platform/imobiliarias/{id}", new { id, slug = input.Slug });
            }
            catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
            {
                return Results.Conflict("Este identificador já está cadastrado.");
            }
        });

        group.MapPost("/imobiliarias/{id:guid}/dominios", async (Guid id, DomainRequest input,
            ClaimsPrincipal principal, NpgsqlDataSource db, CancellationToken ct) =>
        {
            var hostname = input.Hostname?.Trim().TrimEnd('.').ToLowerInvariant();
            if (hostname is null || hostname.Length is < 4 or > 253
                || Uri.CheckHostName(hostname) != UriHostNameType.Dns)
                return Results.BadRequest("Informe um domínio DNS válido.");
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
            await using var connection = await db.OpenConnectionAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(ct);
            await using var command = new NpgsqlCommand("""
                INSERT INTO saas_domains(hostname,tenant_id,verification_token_hash,verification_requested_at)
                SELECT @host,id,@hash,now() FROM saas_tenants WHERE id=@tenant AND status='active'
                ON CONFLICT (hostname) DO NOTHING
                """, connection, transaction);
            command.Parameters.AddWithValue("host", hostname);
            command.Parameters.AddWithValue("tenant", id);
            command.Parameters.AddWithValue("hash", hash);
            if (await command.ExecuteNonQueryAsync(ct) == 0)
                return Results.Conflict("Domínio já cadastrado ou imobiliária indisponível.");
            await Audit(connection, transaction, id, principal, "domain_requested", hostname, ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(new { hostname, dnsRecord = "_imoveis-saas." + hostname,
                dnsType = "TXT", dnsValue = "imoveis-verify=" + token,
                instructions = "Publique o registro TXT DNS. Um operador deverá validar a titularidade antes de ativar o domínio." });
        });

        group.MapPut("/imobiliarias/{id:guid}/estado", async (Guid id, TenantStateRequest input,
            ClaimsPrincipal principal, NpgsqlDataSource db, CancellationToken ct) =>
        {
            if (id == TenantContext.LegacyId || input.Status is not ("active" or "suspended"))
                return Results.BadRequest("Estado inválido ou imobiliária principal protegida.");
            await using var connection = await db.OpenConnectionAsync(ct);
            await using var tx = await connection.BeginTransactionAsync(ct);
            await using var command = new NpgsqlCommand(
                "UPDATE saas_tenants SET status=@status WHERE id=@id", connection, tx);
            command.Parameters.AddWithValue("status", input.Status);
            command.Parameters.AddWithValue("id", id);
            if (await command.ExecuteNonQueryAsync(ct) == 0) return Results.NotFound();
            await Audit(connection, tx, id, principal,
                input.Status == "active" ? "tenant_activated" : "tenant_suspended", null, ct);
            await tx.CommitAsync(ct);
            return Results.NoContent();
        });
    }

    private static async Task Audit(NpgsqlConnection connection, NpgsqlTransaction tx, Guid tenantId,
        ClaimsPrincipal user, string action, string? detail, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("""
            INSERT INTO saas_tenant_audit(tenant_id,actor_tenant_id,actor_user_id,action,detail)
            VALUES (@tenant,@legacy,@actor,@action,@detail)
            """, connection, tx);
        command.Parameters.AddWithValue("tenant", tenantId);
        command.Parameters.AddWithValue("legacy", TenantContext.LegacyId);
        command.Parameters.AddWithValue("actor", Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!));
        command.Parameters.AddWithValue("action", action);
        command.Parameters.AddWithValue("detail", NpgsqlTypes.NpgsqlDbType.Text, (object?)detail ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(ct);
    }
}
