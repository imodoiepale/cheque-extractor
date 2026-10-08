import { createServiceClient } from '@/lib/supabase/api';
import { toDbRole, type DbRole } from '@/lib/roles';

/**
 * Shared bits for the /api/team/* routes and the invitation accept flow.
 */

/** The row shape app/(app)/settings/team/page.tsx already renders. */
export interface TeamMemberDTO {
  id: string;
  email: string;
  name: string;
  role: DbRole;
  status: 'active' | 'pending';
  invited_at: string;
  last_active?: string;
}

/**
 * Pending invitations and real members share one list in the UI and one
 * `/api/team/members/[id]` route, so an invitation's id is prefixed. The DELETE
 * and PATCH handlers split on this.
 */
export const INVITE_ID_PREFIX = 'invite_';

export function encodeInviteId(invitationId: string) {
  return `${INVITE_ID_PREFIX}${invitationId}`;
}

export function decodeMemberId(id: string):
  | { kind: 'invitation'; id: string }
  | { kind: 'profile'; id: string } {
  return id.startsWith(INVITE_ID_PREFIX)
    ? { kind: 'invitation', id: id.slice(INVITE_ID_PREFIX.length) }
    : { kind: 'profile', id };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID_RE.test(v);

export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  // Deliberately loose: the point is to reject obvious junk, not to re-derive RFC 5322.
  if (email.length < 5 || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function profileRowToMember(row: any): TeamMemberDTO {
  return {
    id: row.id,
    email: row.email || '',
    name: row.full_name || '',
    role: toDbRole(row.role),
    status: 'active',
    invited_at: row.created_at || new Date().toISOString(),
    ...(row.last_sign_in_at ? { last_active: row.last_sign_in_at } : {}),
  };
}

export function invitationRowToMember(row: any): TeamMemberDTO {
  return {
    id: encodeInviteId(row.id),
    email: row.email || '',
    name: '',
    role: toDbRole(row.role),
    status: 'pending',
    invited_at: row.created_at || new Date().toISOString(),
  };
}

export function inviteUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://kyriq.com')
    .replace(/\/$/, '')
    .trim();
  return `${base}/invite/${token}`;
}

/**
 * Write to the existing audit_logs table.
 *
 * COLUMN NAMES CHECKED AGAINST THE LIVE DATABASE, not against 001_schema.sql.
 * 001 declares (field, old_value, new_value, job_id); the live table actually
 * has (entity_type, entity_id, old_values JSONB, new_values JSONB, metadata).
 * Writing 001's names would have failed every time. Migration 030 adds the
 * live columns to any database built from 001, so this one writer works on both.
 *
 * Best-effort: a failed audit write must not fail the action the user asked
 * for, but it is logged loudly, because role and billing changes are meant to
 * be traceable.
 */
export async function auditLog(entry: {
  tenantId: string;
  userId: string | null;
  action: string;
  /** What the action was performed on, e.g. 'user_profile', 'team_invitation'. */
  entityType?: string | null;
  entityId?: string | null;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  metadata?: Record<string, any>;
}) {
  try {
    const service = createServiceClient();
    const { error } = await service.from('audit_logs').insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      old_values: entry.oldValues ?? null,
      new_values: entry.newValues ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) console.error('[audit_logs] insert failed:', error.message);
  } catch (err: any) {
    console.error('[audit_logs] insert threw:', err?.message);
  }
}
