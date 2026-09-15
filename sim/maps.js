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
// 이내로 제한한 시드(=379)를 채택.
//
// **"방향 정보가 갈림길을 실제로 푸는가"를 기준으로 시드 재선정 (2026-09-15)**:
// 위까지의 시드 선정은 전부 "미로가 얼마나 촘촘한가"만 봤는데, 정작 이 실험의
// 가설(청각 랜드마크로 방위를 알면 더 빨리 도착한다)이 성립하려면 **방위를
// 알았을 때 갈림길에서 정답 분기가 실제로 갈려야** 한다. seed=379를 전수
// 조사해보니 경로 위 갈림길 10곳 전부가 "목표 쪽 출구 2개"라서, 방위를 완벽히
// 알아도 항상 50:50이었다. 최단경로가 맨해튼 단조(매 칸 목표에 가까워짐)라
// 갈림길마다 두 방향이 모두 목표 쪽이 되기 때문. DFS 탐색 시뮬레이션(4000회)
// 으로 확인한 결과 "방위 앎" 96.5칸 vs "방위 모름" 96.1칸으로 차이가 0이었다.
// 그래서 "목표 쪽 방향을 알면 정답 분기가 유일하게 결정되는 갈림길 수"를 새
// 지표로 넣고 600개 시드를 재탐색 — seed=10은 8곳 중 3곳이 결정 가능해지고,
// 같은 시뮬레이션에서 75.5칸 vs 94.6칸(약 20% 단축)으로 벌어진다.
// 경로 25칸·최장 가지 6칸은 그대로 유지.

const MAZE_CELL_N = 7;    // 7x7칸짜리 미로 (칸과 칸 사이 벽을 포함하면 15x15 격자)
const MAZE_SEED = 10;     // 고정 시드 — 경로 25칸, 갈림길 8개(전체 15개), 최장 가지 6칸, 방향으로 결정 가능한 갈림길 3/8
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
  // 실제로 걸어서 도달할 필요가 없다).
  // 0: 나무 타격음(저음), 1: 물방울(중음), 2: 바람 소리(고음) — audio.js와 순서를 맞춘다.
  //
  // **네 모서리 중 시작/도착을 뺀 두 곳 + 시작 모서리 바로 뒤** 배치.
  // 참가자에게 "소리가 나지 않는 대각선 반대편 모서리가 목적지"라는 규칙 하나만
  // 알려주면 되는, 외우기 쉬운 구성이다(index.html 안내 화면 참고). 회전/반전
  // 3종 모두에서 이 규칙이 그대로 성립함을 확인했다.
  //
  // 이전에는 [우상단, 좌하단, 정중앙]이었는데, 이 셋은 외적이 정확히 0인
  // **완전한 일직선**(반대각선 위)이라 삼각측량이 퇴화했다 — 3개째 랜드마크가
  // 2개 조건 대비 새로운 정보를 거의 주지 못해, "3개여야 위치 애매함이 완전히
  // 풀린다"(Jetzschke et al., 2017)를 검증하겠다는 설계 자체가 무력화된
  // 상태였다. 경로 위 25개 지점에서 삼각측량 품질(사잇각이 90°에 가까울수록 1)을
  // 계산하면 기존 0.90 → 현재 0.97로 개선된다.
  //
  // 2번(바람 소리)을 시작 모서리에서 **대각선 바깥으로 8칸 더 뺀** 이유:
  // 이 랜드마크는 경로를 따라 거리가 단조 증가해서(진행도와 상관 1.00), 시작
  // 모서리 바로 옆([0,0])에 두면 3칸만 걸어도 음량이 5.1dB씩 변한다 — 삼각측량
  // 없이 "소리 작아지는 쪽으로 간다"만 해도 길이 찾아지는 계기판이 되어버린다.
  // 멀리 빼면 같은 3칸 이동의 음량 변화가 1.3dB로 떨어져(고개만 돌려도 그보다 크게
  // 바뀜) 계기판으로 쓸 수 없게 되는 반면, 방위는 그대로 유지되므로 삼각측량
  // 품질은 0.980 -> 0.970으로 거의 안 떨어진다. 미로 밖이라 그 위에 설 수도 없다.
  // (반대각선 위에 놓으면 진행도와 무상관이 되지만 셋이 반드시 공선이 되어 삼각측량이
  //  퇴화한다 — 거리를 벌리는 쪽이 둘 다 피하는 유일한 방법이었다.)
  const landmarks = [
    [1, GRID_SIZE - 2],       // 0: 시작 모서리에서 한쪽 옆 모서리
    [GRID_SIZE - 2, 1],       // 1: 반대쪽 옆 모서리
    [-8, -8],                 // 2: 시작 모서리 대각선 바깥 (미로 밖 — 소리만 나는 가상의 점)
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

function mirrorV(mapDef) {
  const n = GRID_SIZE;
  return transformMapDef(mapDef, ([r, c]) => [n - 1 - r, c]);
}

const BASE_MAP = buildBaseGrid();

// map1/map2 조합을 rotate90+mirrorH로 뒀더니 "지도가 다 똑같아 보인다"는 피드백을
// 받음 — 확인해보니 실제 벽 구조는 다른데(ASCII로 직접 대조), 시작-도착 칸
// 좌표가 map1=[1,13]->[13,1], map2=[1,13]->[13,1]로 완전히 동일했음. 시작-도착이
// 정반대각선(좌상단-우하단)일 때 90도 회전과 좌우반전이 우연히 같은 모서리 쌍을
// 만들기 때문(둘 다 우상단->좌하단). 무늬 없는 벽+짙은 안개 환경에서는 "같은
// 자리에서 또 시작한다"는 게 가장 눈에 띄는 신호라, 벽 구조가 달라도 참가자가
// 같은 미로로 착각하기 쉬움. mirrorH 대신 mirrorV(상하반전)를 쓰면 map2의
// 시작-도착이 [13,1]->[1,13]으로 바뀌어(모서리는 같지만 시작/도착이 뒤바뀜),
// 세 시행의 "시작하는 순간 보이는 모서리"가 좌상단/우상단/좌하단으로 전부
// 달라진다. 우하단 모서리는 map0에서만 도착점으로 쓰인다.
const MAPS = [
  BASE_MAP,               // map 0 (원본)
  rotate90(BASE_MAP),      // map 1 (90도 회전)
  mirrorV(BASE_MAP),       // map 2 (상하 반전)
];

// 안전장치: "같은 지도가 두 번 나오면 안 된다"는 요구가 명시적으로 있었으므로,
// 세 맵의 (시작,도착) 좌표가 서로 다르다는 걸 로드 시점에 직접 검증한다. 나중에
// 누군가 변환 함수를 실수로 되돌리거나 같은 함수를 두 번 쓰면 참가자가 플레이해서
// 알아차리기 전에 콘솔에서 바로 걸리게 하기 위함(사람이 매번 확인하지 않아도
// 됨). 위치가 같아도 벽 구조가 다를 수 있어 grid까지는 비교하지 않고, 참가자가
// 가장 먼저·가장 뚜렷하게 알아차리는 "시작·도착 모서리"만 검증한다.
(function assertMapsAreDistinguishable() {
  const seen = new Set();
  MAPS.forEach((m, i) => {
    const key = `${m.start.join(",")}|${m.goal.join(",")}`;
    if (seen.has(key)) {
      throw new Error(
        `MAPS[${i}]가 앞선 맵과 시작·도착 좌표가 같습니다(${key}) — ` +
        `참가자에게 같은 지도로 보일 수 있으므로 maps.js의 변환 함수를 다시 확인하세요.`
      );
    }
    seen.add(key);
  });
})();

// 연습(워밍업) 전용 맵. 본시행 맵(MAPS[0..2])과 별개로, 아주 짧고 쉬운 경로만
// 제공한다 — 워밍업의 목적은 조작(WASD+시선)과 랜드마크 소리에 익숙해지는 것뿐이지
// 본시행과 같은 수준의 길찾기 난이도를 미리 겪게 하려는 게 아니다. 실제로
// 본시행 맵을 그대로 워밍업에 썼더니 "연습이 과하게 어렵다"는 피드백이 있어 분리함.
// 랜드마크 3개는 본시행과 **정확히 같은 세 모서리**에 둔다 — 어느 음색이 어느
// 쪽에서 들리는지 익히는 게 워밍업의 핵심 목적이라, 위치가 본시행과 다르면
// 연습이 오히려 방해가 된다. 다만 연습 맵은 경로가 짧아서 목적지가 모서리에
// 있지 않으므로, "소리 없는 모서리가 목적지"라는 규칙은 본시행에만 적용된다
// (안내 화면에 그렇게 명시함).
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
    landmarks: [[1, GRID_SIZE - 2], [GRID_SIZE - 2, 1], [-8, -8]],
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
