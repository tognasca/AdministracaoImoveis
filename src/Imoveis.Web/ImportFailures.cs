using Npgsql;

static class ImportFailures
{
    public static RouteHandlerBuilder TrackImportFailure(this RouteHandlerBuilder route, string operation) =>
        route.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            try
            {
                var result = await next(context);
                if (result is IStatusCodeHttpResult { StatusCode: >= 400 and <= 599 } error)
                    await Write(http, operation, error.StatusCode.Value);
                return result;
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                await Write(http, operation, 500);
                throw;
            }
        });

    public static async Task<IResult> List(NpgsqlDataSource db, TenantContext tenant, CancellationToken ct)
    {
        await using var query = db.CreateCommand("""
            SELECT operation,http_status,created_at
            FROM import_failures WHERE tenant_id=@tenant ORDER BY id DESC LIMIT 30
            """);
        query.Parameters.AddWithValue("tenant", tenant.Id);
        await using var reader = await query.ExecuteReaderAsync(ct);
        var rows = new List<ImportFailure>();
        while (await reader.ReadAsync(ct))
            rows.Add(new(reader.GetString(0), reader.GetInt32(1), reader.GetDateTime(2)));
        return Results.Ok(rows);
    }

    private static async Task Write(HttpContext http, string operation, int status)
    {
        var services = http.RequestServices;
        try
        {
            var db = services.GetRequiredService<NpgsqlDataSource>();
            var tenant = services.GetRequiredService<TenantContext>();
            await using var query = db.CreateCommand("""
                INSERT INTO import_failures (tenant_id,operation,http_status)
                VALUES (@tenant,@operation,@status)
                """);
            query.CommandTimeout = 3;
            query.Parameters.AddWithValue("tenant", tenant.Id);
            query.Parameters.AddWithValue("operation", operation);
            query.Parameters.AddWithValue("status", status);
            await query.ExecuteNonQueryAsync(http.RequestAborted);
        }
        catch (OperationCanceledException) when (http.RequestAborted.IsCancellationRequested) { }
        catch (NpgsqlException error)
        {
            services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(ImportFailures))
                .LogWarning(error, "Não foi possível registrar a falha da operação {Operation}.", operation);
        }
    }

    private sealed record ImportFailure(string Operation, int Status, DateTime CreatedAt);
}
