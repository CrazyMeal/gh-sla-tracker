import { describe, it, expect } from 'vitest';
import {
  getImpactMultiplier,
  hasDataCoverageForQuarter,
  calculateComponentSLA,
  calculateQuarterlySLA,
  calculateQuarterData,
  getIncidentEndTime,
  normalizeComponentName,
  GITHUB_SLA_COMPONENTS,
} from './sla-calculator';
import { getQuarterStart, getQuarterEnd } from './date-utils';
import type { CollectionEntry } from 'astro:content';

/**
 * Test Suite for GitHub SLA Calculator
 *
 * Based on GitHub Online Services SLA (Version: June 2021)
 * - Uptime Commitment: 99.9% per calendar quarter
 * - Calculation: (total minutes - downtime) / total minutes × 100
 * - Service Credits: 10% (<99.9%), 25% (<99.0%)
 */

// Helper to create mock incident data
function createMockIncident(
  id: string,
  createdAt: string,
  resolvedAt: string | null,
  impact: string,
  componentNames: string[] = ['Git Operations']
): CollectionEntry<'incidents'> {
  return {
    id,
    collection: 'incidents',
    data: {
      id,
      name: `Incident ${id}`,
      status: resolvedAt ? 'resolved' : 'investigating',
      impact,
      created_at: createdAt,
      updated_at: createdAt,
      started_at: createdAt,
      resolved_at: resolvedAt,
      shortlink: `https://stspg.io/${id}`,
      incident_updates: [],
      components: componentNames.map(name => ({
        name,
        status: 'operational',
      })),
    },
  } as CollectionEntry<'incidents'>;
}

describe('Impact Multiplier Tests', () => {
  describe('GIVEN impact levels per GitHub SLA definition', () => {
    it('WHEN impact is "none" THEN multiplier should be 0', () => {
      // Given: Impact level is "none" (no service degradation)
      const impact = 'none';

      // When: Getting the multiplier
      const multiplier = getImpactMultiplier(impact);

      // Then: Should return 0 (no downtime counted)
      expect(multiplier).toBe(0);
    });

    it('WHEN impact is "minor" THEN multiplier should be 0.25', () => {
      // Given: Impact level is "minor" (partial degradation)
      const impact = 'minor';

      // When: Getting the multiplier
      const multiplier = getImpactMultiplier(impact);

      // Then: Should return 0.25 (25% of duration counted as downtime)
      expect(multiplier).toBe(0.25);
    });

    it('WHEN impact is "major" THEN multiplier should be 0.75', () => {
      // Given: Impact level is "major" (significant issues)
      const impact = 'major';

      // When: Getting the multiplier
      const multiplier = getImpactMultiplier(impact);

      // Then: Should return 0.75 (75% of duration counted as downtime)
      expect(multiplier).toBe(0.75);
    });

    it('WHEN impact is "critical" THEN multiplier should be 1.0', () => {
      // Given: Impact level is "critical" (complete outage)
      const impact = 'critical';

      // When: Getting the multiplier
      const multiplier = getImpactMultiplier(impact);

      // Then: Should return 1.0 (100% of duration counted as downtime)
      expect(multiplier).toBe(1.0);
    });

    it('WHEN impact is "maintenance" THEN multiplier should be 0', () => {
      // Given: Impact level is "maintenance" (scheduled, excluded from SLA)
      const impact = 'maintenance';

      // When: Getting the multiplier
      const multiplier = getImpactMultiplier(impact);

      // Then: Should return 0 (maintenance excluded from SLA calculations)
      expect(multiplier).toBe(0);
    });

    it('WHEN impact is unknown THEN multiplier should default to 0.5', () => {
      // Given: Impact level is unknown/undefined
      const impact = 'unknown-impact-level';

      // When: Getting the multiplier
      const multiplier = getImpactMultiplier(impact);

      // Then: Should return 0.5 (default fallback)
      expect(multiplier).toBe(0.5);
    });
  });
});


describe('Component Name Normalization Tests', () => {
  it('WHEN name is standard THEN returns same name', () => {
    expect(normalizeComponentName('Pages')).toBe('Pages');
  });

  it('WHEN name has "and " prefix THEN removes it', () => {
    expect(normalizeComponentName('and Pages')).toBe('Pages');
  });

  it('WHEN name has "and " prefix with different casing THEN removes it', () => {
    expect(normalizeComponentName('AND Pages')).toBe('Pages');
    expect(normalizeComponentName('And Pages')).toBe('Pages');
  });

  it('WHEN name has extra whitespace THEN trims it', () => {
    expect(normalizeComponentName('  Pages  ')).toBe('Pages');
    expect(normalizeComponentName('  and Pages  ')).toBe('Pages');
  });
});

describe('Incident Resolution Time Tests', () => {
  it('WHEN resolved_at is present and valid THEN uses it', () => {
    const incident = createMockIncident(
      '1',
      '2025-01-01T10:00:00Z',
      '2025-01-01T11:00:00Z',
      'minor'
    );
    expect(getIncidentEndTime(incident).toISOString()).toBe('2025-01-01T11:00:00.000Z');
  });

  it('WHEN resolved_at is missing but update says resolved THEN uses update time', () => {
    const incident = createMockIncident(
      '2',
      '2025-01-01T10:00:00Z',
      null,
      'minor'
    );
    incident.data.incident_updates = [
      {
        id: 'u1',
        status: 'resolved',
        body: 'Fixed',
        created_at: '2025-01-01T12:00:00Z',
        display_at: null,
      },
    ];
    expect(getIncidentEndTime(incident).toISOString()).toBe('2025-01-01T12:00:00.000Z');
  });

  it('WHEN resolved_at has incorrect year but update is correct THEN uses update time (Priority Fix)', () => {
    const incident = createMockIncident(
      '3',
      '2022-09-06T22:56:00Z',
      '2025-09-07T00:08:00Z', // Incorrect year (2025)
      'minor'
    );
    incident.data.incident_updates = [
      {
        id: 'u1',
        status: 'resolved',
        body: 'Fixed',
        created_at: '2022-09-07T00:08:00Z', // Correct year (2022)
        display_at: null,
      },
    ];
    expect(getIncidentEndTime(incident).toISOString()).toBe('2022-09-07T00:08:00.000Z');
  });

  it('WHEN resolved_at missing and no resolved update but status is resolved THEN uses updated_at', () => {
    const incident = createMockIncident(
      '4',
      '2025-01-01T10:00:00Z',
      null,
      'minor'
    );
    incident.data.status = 'resolved';
    incident.data.updated_at = '2025-01-01T13:00:00Z';
    expect(getIncidentEndTime(incident).toISOString()).toBe('2025-01-01T13:00:00.000Z');
  });

  it('WHEN truly ongoing THEN uses current time', () => {
    const incident = createMockIncident(
      '5',
      '2025-01-01T10:00:00Z',
      null,
      'minor'
    );
    // Mock Date to ensure consistent test
    const mockNow = new Date('2025-01-02T10:00:00Z');
    const originalDate = global.Date;

    // @ts-ignore
    global.Date = class extends Date {
      constructor(date: any) {
        super(date);
        if (date) return new originalDate(date);
        return mockNow;
      }
    };

    expect(getIncidentEndTime(incident).toISOString()).toBe(mockNow.toISOString());

    // Restore Date
    global.Date = originalDate;
  });
});

describe('Data Coverage Tests', () => {
  describe('GIVEN different quarter scenarios', () => {
    it('WHEN quarter is in the future THEN should have no coverage', () => {
      // Given: A future quarter (2026-Q1)
      const futureStart = new Date('2026-01-01');
      const futureEnd = new Date('2026-03-31');
      const incidents: CollectionEntry<'incidents'>[] = [];

      // When: Checking data coverage
      const { hasCoverage, reason } = hasDataCoverageForQuarter(
        incidents,
        futureStart,
        futureEnd
      );

      // Then: Should not have coverage
      expect(hasCoverage).toBe(false);
      expect(reason).toBe('Future quarter');
    });

    it('WHEN quarter has incidents THEN should have coverage', () => {
      // Given: A quarter with incidents
      const quarterStart = new Date('2025-01-01');
      const quarterEnd = new Date('2025-03-31');
      const incidents = [
        createMockIncident(
          '1',
          '2025-02-15T10:00:00Z',
          '2025-02-15T11:00:00Z',
          'major'
        ),
      ];

      // When: Checking data coverage
      const { hasCoverage, reason } = hasDataCoverageForQuarter(
        incidents,
        quarterStart,
        quarterEnd
      );

      // Then: Should have coverage
      expect(hasCoverage).toBe(true);
      expect(reason).toBe('Has incidents');
    });

    it('WHEN recent quarter has no incidents THEN should have coverage (100% uptime)', () => {
      // Given: A recent quarter (within 90 days) with no incidents
      const now = new Date();
      const quarterStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const quarterEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const incidents: CollectionEntry<'incidents'>[] = [];

      // When: Checking data coverage
      const { hasCoverage, reason } = hasDataCoverageForQuarter(
        incidents,
        quarterStart,
        quarterEnd
      );

      // Then: Should have coverage (100% uptime)
      expect(hasCoverage).toBe(true);
      expect(reason).toContain('Recent quarter with no incidents');
    });

    it('WHEN old quarter has no incidents THEN should not have coverage', () => {
      // Given: An old quarter (>90 days ago) with no incidents
      const oldQuarterStart = new Date('2020-01-01');
      const oldQuarterEnd = new Date('2020-03-31');
      const incidents: CollectionEntry<'incidents'>[] = [];

      // When: Checking data coverage
      const { hasCoverage, reason } = hasDataCoverageForQuarter(
        incidents,
        oldQuarterStart,
        oldQuarterEnd
      );

      // Then: Should not have coverage (before tracking began)
      expect(hasCoverage).toBe(false);
      expect(reason).toContain('Historical quarter before tracking began');
    });
  });
});

describe('SLA Calculation Tests - Per GitHub SLA Document', () => {
  describe('GIVEN a quarter with perfect uptime', () => {
    it('WHEN no incidents occurred THEN uptime should be 100%', () => {
      // Given: Q1 2025 with no incidents
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const incidents: CollectionEntry<'incidents'>[] = [];

      // When: Calculating SLA for Git Operations
      const result = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: Should have 100% uptime
      expect(result.uptimePercentage).toBe(100);
      expect(result.totalDowntimeMinutes).toBe(0);
      expect(result.incidentCount).toBe(0);
      expect(result.slaViolation).toBe(false);
      expect(result.serviceCredit).toBe(0);
    });
  });

  describe('GIVEN a quarter with a single critical incident', () => {
    it('WHEN 1-hour critical outage occurs THEN uptime should reflect weighted downtime', () => {
      // Given: Q1 2025 with 1-hour critical outage on Feb 15
      // Q1 2025 has 90 days = 129,600 minutes
      // 1 hour critical (multiplier 1.0) = 60 minutes downtime
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const incidents = [
        createMockIncident(
          'crit-1',
          '2025-02-15T10:00:00Z',
          '2025-02-15T11:00:00Z',
          'critical',
          ['Git Operations']
        ),
      ];

      // When: Calculating SLA
      const result = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: Expected uptime = (129600 - 60) / 129600 * 100 = 99.9537%
      expect(result.totalDowntimeMinutes).toBe(60);
      expect(result.incidentCount).toBe(1);
      expect(result.uptimePercentage).toBeCloseTo(99.9537, 2);
      expect(result.slaViolation).toBe(false); // Still above 99.9%
      expect(result.serviceCredit).toBe(0);
    });
  });

  describe('GIVEN a quarter with multiple incidents of varying severity', () => {
    it('WHEN incidents have different impacts THEN downtime should be weighted accordingly', () => {
      // Given: Q1 2025 with:
      // - 2 hours minor (multiplier 0.25) = 30 minutes weighted downtime
      // - 1 hour major (multiplier 0.75) = 45 minutes weighted downtime
      // Total weighted downtime = 75 minutes
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const incidents = [
        createMockIncident(
          'minor-1',
          '2025-01-15T10:00:00Z',
          '2025-01-15T12:00:00Z', // 2 hours
          'minor',
          ['Git Operations']
        ),
        createMockIncident(
          'major-1',
          '2025-02-20T14:00:00Z',
          '2025-02-20T15:00:00Z', // 1 hour
          'major',
          ['Git Operations']
        ),
      ];

      // When: Calculating SLA
      const result = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: Weighted downtime should be 75 minutes
      expect(result.totalDowntimeMinutes).toBe(75);
      expect(result.incidentCount).toBe(2);
      // Expected uptime = (129600 - 75) / 129600 * 100 = 99.9421%
      expect(result.uptimePercentage).toBeCloseTo(99.9421, 2);
      expect(result.slaViolation).toBe(false);
    });
  });
});

describe('Service Credit Tests - Per GitHub SLA Policy', () => {
  describe('GIVEN uptime percentage thresholds', () => {
    it('WHEN uptime is exactly 99.9% THEN no violation and no service credit', () => {
      // Given: A quarter with exactly 99.9% uptime
      // Q1 2025 = 129,600 minutes (90 days)
      // For 99.9%: allowed downtime = 129.6 minutes
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const incidents = [
        createMockIncident(
          'crit-threshold',
          '2025-02-15T10:00:00Z',
          '2025-02-15T12:09:36Z', // 129.6 minutes
          'critical',
          ['Git Operations']
        ),
      ];

      // When: Calculating SLA
      const result = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: Should be exactly at threshold
      expect(result.uptimePercentage).toBeCloseTo(99.9, 1);
      expect(result.slaViolation).toBe(false);
      expect(result.serviceCredit).toBe(0);
    });

    it('WHEN uptime is 99.8% (below 99.9% but above 99.0%) THEN 10% service credit', () => {
      // Given: A quarter with 99.8% uptime
      // Q1 2025 = 129,600 minutes (90 days)
      // For 99.8%: downtime = 259.2 minutes
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const incidents = [
        createMockIncident(
          'crit-10pct',
          '2025-02-15T10:00:00Z',
          '2025-02-15T14:19:12Z', // 259.2 minutes
          'critical',
          ['Git Operations']
        ),
      ];

      // When: Calculating SLA
      const result = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: Should trigger 10% service credit
      expect(result.uptimePercentage).toBeCloseTo(99.8, 1);
      expect(result.slaViolation).toBe(true);
      expect(result.serviceCredit).toBe(10);
    });

    it('WHEN uptime is 98.5% (below 99.0%) THEN 25% service credit', () => {
      // Given: A quarter with 98.5% uptime
      // Q1 2025 = 129,600 minutes (90 days)
      // For 98.5%: downtime = 1,944 minutes
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const incidents = [
        createMockIncident(
          'crit-25pct',
          '2025-02-15T10:00:00Z',
          '2025-02-16T18:24:00Z', // 1,944 minutes (32.4 hours)
          'critical',
          ['Git Operations']
        ),
      ];

      // When: Calculating SLA
      const result = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: Should trigger 25% service credit
      expect(result.uptimePercentage).toBeCloseTo(98.5, 1);
      expect(result.slaViolation).toBe(true);
      expect(result.serviceCredit).toBe(25);
    });
  });
});

describe('Determinism Tests - Same Input Must Produce Same Output', () => {
  describe('GIVEN identical incident data', () => {
    it('WHEN calculated multiple times THEN results should be identical', () => {
      // Given: Same incident data
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const incidents = [
        createMockIncident(
          '1',
          '2025-02-15T10:00:00Z',
          '2025-02-15T11:30:00Z',
          'major',
          ['Git Operations']
        ),
        createMockIncident(
          '2',
          '2025-03-10T08:00:00Z',
          '2025-03-10T09:00:00Z',
          'minor',
          ['Git Operations']
        ),
      ];

      // When: Calculating SLA multiple times
      const result1 = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );
      const result2 = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );
      const result3 = calculateComponentSLA(
        incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: All results should be identical
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(result1.uptimePercentage).toBe(result2.uptimePercentage);
      expect(result1.totalDowntimeMinutes).toBe(result2.totalDowntimeMinutes);
    });

    it('WHEN dataset size increases with unrelated incidents THEN same quarter results remain unchanged', () => {
      // Given: Initial dataset with incidents in Q1 2025
      const quarterStart = getQuarterStart(2025, 1);
      const quarterEnd = getQuarterEnd(2025, 1);
      const q1Incidents = [
        createMockIncident(
          'q1-1',
          '2025-02-15T10:00:00Z',
          '2025-02-15T11:00:00Z',
          'critical',
          ['Git Operations']
        ),
      ];

      // When: Calculating with initial dataset
      const resultInitial = calculateComponentSLA(
        q1Incidents,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // And: Adding incidents from other quarters (Q2, Q3, Q4 2025)
      const expandedDataset = [
        ...q1Incidents,
        createMockIncident('q2-1', '2025-04-10T10:00:00Z', '2025-04-10T11:00:00Z', 'major'),
        createMockIncident('q3-1', '2025-07-15T10:00:00Z', '2025-07-15T12:00:00Z', 'critical'),
        createMockIncident('q4-1', '2025-10-20T10:00:00Z', '2025-10-20T11:30:00Z', 'minor'),
      ];

      // When: Calculating Q1 2025 again with expanded dataset
      const resultExpanded = calculateComponentSLA(
        expandedDataset,
        'Git Operations',
        quarterStart,
        quarterEnd
      );

      // Then: Q1 2025 results should remain identical
      expect(resultExpanded.uptimePercentage).toBe(resultInitial.uptimePercentage);
      expect(resultExpanded.totalDowntimeMinutes).toBe(resultInitial.totalDowntimeMinutes);
      expect(resultExpanded.incidentCount).toBe(resultInitial.incidentCount);
      expect(resultExpanded.slaViolation).toBe(resultInitial.slaViolation);
      expect(resultExpanded.serviceCredit).toBe(resultInitial.serviceCredit);
    });
  });
});

describe('Quarterly SLA Tests - All Components', () => {
  describe('GIVEN incidents affecting multiple components', () => {
    it('WHEN calculating quarterly SLA THEN each component should be calculated independently', () => {
      // Given: Q1 2025 with incidents affecting different components
      const incidents = [
        createMockIncident(
          'git-1',
          '2025-02-15T10:00:00Z',
          '2025-02-15T11:00:00Z',
          'critical',
          ['Git Operations']
        ),
        createMockIncident(
          'api-1',
          '2025-02-20T14:00:00Z',
          '2025-02-20T15:30:00Z',
          'major',
          ['API Requests']
        ),
      ];

      // When: Calculating quarterly SLA for all components
      const results = calculateQuarterlySLA(
        incidents,
        2025,
        1,
        [...GITHUB_SLA_COMPONENTS]
      );

      // Then: Should return results for all 8 components
      expect(results).toHaveLength(8);

      // And: Git Operations should have 1 incident with 60 minutes downtime
      const gitOps = results.find(r => r.componentName === 'Git Operations');
      expect(gitOps).toBeDefined();
      expect(gitOps!.incidentCount).toBe(1);
      expect(gitOps!.totalDowntimeMinutes).toBe(60);

      // And: API Requests should have 1 incident with 67.5 minutes weighted downtime
      const apiRequests = results.find(r => r.componentName === 'API Requests');
      expect(apiRequests).toBeDefined();
      expect(apiRequests!.incidentCount).toBe(1);
      expect(apiRequests!.totalDowntimeMinutes).toBe(68); // 90 * 0.75 = 67.5, rounded to 68

      // And: Other components should have 100% uptime
      const issues = results.find(r => r.componentName === 'Issues');
      expect(issues!.uptimePercentage).toBe(100);
      expect(issues!.incidentCount).toBe(0);
    });
  });
});

describe('Quarter Data Integration Tests', () => {
  describe('GIVEN calculateQuarterData function', () => {
    it('WHEN calculating quarter data THEN should return complete data structure', () => {
      // Given: Q1 2025 with mixed incidents
      const incidents = [
        createMockIncident(
          '1',
          '2025-02-15T10:00:00Z',
          '2025-02-15T11:00:00Z',
          'critical',
          ['Git Operations', 'API Requests']
        ),
        createMockIncident(
          '2',
          '2025-03-10T08:00:00Z',
          '2025-03-10T09:00:00Z',
          'minor',
          ['Issues']
        ),
      ];

      // When: Calculating quarter data
      const quarterData = calculateQuarterData(incidents, 2025, 1);

      // Then: Should return all required fields
      expect(quarterData.year).toBe(2025);
      expect(quarterData.quarter).toBe(1);
      expect(quarterData.quarterLabel).toBe('2025-Q1');
      expect(quarterData.startDate).toBeInstanceOf(Date);
      expect(quarterData.endDate).toBeInstanceOf(Date);
      expect(quarterData.slaResults).toHaveLength(8);
      expect(quarterData.totalIncidents).toBe(2);
      expect(quarterData.trackedIncidents).toBe(2);
      expect(quarterData.worstComponent).toBeDefined();
      expect(quarterData.quarterIncidents).toHaveLength(2);

      // And: worstComponent should have the lowest uptime
      const lowestUptime = Math.min(...quarterData.slaResults.map(r => r.uptimePercentage));
      expect(quarterData.worstComponent.uptimePercentage).toBe(lowestUptime);
    });
  });
});
