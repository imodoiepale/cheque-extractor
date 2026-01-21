export interface Check {
    id: string;
    tenant_id: string;
    status: string;
    source_file: string;
    file_url: string;
    file_size?: number;
    file_type?: string;

    // Extracted fields
    payee?: string;
    payee_confidence?: number;
    payee_source?: string;

    amount?: number;
    amount_confidence?: number;
    amount_source?: string;

    check_date?: string;
    check_date_confidence?: number;
    check_date_source?: string;

    check_number?: string;
    check_number_confidence?: number;
    check_number_source?: string;

    bank_name?: string;
    bank_name_confidence?: number;

    micr_routing?: string;
    micr_account?: string;
    micr_serial?: string;

    confidence_summary?: number;

    // Metadata
    created_at: string;
    updated_at: string;
    deleted_at?: string;
}