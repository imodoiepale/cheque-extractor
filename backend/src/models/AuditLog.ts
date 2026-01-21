export interface AuditLog {
    id: string;
    table_name: string;
    record_id: string;
    check_id?: string;
    tenant_id: string;
    action: string;
    changes?: any;
    user_id?: string;
    source: string;
    created_at: string;
}