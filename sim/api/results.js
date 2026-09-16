// Vercel 서버리스 함수. admin.html이 이 엔드포인트로 전체 참가자 결과를 조회한다.
// 아무나 못 보게 ADMIN_KEY 환경변수와 일치하는 ?key=... 쿼리가 있어야만 응답한다
// (참가자용 화면 어디에도 이 페이지 링크는 노출하지 않음 — 연구자만 URL을 직접 앎).
const { neon } = require("@neondatabase/serverless");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "DELETE") {
    res.status(405).json({ error: "GET 또는 DELETE만 허용됩니다." });
    return;
  }
  if (!process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    res.status(401).json({ error: "인증 실패" });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "서버에 DATABASE_URL이 설정되지 않았습니다." });
    return;
  }

  const sql = neon(process.env.DATABASE_URL);

  // 테스트 데이터를 지울 때 admin.html에서 쓰는 삭제 경로. DELETE /api/results?key=...&id=3
  if (req.method === "DELETE") {
    const id = Number(req.query.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "id가 올바르지 않습니다." });
      return;
    }
    try {
      const rows = await sql`DELETE FROM submissions WHERE id = ${id} RETURNING id`;
      if (rows.length === 0) {
        res.status(404).json({ error: "해당 id를 찾을 수 없습니다." });
        return;
      }
      res.status(200).json({ ok: true, deletedId: id });
    } catch (err) {
      console.error("delete error:", err);
      res.status(500).json({ error: "삭제 중 오류가 발생했습니다." });
    }
    return;
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        name TEXT,
        slot INT,
        rsod_total NUMERIC,
        data JSONB NOT NULL
      )
    `;
    const rows = await sql`
      SELECT id, created_at, name, slot, rsod_total, data
      FROM submissions
      ORDER BY created_at DESC
    `;
    res.status(200).json({ ok: true, rows });
  } catch (err) {
    console.error("results error:", err);
    res.status(500).json({ error: "조회 중 오류가 발생했습니다." });
  }
};
