import TrafficDB from "./db.js";
const SITE_ID = 'test-site-1';
const NUM_RECORDS = 1200;
// Common referrers with weighted distribution
const REFERRERS = {
    'https://google.com': 35,
    'https://twitter.com': 20,
    'https://facebook.com': 15,
    'https://github.com': 10,
    'https://hn.algolia.com': 8,
    'https://linkedin.com': 7,
    null: 5 // direct traffic
};
const PATHS = [
    '/',
    '/blog',
    '/about',
    '/contact',
    '/products',
    '/pricing',
    '/docs',
    '/api'
];
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15',
    'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36'
];
const LOCATIONS = [
    { country: 'US', city: 'San Francisco' },
    { country: 'US', city: 'New York' },
    { country: 'GB', city: 'London' },
    { country: 'DE', city: 'Berlin' },
    { country: 'JP', city: 'Tokyo' },
    { country: 'IN', city: 'Bangalore' },
    { country: 'BR', city: 'Sao Paulo' }
];
function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}
function getWeightedReferrer() {
    const rand = Math.random() * 100;
    let sum = 0;
    for (const [referrer, weight] of Object.entries(REFERRERS)) {
        sum += weight;
        if (rand <= sum) {
            return referrer;
        }
    }
    return null;
}
function generateIPv4() {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
}
export async function generateTestData() {
    const db = new TrafficDB('traffic.db');
    await db.initialize();
    // Generate records over the last 30 days
    const endTime = Date.now();
    const startTime = endTime - (30 * 24 * 60 * 60 * 1000); // 30 days ago
    console.log('Generating test data...');
    for (let i = 0; i < NUM_RECORDS; i++) {
        // Create more records in recent days (exponential distribution)
        const randomFactor = Math.pow(Math.random(), 2);
        const timestamp = startTime + (endTime - startTime) * randomFactor;
        const location = getRandomItem(LOCATIONS);
        await db.recordTraffic({
            siteId: SITE_ID,
            path: getRandomItem(PATHS),
            userAgent: getRandomItem(USER_AGENTS),
            ipAddress: generateIPv4(),
            country: location.country,
            city: location.city,
            referrer: getWeightedReferrer() || "",
            timestamp
        });
        if (i % 100 === 0) {
            console.log(`Generated ${i} records...`);
        }
    }
    console.log('Test data generation complete!');
    // Test query to verify data
    const stats = await db.getTrafficStats({
        siteId: SITE_ID,
        startTime,
        endTime
    });
    console.log('\nGenerated Data Statistics:');
    console.log('Total Requests:', stats.total_requests);
    console.log('Unique Visitors:', stats.unique_visitors);
    console.log('\nTop Referrers:');
    stats.top_referrers.forEach(({ referrer, count }) => {
        console.log(`${referrer}: ${count} visits`);
    });
    await db.close();
}
