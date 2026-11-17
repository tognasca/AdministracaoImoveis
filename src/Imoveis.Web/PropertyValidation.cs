static class PropertyValidation
{
    internal static bool Required(string? text, int limit) => !string.IsNullOrWhiteSpace(text) && text.Length <= limit;

    public static string? Validate(PropertyInput input)
    {
        if (!Required(input.Code, 80) || !Required(input.Source, 100) || !Required(input.Title, 160)
            || input.Kind is null || input.Kind.Length > 80 || input.District is null || input.District.Length > 100
            || input.City is null || input.City.Length > 100 || input.Price is < 0 or >= 10000000000000m
            || input.Bedrooms is < 0 or > 1000 || input.Size is < 0 or >= 10000000000m
            || input.Status is not ("Rascunho" or "Publicado" or "Vendido" or "Retirado"))
            return "Confira os campos do imóvel.";
        if (input.Zone is not (null or "" or "Centro" or "Zona Norte" or "Zona Sul" or "Zona Leste" or "Zona Oeste"))
            return "Selecione uma zona válida.";
        if (input.Notes is { Length: > 2000 } || input.Notes?.Contains('\0') == true)
            return "Informe observações válidas com até 2.000 caracteres.";
        if (!string.IsNullOrWhiteSpace(input.Album) && (input.Album.Length > 2048
            || !Uri.TryCreate(input.Album.Trim(), UriKind.Absolute, out var link) || link.Scheme is not ("https" or "http")))
            return "Informe um endereço HTTP ou HTTPS para o álbum.";
        if (input.Status == "Publicado" && (!Required(input.City, 100) || !Required(input.Kind, 80) || input.Price <= 0))
            return "Preencha cidade, tipo e preço para publicar.";
        return null;
    }
}
