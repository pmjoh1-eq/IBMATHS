const treeEl = document.getElementById("tree");
const statusEl = document.getElementById("status");
const classSelect = document.getElementById("classSelect");
const openThisWeekBtn = document.getElementById("openThisWeekBtn");

const lessonView = document.getElementById("lessonView");

const studentNotesText = document.getElementById("studentNotesText");
const sketchSvg = document.getElementById("sketchSvg");
const clearCanvasBtn = document.getElementById("clearCanvasBtn");
const eraserBtn = document.getElementById("eraserBtn");

const CLASSES = ["12AA_SL","12AA_HL","12AI_SL","11AA_SL","11AA_HL","11AI_SL"];

let repoRoot = "";
let syllabus = [];
let textbooks = [];
let plan = null;

let selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };

// default collapsed
let collapsed = { terms: {}, weeks: {} };

// -------- Student notes state (per lesson) ----------
let currentLessonKey = null;

// Sketch tool state
let tool = {
  mode: "pen", // 'pen' | 'eraser'
  color: "#111111",
  penWidth: 3.5,
  eraserWidth: 18
};

let drawing = {
  isDown: false,
  currentPathEl: null,
  d: "",
  lastPt: null
};

init().catch(showError);

async function init() {
  repoRoot = getRepoRoot();

  classSelect.innerHTML = "";
  for (const c of CLASSES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    classSelect.appendChild(opt);
  }

  setStatus("Loading reference data…");
  [syllabus, textbooks] = await Promise.all([
    loadJSON(new URL("data/syllabus_objectives.json", repoRoot).toString(), "syllabus_objectives.json"),
    loadJSON(new URL("data/textbook_references.json", repoRoot).toString(), "textbook_references.json"),
  ]);
  clearStatus();

  classSelect.addEventListener("change", () => loadPlanAndRender().catch(showError));
  openThisWeekBtn.addEventListener("click", () => openThisWeek());

  // Notes autosave
  studentNotesText.addEventListener("input", () => {
    if (!currentLessonKey) return;
    localStorage.setItem(lsKeyText(currentLessonKey), studentNotesText.value || "");
  });

  // Sketch tools
  setupToolButtons();
  setupSketchCanvas();

  clearCanvasBtn.addEventListener("click", () => {
    if (!currentLessonKey) return;
    sketchSvg.innerHTML = "";
    saveSketch();
  });

  await loadPlanAndRender();
}

// ---------- Data loading ----------
async function loadPlanAndRender() {
  const classId = classSelect.value || CLASSES[0];
  classSelect.value = classId;

  setStatus(`Loading plan: ${classId}…`);
  plan = await loadJSON(new URL(`data/plans/${classId}.json`, repoRoot).toString(), `${classId}.json`);
  clearStatus();

  selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };
  collapsed = { terms: {}, weeks: {} }; // reset so everything starts unexpanded

  renderTree();
  renderLesson();
  loadStudentNotesForSelection(); // will clear
}

// ---------- Tree ----------
function renderTree() {
  treeEl.innerHTML = "";
  if (!plan?.terms) return;

  plan.terms.forEach((term, tIdx) => {
    const termKey = String(tIdx);
    if (collapsed.terms[termKey] === undefined) collapsed.terms[termKey] = true; // start collapsed

    const termBox = document.createElement("div");
    termBox.className = "treeItem";

    const hdr = document.createElement("div");
    hdr.className = "treeHdr";

    const left = document.createElement("div");
    left.style.cursor = "pointer";
    left.innerHTML = `
      <div class="treeTitle">${escapeHtml(term.label || term.term_id || `Term ${tIdx+1}`)}</div>
      <div class="treeMeta">Term</div>
    `;
    left.onclick = () => {
      collapsed.terms[termKey] = !collapsed.terms[termKey];
      renderTree();
    };

    const btn = document.createElement("button");
    btn.className = "iconBtn";
    btn.textContent = collapsed.terms[termKey] ? "+" : "−";
    btn.onclick = () => {
      collapsed.terms[termKey] = !collapsed.terms[termKey];
      renderTree();
    };

    hdr.appendChild(left);
    hdr.appendChild(btn);
    termBox.appendChild(hdr);

    if (!collapsed.terms[termKey]) {
      const termChildren = document.createElement("div");
      termChildren.className = "treeChildren";

      (term.weeks || []).forEach((week, wIdx) => {
        const wkKey = `${tIdx}-${wIdx}`;
        if (collapsed.weeks[wkKey] === undefined) collapsed.weeks[wkKey] = true; // start collapsed

        const weekBox = document.createElement("div");
        weekBox.className = "treeItem";

        const wh = document.createElement("div");
        wh.className = "treeHdr";

        const wLeft = document.createElement("div");
        wLeft.style.cursor = "pointer";
        const dateLabel = week.start_date ? ` • starts ${escapeHtml(week.start_date)}` : "";
        wLeft.innerHTML = `
          <div class="treeTitle">${escapeHtml(week.label || week.week_id || `Week ${wIdx+1}`)}</div>
          <div class="treeMeta">Week${dateLabel}</div>
        `;
        wLeft.onclick = () => {
          collapsed.weeks[wkKey] = !collapsed.weeks[wkKey];
          renderTree();
        };

        const wBtn = document.createElement("button");
        wBtn.className = "iconBtn";
        wBtn.textContent = collapsed.weeks[wkKey] ? "+" : "−";
        wBtn.onclick = () => {
          collapsed.weeks[wkKey] = !collapsed.weeks[wkKey];
          renderTree();
        };

        wh.appendChild(wLeft);
        wh.appendChild(wBtn);
        weekBox.appendChild(wh);

        if (!collapsed.weeks[wkKey]) {
          const weekChildren = document.createElement("div");
          weekChildren.className = "treeChildren";

          (week.lessons || []).forEach((lesson, lIdx) => {
            const b = document.createElement("button");
            b.className = "lessonBtn" + (isSelected(tIdx, wIdx, lIdx) ? " active" : "");
            b.textContent = lesson.title || `Lesson ${lIdx+1}`;
            b.onclick = () => {
              selected.termIndex = tIdx;
              selected.weekIndex = wIdx;
              selected.lessonIndex = lIdx;
              renderTree();
              renderLesson();
              loadStudentNotesForSelection();
            };
            weekChildren.appendChild(b);
          });

          weekBox.appendChild(weekChildren);
        }

        termChildren.appendChild(weekBox);
      });

      termBox.appendChild(termChildren);
    }

    treeEl.appendChild(termBox);
  });
}

function isSelected(t, w, l){
  return selected.termIndex === t && selected.weekIndex === w && selected.lessonIndex === l;
}

// ---------- Lesson view ----------
function renderLesson() {
  const lesson = getSelectedLesson();
  if (!lesson) {
    lessonView.innerHTML = `<div class="muted">Select a lesson from a week to view details.</div>`;
    return;
  }

  const week = getSelectedWeek();
  const term = getSelectedTerm();

  const syllabusItems = (lesson.syllabus_ids || [])
    .map(id => syllabus.find(s => s.id === id))
    .filter(Boolean);

  const tbItems = (lesson.textbook_ids || [])
    .map(id => textbooks.find(t => t.id === id))
    .filter(Boolean);

  lessonView.innerHTML = `
    <div class="lessonCard">
      <div class="kv"><div class="k">Term</div><div class="v">${escapeHtml(term?.label || term?.term_id || "")}</div></div>
      <div class="kv"><div class="k">Week</div><div class="v">${escapeHtml(week?.label || week?.week_id || "")}${week?.start_date ? ` (starts ${escapeHtml(week.start_date)})` : ""}</div></div>
      <div class="kv"><div class="k">Lesson</div><div class="v">${escapeHtml(lesson.title || "")}</div></div>

      <div class="kv"><div class="k">Homework</div><div class="v">${escapeHtml(lesson.homework || "") || "<span class='muted'>—</span>"}</div></div>

      <div class="kv"><div class="k">Teacher notes</div><div class="v">${formatTeacherNotes(lesson.notes_latex || "")}</div></div>

      <div class="kv"><div class="k">Syllabus</div><div class="v">
        ${syllabusItems.length ? `<ul class="list">${syllabusItems.map(s => `<li><strong>${escapeHtml(s.section || s.id)}</strong> — ${escapeHtml(s.text || "")}</li>`).join("")}</ul>` : "<span class='muted'>—</span>"}
      </div></div>

      <div class="kv"><div class="k">Textbook</div><div class="v">
        ${tbItems.length ? `<ul class="list">${tbItems.map(t => `<li>${escapeHtml(t.label || t.id)}${t.detail ? ` — <span class="muted">${escapeHtml(t.detail)}</span>` : ""}${t.url ? ` • <a href="${escapeAttr(t.url)}" target="_blank" rel="noopener">Open</a>` : ""}</li>`).join("")}</ul>` : "<span class='muted'>—</span>"}
      </div></div>
    </div>
  `;

  typesetMath().catch(()=>{});
}

function formatTeacherNotes(s){
  if (!s) return "<span class='muted'>—</span>";
  // Keep it simple: show raw latex text; MathJax will render inline math
  const escaped = escapeHtml(s).replaceAll("\n","<br/>");
  return `<div>${escaped}</div>`;
}

// ---------- Open this week ----------
function openThisWeek(){
  const idx = findThisWeekIndex();
  if (!idx) {
    setStatus("No week dates found (start_date). Ask your teacher to set week start dates.", "error");
    return;
  }

  const { tIdx, wIdx } = idx;
  selected.termIndex = tIdx;
  selected.weekIndex = wIdx;
  selected.lessonIndex = null;

  collapsed.terms[String(tIdx)] = false;
  collapsed.weeks[`${tIdx}-${wIdx}`] = false;

  renderTree();
  renderLesson();
  loadStudentNotesForSelection(); // clears, since no lesson selected
  clearStatus();
}

function findThisWeekIndex(){
  if (!plan?.terms) return null;

  const today = new Date();
  today.setHours(0,0,0,0);

  for (let tIdx=0; tIdx<plan.terms.length; tIdx++){
    const term = plan.terms[tIdx];
    const weeks = term.weeks || [];
    for (let wIdx=0; wIdx<weeks.length; wIdx++){
      const w = weeks[wIdx];
      if (!w.start_date) continue;
      const start = parseISODate(w.start_date);
      if (!start) continue;
      const end = new Date(start);
      end.setDate(end.getDate()+7);

      if (today >= start && today < end){
        return { tIdx, wIdx };
      }
    }
  }
  return null;
}

function parseISODate(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  d.setHours(0,0,0,0);
  return d;
}

// ---------- Student local notes: text + svg ----------
function loadStudentNotesForSelection(){
  const lesson = getSelectedLesson();
  if (!lesson) {
    currentLessonKey = null;
    studentNotesText.value = "";
    sketchSvg.innerHTML = "";
    return;
  }

  currentLessonKey = makeLessonStorageKey();

  // load text
  const txt = localStorage.getItem(lsKeyText(currentLessonKey)) || "";
  studentNotesText.value = txt;

  // load svg
  const svg = localStorage.getItem(lsKeySvg(currentLessonKey)) || "";
  if (svg) {
    // Replace the entire SVG contents safely: parse as text and extract children
    // We store only the inner markup of the SVG for simplicity.
    sketchSvg.innerHTML = svg;
  } else {
    sketchSvg.innerHTML = "";
  }
}

function makeLessonStorageKey(){
  const classId = classSelect.value || plan?.class_id || "class";
  const term = getSelectedTerm();
  const week = getSelectedWeek();
  const lesson = getSelectedLesson();

  const t = term?.term_id || `T${selected.termIndex+1}`;
  const w = week?.week_id || `W${selected.weekIndex+1}`;
  const l = lesson?.lesson_id || `L${selected.lessonIndex+1}`;

  return `${classId}::${t}::${w}::${l}`;
}

function lsKeyText(k){ return `planner_student_text::${k}`; }
function lsKeySvg(k){ return `planner_student_svg::${k}`; }

function saveSketch(){
  if (!currentLessonKey) return;
  // Store only the inner contents (paths) to avoid width/height differences
  localStorage.setItem(lsKeySvg(currentLessonKey), sketchSvg.innerHTML || "");
}

// ---------- Sketch canvas (SVG) ----------
function setupToolButtons(){
  // color buttons
  const colorBtns = document.querySelectorAll(".colorBtn");
  colorBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tool.mode = "pen";
      eraserBtn.classList.remove("active");
      colorBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      tool.color = btn.dataset.color;
    });
  });

  eraserBtn.addEventListener("click", () => {
    tool.mode = "eraser";
    eraserBtn.classList.add("active");
    colorBtns.forEach(b => b.classList.remove("active"));
  });
}

function setupSketchCanvas(){
  // Ensure viewBox matches rendered size
  const syncViewBox = () => {
    const rect = sketchSvg.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    sketchSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  };
  syncViewBox();
  window.addEventListener("resize", syncViewBox);

  sketchSvg.addEventListener("pointerdown", (e) => {
    if (!currentLessonKey) return;
    sketchSvg.setPointerCapture(e.pointerId);
    drawing.isDown = true;
    drawing.lastPt = svgPoint(e);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const width = tool.mode === "eraser" ? tool.eraserWidth : tool.penWidth;
    const stroke = tool.mode === "eraser" ? "#ffffff" : tool.color;

    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    const p = drawing.lastPt;
    drawing.d = `M ${p.x} ${p.y}`;
    path.setAttribute("d", drawing.d);

    sketchSvg.appendChild(path);
    drawing.currentPathEl = path;
  });

  sketchSvg.addEventListener("pointermove", (e) => {
    if (!drawing.isDown || !drawing.currentPathEl) return;
    const p = svgPoint(e);

    // Simple smoothing: quadratic curve between last and new
    const lp = drawing.lastPt;
    const mx = (lp.x + p.x) / 2;
    const my = (lp.y + p.y) / 2;

    drawing.d += ` Q ${lp.x} ${lp.y} ${mx} ${my}`;
    drawing.currentPathEl.setAttribute("d", drawing.d);

    drawing.lastPt = p;
  });

  const end = (e) => {
    if (!drawing.isDown) return;
    drawing.isDown = false;
    drawing.currentPathEl = null;
    drawing.d = "";
    drawing.lastPt = null;
    saveSketch();
  };

  sketchSvg.addEventListener("pointerup", end);
  sketchSvg.addEventListener("pointercancel", end);
  sketchSvg.addEventListener("pointerleave", end);
}

function svgPoint(e){
  const rect = sketchSvg.getBoundingClientRect();
  const vb = sketchSvg.viewBox.baseVal;
  const sx = vb.width / rect.width;
  const sy = vb.height / rect.height;

  const x = (e.clientX - rect.left) * sx;
  const y = (e.clientY - rect.top) * sy;

  return { x: round2(x), y: round2(y) };
}

function round2(n){ return Math.round(n * 100) / 100; }

// ---------- Selected getters ----------
function getSelectedTerm(){ return (plan?.terms || [])[selected.termIndex] || null; }
function getSelectedWeek(){
  const term = getSelectedTerm();
  return (term?.weeks || [])[selected.weekIndex] || null;
}
function getSelectedLesson(){
  const week = getSelectedWeek();
  if (!week || selected.lessonIndex === null) return null;
  return (week.lessons || [])[selected.lessonIndex] || null;
}

// ---------- Helpers ----------
async function loadJSON(url, label) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${label}: ${res.status} ${res.statusText}\nURL: ${url}`);
  return await res.json();
}

function getRepoRoot() {
  const path = window.location.pathname;
  const idx = path.lastIndexOf("/student/");
  if (idx >= 0) return window.location.origin + path.slice(0, idx + 1);
  const url = new URL(".", window.location.href);
  return url.toString();
}

function setStatus(msg, kind="info") {
  statusEl.hidden = false;
  statusEl.className = "status" + (kind==="error" ? " error" : kind==="ok" ? " ok" : "");
  statusEl.textContent = msg;
}
function clearStatus(){ statusEl.hidden = true; statusEl.textContent=""; }
function showError(err){ console.error(err); setStatus(err?.message || String(err), "error"); }

async function typesetMath(){
  try { if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise(); } catch {}
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("`","&#96;"); }
