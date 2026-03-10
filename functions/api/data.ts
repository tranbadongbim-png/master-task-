export async function onRequestGet(context: any) {
  try {
    const db = context.env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: "Not configured" }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Khởi tạo bảng nếu chưa có
    await db.exec(`
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, title TEXT, createdAt INTEGER);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, cardId TEXT, title TEXT, description TEXT, status TEXT, priority TEXT, createdAt INTEGER);
      CREATE TABLE IF NOT EXISTS subtasks (id TEXT PRIMARY KEY, taskId TEXT, title TEXT, isCompleted INTEGER, createdAt INTEGER);
    `);

    const cards = await db.prepare("SELECT * FROM cards").all();
    const tasks = await db.prepare("SELECT * FROM tasks").all();
    const subtasks = await db.prepare("SELECT * FROM subtasks").all();

    return new Response(JSON.stringify({
      cards: cards.results || [],
      tasks: tasks.results || [],
      subtasks: subtasks.results.map((s: any) => ({ ...s, isCompleted: Boolean(s.isCompleted) })) || []
    }), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
