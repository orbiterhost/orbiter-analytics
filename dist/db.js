import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
class TrafficDB {
    dbPath;
    db = null;
    constructor(dbPath = ":memory:") {
        this.dbPath = dbPath;
    }
    async initialize() {
        // Open database connection
        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database,
        });
        // Create traffic table with indexes
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS traffic (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                path TEXT,                
                user_agent TEXT,
                ip_address TEXT,
                country TEXT, 
                city TEXT,
                referrer TEXT,
                created_at INTEGER DEFAULT (unixepoch())
            );

            CREATE INDEX IF NOT EXISTS idx_site_timestamp 
            ON traffic(site_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_id_site_timestamp
            ON traffic(id, site_id, timestamp);

            CREATE INDEX IF NOT EXISTS idx_referrer
            ON traffic(referrer);
        `);
    }
    async recordTraffic({ siteId, path, userAgent, ipAddress, country, city, referrer, timestamp = Date.now(), }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        const stmt = await this.db.prepare(`
            INSERT INTO traffic (
                site_id, timestamp, path, user_agent, ip_address, country, city, referrer
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await stmt.run(siteId, timestamp, path, userAgent, ipAddress, country, city, referrer);
        await stmt.finalize();
        console.log("RECORDED");
    }
    async *queryTrafficStream({ siteId, startTime, endTime, batchSize = 1000, }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        let lastId = 0;
        while (true) {
            const stmt = await this.db.prepare(`
                SELECT * FROM traffic
                WHERE site_id = ?
                AND timestamp >= ?
                AND timestamp <= ?
                AND id > ?
                ORDER BY id ASC
                LIMIT ?
            `);
            const batch = await stmt.all(siteId, startTime, endTime, lastId, batchSize);
            await stmt.finalize();
            if (batch.length === 0) {
                break;
            }
            for (const record of batch) {
                yield record;
                lastId = record.id;
            }
        }
    }
    async queryTraffic(params) {
        const results = [];
        for await (const record of this.queryTrafficStream(params)) {
            results.push(record);
        }
        return results;
    }
    async getDailyViews({ siteId, startTime, endTime }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        return this.db.all(`
      WITH RECURSIVE dates(date) AS (
        SELECT date(?, 'unixepoch')
        UNION ALL
        SELECT date(date, '+1 day')
        FROM dates
        WHERE date < date(?, 'unixepoch')
      )
      SELECT 
        dates.date,
        COUNT(traffic.id) as count
      FROM dates
      LEFT JOIN traffic ON (
        traffic.site_id = ? AND
        date(traffic.created_at, 'unixepoch') = dates.date
      )
      GROUP BY dates.date
      ORDER BY dates.date ASC
    `, [
            Math.floor(startTime / 1000), // Convert to Unix timestamp in seconds
            Math.floor(endTime / 1000), // Convert to Unix timestamp in seconds
            siteId
        ]);
    }
    async getDailyViewsByPath({ siteId, startTime, endTime, path }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        return this.db.all(`
      WITH RECURSIVE dates(date) AS (
        SELECT date(?, 'unixepoch')
        UNION ALL
        SELECT date(date, '+1 day')
        FROM dates
        WHERE date < date(?, 'unixepoch')
      )
      SELECT 
        dates.date,
        COUNT(traffic.id) as count
      FROM dates
      LEFT JOIN traffic ON (
        traffic.site_id = ? AND
        date(traffic.created_at, 'unixepoch') = dates.date
        ${path ? 'AND traffic.path = ?' : ''}
      )
      GROUP BY dates.date
      ORDER BY dates.date ASC
    `, [
            Math.floor(startTime / 1000), // Convert to Unix timestamp in seconds
            Math.floor(endTime / 1000), // Convert to Unix timestamp in seconds
            siteId,
            ...(path ? [path] : [])
        ]);
    }
    async getTrafficStats({ siteId, startTime, endTime, }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        const basicStats = await this.db.get(`
            SELECT 
                COUNT(*) as total_requests,                                
                COUNT(DISTINCT ip_address) as unique_visitors
            FROM traffic
            WHERE site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
        `, [siteId, startTime, endTime]);
        if (!basicStats) {
            throw new Error("Failed to retrieve traffic stats");
        }
        // Get top referrers separately
        const topReferrers = await this.db.all(`
            SELECT 
                COALESCE(referrer, '(direct)') as referrer,
                COUNT(*) as count
            FROM traffic
            WHERE site_id = ?
            AND timestamp >= ?
            AND timestamp <= ?
            GROUP BY referrer
            ORDER BY count DESC
            LIMIT 10
        `, [siteId, startTime, endTime]);
        return {
            ...basicStats,
            top_referrers: topReferrers,
        };
    }
    async getReferrerBreakdown({ siteId, startTime, endTime, }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        return this.db.all(`
            WITH referrer_counts AS (
                SELECT 
                    COALESCE(referrer, '(direct)') as referrer,
                    COUNT(*) as count
                FROM traffic
                WHERE site_id = ?
                AND timestamp >= ?
                AND timestamp <= ?
                GROUP BY referrer
            ),
            total_count AS (
                SELECT SUM(count) as total
                FROM referrer_counts
            )
            SELECT 
                referrer_counts.referrer,
                referrer_counts.count,
                ROUND(CAST(referrer_counts.count AS FLOAT) / total_count.total * 100, 2) as percentage
            FROM referrer_counts, total_count
            ORDER BY count DESC
        `, [siteId, startTime, endTime]);
    }
    async getPathsBreakdown({ siteId, startTime, endTime, }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        return this.db.all(`
      WITH path_counts AS (
        SELECT
          COALESCE(path, '(no path)') as path,
          COUNT(*) as count
        FROM traffic
        WHERE site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY path
      ),
      total_count AS (
        SELECT SUM(count) as total
        FROM path_counts
      )
      SELECT
        path_counts.path,
        path_counts.count,
        ROUND(CAST(path_counts.count AS FLOAT) / total_count.total * 100, 2) as percentage
      FROM path_counts, total_count
      ORDER BY count DESC
      `, [siteId, startTime, endTime]);
    }
    async getLatestTraffic(siteId) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        let query = `
          SELECT *
          FROM traffic
          ${siteId ? "WHERE site_id = ?" : ""}
          ORDER BY id DESC
          LIMIT 100
        `;
        const params = siteId ? [siteId] : [];
        const results = await this.db.all(query, params);
        if (!results) {
            return [];
        }
        return results;
    }
    async getCountryBreakdown({ siteId, startTime, endTime, }) {
        if (!this.db) {
            throw new Error("Database not initialized");
        }
        //  @ts-ignore
        return this.db.all(`
      WITH country_counts AS (
        SELECT
          COALESCE(country, '(unknown)') as country,
          COUNT(*) as count
        FROM traffic
        WHERE site_id = ?
          AND timestamp >= ?
          AND timestamp <= ?
        GROUP BY country
      ),
      total_count AS (
        SELECT SUM(count) as total
        FROM country_counts
      )
      SELECT
        country_counts.country,
        country_counts.count,
        ROUND(CAST(country_counts.count AS FLOAT) / total_count.total * 100, 2) as percentage
      FROM country_counts, total_count
      ORDER BY count DESC
      `, [siteId, startTime, endTime]);
    }
    async close() {
        if (this.db) {
            await this.db.close();
        }
    }
}
export default TrafficDB;
