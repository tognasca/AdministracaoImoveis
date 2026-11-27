using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

static class SessionEndpoints
{
    public static void Map(WebApplication app, RouteGroupBuilder admin)
    {
        app.MapPost("/api/admin/login", async (Login input, HttpContext ctx, StaffStore staff, TenantContext tenant, CancellationToken ct) =>
        {
            var user = await staff.Verify(input.Username, input.Password, ct, tenant.Id);
            if (user is null) return Results.Unauthorized();
            var identity = new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Role),
                new Claim("tenant_id", tenant.Id.ToString())
                ], CookieAuthenticationDefaults.AuthenticationScheme);
            await ctx.SignInAsync(new ClaimsPrincipal(identity));
            return Results.NoContent();
        }).RequireRateLimiting("login");

        admin.MapGet("/session", (ClaimsPrincipal user) =>
            Results.Ok(new { username = user.Identity?.Name, administrator = user.IsInRole("Administrador") }));
        admin.MapPost("/logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).AllowAnonymous();
    }

    private record Login(string? Username, string? Password);
}
