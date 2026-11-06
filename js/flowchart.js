// Python Nexus 流程图渲染器：把 nexus_flow.build_flow() 生成的结构化流程树
// 布局为 SVG（无需联网、无第三方依赖），支持节点点击定位代码、执行时高亮、导出 SVG / PNG。

const NODE_H = 36;
const COND_H = 48;
const GAP = 26;        // 顺序节点之间的箭头长度
const BRANCH_GAP = 36; // 两个分支之间的最小间距
const LOOP_M = 22;     // 循环回边、出口线留白
const FONT = 13;

function textWidth(text) {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) > 0x2e80 ? FONT : FONT * 0.6;
  return Math.ceil(w);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const arrow = (x1, y1, x2, y2, cls = "") =>
  `<line class="fc-edge ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#fc-arrow)"/>`;
const path = (pts, withArrow = false) =>
  `<polyline class="fc-edge" fill="none" points="${pts.map((p) => p.join(",")).join(" ")}"${withArrow ? ' marker-end="url(#fc-arrow)"' : ""}/>`;
const label = (x, y, text, anchor = "middle") =>
  `<text class="fc-label" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`;

function boxNode(node, shape) {
  const tw = textWidth(node.text);
  const w = Math.max(tw + (shape === "io" ? 44 : 28), 72);
  const h = NODE_H;
  return {
    w, h, cx: w / 2, term: shape === "return" || shape === "jump",
    draw(x, y) {
      const line = node.line ? ` data-line="${node.line}"` : "";
      let body;
      if (shape === "term" || shape === "return") {
        body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
      } else if (shape === "io") {
        const k = 12;
        body = `<polygon points="${x + k},${y} ${x + w},${y} ${x + w - k},${y + h} ${x},${y + h}"/>`;
      } else {
        body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`;
      }
      return `<g class="fc-node fc-${shape}"${line}><title>${node.line ? `第 ${node.line} 行` : ""}</title>${body}` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 4.5}" text-anchor="middle">${esc(node.text)}</text></g>`;
    },
  };
}

function diamond(node) {
  const w = Math.max(textWidth(node.text) + 56, 96);
  const h = COND_H;
  return {
    w, h,
    draw(x, y) {
      const line = node.line ? ` data-line="${node.line}"` : "";
      return `<g class="fc-node fc-cond"${line}><title>第 ${node.line} 行</title>` +
        `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 4.5}" text-anchor="middle">${esc(node.text)}</text></g>`;
    },
  };
}

const EMPTY = { w: 0, h: 0, cx: 0, empty: true, term: false, draw: () => "" };

function seq(nodes) {
  const blocks = [];
  for (const n of nodes) {
    blocks.push(layout(n));
    if (n.type === "loop" && n.orelse && n.orelse.length) {
      blocks.push(group({ type: "group", text: "循环正常结束后执行 (else)", line: n.line, body: n.orelse }));
    }
  }
  if (!blocks.length) return EMPTY;
  const L = Math.max(...blocks.map((b) => b.cx));
  const R = Math.max(...blocks.map((b) => b.w - b.cx));
  const h = blocks.reduce((s, b) => s + b.h, 0) + GAP * (blocks.length - 1);
  return {
    w: L + R, h, cx: L, term: blocks[blocks.length - 1].term,
    draw(x, y) {
      let out = "";
      let cy = y;
      blocks.forEach((b, i) => {
        out += b.draw(x + L - b.cx, cy);
        cy += b.h;
        if (i < blocks.length - 1) {
          if (!b.term) out += arrow(x + L, cy, x + L, cy + GAP);
          cy += GAP;
        }
      });
      return out;
    },
  };
}

function ifBlock(node) {
  const D = diamond(node);
  const Y = seq(node.yes || []);
  const N = seq(node.no || []);
  const top = D.h + 18;
  let gap = BRANCH_GAP;
  const sep = (Y.w - Y.cx) + gap + N.cx;
  if (sep < D.w + 24) gap += D.w + 24 - sep;
  let yx = 0;
  let nx = Y.w + gap;
  let cx = (Y.cx + nx + N.cx) / 2;
  const shift = Math.max(0, D.w / 2 - cx);
  yx += shift; nx += shift; cx += shift;
  const ycx = yx + Y.cx;
  const ncx = nx + N.cx;
  const w = Math.max(nx + N.w, cx + D.w / 2);
  const mergeY = top + Math.max(Y.h, N.h) + 16;
  const term = Y.term && N.term && !N.empty;
  return {
    w, h: mergeY, cx, term,
    draw(x, y) {
      const midY = y + D.h / 2;
      let out = D.draw(x + cx - D.w / 2, y);
      // 是（左分支）
      out += path([[x + cx - D.w / 2, midY], [x + ycx, midY], [x + ycx, y + (Y.empty ? mergeY : top)]], !Y.empty);
      out += label(x + cx - D.w / 2 - 6, midY - 6, "是", "end");
      out += Y.draw(x + yx, y + top);
      // 否（右分支）
      out += path([[x + cx + D.w / 2, midY], [x + ncx, midY], [x + ncx, y + (N.empty ? mergeY : top)]], !N.empty);
      out += label(x + cx + D.w / 2 + 6, midY - 6, "否", "start");
      out += N.draw(x + nx, y + top);
      // 汇合
      if (!Y.term) out += path([[x + ycx, y + top + Y.h], [x + ycx, y + mergeY], [x + cx, y + mergeY]]);
      if (!N.term) out += path([[x + ncx, y + top + N.h], [x + ncx, y + mergeY], [x + cx, y + mergeY]]);
      if (!term) out += `<circle class="fc-join" cx="${x + cx}" cy="${y + mergeY}" r="3"/>`;
      return out;
    },
  };
}

function loopBlock(node) {
  const D = diamond(node);
  const B = seq(node.body || []);
  const bodyTop = D.h + 22;
  const L = Math.max(D.w / 2, B.cx) + LOOP_M;
  const R = Math.max(D.w / 2, B.w - B.cx) + LOOP_M;
  const w = L + R;
  const cx = L;
  const backY = bodyTop + B.h + 12;
  const h = backY + 22;
  return {
    w, h, cx, term: false,
    draw(x, y) {
      const midY = y + D.h / 2;
      let out = D.draw(x + cx - D.w / 2, y);
      if (!B.empty) {
        out += arrow(x + cx, y + D.h, x + cx, y + bodyTop);
        out += label(x + cx + 6, y + D.h + 14, node.kind === "for" ? "有下一个" : "是", "start");
        out += B.draw(x + cx - B.cx, y + bodyTop);
      }
      // 回边：循环体结束后回到条件判断
      if (!B.term) {
        out += path([[x + cx, y + bodyTop + B.h], [x + cx, y + backY], [x + 6, y + backY], [x + 6, midY], [x + cx - D.w / 2, midY]], true);
      }
      // 出口
      out += path([[x + cx + D.w / 2, midY], [x + w - 6, midY], [x + w - 6, y + h - 10], [x + cx, y + h - 10], [x + cx, y + h]]);
      out += label(x + cx + D.w / 2 + 6, midY - 6, node.kind === "for" ? "遍历完" : "否", "start");
      return out;
    },
  };
}

function group(node) {
  const B = seq(node.body || []);
  const title = node.text;
  const titleH = 26;
  const half = Math.max(B.cx, B.w - B.cx, textWidth(title) / 2 + 8) + 14;
  const w = half * 2;
  const bodyTop = titleH + (B.empty ? 0 : 16);
  const h = bodyTop + B.h + 14;
  return {
    w, h, cx: half, term: false,
    draw(x, y) {
      const line = node.line ? ` data-line="${node.line}"` : "";
      let out = `<g class="fc-node fc-group"${line}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/>` +
        `<text x="${x + 10}" y="${y + 17}" class="fc-group-title">${esc(title)}</text></g>`;
      if (!B.empty) {
        out += arrow(x + half, y + titleH, x + half, y + bodyTop);
        out += B.draw(x + half - B.cx, y + bodyTop);
      }
      return out;
    },
  };
}

function layout(node) {
  switch (node.type) {
    case "start": case "end": return boxNode(node, "term");
    case "process": return boxNode(node, "process");
    case "io": return boxNode(node, "io");
    case "return": return boxNode(node, "return");
    case "jump": return boxNode(node, "jump");
    case "if": return ifBlock(node);
    case "loop": return loopBlock(node);
    case "group": return group(node);
    default: return boxNode({ ...node, text: node.text || node.type }, "process");
  }
}

/** 渲染一张流程图，返回 SVG 字符串。 */
export function renderChart(title, body, { endText = "结束" } = {}) {
  const nodes = [{ type: "start", text: title }, ...body];
  const last = body[body.length - 1];
  if (!last || last.type !== "return") nodes.push({ type: "end", text: endText });
  const chart = seq(nodes);
  const pad = 24;
  const W = Math.ceil(chart.w + pad * 2);
  const H = Math.ceil(chart.h + pad * 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="fc-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-size="${FONT}">` +
    `<defs><marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" class="fc-arrowhead"/></marker></defs>` +
    chart.draw(pad, pad) + "</svg>";
}

/** 生成可独立打开的 SVG 文件文本：把当前主题的颜色内联进去。 */
export function standaloneSvg(svgEl) {
  const cs = getComputedStyle(svgEl);
  const v = (name) => cs.getPropertyValue(name).trim();
  const style = `
    .fc-svg{background:${v("--fc-bg")};font-family:${v("--font-ui") || "sans-serif"}}
    .fc-node rect,.fc-node polygon{fill:${v("--fc-node")};stroke:${v("--fc-stroke")};stroke-width:1.5}
    .fc-cond polygon{fill:${v("--fc-cond")}}
    .fc-io polygon{fill:${v("--fc-io")}}
    .fc-term rect,.fc-return rect{fill:${v("--fc-term")}}
    .fc-group rect{fill:none;stroke-dasharray:5 4}
    .fc-jump rect{stroke-dasharray:4 3}
    .fc-node text{fill:${v("--fc-text")}}
    .fc-group-title{fill:${v("--fc-muted")};font-size:12px}
    .fc-edge{stroke:${v("--fc-line")};stroke-width:1.5;fill:none}
    .fc-arrowhead,.fc-join{fill:${v("--fc-line")}}
    .fc-label{fill:${v("--fc-muted")};font-size:12px}`;
  const clone = svgEl.cloneNode(true);
  clone.querySelectorAll(".fc-active").forEach((n) => n.classList.remove("fc-active"));
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = style;
  clone.insertBefore(st, clone.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

/** 把 SVG 栅格化为 PNG Blob（2 倍分辨率）。 */
export function svgToPng(svgText, width, height, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 导出失败"))), "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG 加载失败")); };
    img.src = url;
  });
}
