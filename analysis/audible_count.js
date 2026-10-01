// 칸마다 "들리는 랜드마크 개수"를 계산: 컷오프 안(거리 < MAX)이면 들림.
// 3개 조건 대비 2개 조건(슬롯별로 빠지는 소리가 다름)이 얼마나 자주 같은 개수가 들리는지 본다.
const fs = require("fs");
const root = require("path").join(__dirname, "..", "sim") + require("path").sep;
const cfgSrc = fs.readFileSync(root + "config.js", "utf8");
const mapSrc = fs.readFileSync(root + "maps.js", "utf8");
const { CONFIG, GRID_SIZE, MAPS } = new Function(cfgSrc + "\n" + mapSrc + "\nreturn { CONFIG, GRID_SIZE, MAPS };")();
const CELL = CONFIG.CELL_SIZE, MAXD = CONFIG.LANDMARK_MAX_DISTANCE;
const center = ([r, c]) => [c * CELL + CELL / 2, r * CELL + CELL / 2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function shortestPath(m) {
  const n = GRID_SIZE, key = (r, c) => r * n + c, prev = new Map();
  const q = [m.start]; prev.set(key(...m.start), null);
  while (q.length) {
    const [r, c] = q.shift();
    if (r === m.goal[0] && c === m.goal[1]) break;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n || m.grid[nr][nc] !== 0 || prev.has(key(nr, nc))) continue;
      prev.set(key(nr, nc), [r, c]); q.push([nr, nc]);
    }
  }
  const path = []; let cur = m.goal;
  while (cur) { path.push(cur); cur = prev.get(key(...cur)); }
  return path.reverse();
}

const drops = CONFIG.LEVEL2_DROP_INDEX_BY_SLOT;
console.log(`컷오프 ${MAXD}유닛 (≈${(MAXD / CELL).toFixed(1)}칸), 칸 크기 ${CELL}, 격자 ${GRID_SIZE}`);
console.log("level2에서 슬롯별로 빠지는 랜드마크:", drops.join(","));

MAPS.forEach((m, mi) => {
  const lm = m.landmarks.map(center);
  const audible = (cell) => lm.map((p) => dist(center(cell), p) < MAXD);
  const open = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (m.grid[r][c] === 0) open.push([r, c]);
  const path = shortestPath(m);

  const hist = (cells) => { const h = [0, 0, 0, 0]; cells.forEach((c) => h[audible(c).filter(Boolean).length]++); return h.map((v) => (100 * v / cells.length).toFixed(0) + "%"); };
  console.log(`\n== 맵 ${mi} == 시작 ${m.start} 목적지 ${m.goal}, 열린 칸 ${open.length}, 최단경로 ${path.length}칸`);
  console.log("들리는 개수 분포(0/1/2/3개)  미로 전체:", hist(open).join(" "), " 최단경로:", hist(path).join(" "));

  // 3개 조건과 2개 조건(각 빠지는 경우)의 "들리는 개수"가 같은 칸 비율
  for (const drop of [0, 1, 2]) {
    const same = (cells) => cells.filter((c) => !audible(c)[drop]).length / cells.length;
    console.log(`  ${drop}번 소리를 뺀 2개 조건 = 3개 조건과 들리는 개수가 같은 칸: 미로 전체 ${(100 * same(open)).toFixed(0)}%, 최단경로 ${(100 * same(path)).toFixed(0)}%`);
  }
  // 진행도(최단경로 10구간)별 3개 조건에서 들리는 개수 평균
  const prog = [];
  for (let k = 0; k < 10; k++) {
    const seg = path.slice(Math.floor(path.length * k / 10), Math.floor(path.length * (k + 1) / 10));
    prog.push((seg.reduce((s, c) => s + audible(c).filter(Boolean).length, 0) / seg.length).toFixed(1));
  }
  console.log("  진행도 10구간별 평균 들리는 개수(3개 조건):", prog.join(" "));
});
