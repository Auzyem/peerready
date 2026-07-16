// Single source of truth for the roles the system actually recognizes.
// Kept dependency-free so it's safe to import from server gates, route
// handlers, and (if ever needed) client code. The roles permission matrix
// and the admin-access gates both derive from this list, so they can't drift.
export const ROLES = ['super_admin', 'admin'] as const
export type Role = (typeof ROLES)[number]

/** Roles that grant access to the admin panel. */
export function isAdminRole(role: string): boolean {
  return (ROLES as readonly string[]).includes(role)
}

/** The role that bypasses plan-based feature gates (e.g. the API-key plan gate). */
export function isSuperAdminRole(role: string): boolean {
  return role === 'super_admin'
}
