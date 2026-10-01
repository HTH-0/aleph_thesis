// analysis/results.csv를 읽어 참가자별 "자기 0개 시행 대비" 비율과 방향 요약을 출력한다.
// 사용: node analysis/summarize.js
// 설계 버전(v1/v4)이 달라 시간 절댓값을 섞어 평균내지 않고, 같은 사람 안의 비율로만 비교한다.
const fs = require("fs");
const path = require("path");
const [head, ...lines] = fs.readFileSync(path.join(__dirname, "results.csv"), "utf8").trim().split("\n");
const cols = head.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));

const byP = {};
for (const r of rows) (byP[r.participant] ||= []).push(r);

const dir = { 2: 0, 3: 0 }, n = { 2: 0, 3: 0 };
console.log("참가자 설계 RSOD  순서   | 0개(초)  | 2개 시간비 효율비 | 3개 시간비 효율비");
for (const [p, ts] of Object.entries(byP)) {
  const by = Object.fromEntries(ts.map((t) => [t.landmarkLevel, t]));
  const order = ts.sort((a, b) => a.trialIndex - b.trialIndex).map((t) => t.landmarkLevel).join(">");
  const cell = (l) => {
    if (!by[l] || !by[0]) return "-";
    const tr = by[l].elapsedSec / by[0].elapsedSec, er = by[l].pathEfficiency / by[0].pathEfficiency;
    n[l]++; if (tr < 1) dir[l]++;
    return `${tr.toFixed(2)}${by[l].timedOut === "true" ? "T" : " "} ${er.toFixed(2)}`;
  };
  const z = by[0];
  console.log(`${p.padEnd(4)} ${ts[0].design}  ${String(ts[0].rsod).padStart(4)}  ${order.padEnd(6)} | ${Number(z.elapsedSec).toFixed(0).padStart(4)}${z.timedOut === "true" ? "T" : " "}   | ${cell(2).padEnd(10)} | ${cell(3)}`);
}
console.log(`\n0개보다 빨랐던 참가자: 2개 조건 ${dir[2]}/${n[2]}명, 3개 조건 ${dir[3]}/${n[3]}명 (T = 제한시간 초과, 값이 잘려 있음)`);

// ---- 보충 표 ----
const num = (x) => Number(x);
const sorted = (ts) => ts.slice().sort((a, b) => a.trialIndex - b.trialIndex);
const ratioTable = (title, field) => {
  console.log(`\n[${title}] 자기 0개 시행 대비 비율 (0개 값 → 2개비 / 3개비)`);
  for (const [p, ts] of Object.entries(byP)) {
    const by = Object.fromEntries(ts.map((t) => [t.landmarkLevel, t]));
    const z = num(by[0][field]);
    const r = (l) => (z === 0 ? "n/a" : (num(by[l][field]) / z).toFixed(2));
    console.log(`${p.padEnd(4)} ${ts[0].design}  0개=${String(by[0][field]).padStart(6)}  2개 ${String(by[2][field]).padStart(6)} (${r(2)})  3개 ${String(by[3][field]).padStart(6)} (${r(3)})`);
  }
};
ratioTable("막다른 길 진입 횟수", "deadEndEntries");
ratioTable("재정향 시간(초)", "reorientationSec");

console.log("\n[시행 순서별 소요 시간] 1·2·3번째 시행 (소리 개수) / 1번째 대비 비율");
const ordRatios = { 2: [], 3: [] };
for (const [p, ts] of Object.entries(byP)) {
  const s = sorted(ts);
  const t1 = num(s[0].elapsedSec);
  s.slice(1).forEach((t, i) => ordRatios[i + 2].push(num(t.elapsedSec) / t1));
  console.log(`${p.padEnd(4)} ` + s.map((t) => `${t.trialIndex}번째 ${num(t.elapsedSec).toFixed(0).padStart(3)}초(${t.landmarkLevel}개${t.timedOut === "true" ? ",T" : ""})`).join("  ") +
    `  | 2번째/1번째 ${(num(s[1].elapsedSec) / t1).toFixed(2)}  3번째/1번째 ${(num(s[2].elapsedSec) / t1).toFixed(2)}`);
}
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2; };
console.log(`1번째 대비 중앙값: 2번째 ${med(ordRatios[2]).toFixed(2)}, 3번째 ${med(ordRatios[3]).toFixed(2)} (1보다 작으면 뒤로 갈수록 빨라짐)`);

console.log("\n[R-SOD vs 3개 시간비] (R-SOD 낮을수록 방향감각 약함)");
const pts = [];
for (const [p, ts] of Object.entries(byP)) {
  const by = Object.fromEntries(ts.map((t) => [t.landmarkLevel, t]));
  pts.push({ p, rsod: num(ts[0].rsod), ratio: num(by[3].elapsedSec) / num(by[0].elapsedSec), design: ts[0].design });
}
pts.sort((a, b) => a.rsod - b.rsod).forEach((q) => console.log(`R-SOD ${String(q.rsod).padStart(2)}  ${q.p}(${q.design})  3개시간비 ${q.ratio.toFixed(2)}`));

// 산점도 SVG
const W = 520, H = 340, L = 60, R = 20, T = 20, B = 50;
const xs = (v) => L + ((v - 0) / 28) * (W - L - R);
const ymax = 3, ys = (v) => H - B - (v / ymax) * (H - T - B);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="12">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" stroke="#444"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" stroke="#444"/>
<line x1="${L}" y1="${ys(1)}" x2="${W - R}" y2="${ys(1)}" stroke="#c33" stroke-dasharray="5 4"/><text x="${W - R - 4}" y="${ys(1) - 5}" text-anchor="end" fill="#c33">1.0 (0개와 같음)</text>`;
for (const v of [4, 8, 12, 16, 20, 24, 28]) svg += `<line x1="${xs(v)}" y1="${H - B}" x2="${xs(v)}" y2="${H - B + 4}" stroke="#444"/><text x="${xs(v)}" y="${H - B + 18}" text-anchor="middle" fill="#222">${v}</text>`;
for (const v of [0, 0.5, 1, 1.5, 2, 2.5, 3]) svg += `<line x1="${L - 4}" y1="${ys(v)}" x2="${L}" y2="${ys(v)}" stroke="#444"/><text x="${L - 8}" y="${ys(v) + 4}" text-anchor="end" fill="#222">${v}</text>`;
svg += `<text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle" fill="#222">R-SOD 총점 (낮을수록 방향감각 약함)</text>`;
svg += `<text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" fill="#222">3개 시간비 (3개 ÷ 자기 0개)</text>`;
for (const q of pts) {
  const c = q.design === "v1" ? "#2a6fdb" : "#d9822b";
  svg += `<circle cx="${xs(q.rsod)}" cy="${ys(q.ratio)}" r="6" fill="${c}"/><text x="${xs(q.rsod) + 9}" y="${ys(q.ratio) + 4}" fill="#222">${q.p}</text>`;
}
svg += `<circle cx="${L + 10}" cy="${T + 8}" r="5" fill="#2a6fdb"/><text x="${L + 20}" y="${T + 12}" fill="#222">v1 설계</text><circle cx="${L + 90}" cy="${T + 8}" r="5" fill="#d9822b"/><text x="${L + 100}" y="${T + 12}" fill="#222">최종 설계(v4)</text></svg>\n`;
fs.writeFileSync(path.join(__dirname, "rsod_scatter.svg"), svg);
console.log("\n산점도 → analysis/rsod_scatter.svg");
