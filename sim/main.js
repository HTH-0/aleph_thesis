// 화면 전환과 전체 흐름을 담당한다.
// 흐름: 시작 -> 설문(R-SOD) -> 안내 -> 연습 1회 -> 본시행 3회(랜드마크 0/2/3개) -> 결과 다운로드

const screens = {
  intro: document.getElementById("screen-intro"),
  survey: document.getElementById("screen-survey"),
  instructions: document.getElementById("screen-instructions"),
  trial: document.getElementById("screen-trial"),
  between: document.getElementById("screen-between"),
  done: document.getElementById("screen-done"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

// ---- 참가자 순번 자동 배정 (같은 기기에서 순서대로 진행한다고 가정) ----
function getAssignmentForNextParticipant() {
  const raw = localStorage.getItem("nextSlot");
  const slotIndex = raw ? parseInt(raw, 10) % CONFIG.ASSIGNMENT_TABLE.length : 0;
  const nextIndex = (slotIndex + 1) % CONFIG.ASSIGNMENT_TABLE.length;
  localStorage.setItem("nextSlot", String(nextIndex));
  return { slot: slotIndex + 1, assignment: CONFIG.ASSIGNMENT_TABLE[slotIndex] };
}

// 랜드마크 개수(level)에 따라 실제로 켤 랜드마크 인덱스(0=쇳소리,1=물방울,2=기계음)를 정한다.
function activeIndicesForLevel(level, slot) {
  if (level === 0) return [];
  if (level === 3) return [0, 1, 2];
  // level === 2: 어떤 걸 뺄지 참가자 슬롯별로 순환
  const dropIdx = CONFIG.LEVEL2_DROP_INDEX_BY_SLOT[(slot - 1) % CONFIG.LEVEL2_DROP_INDEX_BY_SLOT.length];
  return [0, 1, 2].filter((i) => i !== dropIdx);
}

// ---- 상태 ----
const state = {
  name: "",
  rsod: null,
  slot: null,
  assignment: null,
  trials: [], // 본시행 결과만 (연습 제외)
};

// ---- 0. 시작 화면 ----
const inputName = document.getElementById("input-name");
const btnStartSurvey = document.getElementById("btn-start-survey");
inputName.addEventListener("input", () => {
  btnStartSurvey.disabled = inputName.value.trim().length === 0;
});
btnStartSurvey.addEventListener("click", () => {
  state.name = inputName.value.trim();
  const { slot, assignment } = getAssignmentForNextParticipant();
  state.slot = slot;
  state.assignment = assignment;
  showScreen("survey");
});

// ---- 1. 설문 화면 ----
const surveyItemsEl = document.getElementById("survey-items");
const btnSubmitSurvey = document.getElementById("btn-submit-survey");
const surveyAnswers = renderSurvey(surveyItemsEl, (answers) => {
  btnSubmitSurvey.disabled = answers.some((a) => a === null);
});
btnSubmitSurvey.addEventListener("click", () => {
  state.rsod = scoreRSOD(surveyAnswers);
  showScreen("instructions");
});

// ---- 2. 안내 화면 ----
const canvas = document.getElementById("trial-canvas");
const overlayEl = document.getElementById("click-to-start");
const betweenTitle = document.getElementById("between-title");
const betweenDesc = document.getElementById("between-desc");
const btnNextTrial = document.getElementById("btn-next-trial");

document.getElementById("btn-start-warmup").addEventListener("click", () => {
  // 워밍업은 랜드마크 3개를 다 켜서, 소리가 어떤 느낌인지 미리 한 번 접하게 한다
  // (기록에는 포함되지 않음 — 순전히 조작감/청각 익히기용)
  startTrialPhase({ map: CONFIG.WARMUP_MAP_INDEX, activeLandmarkIndices: [0, 1, 2] }, () => {
    betweenTitle.textContent = "연습 완료";
    betweenDesc.textContent = "이제부터가 실제 기록되는 본 시행입니다. 준비되면 다음을 눌러주세요.";
    btnNextTrial.onclick = () => runMainTrial(0);
    showScreen("between");
  });
});

function runMainTrial(idx) {
  const spec = state.assignment[idx];
  const activeLandmarkIndices = activeIndicesForLevel(spec.level, state.slot);

  startTrialPhase({ map: spec.map, activeLandmarkIndices }, (result) => {
    state.trials.push({
      trialIndex: idx + 1,
      map: spec.map,
      landmarkLevel: spec.level,
      activeLandmarkIndices,
      ...result,
    });

    if (idx + 1 < state.assignment.length) {
      betweenTitle.textContent = `${idx + 1}번째 시행 완료`;
      betweenDesc.textContent = "다음 시행으로 넘어갑니다. 준비되면 다음을 눌러주세요.";
      btnNextTrial.onclick = () => runMainTrial(idx + 1);
      showScreen("between");
    } else {
      finishAndShowDownload();
    }
  });
}

function startTrialPhase({ map, activeLandmarkIndices }, onDone) {
  showScreen("trial");
  overlayEl.classList.remove("hidden");
  runTrial(
    { canvas, overlayEl, mapDef: MAPS[map], activeLandmarkIndices },
    onDone
  );
}

// ---- 5. 종료 화면 ----
function finishAndShowDownload() {
  const resultData = {
    name: state.name,
    slot: state.slot,
    rsod: state.rsod,
    trials: state.trials,
    recordedAt: new Date().toISOString(),
  };

  showScreen("done");
  document.getElementById("result-preview").textContent = JSON.stringify(resultData, null, 2);

  document.getElementById("btn-download").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(resultData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = state.name.replace(/[^a-zA-Z0-9가-힣_-]/g, "_") || "participant";
    a.href = url;
    a.download = `result_${safeName}_slot${state.slot}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, { once: true });
}
