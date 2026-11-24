static class MediaEndpoints
{
    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapPost("/imoveis/{id:guid}/fotos", async (Guid id, HttpRequest request, MediaStore media, TenantContext tenant, CancellationToken ct) =>
        {
            if (!request.HasFormContentType) return Results.BadRequest("Envie um arquivo de imagem.");
            IFormCollection form;
            try { form = await request.ReadFormAsync(ct); }
            catch (InvalidDataException) { return Results.StatusCode(413); }
            if (form.Files.Count != 1 || form.Files.GetFile("photo") is not { } file)
                return Results.BadRequest("Envie uma imagem por requisição.");
            var result = await media.Add(id, file, ct, tenant.Id);
            return result == 409 ? Results.Conflict("Limite de cinco fotos por imóvel.") : Results.StatusCode(result);
        });
        admin.MapPut("/imoveis/{id:guid}/fotos/ordem", async (Guid id, Guid[] order, MediaStore media, TenantContext tenant, CancellationToken ct) =>
        {
            if (order.Length is < 1 or > 5 || order.Distinct().Count() != order.Length)
                return Results.BadRequest("Informe a ordem de todas as fotos da galeria.");
            var result = await media.Reorder(id, order, ct, tenant.Id);
            return result == 409 ? Results.Conflict("A galeria mudou. Atualize a ordem e tente novamente.") : Results.StatusCode(result);
        });
        admin.MapDelete("/imoveis/{id:guid}/fotos/{photo:guid}", async (Guid id, Guid photo, MediaStore media, TenantContext tenant, CancellationToken ct) =>
            await media.Remove(id, photo, ct, tenant.Id) ? Results.NoContent() : Results.NotFound());
        admin.MapPut("/imoveis/{id:guid}/fotos/{photo:guid}/capa", async (Guid id, Guid photo, MediaStore media, TenantContext tenant, CancellationToken ct) =>
            await media.SetCover(id, photo, ct, tenant.Id) ? Results.NoContent() : Results.NotFound());
    }
}
