static class BannerEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        var banner = admin.MapGroup("/vitrine/banner").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        banner.MapPut("", async (HttpRequest request, BannerStore store, CancellationToken ct) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest("Selecione uma imagem.");
            IFormCollection form;
            try { form = await request.ReadFormAsync(ct); }
            catch (InvalidDataException) { return Results.StatusCode(413); }
            if (form.Files.Count != 1 || form.Files.GetFile("photo") is not { } photo)
                return Results.BadRequest("Envie uma imagem por vez.");
            return Results.StatusCode(await store.Save(photo, ct));
        });
        banner.MapDelete("", (BannerStore store) =>
        {
            if (store.Exists) store.Remove();
            return Results.NoContent();
        });
    }
}
