export async function onRequestGet(context: any) {
  // Trên Cloudflare Pages, nếu đã bind DB thì context.env.DB sẽ tồn tại
  const isConfigured = !!context.env.DB;
  
  return new Response(JSON.stringify({ configured: isConfigured }), {
    headers: { "Content-Type": "application/json" }
  });
}
