
const incident = {
    id: "wl09fvhb20x8",
    name: "Incident on 2022-09-06 22:56 UTC",
    data: {
        created_at: "2022-09-06T22:56:00.000Z",
        resolved_at: "2025-09-07T00:08:00.000Z", // Incorrect year (2025)
        status: "resolved",
        incident_updates: [
            {
                "id": "update_0",
                "status": "resolved",
                "body": "Everything is operating normally.",
                "created_at": "2022-09-07T00:08:00.000Z", // Correct year (2022)
                "displayed_at": null
            }
        ]
    }
};

// Mocking the NEW logic
function getIncidentEndTime(incident) {
    // 1. Check updates for "resolved" status (PRIORITY)
    if (incident.data.incident_updates) {
        const resolvedUpdate = incident.data.incident_updates.find(u => u.status === 'resolved');
        if (resolvedUpdate) {
            return new Date(resolvedUpdate.created_at);
        }
    }

    // 2. Explicit resolved_at
    if (incident.data.resolved_at) {
        return new Date(incident.data.resolved_at);
    }

    // 3. Fallback: if status is resolved but no date, use updated_at
    if (incident.data.status === 'resolved') {
        return new Date(incident.data.updated_at);
    }

    // 4. Ongoing incident
    return new Date();
}

const endTime = getIncidentEndTime(incident);
console.log("Resolved At (Data):", incident.data.resolved_at);
console.log("Resolved Update:", incident.data.incident_updates[0].created_at);
console.log("Calculated End Time:", endTime.toISOString());

if (endTime.getFullYear() === 2022) {
    console.log("SUCCESS: Logic correctly prioritizes update timestamp.");
} else {
    console.log("FAILURE: Logic still uses incorrect resolved_at timestamp.");
}
