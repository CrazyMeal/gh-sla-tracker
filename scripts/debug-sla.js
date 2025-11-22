
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock data loading
const incidentsPath = path.join(__dirname, '../src/data/incidents-archive.json');
const incidents = JSON.parse(fs.readFileSync(incidentsPath, 'utf-8'));

// Mock Utils
function getDurationMinutes(start, end) {
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

function getImpactMultiplier(impact) {
    const multipliers = {
        'none': 0,
        'minor': 0.25,
        'major': 0.75,
        'critical': 1.0,
    };
    return multipliers[impact] || 0.5;
}

// Debug Function
function debugComponentSLA(componentName) {
    console.log(`\n🔍 Debugging SLA for: ${componentName}`);

    const startDate = new Date('2025-10-01T00:00:00Z');
    const endDate = new Date('2025-12-31T23:59:59.999Z');

    console.log(`Period: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Filter
    const relevantIncidents = incidents.filter(incident => {
        const incidentStart = new Date(incident.started_at || incident.created_at);
        const incidentEnd = incident.resolved_at
            ? new Date(incident.resolved_at)
            : new Date();

        const affectsComponent = incident.components && incident.components.some(c => c.name === componentName);

        // Check overlap
        const overlaps = incidentStart < endDate && incidentEnd > startDate;

        if (affectsComponent && overlaps) {
            console.log(`\n[MATCH] Incident ${incident.id}: ${incident.name}`);
            console.log(`  Impact: ${incident.impact} (${getImpactMultiplier(incident.impact)})`);
            console.log(`  Raw: ${incidentStart.toISOString()} - ${incidentEnd.toISOString()}`);

            const clampedStart = incidentStart < startDate ? startDate : incidentStart;
            const clampedEnd = incidentEnd > endDate ? endDate : incidentEnd;
            console.log(`  Clamped: ${clampedStart.toISOString()} - ${clampedEnd.toISOString()}`);
            console.log(`  Duration: ${getDurationMinutes(clampedStart, clampedEnd)} mins`);
        }

        return affectsComponent && overlaps;
    });

    // Interval Merging Logic
    const timePoints = new Set();
    timePoints.add(startDate.getTime());
    timePoints.add(endDate.getTime());

    relevantIncidents.forEach(inc => {
        const start = new Date(inc.started_at || inc.created_at).getTime();
        const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : new Date().getTime();

        const clampedStart = Math.max(start, startDate.getTime());
        const clampedEnd = Math.min(end, endDate.getTime());

        if (clampedStart < clampedEnd) {
            timePoints.add(clampedStart);
            timePoints.add(clampedEnd);
        }
    });

    const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);
    console.log(`\nFound ${sortedPoints.length} time points`);

    let totalWeightedDowntimeMinutes = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const p1 = sortedPoints[i];
        const p2 = sortedPoints[i + 1];

        if (p1 === p2) continue;

        const midPoint = (p1 + p2) / 2;
        let maxImpact = 0;
        let contributingIncidents = [];

        for (const inc of relevantIncidents) {
            const start = new Date(inc.started_at || inc.created_at).getTime();
            const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : new Date().getTime();

            if (start <= midPoint && end >= midPoint) {
                const impact = getImpactMultiplier(inc.impact);
                if (impact > maxImpact) maxImpact = impact;
                contributingIncidents.push(inc.id);
            }
        }

        const durationMinutes = (p2 - p1) / (1000 * 60);
        const weighted = durationMinutes * maxImpact;

        if (weighted > 0) {
            console.log(`  Interval ${new Date(p1).toISOString()} - ${new Date(p2).toISOString()}`);
            console.log(`    Duration: ${durationMinutes.toFixed(2)}m, Max Impact: ${maxImpact}`);
            console.log(`    Incidents: ${contributingIncidents.join(', ')}`);
            console.log(`    Weighted: ${weighted.toFixed(2)}m`);
            totalWeightedDowntimeMinutes += weighted;
        }
    }

    console.log(`\nTotal Weighted Downtime: ${totalWeightedDowntimeMinutes.toFixed(2)} minutes`);
    console.log(`Total Weighted Downtime: ${(totalWeightedDowntimeMinutes / 60 / 24).toFixed(2)} days`);
}

debugComponentSLA('Git Operations');
