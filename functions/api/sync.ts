export async function onRequestPost(context: any) {
  try {
    const db = context.env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: "Not configured" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await context.request.json();
    const { cards, tasks, subtasks } = body;

    const statements = [
      db.prepare("DELETE FROM cards"),
      db.prepare("DELETE FROM tasks"),
      db.prepare("DELETE FROM subtasks")
    ];

    for (const c of cards) {
      statements.push(
        db.prepare("INSERT OR REPLACE INTO cards (id, title, createdAt) VALUES (?, ?, ?)")
          .bind(c.id, c.title, c.createdAt)
      );
    }

    for (const t of tasks) {
      statements.push(
        db.prepare("INSERT OR REPLACE INTO tasks (id, cardId, title, description, status, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(t.id, t.cardId, t.title, t.description || '', t.status, t.priority || null, t.createdAt)
      );
    }

    for (const s of subtasks) {
      statements.push(
        db.prepare("INSERT OR REPLACE INTO subtasks (id, taskId, title, isCompleted, createdAt) VALUES (?, ?, ?, ?, ?)")
          .bind(s.id, s.taskId, s.title, s.isCompleted ? 1 : 0, s.createdAt)
      );
    }

    // Cloudflare D1 hỗ trợ batch queries để chạy nhiều lệnh SQL cùng lúc rất nhanh
    await db.batch(statements);

    return new Response(JSON.stringify({ success: true }), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
