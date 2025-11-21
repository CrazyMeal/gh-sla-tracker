# GitHub SLA Tracker

## Project Overview

A static site built with Astro 5 that tracks GitHub's Service Level Agreement (SLA) compliance by analyzing historical incident data from the GitHub Status API. The tracker calculates uptime percentages per calendar quarter and identifies potential SLA violations.

### Goals
- Monitor GitHub's 99.9% uptime commitment across all service features
- Analyze historical incident data by calendar quarter
- Identify SLA violations and calculate potential service credits
- Provide filterable views by date, quarter, and service component
- Generate static, fast-loading reports with no backend required

---

## GitHub SLA Requirements

Based on the official GitHub Online Services SLA (Version: June 2021):

### Uptime Guarantee
- **Target**: 99.9% uptime per calendar quarter
- **Calculation**: `(total minutes in quarter - Downtime) / total minutes in quarter`

### Service Features Covered
1. **Issues**
2. **Pull Requests**
3. **Git Operations**
4. **API Requests**
5. **Webhooks**
6. **Pages**
7. **Actions**
8. **Packages**

### Downtime Definition
Downtime occurs when either:
- Error rate exceeds 5% in a given minute for any Service Feature, OR
- Service is unavailable as determined by GitHub's internal and external monitoring systems

### Service Credits
- **10% refund**: Uptime ≤99.9% but >99.0%
- **25% refund**: Uptime <99.0%

### Exclusions
Not counted as downtime:
- Customer acts, omissions, or misuse
- Customer's internet connectivity failures
- Force majeure events
- Customer's equipment, services, or technology issues

---

## GitHub Status API

### Base URL
`https://www.githubstatus.com/api/v2/`

### Key Endpoints
- `/summary.json` - Overall status snapshot
- `/components.json` - All 11 GitHub service components
- `/incidents.json` - **50 most recent incidents** (all states)
- `/incidents/unresolved.json` - Active incidents only
- `/scheduled-maintenances.json` - Maintenance windows

### Critical Limitation: 50-Incident Cap
The API only returns the 50 most recent incidents. For comprehensive historical analysis:
- **Solution**: Implement incremental data collection
- **Strategy**: Fetch and merge data regularly (daily/weekly) to build historical archive
- **Storage**: Maintain `src/data/incidents-archive.json` with accumulated incidents

### GitHub Service Components (11 total)
1. Git Operations
2. Webhooks
3. Status Page Link
4. API Requests
5. Issues
6. Pull Requests
7. Actions
8. Packages
9. Pages
10. Codespaces
11. Copilot

### Incident Data Structure
```typescript
interface Incident {
  id: string;
  name: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'postmortem';
  impact: 'none' | 'minor' | 'major' | 'critical';
  created_at: string;      // ISO 8601
  updated_at: string;
  resolved_at: string | null;
  started_at: string;
  incident_updates: IncidentUpdate[];
  components: ComponentStatus[];
}
```

---

## Technical Architecture

### Tech Stack
- **Astro 5.16.0** - Static site generator
- **TypeScript** - Type safety
- **Vanilla JavaScript** - Client-side interactivity (no React/Vue)
- **Web Components** - Reusable interactive elements
- **View Transitions API** - Smooth navigation

### Key Design Decisions

#### 1. Static Site Generation
- All data fetched at build time via top-level `await` in Astro components
- No runtime API calls = fast, reliable, cacheable
- Deploy anywhere (Netlify, Vercel, GitHub Pages)

#### 2. Content Layer API
```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';

const incidents = defineCollection({
  loader: file("src/data/incidents-archive.json"),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    // ...
  })
});
```

Benefits:
- 5x faster builds vs traditional approaches
- Type-safe data access
- Automatic schema validation

#### 3. No Framework Required
- Use `<script>` tags in Astro components for interactivity
- Web Components for reusable logic
- Keeps bundle size minimal

#### 4. Client-Side Filtering
- Pre-render all data as HTML
- Filter in browser with vanilla JS
- Instant UX without API calls

---

## Project Structure

```
gh-sla-tracker/
├── CLAUDE.md                      # This file
├── README.md                      # User-facing documentation
├── package.json
├── astro.config.mjs
├── tsconfig.json
│
├── scripts/
│   └── fetch-github-data.js       # Build-time data fetcher
│
├── src/
│   ├── components/
│   │   ├── IncidentCard.astro     # Display individual incidents
│   │   ├── ComponentStatus.astro  # Per-component SLA metrics
│   │   ├── QuarterFilter.astro    # Date/quarter filtering UI
│   │   └── SLAChart.astro         # Visual uptime representation
│   │
│   ├── content/
│   │   └── config.ts              # Content collections schema
│   │
│   ├── data/
│   │   └── incidents-archive.json # Historical incident data
│   │
│   ├── layouts/
│   │   └── Layout.astro           # Base HTML layout
│   │
│   ├── lib/
│   │   ├── sla-calculator.ts      # SLA computation logic
│   │   ├── date-utils.ts          # Quarter/date helpers
│   │   └── github-api.ts          # API client
│   │
│   ├── pages/
│   │   ├── index.astro            # Dashboard overview
│   │   ├── [quarter].astro        # Dynamic routes per quarter
│   │   └── api/
│   │       └── incidents.json.ts  # Static JSON endpoint
│   │
│   └── styles/
│       └── global.css
│
├── public/
│   └── favicon.svg
│
└── resources/
    └── SLA.pdf                    # GitHub SLA document
```

---

## Development Workflow

### Initial Setup
```bash
npm install
```

### Data Fetching
```bash
npm run fetch-data    # Fetch latest incident data
```

### Development
```bash
npm run dev           # Start dev server (http://localhost:4321)
```

### Production Build
```bash
npm run build         # Fetch data + build site
npm run preview       # Preview production build
```

### Build Scripts
```json
{
  "scripts": {
    "fetch-data": "node scripts/fetch-github-data.js",
    "build": "npm run fetch-data && astro build",
    "build:cached": "astro build"
  }
}
```

---

## SLA Calculation Methodology

### Quarterly Uptime Calculation

```typescript
function calculateComponentSLA(
  incidents: Incident[],
  componentName: string,
  startDate: Date,
  endDate: Date
) {
  // 1. Filter incidents affecting this component within date range
  const relevantIncidents = incidents.filter(incident =>
    incident.components.some(c => c.name === componentName) &&
    new Date(incident.created_at) >= startDate &&
    new Date(incident.created_at) <= endDate
  );

  // 2. Calculate total downtime in minutes
  let totalDowntimeMinutes = 0;

  for (const incident of relevantIncidents) {
    const startTime = new Date(incident.started_at || incident.created_at);
    const endTime = incident.resolved_at
      ? new Date(incident.resolved_at)
      : new Date(); // Ongoing incident

    const durationMinutes = (endTime - startTime) / (1000 * 60);

    // Weight by impact level
    const impactMultiplier = {
      'none': 0,
      'minor': 0.25,
      'major': 0.75,
      'critical': 1.0
    }[incident.impact] || 0.5;

    totalDowntimeMinutes += durationMinutes * impactMultiplier;
  }

  // 3. Calculate total period in minutes
  const totalMinutes = (endDate - startDate) / (1000 * 60);

  // 4. Calculate uptime percentage
  const uptimePercentage = ((totalMinutes - totalDowntimeMinutes) / totalMinutes) * 100;

  return {
    componentName,
    uptimePercentage: parseFloat(uptimePercentage.toFixed(4)),
    totalDowntimeMinutes: Math.round(totalDowntimeMinutes),
    incidentCount: relevantIncidents.length,
    slaViolation: uptimePercentage < 99.9
  };
}
```

### Quarter Definitions
- **Q1**: January 1 - March 31
- **Q2**: April 1 - June 30
- **Q3**: July 1 - September 30
- **Q4**: October 1 - December 31

### Impact Weighting
The calculation applies impact weighting to better reflect service degradation:
- **None**: 0% (no downtime counted)
- **Minor**: 25% (partial degradation)
- **Major**: 75% (significant issues)
- **Critical**: 100% (complete outage)

This provides a more nuanced view than binary up/down states.

---

## Implementation Phases

### Phase 0: Documentation ✓
- Create `CLAUDE.md` (this file)
- Document architecture, SLA requirements, and methodology

### Phase 1: Data Collection Infrastructure
1. Create `scripts/fetch-github-data.js`
   - Fetch from GitHub Status API
   - Implement caching (1-hour TTL)
   - Incremental accumulation for historical data
   - Save to `src/data/incidents-archive.json`

2. Update `package.json`
   - Add `fetch-data` script
   - Configure `build` to fetch data first

### Phase 2: Type-Safe Data Layer
1. Configure Content Collections (`src/content/config.ts`)
   - Define Zod schema for incidents
   - Use `file()` loader
   - Create TypeScript interfaces

2. Create utility libraries
   - `sla-calculator.ts`: Uptime calculations
   - `date-utils.ts`: Quarter helpers
   - `github-api.ts`: Type-safe API client

### Phase 3: Core Pages
1. Main dashboard (`src/pages/index.astro`)
   - Overview of all quarters
   - Summary cards per component
   - SLA violation indicators

2. Quarter detail view (`src/pages/[quarter].astro`)
   - Component-by-component breakdown
   - Incident list with details

3. Reusable components
   - `IncidentCard.astro`
   - `ComponentStatus.astro`
   - `QuarterFilter.astro`
   - `SLAChart.astro`

### Phase 4: Interactivity
1. Client-side filtering (vanilla JS)
   - Filter by quarter
   - Filter by component
   - Filter by impact level

2. View Transitions
   - Enable Astro's View Transitions
   - Smooth page navigation

3. Interactive features
   - Expandable incident details
   - Sortable tables
   - Search functionality

### Phase 5: Analytics & Export
1. SLA violation detection
   - Flag components with <99.9% uptime
   - Calculate potential service credits

2. Data export
   - Static JSON endpoints
   - Downloadable reports

---

## Key Features

### 1. Quarterly SLA Dashboard
- Visual overview of all quarters
- Color-coded SLA status (green = pass, red = fail)
- Quick stats: uptime %, incident count, downtime minutes

### 2. Component-Level Tracking
- Individual SLA metrics for each of the 8 service features
- Trend analysis across quarters
- Identify problematic components

### 3. Incident Explorer
- Filterable, searchable incident list
- Details: impact, duration, affected components, timeline
- Incident updates and resolution history

### 4. Date Range Filtering
- Filter by calendar quarter
- Custom date range selection
- Component-specific filtering

### 5. SLA Violation Alerts
- Highlight quarters with <99.9% uptime
- Calculate service credit eligibility (10% or 25%)
- Export violation reports

---

## Performance Optimizations

### 1. Build-Time Data Fetching
- No runtime API calls = instant page loads
- CDN-friendly static assets

### 2. Content Layer Benefits
- 5x faster builds
- 25-50% less memory usage
- Efficient data processing

### 3. Client-Side Filtering
- Pre-rendered HTML for all data
- Instant filtering without network requests
- Responsive UX

### 4. Memory Configuration
For large datasets:
```json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' astro build"
  }
}
```

### 5. Data Splitting
Split by quarter for better performance:
```
src/data/
  ├── 2024-Q1.json
  ├── 2024-Q2.json
  └── 2024-Q3.json
```

---

## Future Enhancements

### Advanced Analytics
- Trend analysis and predictions
- Component reliability scoring
- Mean time to resolution (MTTR) metrics

### Notifications
- Email alerts for SLA violations
- RSS feed for new incidents

### Comparison Views
- Compare quarters year-over-year
- Benchmark against industry standards

### Enhanced Visualizations
- Interactive charts (Chart.js, D3.js)
- Heatmaps for downtime patterns
- Timeline views

### API Integration
- Automated weekly data collection via GitHub Actions
- Incremental builds with fresh data

---

## Troubleshooting

### Issue: Missing Historical Data
**Cause**: API only returns 50 most recent incidents
**Solution**: Run `fetch-data` script regularly to accumulate history

### Issue: Build Memory Errors
**Cause**: Large dataset exceeds Node.js memory limit
**Solution**: Increase memory with `NODE_OPTIONS='--max-old-space-size=4096'`

### Issue: Incorrect SLA Calculations
**Cause**: Timezone mismatches or missing resolved_at timestamps
**Solution**: Normalize all dates to UTC, handle ongoing incidents

---

## Resources

### Official Documentation
- [GitHub SLA PDF](./resources/SLA.pdf)
- [GitHub Status API](https://www.githubstatus.com/api)
- [Astro 5 Documentation](https://docs.astro.build/)

### API Endpoints
- Summary: `https://www.githubstatus.com/api/v2/summary.json`
- Components: `https://www.githubstatus.com/api/v2/components.json`
- Incidents: `https://www.githubstatus.com/api/v2/incidents.json`

---

## License & Disclaimer

This is an unofficial tracker for educational purposes. GitHub's actual SLA compliance is determined by their internal monitoring systems. This tracker provides estimates based on publicly available incident data.

For official SLA claims and service credits, customers must contact GitHub Support within 30 days of the end of the calendar quarter.

---

**Last Updated**: 2025-11-20
**Astro Version**: 5.16.0
**SLA Document Version**: June 2021
