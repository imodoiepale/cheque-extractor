# Supabase Storage Setup

## Create Storage Bucket for Check Images

Your application needs a Supabase Storage bucket named **"checks"** to store:
- Uploaded PDF files
- Extracted check images
- Page images
- OCR result JSON files
- Extraction summaries

### Steps to Create the Bucket

1. **Go to Supabase Dashboard**
   - Navigate to https://supabase.com/dashboard
   - Select your project: `yqbmzerdagqevjdwhlwh`

2. **Open Storage**
   - Click on **Storage** in the left sidebar
   - Click **"New bucket"** button

3. **Create Bucket**
   - **Name**: `checks`
   - **Public bucket**: ✅ **Enable** (check this box)
   - **File size limit**: Leave default or set to 50 MB
   - **Allowed MIME types**: Leave empty (allow all)
   - Click **"Create bucket"**

4. **Verify Bucket is Public**
   - Click on the `checks` bucket
   - Go to **Policies** tab
   - You should see a policy allowing public access
   - If not, add this policy:
     ```sql
     CREATE POLICY "Public Access"
     ON storage.objects FOR SELECT
     USING ( bucket_id = 'checks' );
     ```

### Bucket Structure

Once created, the bucket will store files in this structure:
```
checks/
├── jobs/
│   ├── {job_id}/
│   │   ├── {filename}.pdf                    # Original PDF
│   │   ├── images/
│   │   │   ├── check_0001.png               # Extracted check images
│   │   │   ├── check_0002.png
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── page_1.png                   # Full page images
│   │   │   ├── page_2.png
│   │   │   └── ...
│   │   ├── ocr_results/
│   │   │   ├── check_0001/
│   │   │   │   ├── tesseract.json
│   │   │   │   ├── numarkdown.json
│   │   │   │   ├── gemini.json
│   │   │   │   └── hybrid.json
│   │   │   └── ...
│   │   └── extraction_summary.json
│   └── ...
```

### After Creating the Bucket

1. **Restart your application** (both local and Railway)
2. **Upload a new PDF** to test
3. **Check backend logs** - you should see:
   ```
   ✓ check_0001: https://yqbmzerdagqevjdwhlwh.supabase.co/storage/v1/object/public/checks/jobs/...
   ```
4. **Verify in Supabase Dashboard**:
   - Go to Storage → checks bucket
   - You should see the uploaded files

### Troubleshooting

**If uploads still fail:**
- Verify bucket name is exactly `checks` (lowercase)
- Ensure bucket is marked as **Public**
- Check your `SUPABASE_SERVICE_ROLE_KEY` is correct in environment variables
- Look for error messages in backend logs

**If images don't display:**
- Verify the bucket has public read access
- Check the image URLs in the console logs
- Try accessing an image URL directly in your browser
