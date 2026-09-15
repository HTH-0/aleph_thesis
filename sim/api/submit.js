// Vercel 서버리스 함수. 참가자가 본시행 3회를 마치면 main.js가 이 엔드포인트로
// 결과 JSON을 POST한다. Neon Postgres(DATABASE_URL 환경변수)에 한 행씩 저장한다.
// 로컬 개발(`node sim/devserver.js`)에서는 이 파일 대신 devserver.js의 파일 기반
// 임시 구현이 같은 경로(/api/submit)를 흉내낸다 — DB 자격증명 없이도 전체 흐름을
// 테스트하기 위함. 실제 DB 스키마는 이 파일이 매 요청마다 CREATE TABLE IF NOT
// EXISTS로 보장하므로 별도 마이그레이션 스크립트가 없다.
const { neon } = require("@neondatabase/serverless");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST만 허용됩니다." });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: "서버에 DATABASE_URL이 설정되지 않았습니다." });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== "object" || !Array.isArray(body.trials)) {
    res.status(400).json({ error: "잘못된 요청 본문입니다." });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
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
    const rsodTotal = body.rsod && typeof body.rsod.total === "number" ? body.rsod.total : null;
    const rows = await sql`
      INSERT INTO submissions (name, slot, rsod_total, data)
      VALUES (${body.name ?? null}, ${body.slot ?? null}, ${rsodTotal}, ${JSON.stringify(body)}::jsonb)
      RETURNING id, created_at
    `;
    res.status(200).json({ ok: true, id: rows[0].id, createdAt: rows[0].created_at });
  } catch (err) {
    console.error("submit error:", err);
    res.status(500).json({ error: "저장 중 오류가 발생했습니다." });
  }
};
