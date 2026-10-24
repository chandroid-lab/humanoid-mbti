import { STAGES, AXES, TYPES, PAIRS, QUIZ, UI, EVIDENCE, opposite, pairKey } from "./data.js";
import { PAPERS } from "./papers.js";
import { vote } from "./stats.js";
import { drawCard } from "./card.js";

const app = document.getElementById("app");
let lang = localStorage.getItem("hm_lang") || (navigator.language?.startsWith("ko") ? "ko" : "en");
const picks = {};
let quiz = null;
let paperTab = "foundational";

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
function loopHTML(active) {
  const steps = Object.entries(STAGES)
    .map(([k, v]) => `<div class="step ${k === active ? "on" : ""}">${esc(v.en)}<small>${lang === "ko" ? esc(v.ko) : "&nbsp;"}</small></div>`)
    .join("");
  return `<div class="loop" aria-label="See, Think, Act, Fix loop">${steps}</div>
    <div class="loop-back">↺ ${lang === "ko" ? "고친 뒤 다시 보기" : "fix, then look again"}</div>`;
}

function paperHTML(p) {
  const venueHasYear = /\d{4}/.test(p.venue || "");
  const meta = [p.authors, venueHasYear ? p.venue : [p.venue, p.year].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  return `<div class="paper">
    <div class="t">${esc(p.title)}</div>
    <div class="meta">${esc(meta)}</div>
    <div class="why">${esc(lang === "ko" ? p.why_ko : p.why_en)}</div>
    <div class="links">
      ${p.arxiv ? `<a href="${esc(p.arxiv)}" target="_blank" rel="noopener">arXiv</a>` : ""}
      ${p.project ? `<a href="${esc(p.project)}" target="_blank" rel="noopener">${esc(t(UI.project))}</a>` : ""}
    </div>
  </div>`;
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

/* ---------- screens ---------- */
function homeHTML() {
  const ready = AXES.every((a) => picks[a.key]);
  const axes = AXES.map((ax) => {
    const btn = (side) => `<button type="button" class="pick" data-act="pick" data-axis="${ax.key}" data-letter="${side.letter}" aria-pressed="${picks[ax.key] === side.letter}">
        <b>${side.letter}</b><span class="lbl">${esc(t(side.label))}</span>
        <span class="desc">${esc(t(side.desc))}</span>
      </button>`;
    return `<div class="axis">${btn(ax.a)}${btn(ax.b)}</div>`;
  }).join("");
  return `<section class="fade-in">
    <div class="eyebrow">${esc(t(UI.eyebrow))}</div>
    <h1>${esc(t(UI.title))}</h1>
    ${loopHTML(null)}
    <p class="muted small" style="margin-top:10px">${esc(t(UI.loopIntro))}</p>
    <div class="card">
      <h2>${esc(t(UI.pickTitle))}</h2>
      ${axes}
      <button class="btn btn-primary" data-act="go" ${ready ? "" : "disabled"} style="margin-top:8px">${esc(t(UI.seeResult))}</button>
      <button class="btn btn-ghost" data-act="quiz">${esc(t(UI.dontKnow))}</button>
    </div>
    <p class="disclaimer">${esc(t(UI.disclaimer))}</p>
  </section>`;
}

function quizHTML() {
  const q = QUIZ[quiz.i];
  const pct = (quiz.i / QUIZ.length) * 100;
  return `<section class="fade-in">
    <div class="progress"><i style="width:${pct}%"></i></div>
    <div class="muted small">${esc(t(UI.quizOf))} ${quiz.i + 1} / ${QUIZ.length}</div>
    <div class="qtext">${esc(t(q.q))}</div>
    ${q.options.map((o, i) => `<button class="opt" data-act="answer" data-i="${i}">${esc(t(o.text))}</button>`).join("")}
    <a class="btn btn-ghost" href="#/">${esc(t(UI.back))}</a>
  </section>`;
}

function resultHTML(type) {
  const d = TYPES[type];
  const opp = opposite(type);
  const o = TYPES[opp];
  const stage = STAGES[d.stage];
  const axesRow = type.split("").map((L, i) => {
    const ax = AXES[i];
    const side = ax.a.letter === L ? ax.a : ax.b;
    return `<div><b>${L}</b>${esc(t(side.label))}</div>`;
  }).join("");
  const oppSet = PAPERS[opp];
  const oppStarter = oppSet ? [oppSet.foundational?.[0], oppSet.recent?.[0]].filter(Boolean) : [];
  const evidence = EVIDENCE.cite
    ? `<div class="evidence"><b>${esc(t(UI.evidenceTitle))}</b><br>${esc(t(EVIDENCE))}<br>
        <a href="${esc(EVIDENCE.url)}" target="_blank" rel="noopener">${esc(EVIDENCE.cite)}</a></div>`
    : "";
  const grid = Object.keys(TYPES).map((k) => `<a href="#/r/${k}" class="${k === type ? "cur" : ""}">${k}</a>`).join("");

  return `<section class="fade-in">
    <div class="card">
      <div class="section-label">${esc(t(UI.myField))}</div>
      <div class="type-big">${type}</div>
      <div class="nick">${esc(t(d.nick))}</div>
      <div class="field-name">${esc(t(d.field))}</div>
      <div class="chips"><span class="chip gold">${esc(t(UI.loopStage))} · ${esc(stage.en)}${lang === "ko" ? ` (${esc(stage.ko)})` : ""}</span></div>
      <div class="axes-row">${axesRow}</div>
    </div>

    ${loopHTML(d.stage)}

    <div class="card">
      <div class="section-label">${esc(t(UI.easyTitle))}</div>
      <p>${esc(t(d.easy))}</p>
      <div class="section-label" style="margin-top:14px">${esc(t(UI.barrierTitle))}</div>
      <p class="muted">${esc(t(d.barrier))}</p>
      <div class="section-label" style="margin-top:14px">${esc(t(UI.toolsTitle))}</div>
      <div class="chips">${d.tools.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>
    </div>

    <div class="card">
      <div class="section-label">${esc(t(UI.papersTitle))}</div>
      <div id="papers">${papersBlock(type)}</div>
    </div>

    <div class="card opp">
      <div class="section-label" style="color:var(--gold-bright)">${esc(t(UI.oppTitle))}</div>
      <p class="small muted">${esc(t(UI.oppClaim))}</p>
      <div class="vs"><span class="me">${type}</span><span class="arrow">⇄</span><span class="type-mid">${opp}</span></div>
      <div class="nick">${esc(t(o.nick))}</div>
      <div class="field-name" style="font-size:19px">${esc(t(o.field))}</div>
      <p style="margin-top:8px">${esc(t(o.easy))}</p>
      <div class="chips">${o.tools.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>
      <div class="quote">
        <h3>${esc(t(UI.synergyTitle))}</h3>
        <p class="muted" style="margin:0">${esc(t(PAIRS[pairKey(type, opp)]))}</p>
      </div>
      ${oppStarter.length ? `<div class="section-label" style="margin-top:14px">${esc(t(UI.oppPapers))}</div>${oppStarter.map(paperHTML).join("")}` : ""}
      ${evidence}
      <a class="btn btn-ghost" href="#/r/${opp}">${opp} →</a>
    </div>

    <button class="btn btn-gold" data-act="save" data-type="${type}">${esc(t(UI.save))}</button>
    <a class="btn btn-ghost" href="#/">${esc(t(UI.back))}</a>

    <div class="card">
      <div class="section-label">${esc(t(UI.allTypes))}</div>
      <div class="grid16">${grid}</div>
    </div>
    <p class="disclaimer">${esc(t(UI.disclaimer))}</p>
  </section>`;
}

/* ---------- router ---------- */
function render(scroll = true) {
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "quiz") {
    quiz ??= { i: 0, votes: {} };
    app.innerHTML = quizHTML();
  } else if (h.startsWith("r/") && isType(h.slice(2).toUpperCase())) {
    app.innerHTML = resultHTML(h.slice(2).toUpperCase());
  } else {
    quiz = null;
    app.innerHTML = homeHTML();
  }
  if (scroll) window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { paperTab = "foundational"; render(); });

function showResult(type) {
  vote(type); // only counted when the visitor picks or finishes the quiz, not when browsing
  quiz = null;
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
