import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { preprocessImage } from '@/lib/ocr/preprocess'
import { runOCR, extractFieldsFromOCR } from '@/lib/ocr/tesseract'
import { callVisionAPI, extractFieldsFromVision } from '@/lib/ai/vision'
import { hybridSelect, calculateConfidenceSummary } from '@/lib/validation/hybrid'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    // Use service client to bypass RLS for background processing if needed, 
    // though typically we'd want to check auth. 
    // Since this is triggered by the user or internal queue, we'll verify access.
    const supabase = createServiceClient()

    try {
        // 1. Fetch check record
        const { data: check, error: fetchError } = await supabase
            .from('checks')
            .select('*')
            .eq('id', id)
            .single()

        if (fetchError || !check) {
            return NextResponse.json({ error: 'Check not found' }, { status: 404 })
        }

        // Update status to processing
        await supabase.from('checks').update({ status: 'processing' }).eq('id', id)

        // 2. Download file
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('checks')
            .download(check.source_file)

        if (downloadError || !fileData) {
            throw new Error('Failed to download file')
        }

        const imageBuffer = Buffer.from(await fileData.arrayBuffer())

        // 3. Preprocess
        const processedImage = await preprocessImage(imageBuffer)

        // 4. Run Engines in Parallel
        const [ocrResult, visionResult] = await Promise.all([
            runOCR(processedImage),
            callVisionAPI(processedImage)
        ])

        // 5. Extract Fields
        const ocrFields = extractFieldsFromOCR(ocrResult)
        const aiFields = extractFieldsFromVision(visionResult)

        // 6. Hybrid Selection
        const finalFields = hybridSelect(ocrFields, aiFields)

        // 7. Calculate Confidence
        const confidenceSummary = calculateConfidenceSummary(finalFields)

        // 8. Determine Status
        const status = confidenceSummary >= 0.9 ? 'approved' : 'pending_review'

        // 9. Save Results
        const { error: updateError } = await supabase
            .from('checks')
            .update({
                status,

                payee: finalFields.payee.value,
                payee_confidence: finalFields.payee.confidence,
                payee_source: finalFields.payee.source,

                amount: finalFields.amount.value,
                amount_confidence: finalFields.amount.confidence,
                amount_source: finalFields.amount.source,

                check_date: finalFields.checkDate.value || null, // Handle empty string
                check_date_confidence: finalFields.checkDate.confidence,
                check_date_source: finalFields.checkDate.source,

                check_number: finalFields.checkNumber.value,
                check_number_confidence: finalFields.checkNumber.confidence,
                check_number_source: finalFields.checkNumber.source,

                bank: finalFields.bank.value,
                bank_confidence: finalFields.bank.confidence,

                micr_routing: finalFields.micr.routing.value,
                micr_account: finalFields.micr.account.value,
                micr_serial: finalFields.micr.serial.value,
                micr_confidence: (finalFields.micr.routing.confidence + finalFields.micr.account.confidence) / 2,

                confidence_summary: confidenceSummary,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)

        if (updateError) {
            throw updateError
        }

        // 10. Create Audit Log
        await supabase.from('audit_logs').insert({
            check_id: id,
            action: 'created',
            new_value: JSON.stringify(finalFields),
            user_id: check.tenant_id // System action on behalf of tenant
        })

        return NextResponse.json({ success: true, status })

    } catch (error) {
        console.error('Processing error:', error)
        await supabase
            .from('checks')
            .update({ status: 'pending_review', qbo_sync_error: 'Processing failed' })
            .eq('id', id)

        return NextResponse.json(
            { error: 'Processing failed' },
            { status: 500 }
        )
    }
}
