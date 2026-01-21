import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateCSV } from '@/lib/accounting/csv'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { check_ids, format = 'csv' } = body

    if (!check_ids || !Array.isArray(check_ids)) {
        return NextResponse.json({ error: 'Invalid check_ids' }, { status: 400 })
    }

    // Fetch checks
    const { data: checks } = await supabase
        .from('checks')
        .select('*')
        .in('id', check_ids)
        .eq('tenant_id', user.id)

    if (!checks || checks.length === 0) {
        return NextResponse.json({ error: 'No checks found' }, { status: 404 })
    }

    if (format === 'csv') {
        const csvContent = generateCSV(checks)

        // In a real app, we might upload this to Storage and return a URL
        // Or return it directly
        return new NextResponse(csvContent, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="checks_export_${new Date().toISOString()}.csv"`
            }
        })
    }

    return NextResponse.json({ error: 'Format not supported' }, { status: 400 })
}
