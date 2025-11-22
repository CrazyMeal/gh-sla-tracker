
import fs from 'fs';
import path from 'path';

const archivePath = path.join(process.cwd(), 'src/data/incidents-archive.json');

try {
    const rawData = fs.readFileSync(archivePath, 'utf-8');
    const incidents = JSON.parse(rawData);

    console.log(`Total incidents before cleanup: ${incidents.length}`);

    const validIncidents = incidents.filter(incident => incident.created_at !== null);

    console.log(`Total incidents after cleanup: ${validIncidents.length}`);
    console.log(`Removed ${incidents.length - validIncidents.length} invalid incidents.`);

    fs.writeFileSync(archivePath, JSON.stringify(validIncidents, null, 2));
    console.log('Successfully updated incidents-archive.json');

} catch (error) {
    console.error('Error cleaning incidents:', error);
    process.exit(1);
}
