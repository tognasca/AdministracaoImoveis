var builder = WebApplication.CreateBuilder(args);
var password = WebStartup.ConfigureServices(builder);

var app = builder.Build();
await WebStartup.ConfigurePipeline(app, password);

var admin = app.MapGroup("/api/admin").RequireAuthorization();
PublicEndpoints.Map(app);
SessionEndpoints.Map(app, admin);
StaffEndpoints.Map(admin);
PropertyEndpoints.Map(admin);
MediaEndpoints.Map(admin);
ImportEndpoints.Map(admin, PropertyValidation.Validate);
app.MapFallbackToFile("/admin/importacoes", "index.html", WebStartup.StaticAssets());

app.Run();
