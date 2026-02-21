-- ============================================================================
-- Add flatten_checks_from_job function if missing
-- Run this in Supabase SQL Editor if you get 404 errors
-- ============================================================================

-- ── flatten_checks_from_job: upsert checks_data JSONB → checks table ──
CREATE OR REPLACE FUNCTION flatten_checks_from_job(p_job_id TEXT)
RETURNS void AS $$
DECLARE
    _job RECORD;
    _check JSONB;
    _ext JSONB;
    _micr JSONB;
    _amount_text TEXT;
    _amount_num NUMERIC;
    _date_text TEXT;
    _date_val DATE;
BEGIN
    SELECT * INTO _job FROM check_jobs WHERE job_id = p_job_id;
    IF NOT FOUND THEN RETURN; END IF;

    FOR _check IN SELECT jsonb_array_elements(_job.checks_data)
    LOOP
        _ext := _check->'extraction';
        _micr := _ext->'micr';

        -- Parse amount: handle {value, confidence} or plain string
        _amount_text := COALESCE(
            _ext->'amount'->>'value',
            _ext->>'amount'
        );
        BEGIN
            _amount_num := regexp_replace(COALESCE(_amount_text,''), '[^0-9.]', '', 'g')::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            _amount_num := NULL;
        END;

        -- Parse date
        _date_text := COALESCE(
            _ext->'checkDate'->>'value',
            _ext->>'checkDate'
        );
        BEGIN
            _date_val := _date_text::DATE;
        EXCEPTION WHEN OTHERS THEN
            _date_val := NULL;
        END;

        INSERT INTO checks (
            tenant_id, job_id, check_id, source_file,
            page_number, image_width, image_height, file_url,
            payee, payee_confidence, payee_source,
            amount, amount_raw, amount_confidence, amount_source,
            amount_written, amount_written_confidence,
            check_date, check_date_raw, check_date_confidence, check_date_source,
            check_number, check_number_confidence, check_number_source,
            bank_name, bank_name_confidence, bank_name_source,
            memo, memo_confidence,
            micr_routing, micr_routing_confidence,
            micr_account, micr_account_confidence,
            micr_serial, micr_raw,
            hybrid_results, ocr_results,
            status
        ) VALUES (
            COALESCE(_job.tenant_id, '00000000-0000-0000-0000-000000000000'::UUID),
            p_job_id,
            _check->>'check_id',
            _job.pdf_name,
            COALESCE((_check->>'page')::INT, 1),
            (_check->>'width')::INT,
            (_check->>'height')::INT,
            _check->>'image_url',
            -- payee
            COALESCE(_ext->'payee'->>'value', _ext->>'payee'),
            (_ext->'payee'->>'confidence')::NUMERIC,
            _ext->'payee'->>'source',
            -- amount
            _amount_num,
            _amount_text,
            (_ext->'amount'->>'confidence')::NUMERIC,
            _ext->'amount'->>'source',
            -- amount_written
            COALESCE(_ext->'amountWritten'->>'value', _ext->>'amountWritten'),
            (_ext->'amountWritten'->>'confidence')::NUMERIC,
            -- date
            _date_val,
            _date_text,
            (_ext->'checkDate'->>'confidence')::NUMERIC,
            _ext->'checkDate'->>'source',
            -- check_number
            COALESCE(_ext->'checkNumber'->>'value', _ext->>'checkNumber'),
            (_ext->'checkNumber'->>'confidence')::NUMERIC,
            _ext->'checkNumber'->>'source',
            -- bank
            COALESCE(_ext->'bankName'->>'value', _ext->>'bankName'),
            (_ext->'bankName'->>'confidence')::NUMERIC,
            _ext->'bankName'->>'source',
            -- memo
            COALESCE(_ext->'memo'->>'value', _ext->>'memo'),
            (_ext->'memo'->>'confidence')::NUMERIC,
            -- micr
            COALESCE(_micr->'routing'->>'value', _micr->>'routing'),
            (_micr->'routing'->>'confidence')::NUMERIC,
            COALESCE(_micr->'account'->>'value', _micr->>'account'),
            (_micr->'account'->>'confidence')::NUMERIC,
            COALESCE(_micr->'serial'->>'value', _micr->>'serial'),
            _micr->>'raw',
            -- raw results
            _ext,
            _check->'engine_results',
            'pending_review'
        )
        ON CONFLICT (job_id, check_id)
        DO UPDATE SET
            page_number     = EXCLUDED.page_number,
            image_width     = EXCLUDED.image_width,
            image_height    = EXCLUDED.image_height,
            file_url        = EXCLUDED.file_url,
            payee           = EXCLUDED.payee,
            payee_confidence = EXCLUDED.payee_confidence,
            amount          = EXCLUDED.amount,
            amount_raw      = EXCLUDED.amount_raw,
            amount_confidence = EXCLUDED.amount_confidence,
            check_date      = EXCLUDED.check_date,
            check_date_raw  = EXCLUDED.check_date_raw,
            check_date_confidence = EXCLUDED.check_date_confidence,
            check_number    = EXCLUDED.check_number,
            check_number_confidence = EXCLUDED.check_number_confidence,
            bank_name       = EXCLUDED.bank_name,
            bank_name_confidence = EXCLUDED.bank_name_confidence,
            memo            = EXCLUDED.memo,
            memo_confidence = EXCLUDED.memo_confidence,
            micr_routing    = EXCLUDED.micr_routing,
            micr_account    = EXCLUDED.micr_account,
            hybrid_results  = EXCLUDED.hybrid_results,
            updated_at      = now();
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
