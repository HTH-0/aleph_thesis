// 실험 전역 설정값. 여기 숫자만 바꾸면 난이도/타이밍을 조절할 수 있다.
const CONFIG = {
  CELL_SIZE: 4,          // 미로 한 칸의 한 변 길이 (world unit)
  WALL_HEIGHT: 3,
  PLAYER_EYE_HEIGHT: 1.6,
  PLAYER_RADIUS: 0.9,    // 충돌 판정용 반지름
  MOVE_SPEED: 3.5,       // unit/sec
  LOOK_SENSITIVITY: 0.0022,
  FOG_NEAR: 1,
  FOG_FAR: 9,             // 이 거리 너머는 안개로 안 보임 (약 2칸 앞) — 시각 정보용
  GOAL_RADIUS: 1.2,       // 이 거리 안에 들어오면 도착 판정
  TRIAL_TIMEOUT_SEC: 150,
  WARMUP_MAP_INDEX: 0,    // 연습 시행에 쓸 맵 (기록에는 포함 안 함)

  // 재정향(멈춰서 소리 방향 탐색) 판정 기준
  REORIENT_MOVE_EPS: 0.03,       // 이 이하로 움직이면 "정지"로 간주 (unit/frame 누적 아님, 프레임당 이동거리)
  REORIENT_LOOK_MIN: 0.02,       // 이 이상 시선을 돌려야 "탐색 중"으로 간주 (프레임당 각도 누적, 라디안)

  // 청각 랜드마크 (audio.js의 timbre 0/1/2와 순서를 맞춤: 0=쇳소리, 1=물방울, 2=기계음 허밍)
  LANDMARK_REF_DISTANCE: 8,   // 이 거리 안에서는 거의 최대 음량
  LANDMARK_MAX_DISTANCE: 60,  // 미로 전체(대각선 약 45유닛)를 덮도록 넉넉히
  LANDMARK_ROLLOFF: 0.6,      // 완만하게 감쇠 — 어디서든 어느 정도 들려야 삼각측량이 가능

  // 참가자 1~6번에게 자동으로 배정되는 순서표.
  // 각 행: 3회의 본시행에서 (맵, 랜드마크 개수)를 어떤 순서로 배정할지.
  // 레벨(0/2/3)과 맵(0/1/2) 조합이 참가자마다 다르게 돌아가도록 짠 표.
  ASSIGNMENT_TABLE: [
    [{ map: 0, level: 0 }, { map: 1, level: 2 }, { map: 2, level: 3 }],
    [{ map: 2, level: 0 }, { map: 1, level: 2 }, { map: 0, level: 3 }],
    [{ map: 0, level: 2 }, { map: 1, level: 3 }, { map: 2, level: 0 }],
    [{ map: 2, level: 2 }, { map: 1, level: 3 }, { map: 0, level: 0 }],
    [{ map: 0, level: 3 }, { map: 1, level: 0 }, { map: 2, level: 2 }],
    [{ map: 2, level: 3 }, { map: 1, level: 0 }, { map: 0, level: 2 }],
  ],

  // 랜드마크 2개 조건일 때, 3개 중 어떤 걸 빼고 쓸지 참가자 슬롯별로 순환시킨다.
  // (매번 같은 랜드마크만 빠지면 그 랜드마크의 위치 효과가 섞여 들어갈 수 있어서)
  LEVEL2_DROP_INDEX_BY_SLOT: [2, 0, 1, 2, 0, 1],
};
