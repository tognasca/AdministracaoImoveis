using System.Diagnostics;

static class PdfImageImportEndpoints
{
    private const int MaxPdfBytes = 8_000_000;
    private const int MaxImages = 40;
    private const int MaxImageBytes = 2_000_000;
    private const int MaxTotalBytes = 12_000_000;

    public static void Map(RouteGroupBuilder admin) =>
        admin.MapPost("/importacoes/pdf/imagens", Extract).TrackImportFailure("Extração de imagens do PDF");

    private static async Task<IResult> Extract(HttpRequest request, CancellationToken ct)
    {
        if (!request.HasFormContentType || request.ContentLength > MaxPdfBytes + 65536)
            return Results.BadRequest("Envie um PDF de até 8 MB.");
        IFormCollection form;
        try { form = await request.ReadFormAsync(ct); }
        catch (InvalidDataException) { return Results.BadRequest("Arquivo muito grande."); }
        var file = form.Files.Count == 1 ? form.Files.GetFile("file") : null;
        if (file is null || file.Length is < 5 or > MaxPdfBytes ||
            !string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest("Selecione um PDF válido de até 8 MB.");

        var directory = Path.Combine(Path.GetTempPath(), "imoveis-pdf-images-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(20));
        try
        {
            var pdf = Path.Combine(directory, "source.pdf");
            await using (var input = file.OpenReadStream())
            await using (var output = new FileStream(pdf, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
            {
                var header = new byte[5];
                await input.ReadExactlyAsync(header, deadline.Token);
                if (!header.AsSpan().SequenceEqual("%PDF-"u8))
                    return Results.BadRequest("O arquivo não é um PDF.");
                await output.WriteAsync(header, deadline.Token);
                await input.CopyToAsync(output, deadline.Token);
            }

            using var process = new Process
            {
                StartInfo = new ProcessStartInfo("pdfimages")
                {
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    ArgumentList = { "-png", "-f", "1", "-l", "100", pdf, Path.Combine(directory, "photo") }
                }
            };
            if (!process.Start()) return Results.Problem("Extrator de imagens indisponível.");
            try
            {
                var outputTask = process.StandardOutput.BaseStream.CopyToAsync(Stream.Null, deadline.Token);
                var errorTask = process.StandardError.BaseStream.CopyToAsync(Stream.Null, deadline.Token);
                await process.WaitForExitAsync(deadline.Token);
                await Task.WhenAll(outputTask, errorTask);
                if (process.ExitCode != 0)
                    return Results.BadRequest("Não foi possível extrair imagens deste PDF.");
            }
            finally
            {
                if (!process.HasExited)
                {
                    try { process.Kill(entireProcessTree: true); }
                    catch (InvalidOperationException) { }
                }
            }

            var files = Directory.EnumerateFiles(directory, "photo-*.png").OrderBy(x => x, StringComparer.Ordinal).ToArray();
            if (files.Length > MaxImages)
                return Results.BadRequest("O PDF tem mais de 40 imagens. Divida o arquivo.");
            if (files.Sum(x => new FileInfo(x).Length) > MaxTotalBytes ||
                files.Any(x => new FileInfo(x).Length > MaxImageBytes))
                return Results.BadRequest("As imagens extraídas excedem o limite permitido.");
            var images = new List<object>();
            foreach (var path in files)
            {
                var bytes = await File.ReadAllBytesAsync(path, deadline.Token);
                if (bytes.Length < 12 || MediaStore.Detect(bytes.AsSpan(0, 12)) != "image/png")
                    continue;
                images.Add(new { filename = Path.GetFileName(path), contentType = "image/png",
                    base64 = Convert.ToBase64String(bytes) });
            }
            return Results.Ok(new { count = images.Count, images,
                warning = "Confira a associação de cada foto ao imóvel antes de salvar." });
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return Results.BadRequest("A extração excedeu o tempo limite.");
        }
        finally
        {
            try { Directory.Delete(directory, recursive: true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }
}
