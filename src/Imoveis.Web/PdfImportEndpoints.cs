using System.Diagnostics;

static class PdfImportEndpoints
{
    private const int MaxFileBytes = 8_000_000;
    private const int MaxTextChars = 500_000;
    private const int MaxPages = 100;

    public static void Map(RouteGroupBuilder admin)
    {
        admin.MapPost("/importacoes/pdf/extrair", Extract);
    }

    private static async Task<IResult> Extract(HttpRequest request, CancellationToken cancellationToken)
    {
        if (!request.HasFormContentType)
            return Results.BadRequest("Selecione um arquivo PDF.");
        if (request.ContentLength > MaxFileBytes + 65536)
            return Results.BadRequest("Selecione um PDF de até 8 MB.");

        IFormCollection form;
        try { form = await request.ReadFormAsync(cancellationToken); }
        catch (InvalidDataException) { return Results.BadRequest("O PDF ultrapassou o limite de upload."); }
        var file = form.Files.Count == 1 ? form.Files.GetFile("file") : null;
        if (file is null || file.Length is < 5 or > MaxFileBytes
            || !string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
            return Results.BadRequest("Selecione um PDF de até 8 MB.");

        await using var input = file.OpenReadStream();
        var header = new byte[5];
        await input.ReadExactlyAsync(header, cancellationToken);
        if (!header.AsSpan().SequenceEqual("%PDF-"u8))
            return Results.BadRequest("O arquivo selecionado não é um PDF válido.");

        var path = Path.Combine(Path.GetTempPath(), "imoveis-pdf-" + Guid.NewGuid().ToString("N"));
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(15));
        try
        {
            await using (var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
            {
                await output.WriteAsync(header, deadline.Token);
                await input.CopyToAsync(output, deadline.Token);
            }

            using var process = new Process
            {
                StartInfo = new ProcessStartInfo("pdftotext")
                {
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    ArgumentList = { "-layout", "-enc", "UTF-8", "-l", (MaxPages + 1).ToString(), path, "-" }
                }
            };
            if (!process.Start())
                return Results.Problem("O extrator de PDF está indisponível.");

            try
            {
                var errors = process.StandardError.BaseStream.CopyToAsync(Stream.Null, deadline.Token);
                var text = new System.Text.StringBuilder();
                var buffer = new char[4096];
                int read;
                while ((read = await process.StandardOutput.ReadAsync(buffer.AsMemory(), deadline.Token)) > 0)
                {
                    if (text.Length + read > MaxTextChars)
                        return Results.BadRequest("O PDF contém muito texto. Divida o arquivo em partes menores.");
                    text.Append(buffer, 0, read);
                }
                await process.WaitForExitAsync(deadline.Token);
                await errors;
                if (process.ExitCode != 0)
                    return Results.BadRequest("Não foi possível ler o PDF. Confira se o arquivo está íntegro e sem senha.");
                var pages = text.ToString().Split('\f');
                if (pages[^1].Length == 0) pages = pages[..^1];
                if (pages.Length > MaxPages)
                    return Results.BadRequest("Divida o PDF em arquivos de até 100 páginas.");
                if (pages.All(string.IsNullOrWhiteSpace))
                    return Results.BadRequest("O PDF não contém texto selecionável. Arquivos digitalizados precisam passar por OCR.");
                return Results.Ok(new { pages });
            }
            finally
            {
                if (!process.HasExited)
                {
                    try { process.Kill(entireProcessTree: true); }
                    catch (InvalidOperationException) { }
                }
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Results.BadRequest("A extração demorou demais. Divida o PDF em partes menores.");
        }
        finally { File.Delete(path); }
    }
}
