# QuickBooks Comparisons Module

## Overview
Advanced comparison system for matching QuickBooks data with cheque extractions, featuring intelligent matching algorithms, comprehensive filtering, and detailed analytics.

## Architecture

### Directory Structure
```
qb-comparisons/
├── components/           # UI Components
│   ├── ComparisonControlsBar.tsx    # Search, filters, and action buttons
│   ├── ComparisonTable.tsx          # Main data table with sorting
│   ├── StatisticsPanel.tsx          # Summary statistics cards
│   ├── DetailModal.tsx              # Detailed comparison view
│   ├── ColumnSettings.tsx           # Column visibility settings
│   └── Pagination.tsx               # Pagination controls
├── hooks/               # Custom React hooks
│   ├── useComparisonData.ts         # Data fetching and management
│   └── useComparisonState.ts        # UI state management
├── utils/               # Utility functions
│   ├── comparisonUtils.ts           # Matching and filtering logic
│   └── exportUtils.ts               # CSV/Excel export functions
├── page.tsx             # Main page component
├── page.old.tsx         # Backup of original implementation
└── README.md            # This file
```

## Features

### 1. Intelligent Matching
- **Exact Match**: Check number-based matching with 40% weight
- **Amount Verification**: Amount comparison with 30% weight
- **Payee Matching**: Fuzzy payee name matching with 20% weight
- **Date Validation**: Date matching with 10% weight
- **Confidence Scoring**: 0-100% confidence score for each match

### 2. Advanced Filtering
- **Text Search**: Search across all fields (check #, payee, amount, date, memo)
- **Date Range**: Filter by start and end dates
- **QB Source**: Filter by QuickBooks data source
- **Status Filter**: Filter by match status (matched, mismatched, missing)
- **Reset Filters**: Quick reset to default view

### 3. Data Visualization
- **Statistics Panel**: Real-time counts for all match statuses
- **Color-Coded Status**: Visual indicators for match quality
- **Discrepancy Highlighting**: Clear display of data mismatches

### 4. Table Features
- **Sortable Columns**: Click headers to sort by any field
- **Column Visibility**: Show/hide columns as needed
- **Sticky Headers**: Headers remain visible while scrolling
- **Pagination**: Configurable items per page (25/50/100/200)
- **Totals Row**: Summary totals at table bottom

### 5. Export Capabilities
- **CSV Export**: Export filtered data to CSV
- **Excel Export**: Export filtered data to Excel (.xls)
- **Respects Filters**: Only exports visible/filtered data
- **Column Selection**: Only exports visible columns

### 6. Detail View
- **Side-by-Side Comparison**: Extraction vs QuickBooks data
- **Discrepancy List**: Detailed list of mismatches
- **Check Image**: View original check image (if available)
- **Confidence Score**: Visual confidence indicator

## Usage

### Basic Workflow
1. **Upload QB Data**: Click "Upload QB Data" to import QuickBooks entries
2. **Review Statistics**: Check the statistics panel for overview
3. **Filter Data**: Use filters to focus on specific records
4. **Sort & Analyze**: Click column headers to sort data
5. **View Details**: Click any row to see detailed comparison
6. **Export Results**: Export filtered data for reporting

### Keyboard Shortcuts
- `Esc`: Close modals
- Click row: Open detail view
- Click column header: Sort by that column

## Data Flow

```
1. Data Fetching (useComparisonData)
   ├── Fetch job extractions from /api/jobs
   ├── Fetch QB entries from /api/quickbooks/entries
   └── Extract unique QB sources

2. Data Processing (comparisonUtils)
   ├── Intelligent matching algorithm
   ├── Calculate confidence scores
   ├── Identify discrepancies
   └── Categorize match status

3. Filtering & Sorting
   ├── Apply search query
   ├── Apply status filter
   ├── Apply date range filter
   ├── Apply QB source filter
   └── Sort by selected field

4. Display & Interaction
   ├── Render statistics panel
   ├── Render filtered table
   ├── Handle user interactions
   └── Export data
```

## Match Status Types

### Matched
- Check numbers match exactly
- All fields align within tolerance
- Green indicator

### Mismatch
- Check numbers match
- One or more fields differ (amount, date, payee)
- Amber indicator with discrepancy details

### Missing in QB
- Extraction exists but no matching QB entry
- Blue indicator

### Missing in Extraction
- QB entry exists but no matching extraction
- Red indicator

## API Endpoints

### GET /api/jobs
Fetches all job data with check extractions
```typescript
Response: {
  jobs: Array<{
    job_id: string;
    status: string;
    pdf_name: string;
    checks: Array<CheckExtraction>;
  }>
}
```

### GET /api/quickbooks/entries
Fetches QuickBooks entries
```typescript
Response: {
  entries: Array<{
    id: string;
    check_number: string;
    date: string;
    amount: string;
    payee: string;
    account: string;
    memo: string;
    qb_source?: string;
  }>
}
```

### POST /api/quickbooks/upload
Uploads QuickBooks data file
```typescript
Request: FormData with 'file' field
Response: {
  entries_count: number;
  message: string;
}
```

## Customization

### Adding New Columns
1. Update `VisibleColumns` interface in `useComparisonState.ts`
2. Add column to `ComparisonTable.tsx` header and body
3. Add column to `ColumnSettings.tsx` list
4. Update export functions in `exportUtils.ts`

### Modifying Match Algorithm
Edit `calculateMatchConfidence()` in `comparisonUtils.ts`:
- Adjust weight percentages
- Add new matching criteria
- Modify tolerance levels

### Styling
- Table colors: Modify gradient classes in `ComparisonTable.tsx`
- Status badges: Update `StatusBadge` component
- Statistics cards: Modify `StatisticsPanel.tsx`

## Performance Considerations

- **Memoization**: All computed data is memoized to prevent unnecessary recalculations
- **Pagination**: Large datasets are paginated for optimal rendering
- **Lazy Loading**: Detail modal only renders when opened
- **Efficient Filtering**: Filters applied in optimal order (most restrictive first)

## Troubleshooting

### No Data Showing
- Check API endpoints are accessible
- Verify job status is 'complete'
- Ensure extractions have valid data

### Matching Issues
- Review confidence score thresholds
- Check data format consistency
- Verify check number formats match

### Export Problems
- Ensure browser allows downloads
- Check data is not empty
- Verify column visibility settings

## Future Enhancements

- [ ] Manual match override
- [ ] Batch operations
- [ ] Advanced analytics dashboard
- [ ] Custom matching rules
- [ ] Historical comparison tracking
- [ ] Integration with accounting systems
- [ ] Real-time collaboration features
