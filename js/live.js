import { AXES, TYPES, STAGES, opposite } from "./data.js";
import { subscribe, statsEnabled } from "./stats.js";
import { FIGS } from "./figs.js";
import { PAPERS } from "./papers.js";

const params = new URLSearchParams(location.search);
const demo = params.has("demo");
let lang = params.get("lang") === "en" ? "en" : "ko";
let showTable = false;
let view = "types"; // "types" | "loop"
let openType = null; // type shown in the big overlay
let last = { counts: {}, total: 0 };
let prev = {};

const L = {
  title:     { ko: "내 MBTI에 맞는 휴머노이드 연구는?", en: "Which humanoid research fits your MBTI?" },
  totalCap:  { ko: "명 참여", en: "people joined" },
  pairCap:   { ko: "쌍의 정반대 짝이 이 방에", en: "opposite pairs in this room" },
  heat:      { ko: "유형별 분포 (숫자 = 인원)", en: "By type (number = people)" },
  axis:      { ko: "축별 비율", en: "By axis" },
  robot:     { ko: "로봇이 하는 일 (드래그해서 돌리기)", en: "What the robot does (drag to rotate)" },
  justJoined:{ ko: "방금 참여", en: "Just joined" },
  showing:   { ko: "둘러보기", en: "Showing" },
  table:     { ko: "표로 보기", en: "Table view" },
  chart:     { ko: "차트로 보기", en: "Chart view" },
  noStats:   { ko: "Firebase 설정 전이라 통계가 꺼져 있습니다. 리허설은 주소 끝에 ?demo를 붙이세요.", en: "Stats are off until Firebase is configured. Add ?demo to the URL to rehearse." },
  demo:      { ko: "데모 모드: 가짜 데이터입니다.", en: "Demo mode: fake data." },
  loopBtn:   { ko: "루프 보기", en: "Loop view" },
  typesBtn:  { ko: "유형 보기", en: "Type view" },
  loopTitle: { ko: "이 방의 루프: 단계별 인원", en: "This room's loop: people per stage" },
  people:    { ko: "명", en: "" },
  inRoom:    { ko: "명이 이 방에 있습니다", en: "in this room" },
  easy:      { ko: "쉽게 말하면", en: "In plain words" },
  barrier:   { ko: "기술 장벽", en: "The barrier" },
  oppStudy:  { ko: "정반대 유형", en: "Opposite type" },
  close:     { ko: "닫기 (Esc)", en: "Close (Esc)" },
  papersH:   { ko: "읽어 볼 논문과 산업 사례", en: "Papers & industry" },
  clickHint: { ko: "칸을 누르면 크게 볼 수 있습니다", en: "Click a cell to enlarge" },
};
const t = (o) => o[lang];

// Site URL for the QR code: ?url= override, else this folder's index.
const siteUrl = params.get("url") || new URL("./", location.href).href;

function drawQR() {
  const qr = qrcode(0, "M");
  qr.addData(siteUrl);
  qr.make();
  document.getElementById("qr").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  document.getElementById("url").textContent = siteUrl.replace(/^https?:\/\//, "");
}

// The 8 opposite pairs, each listed once (the type starting with E first).
const PAIR_LIST = Object.keys(TYPES).filter((k) => k[0] === "E").map((k) => [k, opposite(k)]);

function render() {
  const { counts, total } = last;
  document.documentElement.lang = lang;
  document.getElementById("title").textContent = t(L.title);
  document.getElementById("totalCap").textContent = t(L.totalCap);
  document.getElementById("pairCap").textContent = t(L.pairCap);
  document.getElementById("heatTitle").textContent = view === "loop" ? t(L.loopTitle) : `${t(L.heat)} · ${t(L.clickHint)}`;
  document.getElementById("viewBtn").textContent = view === "loop" ? t(L.typesBtn) : t(L.loopBtn);
  document.getElementById("axisTitle").textContent = t(L.axis);
  document.getElementById("robotTitle").textContent = t(L.robot);
  document.getElementById("langBtn").textContent = lang === "ko" ? "EN" : "한국어";
  document.getElementById("tableBtn").textContent = showTable ? t(L.chart) : t(L.table);
  document.getElementById("adminBtn").textContent = lang === "ko" ? "관리자" : "Admin";
  document.getElementById("notice").textContent = demo ? t(L.demo) : statsEnabled ? "" : t(L.noStats);

  document.getElementById("total").textContent = total;
  const pairCount = PAIR_LIST.reduce((s, [a, b]) => s + Math.min(counts[a] || 0, counts[b] || 0), 0);
  document.getElementById("pairCount").textContent = pairCount;

  // Heat grid: one hue, more people = brighter. Count is always printed, so color is never the only cue.
  const max = Math.max(1, ...Object.values(counts));
  const heat = document.getElementById("heat");
  if (view === "loop") {
    heat.style.display = "block";
    heat.innerHTML = loopHTML(counts, total);
  } else if (showTable) {
    heat.style.display = "block";
    heat.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:15px">
      <tr><th align="left">Type</th><th align="left">${lang === "ko" ? "분야" : "Field"}</th><th align="right">${lang === "ko" ? "인원" : "People"}</th></tr>
      ${Object.keys(TYPES).map((k) => `<tr style="border-top:1px solid var(--line)"><td><b>${k}</b></td><td>${TYPES[k].field[lang]}</td><td align="right">${counts[k] || 0}</td></tr>`).join("")}
    </table>`;
  } else {
    heat.style.display = "grid";
    heat.innerHTML = Object.keys(TYPES).map((k) => {
      const n = counts[k] || 0;
      const r = n / max;
      const alpha = n === 0 ? 0.06 : 0.22 + 0.7 * r;
      const dark = alpha > 0.6; // light fill -> switch to dark ink
      const ink = dark ? "#06101d" : "var(--text-primary)";
      const popped = prev[k] !== undefined && n > prev[k] ? "pop" : "";
      return `<div class="cell ${popped}" role="cell" tabindex="0" data-type="${k}" title="${k}: ${n}" style="background:rgba(var(--seq),${alpha.toFixed(2)});color:${ink}">
        <span class="n">${n}</span><span class="k">${k}</span><span class="f">${TYPES[k].field[lang]}</span>
      </div>`;
    }).join("");
  }

  // Axis split bars
  document.getElementById("axes").innerHTML = AXES.map((ax) => {
    const a = Object.entries(counts).filter(([k]) => k.includes(ax.a.letter)).reduce((s, [, v]) => s + v, 0);
    const b = total - a;
    const pa = total ? Math.round((a / total) * 100) : 50;
    return `<div class="axisrow">
      <div class="lab">${ax.a.letter}<small>${ax.a.label[lang]}</small></div>
      <div>
        <div class="bar" title="${ax.a.letter} ${a} · ${ax.b.letter} ${b}"><i style="flex-grow:${total ? a : 1}"></i><i style="flex-grow:${total ? b : 1}"></i></div>
        <div class="pct"><span>${a} (${total ? pa : 0}%)</span><span>${b} (${total ? 100 - pa : 0}%)</span></div>
      </div>
      <div class="lab r">${ax.b.letter}<small>${ax.b.label[lang]}</small></div>
    </div>`;
  }).join("");



  prev = { ...counts };
  if (openType) renderOverlay();
}

// Loop view: group people by the loop stage of their type's field.
function loopHTML(counts, total) {
  const stages = Object.keys(STAGES).map((st) => {
    const types = Object.keys(TYPES).filter((k) => TYPES[k].stage === st);
    const n = types.reduce((sum, k) => sum + (counts[k] || 0), 0);
    return { st, types, n };
  });
  const max = Math.max(1, ...stages.map((x) => x.n));
  const min = Math.min(...stages.map((x) => x.n));
  const weakest = stages.filter((x) => x.n === min).map((x) => STAGES[x.st].en);
  const cols = stages.map((x) => `
    <div class="lcol ${total && x.n === min ? "weak" : ""}">
      <div class="lname">${STAGES[x.st].en}<small>${lang === "ko" ? STAGES[x.st].ko : ""}</small></div>
      <div class="lbarwrap"><div class="lbar" style="height:${(x.n / max) * 100}%"></div></div>
      <div class="lnum">${x.n}<small>${t(L.people)}</small></div>
      <div class="ltypes">${x.types.map((k) => `<span>${k} ${counts[k] || 0}</span>`).join("")}</div>
    </div>`).join("");
  const msg = !total ? "" : lang === "ko"
    ? `이 방에서 가장 비어 있는 단계는 <b>${weakest.join(", ")}</b>입니다 (${min}명). 루프가 끝까지 돌려면 누군가는 이 단계를 공부해야 합니다.`
    : `The emptiest stage in this room is <b>${weakest.join(", ")}</b> (${min}). For the loop to close, someone here needs to learn it.`;
  return `<div class="loopview">${cols}</div>${msg ? `<p class="loopmsg">${msg}</p>` : ""}`;
}

// Big overlay for one type, for explaining it during the talk.
// Big overlay for one type: 3D scene of the field on the left, explanation on the right.
let ovCleanup = null, ovType = null;
function renderOverlay() {
  const k = openType, d = TYPES[k], o = opposite(k);
  let ov = document.getElementById("overlay");
  const n = last.counts[k] || 0;
  if (ov && ovType === k) { // live data changed: only update the count, keep the 3D view running
    const c = ov.querySelector(".ovcount span"); if (c) c.textContent = n;
    return;
  }
  ovCleanup?.(); ovCleanup = null;
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "overlay";
    ov.className = "overlay";
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) closeOverlay(); });
    document.getElementById("live").appendChild(ov); // inside .viz-root so the color tokens apply
  }
  ovType = k;
  const f = FIGS[k];
  ov.innerHTML = `<div class="ovbox" role="dialog" aria-modal="true" aria-label="${k}">
    <button class="ovclose" data-close>${t(L.close)}</button>
    <div class="ovtop">
      <div><div class="ovtype">${k}</div><div class="ovnick">${d.nick[lang]}</div><div class="ovstrength">${d.strength[lang]}</div></div>
      <div class="ovcount"><span>${n}</span>${t(L.inRoom)}</div>
    </div>
    <div class="ovfield">${d.field[lang]}</div>
    <div class="ovstages">${Object.entries(STAGES).map(([st, v]) => `<span class="${st === d.stage ? "on" : ""}">${v.en}</span>`).join("")}</div>
    <div class="ovmain">
      <div class="ovviz"><div class="robot ovrobot" id="ovRobot"><div class="loading">loading 3D…</div></div>
        <div class="ovact">▶ ${d.act[lang]}</div></div>
      <div class="ovgrid">
        <div><h3>${t(L.easy)}</h3><p>${d.easy[lang]}</p></div>
        <div><h3>${t(L.barrier)}</h3><p>${d.barrier[lang]}</p></div>
        ${f ? `<figure class="ovfig"><img src="${f.img}" alt="${k} Fig. 1"><figcaption>FIG. 1 · ${f.license}</figcaption></figure>` : ""}
        <div><h3>${t(L.papersH)}</h3><ol class="ovpapers">${paperList(k)}</ol></div>
        <div><h3>${t(L.oppStudy)}: <span class="ovopp">${o}</span></h3><p>${TYPES[o].field[lang]}</p></div>
      </div>
    </div>
  </div>`;
  import("./robot.js").then(async ({ mountRobot }) => {
    const el = document.getElementById("ovRobot");
    if (!el || ovType !== k) return;
    const c = await mountRobot(el, d.body, d.motion);
    if (ovType === k && el.isConnected) { ovCleanup = c; el.querySelector(".loading")?.remove(); } else c();
  }).catch((e) => console.warn("3D failed", e));
}
// two foundational + two recent papers + two industry items, with links
function paperList(k) {
  const set = PAPERS[k];
  if (!set) return "";
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const venue = (p) => (/\d{4}/.test(p.venue) ? p.venue : `${p.venue} ${p.year}`);
  return [...set.foundational.slice(0, 2).map((p) => [p, "basic"]), ...set.recent.slice(0, 2).map((p) => [p, "new"])].map(([p, tag]) => `
    <li><span class="tag ${tag}">${tag === "new" ? (lang === "ko" ? "최신" : "new") : (lang === "ko" ? "기초" : "basic")}</span><a href="${esc(p.arxiv)}" target="_blank" rel="noopener">${esc(p.title)}</a>
      <span class="pm">${esc(p.authors)} · ${esc(venue(p))}${p.project ? ` · <a href="${esc(p.project)}" target="_blank" rel="noopener">project</a>` : ""}</span></li>`).join("")
    + (set.industry || []).map((p) => `
    <li><span class="tag ind">${lang === "ko" ? "산업" : "industry"}</span><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>
      <span class="pm">${esc([p.org, p.year].filter(Boolean).join(" · "))}</span></li>`).join("");
}

function closeOverlay() {
  openType = null; ovType = null;
  ovCleanup?.(); ovCleanup = null;
  document.getElementById("overlay")?.remove();
}

document.getElementById("langBtn").onclick = () => { lang = lang === "ko" ? "en" : "ko"; render(); };
document.getElementById("tableBtn").onclick = () => { showTable = !showTable; view = "types"; render(); };
document.getElementById("viewBtn").onclick = () => { view = view === "loop" ? "types" : "loop"; render(); };
const openCell = (el) => { if (el?.dataset.type) { closeOverlay(); openType = el.dataset.type; renderOverlay(); } };
document.getElementById("heat").addEventListener("click", (e) => openCell(e.target.closest(".cell")));
document.getElementById("heat").addEventListener("keydown", (e) => { if (e.key === "Enter") openCell(e.target.closest(".cell")); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeOverlay(); });

// ----- interactive robot: shows the latest joiner's field, otherwise cycles through types -----
let lrCleanup = null, lrType = null, lrBusy = false, lrNext = null, lrTimer = null;
async function showRobot(type, joined) {
  if (lrBusy) { lrNext = [type, joined]; return; }
  lrBusy = true;
  try {
    const el = document.getElementById("liveRobot");
    const { mountRobot } = await import("./robot.js");
    lrCleanup?.(); lrCleanup = null;
    el.querySelectorAll("canvas, .robot-view, .rv-credit").forEach((n) => n.remove());
    const d = TYPES[type];
    lrCleanup = await mountRobot(el, d.body, d.motion);
    el.querySelector(".loading")?.remove();
    lrType = type;
    document.getElementById("liveAct").innerHTML = `${joined ? t(L.justJoined) : t(L.showing)}: <b>${type}</b> · ${d.act[lang]}`;
  } catch (e) { console.warn("3D failed", e); }
  lrBusy = false;
  if (lrNext) { const [ty, j] = lrNext; lrNext = null; showRobot(ty, j); }
}
const ALL_TYPES = Object.keys(TYPES);
let cycleI = Math.floor(Math.random() * ALL_TYPES.length);
function scheduleCycle() {
  clearTimeout(lrTimer);
  lrTimer = setTimeout(() => { cycleI = (cycleI + 1) % ALL_TYPES.length; showRobot(ALL_TYPES[cycleI], false); scheduleCycle(); }, 12000);
}
let prevCounts = null, lastSwitch = 0;
function onCounts(counts) { // a type's count went up -> someone just joined as that type
  if (prevCounts) {
    const up = Object.keys(counts).find((k) => (counts[k] || 0) > (prevCounts[k] || 0));
    if (up && performance.now() - lastSwitch > 6000) { lastSwitch = performance.now(); showRobot(up, true); scheduleCycle(); }
  }
  prevCounts = { ...counts };
}

drawQR();
render();
showRobot(ALL_TYPES[cycleI], false);
scheduleCycle();

if (demo) {
  const keys = Object.keys(TYPES);
  const counts = {};
  setInterval(() => {
    if (Object.values(counts).reduce((s, v) => s + v, 0) >= 30) return;
    const k = keys[Math.floor(Math.random() * keys.length)];
    counts[k] = (counts[k] || 0) + 1;
    last = { counts: { ...counts }, total: Object.values(counts).reduce((s, v) => s + v, 0) };
    render();
    onCounts(last.counts);
  }, 900);
} else {
  subscribe((data) => { last = data; render(); onCounts(data.counts); });
}
