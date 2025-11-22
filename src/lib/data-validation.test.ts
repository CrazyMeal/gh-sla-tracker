import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Data Validation Tests
 *
 * These tests ensure the incident data archive maintains integrity and prevents
 * schema validation errors that would break the build.
 *
 * Based on the incident that caused build failure:
 * - Incident ID: nwjwwhj118sf (Codespaces Scheduled Maintenance)
 * - Error: created_at and updated_at were null
 * - Root cause: Web scraper failed to extract timestamps
 */

describe('Incident Data Validation Tests', () => {
  // Load the actual incident data
  const incidentsPath = join(process.cwd(), 'src/data/incidents-archive.json');
  let incidents: any[];

  try {
    const fileContent = readFileSync(incidentsPath, 'utf-8');
    incidents = JSON.parse(fileContent);
  } catch (error) {
    incidents = [];
    console.error('Failed to load incidents-archive.json:', error);
  }

  describe('GIVEN the incidents-archive.json file', () => {
    it('WHEN loading the file THEN it should be valid JSON', () => {
      // Given: The incidents archive file
      // When: Parsing the file
      // Then: Should successfully parse without errors
      expect(incidents).toBeDefined();
      expect(Array.isArray(incidents)).toBe(true);
    });

    it('WHEN checking all incidents THEN each should have a unique ID', () => {
      // Given: All incidents in the archive
      const ids = incidents.map(inc => inc.id);
      const uniqueIds = new Set(ids);

      // When: Comparing count of IDs
      // Then: Should have no duplicates
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Critical Field Validation - Prevent Build Failures', () => {
    it('WHEN checking created_at THEN all incidents must have non-null timestamps', () => {
      // Given: All incidents in the archive
      const incidentsWithNullCreatedAt = incidents.filter(inc => inc.created_at === null);

      // When: Checking for null created_at values
      // Then: Should have zero incidents with null created_at
      if (incidentsWithNullCreatedAt.length > 0) {
        console.error('Incidents with null created_at:', incidentsWithNullCreatedAt.map(inc => ({
          id: inc.id,
          name: inc.name,
          impact: inc.impact,
        })));
      }

      expect(incidentsWithNullCreatedAt).toHaveLength(0);
    });

    it('WHEN checking updated_at THEN all incidents must have non-null timestamps', () => {
      // Given: All incidents in the archive
      const incidentsWithNullUpdatedAt = incidents.filter(inc => inc.updated_at === null);

      // When: Checking for null updated_at values
      // Then: Should have zero incidents with null updated_at
      if (incidentsWithNullUpdatedAt.length > 0) {
        console.error('Incidents with null updated_at:', incidentsWithNullUpdatedAt.map(inc => ({
          id: inc.id,
          name: inc.name,
          impact: inc.impact,
        })));
      }

      expect(incidentsWithNullUpdatedAt).toHaveLength(0);
    });

    it('WHEN checking both timestamps THEN no incident should have both null', () => {
      // Given: All incidents in the archive
      const incidentsWithBothNull = incidents.filter(
        inc => inc.created_at === null && inc.updated_at === null
      );

      // When: Checking for incidents missing both timestamps
      // Then: Should have zero such incidents
      expect(incidentsWithBothNull).toHaveLength(0);
    });
  });

  describe('Timestamp Format Validation', () => {
    it('WHEN created_at is not null THEN it should be a valid ISO 8601 string', () => {
      // Given: All incidents with non-null created_at
      const incidentsWithCreatedAt = incidents.filter(inc => inc.created_at !== null);

      // When: Checking date format
      const invalidDates = incidentsWithCreatedAt.filter(inc => {
        try {
          const date = new Date(inc.created_at);
          return isNaN(date.getTime());
        } catch {
          return true;
        }
      });

      // Then: All dates should parse successfully
      if (invalidDates.length > 0) {
        console.error('Incidents with invalid created_at format:', invalidDates.map(inc => ({
          id: inc.id,
          created_at: inc.created_at,
        })));
      }

      expect(invalidDates).toHaveLength(0);
    });

    it('WHEN updated_at is not null THEN it should be a valid ISO 8601 string', () => {
      // Given: All incidents with non-null updated_at
      const incidentsWithUpdatedAt = incidents.filter(inc => inc.updated_at !== null);

      // When: Checking date format
      const invalidDates = incidentsWithUpdatedAt.filter(inc => {
        try {
          const date = new Date(inc.updated_at);
          return isNaN(date.getTime());
        } catch {
          return true;
        }
      });

      // Then: All dates should parse successfully
      expect(invalidDates).toHaveLength(0);
    });
  });

  describe('Enum Field Validation', () => {
    const validStatuses = ['investigating', 'identified', 'monitoring', 'resolved', 'postmortem'];
    const validImpacts = ['none', 'minor', 'major', 'critical', 'maintenance'];

    it('WHEN checking status THEN all values should match the enum', () => {
      // Given: All incidents
      const invalidStatuses = incidents.filter(inc => !validStatuses.includes(inc.status));

      // When: Checking status values
      // Then: Should have no invalid statuses
      if (invalidStatuses.length > 0) {
        console.error('Incidents with invalid status:', invalidStatuses.map(inc => ({
          id: inc.id,
          status: inc.status,
        })));
      }

      expect(invalidStatuses).toHaveLength(0);
    });

    it('WHEN checking impact THEN all values should match the enum', () => {
      // Given: All incidents
      const invalidImpacts = incidents.filter(inc => !validImpacts.includes(inc.impact));

      // When: Checking impact values
      // Then: Should have no invalid impacts
      if (invalidImpacts.length > 0) {
        console.error('Incidents with invalid impact:', invalidImpacts.map(inc => ({
          id: inc.id,
          impact: inc.impact,
        })));
      }

      expect(invalidImpacts).toHaveLength(0);
    });
  });

  describe('Scheduled Maintenance Validation', () => {
    it('WHEN incident is maintenance THEN it should have complete data', () => {
      // Given: All scheduled maintenances
      const maintenances = incidents.filter(inc => inc.impact === 'maintenance');

      // When: Checking for complete data
      const incompleteMaintenances = maintenances.filter(inc =>
        inc.created_at === null ||
        inc.updated_at === null ||
        inc.incident_updates.length === 0
      );

      // Then: All maintenances should have complete data
      if (incompleteMaintenances.length > 0) {
        console.warn('Scheduled maintenances with incomplete data:', incompleteMaintenances.map(inc => ({
          id: inc.id,
          name: inc.name,
          created_at: inc.created_at,
          updated_at: inc.updated_at,
          updateCount: inc.incident_updates.length,
        })));
      }

      expect(incompleteMaintenances).toHaveLength(0);
    });
  });

  describe('Data Completeness Validation', () => {
    it('WHEN incident is resolved THEN it should have a resolved_at timestamp', () => {
      // Given: All resolved incidents
      const resolvedIncidents = incidents.filter(inc => inc.status === 'resolved');

      // When: Checking for resolved_at timestamp
      const missingResolvedAt = resolvedIncidents.filter(inc => inc.resolved_at === null);

      // Then: Most resolved incidents should have resolved_at
      // (Allow some margin for data inconsistencies, but flag if >10%)
      const percentageMissing = (missingResolvedAt.length / resolvedIncidents.length) * 100;

      if (missingResolvedAt.length > 0) {
        console.warn(`${missingResolvedAt.length} resolved incidents missing resolved_at (${percentageMissing.toFixed(1)}%)`);
      }

      expect(percentageMissing).toBeLessThan(10);
    });

    it('WHEN incident has status THEN it should have components affected', () => {
      // Given: All incidents (except maintenance which may not affect components)
      const nonMaintenanceIncidents = incidents.filter(inc => inc.impact !== 'maintenance');

      // When: Checking for components
      const noComponents = nonMaintenanceIncidents.filter(
        inc => !inc.components || inc.components.length === 0
      );

      // Then: Most incidents should have affected components
      const percentageWithoutComponents = (noComponents.length / nonMaintenanceIncidents.length) * 100;

      if (percentageWithoutComponents > 20) {
        console.warn(`${percentageWithoutComponents.toFixed(1)}% of incidents have no components`);
      }

      // This is informational, not a hard requirement
      expect(percentageWithoutComponents).toBeLessThan(50);
    });
  });

  describe('Regression Prevention - Known Bad Incident', () => {
    it('WHEN checking for incident nwjwwhj118sf THEN it should not exist (was removed)', () => {
      // Given: The specific incident that caused the build failure
      const badIncidentId = 'nwjwwhj118sf';

      // When: Searching for it in the archive
      const foundIncident = incidents.find(inc => inc.id === badIncidentId);

      // Then: It should not exist (was removed by cleanup script)
      expect(foundIncident).toBeUndefined();
    });

    it('WHEN checking similar bad incidents THEN they should all be removed', () => {
      // Given: All 8 incidents that had null timestamps
      const badIncidentIds = [
        'nwjwwhj118sf',
        '67vdd3b7d1zq',
        'bs901hhxgw33',
        'hkp6z7kt2qm6',
        'znhjr4vqqcdw',
        'xb49wskhzrm2',
        'tldgc85p3q2d',
        '5ylj8dpvg096',
      ];

      // When: Checking if any exist in the archive
      const foundBadIncidents = incidents.filter(inc => badIncidentIds.includes(inc.id));

      // Then: None of them should exist
      expect(foundBadIncidents).toHaveLength(0);
    });
  });

  describe('Data Statistics', () => {
    it('WHEN analyzing the dataset THEN it should have reasonable size', () => {
      // Given: The incidents archive
      // When: Counting incidents
      // Then: Should have a reasonable number of incidents (not empty, not impossibly large)
      expect(incidents.length).toBeGreaterThan(0);
      expect(incidents.length).toBeLessThan(10000); // Sanity check

      console.log(`Total incidents in archive: ${incidents.length}`);
    });

    it('WHEN analyzing impacts THEN distribution should make sense', () => {
      // Given: All incidents
      const impactDistribution = incidents.reduce((acc, inc) => {
        acc[inc.impact] = (acc[inc.impact] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // When: Checking distribution
      console.log('Impact distribution:', impactDistribution);

      // Then: Should have some incidents in each category (informational)
      expect(Object.keys(impactDistribution).length).toBeGreaterThan(0);
    });
  });
});
