import { requireCapability, READ_METHODS, getActiveRealm } from '@/lib/match-helpers';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient } from '@/lib/supabase/api';

/**
 * Delete all QuickBooks entries for the current user's tenant
 * DELETE /api/quickbooks/delete-all
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Server-side role gate (lib/roles.ts): the UI hiding the action is not enough.
  if (!READ_METHODS.has(req.method ?? '') && !(await requireCapability(req, res, 'account.edit'))) return;
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);

    // Get user's tenant_id
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return res.status(400).json({ error: 'User has no tenant' });
    }

    // Only the selected company: the dialog shows that company's count.
    const realmId = await getActiveRealm(supabase, profile.tenant_id);
    if (!realmId) return res.status(400).json({ error: 'No active QuickBooks company' });

    // First, count how many entries exist
    const { count: beforeCount } = await supabase
      .from('qb_entries')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', profile.tenant_id)
      .eq('realm_id', realmId);

    console.log(`[DELETE-ALL] Found ${beforeCount} QB entries for tenant ${profile.tenant_id}`);

    // Delete all entries for this tenant (RLS also enforces this)
    const { error } = await supabase
      .from('qb_entries')
      .delete()
      .eq('tenant_id', profile.tenant_id)
      .eq('realm_id', realmId);

    if (error) {
      console.error('Failed to delete all QB entries:', error);
      return res.status(500).json({ error: 'Failed to delete entries', details: error.message });
    }

    console.log(`[DELETE-ALL] Successfully deleted ${beforeCount} QB entries`);

    return res.status(200).json({ 
      success: true, 
      message: `Successfully deleted ${beforeCount || 0} QuickBooks entries`,
      count: beforeCount || 0
    });
  } catch (error: any) {
    console.error('Delete all QB entries error:', error);
    return res.status(500).json({ error: error.message || 'Failed to delete entries' });
  }
}
