
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const archivePath = path.join(__dirname, '../src/data/incidents-archive.json');

async function repair() {
    console.log('🔧 Repairing incidents archive...');

    try {
        const data = await fs.readFile(archivePath, 'utf-8');
        const incidents = JSON.parse(data);
        let fixedCount = 0;

        const repaired = incidents.map(incident => {
            if (incident.status === 'resolved' && !incident.resolved_at) {
                console.log(`  Fixing incident ${incident.id} (${incident.name})`);

                // Use updated_at as fallback
                // Or find the 'resolved' update
                let resolvedDate = incident.updated_at;

                if (incident.incident_updates && incident.incident_updates.length > 0) {
                    const resolvedUpdate = incident.incident_updates.find(u => u.status === 'resolved');
                    if (resolvedUpdate) {
                        resolvedDate = resolvedUpdate.created_at;
                    } else {
                        // Use the last update
                        resolvedDate = incident.incident_updates[0].created_at;
                    }
                }

                console.log(`    Set resolved_at to ${resolvedDate}`);
                fixedCount++;
                return {
                    ...incident,
                    resolved_at: resolvedDate
                };
            }
            return incident;
        });

        if (fixedCount > 0) {
            await fs.writeFile(archivePath, JSON.stringify(repaired, null, 2));
            console.log(`✅ Fixed ${fixedCount} incidents.`);
        } else {
            console.log('✨ No incidents needed repair.');
        }

    } catch (err) {
        console.error('❌ Failed to repair:', err);
    }
}

repair();
