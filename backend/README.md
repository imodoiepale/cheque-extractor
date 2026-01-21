# OCR Check Processing Backend

High-performance backend service for automated check processing using OCR (Tesseract) and AI (Google Vision API).

## Features

- 🔍 **Dual Extraction Engines**: Tesseract OCR + Google Vision AI
- 🎯 **Hybrid Field Selection**: Automatic best-result selection
- ✅ **Validation Pipeline**: Required fields, formats, duplicates
- 📊 **Real-time Progress**: Stage-by-stage processing updates
- 💼 **QuickBooks Integration**: API export + CSV fallback
- 🔄 **Job Queue**: Bull + Redis for async processing
- 📝 **Complete Audit Trail**: All changes logged

## Prerequisites

- Node.js >= 18.0.0
- Redis (for queue)
- Tesseract OCR installed
- Google Vision API credentials
- Supabase project

## Installation
```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `VISION_API_KEY`
- `REDIS_URL`

## Development
```bash
# Start dev server with auto-reload
npm run dev

# Run tests
npm test

# Run specific test suite
npm test -- ocr.test.ts

# Test OCR with sample image
npm run test:ocr path/to/check.png

# Test AI with sample image
npm run test:ai path/to/check.png

# Benchmark processing
npm run benchmark path/to/check.png
```

## Building
```bash
npm run build
npm start
```

## API Endpoints

### POST `/process/:checkId`
Start processing a check
```bash
curl -X POST http://localhost:4000/process/check-uuid-here
```

### POST `/export`
Export checks to QuickBooks
```json
{
  "tenantId": "tenant-uuid",
  "checkIds": ["check-1", "check-2"],
  "realmId": "qbo-realm-id",
  "exportType": "qbo_api"
}
```

## Architecture
```
┌─────────────┐
│  API Layer  │
└──────┬──────┘
       │
┌──────▼──────┐
│ Job Queue   │ (Bull + Redis)
└──────┬──────┘
       │
┌──────▼─────────────────┐
│ Processing Pipeline    │
│ ┌──────────────────┐  │
│ │ 1. Ingestion     │  │
│ │ 2. Preprocessing │  │
│ │ 3. Segmentation  │  │
│ │ 4. OCR Extract   │  │
│ │ 5. AI Extract    │  │
│ │ 6. Hybrid Select │  │
│ │ 7. Validation    │  │
│ │ 8. Export        │  │
│ └──────────────────┘  │
└───────────────────────┘
```

## Testing

Place test check images in `tests/fixtures/sample-checks/`

Run full test suite:
```bash
npm run test:coverage
```

## License

MIT