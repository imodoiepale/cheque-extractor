export interface CheckField<T = string> {
    value: T
    confidence: number
    source: 'ocr' | 'ai' | 'hybrid'
}

export interface MICRData {
    routing: CheckField
    account: CheckField
    serial: CheckField
}

export interface ExtractedCheck {
    payee: CheckField
    amount: CheckField<number>
    checkDate: CheckField<string>
    checkNumber: CheckField
    bank: CheckField
    micr: MICRData
    confidenceSummary: number
}

export interface CheckRecord {
    id: string
    tenant_id: string
    status: 'pending' | 'processing' | 'pending_review' | 'approved' | 'exported'

    // Extracted fields
    payee: string | null
    payee_confidence: number | null
    payee_source: 'ocr' | 'ai' | 'hybrid' | null

    amount: number | null
    amount_confidence: number | null
    amount_source: 'ocr' | 'ai' | 'hybrid' | null

    check_date: string | null
    check_date_confidence: number | null
    check_date_source: 'ocr' | 'ai' | 'hybrid' | null

    check_number: string | null
    check_number_confidence: number | null
    check_number_source: 'ocr' | 'ai' | 'hybrid' | null

    bank: string | null
    bank_confidence: number | null

    // MICR data
    micr_routing: string | null
    micr_account: string | null
    micr_serial: string | null
    micr_confidence: number | null

    // Metadata
    confidence_summary: number | null
    source_file: string | null
    file_url: string | null

    // Accounting sync
    qbo_synced: boolean
    qbo_transaction_id: string | null
    qbo_sync_error: string | null

    created_at: string
    updated_at: string
}

export interface AuditLog {
    id: string
    check_id: string
    action: 'created' | 'updated' | 'reviewed' | 'exported'
    field: string | null
    old_value: string | null
    new_value: string | null
    user_id: string | null
    created_at: string
}

export interface Tenant {
    id: string
    name: string
    created_at: string
}
