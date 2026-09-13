// R-SOD (Rapid Sense of Direction Scale) 4문항.
// 출처: Jaswal, Burles, & Iaria (2025), Brain Sciences, 15(6), 622.
// SBSOD 15문항 중 이 4개만으로도 신뢰도(Cronbach's alpha = .90)가 유지됨이 검증됨.
// 1(전혀 아니다) ~ 7(매우 그렇다). 4번 문항은 부정문이라 역채점한다.
const RSOD_ITEMS = [
  { text: "나는 남에게 길을 아주 잘 알려주는 편이다.", reverse: false },
  { text: "나의 '방향 감각'은 꽤 좋은 편이다.", reverse: false },
  { text: "나는 한 번 가본 길은 대체로 다시 잘 찾아가는 편이다.", reverse: false },
  { text: "나는 내 주변 환경에 대한 '머릿속 지도'가 별로 없다.", reverse: true },
];

function renderSurvey(containerEl, onChange) {
  containerEl.innerHTML = "";
  const answers = new Array(RSOD_ITEMS.length).fill(null);

  RSOD_ITEMS.forEach((item, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "survey-item";

    const p = document.createElement("p");
    p.textContent = `${idx + 1}. ${item.text}`;
    wrap.appendChild(p);

    const row = document.createElement("div");
    row.className = "scale-row";
    for (let v = 1; v <= 7; v++) {
      const cell = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `rsod-${idx}`;
      input.value = String(v);
      input.addEventListener("change", () => {
        answers[idx] = v;
        onChange(answers.slice());
      });
      cell.appendChild(input);
      cell.appendChild(document.createTextNode(String(v)));
      row.appendChild(cell);
    }
    wrap.appendChild(row);
    containerEl.appendChild(wrap);
  });

  return answers;
}

// raw: [1~7, 1~7, 1~7, 1~7] (문항 순서대로)
// 반환: { raw, total, items } — total은 4~28 범위, 높을수록 방향감각이 좋음
function scoreRSOD(raw) {
  const items = RSOD_ITEMS.map((item, idx) => {
    const value = item.reverse ? 8 - raw[idx] : raw[idx];
    return { text: item.text, raw: raw[idx], reverse: item.reverse, scored: value };
  });
  const total = items.reduce((sum, it) => sum + it.scored, 0);
  return { raw, items, total };
}
