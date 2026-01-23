OCR Check Processing System - Complete Project Structure
Visual Process Flow in Application
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE LAYER                         │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │   Upload     │→ │   Review     │→ │   Export     │             │
│  │   Dashboard  │  │   Dashboard  │  │   Dashboard  │             │
│  └──────────────┘  └──────────────┘  └──────────────┘             │
│         │                 │                  │                      │
│         ▼                 ▼                  ▼                      │
│  ┌─────────────────────────────────────────────────────┐           │
│  │          Real-Time Process Visualization            │           │
│  │  [Progress Bar] [Current Stage] [Time Elapsed]     │           │
│  └─────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY / AUTH LAYER                        │
│  ┌────────────────────────────────────────────────────┐             │
│  │  Supabase Auth + Row Level Security (RLS)         │             │
│  │  JWT Validation, Role-Based Access Control        │             │
│  └────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PROCESSING PIPELINE (Backend)                     │
│                                                                      │
│  STAGE 1: INGESTION                                                 │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  • File Upload (PDF/Image)                           │           │
│  │  • Store in Supabase Storage                         │           │
│  │  • Create Check Record (status: "uploaded")          │           │
│  │  • Generate Signed URL                               │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: "File uploaded successfully"           │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 2: IMAGE PREPROCESSING                                       │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  • Convert to Grayscale                              │           │
│  │  • Deskew Image (Hough Transform)                    │           │
│  │  • Noise Reduction (Gaussian Blur)                   │           │
│  │  • Contrast Normalization (CLAHE)                    │           │
│  │  • Adaptive Thresholding                             │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: "Preprocessing image..." [Progress]    │           │
│  │  📊 Preview: Before/After Images                     │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 3: CHECK SEGMENTATION                                        │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  • Detect Check Boundaries (Contour Detection)       │           │
│  │  • Calculate Aspect Ratios                           │           │
│  │  • Identify Multiple Checks on Single Page           │           │
│  │  • Extract Individual Check Images                   │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: "Found 2 checks on page"               │           │
│  │  📊 Visual: Bounding boxes on each check             │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 4: PARALLEL EXTRACTION (Hybrid Engine)                      │
│  ┌──────────────────────────────────────────────────────┐           │
│  │                                                       │           │
│  │  ┌─────────────────────┐   ┌─────────────────────┐  │           │
│  │  │   OCR ENGINE        │   │   AI ENGINE         │  │           │
│  │  │   (Tesseract)       │   │   (Vision Gemini)   │  │           │
│  │  ├─────────────────────┤   ├─────────────────────┤  │           │
│  │  │ • MICR Line Parse   │   │ • Full Text Extract │  │           │
│  │  │ • Payee (Top-Left)  │   │ • NER for Fields    │  │           │
│  │  │ • Amount (Regex)    │   │ • Handwriting       │  │           │
│  │  │ • Date (Regex)      │   │ • Context Analysis  │  │           │
│  │  │ • Check # (Pattern) │   │ • Entity Recognition│  │           │
│  │  │ • Bank (Top Center) │   │ • Confidence Score  │  │           │
│  │  └─────────────────────┘   └─────────────────────┘  │           │
│  │           │                          │               │           │
│  │           └──────────┬───────────────┘               │           │
│  │                      ▼                               │           │
│  │  ┌─────────────────────────────────────────────┐    │           │
│  │  │  CONFIDENCE COMPARISON & FIELD SELECTION    │    │           │
│  │  │  • Compare OCR vs AI for each field         │    │           │
│  │  │  • Select highest confidence value          │    │           │
│  │  │  • Calculate overall confidence score       │    │           │
│  │  └─────────────────────────────────────────────┘    │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: Side-by-side OCR vs AI results         │           │
│  │  📊 Highlight: Selected value with confidence badge  │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 5: FIELD EXTRACTION RESULTS                                  │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  Extracted Fields:                                    │           │
│  │  ┌────────────────────────────────────────────────┐  │           │
│  │  │ Payee:     "ACME SUPPLIES"    [AI] 93%  ✓     │  │           │
│  │  │ Amount:    "$1,250.75"        [AI] 95%  ✓     │  │           │
│  │  │ Date:      "01/14/2026"       [OCR] 91% ✓     │  │           │
│  │  │ Check #:   "10452"            [OCR] 98% ✓     │  │           │
│  │  │ Bank:      "CHASE"            [OCR] 88% ⚠     │  │           │
│  │  │ MICR:      "021000021..."     [OCR] 97% ✓     │  │           │
│  │  └────────────────────────────────────────────────┘  │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: Field-by-field extraction results       │           │
│  │  📊 Color Coding: Green(>90%), Yellow(70-90%), Red(<70%)         │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 6: VALIDATION ENGINE                                         │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  • Required Field Check                               │           │
│  │  • Format Validation (Date, Amount, MICR)            │           │
│  │  • Cross-Field Validation (Numeric vs Written Amount)│           │
│  │  • Duplicate Check Detection                         │           │
│  │  • Business Rules Validation                         │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: Validation results with warnings        │           │
│  │  📊 Flags: Missing fields, format errors, duplicates  │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 7: ROUTING DECISION                                          │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  IF confidence_summary >= 0.90:                       │           │
│  │     ✓ Auto-Approved → Ready for Export               │           │
│  │  ELSE IF confidence_summary >= 0.70:                  │           │
│  │     ⚠ Review Suggested → Queue for Review            │           │
│  │  ELSE:                                                │           │
│  │     ⚠ Review Required → Must Review Before Export    │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: Status badge and next action            │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 8: REVIEW WORKFLOW (If Needed)                              │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  • Display Check Image + Extracted Fields             │           │
│  │  • Allow Field Editing                                │           │
│  │  • Show Confidence Scores                             │           │
│  │  • Highlight Low-Confidence Fields                    │           │
│  │  • Audit Trail Logging                                │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: Interactive review interface            │           │
│  │  📊 Actions: Edit, Approve, Reject                    │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 9: NORMALIZED DATA MODEL                                     │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  {                                                    │           │
│  │    "check_id": "chk_001",                            │           │
│  │    "status": "approved",                             │           │
│  │    "payee": {...},                                   │           │
│  │    "amount": {...},                                  │           │
│  │    "confidence_summary": 0.93                        │           │
│  │  }                                                    │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: Final check data ready for export       │           │
│  └──────────────────────────────────────────────────────┘           │
│                              │                                       │
│                              ▼                                       │
│  STAGE 10: ACCOUNTING EXPORT                                        │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  QuickBooks Online Integration:                       │           │
│  │  • OAuth2 Authentication                              │           │
│  │  • Create Check/Expense Object                        │           │
│  │  • Duplicate Detection                                │           │
│  │  • Sync Status Tracking                               │           │
│  │                                                       │           │
│  │  CSV Export (Fallback):                               │           │
│  │  • Generate QBO-Compliant CSV                         │           │
│  │  • Download Link                                      │           │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │           │
│  │  📊 UI Shows: Export success with transaction ID      │           │
│  └──────────────────────────────────────────────────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DATABASE & STORAGE LAYER                         │
│  ┌────────────────────────────────────────────────────┐             │
│  │  Supabase PostgreSQL + Storage                     │             │
│  │  • checks table (with all extracted fields)        │             │
│  │  • audit_logs table (full history)                 │             │
│  │  • tenants table (multi-tenant support)            │             │
│  │  • File storage (encrypted, signed URLs)           │             │
│  └────────────────────────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘

Complete Project Structure
ocr-check-processor/
│
├── 📁 frontend/                          # Next.js Frontend Application
│   ├── 📁 app/
│   │   ├── 📁 (auth)/                    # Authentication routes
│   │   │   ├── login/
│   │   │   │   └── page.tsx              # Login page
│   │   │   ├── signup/
│   │   │   │   └── page.tsx              # Signup page
│   │   │   └── layout.tsx                # Auth layout wrapper
│   │   │
│   │   ├── 📁 dashboard/                 # Main dashboard
│   │   │   ├── page.tsx                  # Checks list view
│   │   │   ├── layout.tsx                # Dashboard layout
│   │   │   └── loading.tsx               # Loading state
│   │   │
│   │   ├── 📁 upload/                    # Upload interface
│   │   │   ├── page.tsx                  # Upload page
│   │   │   └── components/
│   │   │       ├── DropzoneUpload.tsx    # Drag-drop upload
│   │   │       ├── UploadProgress.tsx    # Upload progress bar
│   │   │       └── MultiFileQueue.tsx    # Multi-file upload queue
│   │   │
│   │   ├── 📁 process/                   # Processing visualization
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # Real-time processing view
│   │   │       └── components/
│   │   │           ├── ProcessTimeline.tsx      # Stage-by-stage timeline
│   │   │           ├── StageIndicator.tsx       # Current stage display
│   │   │           ├── PreprocessPreview.tsx    # Before/after images
│   │   │           ├── SegmentationView.tsx     # Bounding box overlay
│   │   │           ├── ExtractionComparison.tsx # OCR vs AI comparison
│   │   │           └── ConfidenceMatrix.tsx     # Confidence breakdown
│   │   │
│   │   ├── 📁 review/                    # Review workflow
│   │   │   └── [id]/
│   │   │       ├── page.tsx              # Review interface
│   │   │       └── components/
│   │   │           ├── CheckImageViewer.tsx     # Zoomable check image
│   │   │           ├── FieldEditor.tsx          # Editable field form
│   │   │           ├── ConfidenceBadge.tsx      # Confidence indicator
│   │   │           ├── ValidationWarnings.tsx   # Validation messages
│   │   │           ├── ComparisonPanel.tsx      # OCR vs AI side-by-side
│   │   │           ├── AuditHistory.tsx         # Change history
│   │   │           └── ApprovalActions.tsx      # Approve/reject buttons
│   │   │
│   │   ├── 📁 export/                    # Export dashboard
│   │   │   ├── page.tsx                  # Export management
│   │   │   └── components/
│   │   │       ├── ExportQueue.tsx       # Checks ready for export
│   │   │       ├── QBOAuthButton.tsx     # QuickBooks OAuth
│   │   │       ├── ExportHistory.tsx     # Past exports
│   │   │       ├── CSVDownload.tsx       # CSV generation
│   │   │       └── SyncStatus.tsx        # Sync status indicator
│   │   │
│   │   ├── 📁 settings/                  # Settings pages
│   │   │   ├── page.tsx                  # General settings
│   │   │   ├── integrations/
│   │   │   │   └── page.tsx              # QBO/API settings
│   │   │   └── team/
│   │   │       └── page.tsx              # Team management
│   │   │
│   │   ├── 📁 analytics/                 # Analytics dashboard
│   │   │   ├── page.tsx                  # Analytics overview
│   │   │   └── components/
│   │   │       ├── AccuracyChart.tsx     # Accuracy metrics
│   │   │       ├── ProcessingTimeChart.tsx
│   │   │       ├── ConfidenceDistribution.tsx
│   │   │       └── ExportStats.tsx
│   │   │
│   │   ├── layout.tsx                    # Root layout
│   │   ├── globals.css                   # Global styles
│   │   └── page.tsx                      # Landing page
│   │
│   ├── 📁 components/                    # Shared components
│   │   ├── 📁 ui/                        # UI primitives (shadcn/ui)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   └── progress.tsx
│   │   │
│   │   ├── 📁 layout/
│   │   │   ├── Header.tsx                # App header
│   │   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   │   ├── Footer.tsx                # App footer
│   │   │   └── Breadcrumbs.tsx           # Breadcrumb navigation
│   │   │
│   │   ├── 📁 checks/
│   │   │   ├── CheckCard.tsx             # Check preview card
│   │   │   ├── CheckList.tsx             # List of checks
│   │   │   ├── StatusBadge.tsx           # Status indicator
│   │   │   └── CheckFilters.tsx          # Filter controls
│   │   │
│   │   └── 📁 common/
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── EmptyState.tsx
│   │       └── ConfirmDialog.tsx
│   │
│   ├── 📁 lib/                           # Utility libraries
│   │   ├── 📁 supabase/
│   │   │   ├── client.ts                 # Supabase client (browser)
│   │   │   ├── server.ts                 # Supabase client (server)
│   │   │   └── middleware.ts             # Auth middleware
│   │   │
│   │   ├── 📁 api/                       # API client wrappers
│   │   │   ├── checks.ts                 # Check CRUD operations
│   │   │   ├── processing.ts             # Processing triggers
│   │   │   ├── export.ts                 # Export operations
│   │   │   └── analytics.ts              # Analytics queries
│   │   │
│   │   ├── 📁 hooks/                     # Custom React hooks
│   │   │   ├── useCheckProcessing.ts     # Real-time processing updates
│   │   │   ├── useSupabaseAuth.ts        # Auth state management
│   │   │   ├── useCheckReview.ts         # Review workflow
│   │   │   └── useWebSocket.ts           # WebSocket connection
│   │   │
│   │   ├── 📁 utils/
│   │   │   ├── formatting.ts             # Data formatting
│   │   │   ├── validation.ts             # Client-side validation
│   │   │   ├── constants.ts              # App constants
│   │   │   └── helpers.ts                # Helper functions
│   │   │
│   │   └── 📁 types/
│   │       ├── check.ts                  # Check type definitions
│   │       ├── api.ts                    # API response types
│   │       └── database.ts               # Database types
│   │
│   ├── 📁 pages/api/                     # Next.js API Routes
│   │   │
│   │   ├── 📁 upload/
│   │   │   └── index.ts                  # POST /api/upload
│   │   │                                 # Handles file upload to Supabase Storage
│   │   │
│   │   ├── 📁 process/
│   │   │   ├── [id].ts                   # POST /api/process/:id
│   │   │   │                             # Triggers processing pipeline
│   │   │   └── status.ts                 # GET /api/process/status
│   │   │                                 # WebSocket/SSE for real-time updates
│   │   │
│   │   ├── 📁 checks/
│   │   │   ├── index.ts                  # GET /api/checks (list)
│   │   │   ├── [id].ts                   # GET/PATCH/DELETE /api/checks/:id
│   │   │   └── [id]/
│   │   │       ├── review.ts             # POST /api/checks/:id/review
│   │   │       └── approve.ts            # POST /api/checks/:id/approve
│   │   │
│   │   ├── 📁 export/
│   │   │   ├── qbo.ts                    # POST /api/export/qbo
│   │   │   │                             # QuickBooks API integration
│   │   │   ├── csv.ts                    # POST /api/export/csv
│   │   │   │                             # CSV generation
│   │   │   └── history.ts                # GET /api/export/history
│   │   │
│   │   ├── 📁 qbo/
│   │   │   ├── auth.ts                   # GET /api/qbo/auth (OAuth initiate)
│   │   │   ├── callback.ts               # GET /api/qbo/callback (OAuth callback)
│   │   │   └── disconnect.ts             # POST /api/qbo/disconnect
│   │   │
│   │   ├── 📁 analytics/
│   │   │   ├── accuracy.ts               # GET /api/analytics/accuracy
│   │   │   ├── performance.ts            # GET /api/analytics/performance
│   │   │   └── summary.ts                # GET /api/analytics/summary
│   │   │
│   │   └── 📁 webhooks/
│   │       └── supabase.ts               # POST /api/webhooks/supabase
│   │                                     # Database change notifications
│   │
│   ├── 📁 public/                        # Static assets
│   │   ├── images/
│   │   ├── icons/
│   │   └── fonts/
│   │
│   ├── 📁 styles/                        # Additional styles
│   │   └── themes/
│   │
│   ├── .env.local                        # Environment variables
│   ├── .env.example                      # Example env file
│   ├── next.config.js                    # Next.js configuration
│   ├── tailwind.config.js                # Tailwind CSS config
│   ├── tsconfig.json                     # TypeScript config
│   ├── package.json
│   └── README.md
│
├── 📁 backend/                           # Processing Backend (Node.js/Python)
│   │
│   ├── 📁 src/
│   │   │
│   │   ├── 📁 services/                  # Core processing services
│   │   │   │
│   │   │   ├── 📁 ingestion/
│   │   │   │   ├── fileHandler.ts        # File validation & storage
│   │   │   │   ├── checkCreator.ts       # Create check records
│   │   │   │   └── index.ts              # Service entry point
│   │   │   │
│   │   │   ├── 📁 preprocessing/
│   │   │   │   ├── imageLoader.ts        # Load images from storage
│   │   │   │   ├── grayscale.ts          # Grayscale conversion
│   │   │   │   ├── deskew.ts             # Deskewing algorithm
│   │   │   │   ├── denoise.ts            # Noise reduction
│   │   │   │   ├── contrast.ts           # Contrast normalization
│   │   │   │   ├── threshold.ts          # Adaptive thresholding
│   │   │   │   ├── pipeline.ts           # Full preprocessing pipeline
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── 📁 segmentation/
│   │   │   │   ├── contourDetector.ts    # Detect check boundaries
│   │   │   │   ├── aspectRatioFilter.ts  # Filter by aspect ratio
│   │   │   │   ├── multiCheckSplitter.ts # Split multiple checks
│   │   │   │   ├── regionExtractor.ts    # Extract ROIs
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── 📁 ocr/
│   │   │   │   ├── tesseractEngine.ts    # Tesseract OCR wrapper
│   │   │   │   ├── micrParser.ts         # MICR line parsing
│   │   │   │   ├── regionOCR.ts          # Region-specific OCR
│   │   │   │   ├── fieldExtractor.ts     # Extract fields from text
│   │   │   │   ├── confidenceCalculator.ts # OCR confidence scoring
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── 📁 ai/
│   │   │   │   ├── visionClient.ts       # Google Vision API client
│   │   │   │   ├── documentAnalyzer.ts   # Full document analysis
│   │   │   │   ├── nerExtractor.ts       # Named Entity Recognition
│   │   │   │   ├── handwritingParser.ts  # Handwriting-specific logic
│   │   │   │   ├── contextAnalyzer.ts    # Contextual understanding
│   │   │   │   ├── confidenceCalculator.ts # AI confidence scoring
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── 📁 hybrid/
│   │   │   │   ├── fieldComparator.ts    # Compare OCR vs AI results
│   │   │   │   ├── confidenceSelector.ts # Select best result
│   │   │   │   ├── consensusBuilder.ts   # Build consensus from both
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── 📁 validation/
│   │   │   │   ├── requiredFields.ts     # Check required fields
│   │   │   │   ├── formatValidator.ts    # Validate formats (date, amount)
│   │   │   │   ├── crossFieldValidator.ts # Cross-field consistency
│   │   │   │   ├── duplicateDetector.ts  # Detect duplicates
│   │   │   │   ├── businessRules.ts      # Business logic validation
│   │   │   │   ├── confidenceThreshold.ts # Confidence-based routing
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   ├── 📁 export/
│   │   │   │   ├── quickbooks/
│   │   │   │   │   ├── oauthClient.ts    # QBO OAuth handler
│   │   │   │   │   ├── checkCreator.ts   # Create check in QBO
│   │   │   │   │   ├── duplicateChecker.ts # QBO duplicate detection
│   │   │   │   │   ├── syncManager.ts    # Sync status management
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   ├── csv/
│   │   │   │   │   ├── qboFormatter.ts   # QBO CSV format
│   │   │   │   │   ├── generator.ts      # Generate CSV files
│   │   │   │   │   └── index.ts
│   │   │   │   │
│   │   │   │   └── index.ts
│   │   │   │
│   │   │   └── 📁 orchestration/
│   │   │       ├── processingOrchestrator.ts # Main pipeline controller
│   │   │       ├── stageManager.ts           # Stage transition logic
│   │   │       ├── eventEmitter.ts           # Real-time event emission
│   │   │       └── index.ts
│   │   │
│   │   ├── 📁 models/                    # Data models & schemas
│   │   │   ├── Check.ts                  # Check model
│   │   │   ├── ExtractionResult.ts       # Extraction result model
│   │   │   ├── ProcessingStage.ts        # Processing stage model
│   │   │   └── AuditLog.ts               # Audit log model
│   │   │
│   │   ├── 📁 database/                  # Database utilities
│   │   │   ├── supabaseClient.ts         # Supabase client
│   │   │   ├── queries.ts                # Common queries
│   │   │   └── migrations/               # Manual migrations (if needed)
│   │   │
│   │   ├── 📁 queue/                     # Job queue (optional)
│   │   │   ├── worker.ts                 # Job worker
│   │   │   ├── jobs/
│   │   │   │   ├── processCheck.ts       # Process check job
│   │   │   │   └── exportCheck.ts        # Export check job
│   │   │   └── index.ts
│   │   │
│   │   ├── 📁 utils/
│   │   │   ├── logger.ts                 # Logging utility
│   │   │   ├── errors.ts                 # Error classes
│   │   │   ├── constants.ts              # Constants
│   │   │   └── helpers.ts                # Helper functions
│   │   │
│   │   ├── 📁 types/
│   │   │   ├── processing.ts             # Processing types
│   │   │   ├── extraction.ts             # Extraction types
│   │   │   └── export.ts                 # Export types
│   │   │
│   │   └── index.ts                      # Main entry point
│   │
│   ├── 📁 config/                        # Configuration files
│   │   ├── ocr.config.ts                 # OCR settings
│   │   ├── ai.config.ts                  # AI API settings
│   │   ├── processing.config.ts          # Processing pipeline config
│   │   └── export.config.ts              # Export settings
│   │
│   ├── 📁 scripts/                       # Utility scripts
│   │   ├── test-ocr.ts                   # Test OCR engine
│   │   ├── test-ai.ts                    # Test AI engine
│   │   ├── benchmark.ts                  # Benchmark processing
│   │   └── migrate.ts                    # Run migrations
│   │
│   ├── 📁 tests/
│   │   ├── unit/
│   │   │   ├── preprocessing.test.ts
│   │   │   ├── ocr.test.ts
│   │   │   ├── ai.test.ts
│   │   │   ├── validation.test.ts
│   │   │   └── export.test.ts
│   │   │
│   │   ├── integration/
│   │   │   ├── pipeline.test.ts
│   │   │   └── export.test.ts
│   │   │
│   │   └── fixtures/
│   │       ├── sample-checks/            # Test check images
│   │       └── expected-outputs/         # Expected results
│   │
│   ├── .env                              # Environment variables
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
│
├── 📁 supabase/                          # Supabase Configuration
│   │
│   ├── 📁 migrations/
│   │   ├── 20260101000000_create_tenants.sql
│   │   ├── 20260101000001_create_checks.sql
│   │   ├── 20260101000002_create_audit_logs.sql
│   │   ├── 20260101000003_create_processing_stages.sql
│   │   ├── 20260101000004_create_export_history.sql
│   │   ├── 20260101000005_add_rls_policies.sql
│   │   ├── 20260101000006_create_indexes.sql
│   │   └── 20260101000007_create_functions.sql
│   │
│   ├── 📁 functions/                     # Edge Functions (optional)
│   │   ├── process-check/
│   │   │   └── index.ts                  # Trigger processing
│   │   └── export-check/
│   │       └── index.ts                  # Trigger export
│   │
│   ├── 📁 seed/
│   │   └── seed.sql                      # Sample data
│   │
│   └── config.toml                       # Supabase project config
│
├── 📁 docs/                              # Documentation
│   ├── API.md                            # API documentation
│   ├── ARCHITECTURE.md                   # System architecture
│   ├── DEPLOYMENT.md                     # Deployment guide
│   ├── DEVELOPMENT.md                    # Development setup
│   ├── PROCESSING_PIPELINE.md            # Pipeline details
│   ├── INTEGRATION.md                    # QBO integration guide
│   └── TROUBLESHOOTING.md                # Common issues
│
├── 📁 scripts/                           # Project-wide scripts
│   ├── setup.sh                          # Initial setup
│   ├── dev.sh                            # Start dev environment
│   ├── deploy.sh                         # Deployment script
│   └── test.sh                           # Run all tests
│
├── 📁 docker/                            # Docker configuration
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── docker-compose.yml
│
├── .gitignore
├── .env.example
├── README.md
├── LICENSE
└── package.json                          # Monorepo root (if using workspaces)