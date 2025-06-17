import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import TrafficDB from "./db.js";
import { generateTestData } from "./testData.js";
import dotenv from "dotenv";
import { checkDiskSpace, monitorDiskSpace } from "./monitor.js";
import cron from "node-cron";
import { PinataSDK } from "pinata";
import fs from "fs";
import { File, Blob } from "formdata-node";
dotenv.config();

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: process.env.PINATA_GATEWAY_URL,
});

const app = new Hono();

const db = new TrafficDB("traffic.db");
await db.initialize();

const backupDatabase = async () => {
  try {
    console.log("backing up db");

    const buffer = fs.readFileSync("./traffic.db");
    const blob = new Blob([buffer]);
    const file = new File([blob], `orbiter-analytics-db-${new Date()}`, {
      type: "text/plain",
    });
    const upload = await pinata.upload.private
      .file(file)
      .group("019501f1-c849-74df-aa3e-d92218097fef");
    console.log(upload);
  } catch (error) {
    console.log("DB backup failed");
    console.log(error);
  }
};

const restoreDatabase = async () => {
  try {
    const files = await pinata.files.private
      .list()
      .group("019501f1-c849-74df-aa3e-d92218097fef");
    const file = files.files[0];
    const response = await pinata.gateways.private.get(file.cid);

    if (!response || !response.data) {
      throw new Error("Failed to retrieve database backup");
    }

    // The data property can be different types - we need to check if it's a Blob
    if (!(response.data instanceof Blob)) {
      throw new Error(
        `Expected Blob response but received ${typeof response.data}`
      );
    }

    // Convert Blob to Buffer for Node.js fs operations
    const arrayBuffer = await response.data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    // Close the current database connection if it exists
    if (db && typeof db.close === "function") {
      await db.close();
      console.log("Closed existing database connection");
    }

    // Write the file to disk
    fs.writeFileSync("./traffic.db", buffer);
    console.log("Database file written to disk");

    // Reinitialize the database connection
    await db.initialize();
    console.log("Database connection reinitialized");

    console.log("Database successfully restored");
  } catch (error) {
    console.log(error);
    throw error;
  }
};

function slowEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

const verifyToken = async (c: Context, next: Next) => {
  const token = c.req.header("X-Orbiter-Analytics-Token");

  if (!token) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  if (!slowEquals(token, process.env.ADMIN_KEY as string)) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  // If token is valid, continue to the next middleware/handler
  return next();
};

app.get("/health", (c) => {
  return c.text("Hello from orbit!");
});

app.post("/analytics", verifyToken, async (c) => {
  try {
    const {
      siteId,
      path,
      userAgent,
      ipAddress,
      country,
      city,
      referrer,
      requestType,
    } = await c.req.json();
    console.log({requestType})
    await db.recordTraffic({
      siteId: siteId,
      path: path,
      userAgent: userAgent,
      ipAddress: ipAddress,
      referrer: referrer,
      country: country,
      city: city,
      requestType: requestType,
    });

    return c.text("Success", 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/analytics/:siteId/stats", verifyToken, async (c) => {
  try {
    const siteId = c.req.param("siteId");
    let startDate = c.req.query("startDate");
    let endDate = c.req.query("endDate");

    if (!startDate || !endDate) {
      endDate = Date.now().toString();
      startDate = (Date.now() - 30 * 24 * 60 * 60 * 1000).toString();
    }

    const stats = await db.getTrafficStats({
      siteId: siteId,
      startTime: parseInt(startDate, 10),
      endTime: parseInt(endDate, 10),
    });

    const dailyStats = await db.getDailyViews({
      siteId: siteId,
      startTime: parseInt(startDate, 10),
      endTime: parseInt(endDate, 10),
    });

    return c.json({ data: { stats, dailyStats } }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/analytics/:siteId/referrers", verifyToken, async (c) => {
  try {
    const siteId = c.req.param("siteId");
    let startDate = c.req.query("startDate");
    let endDate = c.req.query("endDate");

    if (!startDate || !endDate) {
      endDate = Date.now().toString();
      startDate = (Date.now() - 30 * 24 * 60 * 60 * 1000).toString();
    }

    const referrerBreakdown = await db.getReferrerBreakdown({
      siteId: siteId,
      startTime: parseInt(startDate, 10),
      endTime: parseInt(endDate, 10),
    });

    return c.json({ data: referrerBreakdown }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/analytics/:siteId/paths", verifyToken, async (c) => {
  try {
    const siteId = c.req.param("siteId");
    let startDate = c.req.query("startDate");
    let endDate = c.req.query("endDate");

    if (!startDate || !endDate) {
      endDate = Date.now().toString();
      startDate = (Date.now() - 30 * 24 * 60 * 60 * 1000).toString();
    }

    const pathsBreakdown = await db.getPathsBreakdown({
      siteId,
      startTime: parseInt(startDate, 10),
      endTime: parseInt(endDate, 10),
    });
    return c.json({ data: pathsBreakdown }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/analytics/:siteId/countries", verifyToken, async (c) => {
  try {
    const siteId = c.req.param("siteId");
    let startDate = c.req.query("startDate");
    let endDate = c.req.query("endDate");

    if (!startDate || !endDate) {
      endDate = Date.now().toString();
      startDate = (Date.now() - 30 * 24 * 60 * 60 * 1000).toString();
    }

    const countries = await db.getCountryBreakdown({
      siteId,
      startTime: parseInt(startDate, 10),
      endTime: parseInt(endDate, 10),
    });

    return c.json({ data: countries }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/analytics/latest", verifyToken, async (c) => {
  try {
    const data = await db.getLatestTraffic();
    return c.json({ data }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/test", verifyToken, async (c) => {
  await generateTestData();
  return c.text("Done!");
});

app.get("/disk-space/monitor", verifyToken, async (c) => {
  try {
    const diskSpace = await monitorDiskSpace({
      critical: 95,
      warning: 85,
    });
    return c.json({ data: diskSpace }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/disk-space/stats", verifyToken, async (c) => {
  try {
    const diskSpace = await checkDiskSpace();

    return c.json({ data: diskSpace }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.post("/snapshot", verifyToken, async (c) => {
  try {
    console.log("Snapshot time!");
    await backupDatabase();
    return c.text("Success");
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/snapshot", verifyToken, async (c) => {
  try {
    console.log("getting snapshot!");
    await restoreDatabase();
    return c.text("Success");
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
console.log(`Server is running on http://localhost:${port}`);

cron.schedule("0 * * * *", async () => {
  try {
    // Your hourly task logic goes here
    console.log("Running hourly cron job:", new Date().toISOString());
    await backupDatabase();
  } catch (error) {
    console.error("Error in cron job:", error);
  }
});

serve({
  fetch: app.fetch,
  port,
});
