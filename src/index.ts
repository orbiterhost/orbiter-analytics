import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import TrafficDB from "./db.js";
import { generateTestData } from "./testData.js";
import dotenv from "dotenv";

dotenv.config();

const app = new Hono();

const db = new TrafficDB("traffic.db");
await db.initialize();

const verifyToken = async (c: Context, next: Next) => {
  const token = c.req.header("Orbiter-Analytics-Token");

  if (!token) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  if (token !== process.env.ADMIN_KEY) {
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
    const { siteId, path, userAgent, ipAddress, country, city, referrer } =
      await c.req.json();
    await db.recordTraffic({
      siteId: siteId,
      path: path,
      userAgent: userAgent,
      ipAddress: ipAddress,
      referrer: referrer,
      country: country,
      city: city,
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
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");
    if (!startDate || !endDate) {
      return c.json({ message: "Start date and end date are required" }, 400);
    }

    const stats = await db.getTrafficStats({
      siteId: siteId,
      startTime: parseInt(startDate, 10),
      endTime: parseInt(endDate, 10),
    });

    return c.json({ data: stats }, 200);
  } catch (error) {
    console.log(error);
    return c.json({ message: "Server error" }, 200);
  }
});

app.get("/analytics/:siteId/referrers", verifyToken, async (c) => {
  try {
    const siteId = c.req.param("siteId");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    if (!startDate || !endDate) {
      return c.json({ message: "Start date and end date are required" }, 400);
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
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    if (!startDate || !endDate) {
      return c.json({ message: "Start date and end date are required" }, 400);
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
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    if (!startDate || !endDate) {
      return c.json({ message: "Start date and end date are required" }, 400);
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

const port = 5000;
console.log(`Server is running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
