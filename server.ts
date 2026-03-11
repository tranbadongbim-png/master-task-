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

  // Use /batch endpoint for multiple queries in a single transaction
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/batch`;
  
  const results = [];
  
  // Process in chunks of 50 (D1 batch limit is usually 100)
  for (let i = 0; i < queries.length; i += 50) {
    const chunk = queries.slice(i, i + 50).map(q => ({
      sql: q.sql,
      params: q.params || []
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chunk)
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error("D1 HTTP Error:", response.status, text);
      throw new Error(`D1 HTTP Error ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (!data.success) {
      const errMsg = data.errors?.map((e: any) => e.message).join(", ") || "D1 batch query failed";
      console.error("D1 Error Details:", JSON.stringify(data.errors));
      throw new Error(errMsg);
    }
    
    // data.result is an array of results for each query in the batch
    results.push(...data.result);
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
      { sql: "CREATE TABLE IF NOT EXISTS subtasks (id TEXT PRIMARY KEY, taskId TEXT, title TEXT, isCompleted INTEGER, createdAt INTEGER)" },
      { sql: "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, avatar TEXT)" }
    ]);

    // Migration: Add dueDate and assigneeId if they don't exist
    try {
      await queryD1([{ sql: "ALTER TABLE tasks ADD COLUMN dueDate TEXT" }]);
    } catch (e) {}
    try {
      await queryD1([{ sql: "ALTER TABLE tasks ADD COLUMN assigneeId TEXT" }]);
    } catch (e) {}

    const results = await queryD1([
      { sql: "SELECT * FROM cards" },
      { sql: "SELECT * FROM tasks" },
      { sql: "SELECT * FROM subtasks" },
      { sql: "SELECT * FROM users" }
    ]);

    res.json({
      cards: results[0].results || [],
      tasks: results[1].results || [],
      subtasks: results[2].results.map((s: any) => ({ ...s, isCompleted: Boolean(s.isCompleted) })) || [],
      users: results[3].results || []
    });
  } catch (error: any) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sync", async (req, res) => {
  try {
    const { cards, tasks, subtasks, users } = req.body;
    
    const queries: { sql: string, params?: any[] }[] = [];

    // Start with DELETEs to ensure we have a clean slate
    queries.push({ sql: "DELETE FROM cards" });
    queries.push({ sql: "DELETE FROM tasks" });
    queries.push({ sql: "DELETE FROM subtasks" });
    queries.push({ sql: "DELETE FROM users" });

    for (const c of cards) {
      queries.push({ 
        sql: "INSERT OR REPLACE INTO cards (id, title, createdAt) VALUES (?, ?, ?)", 
        params: [c.id, c.title, c.createdAt] 
      });
    }

    for (const t of tasks) {
      queries.push({ 
        sql: "INSERT OR REPLACE INTO tasks (id, cardId, title, description, status, priority, dueDate, assigneeId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", 
        params: [t.id, t.cardId, t.title, t.description || '', t.status, t.priority || null, t.dueDate || null, t.assigneeId || null, t.createdAt] 
      });
    }

    for (const s of subtasks) {
      queries.push({ 
        sql: "INSERT OR REPLACE INTO subtasks (id, taskId, title, isCompleted, createdAt) VALUES (?, ?, ?, ?, ?)", 
        params: [s.id, s.taskId, s.title, s.isCompleted ? 1 : 0, s.createdAt] 
      });
    }

    if (users) {
      for (const u of users) {
        queries.push({ 
          sql: "INSERT OR REPLACE INTO users (id, name, avatar) VALUES (?, ?, ?)", 
          params: [u.id, u.name, u.avatar] 
        });
      }
    }

    // Process in chunks of 50 to avoid D1 limits
    // The first chunk will contain the DELETEs, making it more atomic
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
