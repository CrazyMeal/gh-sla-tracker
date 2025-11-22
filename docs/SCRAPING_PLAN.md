# GitHub Status History Scraping Implementation Plan

## Executive Summary
Implement ethical web scraping of https://www.githubstatus.com/history to collect historical incident data beyond the API's 50-incident limitation. This is a one-time/occasional operation to bootstrap historical data, not a regular automated process.

---

## Page Structure Analysis (User-Provided)

### History Page Layout
- **URL Pattern**: `https://www.githubstatus.com/history?page={N}`
- **Display**: 3 months per page
- **Navigation**: Previous/Next buttons modify `?page` parameter
- **Rendering**: Server-side rendered or static generation (no hidden API)

### Incident Display Pattern
- **Default View**: Last 3 incidents per month shown
- **Expansion**: "Show All x Incidents" button reveals complete list
- **Links**: Each incident title links to `/incidents/{incident_id}`

### Individual Incident Pages
- **URL Pattern**: `https://www.githubstatus.com/incidents/{incident_id}`
- **Example**: `https://www.githubstatus.com/incidents/67vdd3b7d1zq`
- **Content**: Full incident details, updates, affected components, timeline

---

## Scraping Architecture

### Technology Stack
- **Playwright** - Headless browser automation
- **Node.js** - Execution environment
- **Cheerio** - HTML parsing (if needed for static content)
- **TypeScript** - Type safety

### Ethical Scraping Principles
1. **Rate Limiting**: Minimum 2-3 second delay between requests
2. **Respect robots.txt**: Check and comply with GitHub's robots.txt
3. **User-Agent**: Identify as research/personal project
4. **No Automation**: Manual or occasional execution, not scheduled
5. **Minimal Load**: Only fetch what's necessary, cache results
6. **Session Limits**: Limit to reasonable number of pages per session

### Architecture Components

```
scripts/
├── scrape-github-history.js      # Main scraper orchestrator
├── parsers/
│   ├── history-page-parser.js    # Parse history list page
│   └── incident-page-parser.js   # Parse individual incident pages
└── utils/
    ├── rate-limiter.js            # Implement delays and throttling
    ├── data-merger.js             # Merge scraped data with existing
    └── playwright-helpers.js      # Browser automation utilities
```

---

## MVP Implementation Scope

### Phase 1: Single Page Scraper (MVP)
**Goal**: Scrape 1 history page and its incidents

#### Step 1: History Page Scraping
**Input**: `https://www.githubstatus.com/history?page=1` (or specified page)
**Actions**:
1. Navigate to history page
2. Click "Show All x Incidents" for each of the 3 months
3. Extract incident IDs and basic metadata from expanded lists
4. Collect incident links

**Expected Data**:
```javascript
{
  page: 1,
  months: [
    {
      name: "November 2025",
      incidents: [
        {
          id: "67vdd3b7d1zq",
          title: "Incident Title",
          url: "https://www.githubstatus.com/incidents/67vdd3b7d1zq",
          impact: "minor",
          date: "2025-11-15"
        },
        // ... more incidents
      ]
    },
    // ... 2 more months
  ],
  totalIncidents: 24 // example count
}
```

#### Step 2: Incident Detail Scraping
**Input**: List of incident URLs from Step 1
**Actions**:
1. For each incident URL:
   - Navigate to incident page
   - Extract full incident details (match API schema)
   - Parse incident updates timeline
   - Extract affected components
   - Collect timestamps (created, updated, resolved)
   - Wait 2-3 seconds before next request

**Expected Data**: Same format as API incidents
```javascript
{
  id: "67vdd3b7d1zq",
  name: "Incident Title",
  status: "resolved",
  impact: "minor",
  created_at: "2025-11-15T14:23:00Z",
  updated_at: "2025-11-15T16:45:00Z",
  resolved_at: "2025-11-15T16:45:00Z",
  started_at: "2025-11-15T14:23:00Z",
  incident_updates: [
    {
      id: "update_1",
      status: "investigating",
      body: "Update text...",
      created_at: "2025-11-15T14:23:00Z"
    }
    // ... more updates
  ],
  components: [
    {
      code: "git_operations",
      name: "Git Operations",
      old_status: "operational",
      new_status: "degraded_performance"
    }
  ]
}
```

#### Step 3: Data Merging
**Actions**:
1. Load existing `incidents-archive.json`
2. Merge scraped incidents (deduplicate by ID)
3. Keep most recent `updated_at` version if duplicates
4. Sort by `created_at` descending
5. Save updated archive

**Output**: Updated `src/data/incidents-archive.json`

---

## Implementation Strategy

### MVP Script Structure

```javascript
// scripts/scrape-github-history.js

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const CONFIG = {
  BASE_URL: 'https://www.githubstatus.com',
  RATE_LIMIT_MS: 2500, // 2.5 seconds between requests
  TIMEOUT_MS: 30000,   // 30 second page load timeout
  USER_AGENT: 'Mozilla/5.0 (Educational/Personal GitHub SLA Tracker)',
};

async function scrapeHistoryPage(page, pageNumber = 1) {
  // Navigate to history page
  await page.goto(`${CONFIG.BASE_URL}/history?page=${pageNumber}`);

  // Click "Show All" buttons for each month
  const showAllButtons = await page.locator('text="Show All"').all();
  for (const button of showAllButtons) {
    await button.click();
    await page.waitForTimeout(1000); // Wait for expansion
  }

  // Extract incident links
  const incidentLinks = await page.locator('a[href^="/incidents/"]').evaluateAll(
    links => links.map(link => ({
      id: link.href.split('/').pop(),
      url: link.href,
      title: link.textContent.trim(),
    }))
  );

  return incidentLinks;
}

async function scrapeIncidentDetail(page, incidentUrl) {
  await page.goto(incidentUrl);
  await page.waitForTimeout(CONFIG.RATE_LIMIT_MS);

  // Extract incident data matching API schema
  const incidentData = await page.evaluate(() => {
    // DOM parsing logic here
    // Extract: status, impact, dates, updates, components
    return {
      // ... parsed data
    };
  });

  return incidentData;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: CONFIG.USER_AGENT,
  });

  try {
    // Step 1: Scrape history page
    console.log('Scraping history page 1...');
    const incidentLinks = await scrapeHistoryPage(page, 1);
    console.log(`Found ${incidentLinks.length} incidents`);

    // Step 2: Scrape each incident
    const incidents = [];
    for (let i = 0; i < incidentLinks.length; i++) {
      console.log(`Scraping incident ${i + 1}/${incidentLinks.length}: ${incidentLinks[i].id}`);
      const incidentData = await scrapeIncidentDetail(page, incidentLinks[i].url);
      incidents.push(incidentData);
    }

    // Step 3: Merge with existing data
    const archivePath = path.join(__dirname, '../src/data/incidents-archive.json');
    const existingData = JSON.parse(await fs.readFile(archivePath, 'utf-8'));
    const merged = mergeIncidents(incidents, existingData);

    // Save
    await fs.writeFile(archivePath, JSON.stringify(merged, null, 2));
    console.log(`Saved ${merged.length} total incidents`);

  } finally {
    await browser.close();
  }
}

function mergeIncidents(newIncidents, existingIncidents) {
  const combined = [...newIncidents, ...existingIncidents];
  const uniqueMap = new Map();

  combined.forEach(incident => {
    if (!uniqueMap.has(incident.id)) {
      uniqueMap.set(incident.id, incident);
    } else {
      const existing = uniqueMap.get(incident.id);
      if (new Date(incident.updated_at) > new Date(existing.updated_at)) {
        uniqueMap.set(incident.id, incident);
      }
    }
  });

  const merged = Array.from(uniqueMap.values());
  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return merged;
}

main().catch(console.error);
```

### Data Parsing Strategy

#### History Page Parsing
Potential selectors (to be validated):
- Month headers: `.month-header`, `.month-name`
- Incident list: `.incident-list`, `.incident-item`
- Incident links: `a[href^="/incidents/"]`
- Impact indicators: `.impact-indicator`, `.badge-*`
- Date elements: `time`, `.date`, `.timestamp`

#### Incident Page Parsing
Potential selectors (to be validated):
- Title: `h1`, `.incident-title`
- Status: `.status`, `.incident-status`
- Impact: `.impact`, `.severity`
- Timestamps: `time[datetime]`, `.timestamp`
- Updates: `.incident-update`, `.update-entry`
- Components: `.component`, `.affected-component`
- Update timeline: `.timeline`, `.updates-list`

**Note**: Actual selectors must be discovered during implementation by inspecting the live page HTML.

---

## Data Storage & Merging Strategy

### File Structure
```
src/data/
├── incidents-archive.json       # Main archive (merged API + scraped)
├── scraping-metadata.json       # Track scraping progress
└── backups/
    └── incidents-archive-{timestamp}.json  # Backup before merge
```

### Scraping Metadata Schema
```javascript
{
  "lastScrapedPage": 1,
  "lastScrapedDate": "2025-11-21T10:30:00Z",
  "totalScrapedIncidents": 78,
  "scrapingSessions": [
    {
      "date": "2025-11-21T10:30:00Z",
      "page": 1,
      "incidentsFound": 24,
      "incidentsAdded": 18,
      "duration": "45s"
    }
  ]
}
```

### Deduplication Logic
1. **Primary Key**: `incident.id`
2. **Conflict Resolution**: Keep entry with most recent `updated_at`
3. **Validation**: Ensure scraped data matches API schema
4. **Backup**: Create timestamped backup before merging

---

## Implementation Roadmap

### Phase 1: MVP Development (1-2 hours)
- [ ] Create `scripts/scrape-github-history.js`
- [ ] Implement basic Playwright navigation
- [ ] Parse history page to extract incident links
- [ ] Implement rate limiting (2.5s between requests)
- [ ] Test scraping 1 page manually

### Phase 2: Incident Detail Parsing (2-3 hours)
- [ ] Inspect incident page HTML structure
- [ ] Create parser for incident details
- [ ] Map scraped data to API schema format
- [ ] Validate data completeness
- [ ] Handle edge cases (ongoing incidents, missing fields)

### Phase 3: Data Integration (1 hour)
- [ ] Implement merge logic
- [ ] Add backup mechanism
- [ ] Update `fetch-github-data.js` to respect scraped data
- [ ] Test full pipeline with MVP data

### Phase 4: Testing & Validation (1 hour)
- [ ] Compare scraped incidents with API format
- [ ] Verify SLA calculations work with scraped data
- [ ] Check date formatting consistency
- [ ] Validate component mapping
- [ ] Test UI display with new incidents

### Phase 5: Documentation & Usage (30 minutes)
- [ ] Document scraping script usage
- [ ] Add npm script for manual execution
- [ ] Create troubleshooting guide
- [ ] Update CLAUDE.md with scraping details

---

## Future Enhancements (Post-MVP)

### Multi-Page Scraping
- Accept page range parameter: `--pages 1-5`
- Track progress across multiple pages
- Resume capability for interrupted sessions
- Aggregate statistics across all scraped pages

### Enhanced Error Handling
- Retry failed incident fetches
- Log skipped/failed incidents
- Validate data before merging
- Alert on schema mismatches

### Incremental Updates
- Smart detection of new incidents since last scrape
- Only fetch incident detail pages for new IDs
- Efficient diff-based merging

### Data Quality Checks
- Validate required fields are present
- Check date format consistency
- Ensure component names match known list
- Flag suspicious data for manual review

---

## Risks & Mitigation

### Risk 1: Page Structure Changes
**Impact**: High - Scraper breaks if GitHub changes HTML
**Mitigation**:
- Use flexible selectors where possible
- Add validation checks for expected elements
- Log warnings when structure differs
- Manual review after GitHub Status updates

### Risk 2: Rate Limiting / Blocking
**Impact**: Medium - GitHub might block aggressive scraping
**Mitigation**:
- Generous rate limiting (2.5s between requests)
- User-Agent identification
- Manual execution only
- Respect robots.txt

### Risk 3: Data Format Inconsistencies
**Impact**: Medium - Scraped data might not perfectly match API
**Mitigation**:
- Strict schema validation
- Data normalization layer
- Compare scraped vs API samples
- Manual spot-checks

### Risk 4: Incomplete Data
**Impact**: Low - Some fields might be missing from web pages
**Mitigation**:
- Mark optional fields in schema
- Use fallback values where reasonable
- Log missing data for manual investigation
- Accept incomplete records if core fields present

---

## Success Metrics

### MVP Success Criteria
- [ ] Successfully scrape 1 history page (3 months of data)
- [ ] Extract incident IDs from all expanded month views
- [ ] Fetch detailed data for all incidents on that page
- [ ] Merge with existing archive without duplicates
- [ ] Display correctly in UI with proper SLA calculations
- [ ] No errors or crashes during execution

### Data Quality Metrics
- **Completeness**: >95% of incidents have all required fields
- **Accuracy**: Scraped dates match visible page data
- **Consistency**: Component names match API components list
- **Deduplication**: Zero duplicate incident IDs in final archive

---

## Execution Plan

### Manual Execution Workflow
```bash
# 1. Install Playwright browsers (one-time)
npx playwright install chromium

# 2. Run MVP scraper (manual execution)
npm run scrape-history

# 3. Verify results
npm run fetch-data  # This will merge API + scraped data
npm run build:cached  # Build with combined data
npm run preview  # Check UI

# 4. Commit new data
git add src/data/incidents-archive.json
git commit -m "chore: add historical incidents from scraping"
```

### Package.json Script
```json
{
  "scripts": {
    "scrape-history": "node scripts/scrape-github-history.js",
    "scrape-history:page": "node scripts/scrape-github-history.js --page"
  }
}
```

---

## Timeline Estimate

- **Planning & Setup**: 30 minutes (COMPLETE)
- **MVP Implementation**: 2-3 hours
- **Testing & Debugging**: 1-2 hours
- **Documentation**: 30 minutes

**Total MVP Timeline**: 4-6 hours of development work

---

## Next Steps

1. **Install Playwright** (if not already done)
2. **Inspect Live Page** - View HTML structure to confirm selectors
3. **Implement MVP Script** - Start with history page scraping
4. **Test with 1 Page** - Validate entire pipeline works
5. **Iterate** - Refine parsing based on actual HTML structure

---

**Last Updated**: 2025-11-21
**Status**: Planning Complete - Ready for Implementation
**Owner**: crazynix
**Estimated Effort**: 4-6 hours
