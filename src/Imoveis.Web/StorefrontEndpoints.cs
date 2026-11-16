static class StorefrontEndpoints
{
    private sealed record BrandInput(string? Name, string? Color, string? Email, string? WhatsApp, string? TextColor);

    public static void Map(RouteGroupBuilder admin)
    {
        var storefront = admin.MapGroup("/vitrine").RequireAuthorization(policy => policy.RequireRole("Administrador"));
        storefront.MapPut("/identidade", async (BrandInput input, StorefrontBrand brand, CancellationToken ct) =>
        {
            var name = input.Name?.Trim();
            if (name is null || name.Length is < 1 or > 80 || name.Any(char.IsControl))
                return Results.BadRequest("Informe um nome de site com 1 a 80 caracteres.");
            var color = input.Color?.Trim();
            if (color is not null && (color.Length != 7 || color[0] != '#' || !color.Skip(1).All(char.IsAsciiHexDigit)))
                return Results.BadRequest("Informe uma cor hexadecimal, como #6B5140.");
            var email = input.Email?.Trim();
            if (!string.IsNullOrEmpty(email) && (email.Length > 254 || email.Any(char.IsControl)
                || !System.Net.Mail.MailAddress.TryCreate(email, out var address) || address.Address != email))
                return Results.BadRequest("Informe um e-mail válido para receber os contatos.");
            var whatsapp = input.WhatsApp?.Trim();
            if (!string.IsNullOrEmpty(whatsapp) && (whatsapp.Length is < 10 or > 15 || !whatsapp.All(char.IsAsciiDigit)))
                return Results.BadRequest("Informe o WhatsApp com código do país e DDD, usando de 10 a 15 dígitos.");
            if (input.TextColor is not (null or "auto" or "black" or "white"))
                return Results.BadRequest("Escolha texto automático, preto ou branco.");
            await brand.Save(name, color?.ToUpperInvariant(), email, whatsapp, input.TextColor, ct);
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
