static class StorefrontEndpoints
{
    private sealed record BrandInput(string? Name);

    public static void Map(RouteGroupBuilder admin)
    {
        var storefront = admin.MapGroup("/vitrine").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        storefront.MapPut("/identidade", async (BrandInput input, StorefrontBrand brand, CancellationToken ct) =>
        {
            var name = input.Name?.Trim();
            if (name is null || name.Length is < 1 or > 80 || name.Any(char.IsControl))
                return Results.BadRequest("Informe um nome de site com 1 a 80 caracteres.");
            await brand.Save(name, ct);
            return Results.NoContent();
        });
        MapImage(storefront, "/banner", StorefrontImage.Banner);
        MapImage(storefront, "/logo", StorefrontImage.Logo);
    }

    private static void MapImage(RouteGroupBuilder storefront, string route, StorefrontImage asset)
    {
        storefront.MapPut(route, async (HttpRequest request, StorefrontImages images, CancellationToken ct) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest("Selecione uma imagem.");
            IFormCollection form;
            try { form = await request.ReadFormAsync(ct); }
            catch (InvalidDataException) { return Results.StatusCode(413); }
            if (form.Files.Count != 1 || form.Files.GetFile("photo") is not { } photo)
                return Results.BadRequest("Envie uma imagem por vez.");
            return Results.StatusCode(await images.Save(asset, photo, ct));
        });
        storefront.MapDelete(route, (StorefrontImages images) =>
        {
            images.Remove(asset);
            return Results.NoContent();
        });
    }
}
