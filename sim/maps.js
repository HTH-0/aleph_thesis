// 맵(미로) 정의.
// 기본 미로 1개를 알고리즘(recursive backtracker)으로 생성하고, 회전/반전만으로
// 나머지 2개를 만든다.
// (근거: He et al., 2024 — 기본 미로를 회전/반전하면 경로 길이·꺾임 수가
//  구조적으로 100% 동일한 맵을 여러 개 만들 수 있다.)
// 청각 랜드마크 3개의 좌표도 같은 회전/반전을 적용해서, 맵이 바뀌어도
// "랜드마크와 경로의 상대적 위치 관계"가 그대로 유지되게 한다.
//
// 처음엔 미로를 손으로 그렸는데(9x9 -> 13x13으로 한 번 키움), 손으로 그리면
// 의도치 않게 지름길(루프)이 생기기 쉬워 매번 별도 스크립트로 검증해야 했다.
// recursive backtracker는 "완전 미로(perfect maze, 루프 없는 트리)"를 구조적으로
// 보장하므로 이 문제 자체가 사라진다. 시드를 고정해서 매번 같은 미로가
// 재현되게 하고(reference.txt의 재현 방법 요구사항), 여러 시드를 시험해서
// "완벽 주행 시간 대비 헤맬 때 시간이 충분히 늘어날 만큼 큰 미로"가 되도록
// 경로 길이가 이전 손그림 버전(41칸)과 같은 시드를 채택했다 — 자세한 탐색
// 과정은 docs/진행상황.md 참고.

const MAZE_CELL_N = 6;    // 6x6칸짜리 미로 (칸과 칸 사이 벽을 포함하면 13x13 격자)
const MAZE_SEED = 14;     // 고정 시드 — 항상 같은 미로가 재현됨
const GRID_SIZE = MAZE_CELL_N * 2 + 1; // 13x13, 테두리는 항상 벽

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

// recursive backtracker: n x n개의 "칸"을 무작위로 연결해 완전 미로를 만든다.
// 칸은 홀수 좌표(1,3,5,...)에, 칸 사이 벽은 그 중간 짝수 좌표에 위치한다.
// 결과는 항상 트리 구조(루프 없음)임이 알고리즘 자체로 보장된다.
function generateMazeGrid(n, seed) {
  const rng = mulberry32(seed);
  const size = n * 2 + 1;
  const grid = Array.from({ length: size }, () => new Array(size).fill(1));
  const visited = Array.from({ length: n }, () => new Array(n).fill(false));

  const toGrid = (cr, cc) => [2 * cr + 1, 2 * cc + 1];

  const stack = [[0, 0]];
  visited[0][0] = true;
  const [sr0, sc0] = toGrid(0, 0);
  grid[sr0][sc0] = 0;

  while (stack.length) {
    const [cr, cc] = stack[stack.length - 1];
    const neighbors = [];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = cr + dr, nc = cc + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      if (!visited[nr][nc]) neighbors.push([nr, nc]);
    }
    if (neighbors.length === 0) { stack.pop(); continue; }
    const [nr, nc] = neighbors[Math.floor(rng() * neighbors.length)];

    const [r1, c1] = toGrid(cr, cc);
    const [r2, c2] = toGrid(nr, nc);
    grid[(r1 + r2) / 2][(c1 + c2) / 2] = 0; // 두 칸 사이 벽 허물기
    grid[r2][c2] = 0;

    visited[nr][nc] = true;
    stack.push([nr, nc]);
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
