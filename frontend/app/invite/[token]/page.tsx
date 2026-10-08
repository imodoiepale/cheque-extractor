'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { productRoleLabel } from '@/lib/roles';
import {
  Button,
  GlassCard,
  GlassCardBody,
  GlassCardTitle,
  GlassPanel,
  Badge,
  Skeleton,
} from '@/components/ui';

type State =
  | 'loading'
  | 'valid'
  | 'accepted'
  | 'expired'
  | 'not_found'
  | 'wrong_email'
  | 'already_member'
  | 'signin_required'
  | 'joined'
  | 'error';

interface Invitation {
  email: string;
  role: string;
  firm: string;
  expires_at?: string;
}

/**
 * /invite/[token] — the invitation accept page. Handles, in order:
 * not found, already accepted, expired, not signed in, signed in as the wrong
 * person, and already a member of another firm.
 */
export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = typeof params?.token === 'string' ? params.token : '';

  const [state, setState] = useState<State>('loading');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setState('not_found');
      return;
    }
    try {
      const [res, session] = await Promise.all([
        fetch(`/api/team/invitations/${encodeURIComponent(token)}`),
        createClient().auth.getUser(),
      ]);
      const data = await res.json().catch(() => ({}));
      const email = session.data.user?.email ?? null;
      setSignedInAs(email);

      if (!res.ok && res.status !== 404) {
        setState('error');
        setMessage(data?.message || 'Could not read this invitation.');
        return;
      }

      if (data?.state === 'valid') {
        setInvitation({ email: data.email, role: data.role, firm: data.firm, expires_at: data.expires_at });
        if (!email) {
          setState('signin_required');
        } else if (email.toLowerCase() !== String(data.email).toLowerCase()) {
          setState('wrong_email');
        } else {
          setState('valid');
        }
        return;
      }

      if (data?.state === 'accepted' || data?.state === 'expired') {
        setInvitation({ email: data.email, role: data.role, firm: data.firm, expires_at: data.expires_at });
        setState(data.state);
        return;
      }

      setState('not_found');
    } catch (err: any) {
      setState('error');
      setMessage(err?.message || 'Could not read this invitation.');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async () => {
    setBusy(true);
    setMessage('');
    try {
      const { data } = await createClient().auth.getSession();
      const res = await fetch(`/api/team/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(data.session?.access_token
            ? { Authorization: `Bearer ${data.session.access_token}` }
            : {}),
        },
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok && body?.ok === true) {
        setState('joined');
        setTimeout(() => router.push('/dashboard'), 1500);
        return;
      }

      setMessage(body?.message || 'Could not accept this invitation.');
      switch (body?.error) {
        case 'unauthenticated':
          setState('signin_required');
          break;
        case 'wrong_email':
          setState('wrong_email');
          break;
        case 'already_accepted':
          setState('accepted');
          break;
        case 'expired':
          setState('expired');
          break;
        case 'already_member':
          setState('already_member');
          break;
        case 'not_found':
          setState('not_found');
          break;
        default:
          setState('error');
      }
    } catch (err: any) {
      setState('error');
      setMessage(err?.message || 'Could not accept this invitation.');
    } finally {
      setBusy(false);
    }
  };

  const signOutAndRetry = async () => {
    await createClient().auth.signOut();
    window.location.href = `/login?redirectTo=${encodeURIComponent(`/invite/${token}`)}`;
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <Image src="/Kyriq_Logo_Files/kyriq-icon.svg" alt="Kyriq" width={32} height={32} className="rounded-lg" />
          <span className="font-heading text-lg font-extrabold tracking-tight">kyriq</span>
        </div>

        <GlassCard padding="lg" reveal className="space-y-5">
          {state === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          )}

          {state === 'valid' && invitation && (
            <>
              <GlassCardTitle>Join {invitation.firm}</GlassCardTitle>
              <GlassCardBody>
                You have been invited to {invitation.firm} on Kyriq as{' '}
                <strong>{productRoleLabel(invitation.role)}</strong>.
              </GlassCardBody>
              <GlassPanel className="rounded-xl p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">Invited email</span>
                  <span className="font-medium">{invitation.email}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-ink-faint">Role</span>
                  <Badge tone="brand">{productRoleLabel(invitation.role)}</Badge>
                </div>
                {invitation.expires_at && (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-ink-faint">Expires</span>
                    <span>{new Date(invitation.expires_at).toLocaleDateString()}</span>
                  </div>
                )}
              </GlassPanel>
              {message && <p className="text-sm text-error-text">{message}</p>}
              <Button block onClick={accept} disabled={busy}>
                {busy ? 'Joining…' : 'Accept invitation'}
              </Button>
            </>
          )}

          {state === 'signin_required' && invitation && (
            <>
              <GlassCardTitle>Sign in to join {invitation.firm}</GlassCardTitle>
              <GlassCardBody>
                This invitation is for <strong>{invitation.email}</strong>. Sign in or create that
                account, and you will come straight back here.
              </GlassCardBody>
              <div className="flex flex-col gap-2">
                <Button block onClick={() => router.push(`/login?redirectTo=${encodeURIComponent(`/invite/${token}`)}`)}>
                  Sign in
                </Button>
                <Link
                  href={`/signup?redirectTo=${encodeURIComponent(`/invite/${token}`)}`}
                  className="text-center text-sm text-brand-deep underline-offset-2 hover:underline"
                >
                  Create an account
                </Link>
              </div>
            </>
          )}

          {state === 'wrong_email' && invitation && (
            <>
              <GlassCardTitle>Wrong account</GlassCardTitle>
              <GlassCardBody>
                This invitation was sent to <strong>{invitation.email}</strong>
                {signedInAs ? <> but you are signed in as <strong>{signedInAs}</strong></> : null}.
              </GlassCardBody>
              <Button block variant="secondary" onClick={signOutAndRetry}>
                Sign in as {invitation.email}
              </Button>
            </>
          )}

          {state === 'accepted' && (
            <>
              <GlassCardTitle>Already accepted</GlassCardTitle>
              <GlassCardBody>
                This invitation has already been used. If that was you, just sign in.
              </GlassCardBody>
              <Button block variant="secondary" onClick={() => router.push('/login')}>
                Go to sign in
              </Button>
            </>
          )}

          {state === 'expired' && (
            <>
              <GlassCardTitle>Invitation expired</GlassCardTitle>
              <GlassCardBody>
                Invitations are valid for 7 days. Ask an Administrator at{' '}
                {invitation?.firm || 'your firm'} to send a new one.
              </GlassCardBody>
            </>
          )}

          {state === 'already_member' && (
            <>
              <GlassCardTitle>Account already belongs to a firm</GlassCardTitle>
              <GlassCardBody>{message}</GlassCardBody>
              <Button block variant="secondary" onClick={signOutAndRetry}>
                Use a different account
              </Button>
            </>
          )}

          {state === 'not_found' && (
            <>
              <GlassCardTitle>Invitation not found</GlassCardTitle>
              <GlassCardBody>
                This link is not valid. It may have been cancelled or already replaced by a newer
                invitation.
              </GlassCardBody>
            </>
          )}

          {state === 'joined' && invitation && (
            <>
              <GlassCardTitle>You are in</GlassCardTitle>
              <GlassCardBody>
                Welcome to {invitation.firm}. Taking you to your dashboard…
              </GlassCardBody>
            </>
          )}

          {state === 'error' && (
            <>
              <GlassCardTitle>Something went wrong</GlassCardTitle>
              <GlassCardBody>{message || 'Please try again.'}</GlassCardBody>
              <Button block variant="secondary" onClick={() => { setState('loading'); load(); }}>
                Try again
              </Button>
            </>
          )}
        </GlassCard>
      </div>
    </main>
  );
}
