import { STAGES, AXES, TYPES, PARTS, PAIRS, QUIZ, UI, EVIDENCE, opposite, pairKey } from "./data.js";
import { PAPERS } from "./papers.js";
import { FIGS } from "./figs.js";
import { voteOnce, subscribe, statsEnabled } from "./stats.js";
import { drawCard } from "./card.js";

const app = document.getElementById("app");
let lang = localStorage.getItem("hm_lang") || (navigator.language?.startsWith("ko") ? "ko" : "en");
const picks = {};
let quiz = null;
let paperTab = "foundational";
let roomCounts = null; // live counts from Firebase, filled once a result page is shown
let roomSub = null;

const t = (o) => (o && typeof o === "object" ? o[lang] ?? o.ko : o ?? "");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isType = (s) => /^[EI][SN][TF][JP]$/.test(s) && TYPES[s];

/* ---------- language ---------- */
function setLang(l) {
  lang = l;
  localStorage.setItem("hm_lang", l);
  document.documentElement.lang = l;
  document.querySelectorAll(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
  render(false);
}
document.querySelectorAll(".lang button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));

/* ---------- shared pieces ---------- */
const L2 = (ko, en) => (lang === "ko" ? ko : en);

function railHTML(active) {
  const steps = Object.entries(STAGES)
    .map(([k, v], i) => `<div class="${k === active ? "on" : ""}">0${i + 1} ${esc(v.en.toUpperCase())}${lang === "ko" ? `<small>${esc(v.ko)}</small>` : ""}</div>`)
    .join("");
  return `<div class="rail" aria-label="See, Think, Act, Fix loop">${steps}</div>
    <div class="rail-note">↺ ${L2("고친 뒤 다시 보기", "fix, then look again")}</div>`;
}

const blk = (head, right, body, cls = "") =>
  `<section class="blk ${cls}"><div class="blk-h"><span>${head}</span><span>${right}</span></div><div class="blk-b">${body}</div></section>`;

function paperHTML(p, i) {
  const venueHasYear = /\d{4}/.test(p.venue || "");
  const meta = [p.authors, venueHasYear ? p.venue : [p.venue, p.year].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return `<div class="paper"><span class="n">[${i + 1}]</span><div>
    <div class="t">${esc(p.title)}</div>
    <div class="meta">${esc(meta)}</div>
    <div class="why">${esc(lang === "ko" ? p.why_ko : p.why_en)}</div>
    <div class="links">
      ${p.arxiv ? `<a href="${esc(p.arxiv)}" target="_blank" rel="noopener">arXiv ↗</a>` : ""}
      ${p.project ? `<a href="${esc(p.project)}" target="_blank" rel="noopener">${esc(t(UI.project))} ↗</a>` : ""}
    </div>
  </div></div>`;
}

function papersBlock(type) {
  const set = PAPERS[type];
  if (!set) return `<p class="muted small">${esc(t(UI.papersLoading))}</p>`;
  const list = set[paperTab] || [];
  return `<div class="tabs" role="tablist">
      <button class="tab" role="tab" data-act="tab" data-tab="foundational" aria-selected="${paperTab === "foundational"}">${esc(t(UI.foundational))}</button>
      <button class="tab" role="tab" data-act="tab" data-tab="recent" aria-selected="${paperTab === "recent"}">${esc(t(UI.recent))}</button>
    </div>
    <div>${list.map(paperHTML).join("")}</div>`;
}

function figHTML(type) {
  const f = FIGS[type];
  if (f) {
    const all = [...(PAPERS[type]?.foundational || []), ...(PAPERS[type]?.recent || [])];
    const p = all.find((x) => x.arxiv === f.arxiv) || {};
    return `<figure class="fig">
      <a href="${esc(f.arxiv)}" target="_blank" rel="noopener"><img src="${esc(f.img)}" alt="${esc(p.title || "")} Fig. 1" loading="lazy"></a>
      <figcaption><span class="mono">FIG. 1</span> ${esc(p.title || "")} · ${esc(p.authors || "")} ${esc(String(p.year || ""))} ·
        <a href="${esc(f.licenseUrl)}" target="_blank" rel="noopener">${esc(f.license)}</a></figcaption>
    </figure>`;
  }
  if (type === "ISFP") return slipChartHTML();
  return "";
}

// ISFP: no CC-licensed figure among its papers, so draw an illustrative chart instead.
function slipChartHTML() {
  // illustrative data: grip force (N) over time; tactile sensor detects slip at 1.2 s, controller squeezes harder
  const pts = [];
  for (let t = 0; t <= 3.0001; t += 0.05) {
    let f = t < 0.4 ? 5 * t : 2.0;
    if (t >= 1.2 && t < 1.35) f = 2.0 - 0.6 * Math.sin(((t - 1.2) / 0.15) * Math.PI / 2);
    if (t >= 1.35) f = 1.4 + 1.6 * (1 - Math.exp(-(t - 1.35) / 0.12));
    pts.push([t, f]);
  }
  const W = 320, H = 150, L = 34, R = 10, T = 14, B = 26;
  const x = (t) => L + (t / 3) * (W - L - R), y = (f) => T + (1 - f / 3.5) * (H - T - B);
  const path = pts.map(([t, f], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(f).toFixed(1)}`).join("");
  const grid = [0, 1, 2, 3].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(f)}" y2="${y(f)}" stroke="rgba(185,217,235,.12)"/><text x="${L - 6}" y="${y(f) + 3}" text-anchor="end">${f}</text>`).join("");
  const xt = [0, 1, 2, 3].map((t) => `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${t}s</text>`).join("");
  const ko = lang === "ko";
  return `<figure class="fig">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${ko ? "잡는 힘 그래프: 1.2초에 미끄러짐을 감지하고 힘을 올림" : "Grip force chart: slip detected at 1.2 s, force increased"}" class="chart">
      <rect x="${x(1.2)}" y="${T}" width="${x(1.35) - x(1.2)}" height="${H - T - B}" fill="rgba(232,100,44,.18)"/>
      ${grid}${xt}
      <path d="${path}" fill="none" stroke="#75aadb" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="${x(3)}" cy="${y(pts[pts.length - 1][1])}" r="3.5" fill="#75aadb"/>
      <text x="${x(1.2) + 4}" y="${T + 10}" class="ann">${ko ? "미끄러짐 감지" : "slip detected"}</text>
      <text x="${x(2.0)}" y="${y(3.0) - 6}" class="lbl2">${ko ? "잡는 힘 (N)" : "grip force (N)"}</text>
    </svg>
    <figcaption><span class="mono">VIZ</span> ${ko ? "촉각 센서가 미끄러짐을 느끼면 손이 바로 더 꽉 쥐어요 (예시 데이터)" : "When the tactile sensor feels a slip, the hand squeezes harder (illustrative data)"}</figcaption>
  </figure>`;
}

/* ---------- screens ---------- */
function homeHTML() {
  const ready = AXES.every((a) => picks[a.key]);
  const axes = AXES.map((ax) => {
    const btn = (side) => `<button type="button" class="pick" data-act="pick" data-axis="${ax.key}" data-letter="${side.letter}" aria-pressed="${picks[ax.key] === side.letter}">
        <b>${side.letter}</b><span class="pl">${esc(t(side.label))}</span>
        <span class="desc">${esc(t(side.desc))}</span>
      </button>`;
    return `<div class="axis">${btn(ax.a)}${btn(ax.b)}</div>`;
  }).join("");
  const picked = AXES.map((a) => picks[a.key] || "_").join("");
  return `<div class="fade-in">
    <div class="eyebrow">${esc(t(UI.eyebrow))}</div>
    <h1>${esc(t(UI.title))}</h1>
    ${railHTML(null)}
    <p class="muted small" style="margin-top:12px">${esc(t(UI.loopIntro))}</p>
    ${blk(`01 / ${esc(t(UI.pickTitle))}`, `<span class="mono">${picked}</span>`, `${axes}
      <button class="btn btn-primary" data-act="go" ${ready ? "" : "disabled"}>${esc(t(UI.seeResult))} →</button>
      <button class="btn btn-ghost" data-act="quiz">${esc(t(UI.dontKnow))}</button>`)}
    <p class="disclaimer">${esc(t(UI.disclaimer))}</p>
  </div>`;
}

function quizHTML() {
  const q = QUIZ[quiz.i];
  const pct = (quiz.i / QUIZ.length) * 100;
  return `<div class="fade-in">
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="qnum">Q${quiz.i + 1} / ${QUIZ.length}</div>
    <div class="qtext">${esc(t(q.q))}</div>
    ${q.options.map((o, i) => `<button class="opt" data-act="answer" data-i="${i}"><span class="k">${"AB"[i]}</span><span>${esc(t(o.text))}</span></button>`).join("")}
    <a class="btn btn-ghost" href="#/">${esc(t(UI.back))}</a>
  </div>`;
}

function resultHTML(type) {
  const d = TYPES[type];
  const opp = opposite(type);
  const o = TYPES[opp];
  const axesTxt = type.split("").map((L, i) => {
    const ax = AXES[i];
    const side = ax.a.letter === L ? ax.a : ax.b;
    return `${L} ${esc(t(side.label))}`;
  }).join(" · ");
  const oppSet = PAPERS[opp];
  const oppStarter = oppSet ? [oppSet.foundational?.[0], oppSet.recent?.[0]].filter(Boolean) : [];
  const evidence = EVIDENCE.cite
    ? `<div class="evidence"><div class="lbl">${esc(t(UI.evidenceTitle))}</div>${esc(t(EVIDENCE))}<br>
        <a href="${esc(EVIDENCE.url)}" target="_blank" rel="noopener">${esc(EVIDENCE.cite)} ↗</a></div>`
    : "";
  const grid = Object.keys(TYPES).map((k) => `<a href="#/r/${k}" class="${k === type ? "cur" : ""}">${k}</a>`).join("");
  const parts = d.body.map((p) => esc(t(PARTS[p]))).join(", ");

  return `<div class="fade-in">
    <button class="btn btn-ghost again" data-act="reset" style="margin-top:12px">← ${L2("다른 MBTI 해보기", "Try another MBTI")}</button>
    <div class="vote-note" id="voteNote">${voteNoteText()}</div>
    <section class="blk">
      <div class="blk-h"><span>${L2("결과", "Result")} / ${type}</span><span>agentic-vision.loop</span></div>
      <div class="robot" id="robot" aria-label="${L2("휴머노이드 3D 모델", "3D humanoid model")}"><div class="loading">${L2("3D 모델 불러오는 중…", "loading 3D model…")}</div></div>
      <div class="robot-cap"><span><span class="mono" style="color:var(--gold-bright)">▶</span> ${esc(t(d.act))}</span><span class="hint">${L2("드래그해서 돌리기", "drag to rotate")}</span></div>
      <div class="robot-cap" style="border-top:0;padding-top:0"><span class="muted">${L2("이 분야가 다루는 부위", "Body parts in focus")}: <span class="on">${parts}</span></span></div>
      <div class="credit">Unitree G1 · <a href="https://github.com/google-deepmind/mujoco_menagerie/tree/main/unitree_g1" target="_blank" rel="noopener">model</a> © Unitree Robotics, BSD-3</div>
      <div class="blk-b" style="border-top:1px solid var(--line)">
        <div class="type-big">${type}</div>
        <dl class="kv">
          <dt>FIELD</dt><dd class="field-name">${esc(t(d.field))}</dd>
          <dt>ROLE</dt><dd class="nick">${esc(t(d.nick))}</dd>
          <dt>STRENGTH</dt><dd>${esc(t(d.strength))}</dd>
          <dt>AXES</dt><dd class="mono small">${axesTxt}</dd>
        </dl>
      </div>
    </section>

    ${railHTML(d.stage)}

    ${blk(`02 / ${esc(t(UI.easyTitle))}`, "", `
      <p>${esc(t(d.easy))}</p>
      <div class="lbl">${esc(t(UI.barrierTitle))}</div>
      <p class="muted">${esc(t(d.barrier))}</p>
      <div class="lbl">${esc(t(UI.toolsTitle))}</div>
      <div class="tags">${d.tools.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>`)}

    <section class="blk"><div class="blk-h"><span>03 / ${esc(t(UI.papersTitle))}</span><span>${L2("기초 3 · 최신 3", "3 + 3")}</span></div>
      <div class="blk-b">${figHTML(type)}<div id="papers">${papersBlock(type)}</div></div></section>

    ${blk(`04 / ${esc(t(UI.oppTitle))}`, `${type} ⇄ ${opp}`, `
      <p class="small muted">${esc(t(UI.oppClaim))}</p>
      <div class="vs"><span class="me">${type}</span><span class="arrow">⇄</span><span class="them">${opp}</span></div>
      ${statsEnabled ? `<div class="room" id="roomOpp" data-opp="${opp}">${roomText(opp)}</div>` : ""}
      <div class="oppviz">
        <div class="robot" id="robotOpp" aria-label="${opp} 3D"><div class="loading">${L2("3D 모델 불러오는 중…", "loading 3D model…")}</div></div>
        <div class="robot-cap"><span><span class="mono" style="color:var(--gold-bright)">▶</span> ${esc(t(o.act))}</span><span class="hint">${opp}</span></div>
      </div>
      <div class="field-name">${esc(t(o.field))}</div>
      <div class="nick" style="margin-bottom:6px">${esc(t(o.nick))}</div>
      <p class="opp-strength"><span class="mono">${L2(`${opp}의 강점`, `${opp}'s strength`)}</span> ${esc(t(o.strength))}</p>
      <p>${esc(t(o.easy))}</p>
      <div class="tags">${o.tools.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>
      ${figHTML(opp)}
      <div class="quote"><h3>${esc(t(UI.synergyTitle))}</h3><p class="muted" style="margin:0">${esc(t(PAIRS[pairKey(type, opp)]))}</p></div>
      ${oppStarter.length ? `<div class="lbl">${esc(t(UI.oppPapers))}</div>${oppStarter.map(paperHTML).join("")}` : ""}
      ${evidence}
      <a class="btn btn-ghost" href="#/r/${opp}">${opp} ${L2("결과 전체 보기", "full result")} →</a>`, "opp")}

    <button class="btn btn-gold" data-act="save" data-type="${type}">${esc(t(UI.save))}</button>
    <button class="btn btn-ghost" data-act="reset">← ${L2("다른 MBTI 해보기", "Try another MBTI")}</button>

    ${blk(`05 / ${esc(t(UI.allTypes))}`, "16", `<div class="grid16">${grid}</div>`)}
    <p class="disclaimer">${esc(t(UI.disclaimer))}</p>
  </div>`;
}

/* ---------- people in the room ---------- */
function roomText(opp) {
  if (!roomCounts) return "";
  const n = roomCounts[opp] || 0;
  if (lang === "ko") return n ? `지금 이 방에 <b>${opp}</b>가 <b>${n}명</b> 있어요. 발표 끝나고 찾아가 보세요!` : `아직 이 방에 ${opp}는 없어요. 곧 들어올지도 몰라요.`;
  return n ? `<b>${n}</b> ${opp}${n > 1 ? "s are" : " is"} in this room right now. Go find them after the talk!` : `No ${opp} in the room yet. One may join soon.`;
}
function updateRoom() {
  const el = document.getElementById("roomOpp");
  if (el) el.innerHTML = roomText(el.dataset.opp);
}
function ensureRoomSub() {
  if (roomSub || !statsEnabled) return;
  roomSub = subscribe(({ counts }) => { roomCounts = counts; updateRoom(); });
}

/* ---------- 3D robot ---------- */
let robotCleanups = [];
function cleanupRobots() { robotCleanups.forEach((c) => c()); robotCleanups = []; }
async function mountRobotFor(type) {
  cleanupRobots();
  const jobs = [["robot", type], ["robotOpp", opposite(type)]];
  let mod;
  try { mod = await import("./robot.js"); } catch (e) { console.warn("3D failed", e); return; }
  for (const [id, ty] of jobs) { // one after another, so phones don't load both at once
    const el = document.getElementById(id);
    if (!el) continue;
    try {
      const cleanup = await mod.mountRobot(el, TYPES[ty].body, TYPES[ty].motion);
      if (el.isConnected) { robotCleanups.push(cleanup); el.querySelector(".loading")?.remove(); } else cleanup();
    } catch (e) {
      console.warn("3D model failed", e);
      const l = el.querySelector(".loading");
      if (l) l.textContent = lang === "ko" ? "3D 모델을 불러오지 못했어요" : "Could not load the 3D model";
    }
  }
}

/* ---------- vote state ---------- */
let voteState = null; // "counted" | "already" | "off" | null (browsing via links)
function voteNoteText() {
  if (voteState === "counted") return lang === "ko" ? "✓ 이 결과가 현장 집계에 반영됐어요" : "✓ This result was added to the live stats";
  if (voteState === "already") return lang === "ko" ? "이미 참여했어요 · 이 결과는 둘러보기라 집계되지 않아요" : "You already took part · this one is just browsing";
  return "";
}

/* ---------- router ---------- */
let lastRoute = "";
function render(scroll = true) {
  cleanupRobots();
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "quiz") {
    quiz ??= { i: 0, votes: {} };
    app.innerHTML = quizHTML();
  } else if (h.startsWith("r/") && isType(h.slice(2).toUpperCase())) {
    const type = h.slice(2).toUpperCase();
    app.innerHTML = resultHTML(type);
    ensureRoomSub();
    mountRobotFor(type);
  } else {
    quiz = null;
    if (lastRoute.startsWith("r/")) for (const k of Object.keys(picks)) delete picks[k]; // back from a result: start fresh
    app.innerHTML = homeHTML();
  }
  lastRoute = h;
  if (scroll) window.scrollTo(0, 0);
}
let fromPick = false; // true right after the visitor picked or finished the quiz
window.addEventListener("hashchange", () => {
  paperTab = "foundational";
  if (!fromPick) voteState = null; // links from the grid etc. are browsing
  fromPick = false;
  render();
});

function showResult(type) {
  // only the first pick/quiz on this device counts; links and later tries are browsing
  voteState = null;
  voteOnce(type).then((st) => { voteState = st; const n = document.getElementById("voteNote"); if (n) n.textContent = voteNoteText(); });
  quiz = null;
  fromPick = true;
  location.hash = `#/r/${type}`;
}

/* ---------- events ---------- */
app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "pick") {
    picks[el.dataset.axis] = el.dataset.letter;
    render(false);
  } else if (act === "go") {
    showResult(AXES.map((a) => picks[a.key]).join(""));
  } else if (act === "reset") {
    for (const k of Object.keys(picks)) delete picks[k];
    quiz = null; voteState = null;
    location.hash = "#/";
  } else if (act === "quiz") {
    quiz = { i: 0, votes: {} };
    location.hash = "#/quiz";
  } else if (act === "answer") {
    QUIZ[quiz.i].options[+el.dataset.i].votes.forEach((L) => (quiz.votes[L] = (quiz.votes[L] || 0) + 1));
    quiz.i++;
    if (quiz.i < QUIZ.length) return render(false);
    const v = quiz.votes;
    const type = AXES.map((a) => ((v[a.a.letter] || 0) > (v[a.b.letter] || 0) ? a.a.letter : a.b.letter)).join("");
    showResult(type);
  } else if (act === "tab") {
    paperTab = el.dataset.tab;
    const type = location.hash.split("/").pop().toUpperCase();
    document.getElementById("papers").innerHTML = papersBlock(type);
  } else if (act === "save") {
    saveImage(el.dataset.type);
  }
});

/* ---------- result image ---------- */
async function saveImage(type) {
  const c = await drawCard(type, lang);
  c.toBlob(async (blob) => {
    const file = new File([blob], `humanoid-${type}.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Humanoid × MBTI: ${type}` }); return; }
      catch (err) { if (err.name === "AbortError") return; }
    }
    showImageModal(URL.createObjectURL(blob), type);
  }, "image/png");
}

function showImageModal(url, type) {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<img src="${url}" alt="${type} result card">
    <p>${lang === "ko" ? "이미지를 길게 눌러 저장하세요" : "Long-press the image to save it"}</p>
    <a class="btn btn-primary" style="max-width:320px" href="${url}" download="humanoid-${type}.png">${lang === "ko" ? "다운로드" : "Download"}</a>
    <button class="btn btn-ghost" style="max-width:320px">${lang === "ko" ? "닫기" : "Close"}</button>`;
  m.querySelector("button").onclick = () => { m.remove(); URL.revokeObjectURL(url); };
  document.body.appendChild(m);
}

setLang(lang);
