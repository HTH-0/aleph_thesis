// 한 번의 시행(맵 하나, 랜드마크 개수 하나)을 3D로 실행하고, 끝나면 결과를 돌려준다.
//
// 렌더러는 세션 내내 하나만 만들어 재사용한다 (매번 새로 만들고 버리면
// 브라우저가 WebGL 컨텍스트 재생성을 못 따라가서 화면이 멈추는 문제가 있었음).
let _sharedRenderer = null;
function getSharedRenderer(canvas) {
  if (!_sharedRenderer) {
    _sharedRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    _sharedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  _sharedRenderer.setSize(window.innerWidth, window.innerHeight);
  return _sharedRenderer;
}

// spec: { canvas, overlayEl, mapDef, landmarkCount, activeLandmarkIndices }
function runTrial(spec, onComplete) {
  const { canvas, overlayEl, mapDef, activeLandmarkIndices } = spec;

  const renderer = getSharedRenderer(canvas);

  const scene = new THREE.Scene();
  // 안개색을 밝게 — "몇 칸 앞까지 보이는지"(FOG_NEAR/FOG_FAR)는 실험 통제상 중요하지만,
  // 그 안이 얼마나 어두운 톤이냐는 실험 내용과 무관해서 눈 피로만 늘릴 뿐이라 밝혔다.
  // (1차로 살짝 밝혔는데도 어둡다는 피드백이 있어 더 밝게 다시 조정함)
  const fogColor = 0x7c7c86;
  scene.background = new THREE.Color(fogColor);
  scene.fog = new THREE.Fog(fogColor, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  // 바닥 / 천장 (무늬 없는 단색)
  const groundSize = GRID_SIZE * CONFIG.CELL_SIZE;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshBasicMaterial({ color: 0x6e6e72, fog: true })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(groundSize / 2, 0, groundSize / 2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    // 천장을 가장 밝게 잡아 "하늘"처럼 위쪽이 트여 보이게 함
    new THREE.MeshBasicMaterial({ color: 0x9c9ca4, fog: true })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(groundSize / 2, CONFIG.WALL_HEIGHT, groundSize / 2);
  scene.add(ceiling);

  function cellCenter([r, c]) {
    return new THREE.Vector3(
      c * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
      CONFIG.PLAYER_EYE_HEIGHT,
      r * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2
    );
  }

  const startPos = cellCenter(mapDef.start);
  const goalPos = cellCenter(mapDef.goal);
  const landmarkWorldPositions = mapDef.landmarks.map(cellCenter);
  camera.position.copy(startPos);

  // 목적지 표시 — 도착 순간 "여기가 맞다"를 눈으로 확인시켜주는 용도일 뿐,
  // 멀리서부터 목적지 방향을 미리 알려주면 안 된다. 처음엔 떠다니는 구체로
  // 표시했는데, 청각 랜드마크는 절대 시각적으로 안 보여준다고 계속 강조해온
  // 마당에 떠다니는 오브젝트가 있으면 "이것도 랜드마크인가?" 하고 참가자가
  // 헷갈릴 수 있다는 지적을 받아, 대신 목적지 칸을 둘러싼 벽 자체의 색을
  // 바꾸는 방식으로 변경 — 오브젝트가 아니라 "방이 다르게 생겼다"는 느낌이라
  // 랜드마크와 범주가 확실히 갈린다.
  // (실수 이력: 처음엔 이 벽 재질을 transparent+opacity로 만들어서 멀리서는
  //  opacity 0으로 안 보이게 했는데, 그러면 벽이 반투명해져서 뒤가 비쳐
  //  보이는 "벽이 뚫린" 버그가 됐다. 벽은 항상 완전히 불투명(항상 시야를
  //  막음)해야 하고, 색깔만 회색<->금색으로 서서히 바뀌어야 한다 — 그래서
  //  opacity 대신 material.color를 매 프레임 거리 기반으로 보간한다.)
  // 색이 바뀌는 범위는 안개가 걷히는 범위(FOG_NEAR~FOG_FAR)와 맞춘다 —
  // "안개가 걷혀서 벽이 보이기 시작하면 바로 도착지인 게 구분돼야, 대충
  // 훑어보고 지나치는 일이 없다"는 요구사항. 벽이 안 보이는 범위 밖에서는
  // 안개 자체가 이미 다 가려주므로(모든 벽이 동일하게 안 보임) 더 멀리서
  // 미리 알려주는 건 아니다 — 딱 "보이는 순간부터 구분됨"만 보장한다.
  const GOAL_MARKER_NEAR = CONFIG.FOG_NEAR;
  const GOAL_MARKER_FAR = CONFIG.FOG_FAR;
  const WALL_COLOR = new THREE.Color(0x8a8a8a);
  const GOAL_WALL_COLOR = new THREE.Color(0xffd166);
  const goalWallMat = new THREE.MeshBasicMaterial({ color: WALL_COLOR.clone(), fog: true });

  // 벽 (전부 같은 재질 — 시각 랜드마크 제거. 목적지 칸에 맞닿은 벽만 예외)
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x8a8a8a, fog: true });
  const wallGeo = new THREE.BoxGeometry(
    CONFIG.CELL_SIZE,
    CONFIG.WALL_HEIGHT,
    CONFIG.CELL_SIZE
  );
  // 목적지에 맞닿은 벽은 통째로 칠하면 너무 길어 보여서, 목적지 쪽 절반만
  // 금색으로 칠하고 나머지 절반은 원래 회색 그대로 둔다.
  const wallHalfGeoX = new THREE.BoxGeometry(CONFIG.CELL_SIZE / 2, CONFIG.WALL_HEIGHT, CONFIG.CELL_SIZE);
  const wallHalfGeoZ = new THREE.BoxGeometry(CONFIG.CELL_SIZE, CONFIG.WALL_HEIGHT, CONFIG.CELL_SIZE / 2);
  const [goalR, goalC] = mapDef.goal;
  const goalAdjacentKeys = new Set(
    [[goalR + 1, goalC], [goalR - 1, goalC], [goalR, goalC + 1], [goalR, goalC - 1]]
      .map(([r, c]) => `${r},${c}`)
  );

  function addGoalAdjacentWall(r, c) {
    const dr = r - goalR, dc = c - goalC;
    const cx = c * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const cz = r * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
    const cy = CONFIG.WALL_HEIGHT / 2;
    const quarter = CONFIG.CELL_SIZE / 4;

    const nearMesh = new THREE.Mesh(dc !== 0 ? wallHalfGeoX : wallHalfGeoZ, goalWallMat);
    const farMesh = new THREE.Mesh(dc !== 0 ? wallHalfGeoX : wallHalfGeoZ, wallMat);
    if (dc !== 0) {
      const towardGoal = dc > 0 ? -quarter : quarter;
      nearMesh.position.set(cx + towardGoal, cy, cz);
      farMesh.position.set(cx - towardGoal, cy, cz);
    } else {
      const towardGoal = dr > 0 ? -quarter : quarter;
      nearMesh.position.set(cx, cy, cz + towardGoal);
      farMesh.position.set(cx, cy, cz - towardGoal);
    }
    scene.add(nearMesh);
    scene.add(farMesh);
  }

  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (mapDef.grid[r][c] === 1) {
        if (goalAdjacentKeys.has(`${r},${c}`)) {
          addGoalAdjacentWall(r, c);
          continue;
        }
        const mesh = new THREE.Mesh(wallGeo, wallMat);
        mesh.position.set(
          c * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2,
          CONFIG.WALL_HEIGHT / 2,
          r * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2
        );
        scene.add(mesh);
      }
    }
  }

  const deadEndKeySet = new Set(mapDef.deadEndCells.map(([r, c]) => `${r},${c}`));
  const shortestCells = shortestPathCellCount(mapDef) || 1;
  const shortestWorldDistance = (shortestCells - 1) * CONFIG.CELL_SIZE;

  let yaw = 0;
  let pitch = 0;

  function isWall(x, z) {
    const gc = Math.floor(x / CONFIG.CELL_SIZE);
    const gr = Math.floor(z / CONFIG.CELL_SIZE);
    if (gr < 0 || gr >= GRID_SIZE || gc < 0 || gc >= GRID_SIZE) return true;
    return mapDef.grid[gr][gc] === 1;
  }

  function canStandAt(x, z) {
    const r = CONFIG.PLAYER_RADIUS;
    return (
      !isWall(x - r, z) &&
      !isWall(x + r, z) &&
      !isWall(x, z - r) &&
      !isWall(x, z + r)
    );
  }

  function currentCell(x, z) {
    return [Math.floor(z / CONFIG.CELL_SIZE), Math.floor(x / CONFIG.CELL_SIZE)];
  }

  const audio = new LandmarkAudio();
  const keys = {};
  function onKeyDown(e) { keys[e.code] = true; }
  function onKeyUp(e) { keys[e.code] = false; }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  let angleAccumThisFrame = 0;
  function onMouseMove(e) {
    if (document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * CONFIG.LOOK_SENSITIVITY;
    pitch -= e.movementY * CONFIG.LOOK_SENSITIVITY;
    const maxPitch = Math.PI / 2 - 0.05;
    pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));
    angleAccumThisFrame += Math.abs(e.movementX) + Math.abs(e.movementY);
  }
  document.addEventListener("mousemove", onMouseMove);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  let started = false;
  let finished = false;
  let paused = false;      // 알트탭 등으로 포인터락이 풀려서 잠시 멈춘 상태
  let pauseStartedAt = 0;
  let startTime = 0;
  let distance = 0;
  let reorientationSec = 0;
  let deadEndEntries = 0;
  let wasInDeadEnd = false;

  // 오버레이 문구는 일시정지 때 바뀌므로, 매 시행 시작 시 초기 문구로 되돌려둔다
  // (그대로 두면 이전 시행에서 바뀐 문구가 다음 시행에도 남아있게 됨).
  const overlayText = overlayEl.querySelector("p");
  const OVERLAY_START_MSG = "화면을 클릭하면 시작합니다";
  const OVERLAY_RESUME_MSG = "포인터가 풀렸습니다 — 클릭하면 이어서 진행합니다";
  if (overlayText) overlayText.textContent = OVERLAY_START_MSG;

  function onOverlayClick() {
    if (finished) return;
    overlayEl.classList.add("hidden");
    canvas.requestPointerLock();
    if (!started) {
      started = true;
      audio.init(landmarkWorldPositions, activeLandmarkIndices);
      startTime = performance.now();
    } else if (paused) {
      // 멈춰있던 시간만큼 시작 시각을 밀어서, 알트탭한 시간이 제한시간(260초)을
      // 갉아먹지 않게 한다.
      startTime += performance.now() - pauseStartedAt;
      paused = false;
    }
  }
  overlayEl.addEventListener("click", onOverlayClick);

  // 알트탭 등으로 브라우저가 강제로 포인터락을 풀면, 마우스 시선 조작(onMouseMove)만
  // 조용히 멈추고 WASD 이동은 계속 처리되는 오류가 있었다("화면은 안 움직이는데
  // 키보드만 작동함") — 참가자가 다시 클릭해서 잠글 방법도 없었음. 포인터락이
  // 풀리는 순간을 감지해서 시행을 일시정지하고, 오버레이를 다시 보여준다.
  function onPointerLockChange() {
    if (document.pointerLockElement === canvas) return; // 잠김 유지/재획득
    if (started && !finished && !paused) {
      paused = true;
      pauseStartedAt = performance.now();
      if (overlayText) overlayText.textContent = OVERLAY_RESUME_MSG;
      overlayEl.classList.remove("hidden");
    }
  }
  document.addEventListener("pointerlockchange", onPointerLockChange);

  let rafId = null;
  let lastT = performance.now();

  function cleanup() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    overlayEl.removeEventListener("click", onOverlayClick);
    if (rafId) cancelAnimationFrame(rafId);
    audio.stop();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    // 렌더러는 재사용하므로 dispose하지 않는다. 씬만 버려지도록 둔다.
  }

  function finish(timedOut) {
    if (finished) return;
    finished = true;
    const elapsedSec = (performance.now() - startTime) / 1000;
    cleanup();
    const pathEfficiency = shortestWorldDistance > 0
      ? Number((distance / shortestWorldDistance).toFixed(2))
      : null;
    onComplete({
      elapsedSec: Number(elapsedSec.toFixed(2)),
      distance: Number(distance.toFixed(2)),
      shortestWorldDistance: Number(shortestWorldDistance.toFixed(2)),
      pathEfficiency,
      reorientationSec: Number(reorientationSec.toFixed(2)),
      deadEndEntries,
      timedOut,
    });
  }

  function animate(now) {
    rafId = requestAnimationFrame(animate);
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;

    // 목적지 칸에 맞닿은 벽만 가까이 갈수록 회색 -> 금색으로 서서히 바뀌게 함
    // (도착 확인용 — 벽은 항상 불투명 유지, 색만 보간해서 "뚫려 보이는" 버그 방지)
    const distToGoalMarker = Math.hypot(
      camera.position.x - goalPos.x,
      camera.position.z - goalPos.z
    );
    const markerT = Math.max(0, Math.min(1,
      (GOAL_MARKER_FAR - distToGoalMarker) / (GOAL_MARKER_FAR - GOAL_MARKER_NEAR)
    ));
    goalWallMat.color.lerpColors(WALL_COLOR, GOAL_WALL_COLOR, markerT);

    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    if (started && !finished && !paused) {
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3()
        .crossVectors(forward, new THREE.Vector3(0, 1, 0))
        .normalize();

      let dx = 0, dz = 0;
      if (keys["KeyW"]) { dx += forward.x; dz += forward.z; }
      if (keys["KeyS"]) { dx -= forward.x; dz -= forward.z; }
      if (keys["KeyA"]) { dx -= right.x; dz -= right.z; }
      if (keys["KeyD"]) { dx += right.x; dz += right.z; }

      const len = Math.hypot(dx, dz);
      let movedThisFrame = 0;
      if (len > 0) {
        dx = (dx / len) * CONFIG.MOVE_SPEED * dt;
        dz = (dz / len) * CONFIG.MOVE_SPEED * dt;

        const curX = camera.position.x;
        const curZ = camera.position.z;
        let newX = curX;
        let newZ = curZ;

        if (canStandAt(curX + dx, curZ)) newX = curX + dx;
        if (canStandAt(newX, curZ + dz)) newZ = curZ + dz;

        movedThisFrame = Math.hypot(newX - curX, newZ - curZ);
        distance += movedThisFrame;
        camera.position.x = newX;
        camera.position.z = newZ;
      }

      // 재정향 시간: 거의 안 움직이면서 시선만 활발히 돌리고 있으면 누적
      if (movedThisFrame < CONFIG.REORIENT_MOVE_EPS && angleAccumThisFrame > CONFIG.REORIENT_LOOK_MIN) {
        reorientationSec += dt;
      }
      angleAccumThisFrame = 0;

      // 막다른 길 진입 횟수 (진입 순간만 카운트)
      const [cr, cc] = currentCell(camera.position.x, camera.position.z);
      const inDeadEnd = deadEndKeySet.has(`${cr},${cc}`);
      if (inDeadEnd && !wasInDeadEnd) deadEndEntries++;
      wasInDeadEnd = inDeadEnd;

      audio.updateListener(camera);

      const dGoal = Math.hypot(
        camera.position.x - goalPos.x,
        camera.position.z - goalPos.z
      );
      if (dGoal < CONFIG.GOAL_RADIUS) {
        finish(false);
        return;
      }
      const elapsed = (now - startTime) / 1000;
      if (elapsed > CONFIG.TRIAL_TIMEOUT_SEC) {
        finish(true);
        return;
      }
    }

    renderer.render(scene, camera);
  }

  rafId = requestAnimationFrame(animate);
}
