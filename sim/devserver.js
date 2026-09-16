// 로컬 확인용 정적 파일 서버 (외부 패키지 없이 Node 내장 모듈만 사용).
// /api/submit, /api/results는 실제 배포(Vercel + Neon Postgres, api/*.js 참고)와
// 다르게 로컬 파일(sim/data/raw/)로 흉내낸다 — DB 자격증명 없이도 결과 저장부터
// admin.html 열람까지 전체 흐름을 로컬에서 확인하기 위함. 로컬 전용 admin 키는
// 고정값 "dev".
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5173;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data", "raw");
const LOCAL_ADMIN_KEY = "dev";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function handleSubmit(req, res) {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      sendJSON(res, 400, { error: "잘못된 JSON" });
      return;
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const safeName = String(data.name || "participant").replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
    const filename = `${Date.now()}_${safeName}_slot${data.slot ?? "x"}.json`;
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
    sendJSON(res, 200, { ok: true, id: filename });
  });
}

function handleResults(req, res, searchParams) {
  if (searchParams.get("key") !== LOCAL_ADMIN_KEY) {
    sendJSON(res, 401, { error: `인증 실패 (로컬 admin 키는 "${LOCAL_ADMIN_KEY}")` });
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  const rows = files
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      const stat = fs.statSync(path.join(DATA_DIR, f));
      return {
        id: f,
        created_at: stat.mtime.toISOString(),
        name: data.name,
        slot: data.slot,
        rsod_total: data.rsod && typeof data.rsod.total === "number" ? data.rsod.total : null,
        data,
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  sendJSON(res, 200, { ok: true, rows });
}

// admin.html의 삭제 버튼이 로컬에서도 동작하도록 흉내낸다. 배포판은 id가 숫자(DB PK)지만
// 로컬은 파일명을 id로 쓰므로, 그 파일명이 정확히 DATA_DIR 안에 있는 파일인지 확인
// 후에만 지운다(경로 조작 방지).
function handleDelete(req, res, searchParams) {
  if (searchParams.get("key") !== LOCAL_ADMIN_KEY) {
    sendJSON(res, 401, { error: `인증 실패 (로컬 admin 키는 "${LOCAL_ADMIN_KEY}")` });
    return;
  }
  const id = searchParams.get("id") || "";
  const target = path.join(DATA_DIR, id);
  if (path.dirname(target) !== DATA_DIR || !fs.existsSync(target)) {
    sendJSON(res, 404, { error: "해당 id를 찾을 수 없습니다." });
    return;
  }
  fs.unlinkSync(target);
  sendJSON(res, 200, { ok: true, deletedId: id });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/submit" && req.method === "POST") {
    handleSubmit(req, res);
    return;
  }
  if (url.pathname === "/api/results" && req.method === "GET") {
    handleResults(req, res, url.searchParams);
    return;
  }
  if (url.pathname === "/api/results" && req.method === "DELETE") {
    handleDelete(req, res, url.searchParams);
    return;
  }

  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  const fullPath = path.join(ROOT, filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT} 에서 실행 중 (로컬 admin 키: ${LOCAL_ADMIN_KEY})`);
});
