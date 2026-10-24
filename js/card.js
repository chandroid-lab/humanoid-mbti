// Draws the shareable 1080x1350 result card.
import { STAGES, TYPES, opposite } from "./data.js";

function wrapLines(ctx, text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  const pushLong = (w) => {
    // break a single long word (e.g. no spaces) by characters
    let cur = "";
    for (const ch of w) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
    }
    return cur;
  };
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW) { line = test; continue; }
    if (line) lines.push(line);
    line = ctx.measureText(w).width > maxW ? pushLong(w) : w;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(ctx, text, x, y, maxW, lineH) {
  const lines = wrapLines(ctx, text, maxW);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + lines.length * lineH;
}

export async function drawCard(type, lang) {
  const t = (o) => (o && typeof o === "object" ? o[lang] ?? o.ko : o ?? "");
  await document.fonts.ready;
  const d = TYPES[type];
  const opp = opposite(type);
  const W = 1080, H = 1350, P = 90, F = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  // Draw content on a tall transparent layer first, then size the final card to fit (min 4:5).
  const layer = document.createElement("canvas");
  layer.width = W; layer.height = 2000;
  const ctx = layer.getContext("2d");

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#d6c27f"; ctx.font = `600 34px ${F}`;
  ctx.fillText("Why humanoids need agentic vision", P, 150);
  ctx.fillStyle = "#9fb6c9"; ctx.font = `500 36px ${F}`;
  ctx.fillText(lang === "ko" ? "나의 휴머노이드 연구 유형" : "My humanoid research type", P, 210);

  ctx.fillStyle = "#b9d9eb"; ctx.font = `800 220px ${F}`;
  ctx.fillText(type, P - 8, 430);

  ctx.fillStyle = "#d6c27f"; ctx.font = `600 44px ${F}`;
  let y = drawText(ctx, t(d.nick), P, 510, W - 2 * P, 58);
  ctx.fillStyle = "#eaf3fa"; ctx.font = `800 58px ${F}`;
  y = drawText(ctx, t(d.field), P, y + 30, W - 2 * P, 74);

  // loop stage pills
  y += 40;
  let x = P;
  ctx.font = `700 32px ${F}`;
  for (const [k, v] of Object.entries(STAGES)) {
    const label = v.en;
    const w = ctx.measureText(label).width + 48;
    const on = k === d.stage;
    ctx.beginPath(); ctx.roundRect(x, y, w, 64, 32);
    ctx.fillStyle = on ? "#b3a369" : "rgba(185,217,235,0.10)"; ctx.fill();
    ctx.fillStyle = on ? "#1a1606" : "#9fb6c9";
    ctx.fillText(label, x + 24, y + 43);
    x += w + 14;
  }
  y += 64 + 60;

  ctx.strokeStyle = "rgba(185,217,235,0.18)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(W - P, y); ctx.stroke();
  y += 70;

  ctx.fillStyle = "#9fb6c9"; ctx.font = `600 36px ${F}`;
  ctx.fillText(lang === "ko" ? "정반대 보완 공부 →" : "Study my opposite →", P, y);
  ctx.fillStyle = "#d6c27f"; ctx.font = `800 64px ${F}`;
  ctx.fillText(opp, P, y + 80);
  ctx.fillStyle = "#eaf3fa"; ctx.font = `600 42px ${F}`;
  y = drawText(ctx, t(TYPES[opp].field), P, y + 145, W - 2 * P, 56);

  const finalH = Math.max(H, y + 170);
  const c = document.createElement("canvas");
  c.width = W; c.height = finalH;
  const out = c.getContext("2d");
  const bg = out.createLinearGradient(0, 0, 0, finalH);
  bg.addColorStop(0, "#0c1d35"); bg.addColorStop(1, "#06101d");
  out.fillStyle = bg; out.fillRect(0, 0, W, finalH);
  const glow = out.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 700);
  glow.addColorStop(0, "rgba(117,170,219,0.28)"); glow.addColorStop(1, "rgba(117,170,219,0)");
  out.fillStyle = glow; out.fillRect(0, 0, W, finalH);
  out.drawImage(layer, 0, 0);

  out.fillStyle = "#6f879c"; out.font = `500 28px ${F}`;
  out.fillText(location.host + location.pathname.replace(/index\.html$/, ""), P, finalH - 110);
  out.fillText(lang === "ko" ? "MBTI는 재미로! 진짜 기준은 오래 몰입할 수 있는 문제예요." : "MBTI is just for fun—follow the problems you love.", P, finalH - 66);
  return c;
}
