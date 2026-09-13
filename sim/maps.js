// 맵(미로) 정의.
// 기본 미로 1개를 손으로 설계하고, 회전/반전만으로 나머지 2개를 만든다.
// (근거: He et al., 2024 — 기본 미로를 회전/반전하면 경로 길이·꺾임 수가
//  구조적으로 100% 동일한 맵을 여러 개 만들 수 있다.)
// 청각 랜드마크 3개의 좌표도 같은 회전/반전을 적용해서, 맵이 바뀌어도
// "랜드마크와 경로의 상대적 위치 관계"가 그대로 유지되게 한다.

const GRID_SIZE = 9; // 9x9, 테두리는 항상 벽

function buildBaseGrid() {
  const grid = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    grid.push(new Array(GRID_SIZE).fill(1));
  }

  // 메인 경로 (시작 -> 도착), 꺾임 7회, 총 20칸
  const mainPath = [
    [1, 1], [1, 2], [1, 3],
    [2, 3],
    [3, 3], [3, 2], [3, 1],
    [4, 1],
    [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
    [4, 5],
    [3, 5], [3, 6], [3, 7],
    [4, 7],
    [5, 7],
    [6, 7],
    [7, 7],
  ];

  // 막다른 길 2곳 (틀린 선택을 할 여지를 만드는 용도)
  const deadEndCells = [
    [2, 4],           // (2,3)에서 갈라짐
    [6, 3], [7, 3],   // (5,3)에서 갈라짐
  ];

  for (const [r, c] of [...mainPath, ...deadEndCells]) {
    grid[r][c] = 0;
  }

  // 청각 랜드마크 3개 (벽 위치여도 상관없음 — 소리만 나는 가상의 점이라
  // 실제로 걸어서 도달할 필요가 없다). 삼각측량이 되도록 서로 멀리 떨어뜨림.
  // 0: 쇳소리(금속), 1: 물방울 소리, 2: 낮은 기계음(허밍) — audio.js와 순서를 맞춘다.
  const landmarks = [
    [1, 7], // 우상단
    [7, 1], // 좌하단
    [4, 4], // 중앙
  ];

  return {
    grid,
    start: [1, 1],
    goal: [7, 7],
    deadEndCells,
    landmarks,
  };
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
