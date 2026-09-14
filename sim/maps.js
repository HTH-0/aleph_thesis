// 맵(미로) 정의.
// 기본 미로 1개를 알고리즘(randomized Prim's algorithm)으로 생성하고, 회전/반전만으로
// 나머지 2개를 만든다.
// (근거: He et al., 2024 — 기본 미로를 회전/반전하면 경로 길이·꺾임 수가
//  구조적으로 100% 동일한 맵을 여러 개 만들 수 있다.)
// 청각 랜드마크 3개의 좌표도 같은 회전/반전을 적용해서, 맵이 바뀌어도
// "랜드마크와 경로의 상대적 위치 관계"가 그대로 유지되게 한다.
//
// 처음엔 미로를 손으로 그렸는데(9x9 -> 13x13으로 한 번 키움), 손으로 그리면
// 의도치 않게 지름길(루프)이 생기기 쉬워 매번 별도 스크립트로 검증해야 했다.
// 그래서 recursive backtracker(무작위 깊이우선탐색) 알고리즘으로 전환했는데 —
// 이 알고리즘은 "완전 미로(루프 없는 트리)"를 구조적으로 보장해 루프 문제는
// 풀었지만, 알려진 특성대로 분기가 적고 복도가 긴 미로를 만드는 경향이 있었다.
// 실제로 플레이해보니 "단일 길로 진행해야 하는 구간이 너무 길다"는 피드백을
// 받아, **randomized Prim's algorithm**으로 다시 전환했다 — 같은 크기에서
// recursive backtracker보다 분기점이 2~3배 많고 분기 사이 구간이 훨씬 짧은
// 미로가 나옴을 직접 비교 검증함(최장 단일구간: backtracker 13~49칸 vs
// Prim's 4~12칸, n=6 기준). 이 알고리즘도 완전 미로(루프 없는 트리)를
// 구조적으로 보장하므로 루프 검증 문제는 그대로 해결된 채 유지된다.
//
// 시드를 고정해서 매번 같은 미로가 재현되게 한다(reference.txt의 재현 방법
// 요구사항). Prim's algorithm으로 바꾼 뒤에도(29칸, 갈림길 9개) 실제로 플레이해
// 보니 여전히 "헤매는 느낌이 하나도 없이 그냥 진행하다보면 바로 깨진다"는
// 피드백을 받았다 — 참고 이미지(분기가 촘촘한 클래식 미로)와 비교해도 확실히
// 빈약했다. 랜드마크 0개 조건에서 시간이 의미 있게 늘어나려면 실제로 헤맬
// 만한 공간이 있어야 하므로, "10분 안에"라는 목표보다 난이도(헤매는 구간의
// 존재)를 우선해 미로를 다시 크게 키웠다 — 10x10칸(21x21격자), 경로 41칸,
// 갈림길 14개(전체 27개), 최장 단일구간 4칸으로 훨씬 촘촘하고 큰 미로로 교체.
// 이 결정 때문에 본시행 3회 합산 예상 시간이 다시 10분을 살짝 넘을 수 있다
// (TRIAL_TIMEOUT_SEC도 그만큼 늘림 — config.js 참고).
//
// 그 뒤 "난이도를 살짝 낮출 수 있나"는 요청을 받아, 분기 밀도(갈림길 개수·
// 최장 단일구간)는 거의 그대로 유지하면서 경로만 짧게(41->33칸) 줄인 시드로
// 다시 골랐다 — 9x9칸(19x19격자), 갈림길 12개(전체 23개), 최장 단일구간
// 4칸. "헤맬 공간은 유지하되 전체 체험 시간만 조금 줄인다"는 의도.
//
// 이어서 "15x15 격자로 제작 가능할까?"라는 요청으로 한 번 더 줄였다 —
// 7x7칸(15x15격자)에서 시드를 여럿 탐색해, 분기 밀도(갈림길/경로 비율)가
// 오히려 더 높으면서(10/25=40% vs 기존 12/33=36%) 최장 단일구간은 그대로
// 4칸인 시드(=112)를 골랐다. 경로가 25칸으로 더 짧아졌지만 시작-도착 간
// 최단 이동거리(맨해튼 거리+1)와 정확히 같아 이 크기에서 나올 수 있는
// 가장 촘촘한 구조였다.
//
// **분기 밀도 재탐색, 가지 길이 기준 추가 (2026-09-14)**: "구조가 괴상하게
// 일렬로 뻗어있다, 한쪽으로 너무 깊이 가는 것보다 적당히"라는 피드백. 기존
// maxRun 지표는 "시작→도착 최단경로 위"의 분기 사이 구간만 재고 있어서, 최단
// 경로 밖의 막다른 가지(dead-end branch)가 얼마나 길게 뻗는지는 놓치고
// 있었음 — 실제로 seed=112는 경로 밖에 12칸짜리 일자 복도가 하나 있었음
// (미로 전체를 분기점 단위로 다시 그래프화해서 모든 가지 길이를 측정하는
// 스크립트로 확인). "미로 전체에서 분기점 사이 최장 가지"라는 지표를 새로
// 추가해 재탐색 — 경로 위 최장구간 4칸은 유지하면서 전체 최장 가지도 6칸
// 이내로 제한한 시드(=379)를 채택. 경로 길이(25칸)·갈림길 개수(9개, 전체
// 16개)는 비슷한 수준을 유지.

const MAZE_CELL_N = 7;    // 7x7칸짜리 미로 (칸과 칸 사이 벽을 포함하면 15x15 격자)
const MAZE_SEED = 379;    // 고정 시드 — 항상 같은 미로가 재현됨 (경로 25칸, 갈림길 9개, 경로상 최장구간 4칸, 미로 전체 최장 가지 6칸)
const GRID_SIZE = MAZE_CELL_N * 2 + 1; // 15x15, 테두리는 항상 벽

// 시드 고정 의사난수 생성기 (mulberry32) — Math.random()은 시드를 못 주므로 직접 구현.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// randomized Prim's algorithm: n x n개의 "칸"을, 이미 미로에 포함된 칸과 맞닿은
// "경계(frontier)" 벽들 중 하나를 무작위로 골라 허물어가며 확장한다. 칸은
// 홀수 좌표(1,3,5,...)에, 칸 사이 벽은 그 중간 짝수 좌표에 위치한다.
// recursive backtracker(깊이우선, 한 방향으로 쭉 파고드는 방식)와 달리 여러
// 지점에서 동시에 넓게 퍼지듯 확장되어, 분기가 많고 복도가 짧은 미로가 나온다.
// 결과는 이 알고리즘도 항상 트리 구조(루프 없음)임이 보장된다.
function generateMazeGrid(n, seed) {
  const rng = mulberry32(seed);
  const size = n * 2 + 1;
  const grid = Array.from({ length: size }, () => new Array(size).fill(1));
  const inMaze = Array.from({ length: n }, () => new Array(n).fill(false));

  const toGrid = (cr, cc) => [2 * cr + 1, 2 * cc + 1];
  const carve = (cr, cc) => { const [r, c] = toGrid(cr, cc); grid[r][c] = 0; };
  const carveWall = (cr1, cc1, cr2, cc2) => {
    const [r1, c1] = toGrid(cr1, cc1);
    const [r2, c2] = toGrid(cr2, cc2);
    grid[(r1 + r2) / 2][(c1 + c2) / 2] = 0;
  };

  // frontier: [칸r, 칸c, 이 칸을 미로에 연결해줄 수 있는 인접 칸(이미 미로에 포함됨)]
  const frontier = [];
  inMaze[0][0] = true;
  carve(0, 0);
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = dr, nc = dc;
    if (nr >= 0 && nr < n && nc >= 0 && nc < n) frontier.push([nr, nc, 0, 0]);
  }

  while (frontier.length) {
    const idx = Math.floor(rng() * frontier.length);
    const [cr, cc, fr, fc] = frontier[idx];
    frontier.splice(idx, 1);
    if (inMaze[cr][cc]) continue; // 다른 경로로 이미 편입된 칸이면 스킵

    carveWall(fr, fc, cr, cc);
    carve(cr, cc);
    inMaze[cr][cc] = true;

    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n || inMaze[nr][nc]) continue;
      frontier.push([nr, nc, cr, cc]);
    }
  }
  return grid;
}

// start -> goal 최단경로 칸 목록(BFS). 막다른 길 칸을 "메인 경로가 아닌 열린 칸"으로
// 정의하는 데 쓴다 (완전 미로이므로 이 정의가 항상 정확히 맞아떨어짐).
function bfsPathCells(grid, start, goal) {
  const n = grid.length;
  const visited = Array.from({ length: n }, () => new Array(n).fill(false));
  const prev = Array.from({ length: n }, () => new Array(n).fill(null));
  const queue = [start];
  visited[start[0]][start[1]] = true;
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === goal[0] && c === goal[1]) {
      const path = [];
      let cur = [r, c];
      while (cur) { path.push(cur); cur = prev[cur[0]][cur[1]]; }
      return path.reverse();
    }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      if (grid[nr][nc] === 1 || visited[nr][nc]) continue;
      visited[nr][nc] = true;
      prev[nr][nc] = [r, c];
      queue.push([nr, nc]);
    }
  }
  return null;
}

function buildBaseGrid() {
  const grid = generateMazeGrid(MAZE_CELL_N, MAZE_SEED);
  const start = [1, 1];
  const goal = [GRID_SIZE - 2, GRID_SIZE - 2];

  const pathCells = bfsPathCells(grid, start, goal);
  const pathKeySet = new Set(pathCells.map(([r, c]) => `${r},${c}`));

  // 막다른 길 = 메인 경로가 아닌 모든 열린 칸 (완전 미로라 이 정의로 충분함)
  const deadEndCells = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === 0 && !pathKeySet.has(`${r},${c}`)) deadEndCells.push([r, c]);
    }
  }

  // 청각 랜드마크 3개 (벽 위치여도 상관없음 — 소리만 나는 가상의 점이라
  // 실제로 걸어서 도달할 필요가 없다). 삼각측량이 되도록 서로 멀리 떨어뜨림.
  // 0: 목재 펄스(저음), 1: 물방울 아르페지오(중음), 2: 금속 차임(고음) — audio.js와 순서를 맞춘다.
  const landmarks = [
    [1, GRID_SIZE - 2],       // 우상단
    [GRID_SIZE - 2, 1],       // 좌하단
    [Math.floor(GRID_SIZE / 2), Math.floor(GRID_SIZE / 2)], // 중앙
  ];

  return { grid, start, goal, deadEndCells, landmarks };
}

function transformMapDef(mapDef, transformCell) {
  const n = GRID_SIZE;
  const newGrid = [];
  for (let r = 0; r < n; r++) newGrid.push(new Array(n).fill(1));

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const [nr, nc] = transformCell([r, c]);
      newGrid[nr][nc] = mapDef.grid[r][c];
    }
  }

  return {
    grid: newGrid,
    start: transformCell(mapDef.start),
    goal: transformCell(mapDef.goal),
    deadEndCells: mapDef.deadEndCells.map(transformCell),
    landmarks: mapDef.landmarks.map(transformCell),
  };
}

function rotate90(mapDef) {
  const n = GRID_SIZE;
  return transformMapDef(mapDef, ([r, c]) => [c, n - 1 - r]);
}

function mirrorH(mapDef) {
  const n = GRID_SIZE;
  return transformMapDef(mapDef, ([r, c]) => [r, n - 1 - c]);
}

const BASE_MAP = buildBaseGrid();

const MAPS = [
  BASE_MAP,               // map 0 (원본)
  rotate90(BASE_MAP),      // map 1 (90도 회전)
  mirrorH(BASE_MAP),       // map 2 (좌우 반전)
];

// 연습(워밍업) 전용 맵. 본시행 맵(MAPS[0..2])과 별개로, 아주 짧고 쉬운 경로만
// 제공한다 — 워밍업의 목적은 조작(WASD+시선)과 랜드마크 소리에 익숙해지는 것뿐이지
// 본시행과 같은 수준의 길찾기 난이도를 미리 겪게 하려는 게 아니다. 실제로
// 본시행 맵을 그대로 워밍업에 썼더니 "연습이 과하게 어렵다"는 피드백이 있어 분리함.
// 랜드마크 3개는 본시행처럼 경로에서 멀리 떨어뜨려서, 소리 방향을 익히는 연습은
// 그대로 되게 해뒀다.
const WARMUP_MAP = (() => {
  const grid = Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(1));
  const path = [
    [1, 1], [1, 2], [1, 3], [1, 4],
    [2, 4],
    [3, 4], [3, 5], [3, 6],
  ];
  for (const [r, c] of path) grid[r][c] = 0;
  return {
    grid,
    start: [1, 1],
    goal: [3, 6],
    deadEndCells: [],
    landmarks: [[1, 10], [10, 1], [7, 7]],
  };
})();

// 그리드 상 최단 경로 칸 수(시작 포함)를 BFS로 계산. 경로 효율성 계산에 쓴다.
function shortestPathCellCount(mapDef) {
  const n = GRID_SIZE;
  const [sr, sc] = mapDef.start;
  const [gr, gc] = mapDef.goal;
  const visited = Array.from({ length: n }, () => new Array(n).fill(false));
  const dist = Array.from({ length: n }, () => new Array(n).fill(0));
  const queue = [[sr, sc]];
  visited[sr][sc] = true;

  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === gr && c === gc) return dist[r][c] + 1; // 칸 수 = 거리+1
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      if (mapDef.grid[nr][nc] === 1 || visited[nr][nc]) continue;
      visited[nr][nc] = true;
      dist[nr][nc] = dist[r][c] + 1;
      queue.push([nr, nc]);
    }
  }
  return null; // 연결 안 됨 (있으면 안 되는 상황)
}
