/**
 * roles.js — TFOS role hierarchy helper (frontend mirror).
 *
 * Per MBI Part 14, roles form an inclusive ladder. A user at level N has
 * all the permissions of roles at level < N. Guards use hasRole() instead
 * of strict equality so FOUNDER inherits ADMIN access (and ENTERPRISE_ADMIN
 * does too, etc.).
 *
 * Backend mirror: /opt/teivaka/11_application_code/app/utils/roles.py.
 * Both files MUST stay in sync — drift causes 403s on routes that the
 * client thinks should pass.
 *
 * Order is intentional: lowest privilege at index 0, highest at -1.
 * Adding a new tier inserts at the correct index; never reorder existing.
 */

export const ROLE_HIERARCHY = [
  "COMMUNITY",
  "BANK_VIEWER",
  "WORKER",
  "MANAGER",
  "PARTNER",
  "ADMIN",
  "ENTERPRISE_ADMIN",
  "FOUNDER",
];

export function roleLevel(role) {
  const idx = ROLE_HIERARCHY.indexOf(role);
  return idx === -1 ? -1 : idx;
}

export function hasRole(userRole, requiredRole) {
  return roleLevel(userRole) >= roleLevel(requiredRole);
}
