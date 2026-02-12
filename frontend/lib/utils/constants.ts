export const PROCESSING_STAGES = [
    { name: 'upload', label: 'Upload & Validate' },
    { name: 'segmentation', label: 'Check Detection & Cropping' },
    { name: 'ocr_extraction', label: 'Triple OCR Extraction' },
    { name: 'hybrid_selection', label: 'Hybrid Merge & Validation' },
]