var builder = WebApplication.CreateBuilder(args);
var password = WebStartup.ConfigureServices(builder);

var app = builder.Build();
await WebStartup.ConfigurePipeline(app, password);

var admin = app.MapGroup("/api/admin").RequireAuthorization();
PublicEndpoints.Map(app);
CatalogApi.Map(app, admin);
StorefrontAssetEndpoints.Map(app);
SessionEndpoints.Map(app, admin);
StaffEndpoints.Map(admin);
PropertyEndpoints.Map(admin);
MediaEndpoints.Map(admin);
StorefrontEndpoints.Map(admin);
SaasThemeEndpoints.Map(admin);
ModelHeroes.Map(admin);
StaticStorefrontPackage.Map(admin);
SaasAdministrationEndpoints.Map(app);
LeadEndpoints.Map(admin);
OlxEndpoints.Map(app, admin);
DashboardEndpoints.Map(admin);
MenuEndpoints.Map(admin);
ImportEndpoints.Map(admin, PropertyValidation.Validate);
ExportEndpoints.Map(admin);
PdfImportEndpoints.Map(admin);
PdfImageImportEndpoints.Map(admin);
app.MapFallbackToFile("/", "index.html", WebStartup.StaticAssets());
app.MapFallbackToFile("/admin", "index.html", WebStartup.StaticAssets());
app.MapFallbackToFile("/admin/importacoes", "index.html", WebStartup.StaticAssets());

app.Run();
