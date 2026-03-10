import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper to query D1
async function queryD1(queries: { sql: string, params?: any[] }[]) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const dbId = process.env.CLOUDFLARE_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !dbId || !token) {
    throw new Error("Cloudflare D1 credentials missing");
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`;
  
  const results = [];
  
  // Process in chunks of 10 to avoid rate limits
  for (let i = 0; i < queries.length; i += 10) {
    const chunk = queries.slice(i, i + 10);
    const chunkResults = await Promise.all(chunk.map(async (q) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: q.sql, params: q.params || [] })
      });
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.errors?.[0]?.message || "D1 query failed");
      }
      return data.result[0];
    }));
    results.push(...chunkResults);
  }
  
  return results;
}

// API Routes
app.get("/api/config", (req, res) => {
  const isConfigured = !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_DATABASE_ID && process.env.CLOUDFLARE_API_TOKEN);
  res.json({ configured: isConfigured });
});

app.get("/api/data", async (req, res) => {
  try {
    const isConfigured = !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_DATABASE_ID && process.env.CLOUDFLARE_API_TOKEN);
    if (!isConfigured) {
      return res.status(400).json({ error: "Not configured" });
    }

    // Initialize tables if they don't exist
    await queryD1([
      { sql: "CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, title TEXT, createdAt INTEGER)" },
      { sql: "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, cardId TEXT, title TEXT, description TEXT, status TEXT, priority TEXT, createdAt INTEGER)" },
      { sql: "CREATE TABLE IF NOT EXISTS subtasks (id TEXT PRIMARY KEY, taskId TEXT, title TEXT, isCompleted INTEGER, createdAt INTEGER)" }
    ]);

    const results = await queryD1([
      { sql: "SELECT * FROM cards" },
      { sql: "SELECT * FROM tasks" },
      { sql: "SELECT * FROM subtasks" }
    ]);

    res.json({
      cards: results[0].results || [],
      tasks: results[1].results || [],
      subtasks: results[2].results.map((s: any) => ({ ...s, isCompleted: Boolean(s.isCompleted) })) || []
    });
  } catch (error: any) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sync", async (req, res) => {
  try {
    const { cards, tasks, subtasks } = req.body;
    
    // Execute DELETEs first to prevent race conditions with INSERTs
    await queryD1([
      { sql: "DELETE FROM cards" },
      { sql: "DELETE FROM tasks" },
      { sql: "DELETE FROM subtasks" }
    ]);

    const queries: { sql: string, params?: any[] }[] = [];

    for (const c of cards) {
      queries.push({ 
        sql: "INSERT OR REPLACE INTO cards (id, title, createdAt) VALUES (?, ?, ?)", 
        params: [c.id, c.title, c.createdAt] 
      });
    }

    for (const t of tasks) {
      queries.push({ 
        sql: "INSERT OR REPLACE INTO tasks (id, cardId, title, description, status, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)", 
        params: [t.id, t.cardId, t.title, t.description || '', t.status, t.priority || null, t.createdAt] 
      });
    }

    for (const s of subtasks) {
      queries.push({ 
        sql: "INSERT OR REPLACE INTO subtasks (id, taskId, title, isCompleted, createdAt) VALUES (?, ?, ?, ?, ?)", 
        params: [s.id, s.taskId, s.title, s.isCompleted ? 1 : 0, s.createdAt] 
      });
    }

    // Chunk queries to avoid D1 limits (max 100 per request usually)
    const chunkSize = 50;
    for (let i = 0; i < queries.length; i += chunkSize) {
      const chunk = queries.slice(i, i + chunkSize);
      await queryD1(chunk);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error syncing data:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("taskmaster-dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
