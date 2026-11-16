using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.DataProtection;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var password = builder.Configuration["Admin:Password"];
if (string.IsNullOrWhiteSpace(password) || password.Length is < 16 or > 256)
    throw new InvalidOperationException("Configure Admin__Password com 16 a 256 caracteres.");
var connectionString = builder.Configuration.GetConnectionString("Imoveis")
    ?? throw new InvalidOperationException("Configure ConnectionStrings__Imoveis.");

builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
builder.Services.AddSingleton<PropertyStore>();
builder.Services.AddSingleton<StaffStore>();
builder.Services.AddSingleton<MediaStore>();
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
        var staff = context.HttpContext.RequestServices.GetRequiredService<StaffStore>();
        if (!Guid.TryParse(identity?.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            || await staff.Find(id, context.HttpContext.RequestAborted) is not { Active: true } user
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
if (Directory.Exists("/keys")) builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo("/keys"));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "local",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 8, Window = TimeSpan.FromMinutes(2) }));
});

var app = builder.Build();
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
    if (context.Request.Path.StartsWithSegments("/api/admin")
        && !HttpMethods.IsGet(context.Request.Method)
        && context.Request.Headers["X-Imoveis-Action"] != "1")
    {
        context.Response.StatusCode = 403;
        return;
    }
    await next();
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", async (NpgsqlDataSource db, CancellationToken ct) =>
{
    await using var query = db.CreateCommand("SELECT 1 FROM properties LIMIT 1");
    await query.ExecuteScalarAsync(ct);
    return Results.Ok(new { status = "ok" });
});
app.MapGet("/api/vitrine/configuracao", (IConfiguration settings) =>
{
    var number = settings["Vitrine:WhatsApp"] ?? "";
    return Results.Ok(new { whatsapp = number.Length is >= 10 and <= 15 && number.All(char.IsAsciiDigit)
        ? number : "" });
});
app.MapGet("/api/imoveis", (PropertyStore db, string? q, int? page, string? kind, decimal? maxPrice, int? bedrooms, CancellationToken ct) =>
    db.Get(false, null, Search(q), Page(page), ct, Search(kind), Math.Max(0, maxPrice ?? 0), Math.Max(0, bedrooms ?? 0)));
app.MapGet("/api/imoveis/{id:guid}", async (Guid id, PropertyStore db, CancellationToken ct) =>
{
    var result = await db.Get(false, id, "", 1, ct);
    return result.Count == 0 ? Results.NotFound() : Results.Ok(result[0]);
});
app.MapGet("/media/{property:guid}/{photo:guid}", (Guid property, Guid photo, HttpContext ctx, MediaStore media, CancellationToken ct) =>
    media.Read(property, photo, ctx.User.Identity?.IsAuthenticated == true, ct));

app.MapPost("/api/admin/login", async (Login input, HttpContext ctx, StaffStore staff, CancellationToken ct) =>
{
    var user = await staff.Verify(input.Username, input.Password, ct);
    if (user is null) return Results.Unauthorized();
    var identity = new ClaimsIdentity([
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Username),
        new Claim(ClaimTypes.Role, user.Role)
        ], CookieAuthenticationDefaults.AuthenticationScheme);
    await ctx.SignInAsync(new ClaimsPrincipal(identity));
    return Results.NoContent();
}).RequireRateLimiting("login");

var admin = app.MapGroup("/api/admin").RequireAuthorization();
admin.MapGet("/session", (ClaimsPrincipal user) =>
    Results.Ok(new { username = user.Identity?.Name, administrator = user.IsInRole("Administrador") }));
var users = admin.MapGroup("/usuarios").RequireAuthorization(policy => policy.RequireRole("Administrador"));
users.MapGet("/", (StaffStore staff, CancellationToken ct) => staff.List(ct));
users.MapPost("/", async (StaffCreate input, StaffStore staff, CancellationToken ct) =>
{
    if (!Required(input.Username, 80) || input.Password is not { Length: >= 16 and <= 256 }
        || input.Role is not ("Administrador" or "Operador")) return Results.BadRequest("Confira usuário, perfil e senha.");
    return await staff.Create(input, ct) ? Results.NoContent() : Results.Conflict("Este nome de usuário já existe.");
});
users.MapPut("/{id:guid}", async (Guid id, StaffState input, ClaimsPrincipal user, StaffStore staff, CancellationToken ct) =>
{
    if (user.FindFirstValue(ClaimTypes.NameIdentifier) == id.ToString()) return Results.BadRequest("Seu usuário está em uso.");
    return await staff.ChangeState(id, input.Active, ct) ? Results.NoContent() : Results.NotFound();
});
admin.MapPost("/logout", async (HttpContext ctx) =>
{
    await ctx.SignOutAsync();
    return Results.NoContent();
});
admin.MapGet("/imoveis", (PropertyStore db, string? q, int? page, CancellationToken ct) =>
    db.Get(true, null, Search(q), Page(page), ct));
admin.MapGet("/imoveis/{id:guid}", async (Guid id, PropertyStore db, CancellationToken ct) =>
{
    var result = await db.Get(true, id, "", 1, ct);
    return result.Count == 0 ? Results.NotFound() : Results.Ok(result[0]);
});
admin.MapPost("/imoveis", (PropertyInput input, PropertyStore store, CancellationToken ct) =>
    Save(Guid.NewGuid(), input, true, store, ct));
admin.MapPut("/imoveis/{id:guid}", (Guid id, PropertyInput input, PropertyStore store, CancellationToken ct) =>
    Save(id, input, false, store, ct));
admin.MapPost("/imoveis/{id:guid}/fotos", async (Guid id, HttpRequest request, MediaStore media, CancellationToken ct) =>
{
    if (!request.HasFormContentType) return Results.BadRequest("Envie um arquivo de imagem.");
    IFormCollection form;
    try { form = await request.ReadFormAsync(ct); }
    catch (InvalidDataException) { return Results.StatusCode(413); }
    if (form.Files.Count != 1 || form.Files.GetFile("photo") is not { } file)
        return Results.BadRequest("Envie uma imagem por requisição.");
    var result = await media.Add(id, file, ct);
    return result == 409 ? Results.Conflict("Limite de cinco fotos por imóvel.") : Results.StatusCode(result);
});
admin.MapDelete("/imoveis/{id:guid}/fotos/{photo:guid}", async (Guid id, Guid photo, MediaStore media, CancellationToken ct) =>
    await media.Remove(id, photo, ct) ? Results.NoContent() : Results.NotFound());
admin.MapPut("/imoveis/{id:guid}/fotos/{photo:guid}/capa", async (Guid id, Guid photo, MediaStore media, CancellationToken ct) =>
    await media.SetCover(id, photo, ct) ? Results.NoContent() : Results.NotFound());
ImportEndpoints.Map(admin, Validate);
app.Run();

static string Search(string? q) => (q ?? "").Trim()[..Math.Min((q ?? "").Trim().Length, 120)];
static int Page(int? page) => Math.Clamp(page ?? 1, 1, 10000);
static bool Required(string? text, int limit) => !string.IsNullOrWhiteSpace(text) && text.Length <= limit;
static async Task<IResult> Save(Guid id, PropertyInput input, bool create, PropertyStore store, CancellationToken ct)
{
    if (Validate(input) is { } error) return Results.BadRequest(error);
    try
    {
        if (!await store.Save(id, input, create, ct))
            return Results.Conflict("O imóvel foi atualizado em outra tela. Reabra o cadastro.");
        return create ? Results.Created($"/api/admin/imoveis/{id}", new { id }) : Results.NoContent();
    }
    catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation)
    {
        return Results.Conflict("Já existe um imóvel com esse código nesta origem.");
    }
}

static string? Validate(PropertyInput input)
{
    if (!Required(input.Code, 80) || !Required(input.Source, 100) || !Required(input.Title, 160)
        || input.Kind is null || input.Kind.Length > 80 || input.District is null || input.District.Length > 100
        || input.City is null || input.City.Length > 100 || input.Price is < 0 or >= 10000000000000m
        || input.Bedrooms is < 0 or > 1000 || input.Size is < 0 or >= 10000000000m
        || input.Status is not ("Rascunho" or "Publicado" or "Vendido" or "Retirado"))
        return "Confira os campos do imóvel.";
    if (!string.IsNullOrWhiteSpace(input.Album) && (input.Album.Length > 2048
        || !Uri.TryCreate(input.Album.Trim(), UriKind.Absolute, out var link) || link.Scheme is not ("https" or "http")))
        return "Informe um endereço HTTP ou HTTPS para o álbum.";
    if (input.Status == "Publicado" && (!Required(input.City, 100) || !Required(input.Kind, 80) || input.Price <= 0))
        return "Preencha cidade, tipo e preço para publicar.";
    return null;
}

record Login(string? Username, string? Password);
