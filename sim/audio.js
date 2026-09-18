// 고정 청각 랜드마크 3개 (삼각측량용).
// 목적지 방향은 알려주지 않는다 — 그냥 "여기에 이런 소리가 난다"는
// 고정된 기준점 정보만 주고, 참가자가 스스로 위치를 종합 추론해야 한다.
//
// **거리 감쇠는 유지한다 (2026-09-15)**: 한 번 없애봤다가(rolloff = 0) 실제
// 플레이에서 "소리가 아무 반응도 안 해서 의미가 없다"는 판단이 나와 되돌렸다.
// 음량 변화는 현실감 요소가 아니라 방향 판단 자체를 돕는 단서다 — 몇 걸음
// 움직였을 때 커지는지 작아지는지가 HRTF의 앞뒤 혼동을 푸는 주된 방법이라,
// 없애면 신호가 순수해지는 게 아니라 못 쓰게 된다.
// "음량이 진행도 계기판이 되는" 문제는 감쇠를 끄는 대신 랜드마크 2번을 미로
// 바깥으로 멀리 빼서 해결했다(maps.js / config.js의 LANDMARK_ROLLOFF 주석 참고).
//
// 근거: Jetzschke et al. (2017) — 서로 완전히 같은 소리는 몇 개를 줘도
// 위치 애매함이 안 풀리지만, 서로 다른(unique) 소리 3개는 애매함이 풀린다.
// 그래서 3개 랜드마크를 저/중/고 주파수대와 리듬을 뚜렷하게 다르게 만든다.
// (저주파는 양쪽 귀 도달시간차로, 고주파는 귓바퀴 형태에 의한 스펙트럼
//  왜곡으로 방향을 판단하는 메커니즘 자체가 달라서, 대역을 나눠두면
//  삼각측량에 쓸 수 있는 단서가 겹치지 않고 더 풍부해진다.)
//   0: 나무 타격음 (저음 300~440Hz + 짧은 타격 트랜지언트, 1.2초 간격)
//   1: 물방울 (중음 820~2550Hz를 빠르게 훑고 올라가는 "똑", 2번, 1.8초 간격)
//   2: 바람 소리 (고음 3~5kHz대 대역통과 노이즈, 길게 퍼졌다 사라짐, 2.5초 간격)
//
// 이름과 실제 소리 대조 (2026-09-15): 원래 1번은 "물방울 아르페지오"라 불렀지만
// 실제로는 사인파 3음을 계단식으로 올리는 알림음이었고, 2번은 "금속 차임"이라
// 불렀지만 귀 아픔 문제로 노이즈 기반으로 바꾼 뒤였는데도 이름만 남아 있었다.
// 참가자는 이 이름을 보고 소리를 찾아야 하므로(음색↔모서리 대응이 과제의 핵심)
// 이름과 실제가 어긋나면 조작 자체가 흐려진다. 1번은 실제 물방울처럼 주파수를
// 연속으로 활공시키도록 소리를 고쳤고, 2번은 노이즈 특성을 유지해야 해서
// (아래 주석 참고) 이름을 실제에 맞게 "바람 소리"로 고쳤다.
// 세 소리 모두 "주기적으로 짧게 울리고 끊기는" 방식으로 통일했다 — 이전엔 2번만
// 끊김없이 계속 재생되는 허밍이라, "랜드마크 2개" 조건에서 2번이 빠지는 경우와
// 0·1번이 빠지는 경우가 서로 다른 종류의 변화(끊김없는 소리 유무 자체가 바뀜)가
// 되어버리는 문제가 있었다. 재생 간격도 1.2/1.8/2.5초로 서로 배수 관계가 아니게
// 잡아서, 세 소리가 동시에 겹쳐 울려 마스킹(소리 씹힘)되는 일이 자주 반복되지
// 않게 했다.
class LandmarkAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;    // 전체 음량 (거리 감쇠를 없앤 대신 여기서 한 번에 조절)
    this.panners = [];         // 활성화된 PannerNode 목록
    this.timers = [];          // clearInterval 대상
    this.lfoNodes = [];        // 계속 재생 중인 오실레이터(근접 확인용 트레몰로 LFO) — stop 시 정지 필요
    this.activeLandmarks = []; // [{ pos: {x,y,z}, proximityDepth: GainNode }]
  }

  // 반드시 사용자 클릭 등 제스처 이후에 호출해야 브라우저 정책에 안 걸린다.
  // landmarkWorldPositions: [{x,y,z}, ...] (인덱스 0/1/2 = 목재펄스/물방울아르페지오/금속차임)
  // activeIndices: 이번 시행에서 켤 랜드마크 인덱스 목록 (0/2/3개)
  init(landmarkWorldPositions, activeIndices) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // 전체 음량을 한 곳에서 조절하는 지점(세 소리가 동시에 가까이서 겹칠 때
    // 클리핑되지 않도록). config.js: LANDMARK_MASTER_GAIN 참고.
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = CONFIG.LANDMARK_MASTER_GAIN;
    this.masterGain.connect(this.ctx.destination);

    const timbreFns = [
      (panner) => this._scheduleWood(panner),
      (panner) => this._scheduleDrop(panner),
      (panner) => this._scheduleWind(panner),
    ];

    activeIndices.forEach((idx) => {
      const panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      // linear 모델 + rolloffFactor=1 조합이라야 maxDistance 밖에서 정확히
      // 무음이 된다(config.js의 LANDMARK_ROLLOFF 주석 참고) — inverse는
      // 아무리 멀어도 완전히 0이 되지 않아 "늘 들리는 배경음"이 되는 문제가 있었다.
      panner.distanceModel = "linear";
      panner.refDistance = CONFIG.LANDMARK_REF_DISTANCE;
      panner.maxDistance = CONFIG.LANDMARK_MAX_DISTANCE;
      panner.rolloffFactor = CONFIG.LANDMARK_ROLLOFF;
      const pos = landmarkWorldPositions[idx];
      this._setPos(panner, pos);
      this.panners.push(panner);

      // 근접 확인 효과: 랜드마크에 가까워질수록 소리가 떨리는(트레몰로) 정도가
      // 커진다. panner 출력 뒤에 진폭 변조 체인을 하나 더 연결한다.
      // (tremoloGain.gain = 1 + lfo(sine) * depth, depth는 매 프레임 거리에 따라 갱신)
      const tremoloGain = this.ctx.createGain();
      tremoloGain.gain.value = 1;
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = CONFIG.LANDMARK_PROXIMITY_RATE;
      const lfoDepth = this.ctx.createGain();
      lfoDepth.gain.value = 0; // 멀리 있을 땐 떨림 없음, updateListener()가 매 프레임 갱신
      lfo.connect(lfoDepth);
      lfoDepth.connect(tremoloGain.gain);
      lfo.start();

      panner.connect(tremoloGain);
      tremoloGain.connect(this.masterGain);

      this.lfoNodes.push(lfo);
      this.activeLandmarks.push({ pos, lfoDepth });

      timbreFns[idx](panner);
    });
  }

  _setPos(panner, pos) {
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    const pos = camera.position;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    if (listener.positionX) {
      listener.positionX.value = pos.x;
      listener.positionY.value = pos.y;
      listener.positionZ.value = pos.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
    } else {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }

    const far = CONFIG.LANDMARK_PROXIMITY_FAR;
    const near = CONFIG.LANDMARK_PROXIMITY_NEAR;
    const maxDepth = CONFIG.LANDMARK_PROXIMITY_DEPTH;
    const now = this.ctx.currentTime;
    this.activeLandmarks.forEach(({ pos: lp, lfoDepth }) => {
      const d = Math.hypot(pos.x - lp.x, pos.y - lp.y, pos.z - lp.z);
      const t = Math.max(0, Math.min(1, (far - d) / (far - near)));
      lfoDepth.gain.setTargetAtTime(t * maxDepth, now, 0.05);
    });
  }

  // 0: 나무 타격음 — 낮은 두 음(300/440Hz 삼각파)에 아주 짧은 저역 노이즈
  // 트랜지언트를 얹어 "탁" 하고 때리는 성분을 만든다. 삼각파만 있을 땐 때리는
  // 소리라기보다 마림바 음에 가까워서 이름과 어긋나 있었다. 트랜지언트는 방향
  // 판단에도 유리하다 — 넓은 대역의 순간음이 귓바퀴 스펙트럼 단서를 가장 잘 만든다.
  _playWoodOnce(dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    const click = this.ctx.createBufferSource();
    click.buffer = this._getNoiseBuffer();
    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = "lowpass";
    clickFilter.frequency.value = 1800; // 고역을 깎아 나무 특유의 둔탁함을 만든다
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, t);
    clickGain.gain.exponentialRampToValueAtTime(0.22, t + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(dest);
    click.start(t); click.stop(t + 0.04);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = "triangle";
    osc2.type = "triangle";
    osc1.frequency.value = 300;
    osc2.frequency.value = 440; // 정수배가 아니게 어긋나서 목재 특유의 둔탁함
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(dest);
    osc1.start(t); osc1.stop(t + 0.18);
    osc2.start(t); osc2.stop(t + 0.18);
  }

  _scheduleWood(panner) {
    const playOnce = () => this._playWoodOnce(panner);
    playOnce();
    this.timers.push(setInterval(playOnce, 1200));
  }

  // 1: 물방울 — 실제 물방울 소리의 결정적 특징은 "음이 아주 빠르게 위로
  // 미끄러져 올라가는" 것이다(수면에 갇힌 기포가 수축하며 공명 주파수가 올라감).
  // 이전 버전은 사인파 3음을 계단식으로 올렸는데, 그러면 물방울이 아니라 알림음
  // 처럼 들려서 이름과 실제가 어긋나 있었다. 주파수를 연속으로 활공시키는 방식으로
  // 교체하고, 한 번 울릴 때 "똑, 똑" 두 방울로 만들어 들릴 기회를 늘렸다.
  _playDropOnce(dest) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [0, 0.3].forEach((offset, i) => {
      const t = t0 + offset;
      const base = i === 0 ? 820 : 980; // 두 방울의 음높이를 살짝 다르게
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 2.6, t + 0.07); // 위로 활공
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t); osc.stop(t + 0.15);
    });
  }

  _scheduleDrop(panner) {
    const playOnce = () => this._playDropOnce(panner);
    playOnce();
    this.timers.push(setInterval(playOnce, 1800));
  }

  // 2: 바람 소리 — 원래 순수 사인파 배음을 겹친 "금속 차임"이었는데, "날카롭고
  // 귀가 찢어질 것 같다"는 피드백이 반복됨. 순수음(pure tone)은 주파수가
  // 한 점에 집중돼 있어서 사람 귀에 유독 날카롭고 피로하게 들린다 — 특히
  // 2~5kHz대(사람 귀가 가장 민감한 대역이라 통증에도 가장 민감함)에서는
  // 게인을 아무리 낮춰도 잘 안 풀리는 문제였다. 그래서 순수음 대신 대역통과
  // 필터를 씌운 노이즈(필터링된 화이트노이즈)로 바꿨다.
  //
  // 이렇게 바꾼 뒤로는 "금속 차임"이라는 이름이 실제와 맞지 않는다 — Q=4짜리
  // 넓은 대역통과(대역폭 약 850Hz)라 음정이 잡히지 않아서, 실제로는 쇳소리가
  // 아니라 "쉬—" 하고 퍼졌다 사라지는 바람 소리에 가깝다. 소리를 되돌리면 귀
  // 아픔이 재발하므로, 이름 쪽을 실제에 맞췄다.
  //
  // 노이즈라는 성질 자체가 이 실험엔 오히려 유리하다: (1) 넓은 대역 에너지가
  // 귓바퀴 스펙트럼 단서를 가장 잘 만들어 고음 방향 판단에 최적이고, (2) 나머지
  // 둘이 음정 있는 소리라 "음정 없는 소리 하나"가 섞이면 세 음색 구분이 쉬워진다.
  _getNoiseBuffer() {
    if (this._noiseBuffer && this._noiseBufferCtx === this.ctx) {
      return this._noiseBuffer;
    }
    const dur = 2; // 초 (0번의 짧은 타격 트랜지언트도 이 버퍼 앞부분을 잘라 쓴다)
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buffer;
    this._noiseBufferCtx = this.ctx;
    return buffer;
  }

  _playWindOnce(dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buffer = this._getNoiseBuffer();
    // [중심주파수, 최대게인]. 예전 inverse 감쇠 모델일 때는 이 랜드마크가 멀리
    // 있어서 게인을 2배로 보정했었는데, linear+하드 컷오프로 바꾼 뒤로는 들릴 때
    // (maxDistance 안쪽)의 감쇠 곡선 자체가 달라져서 그 보정이 더는 맞지 않는다
    // (config.js의 LANDMARK_ROLLOFF 주석 참고) — 원래 게인으로 되돌림.
    const bands = [[3400, 0.16], [4800, 0.1]];
    bands.forEach(([freq, peak]) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = 4;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.8); // 길게 퍼지는 여운
      src.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      src.start(t); src.stop(t + 1.85);
    });
  }

  _scheduleWind(panner) {
    const playOnce = () => this._playWindOnce(panner);
    playOnce();
    this.timers.push(setInterval(playOnce, 2500));
  }

  // 안내 단계에서 "소리 미리 듣기" 버튼이 쓰는 진입점 — 공간감(패닝) 없이
  // 리스너 바로 앞에서 한 번만 재생해서, 세 음색을 구분하는 연습만 하게 한다.
  // idx: 0=나무 타격음, 1=물방울, 2=바람 소리
  previewOnce(idx) {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    // 본시행과 같은 음량으로 들려줘야 연습이 의미가 있으므로 여기도 마스터 게인을 거친다.
    if (!this.masterGain || this.masterGain.context !== this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = CONFIG.LANDMARK_MASTER_GAIN;
      this.masterGain.connect(this.ctx.destination);
    }
    const fns = [
      () => this._playWoodOnce(this.masterGain),
      () => this._playDropOnce(this.masterGain),
      () => this._playWindOnce(this.masterGain),
    ];
    fns[idx]();
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.lfoNodes.forEach((n) => { try { n.stop(); } catch (e) {} });
    this.lfoNodes = [];
    this.panners = [];
    this.activeLandmarks = [];
    this.masterGain = null;
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
