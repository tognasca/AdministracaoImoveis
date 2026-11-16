enum StorefrontImage { Banner, Logo }

sealed class StorefrontImages(IConfiguration configuration)
{
    private readonly string directory = Path.GetFullPath(configuration["Media:Path"] ?? "./midia");

    private string ImagePath(StorefrontImage asset) =>
        Path.Combine(directory, asset == StorefrontImage.Banner ? "vitrine-hero" : "vitrine-logo");

    public bool Exists(StorefrontImage asset) => File.Exists(ImagePath(asset));

    public async Task<int> Save(StorefrontImage asset, IFormFile image, CancellationToken ct)
    {
        var path = ImagePath(asset);
        if (image.Length is <= 0 or > MediaStore.MaxBytes) return 413;
        await using var input = image.OpenReadStream();
        var header = new byte[12];
        if (await input.ReadAtLeastAsync(header, header.Length, false, ct) != header.Length
            || MediaStore.Detect(header) is null) return 415;
        input.Position = 0;

        Directory.CreateDirectory(directory);
        var temporary = path + "." + Guid.NewGuid().ToString("N");
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
                await input.CopyToAsync(output, ct);
            ct.ThrowIfCancellationRequested();
            File.Move(temporary, path, overwrite: true);
            return 204;
        }
        finally { File.Delete(temporary); }
    }

    public async Task<IResult> Read(StorefrontImage asset, CancellationToken ct)
    {
        var path = ImagePath(asset);
        FileStream input;
        try { input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete); }
        catch (FileNotFoundException) { return Results.NotFound(); }
        catch (DirectoryNotFoundException) { return Results.NotFound(); }

        try
        {
            var header = new byte[12];
            if (await input.ReadAtLeastAsync(header, header.Length, false, ct) == header.Length
                && MediaStore.Detect(header) is { } contentType)
            {
                input.Position = 0;
                return Results.File(input, contentType);
            }
        }
        catch { await input.DisposeAsync(); throw; }
        await input.DisposeAsync();
        return Results.NotFound();
    }

    public void Remove(StorefrontImage asset)
    {
        if (Directory.Exists(directory)) File.Delete(ImagePath(asset));
    }
}
