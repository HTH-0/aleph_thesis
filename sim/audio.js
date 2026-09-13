// 고정 청각 랜드마크 3개 (삼각측량용).
// 목적지 방향은 알려주지 않는다 — 그냥 "여기에 이런 소리가 난다"는
// 고정된 기준점 정보만 주고, 참가자가 스스로 위치를 종합 추론해야 한다.
//
// 근거: Jetzschke et al. (2017) — 서로 완전히 같은 소리는 몇 개를 줘도
// 위치 애매함이 안 풀리지만, 서로 다른(unique) 소리 3개는 애매함이 풀린다.
// 그래서 3개 랜드마크를 리듬/음색이 뚜렷하게 다르게 만든다.
//   0: 쇳소리(금속, 짧고 날카로운 클랭 반복)
//   1: 물방울 소리(높은음에서 낮은음으로 떨어지는 짧은 핑, 다른 박자로 반복)
//   2: 낮은 기계음(끊기지 않는 허밍)
class LandmarkAudio {
  constructor() {
    this.ctx = null;
    this.panners = [];   // 활성화된 PannerNode 목록
    this.timers = [];    // clearInterval 대상
    this.humNodes = [];  // 계속 재생 중인 오실레이터(허밍) — stop 시 정지 필요
  }

  // 반드시 사용자 클릭 등 제스처 이후에 호출해야 브라우저 정책에 안 걸린다.
  // landmarkWorldPositions: [{x,y,z}, ...] (인덱스 0/1/2 = 쇳소리/물방울/기계음)
  // activeIndices: 이번 시행에서 켤 랜드마크 인덱스 목록 (0/2/3개)
  init(landmarkWorldPositions, activeIndices) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    const timbreFns = [
      (panner) => this._scheduleMetal(panner),
      (panner) => this._scheduleDrop(panner),
      (panner) => this._startHum(panner),
    ];

    activeIndices.forEach((idx) => {
      const panner = this.ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = CONFIG.LANDMARK_REF_DISTANCE;
      panner.maxDistance = CONFIG.LANDMARK_MAX_DISTANCE;
      panner.rolloffFactor = CONFIG.LANDMARK_ROLLOFF;
      this._setPos(panner, landmarkWorldPositions[idx]);
      panner.connect(this.ctx.destination);
      this.panners.push(panner);
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
  }

  // 0: 쇳소리 — 짧고 날카로운 금속성 클랭, 약 1.4초 간격
  _scheduleMetal(panner) {
    const playOnce = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc1.type = "square";
      osc2.type = "square";
      osc1.frequency.value = 1400;
      osc2.frequency.value = 1900; // 배음 살짝 어긋나게 해서 "쇳소리" 느낌
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(panner);
      osc1.start(t); osc1.stop(t + 0.25);
      osc2.start(t); osc2.stop(t + 0.25);
    };
    playOnce();
    this.timers.push(setInterval(playOnce, 1400));
  }

  // 1: 물방울 — 높은음에서 낮은음으로 빠르게 떨어지는 핑, 약 1.1초 간격(엇박)
  _scheduleDrop(panner) {
    const playOnce = () => {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(350, t + 0.15);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(panner);
      osc.start(t); osc.stop(t + 0.2);
    };
    playOnce();
    this.timers.push(setInterval(playOnce, 1100));
  }

  // 2: 낮은 기계음 — 끊기지 않고 계속 도는 허밍 (진폭이 느리게 출렁임)
  _startHum(panner) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const mainGain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.value = 85;

    lfo.type = "sine";
    lfo.frequency.value = 0.6; // 느린 출렁임
    lfoGain.gain.value = 0.05;
    mainGain.gain.value = 0.12;

    lfo.connect(lfoGain);
    lfoGain.connect(mainGain.gain);
    osc.connect(mainGain);
    mainGain.connect(panner);

    osc.start();
    lfo.start();
    this.humNodes.push(osc, lfo);
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.humNodes.forEach((n) => { try { n.stop(); } catch (e) {} });
    this.humNodes = [];
    this.panners = [];
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
