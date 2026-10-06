/* =========================================================
 *  중2 닮음 & 피타고라스 학습 앱
 *  - 세션(SessionStorage) 기반: 새로고침/종료 시 학습 기록 초기화
 * ========================================================= */
(function () {
  "use strict";

  const SESSION_KEY = "pyth_sim_session";
  const ALL_QUESTIONS = UNITS.flatMap((u) => u.questions.map((q) => ({ ...q, unitId: u.id })));  // 점수 산정 대상
  const ALL_CHECKS = UNITS.flatMap((u) => u.checks.map((q) => ({ ...q, unitId: u.id })));        // 개념 확인 (점수 미포함)
  const QUESTION_INDEX = new Map([...ALL_QUESTIONS, ...ALL_CHECKS].map((q) => [q.id, q]));
  const ACORNS_PER_STAMP = 10;
  const $ = (sel, root = document) => root.querySelector(sel);

  // 새로고침 또는 브라우저 재실행 시 항상 새 세션으로 시작 (이전 기록 즉시 초기화)
  sessionStorage.removeItem(SESSION_KEY);

  let state = null;            // 현재 세션 상태
  let view = { name: "home" }; // 현재 화면

  /* ---------------- 세션 ---------------- */
  function saveState() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  }

  function startSession() {
    state = {
      answers: {},   // { [questionId]: { given, correct } }
      selected: {},  // 객관식 임시 선택
      acorns: 0,       // 현재 보유 도토리 (10개가 되면 칭찬도장으로 변환)
      stamps: 0,       // 칭찬도장 개수
      acornsEarned: 0, // 누적 획득 도토리
      seen: {},        // 개념 카드 열람 단원
      flipped: {},     // 뒤집어 본 플래시카드
      labsDone: {}     // 실험실 미션 완료 단원
    };
    saveState();
  }

  /* ---------------- 유틸 ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderMath(root) {
    if (window.renderMathInElement) {
      window.renderMathInElement(root, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    }
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------------- 보상: 도토리 & 칭찬도장 ---------------- */
  function updateRewardBar(animate) {
    $("#acorn-count").textContent = state.acorns;
    $("#stamp-count").textContent = state.stamps;
    $("#acorn-bar-fill").style.width = `${(state.acorns / ACORNS_PER_STAMP) * 100}%`;
    if (animate) {
      const box = $(animate === "stamp" ? "#stamp-box" : "#acorn-box");
      box.classList.remove("pop");
      void box.offsetWidth; // 애니메이션 재시작
      box.classList.add("pop");
    }
  }

  // 정답 시 도토리 1개 지급, 10개가 모이면 칭찬도장 1개로 자동 변환
  function awardAcorn(fromEl) {
    state.acorns++;
    state.acornsEarned++;
    let converted = false;
    if (state.acorns >= ACORNS_PER_STAMP) {
      state.acorns -= ACORNS_PER_STAMP;
      state.stamps++;
      converted = true;
    }
    saveState();
    flyAcorn(fromEl, () => {
      updateRewardBar(converted ? "stamp" : "acorn");
      if (converted) showStampModal(true);
    });
  }

  function flyAcorn(fromEl, done) {
    const target = $("#acorn-box").getBoundingClientRect();
    const src = fromEl ? fromEl.getBoundingClientRect() : target;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !fromEl) return done();
    const a = document.createElement("div");
    a.className = "fly-acorn";
    a.textContent = "🌰";
    a.style.left = `${src.left + 20}px`;
    a.style.top = `${src.top}px`;
    document.body.appendChild(a);
    requestAnimationFrame(() => {
      a.style.transform = `translate(${target.left - src.left - 20}px, ${target.top - src.top}px) scale(.8)`;
      a.style.opacity = "0.3";
    });
    setTimeout(() => { a.remove(); done(); }, 700);
  }

  function openModal(html) {
    $("#modal-body").innerHTML = html;
    $("#modal").hidden = false;
    $("#modal-close").focus();
  }

  function closeModal() {
    $("#modal").hidden = true;
  }

  function stampBoard() {
    return state.stamps
      ? Array.from({ length: state.stamps }, () => `<span class="stamp-icon">참<br/>잘했어요</span>`).join("")
      : `<span class="none">아직 칭찬도장이 없어요. 도토리를 모아 보세요!</span>`;
  }

  function acornSlots() {
    return Array.from({ length: ACORNS_PER_STAMP }, (_, i) =>
      `<span class="${i < state.acorns ? "" : "empty"}">🌰</span>`).join("");
  }

  function showStampModal(isNew) {
    openModal(isNew
      ? `<div class="stamp-big stamped">참<br/>잘했어요</div>
         <h3 id="modal-title">칭찬도장 획득! 🎉</h3>
         <p>도토리 ${ACORNS_PER_STAMP}개가 <b>칭찬도장 1개</b>로 바뀌었어요.</p>
         <div class="stamp-board">${stampBoard()}</div>
         <div class="sum"><span>🏅 칭찬도장 ${state.stamps}개</span><span>🌰 도토리 ${state.acorns}개</span></div>
         <button type="button" class="btn btn-primary btn-block" data-close-modal>계속 공부하기</button>`
      : `<h3 id="modal-title">나의 도토리 & 칭찬도장</h3>
         <p>문제를 1개 맞힐 때마다 도토리 1개! 도토리 ${ACORNS_PER_STAMP}개 → 칭찬도장 1개</p>
         <div class="acorn-slots">${acornSlots()}</div>
         <p style="font-size:14px">다음 칭찬도장까지 도토리 <b>${ACORNS_PER_STAMP - state.acorns}개</b> 남았어요.</p>
         <div class="stamp-board">${stampBoard()}</div>
         <div class="sum"><span>🏅 칭찬도장 ${state.stamps}개</span><span>🌰 누적 도토리 ${state.acornsEarned}개</span></div>
         <button type="button" class="btn btn-block" data-close-modal>닫기</button>`);
  }

  /* ---------------- 채점 ---------------- */
  function parseNumber(s) {
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const f = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (f && parseFloat(f[2]) !== 0) return parseFloat(f[1]) / parseFloat(f[2]);
    return null;
  }

  function normalizeAnswer(s) {
    return String(s)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[∶：]/g, ":")
      .replace(/(cm\^?[23]?|cm²|cm³|㎠|㎤|㎝|°|도|배)$/g, "");
  }

  function isShortCorrect(given, accepted) {
    const g = normalizeAnswer(given);
    if (!g) return false;
    return accepted.some((a) => {
      const e = normalizeAnswer(a);
      if (g === e) return true;
      // 비 (a:b) — 동치인 비도 정답 처리
      if (e.includes(":") && g.includes(":")) {
        const [ea, eb] = e.split(":").map(parseNumber);
        const [ga, gb] = g.split(":").map(parseNumber);
        return [ea, eb, ga, gb].every((n) => n !== null && n !== undefined) && Math.abs(ea * gb - eb * ga) < 1e-9;
      }
      const gn = parseNumber(g), en = parseNumber(e);
      return gn !== null && en !== null && Math.abs(gn - en) < 1e-9;
    });
  }

  function unitStats(unit) {
    const total = unit.questions.length;
    let answered = 0, correct = 0;
    unit.questions.forEach((q) => {
      const a = state.answers[q.id];
      if (a) { answered++; if (a.correct) correct++; }
    });
    return { total, answered, correct, score: Math.round((correct / total) * 100) };
  }

  function overallStats() {
    const total = ALL_QUESTIONS.length;
    let answered = 0, correct = 0;
    ALL_QUESTIONS.forEach((q) => {
      const a = state.answers[q.id];
      if (a) { answered++; if (a.correct) correct++; }
    });
    return { total, answered, correct, score: Math.round((correct / total) * 100) };
  }

  function oxStats() {
    return {
      total: ALL_CHECKS.length,
      correct: ALL_CHECKS.filter((q) => state.answers[q.id] && state.answers[q.id].correct).length
    };
  }

  function labCount() {
    return UNITS.filter((u) => state.labsDone[u.id]).length;
  }

  /* ---------------- 화면 전환 ---------------- */
  function showApp() {
    updateRewardBar();
    navigate({ name: "home" });
  }

  function navigate(next) {
    view = next;
    document.querySelectorAll(".topnav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.nav === view.name);
    });
    if (view.name === "unit" && (view.tab || "concept") === "concept") {
      state.seen[view.unitId] = true;
      saveState();
    }
    paint();
    window.scrollTo({ top: 0 });
  }

  // 현재 화면 다시 그리기 (스크롤 유지)
  function paint() {
    const main = $("#main");
    if (view.name === "home") main.innerHTML = renderHome();
    else if (view.name === "unit") main.innerHTML = renderUnit(view.unitId, view.tab || "concept");
    else if (view.name === "report") main.innerHTML = renderReport();
    renderMath(main);
    if (view.name === "unit" && view.tab === "lab") mountLab(UNITS.find((x) => x.id === view.unitId));
  }

  /* ---------------- 대시보드 ---------------- */
  function renderHome() {
    const o = overallStats();
    const cards = UNITS.map((u) => {
      const s = unitStats(u);
      const pct = Math.round((s.answered / s.total) * 100);
      const ox = u.checks.filter((q) => state.answers[q.id]).length;
      const fl = u.flipcards.filter((c) => state.flipped[c.id]).length;
      return `
        <article class="panel unit-card" style="--uc:${u.color}">
          <div class="num">UNIT ${u.no}</div>
          <h3>${esc(u.title)}</h3>
          <p class="desc">${u.desc}</p>
          <div class="activity-row">
            <span class="${fl === u.flipcards.length ? "on" : ""}">🃏 ${fl}/${u.flipcards.length}</span>
            <span class="${ox === u.checks.length ? "on" : ""}">⭕ ${ox}/${u.checks.length}</span>
            <span class="${state.labsDone[u.id] ? "on" : ""}">🧪 ${state.labsDone[u.id] ? "미션 완료" : "미션 전"}</span>
          </div>
          <div class="progress" aria-label="문제 진행률 ${pct}%"><span style="width:${pct}%"></span></div>
          <div class="unit-meta"><span>문제 ${s.answered}/${s.total}</span><span>정답 ${s.correct}개</span></div>
          <div class="unit-actions">
            <button class="btn" data-open="${u.id}" data-tab="concept" type="button">▶ 개념 학습</button>
            <button class="btn" data-open="${u.id}" data-tab="lab" type="button">🧪 실험실</button>
            <button class="btn btn-primary" data-open="${u.id}" data-tab="quiz" type="button">✏️ 문제</button>
          </div>
        </article>`;
    }).join("");

    return `
      <div class="page-head">
        <div>
          <h2>학습 대시보드</h2>
          <p>개념 카드 → 카드 뒤집기 → OX 퀴즈 → 수학 실험실 → 문제 풀이 순서로 공부해 보세요.</p>
        </div>
        <button class="btn btn-primary" data-nav="report" type="button">📊 최종 리포트 보기</button>
      </div>
      <div class="stats">
        <div class="panel stat"><div class="label">전체 문제</div><div class="value">${o.total}<small> 문항</small></div></div>
        <div class="panel stat"><div class="label">풀이한 문제</div><div class="value">${o.answered}<small> 문항</small></div></div>
        <div class="panel stat"><div class="label">맞힌 문제</div><div class="value">${o.correct}<small> 문항</small></div></div>
        <div class="panel stat"><div class="label">현재 점수</div><div class="value">${o.score}<small> 점</small></div></div>
      </div>
      <h3 class="section-title">단원 선택</h3>
      <div class="unit-grid">${cards}</div>`;
  }

  /* ---------------- 단원 화면 (5단계 활동) ---------------- */
  const STEPS = [
    { key: "concept", label: "📘 개념 카드" },
    { key: "flip", label: "🃏 카드 뒤집기" },
    { key: "ox", label: "⭕ OX 퀴즈" },
    { key: "lab", label: "🧪 수학 실험실" },
    { key: "quiz", label: "✏️ 문제 풀이" }
  ];

  function stepDone(u, key) {
    if (key === "concept") return !!state.seen[u.id];
    if (key === "flip") return u.flipcards.every((c) => state.flipped[c.id]);
    if (key === "ox") return u.checks.every((q) => state.answers[q.id]);
    if (key === "lab") return !!state.labsDone[u.id];
    return u.questions.every((q) => state.answers[q.id]);
  }

  function markStep(key) {
    const el = document.querySelector(`.stepper [data-step="${key}"]`);
    if (el) el.classList.add("done");
  }

  function renderUnit(unitId, tab) {
    const u = UNITS.find((x) => x.id === unitId);
    const s = unitStats(u);
    const body = { concept: renderConcepts, flip: renderFlip, ox: renderOX, lab: renderLab, quiz: renderQuiz }[tab](u);
    return `
      <div style="--uc:${u.color}">
        <div class="crumb"><button data-nav="home" type="button">대시보드</button> › UNIT ${u.no}</div>
        <div class="page-head">
          <div>
            <h2>${u.no}. ${esc(u.title)}</h2>
            <p>${u.desc}</p>
          </div>
          <div class="unit-meta" style="gap:14px"><span>문제 ${s.answered}/${s.total}</span><span>정답 ${s.correct}개</span></div>
        </div>
        <div class="stepper" role="tablist">
          ${STEPS.map((st, i) => `
            <button type="button" role="tab" data-tab-switch="${st.key}" data-step="${st.key}"
              class="step ${tab === st.key ? "active" : ""} ${stepDone(u, st.key) ? "done" : ""}">
              <span class="step-no">${i + 1}</span><span class="step-label">${st.label}</span>
            </button>`).join("")}
        </div>
        <div id="tab-body">${body}</div>
        ${renderUnitNav(u, tab)}
      </div>`;
  }

  function renderUnitNav(u, tab) {
    const idx = UNITS.indexOf(u), si = STEPS.findIndex((s) => s.key === tab);
    const prevU = UNITS[idx - 1], nextU = UNITS[idx + 1];
    const right = si < STEPS.length - 1
      ? `<button class="btn btn-primary" data-tab-switch="${STEPS[si + 1].key}" type="button">다음: ${STEPS[si + 1].label} →</button>`
      : nextU
        ? `<button class="btn btn-primary" data-open="${nextU.id}" data-tab="concept" type="button">다음 단원: ${esc(nextU.title)} →</button>`
        : `<button class="btn btn-primary" data-nav="report" type="button">최종 리포트 보기 →</button>`;
    const left = si > 0
      ? `<button class="btn" data-tab-switch="${STEPS[si - 1].key}" type="button">← ${STEPS[si - 1].label}</button>`
      : prevU
        ? `<button class="btn" data-open="${prevU.id}" data-tab="quiz" type="button">← 이전 단원</button>`
        : `<span></span>`;
    return `<div class="unit-nav">${left}${right}</div>`;
  }

  function renderConcepts(u) {
    return `<div class="concept-grid">${u.concepts.map((c) => `
      <section class="panel concept ${c.wide ? "wide" : ""}">
        <h4>${c.title}</h4>
        ${c.fig
          ? `<div class="concept-body"><div class="txt">${c.html}</div><div class="fig">${c.fig}</div></div>`
          : c.html}
        ${c.miniQuiz ? renderMiniQuiz(c.miniQuiz) : ""}
      </section>`).join("")}</div>
      <div class="next-hint">개념을 다 읽었나요? 이제 <b>🃏 카드 뒤집기</b>로 핵심을 기억해 보고, <b>⭕ OX 퀴즈</b>와 <b>🧪 실험실 미션</b>으로 도토리를 모아 보세요!</div>`;
  }

  /* --- 개념 카드 속 빈칸 채우기 미니 퀴즈 --- */
  const MINI_ITEMS = new Map(UNITS.flatMap((u) => u.concepts.filter((c) => c.miniQuiz)
    .flatMap((c) => c.miniQuiz.items.map((it) => [it.id, it]))));

  function renderMiniQuiz(mq) {
    const solved = mq.items.filter((it) => state.answers[it.id] && state.answers[it.id].correct).length;
    return `
      <div class="mini-quiz">
        <div class="mq-head"><b>${mq.title}</b><span class="chip">맞히면 🌰 +1 · <span class="mq-count">${solved}</span>/${mq.items.length}</span></div>
        <div class="mq-grid">${mq.items.map(renderMiniItem).join("")}</div>
      </div>`;
  }

  function renderMiniItem(it) {
    const a = state.answers[it.id];
    const nums = it.nums.map((n) => {
      if (n !== null) return `<span class="mq-num">${n}</span>`;
      if (!a) return `<input class="mq-input" data-mq-input="${it.id}" inputmode="numeric" maxlength="3" aria-label="빈칸" />`;
      return a.correct
        ? `<span class="mq-num mq-ok">${it.answer}</span>`
        : `<span class="mq-num mq-bad"><s>${esc(a.given)}</s> ${it.answer}</span>`;
    }).join(`<span class="mq-dot">·</span>`);
    const foot = a
      ? `<div class="mq-fb ${a.correct ? "ok" : "bad"}">${a.correct ? `⭕ 정답! <span class="earn">🌰 +1</span>` : "❌ 아쉬워요!"}<br/><small>${it.hint}</small></div>`
      : `<button type="button" class="btn mq-btn" data-mq="${it.id}">확인</button>`;
    return `<div class="mq-item ${a ? (a.correct ? "ok" : "bad") : ""}" id="mq-${it.id}"><div class="mq-nums">${nums}</div>${foot}</div>`;
  }

  function checkMini(id) {
    if (state.answers[id]) return;
    const it = MINI_ITEMS.get(id);
    const inp = document.querySelector(`[data-mq-input="${id}"]`);
    const given = inp.value.trim();
    if (!given) { toast("빈칸에 들어갈 수를 입력해 주세요."); inp.focus(); return; }
    const correct = Number(given) === it.answer;
    state.answers[id] = { given, correct };
    saveState();
    const box = document.getElementById(`mq-${id}`);
    box.outerHTML = renderMiniItem(it);
    const fresh = document.getElementById(`mq-${id}`);
    const quiz = fresh.closest(".mini-quiz");
    quiz.querySelector(".mq-count").textContent =
      [...quiz.querySelectorAll(".mq-item")].filter((el) => el.classList.contains("ok")).length;
    if (correct) awardAcorn(fresh.querySelector(".earn"));
  }

  /* --- 카드 뒤집기 --- */
  function renderFlip(u) {
    const seen = u.flipcards.filter((c) => state.flipped[c.id]).length;
    return `
      <div class="activity-head">
        <p>앞면의 질문을 보고 <b>답을 먼저 떠올린 뒤</b> 카드를 눌러 뒤집어 보세요. 기억에 훨씬 오래 남아요!</p>
        <span class="chip" id="flip-count">확인한 카드 ${seen}/${u.flipcards.length}</span>
      </div>
      <div class="flip-grid ${u.flipcards.some((c) => c.fig) ? "has-fig" : ""}">${u.flipcards.map((c, i) => `
        <button type="button" class="flip-card" data-flip="${c.id}" aria-label="카드 ${i + 1} 뒤집기">
          <span class="flip-inner">
            <span class="flip-face flip-front ${c.fig ? "" : "no-fig"}">
              <span class="flip-no">Q${i + 1}</span>
              ${c.fig ? `<span class="flip-fig">${c.fig}</span>` : ""}
              <span class="flip-text">${c.front}</span>
              <span class="flip-hint">눌러서 뒤집기 ↻</span>
            </span>
            <span class="flip-face flip-back ${c.backFig ? "" : "no-fig"}">
              <span class="flip-no">A${i + 1}</span>
              ${c.backFig ? `<span class="flip-fig">${c.backFig}</span>` : ""}
              <span class="flip-text">${c.back}</span>
            </span>
          </span>
        </button>`).join("")}
      </div>
      <div class="activity-tools">
        <button class="btn" type="button" data-flip-all>모두 뒤집기</button>
        <button class="btn" type="button" data-flip-reset>모두 앞면으로</button>
      </div>`;
  }

  function flipCard(card, toBack) {
    card.classList.toggle("flipped", toBack);
    if (!card.classList.contains("flipped")) return;
    state.flipped[card.dataset.flip] = true;
    saveState();
    const u = UNITS.find((x) => x.id === view.unitId);
    const seen = u.flipcards.filter((c) => state.flipped[c.id]).length;
    $("#flip-count").textContent = `확인한 카드 ${seen}/${u.flipcards.length}`;
    if (seen === u.flipcards.length) markStep("flip");
  }

  /* --- OX 퀴즈 --- */
  function renderOX(u) {
    const qs = u.checks;
    let cur = view.ox;
    if (cur === undefined) {
      cur = qs.findIndex((q) => !state.answers[q.id]);
      if (cur < 0) cur = qs.length;
    }
    const dots = qs.map((q, i) => {
      const a = state.answers[q.id];
      return `<button type="button" class="ox-dot ${a ? (a.correct ? "ok" : "bad") : ""} ${i === cur ? "cur" : ""}" data-ox-go="${i}" aria-label="${i + 1}번 문제">${i + 1}</button>`;
    }).join("");

    if (cur >= qs.length) {
      const correct = qs.filter((q) => state.answers[q.id] && state.answers[q.id].correct).length;
      return `
        <div class="panel ox-card">
          <div class="ox-progress">${dots}</div>
          <div class="ox-summary">
            <div class="ox-big">${correct === qs.length ? "🏆" : "🎯"}</div>
            <h3>OX 퀴즈 완료!</h3>
            <p>${qs.length}문제 중 <b>${correct}문제</b> 정답 · 🌰 도토리 +${correct}</p>
          </div>
          <ul class="ox-review">${qs.map((q) => {
            const a = state.answers[q.id];
            return `<li class="${a.correct ? "ok" : "bad"}">
              <div><span class="ox-tag">${"OX"[q.answer]}</span> ${q.q} ${a.correct ? "⭕" : "❌"}</div>
              <div class="ox-exp">${q.explain}</div></li>`;
          }).join("")}</ul>
        </div>`;
    }

    const q = qs[cur], a = state.answers[q.id];
    const btn = (v, label) => {
      let cls = "";
      if (a) cls = v === q.answer ? "right" : v === a.given ? "wrong" : "dim";
      return `<button type="button" class="ox-btn ${label === "O" ? "o" : "x"} ${cls}" data-ox="${v}" data-q="${q.id}" ${a ? "disabled" : ""}>${label}</button>`;
    };
    const fb = a ? `
      <div class="feedback ${a.correct ? "ok" : "bad"}">
        <div class="verdict">${a.correct ? "⭕ 정답입니다!" : "❌ 아쉬워요!"} 정답은 <b>${"OX"[q.answer]}</b></div>
        ${a.correct ? `<div class="earn">🌰 도토리 +1 획득!</div>` : ""}
        <div class="explain"><b>해설</b><br/>${q.explain}
          ${q.explainFig ? `<div class="ox-fig ox-explain-fig">${q.explainFig}</div>` : ""}</div>
      </div>
      <div class="ox-next"><button type="button" class="btn btn-primary" data-ox-go="${cur + 1}">${cur + 1 < qs.length ? "다음 문제 →" : "결과 보기 →"}</button></div>` : "";
    return `
      <div class="panel ox-card">
        <div class="ox-progress">${dots}</div>
        <div class="ox-q"><span class="ox-qno">Q${cur + 1}.</span> ${q.q}</div>
        ${q.fig ? `<div class="ox-fig">${q.fig}</div>` : ""}
        <div class="ox-buttons">${btn(0, "O")}${btn(1, "X")}</div>
        ${fb}
      </div>`;
  }

  function answerOX(qid, choice) {
    if (state.answers[qid]) return;
    const u = UNITS.find((x) => x.id === view.unitId);
    const q = u.checks.find((x) => x.id === qid);
    const correct = choice === q.answer;
    state.answers[qid] = { given: choice, correct };
    saveState();
    view.ox = u.checks.indexOf(q);
    paint();
    if (correct) awardAcorn($(".ox-card .earn"));
  }

  /* --- 수학 실험실 --- */
  function renderLab(u) {
    const lab = LABS[u.id], done = !!state.labsDone[u.id];
    return `
      <section class="panel lab">
        <div class="lab-head">
          <h3>🧪 ${lab.title}</h3>
          <p>${lab.intro}</p>
        </div>
        <div class="mission ${done ? "done" : ""}" id="mission">
          <span class="mission-tag">🎯 미션</span>
          <span class="mission-text">${lab.mission}</span>
          <span class="mission-status" id="mission-status">${done ? "✅ 완료!" : "성공하면 🌰 +1"}</span>
        </div>
        <div id="lab-root">${lab.html()}</div>
        <div class="lab-result" id="lab-result" ${done ? "" : "hidden"}>✅ 이미 완료한 미션이에요. 자유롭게 더 실험해 보세요!</div>
      </section>`;
  }

  function mountLab(u) {
    LABS[u.id].mount($("#lab-root"), {
      done: !!state.labsDone[u.id],
      complete: (msg) => completeLab(u, msg)
    });
  }

  function completeLab(u, msg) {
    if (state.labsDone[u.id]) return;
    state.labsDone[u.id] = true;
    saveState();
    $("#mission").classList.add("done");
    $("#mission-status").textContent = "✅ 미션 완료!";
    const r = $("#lab-result");
    r.hidden = false;
    r.innerHTML = `🎉 <b>미션 성공!</b> ${esc(msg)} <span class="earn">🌰 도토리 +1</span>`;
    markStep("lab");
    awardAcorn(r.querySelector(".earn"));
  }

  /* --- 문제 풀이 --- */
  function renderQuiz(u) {
    const s = unitStats(u);
    return `
      <div class="q-toolbar">
        <div class="unit-meta" style="gap:14px"><span>풀이 ${s.answered}/${s.total}</span><span>정답 ${s.correct}</span><span>단원 점수 ${s.score}점</span></div>
        <button class="btn" data-tab-switch="concept" type="button">📘 개념 다시 보기</button>
      </div>
      <div class="q-list">${u.questions.map((q, i) => renderQuestion(q, i)).join("")}</div>`;
  }

  function renderQuestion(q, i) {
    const ans = state.answers[q.id];
    const done = !!ans;
    const isCheck = q.kind === "check";
    const typeLabel = isCheck ? "O / X" : q.type === "mc" ? "객관식" : "단답형";
    let input = "";

    if (q.type === "mc") {
      const sel = done ? ans.given : state.selected[q.id];
      input = `<div class="choices">${q.choices.map((c, ci) => {
        let cls = "";
        if (done) {
          if (ci === q.answer) cls = "right";
          else if (ci === ans.given) cls = "wrong";
        } else if (ci === sel) cls = "selected";
        const mark = isCheck ? "OX"[ci] : "①②③④⑤⑥"[ci];
        return `<button type="button" class="choice ${cls}" data-choice="${ci}" data-q="${q.id}" ${done ? "disabled" : ""}>
                  <span class="mark">${mark}</span><span>${c}</span></button>`;
      }).join("")}</div>`;
    } else {
      input = `<div class="short-row">
          <input type="text" inputmode="decimal" data-short="${q.id}" placeholder="정답 입력" value="${done ? esc(ans.given) : ""}" ${done ? "disabled" : ""} />
          ${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}
        </div>
        ${done ? "" : `<div class="short-hint">숫자만 입력해도 됩니다. Enter 키로 제출할 수 있어요.</div>`}`;
    }

    const actions = done ? "" : `<div class="q-actions"><button type="button" class="btn btn-primary" data-submit="${q.id}">제출하기</button></div>`;

    let feedback = "";
    if (done) {
      const right = isCheck ? q.choices[q.answer]
        : q.type === "mc" ? `${"①②③④⑤⑥"[q.answer]} ${q.choices[q.answer]}` : `${q.answer[0]}${q.unit ? " " + esc(q.unit) : ""}`;
      feedback = `
        <div class="feedback ${ans.correct ? "ok" : "bad"}">
          <div class="verdict">${ans.correct ? "⭕ 정답입니다!" : "❌ 오답입니다."}</div>
          ${ans.correct ? `<div class="earn">🌰 도토리 +1 획득!</div>` : ""}
          <div class="answer">정답: ${right}</div>
          <div class="explain"><b>해설</b><br/>${q.explain}</div>
        </div>`;
    }

    return `
      <article class="panel q" id="q-${q.id}">
        <div class="q-head">
          <span class="q-no">${isCheck ? "개념 확인" : "문제"} ${i + 1}</span>
          <span class="chip lv-${q.level}">${q.level}</span>
          <span class="chip">${typeLabel}</span>
        </div>
        <p class="q-text">${q.q}</p>
        ${q.fig ? `<div class="fig">${q.fig}</div>` : ""}
        ${input}
        ${actions}
        ${feedback}
      </article>`;
  }

  function rerenderQuestion(qid) {
    const q = QUESTION_INDEX.get(qid);
    const u = UNITS.find((x) => x.id === q.unitId);
    const idx = (q.kind === "check" ? u.checks : u.questions).findIndex((x) => x.id === qid);
    const old = document.getElementById(`q-${qid}`);
    const wrap = document.createElement("div");
    wrap.innerHTML = renderQuestion(q, idx);
    const fresh = wrap.firstElementChild;
    old.replaceWith(fresh);
    renderMath(fresh);
    // 상단 진행 정보 갱신
    const s = unitStats(u);
    document.querySelectorAll(".q-toolbar .unit-meta, .page-head .unit-meta").forEach((el) => {
      el.innerHTML = el.closest(".q-toolbar")
        ? `<span>풀이 ${s.answered}/${s.total}</span><span>정답 ${s.correct}</span><span>단원 점수 ${s.score}점</span>`
        : `<span>진행 ${s.answered}/${s.total}</span><span>정답 ${s.correct}개</span>`;
    });
    return fresh;
  }

  function submitAnswer(qid) {
    if (state.answers[qid]) return;
    const q = QUESTION_INDEX.get(qid);
    let given, correct;
    if (q.type === "mc") {
      given = state.selected[qid];
      if (given === undefined) { toast("보기를 먼저 선택해 주세요."); return; }
      correct = given === q.answer;
    } else {
      const inp = document.querySelector(`[data-short="${qid}"]`);
      given = inp.value.trim();
      if (!given) { toast("정답을 입력해 주세요."); inp.focus(); return; }
      correct = isShortCorrect(given, q.answer);
    }
    state.answers[qid] = { given, correct };
    delete state.selected[qid];
    saveState();
    const el = rerenderQuestion(qid);
    el.querySelector(".feedback").scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (correct) awardAcorn(el.querySelector(".earn"));
  }

  /* ---------------- 최종 리포트 ---------------- */
  function renderReport() {
    const o = overallStats();
    const R = 60, C = 2 * Math.PI * R;
    const rows = UNITS.map((u) => {
      const s = unitStats(u);
      return `<tr>
        <td><b>${u.no}.</b> ${esc(u.title)}</td>
        <td>${s.answered}/${s.total}</td>
        <td>${s.correct}</td>
        <td><b>${s.score}</b>점</td>
        <td class="bar-cell"><div class="mini-bar"><span style="width:${s.score}%;background:${u.color}"></span></div></td>
      </tr>`;
    }).join("");

    return `
      <div class="crumb"><button data-nav="home" type="button">대시보드</button> › 최종 리포트</div>
      <div class="page-head">
        <div><h2>최종 학습 리포트</h2></div>
      </div>
      <div class="panel">
        <div class="score-ring">
          <div class="ring">
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="${R}" fill="none" stroke="#e8edf5" stroke-width="14"/>
              <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--primary)" stroke-width="14"
                stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - o.score / 100)}" />
            </svg>
            <div class="center"><div><b>${o.score}</b><span>/ 100점</span></div></div>
          </div>
          <div class="stats" style="grid-template-columns:repeat(3,1fr);margin:0;flex:1">
            <div class="stat" style="padding:0"><div class="label">풀이한 문제</div><div class="value">${o.answered}<small>/${o.total}</small></div></div>
            <div class="stat" style="padding:0"><div class="label">맞힌 개수</div><div class="value" style="color:var(--ok)">${o.correct}</div></div>
            <div class="stat" style="padding:0"><div class="label">틀린 개수</div><div class="value" style="color:var(--bad)">${o.answered - o.correct}</div></div>
          </div>
        </div>
        <div class="report-table">
          <table class="grid">
            <tr><th>단원</th><th>풀이</th><th>정답</th><th>점수</th><th>성취도</th></tr>
            ${rows}
          </table>
        </div>
      </div>`;
  }

  /* ---------------- 이벤트 ---------------- */
  document.addEventListener("click", (e) => {
    if (e.target.id === "modal") return closeModal(); // 배경 클릭
    const t = e.target.closest("button");
    if (!t || !state) return;

    if (t.id === "modal-close" || t.hasAttribute("data-close-modal")) return closeModal();
    if (t.id === "reward-btn") return showStampModal(false);

    if (t.dataset.nav) return navigate({ name: t.dataset.nav });
    if (t.dataset.open) return navigate({ name: "unit", unitId: t.dataset.open, tab: t.dataset.tab });
    if (t.dataset.tabSwitch && view.name === "unit") return navigate({ name: "unit", unitId: view.unitId, tab: t.dataset.tabSwitch });

    // 개념 카드 미니 퀴즈
    if (t.dataset.mq) return checkMini(t.dataset.mq);

    // 카드 뒤집기
    if (t.dataset.flip) return flipCard(t, !t.classList.contains("flipped"));
    if (t.hasAttribute("data-flip-all")) return document.querySelectorAll(".flip-card").forEach((c) => flipCard(c, true));
    if (t.hasAttribute("data-flip-reset")) return document.querySelectorAll(".flip-card").forEach((c) => c.classList.remove("flipped"));

    // OX 퀴즈
    if (t.dataset.ox !== undefined && t.dataset.q) return answerOX(t.dataset.q, Number(t.dataset.ox));
    if (t.dataset.oxGo !== undefined) { view.ox = Number(t.dataset.oxGo); paint(); return; }

    if (t.dataset.choice !== undefined && t.dataset.q) {
      const qid = t.dataset.q;
      state.selected[qid] = Number(t.dataset.choice);
      saveState();
      t.parentElement.querySelectorAll(".choice").forEach((b) => b.classList.toggle("selected", b === t));
      return;
    }
    if (t.dataset.submit) return submitAnswer(t.dataset.submit);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal").hidden) return closeModal();
    if (e.key === "Enter" && e.target.matches("[data-mq-input]")) {
      e.preventDefault();
      return checkMini(e.target.dataset.mqInput);
    }
    if (e.key === "Enter" && e.target.matches("[data-short]")) {
      e.preventDefault();
      submitAnswer(e.target.dataset.short);
    }
  });

  // KaTeX가 늦게 로드된 경우 다시 렌더링
  window.addEventListener("load", () => { if (state) renderMath($("#main")); });

  startSession();
  showApp();
})();
