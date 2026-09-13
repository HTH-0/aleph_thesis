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
  const fogColor = 0x1a1a1a;
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
    new THREE.MeshBasicMaterial({ color: 0x3a3a3a, fog: true })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(groundSize / 2, 0, groundSize / 2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshBasicMaterial({ color: 0x2a2a2a, fog: true })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(groundSize / 2, CONFIG.WALL_HEIGHT, groundSize / 2);
  scene.add(ceiling);

  // 벽 (전부 같은 재질 — 시각 랜드마크 제거)
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x8a8a8a, fog: true });
  const wallGeo = new THREE.BoxGeometry(
    CONFIG.CELL_SIZE,
    CONFIG.WALL_HEIGHT,
    CONFIG.CELL_SIZE
  );
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (mapDef.grid[r][c] === 1) {
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
  let startTime = 0;
  let distance = 0;
  let reorientationSec = 0;
  let deadEndEntries = 0;
  let wasInDeadEnd = false;

  function onOverlayClick() {
    if (started) return;
    started = true;
    overlayEl.classList.add("hidden");
    canvas.requestPointerLock();
    audio.init(landmarkWorldPositions, activeLandmarkIndices);
    startTime = performance.now();
  }
  overlayEl.addEventListener("click", onOverlayClick);

  let rafId = null;
  let lastT = performance.now();

  function cleanup() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("mousemove", onMouseMove);
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

    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    if (started && !finished) {
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
