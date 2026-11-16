sealed class BannerStore(IConfiguration configuration)
{
    private readonly string path = Path.Combine(
        Path.GetFullPath(configuration["Media:Path"] ?? "./midia"), "vitrine-hero");

    public bool Exists => File.Exists(path);

    public async Task<int> Save(IFormFile image, CancellationToken ct)
    {
        if (image.Length is <= 0 or > MediaStore.MaxBytes) return 413;
        await using var input = image.OpenReadStream();
        var header = new byte[12];
        if (await input.ReadAtLeastAsync(header, header.Length, false, ct) != header.Length
            || MediaStore.Detect(header) is null) return 415;
        input.Position = 0;

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
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

    public async Task<IResult> Read(CancellationToken ct)
    {
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

    public void Remove() => File.Delete(path);
}
