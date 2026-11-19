using Microsoft.AspNetCore.Identity;
using Npgsql;

record StaffUser(Guid Id, string Username, string Role, bool Active);
record StaffCreate(string Username, string Password, string Role);
record StaffState(bool Active);

sealed class StaffStore(NpgsqlDataSource db)
{
    private readonly PasswordHasher<StaffUser> hasher = new();

    public async Task Initialize(string password, CancellationToken ct)
    {
        await using var query = db.CreateCommand("""
            INSERT INTO staff_users (id,username,password_hash,role)
            VALUES(@id,'admin',@hash,'Administrador') ON CONFLICT (lower(username)) DO NOTHING
            """);
        var user = new StaffUser(Guid.NewGuid(), "admin", "Administrador", true);
        query.Parameters.AddWithValue("id", user.Id);
        query.Parameters.AddWithValue("hash", hasher.HashPassword(user, password));
        await query.ExecuteNonQueryAsync(ct);
    }

    public async Task<StaffUser?> Verify(string? username, string? password, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Length > 80 || password is null || password.Length > 256) return null;
        await using var query = db.CreateCommand("""
            SELECT id,username,role,active,password_hash FROM staff_users WHERE lower(username)=lower(@username)
            """);
        query.Parameters.AddWithValue("username", username.Trim());
        await using var reader = await query.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        var user = Read(reader);
        return user.Active && hasher.VerifyHashedPassword(user, reader.GetString(4), password) != PasswordVerificationResult.Failed
            ? user : null;
    }

    public async Task<StaffUser?> Find(Guid id, CancellationToken ct, Guid? tenantId = null)
    {
        await using var query = db.CreateCommand("SELECT id,username,role,active FROM staff_users WHERE id=@id AND tenant_id=@tenant");
        query.Parameters.AddWithValue("id", id);
        query.Parameters.AddWithValue("tenant", tenantId ?? TenantContext.LegacyId);
        await using var reader = await query.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? Read(reader) : null;
    }

    public async Task<List<StaffUser>> List(CancellationToken ct, Guid? tenantId = null)
    {
        await using var query = db.CreateCommand("SELECT id,username,role,active FROM staff_users WHERE tenant_id=@tenant ORDER BY lower(username)");
        query.Parameters.AddWithValue("tenant", tenantId ?? TenantContext.LegacyId);
        await using var reader = await query.ExecuteReaderAsync(ct);
        var users = new List<StaffUser>();
        while (await reader.ReadAsync(ct)) users.Add(Read(reader));
        return users;
    }

    public async Task<bool> Create(StaffCreate input, CancellationToken ct, Guid? tenantId = null)
    {
        var user = new StaffUser(Guid.NewGuid(), input.Username.Trim(), input.Role, true);
        await using var query = db.CreateCommand("""
            INSERT INTO staff_users (id,username,password_hash,role,tenant_id)
            VALUES(@id,@username,@hash,@role,@tenant) ON CONFLICT (lower(username)) DO NOTHING
            """);
        query.Parameters.AddWithValue("id", user.Id);
        query.Parameters.AddWithValue("username", user.Username);
        query.Parameters.AddWithValue("hash", hasher.HashPassword(user, input.Password));
        query.Parameters.AddWithValue("role", user.Role);
        query.Parameters.AddWithValue("tenant", tenantId ?? TenantContext.LegacyId);
        return await query.ExecuteNonQueryAsync(ct) == 1;
    }

    public async Task<bool> ChangeState(Guid id, bool active, CancellationToken ct, Guid? tenantId = null)
    {
        await using var query = db.CreateCommand("UPDATE staff_users SET active=@active WHERE id=@id AND tenant_id=@tenant AND username<>'admin'");
        query.Parameters.AddWithValue("id", id);
        query.Parameters.AddWithValue("active", active);
        query.Parameters.AddWithValue("tenant", tenantId ?? TenantContext.LegacyId);
        return await query.ExecuteNonQueryAsync(ct) == 1;
    }

    private static StaffUser Read(NpgsqlDataReader reader) =>
        new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetBoolean(3));
}
