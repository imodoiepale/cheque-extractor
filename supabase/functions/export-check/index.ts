import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { tenantId, checkIds, exportType, realmId } = await req.json();

    if (!tenantId || !checkIds || !Array.isArray(checkIds) || checkIds.length === 0) {
      throw new Error('Invalid request parameters');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify all checks belong to tenant and are approved
    const { data: checks, error: checksError } = await supabaseClient
      .from('checks')
      .select('id, status, exported')
      .eq('tenant_id', tenantId)
      .in('id', checkIds);

    if (checksError) {
      throw new Error('Failed to fetch checks');
    }

    // Validate checks
    const invalidChecks = checks?.filter(
      c => c.status !== 'approved' || c.exported
    );

    if (invalidChecks && invalidChecks.length > 0) {
      throw new Error('Some checks are not ready for export or already exported');
    }

    // Create export history record
    const { data: exportRecord, error: exportError } = await supabaseClient
      .from('export_history')
      .insert({
        tenant_id: tenantId,
        export_type: exportType,
        check_ids: checkIds,
        total_checks: checkIds.length,
        status: 'pending',
      })
      .select()
      .single();

    if (exportError) {
      throw new Error('Failed to create export record');
    }

    // Call backend export service
    const backendUrl = Deno.env.get('BACKEND_URL') || 'http://localhost:4000';
    const response = await fetch(`${backendUrl}/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenantId,
        checkIds,
        exportType,
        realmId,
      }),
    });

    if (!response.ok) {
      // Update export record to failed
      await supabaseClient
        .from('export_history')
        .update({ status: 'failed' })
        .eq('id', exportRecord.id);

      throw new Error('Backend export failed');
    }

    const result = await response.json();

    // Update export record
    await supabaseClient
      .from('export_history')
      .update({
        status: result.failedCount === 0 ? 'success' : 'partial_success',
        successful_count: result.successfulCount,
        failed_count: result.failedCount,
        check_results: result.results,
      })
      .eq('id', exportRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        batchId: result.batchId,
        exportId: exportRecord.id,
        totalChecks: checkIds.length,
        successfulCount: result.successfulCount,
        failedCount: result.failedCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});