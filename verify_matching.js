
const incident = {
    id: "k7bhmjkblcwp",
    name: "Incident with Webhooks",
    data: {
        components: [
            { name: "Git Operations" },
            { name: "Webhooks" },
            { name: "and Pages" } // The problematic name
        ]
    }
};

const componentName = "Pages";
const isMatch = incident.data.components.some(c => c.name === componentName);

console.log(`Checking if incident matches '${componentName}':`, isMatch);
console.log("Component names found:", incident.data.components.map(c => c.name));

// Proposed fix verification
function normalizeComponentName(name) {
    return name.replace(/^and\s+/i, '').trim();
}

const isMatchFixed = incident.data.components.some(c => normalizeComponentName(c.name) === componentName);
console.log(`Checking with normalization:`, isMatchFixed);
