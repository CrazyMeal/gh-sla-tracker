/**
 * Date and Quarter Utilities
 * Handles calendar quarter calculations for GitHub SLA tracking
 */

export type Quarter = 1 | 2 | 3 | 4;

export interface QuarterInfo {
  year: number;
  quarter: Quarter;
  label: string;
  startDate: Date;
  endDate: Date;
}

/**
 * Get quarter number (1-4) from a date
 */
export function getQuarter(date: Date): Quarter {
  const month = date.getMonth();
  return (Math.floor(month / 3) + 1) as Quarter;
}

/**
 * Get quarter label (e.g., "2025-Q1")
 */
export function getQuarterLabel(date: Date): string {
  const year = date.getFullYear();
  const quarter = getQuarter(date);
  return `${year}-Q${quarter}`;
}

/**
 * Get quarter start date
 */
export function getQuarterStart(year: number, quarter: Quarter): Date {
  const month = (quarter - 1) * 3;
  return new Date(year, month, 1, 0, 0, 0, 0);
}

/**
 * Get quarter end date
 */
export function getQuarterEnd(year: number, quarter: Quarter): Date {
  const month = quarter * 3;
  // Last day of the quarter: one day before the first day of next quarter
  const nextQuarterStart = new Date(year, month, 1, 0, 0, 0, 0);
  return new Date(nextQuarterStart.getTime() - 1); // 1ms before midnight
}

/**
 * Get complete quarter information
 */
export function getQuarterInfo(year: number, quarter: Quarter): QuarterInfo {
  return {
    year,
    quarter,
    label: `${year}-Q${quarter}`,
    startDate: getQuarterStart(year, quarter),
    endDate: getQuarterEnd(year, quarter),
  };
}

/**
 * Parse quarter label (e.g., "2025-Q1") into year and quarter
 */
export function parseQuarterLabel(label: string): { year: number; quarter: Quarter } | null {
  const match = label.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;

  return {
    year: parseInt(match[1], 10),
    quarter: parseInt(match[2], 10) as Quarter,
  };
}

/**
 * Check if a date falls within a quarter
 */
export function isDateInQuarter(date: Date, year: number, quarter: Quarter): boolean {
  const start = getQuarterStart(year, quarter);
  const end = getQuarterEnd(year, quarter);
  return date >= start && date <= end;
}

/**
 * Get all quarters between two dates
 */
export function getQuartersBetween(startDate: Date, endDate: Date): QuarterInfo[] {
  const quarters: QuarterInfo[] = [];
  const start = new Date(startDate);
  start.setDate(1); // Start from beginning of month

  let current = start;
  while (current <= endDate) {
    const year = current.getFullYear();
    const quarter = getQuarter(current);
    quarters.push(getQuarterInfo(year, quarter));

    // Move to next quarter
    current = new Date(year, (quarter * 3), 1);
  }

  return quarters;
}

/**
 * Get recent quarters for display
 * @param count Number of quarters to return (default: 8, which is 2 years)
 */
export function getRecentQuarters(count: number = 8): QuarterInfo[] {
  const quarters: QuarterInfo[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = getQuarter(now);

  let year = currentYear;
  let quarter = currentQuarter;

  for (let i = 0; i < count; i++) {
    quarters.push(getQuarterInfo(year, quarter));

    // Move to previous quarter
    quarter--;
    if (quarter < 1) {
      quarter = 4;
      year--;
    }
  }

  return quarters;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date and time for display
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Calculate duration between two dates in minutes
 */
export function getDurationMinutes(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  const durationMs = end.getTime() - start.getTime();
  return Math.round(durationMs / (1000 * 60));
}

/**
 * Format duration in a human-readable way
 * @param minutes Duration in minutes
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (remainingHours > 0) {
    return `${days}d ${remainingHours}h`;
  }

  return `${days}d`;
}

/**
 * Get total minutes in a date range
 */
export function getTotalMinutes(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;
  const durationMs = end.getTime() - start.getTime();
  return durationMs / (1000 * 60);
}

/**
 * Get total minutes in a quarter
 */
export function getQuarterTotalMinutes(year: number, quarter: Quarter): number {
  const start = getQuarterStart(year, quarter);
  const end = getQuarterEnd(year, quarter);
  return getTotalMinutes(start, end);
}
