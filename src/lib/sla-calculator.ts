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
  };

  return multipliers[impact] || 0.5;
}

/**
 * Calculate downtime for a single incident
 */
export function calculateIncidentDowntime(incident: IncidentEntry): number {
  const startTime = new Date(incident.data.started_at || incident.data.created_at);
  const endTime = incident.data.resolved_at
    ? new Date(incident.data.resolved_at)
    : new Date(); // Ongoing incident uses current time

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

  let incidentEnd: Date;
  if (incident.data.resolved_at) {
    incidentEnd = new Date(incident.data.resolved_at);
  } else if (incident.data.status === 'resolved') {
    // Fallback for resolved incidents with missing resolved_at
    // Use updated_at as it usually corresponds to the resolution time
    incidentEnd = new Date(incident.data.updated_at);
  } else {
    incidentEnd = new Date(); // Ongoing incident uses current time
  }

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
 * Get the oldest incident date from the collection
 * This tells us when incident tracking began
 */
export function getOldestIncidentDate(incidents: IncidentEntry[]): Date | null {
  if (incidents.length === 0) return null;

  const oldestIncident = incidents.reduce((oldest, current) => {
    const currentDate = new Date(current.data.created_at);
    const oldestDate = new Date(oldest.data.created_at);
    return currentDate < oldestDate ? current : oldest;
  });

  return new Date(oldestIncident.data.created_at);
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
 * Calculate SLA for a specific component in a date range
 */
export function calculateComponentSLA(
  incidents: IncidentEntry[],
  componentName: string,
  startDate: Date,
  endDate: Date,
  oldestIncidentDate: Date | null = null
): SLAResult {
  // Check if we have insufficient data (quarter starts before our oldest incident)
  const hasInsufficientData = oldestIncidentDate !== null && startDate < oldestIncidentDate;

  // Filter incidents affecting this component that OVERLAP with the date range
  // (Start before end of period AND End after start of period)
  const relevantIncidents = incidents.filter(incident => {
    const incidentStart = new Date(incident.data.started_at || incident.data.created_at);
    const incidentEnd = incident.data.resolved_at
      ? new Date(incident.data.resolved_at)
      : new Date(); // Ongoing incident uses current time

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
    const end = inc.data.resolved_at ? new Date(inc.data.resolved_at).getTime() : new Date().getTime();

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
      const end = inc.data.resolved_at ? new Date(inc.data.resolved_at).getTime() : new Date().getTime();

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
  const uptimePercentage = ((totalMinutes - effectiveDowntime) / totalMinutes) * 100;

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
    uptimePercentage: parseFloat(uptimePercentage.toFixed(4)),
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
  componentNames: string[],
  oldestIncidentDate: Date | null = null
): SLAResult[] {
  const startDate = getQuarterStart(year, quarter);
  const endDate = getQuarterEnd(year, quarter);

  return componentNames.map(componentName =>
    calculateComponentSLA(incidents, componentName, startDate, endDate, oldestIncidentDate)
  );
}

/**
 * Calculate overall SLA across all components
 */
export function calculateOverallSLA(
  incidents: IncidentEntry[],
  startDate: Date,
  endDate: Date,
  componentNames: string[],
  oldestIncidentDate: Date | null = null
): SLAResult {
  const componentSLAs = componentNames.map(name =>
    calculateComponentSLA(incidents, name, startDate, endDate, oldestIncidentDate)
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
    const endTime = incident.data.resolved_at ? new Date(incident.data.resolved_at) : new Date();
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
