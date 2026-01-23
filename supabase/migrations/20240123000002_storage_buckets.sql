-- Create storage bucket for check images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'check-images',
    'check-images',
    false,
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies for check-images bucket
CREATE POLICY "Users can upload check images to their tenant"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'check-images' AND
    auth.uid() IN (
        SELECT id FROM profiles 
        WHERE tenant_id = (storage.foldername(name))[1]::uuid
    )
);

CREATE POLICY "Users can view check images from their tenant"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'check-images' AND
    auth.uid() IN (
        SELECT id FROM profiles 
        WHERE tenant_id = (storage.foldername(name))[1]::uuid
    )
);

CREATE POLICY "Users can update check images from their tenant"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'check-images' AND
    auth.uid() IN (
        SELECT id FROM profiles 
        WHERE tenant_id = (storage.foldername(name))[1]::uuid
    )
);

CREATE POLICY "Admins can delete check images from their tenant"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'check-images' AND
    auth.uid() IN (
        SELECT id FROM profiles 
        WHERE tenant_id = (storage.foldername(name))[1]::uuid
        AND role = 'admin'
    )
);
