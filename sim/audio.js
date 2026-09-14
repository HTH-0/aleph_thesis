// 고정 청각 랜드마크 3개 (삼각측량용).
// 목적지 방향은 알려주지 않는다 — 그냥 "여기에 이런 소리가 난다"는
// 고정된 기준점 정보만 주고, 참가자가 스스로 위치를 종합 추론해야 한다.
//
// 근거: Jetzschke et al. (2017) — 서로 완전히 같은 소리는 몇 개를 줘도
// 위치 애매함이 안 풀리지만, 서로 다른(unique) 소리 3개는 애매함이 풀린다.
// 그래서 3개 랜드마크를 저/중/고 주파수대와 리듬을 뚜렷하게 다르게 만든다.
// (저주파는 양쪽 귀 도달시간차로, 고주파는 귓바퀴 형태에 의한 스펙트럼
//  왜곡으로 방향을 판단하는 메커니즘 자체가 달라서, 대역을 나눠두면
//  삼각측량에 쓸 수 있는 단서가 겹치지 않고 더 풍부해진다.)
//   0: 목재 펄스 (저음 200~600Hz대, 통통거리는 타악기, 1.2초 간격)
//   1: 물방울 아르페지오 (중음 800~2500Hz대, 상향하는 짧은 음 3개, 1.8초 간격)
//   2: 금속 차임 (고음 3~6kHz대, 길게 퍼지는 잔향, 2.5초 간격)
// 세 소리 모두 "주기적으로 짧게 울리고 끊기는" 방식으로 통일했다 — 이전엔 2번만
// 끊김없이 계속 재생되는 허밍이라, "랜드마크 2개" 조건에서 2번이 빠지는 경우와
// 0·1번이 빠지는 경우가 서로 다른 종류의 변화(끊김없는 소리 유무 자체가 바뀜)가
// 되어버리는 문제가 있었다. 재생 간격도 1.2/1.8/2.5초로 서로 배수 관계가 아니게
// 잡아서, 세 소리가 동시에 겹쳐 울려 마스킹(소리 씹힘)되는 일이 자주 반복되지
// 않게 했다.
class LandmarkAudio {
  constructor() {
    this.ctx = null;
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

    const timbreFns = [
      (panner) => this._scheduleWood(panner),
      (panner) => this._scheduleDropArpeggio(panner),
      (panner) => this._scheduleChime(panner),
    ];

    activeIndices.forEach((idx) => {
      const panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
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
      tremoloGain.connect(this.ctx.destination);

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

  // 0: 목재 펄스 — 저음(300/440Hz) 두 배음이 살짝 어긋난 통통거리는 타격음, 1.2초 간격
  _playWoodOnce(dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
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

  // 1: 물방울 아르페지오 — 상향하는 짧은 음 3개(900/1300/1900Hz), 1.8초 간격
  _playDropArpeggioOnce(dest) {
    if (!this.ctx) return;
    const notes = [900, 1300, 1900];
    const t0 = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t); osc.stop(t + 0.16);
    });
  }

  _scheduleDropArpeggio(panner) {
    const playOnce = () => this._playDropArpeggioOnce(panner);
    playOnce();
    this.timers.push(setInterval(playOnce, 1800));
  }

  // 2: 금속 차임 — 원래 순수 사인파 배음 여러 개를 겹쳐서 만들었는데, "날카롭고
  // 귀가 찢어질 것 같다"는 피드백이 반복됨. 순수음(pure tone)은 주파수가
  // 한 점에 집중돼 있어서 사람 귀에 유독 날카롭고 피로하게 들린다 — 특히
  // 2~5kHz대(사람 귀가 가장 민감한 대역이라 통증에도 가장 민감함)에서는
  // 게인을 아무리 낮춰도 잘 안 풀리는 문제였다. 그래서 순수음 대신 대역통과
  // 필터를 씌운 노이즈(필터링된 화이트노이즈)로 바꿈 — 에너지가 한 주파수에
  // 몰리지 않고 넓게 퍼져 있어서, 풍경(wind chime)이 "쟁그랑"보다 "샤르르"에
  // 가깝게 들리는 것과 같은 원리로 훨씬 부드럽게 들린다. 고음역대라는 특징
  // (귓바퀴 스펙트럼 왜곡으로 방향 판단에 유리)은 그대로 유지.
  _getChimeNoiseBuffer() {
    if (this._chimeNoiseBuffer && this._chimeNoiseBufferCtx === this.ctx) {
      return this._chimeNoiseBuffer;
    }
    const dur = 2; // 초
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this._chimeNoiseBuffer = buffer;
    this._chimeNoiseBufferCtx = this.ctx;
    return buffer;
  }

  _playChimeOnce(dest) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buffer = this._getChimeNoiseBuffer();
    const bands = [[3400, 0.16], [4800, 0.1]]; // [중심주파수, 최대게인]
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

  _scheduleChime(panner) {
    const playOnce = () => this._playChimeOnce(panner);
    playOnce();
    this.timers.push(setInterval(playOnce, 2500));
  }

  // 안내 단계에서 "소리 미리 듣기" 버튼이 쓰는 진입점 — 공간감(패닝) 없이
  // 리스너 바로 앞에서 한 번만 재생해서, 세 음색을 구분하는 연습만 하게 한다.
  // idx: 0=목재펄스, 1=물방울아르페지오, 2=금속차임
  previewOnce(idx) {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    const fns = [
      () => this._playWoodOnce(this.ctx.destination),
      () => this._playDropArpeggioOnce(this.ctx.destination),
      () => this._playChimeOnce(this.ctx.destination),
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
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
