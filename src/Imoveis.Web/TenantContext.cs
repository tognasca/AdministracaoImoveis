using System.Security.Claims;
using Npgsql;

// Resolves the company for each request. Unknown hosts never fall back to another tenant.
sealed class TenantContext(IHttpContextAccessor accessor)
{
    public static readonly Guid LegacyId = Guid.Parse("00000000-0000-4000-8000-000000000001");
    public Guid Id => accessor.HttpContext?.Items["SaasTenantId"] is Guid id
        ? id : throw new InvalidOperationException("Tenant context was not resolved.");
    public static Guid? AuthenticatedTenant(ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirstValue("tenant_id"), out var id) ? id : null;
}

static class TenantResolver
{
    public static async Task Resolve(HttpContext context, RequestDelegate next)
    {
        var settings = context.RequestServices.GetRequiredService<IConfiguration>();
        var host = context.Request.Host.Host.TrimEnd('.').ToLowerInvariant();
        if (!settings.GetValue<bool>("Saas:EnableMultiTenant"))
        {
            var configured = settings["Saas:LegacyHostnames"] ?? "";
            var allowed = configured.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (allowed.Length == 0 || host is "localhost" or "127.0.0.1" or "::1"
                || allowed.Contains(host, StringComparer.OrdinalIgnoreCase))
            {
                context.Items["SaasTenantId"] = TenantContext.LegacyId;
                await next(context);
                return;
            }
        }
        else
        {
            var db = context.RequestServices.GetRequiredService<NpgsqlDataSource>();
            await using var query = db.CreateCommand("""
                SELECT t.id FROM saas_domains d JOIN saas_tenants t ON t.id=d.tenant_id
                WHERE d.hostname=@host AND d.verified_at IS NOT NULL AND t.status='active'
                """);
            query.Parameters.AddWithValue("host", host);
            if (await query.ExecuteScalarAsync(context.RequestAborted) is Guid id)
            {
                context.Items["SaasTenantId"] = id;
                await next(context);
                return;
            }
        }

        context.Response.StatusCode = StatusCodes.Status421MisdirectedRequest;
        await context.Response.WriteAsync("Domínio não configurado para esta instalação.");
    }
}
