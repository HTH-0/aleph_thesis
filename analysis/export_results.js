// 배포 DB(/api/results)에서 본시행 기록을 내려받아 analysis/results.csv로 저장한다.
// 사용: node analysis/export_results.js <배포주소> <ADMIN_KEY>
// 참가자 이름은 실명일 수 있어 저장하지 않고 id 순서대로 P1, P2...로 바꾼다.
// 테스트용으로 넣은 기록은 EXCLUDE_IDS에 적어 제외한다(제외 사유는 docs/04 §2에 기록).
const fs = require("fs");
const path = require("path");

const [base, key] = process.argv.slice(2);
if (!base || !key) { console.error("사용: node analysis/export_results.js <배포주소> <ADMIN_KEY>"); process.exit(1); }

const EXCLUDE_IDS = new Set([6]); // 6: 연구자가 만든 테스트 기록
// 설계 버전 구분: 최단경로 거리 96 = 15x15(v1), 160 = 21x21(최종)
const designOf = (d) => (d === 96 ? "v1" : d === 160 ? "v4" : "other");

(async () => {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/results?key=${encodeURIComponent(key)}`);
  const rows = (await res.json()).rows.filter((r) => !EXCLUDE_IDS.has(r.id)).sort((a, b) => a.id - b.id);
  const head = ["participant","design","slot","rsod","trialIndex","map","landmarkLevel","elapsedSec","distance","pathEfficiency","deadEndEntries","reorientationSec","timedOut"];
  const lines = [head.join(",")];
  rows.forEach((r, i) => {
    for (const t of r.data.trials) {
      lines.push([`P${i + 1}`, designOf(t.shortestWorldDistance), r.slot, r.rsod_total, t.trialIndex, t.map, t.landmarkLevel,
        t.elapsedSec, t.distance, t.pathEfficiency, t.deadEndEntries, t.reorientationSec, t.timedOut].join(","));
    }
  });
  fs.writeFileSync(path.join(__dirname, "results.csv"), lines.join("\n") + "\n");
  console.log(`${rows.length}명, ${lines.length - 1}시행 → analysis/results.csv`);
})();
