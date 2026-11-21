using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;

static class WebStartup
{
    public static string ConfigureServices(WebApplicationBuilder builder)
    {
        var password = builder.Configuration["Admin:Password"];
        if (string.IsNullOrWhiteSpace(password) || password.Length is < 16 or > 256)
            throw new InvalidOperationException("Configure Admin__Password com 16 a 256 caracteres.");
        var connectionString = builder.Configuration.GetConnectionString("Imoveis")
            ?? throw new InvalidOperationException("Configure ConnectionStrings__Imoveis.");

        builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<TenantContext>();
        builder.Services.AddSingleton<PropertyStore>();
        builder.Services.AddSingleton<StaffStore>();
        builder.Services.AddSingleton<MediaStore>();
        builder.Services.AddSingleton<StorefrontImages>();
        builder.Services.AddSingleton<StorefrontBrand>();
        builder.Services.AddSingleton<StorefrontMenu>();
        builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = MediaStore.MaxBytes + 65536);
        builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
        {
            options.Cookie.Name = "imoveis-admin";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
                ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            options.Events.OnValidatePrincipal = async context =>
            {
                var identity = context.Principal;
                var tenant = context.HttpContext.RequestServices.GetRequiredService<TenantContext>();
                var staff = context.HttpContext.RequestServices.GetRequiredService<StaffStore>();
                if (!Guid.TryParse(identity?.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
                    || TenantContext.AuthenticatedTenant(identity!) != tenant.Id
                    || await staff.Find(id, context.HttpContext.RequestAborted, tenant.Id) is not { Active: true } user
                    || !identity!.IsInRole(user.Role))
                    context.RejectPrincipal();
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = 403;
                return Task.CompletedTask;
            };
            options.ExpireTimeSpan = TimeSpan.FromHours(8);
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = 401;
                return Task.CompletedTask;
            };
        });
        builder.Services.AddAuthorization();
        builder.Services.AddCors(options => options.AddPolicy("PublicCatalog", policy =>
            policy.AllowAnyOrigin().WithMethods(HttpMethods.Get)));
        if (Directory.Exists("/keys")) builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo("/keys"));
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "local",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 8, Window = TimeSpan.FromMinutes(2) }));
        });
        return password;
    }

    public static async Task ConfigurePipeline(WebApplication app, string password)
    {
        await Schema.Apply(app.Services.GetRequiredService<NpgsqlDataSource>(), app.Lifetime.ApplicationStopping);
        await app.Services.GetRequiredService<StaffStore>().Initialize(password, app.Lifetime.ApplicationStopping);
        app.UseExceptionHandler(handler => handler.Run(async context =>
            await Results.Problem("Não foi possível concluir a operação.").ExecuteAsync(context)));
        app.Use(async (context, next) =>
        {
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "same-origin";
            if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/media"))
                context.Response.Headers["Cache-Control"] = "no-store";
            if ((context.Request.Path.StartsWithSegments("/api/admin")
                || context.Request.Path.StartsWithSegments("/api/platform"))
                && !HttpMethods.IsGet(context.Request.Method)
                && context.Request.Headers["X-Imoveis-Action"] != "1")
            {
                context.Response.StatusCode = 403;
                return;
            }
            await next();
        });
        app.Use(TenantResolver.Resolve);
        app.UseStaticFiles(StaticAssets());
        app.UseRouting();
        app.UseCors();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
    }
    public static StaticFileOptions StaticAssets() => new()
    {
        OnPrepareResponse = context => context.Context.Response.Headers["Cache-Control"] = "no-cache"
    };
}
