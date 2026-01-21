import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: check, error } = await supabase
        .from('checks')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', user.id)
        .single()

    if (error || !check) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Generate signed URL for image
    const { data: signedUrl } = await supabase.storage
        .from('checks')
        .createSignedUrl(check.source_file, 3600) // 1 hour

    return NextResponse.json({
        ...check,
        image_url: signedUrl?.signedUrl
    })
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { field, value } = body

    // Fetch current value for audit
    const { data: currentCheck } = await supabase
        .from('checks')
        .select(field)
        .eq('id', id)
        .single()

    const oldValue = currentCheck ? currentCheck[field] : null

    // Update
    const updateData: any = { [field]: value, updated_at: new Date().toISOString() }

    // If updating a main field, perhaps reset confidence or mark as reviewed?
    // For now, basic update

    const { error } = await supabase
        .from('checks')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', user.id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit log
    await supabase.from('audit_logs').insert({
        check_id: id,
        action: 'updated',
        field,
        old_value: String(oldValue),
        new_value: String(value),
        user_id: user.id
    })

    return NextResponse.json({ success: true })
}
