import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const GITHUB_STATUS_API = 'https://www.githubstatus.com/api/v2';
const CACHE_DIR = path.join(__dirname, '..', '.astro', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'github-data.json');
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const ARCHIVE_FILE = path.join(DATA_DIR, 'incidents-archive.json');
const COMPONENTS_FILE = path.join(DATA_DIR, 'components.json');
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

/**
 * Fetch data from GitHub Status API with error handling
 */
async function fetchGitHubAPI(endpoint) {
  const url = `${GITHUB_STATUS_API}/${endpoint}`;

  try {
    console.log(`Fetching: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * Check if cached data is still valid
 */
function isCacheValid() {
  if (!fs.existsSync(CACHE_FILE)) {
    return false;
  }

  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    const age = Date.now() - cached.timestamp;
    return age < CACHE_DURATION;
  } catch (error) {
    console.warn('Cache file corrupted, will fetch fresh data');
    return false;
  }
}

/**
 * Load cached data
 */
function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return null;
  }

  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    console.log('Using cached data (age: ' + Math.round((Date.now() - cached.timestamp) / 1000 / 60) + ' minutes)');
    return cached.data;
  } catch (error) {
    console.warn('Failed to load cache:', error.message);
    return null;
  }
}

/**
 * Save data to cache
 */
function saveCache(data) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify({
    timestamp: Date.now(),
    data
  }, null, 2));
  console.log('Data cached successfully');
}

/**
 * Fetch fresh data from GitHub Status API
 */
async function fetchFreshData() {
  console.log('\n📡 Fetching fresh data from GitHub Status API...\n');

  // Fetch incidents and components in parallel
  const [incidentsData, componentsData] = await Promise.all([
    fetchGitHubAPI('incidents.json'),
    fetchGitHubAPI('components.json')
  ]);

  if (incidentsData.incidents && incidentsData.incidents.length === 0) {
    console.warn('⚠️  Warning: API returned 0 incidents. This might be correct, or an API issue.');
  }

  return {
    incidents: incidentsData.incidents || [],
    components: componentsData.components || [],
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Merge new incidents with existing archive
 * Avoids duplicates and sorts by date
 */
/**
 * Merge new incidents with existing archive
 * Avoids duplicates and sorts by date
 */
function mergeIncidents(newIncidents, existingArchive = []) {
  // Combine arrays
  const combined = [...newIncidents, ...existingArchive];
  let addedCount = 0;
  let updatedCount = 0;

  // Remove duplicates by ID
  const uniqueMap = new Map();

  // First, populate map with existing archive to establish baseline
  existingArchive.forEach(incident => {
    uniqueMap.set(incident.id, incident);
  });

  // Process new incidents
  newIncidents.forEach(incident => {
    if (!uniqueMap.has(incident.id)) {
      uniqueMap.set(incident.id, incident);
      addedCount++;
    } else {
      // Check if it's actually an update
      const existing = uniqueMap.get(incident.id);
      if (new Date(incident.updated_at) > new Date(existing.updated_at)) {
        uniqueMap.set(incident.id, incident);
        updatedCount++;
      }
    }
  });

  // Convert back to array and sort by creation date (newest first)
  const merged = Array.from(uniqueMap.values());
  merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return { merged, addedCount, updatedCount };
}

/**
 * Load existing archive or return empty array
 */
function loadExistingArchive() {
  if (!fs.existsSync(ARCHIVE_FILE)) {
    console.log('No existing archive found, will create new one');
    return [];
  }

  try {
    const archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
    console.log(`Loaded existing archive: ${archive.length} incidents`);
    return archive;
  } catch (error) {
    console.error('Failed to load existing archive:', error.message);
    // If the file exists but is corrupted, we should probably fail rather than overwrite with empty
    throw new Error('Critical: Failed to parse existing archive. Aborting to prevent data loss.');
  }
}

/**
 * Save data to files
 */
function saveData(incidents, components) {
  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Save incidents archive
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(incidents, null, 2));
  console.log(`✅ Saved ${incidents.length} incidents to ${path.relative(process.cwd(), ARCHIVE_FILE)}`);

  // Save components
  fs.writeFileSync(COMPONENTS_FILE, JSON.stringify(components, null, 2));
  console.log(`✅ Saved ${components.length} components to ${path.relative(process.cwd(), COMPONENTS_FILE)}`);
}

/**
 * Print summary statistics
 */
function printSummary(incidents, components) {
  console.log('\n📊 Data Summary\n');
  console.log(`Total Incidents: ${incidents.length}`);
  console.log(`Total Components: ${components.length}`);

  // Count incidents by status
  const statusCounts = incidents.reduce((acc, incident) => {
    acc[incident.status] = (acc[incident.status] || 0) + 1;
    return acc;
  }, {});

  console.log('\nIncidents by Status:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  // Count incidents by impact
  const impactCounts = incidents.reduce((acc, incident) => {
    acc[incident.impact] = (acc[incident.impact] || 0) + 1;
    return acc;
  }, {});

  console.log('\nIncidents by Impact:');
  Object.entries(impactCounts).forEach(([impact, count]) => {
    console.log(`  ${impact}: ${count}`);
  });

  // Date range
  if (incidents.length > 0) {
    const oldestDate = new Date(incidents[incidents.length - 1].created_at);
    const newestDate = new Date(incidents[0].created_at);
    console.log(`\nDate Range: ${oldestDate.toISOString().split('T')[0]} to ${newestDate.toISOString().split('T')[0]}`);
  }

  console.log('\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 GitHub SLA Tracker - Data Fetcher\n');

  try {
    let data;

    // Check cache first
    if (isCacheValid()) {
      data = loadCache();
    }

    // Fetch fresh data if no valid cache
    if (!data) {
      data = await fetchFreshData();
      saveCache(data);
    }

    // Load existing archive
    const existingArchive = loadExistingArchive();

    // Merge incidents
    const { merged: mergedIncidents, addedCount, updatedCount } = mergeIncidents(data.incidents, existingArchive);

    console.log(`\n📦 Merge Summary:`);
    console.log(`   - Existing Archive: ${existingArchive.length}`);
    console.log(`   - Fetched Incidents: ${data.incidents.length}`);
    console.log(`   - New Incidents Added: ${addedCount}`);
    console.log(`   - Incidents Updated: ${updatedCount}`);
    console.log(`   - Total Unique Incidents: ${mergedIncidents.length}\n`);

    // Save to files
    saveData(mergedIncidents, data.components);

    // Print summary
    printSummary(mergedIncidents, data.components);

    console.log('✨ Data fetching completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
main();
