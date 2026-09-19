/**
 * Shop owners who have Super Admin permissions.
 * Configurable via SUPER_ADMIN_EMAILS environment variable in production.
 */
function resolveSuperAdminEmails(): string[] {
  const envEmails = String(process.env.SUPER_ADMIN_EMAILS || process.env.SUPER_ADMIN_EMAIL || '')
    .split(/[,;]+/)
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);

  if (envEmails.length > 0) {
    return [...new Set(envEmails)];
  }

  // Fallback if environment variable is not explicitly populated
  return ['jeevadj1111@gmail.com', 'yogesh234456@gmail.com'];
}

export const OWNER_SUPER_ADMIN_EMAILS = resolveSuperAdminEmails();

export function configuredSuperAdminEmails(): string[] {
  return resolveSuperAdminEmails();
}

export function isConfiguredSuperAdminEmail(email: string): boolean {
  const e = String(email || '').toLowerCase().trim();
  if (!e) return false;
  return configuredSuperAdminEmails().includes(e);
}

export async function promoteConfiguredSuperAdmins(client: any): Promise<void> {
  const emails = configuredSuperAdminEmails();
  if (!emails.length) return;
  const run =
    typeof client === 'function'
      ? (sql: string, params?: any[]) => client(sql, params)
      : (sql: string, params?: any[]) => client.query(sql, params);
  await run(
    `UPDATE users SET role = 'super_admin', updated_at = NOW()
     WHERE LOWER(email) = ANY($1::text[])
       AND COALESCE(role, 'customer') != 'super_admin'`,
    [emails]
  );
}
