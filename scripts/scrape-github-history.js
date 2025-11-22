import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  BASE_URL: 'https://www.githubstatus.com',
  RATE_LIMIT_MS: 2500, // 2.5 seconds between incident detail fetches
  TIMEOUT_MS: 30000,
  USER_AGENT: 'Mozilla/5.0 (GitHub SLA Tracker - Educational/Personal Project)',
  DEFAULT_PAGE: 1, // Start with first page (most recent 3 months)
};

/**
 * Parse date string from GitHub Status format to ISO 8601
 * Examples:
 *   "Nov 19, 16:13 - Nov 21, 00:22 UTC" (history page)
 *   "Nov 19, 2025 - 18:07 UTC" (detail page)
 */
function parseGitHubDate(dateStr, defaultYear = new Date().getFullYear()) {
  if (!dateStr) return null;

  // Extract timestamp from detail page format: "Nov 19, 2025 - 18:07 UTC"
  const detailMatch = dateStr.match(/(\w+)\s+(\d+),\s+(\d{4})\s+-\s+(\d+):(\d+)\s+UTC/);
  if (detailMatch) {
    const [, month, day, year, hour, minute] = detailMatch;
    const date = new Date(`${month} ${day}, ${year} ${hour}:${minute} UTC`);
    return date.toISOString();
  }

  // Extract timestamp from history page format: "Nov 19, 16:13 UTC"
  const historyMatch = dateStr.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)\s+UTC/);
  if (historyMatch) {
    const [, month, day, hour, minute] = historyMatch;
    const date = new Date(`${month} ${day}, ${defaultYear} ${hour}:${minute} UTC`);
    return date.toISOString();
  }

  return null;
}

/**
 * Extract component names from the component text
 * Example: "This incident affected: Actions, Packages." -> ["Actions", "Packages"]
 */
function parseComponents(componentText) {
  if (!componentText) return [];

  const match = componentText.match(/This incident affected:\s*(.+)\./);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(c => c.trim())
    .filter(c => c.length > 0);
}

/**
 * Scrape the history page to get list of incident IDs and basic info
 */
async function scrapeHistoryPage(page, pageNumber = 1) {
  console.log(`\n📄 Scraping history page ${pageNumber}...`);

  const url = pageNumber === 1
    ? `${CONFIG.BASE_URL}/history`
    : `${CONFIG.BASE_URL}/history?page=${pageNumber}`;

  await page.goto(url, { waitUntil: 'networkidle' });

  // Click all "Show All X Incidents" buttons to expand the lists
  console.log('  ⏳ Expanding all incident lists...');

  // Keep clicking buttons until none are left or we've tried too many times
  let hasMoreButtons = true;
  let attempts = 0;
  const MAX_ATTEMPTS = 50; // Safety break

  while (hasMoreButtons && attempts < MAX_ATTEMPTS) {
    // Re-query for buttons each time to avoid stale element references
    // We target the first visible one
    const button = page.getByRole('button', { name: /Show All.*Incidents/ }).first();

    if (await button.count() > 0 && await button.isVisible()) {
      try {
        await button.scrollIntoViewIfNeeded();
        await button.click();
        // Wait for the expansion to happen and DOM to settle
        await page.waitForTimeout(2000);
        attempts++;
      } catch (err) {
        console.warn('    ⚠️  Failed to click button, retrying...', err.message);
        await page.waitForTimeout(1000);
      }
    } else {
      hasMoreButtons = false;
    }
  }

  // Extract all incidents
  const incidents = await page.evaluate(() => {
    const incidentContainers = Array.from(document.querySelectorAll('.incident-container'));

    return incidentContainers.map(container => {
      const link = container.querySelector('.incident-title');
      const body = container.querySelector('.incident-body');
      const datetime = container.querySelector('.font-small');

      // Extract impact from link classes (impact-minor, impact-major, impact-critical)
      const impactClass = link ? Array.from(link.classList).find(c => c.startsWith('impact-')) : null;
      const impact = impactClass ? impactClass.replace('impact-', '') : 'none';

      return {
        id: link ? link.href.split('/').pop() : null,
        title: link ? link.textContent.trim() : null,
        impact: impact,
        description: body ? body.textContent.trim() : null,
        dateRange: datetime ? datetime.textContent.trim() : null,
      };
    }).filter(inc => inc.id); // Remove any entries without ID
  });

  console.log(`  ✅ Found ${incidents.length} incidents`);
  return incidents;
}

/**
 * Scrape individual incident detail page
 */
async function scrapeIncidentDetail(page, incidentId) {
  const url = `${CONFIG.BASE_URL}/incidents/${incidentId}`;

  await page.goto(url, { waitUntil: 'networkidle' });

  const incidentData = await page.evaluate(() => {
    // Get title and impact
    const title = document.querySelector('h1');
    const impactClass = title ? Array.from(title.classList).find(c => c.startsWith('impact-')) : null;
    const impact = impactClass ? impactClass.replace('impact-', '') : 'none';

    // Get components
    const componentDiv = document.querySelector('.components-affected');
    const componentText = componentDiv ? componentDiv.textContent.trim() : null;

    // Get status updates (h2 headings: Resolved, Update, Investigating, etc.)
    const statusUpdates = Array.from(document.querySelectorAll('h2')).filter(h2 =>
      ['Resolved', 'Update', 'Investigating', 'Identified', 'Monitoring'].some(s =>
        h2.textContent.includes(s)
      )
    );

    const updates = statusUpdates.map((h2, index) => {
      const container = h2.parentElement;
      const textContent = container.textContent;

      // Extract body text (before "Posted")
      const bodyMatch = textContent.match(/^(.+?)Posted/s);
      const body = bodyMatch ? bodyMatch[1].replace(h2.textContent, '').trim() : '';

      // Extract timestamp
      const timestampMatch = textContent.match(/(\w+\s+\d+,\s+\d{4}\s+-\s+\d+:\d+\s+UTC)/);
      const timestamp = timestampMatch ? timestampMatch[1] : null;

      return {
        id: `update_${index}`,
        status: h2.textContent.trim().toLowerCase(),
        body: body,
        created_at: timestamp,
        displayed_at: null, // Not available on page
      };
    }).reverse(); // Reverse to get chronological order (oldest first)

    return {
      title: title ? title.textContent.trim() : null,
      impact: impact,
      componentText: componentText,
      updates: updates,
    };
  });

  return incidentData;
}

/**
 * Convert scraped data to API schema format
 */
function convertToAPIFormat(historyData, detailData) {
  const components = parseComponents(detailData.componentText);

  // Parse date range from history page (e.g., "Nov 19, 16:13 - Nov 21, 00:22 UTC")
  let startedAt = null;
  let resolvedAt = null;

  if (historyData.dateRange) {
    const dateRangeParts = historyData.dateRange.split('-').map(s => s.trim());
    if (dateRangeParts.length === 2) {
      const currentYear = new Date().getFullYear();
      startedAt = parseGitHubDate(dateRangeParts[0], currentYear);
      resolvedAt = parseGitHubDate(dateRangeParts[1], currentYear);
    }
  }

  // Get timestamps from updates
  const updates = detailData.updates.map(u => ({
    ...u,
    created_at: parseGitHubDate(u.created_at) || startedAt,
  }));

  const createdAt = updates.length > 0 ? updates[0].created_at : startedAt;
  const updatedAt = updates.length > 0 ? updates[updates.length - 1].created_at : startedAt;

  // Determine final status from last update
  const lastUpdateStatus = updates.length > 0 ? updates[updates.length - 1].status : 'unknown';
  const status = lastUpdateStatus === 'resolved' ? 'resolved' : 'investigating';

  return {
    id: historyData.id,
    name: detailData.title || historyData.title,
    status: status,
    impact: detailData.impact || historyData.impact,
    created_at: createdAt,
    updated_at: updatedAt,
    resolved_at: status === 'resolved' ? (resolvedAt || updatedAt) : null,
    started_at: startedAt,
    shortlink: `https://stspg.io/${historyData.id}`,
    incident_updates: updates,
    components: components.map(name => ({
      code: name.toLowerCase().replace(/\s+/g, '_'),
      name: name,
      old_status: 'operational',
      new_status: 'degraded_performance',
    })),
  };
}

/**
 * Merge scraped incidents with existing archive
 */
function mergeIncidents(newIncidents, existingIncidents = []) {
  const combined = [...newIncidents, ...existingIncidents];
  const uniqueMap = new Map();

  combined.forEach(incident => {
    if (!uniqueMap.has(incident.id)) {
      uniqueMap.set(incident.id, incident);
    } else {
      const existing = uniqueMap.get(incident.id);
      // Keep the one with most recent updated_at
      if (new Date(incident.updated_at) > new Date(existing.updated_at)) {
        uniqueMap.set(incident.id, incident);
      }
    }
  });

  const merged = Array.from(uniqueMap.values());
  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return merged;
}

/**
 * Main scraper function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse page range (e.g., --pages 1-20 or --page 5)
  let startPage = 1;
  let endPage = 2;

  if (args.includes('--pages')) {
    const rangeStr = args[args.indexOf('--pages') + 1];
    const [start, end] = rangeStr.split('-').map(n => parseInt(n));
    startPage = start;
    endPage = end || start;
  } else if (args.includes('--page')) {
    const pageNum = parseInt(args[args.indexOf('--page') + 1]);
    startPage = pageNum;
    endPage = pageNum;
  }

  console.log('🚀 GitHub Status History Scraper');
  console.log('================================\n');
  console.log(`📊 Scraping pages ${startPage} to ${endPage}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: CONFIG.USER_AGENT,
  });

  try {
    const allScrapedIncidents = [];

    // Loop through page range
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📄 PAGE ${pageNum} of ${endPage}`);
      console.log('='.repeat(60));

      // Step 1: Scrape history page
      const historyIncidents = await scrapeHistoryPage(page, pageNum);

      if (historyIncidents.length === 0) {
        console.log('\n⚠️  No incidents found on this page. Stopping.');
        break;
      }

      // Step 2: Scrape each incident detail page
      console.log(`\n🔍 Fetching details for ${historyIncidents.length} incidents...\n`);
      const pageScrapedIncidents = [];

      for (let i = 0; i < historyIncidents.length; i++) {
        const historyData = historyIncidents[i];
        console.log(`  [${i + 1}/${historyIncidents.length}] ${historyData.id} - ${historyData.title.substring(0, 50)}...`);

        try {
          const detailData = await scrapeIncidentDetail(page, historyData.id);
          const incident = convertToAPIFormat(historyData, detailData);
          pageScrapedIncidents.push(incident);

          // Rate limiting
          if (i < historyIncidents.length - 1) {
            await page.waitForTimeout(CONFIG.RATE_LIMIT_MS);
          }
        } catch (err) {
          console.error(`    ❌ Failed: ${err.message}`);
        }
      }

      console.log(`\n✅ Page ${pageNum}: Successfully scraped ${pageScrapedIncidents.length} incidents`);
      allScrapedIncidents.push(...pageScrapedIncidents);

      // Add delay between pages to be respectful
      if (pageNum < endPage) {
        console.log(`\n⏸️  Waiting 3 seconds before next page...`);
        await page.waitForTimeout(3000);
      }
    }

    // Step 3: Load existing archive
    const archivePath = path.join(__dirname, '../src/data/incidents-archive.json');
    let existingIncidents = [];

    try {
      const archiveData = await fs.readFile(archivePath, 'utf-8');
      existingIncidents = JSON.parse(archiveData);
      console.log(`\n📂 Loaded ${existingIncidents.length} existing incidents from archive`);
    } catch (err) {
      console.log('\n📂 No existing archive found, creating new one');
    }

    // Step 4: Merge and save
    console.log(`\n📊 Total incidents scraped from all pages: ${allScrapedIncidents.length}`);
    const merged = mergeIncidents(allScrapedIncidents, existingIncidents);
    console.log(`💾 Saving ${merged.length} total incidents to archive...`);

    await fs.writeFile(archivePath, JSON.stringify(merged, null, 2));

    console.log(`\n✨ Done! Added ${allScrapedIncidents.length} new incidents, total archive: ${merged.length}`);

  } catch (err) {
    console.error('\n❌ Scraper failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

// Run the scraper
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
