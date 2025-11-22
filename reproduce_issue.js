const incident = {
    id: "9zq8p50p7tkh",
    name: "Incident with Git Operations, API Requests, Actions, Pages, Issues and Copilot",
    status: "investigating",
    incident_updates: [
        {
            "id": "update_2",
            "status": "resolved",
            "body": "This incident has been resolved.",
            "created_at": "2024-04-10T19:03:00.000Z",
            "displayed_at": null
        }
    ],
    data: {
        started_at: null,
        created_at: "2024-04-10T18:41:00.000Z",
        resolved_at: null,
        status: "investigating", // Wait, if it is investigating, it IS ongoing?
        impact: "major",
        components: [{ name: "Pages" }],
        incident_updates: [
            {
                "id": "update_2",
                "status": "resolved",
                "body": "This incident has been resolved.",
                "created_at": "2024-04-10T19:03:00.000Z",
                "displayed_at": null
            }
        ]
    }
};

// Wait, if the status is "investigating", then it IS ongoing.
// Why did I think it was resolved?
// Because update_2 says "This incident has been resolved."
// And update_3 says "operating normally".
// But the top level status is "investigating".
// This means the scraper failed to update the top level status.

// If the scraper failed, the data is "wrong".
// But the calculator should be robust.
// If the incident is from April 2024, and it is now Nov 2025.
// It is unlikely to be still investigating.

// However, if the status IS investigating, we should treat it as ongoing.
// But 39 days of downtime for Pages in Q4 2025 is clearly wrong if the incident was actually resolved in April 2024.

// The user says "Pages got only 1 incident... duration of 1h 55m".
// This implies the user KNOWS it is resolved.
// But the data says otherwise.

// If I fix the code to check for "resolved" status, it won't help if status is "investigating".
// I might need to check the updates?

// Let's verify the calculation first.

function getImpactMultiplier(impact) {
    const multipliers = {
        'none': 0,
        'minor': 0.25,
        'major': 0.75,
        'critical': 1.0,
        'maintenance': 0,
    };
    return multipliers[impact] ?? 0.5;
}

function calculateComponentSLA(incidents, componentName, startDate, endDate) {
    const relevantIncidents = incidents.filter(incident => {
        const incidentStart = new Date(incident.data.started_at || incident.data.created_at);
        const incidentEnd = incident.data.resolved_at
            ? new Date(incident.data.resolved_at)
            : new Date();

        const affectsComponent = incident.data.components && incident.data.components.some(c => c.name === componentName);

        return affectsComponent && incidentStart < endDate && incidentEnd > startDate;
    });

    const timePoints = new Set();
    timePoints.add(startDate.getTime());
    timePoints.add(endDate.getTime());

    relevantIncidents.forEach(inc => {
        const start = new Date(inc.data.started_at || inc.data.created_at).getTime();
        const end = inc.data.resolved_at ? new Date(inc.data.resolved_at).getTime() : new Date().getTime();

        const clampedStart = Math.max(start, startDate.getTime());
        const clampedEnd = Math.min(end, endDate.getTime());

        if (clampedStart < clampedEnd) {
            timePoints.add(clampedStart);
            timePoints.add(clampedEnd);
        }
    });

    const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

    let totalWeightedDowntimeMinutes = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const p1 = sortedPoints[i];
        const p2 = sortedPoints[i + 1];

        if (p1 === p2) continue;

        const midPoint = (p1 + p2) / 2;
        let maxImpact = 0;

        for (const inc of relevantIncidents) {
            const start = new Date(inc.data.started_at || inc.data.created_at).getTime();
            const end = inc.data.resolved_at ? new Date(inc.data.resolved_at).getTime() : new Date().getTime();

            if (start <= midPoint && end >= midPoint) {
                const impact = getImpactMultiplier(inc.data.impact);
                if (impact > maxImpact) maxImpact = impact;
            }
        }

        const durationMinutes = (p2 - p1) / (1000 * 60);
        totalWeightedDowntimeMinutes += durationMinutes * maxImpact;
    }

    return totalWeightedDowntimeMinutes;
}

const startDate = new Date("2025-10-01T00:00:00Z");
const endDate = new Date("2025-12-31T23:59:59Z"); // Q4
const now = new Date("2025-11-22T12:28:57-05:00"); // Current time from prompt

// Mock Date.now or just pass the current time implicitly?
// The code uses new Date() for ongoing.
// I need to override Date constructor or just assume the script runs at "now".
// I'll just use a fixed "now" in the logic by replacing new Date() with myNow.

const myNow = new Date("2025-11-22T17:28:57Z"); // UTC


// Mocking the new getIncidentEndTime logic
function getIncidentEndTime(incident) {
    // 1. Explicit resolved_at
    if (incident.data.resolved_at) {
        return new Date(incident.data.resolved_at);
    }

    // 2. Check updates for "resolved" status
    if (incident.incident_updates) { // Note: In the script I used incident_updates at top level for the mock object
        const resolvedUpdate = incident.incident_updates.find(u => u.status === 'resolved');
        if (resolvedUpdate) {
            return new Date(resolvedUpdate.created_at);
        }
    }

    // 3. Fallback: if status is resolved but no date, use updated_at
    if (incident.data.status === 'resolved') {
        return new Date(incident.data.updated_at);
    }

    // 4. Ongoing incident
    return myNow;
}

// Modified function for testing
function calculateComponentSLA_Test(incidents, componentName, startDate, endDate) {
    const relevantIncidents = incidents.filter(incident => {
        const incidentStart = new Date(incident.data.started_at || incident.data.created_at);
        const incidentEnd = getIncidentEndTime(incident);

        const affectsComponent = incident.data.components && incident.data.components.some(c => c.name === componentName);

        return affectsComponent && incidentStart < endDate && incidentEnd > startDate;
    });

    const timePoints = new Set();
    timePoints.add(startDate.getTime());
    timePoints.add(endDate.getTime());

    relevantIncidents.forEach(inc => {
        const start = new Date(inc.data.started_at || inc.data.created_at).getTime();
        const end = getIncidentEndTime(inc).getTime();

        const clampedStart = Math.max(start, startDate.getTime());
        const clampedEnd = Math.min(end, endDate.getTime());

        if (clampedStart < clampedEnd) {
            timePoints.add(clampedStart);
            timePoints.add(clampedEnd);
        }
    });

    const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

    let totalWeightedDowntimeMinutes = 0;

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const p1 = sortedPoints[i];
        const p2 = sortedPoints[i + 1];

        if (p1 === p2) continue;

        const midPoint = (p1 + p2) / 2;
        let maxImpact = 0;

        for (const inc of relevantIncidents) {
            const start = new Date(inc.data.started_at || inc.data.created_at).getTime();
            const end = getIncidentEndTime(inc).getTime();

            if (start <= midPoint && end >= midPoint) {
                const impact = getImpactMultiplier(inc.data.impact);
                if (impact > maxImpact) maxImpact = impact;
            }
        }

        const durationMinutes = (p2 - p1) / (1000 * 60);
        totalWeightedDowntimeMinutes += durationMinutes * maxImpact;
    }

    return totalWeightedDowntimeMinutes;
}

const downtimeMinutes = calculateComponentSLA_Test([incident], "Pages", startDate, endDate);
console.log("Downtime Minutes:", downtimeMinutes);
console.log("Downtime Days:", downtimeMinutes / (60 * 24));
