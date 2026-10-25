// Draws the shareable result card (1080 wide, at least 1350 tall) in the site's lab-notebook style.
import { STAGES, TYPES, opposite } from "./data.js";

const F = '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const M = '"IBM Plex Mono", ui-monospace, monospace';
const C = { bg: "#07111d", panel: "#0a1828", line: "rgba(185,217,235,0.22)", grid: "rgba(185,217,235,0.05)",
  text: "#e3edf5", muted: "#8aa2b6", faint: "#627a8f", cb: "#b9d9eb", gold: "#b3a369", goldB: "#d6c27f" };

function wrapLines(ctx, text, maxW) {
  const lines = [];
  let line = "";
  const breakLong = (w) => {
    let cur = "";
    for (const ch of w) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    return cur;
  };
  for (const w of text.split(" ")) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW) { line = test; continue; }
    if (line) lines.push(line);
    line = ctx.measureText(w).width > maxW ? breakLong(w) : w;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(ctx, text, x, y, maxW, lineH) {
  const lines = wrapLines(ctx, text, maxW);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + (lines.length - 1) * lineH;
}

function header(ctx, x, y, w, left, right) {
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, 64);
  ctx.font = `500 26px ${M}`; ctx.fillStyle = C.muted;
  ctx.fillText(left, x + 24, y + 41);
  const rw = ctx.measureText(right).width;
  ctx.fillText(right, x + w - 24 - rw, y + 41);
}

export async function drawCard(type, lang) {
  const t = (o) => (o && typeof o === "object" ? o[lang] ?? o.ko : o ?? "");
  await Promise.all([document.fonts.load(`600 200px ${M}`), document.fonts.load(`700 56px ${F}`)]).catch(() => {});
  const d = TYPES[type];
  const opp = opposite(type);
  const W = 1080, P = 72, IW = W - 2 * P;

  // Lay out on a tall layer first, then crop to fit (min 4:5).
  const layer = document.createElement("canvas");
  layer.width = W; layer.height = 2200;
  const ctx = layer.getContext("2d");
  ctx.textBaseline = "alphabetic";

  ctx.font = `500 26px ${M}`; ctx.fillStyle = C.muted;
  ctx.fillText("HUMANOID × MBTI", P, 100);
  ctx.fillStyle = C.goldB; ctx.fillText("WHY HUMANOIDS NEED AGENTIC VISION", P, 140);

  let y = 190;
  header(ctx, P, y, IW, `${lang === "ko" ? "결과" : "RESULT"} / ${type}`, "agentic-vision.loop");
  y += 64;
  ctx.strokeStyle = C.line; ctx.lineWidth = 2;
  const blockTop = y;

  ctx.fillStyle = C.cb; ctx.font = `600 190px ${M}`;
  ctx.fillText(type, P + 30, y + 200);
  y += 250;

  const kv = (k, v, font, color, lh) => {
    ctx.font = `500 24px ${M}`; ctx.fillStyle = C.muted; ctx.fillText(k, P + 30, y + 6);
    ctx.font = font; ctx.fillStyle = color;
    y = drawText(ctx, v, P + 190, y + 8, IW - 220, lh) + lh + 12;
  };
  kv("FIELD", t(d.field), `700 46px ${F}`, C.text, 60);
  kv("ROLE", t(d.nick), `500 36px ${F}`, C.goldB, 48);
  y += 10;
  ctx.strokeStyle = C.line;
  ctx.strokeRect(P, blockTop, IW, y - blockTop);

  // loop rail
  y += 30;
  const cw = IW / 4;
  Object.entries(STAGES).forEach(([k, v], i) => {
    const on = k === d.stage;
    if (on) { ctx.fillStyle = C.gold; ctx.fillRect(P + i * cw, y, cw, 76); }
    ctx.strokeStyle = C.line;
    ctx.strokeRect(P + i * cw, y, cw, 76);
    ctx.font = `${on ? 600 : 500} 28px ${M}`; ctx.fillStyle = on ? "#14110a" : C.muted;
    const label = `0${i + 1} ${v.en.toUpperCase()}`;
    ctx.fillText(label, P + i * cw + (cw - ctx.measureText(label).width) / 2, y + 48);
  });
  y += 76 + 50;

  // opposite block
  header(ctx, P, y, IW, lang === "ko" ? "정반대를 공부해 보세요" : "STUDY YOUR OPPOSITE", `${type} ⇄ ${opp}`);
  const oTop = y + 64;
  y = oTop + 110;
  ctx.font = `600 96px ${M}`; ctx.fillStyle = C.goldB; ctx.fillText(opp, P + 30, y);
  y += 70;
  ctx.font = `700 40px ${F}`; ctx.fillStyle = C.text;
  y = drawText(ctx, t(TYPES[opp].field), P + 30, y, IW - 60, 54) + 50;
  ctx.strokeStyle = "rgba(179,163,105,0.6)";
  ctx.strokeRect(P, oTop, IW, y - oTop);

  const finalH = Math.max(1350, y + 170);
  const c = document.createElement("canvas");
  c.width = W; c.height = finalH;
  const out = c.getContext("2d");
  out.fillStyle = C.bg; out.fillRect(0, 0, W, finalH);
  out.strokeStyle = C.grid; out.lineWidth = 2;
  for (let gy = 0; gy < finalH; gy += 56) { out.beginPath(); out.moveTo(0, gy); out.lineTo(W, gy); out.stroke(); }
  for (let gx = 0; gx < W; gx += 56) { out.beginPath(); out.moveTo(gx, 0); out.lineTo(gx, finalH); out.stroke(); }
  out.drawImage(layer, 0, 0);

  out.font = `500 24px ${M}`; out.fillStyle = C.faint;
  out.fillText(location.host + location.pathname.replace(/index\.html$/, ""), P, finalH - 100);
  out.font = `400 24px ${F}`;
  out.fillText(lang === "ko" ? "MBTI는 재미로! 진짜 기준은 오래 몰입할 수 있는 문제입니다." : "MBTI is just for fun. Follow the problems you love.", P, finalH - 60);
  return c;
}
