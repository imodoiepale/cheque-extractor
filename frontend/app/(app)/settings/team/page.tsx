'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, Mail, Trash2, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import {
  Badge,
  Button,
  Field,
  GlassCard,
  GlassCardTitle,
  GlassPanel,
  IconButton,
  Input,
  Select,
  Skeleton,
  StatusPill,
} from '@/components/ui';

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member' | 'viewer';
  status: 'active' | 'pending';
  invited_at: string;
  last_active?: string;
}

type Role = TeamMember['role'];

/** Roles are a closed set, so the badge tone is a map, not a switch. */
const ROLE_TONE: Record<Role, 'brand' | 'neutral' | 'outline'> = {
  admin: 'brand',
  member: 'neutral',
  viewer: 'outline',
};

export default function TeamPage() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/team/members');
      if (response.ok) {
        const data = await response.json();
        setTeamMembers(data.members || []);
      }
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setInviting(true);
    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (response.ok) {
        setInviteEmail('');
        setInviteRole('member');
        fetchTeamMembers();
        toast.success('Invitation sent');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to send invitation');
      }
    } catch (error) {
      console.error('Failed to invite member:', error);
      toast.error('Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  /** The confirm step is a Sheet, not window.confirm. */
  const handleRemoveMember = async (memberId: string) => {
    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchTeamMembers();
        toast.success('Team member removed');
      } else {
        toast.error('Failed to remove member');
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
      toast.error('Failed to remove member');
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: Role) => {
    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        fetchTeamMembers();
        toast.success('Role updated');
      } else {
        toast.error('Failed to update role');
      }
    } catch (error) {
      console.error('Failed to update role:', error);
      toast.error('Failed to update role');
    }
  };

  const pending = teamMembers.filter((m) => m.status === 'pending');

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-5" data-tone="brand">
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-body transition-colors duration-quick ease-settle hover:text-ink-strong"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Settings
        </Link>
        <h1 className="mt-3 font-heading text-2xl font-semibold text-ink-strong">
          Team Management
        </h1>
        <p className="mt-0.5 text-sm text-ink-faint">Invite team members and manage access</p>
      </div>

      {/* ── Invite ──────────────────────────────────── */}
      <GlassCard padding="lg" className="space-y-4">
        <GlassCardTitle>Invite Team Member</GlassCardTitle>

        <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Email" htmlFor="inviteEmail" required className="flex-1">
            <Input
              id="inviteEmail"
              type="email"
              autoComplete="off"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@theirfirm.com"
              required
            />
          </Field>
          <Field label="Role" htmlFor="inviteRole" className="sm:w-40">
            <Select
              id="inviteRole"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
            >
              <option value="viewer">Viewer</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Button
            type="submit"
            loading={inviting}
            icon={<UserPlus size={16} />}
            className="sm:mb-[1.625rem]"
          >
            {inviting ? 'Inviting…' : 'Invite'}
          </Button>
        </form>

        <GlassPanel tone="sunken" radius="input" padding="sm">
          <p className="mb-1.5 text-xs font-semibold text-ink-strong">Role permissions</p>
          <ul className="space-y-1 text-xs text-ink-body">
            <li>
              <strong className="text-ink-strong">Admin:</strong> full access including team
              management and settings
            </li>
            <li>
              <strong className="text-ink-strong">Member:</strong> can upload, review and export
              cheques
            </li>
            <li>
              <strong className="text-ink-strong">Viewer:</strong> can only view cheques and
              analytics (read-only)
            </li>
          </ul>
        </GlassPanel>
      </GlassCard>

      {/* ── Members ─────────────────────────────────── */}
      <GlassCard padding="none" className="overflow-hidden">
        <div className="border-b border-glass-hairline px-5 py-3.5">
          <GlassCardTitle className="text-base">
            Team Members <span className="nums text-ink-faint">({teamMembers.length})</span>
          </GlassCardTitle>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : teamMembers.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-faint">
            No team members yet. Invite someone to get started.
          </p>
        ) : (
          <div>
            {teamMembers.map((member) => (
              <div
                key={member.id}
                className="glass-divider flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors duration-quick ease-settle hover:bg-brand/[0.045]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-sm font-semibold text-white"
                    aria-hidden
                  >
                    {(member.name || member.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink-strong">
                        {member.name || member.email}
                      </p>
                      {member.status === 'active' ? (
                        <Badge tone="success" size="sm">
                          <CheckCircle size={11} aria-hidden /> Active
                        </Badge>
                      ) : (
                        <StatusPill
                          status="pending"
                          size="sm"
                          icon={<Mail size={11} aria-hidden />}
                        />
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-body">{member.email}</p>
                    {member.last_active && (
                      <p className="nums mt-0.5 text-xs text-ink-faint">
                        Last active: {new Date(member.last_active).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`role-${member.id}`}>
                    Role for {member.email}
                  </label>
                  <Select
                    id={`role-${member.id}`}
                    inputSize="sm"
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.id, e.target.value as Role)}
                    className="w-32 rounded-pill pr-7 text-center"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </Select>

                  <IconButton
                    aria-label={`Remove ${member.email}`}
                    size="icon-sm"
                    title="Remove member"
                    onClick={() => setRemoving(member)}
                    className="text-ink-faint hover:text-error-text"
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* ── Pending invitations ─────────────────────── */}
      {pending.length > 0 && (
        <GlassCard padding="none" className="overflow-hidden">
          <div className="border-b border-glass-hairline px-5 py-3.5">
            <GlassCardTitle className="text-base">
              Pending Invitations <span className="nums text-ink-faint">({pending.length})</span>
            </GlassCardTitle>
          </div>
          <div>
            {pending.map((member) => (
              <div
                key={member.id}
                className="glass-divider flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-bg"
                    aria-hidden
                  >
                    <Mail className="h-4 w-4 text-warning-text" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-strong">{member.email}</p>
                    <p className="nums text-xs text-ink-body">
                      Invited {new Date(member.invited_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <Badge tone={ROLE_TONE[member.role]} size="sm" className="capitalize">
                    {member.role}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(member)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <DeleteConfirmModal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) handleRemoveMember(removing.id);
          setRemoving(null);
        }}
        title="Remove team member?"
        message={
          removing
            ? `${removing.email} will lose access to this firm immediately. Any pending invitation is cancelled.`
            : ''
        }
        confirmText="Remove"
      />
    </div>
  );
}
