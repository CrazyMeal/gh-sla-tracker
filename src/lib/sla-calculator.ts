/**
 * SLA Calculator
 * Calculates uptime percentages and SLA compliance based on GitHub incident data
 */

import type { CollectionEntry } from 'astro:content';
import { getDurationMinutes, getTotalMinutes, getQuarterStart, getQuarterEnd, type Quarter } from './date-utils';

// Type for incident entries from content collections
type IncidentEntry = CollectionEntry<'incidents'>;

export interface SLAResult {
  componentName: string;
  uptimePercentage: number;
  totalDowntimeMinutes: number;
  incidentCount: number;
  slaViolation: boolean;
  serviceCredit: 0 | 10 | 25; // Percentage
  hasInsufficientData: boolean; // True if quarter is before oldest incident
  period: {
    start: string;
    end: string;
  };
}

export interface IncidentWithDuration extends IncidentEntry {
  durationMinutes: number;
  weightedDowntime: number;
}

/**
 * Get impact multiplier for weighting downtime
 * GitHub SLA defines downtime as >5% error rate, but impact levels help us estimate severity
 */
export function getImpactMultiplier(impact: string): number {
  const multipliers: Record<string, number> = {
    'none': 0,
    'minor': 0.25,     // Partial degradation
    'major': 0.75,     // Significant issues
    'critical': 1.0,   // Complete outage
    'maintenance': 0,  // Scheduled maintenance (no SLA impact)
  };

  // Use nullish coalescing to handle 0 values correctly
  // (0 is falsy, so || would incorrectly return 0.5)
  return multipliers[impact] ?? 0.5;
}

/**
 * Get the end time for an incident
 * Handles various cases where resolved_at might be missing
 */
export function getIncidentEndTime(incident: IncidentEntry): Date {
  // 1. Explicit resolved_at
  if (incident.data.resolved_at) {
    return new Date(incident.data.resolved_at);
  }

  // 2. Check updates for "resolved" status
  // This handles cases where the top-level status wasn't updated but a resolved update exists
  if (incident.data.incident_updates) {
    const resolvedUpdate = incident.data.incident_updates.find(u => u.status === 'resolved');
    if (resolvedUpdate) {
      return new Date(resolvedUpdate.created_at);
    }
  }

  // 3. Fallback: if status is resolved but no date, use updated_at
  if (incident.data.status === 'resolved') {
    return new Date(incident.data.updated_at);
  }

  // 4. Ongoing incident
  // Note: We might want to add a check for stale incidents here in the future
  // (e.g. if updated_at is > 7 days ago, assume resolved)
  return new Date();
}

/**
 * Calculate downtime for a single incident
 */
export function calculateIncidentDowntime(incident: IncidentEntry): number {
  const startTime = new Date(incident.data.started_at || incident.data.created_at);
  const endTime = getIncidentEndTime(incident);

  const durationMinutes = getDurationMinutes(startTime, endTime);
  const impactMultiplier = getImpactMultiplier(incident.data.impact);

  return durationMinutes * impactMultiplier;
}

/**
 * Calculate downtime for a single incident within a specific period
 * Clamps the downtime to the period boundaries
 */
export function calculateIncidentDowntimeInPeriod(
  incident: IncidentEntry,
  periodStart: Date,
  periodEnd: Date
): number {
  const incidentStart = new Date(incident.data.started_at || incident.data.created_at);
  const incidentEnd = getIncidentEndTime(incident);

  // If incident is completely outside the period, return 0
  if (incidentEnd < periodStart || incidentStart > periodEnd) {
    return 0;
  }

  // Clamp start and end to the period
  const clampedStart = incidentStart < periodStart ? periodStart : incidentStart;
  const clampedEnd = incidentEnd > periodEnd ? periodEnd : incidentEnd;

  const durationMinutes = getDurationMinutes(clampedStart, clampedEnd);
  const impactMultiplier = getImpactMultiplier(incident.data.impact);

  return durationMinutes * impactMultiplier;
}

/**
 * Filter incidents by date range
 */
export function filterIncidentsByDateRange(
  incidents: IncidentEntry[],
  startDate: Date,
  endDate: Date
): IncidentEntry[] {
  return incidents.filter(incident => {
    const createdAt = new Date(incident.data.created_at);
    return createdAt >= startDate && createdAt <= endDate;
  });
}

/**
 * Filter incidents by component
 */
export function filterIncidentsByComponent(
  incidents: IncidentEntry[],
  componentName: string
): IncidentEntry[] {
  return incidents.filter(incident =>
    incident.data.components && incident.data.components.some(c => c.name === componentName)
  );
}

/**
 * Determine if we have sufficient data coverage for a specific quarter
 * This replaces the global oldestIncidentDate approach with quarter-specific logic
 *
 * Logic:
 * - Future quarters: No coverage
 * - Recent quarters (within 90 days): Has coverage even if no incidents (100% uptime)
 * - Old quarters with no incidents: Insufficient data (before tracking began)
 */
export function hasDataCoverageForQuarter(
  incidents: IncidentEntry[],
  startDate: Date,
  endDate: Date
): { hasCoverage: boolean; reason: string } {
  const now = new Date();

  // Future quarters don't have data yet
  if (startDate > now) {
    return { hasCoverage: false, reason: 'Future quarter' };
  }

  // Find incidents that overlap with this quarter
  const incidentsInPeriod = filterIncidentsByDateRange(incidents, startDate, endDate);

  // If we have incidents in this period, we definitely have data
  if (incidentsInPeriod.length > 0) {
    return { hasCoverage: true, reason: 'Has incidents' };
  }

  // No incidents in this quarter - need to determine if this means:
  // a) 100% uptime (recent quarter, we're tracking) OR
  // b) No data (historical quarter before tracking began)

  // If the quarter ended within the last 90 days, we're likely tracking
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(now.getDate() - 90);

  if (endDate >= ninetyDaysAgo) {
    return { hasCoverage: true, reason: 'Recent quarter with no incidents (100% uptime)' };
  }

  // Old quarter with no incidents - probably before our tracking window
  return { hasCoverage: false, reason: 'Historical quarter before tracking began' };
}

/**
 * Calculate SLA for a specific component in a date range
 */
export function calculateComponentSLA(
  incidents: IncidentEntry[],
  componentName: string,
  startDate: Date,
  endDate: Date
): SLAResult {
  // Check if we have insufficient data for this quarter
  const { hasCoverage } = hasDataCoverageForQuarter(incidents, startDate, endDate);
  const hasInsufficientData = !hasCoverage;

  // Filter incidents affecting this component that OVERLAP with the date range
  // (Start before end of period AND End after start of period)
  const relevantIncidents = incidents.filter(incident => {
    const incidentStart = new Date(incident.data.started_at || incident.data.created_at);
    const incidentEnd = getIncidentEndTime(incident);

    const affectsComponent = incident.data.components && incident.data.components.some(c => c.name === componentName);

    return affectsComponent && incidentStart < endDate && incidentEnd > startDate;
  });

  // Calculate total weighted downtime using interval merging
  // This handles overlapping incidents by taking the MAX impact during any given overlap

  // 1. Collect all relevant time points (start and end of period, and incident start/ends within period)
  const timePoints = new Set<number>();
  timePoints.add(startDate.getTime());
  timePoints.add(endDate.getTime());

  relevantIncidents.forEach(inc => {
    const start = new Date(inc.data.started_at || inc.data.created_at).getTime();
    const end = getIncidentEndTime(inc).getTime();

    // Clamp to period
    const clampedStart = Math.max(start, startDate.getTime());
    const clampedEnd = Math.min(end, endDate.getTime());

    if (clampedStart < clampedEnd) {
      timePoints.add(clampedStart);
      timePoints.add(clampedEnd);
    }
  });

  const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

  let totalWeightedDowntimeMinutes = 0;

  // 2. Iterate through intervals
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const p1 = sortedPoints[i];
    const p2 = sortedPoints[i + 1];

    // Skip if points are identical
    if (p1 === p2) continue;

    const midPoint = (p1 + p2) / 2;

    // Find max impact for this interval
    let maxImpact = 0;

    for (const inc of relevantIncidents) {
      const start = new Date(inc.data.started_at || inc.data.created_at).getTime();
      const end = getIncidentEndTime(inc).getTime();

      // Check if incident covers this interval (using midpoint to be safe)
      if (start <= midPoint && end >= midPoint) {
        const impact = getImpactMultiplier(inc.data.impact);
        if (impact > maxImpact) maxImpact = impact;
      }
    }

    const durationMinutes = (p2 - p1) / (1000 * 60);
    totalWeightedDowntimeMinutes += durationMinutes * maxImpact;
  }

  // Calculate total period in minutes
  const totalMinutes = getTotalMinutes(startDate, endDate);

  // Calculate uptime percentage
  // Ensure we don't get negative uptime if something goes wrong with floating point math
  const effectiveDowntime = Math.min(totalWeightedDowntimeMinutes, totalMinutes);
  const rawUptimePercentage = ((totalMinutes - effectiveDowntime) / totalMinutes) * 100;

  // Round to 4 decimal places for consistent comparison
  // This ensures SLA violation checks use the same precision as returned values
  const uptimePercentage = parseFloat(rawUptimePercentage.toFixed(4));

  // Determine SLA violation and service credit
  let slaViolation = false;
  let serviceCredit: 0 | 10 | 25 = 0;

  if (uptimePercentage < 99.0) {
    slaViolation = true;
    serviceCredit = 25;
  } else if (uptimePercentage < 99.9) {
    slaViolation = true;
    serviceCredit = 10;
  }

  return {
    componentName,
    uptimePercentage,
    totalDowntimeMinutes: Math.round(totalWeightedDowntimeMinutes),
    incidentCount: relevantIncidents.length,
    slaViolation,
    serviceCredit,
    hasInsufficientData,
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  };
}

/**
 * Calculate SLA for all components in a quarter
 */
export function calculateQuarterlySLA(
  incidents: IncidentEntry[],
  year: number,
  quarter: Quarter,
  componentNames: string[]
): SLAResult[] {
  const startDate = getQuarterStart(year, quarter);
  const endDate = getQuarterEnd(year, quarter);

  return componentNames.map(componentName =>
    calculateComponentSLA(incidents, componentName, startDate, endDate)
  );
}

/**
 * Calculate overall SLA across all components
 */
export function calculateOverallSLA(
  incidents: IncidentEntry[],
  startDate: Date,
  endDate: Date,
  componentNames: string[]
): SLAResult {
  const componentSLAs = componentNames.map(name =>
    calculateComponentSLA(incidents, name, startDate, endDate)
  );

  // Calculate average uptime
  const avgUptime = componentSLAs.reduce((sum, sla) => sum + sla.uptimePercentage, 0) / componentSLAs.length;

  // Sum total downtime and incidents
  const totalDowntime = componentSLAs.reduce((sum, sla) => sum + sla.totalDowntimeMinutes, 0);
  const totalIncidents = componentSLAs.reduce((sum, sla) => sum + sla.incidentCount, 0);

  // Determine overall SLA violation
  const slaViolation = avgUptime < 99.9;
  const serviceCredit: 0 | 10 | 25 = avgUptime < 99.0 ? 25 : avgUptime < 99.9 ? 10 : 0;

  // Check if we have insufficient data
  const hasInsufficientData = componentSLAs.some(sla => sla.hasInsufficientData);

  return {
    componentName: 'All Components',
    uptimePercentage: parseFloat(avgUptime.toFixed(4)),
    totalDowntimeMinutes: Math.round(totalDowntime),
    incidentCount: totalIncidents,
    slaViolation,
    serviceCredit,
    hasInsufficientData,
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
  };
}

/**
 * Get incidents with calculated durations
 */
export function getIncidentsWithDurations(incidents: IncidentEntry[]): IncidentWithDuration[] {
  return incidents.map(incident => {
    const startTime = new Date(incident.data.started_at || incident.data.created_at);
    const endTime = getIncidentEndTime(incident);
    const durationMinutes = getDurationMinutes(startTime, endTime);
    const weightedDowntime = calculateIncidentDowntime(incident);

    return {
      ...incident,
      durationMinutes,
      weightedDowntime,
    };
  });
}

/**
 * Get SLA status label
 */
export function getSLAStatusLabel(uptimePercentage: number, hasInsufficientData: boolean = false): string {
  if (hasInsufficientData) return 'Unknown';
  if (uptimePercentage >= 99.9) return 'Pass';
  if (uptimePercentage >= 99.0) return 'Violation (10% credit)';
  return 'Violation (25% credit)';
}

/**
 * Get SLA status color
 */
export function getSLAStatusColor(uptimePercentage: number, hasInsufficientData: boolean = false): string {
  if (hasInsufficientData) return 'gray';
  if (uptimePercentage >= 99.9) return 'green';
  if (uptimePercentage >= 99.0) return 'orange';
  return 'red';
}

/**
 * GitHub SLA components
 * Based on the official SLA document
 */
export const GITHUB_SLA_COMPONENTS = [
  'Git Operations',
  'API Requests',
  'Issues',
  'Pull Requests',
  'Webhooks',
  'Pages',
  'Actions',
  'Packages',
] as const;

export type GitHubSLAComponent = typeof GITHUB_SLA_COMPONENTS[number];

/**
 * Centralized quarter data interface
 * Contains all computed SLA metrics and incidents for a specific quarter
 */
export interface QuarterData {
  year: number;
  quarter: Quarter;
  quarterLabel: string;
  startDate: Date;
  endDate: Date;
  slaResults: SLAResult[];
  avgUptime: number;
  totalDowntime: number;
  totalIncidents: number;
  trackedIncidents: number;
  hasViolation: boolean;
  hasInsufficientData: boolean;
  worstComponent: SLAResult;
  quarterIncidents: IncidentEntry[];
}

/**
 * Calculate all SLA data for a specific quarter
 * This centralizes business logic previously duplicated across .astro files
 *
 * @param incidents - All incidents from the collection
 * @param year - Year of the quarter
 * @param quarter - Quarter number (1-4)
 * @returns Complete quarter data with SLA calculations
 */
export function calculateQuarterData(
  incidents: IncidentEntry[],
  year: number,
  quarter: Quarter
): QuarterData {
  const startDate = getQuarterStart(year, quarter);
  const endDate = getQuarterEnd(year, quarter);
  const quarterLabel = `${year}-Q${quarter}`;

  // Filter incidents for this quarter
  const quarterIncidents = filterIncidentsByDateRange(
    incidents,
    startDate,
    endDate
  );

  // Calculate SLA for each component
  const slaResults = calculateQuarterlySLA(
    incidents,
    year,
    quarter,
    [...GITHUB_SLA_COMPONENTS]
  );

  // Calculate overall metrics
  const avgUptime = slaResults.reduce((sum, r) => sum + r.uptimePercentage, 0) / slaResults.length;
  const totalDowntime = slaResults.reduce((sum, r) => sum + r.totalDowntimeMinutes, 0);
  const totalIncidents = quarterIncidents.length;

  // Count incidents that affect tracked components
  const trackedIncidents = quarterIncidents.filter(incident =>
    incident.data.components &&
    incident.data.components.some(c => GITHUB_SLA_COMPONENTS.includes(c.name as any))
  ).length;

  // Determine violations and insufficient data
  const hasViolation = slaResults.some(r => r.slaViolation);
  const hasInsufficientData = slaResults.some(r => r.hasInsufficientData);

  // Find worst performing component
  const worstComponent = slaResults.reduce((worst, curr) =>
    curr.uptimePercentage < worst.uptimePercentage ? curr : worst
  );

  return {
    year,
    quarter,
    quarterLabel,
    startDate,
    endDate,
    slaResults,
    avgUptime,
    totalDowntime,
    totalIncidents,
    trackedIncidents,
    hasViolation,
    hasInsufficientData,
    worstComponent,
    quarterIncidents,
  };
}
