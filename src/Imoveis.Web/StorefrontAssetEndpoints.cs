static class StorefrontAssetEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapMethods("/api/vitrine/recursos/{type}/{name}", [HttpMethods.Get, HttpMethods.Head],
            (string type, string name, IWebHostEnvironment environment) =>
            {
                var contentType = type switch
                {
                    "js" => "text/javascript; charset=utf-8",
                    "css" => "text/css; charset=utf-8",
                    _ => null
                };
                if (contentType is null || name.Length is < 1 or > 64
                    || !name.All(character => char.IsAsciiLetterOrDigit(character) || character == '-'))
                    return Results.NotFound();

                var asset = environment.WebRootFileProvider.GetFileInfo($"{name}.{type}");
                if (!asset.Exists || asset.IsDirectory)
                    return Results.NotFound();

                return Results.File(asset.CreateReadStream(), contentType, lastModified: asset.LastModified);
            });
    }
}
