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
        var configured = settings["Saas:LegacyHostnames"] ?? "";
        var allowed = configured.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var legacy = host is "localhost" or "127.0.0.1" or "::1"
            || allowed.Any(x => string.Equals(x, host, StringComparison.OrdinalIgnoreCase));
        if (allowed.Length > 0 && !legacy)
        {
            // A verified domain can resolve, but is not served until all data paths are isolated.
            // This prevents custom domains from accidentally seeing the legacy catalog.
            context.Response.StatusCode = StatusCodes.Status421MisdirectedRequest;
            await context.Response.WriteAsync("Domínio não configurado para esta instalação.");
            return;
        }
        context.Items["SaasTenantId"] = TenantContext.LegacyId;
        await next(context);
    }
}
