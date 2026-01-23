Supabase Edge Functions - Complete Implementation
Let me create all the Supabase Edge Functions before we move to the frontend.

Supabase Edge Functions
supabase/functions/process-check/index.ts
typescriptimport { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { checkId } = await req.json();

    if (!checkId) {
      throw new Error('checkId is required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get check details
    const { data: check, error: checkError } = await supabaseClient
      .from('checks')
      .select('*')
      .eq('id', checkId)
      .single();

    if (checkError || !check) {
      throw new Error('Check not found');
    }

    // Update status to processing
    await supabaseClient
      .from('checks')
      .update({ 
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', checkId);

    // Initialize processing stages
    const stages = [
      { name: 'ingestion', order: 1 },
      { name: 'preprocessing', order: 2 },
      { name: 'segmentation', order: 3 },
      { name: 'ocr_extraction', order: 4 },
      { name: 'ai_extraction', order: 5 },
      { name: 'hybrid_selection', order: 6 },
      { name: 'validation', order: 7 },
      { name: 'complete', order: 8 },
    ];

    for (const stage of stages) {
      await supabaseClient
        .from('processing_stages')
        .upsert({
          check_id: checkId,
          stage_name: stage.name,
          stage_order: stage.order,
          status: 'pending',
          progress: 0,
        });
    }

    // Call backend processing service
    const backendUrl = Deno.env.get('BACKEND_URL') || 'http://localhost:4000';
    const response = await fetch(`${backendUrl}/process/${checkId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Backend processing failed');
    }

    const result = await response.json();

    return new Response(
      JSON.stringify({
        success: true,
        checkId,
        message: 'Processing started',
        jobId: result.jobId,
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

supabase/functions/process-check/README.md
markdown# Process Check Edge Function
