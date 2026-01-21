import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            )
        }

        // Validate file type
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            return NextResponse.json(
                { error: 'Invalid file type. Only images and PDFs are allowed.' },
                { status: 400 }
            )
        }

        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Upload to Storage
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${uuidv4()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('checks')
            .upload(fileName, file)

        if (uploadError) {
            return NextResponse.json(
                { error: 'Upload failed: ' + uploadError.message },
                { status: 500 }
            )
        }

        // Create Check Record
        const { data: check, error: dbError } = await supabase
            .from('checks')
            .insert({
                tenant_id: user.id, // Assuming 1:1 user-tenant for now as per RLS
                status: 'pending',
                source_file: fileName,
                file_url: fileName // We'll generate signed URLs on demand
            })
            .select()
            .single()

        if (dbError) {
            return NextResponse.json(
                { error: 'Database error: ' + dbError.message },
                { status: 500 }
            )
        }

        // Trigger processing (async)
        // In a real production app, this would be a queue. 
        // Here we'll just fire and forget the processing endpoint, or return success and let client poll.
        // For this MVP, we can start processing immediately.

        // We'll return success and let the client trigger processing or just start it here
        // Let's call the process endpoint internally or start the logic

        // Trigger processing asynchronously without waiting
        fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/process-check/${check.id}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // Add service auth header if needed
            }
        }).catch(console.error)

        return NextResponse.json({
            check_id: check.id,
            status: 'processing',
            message: 'Upload successful, processing started'
        })

    } catch (error) {
        console.error('Upload handler error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
