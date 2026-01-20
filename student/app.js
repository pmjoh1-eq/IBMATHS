const CLASSES = ["12AA_SL","12AA_HL","12AI_SL","11AA_SL","11AA_HL","11AI_SL"];

const classSelect = document.getElementById("classSelect");
const thisWeekBtn = document.getElementById("thisWeekBtn");
const todayLabel = document.getElementById("todayLabel");

const treeEl = document.getElementById("tree");
const statusEl = document.getElementById("status");

const viewerEmpty = document.getElementById("viewerEmpty");
const viewer = document.getElementById("viewer");
const lessonTitle = document.getElementById("lessonTitle");
const lessonMeta = document.getElementById("lessonMeta");
const syllabusList = document.getElementById("syllabusList");
const textbookList = document.getElementById("textbookList");
const homeworkEl = document.getElementById("homework");
const notesEl = document.getElementById("notes");

let repoRoot = "";
let syllabus = [];
let textbooks = [];
let plan = null;

let collapsed = {
  terms: {}, // termIndex -> true/false
  weeks: {}  // `${tIdx}-${wIdx}` -> true/false
};

let selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };

init().catch(showError);

async function init() {
  repoRoot = getRepoRoot();
  todayLabel.textContent = formatDateLocal(new Date());

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
  thisWeekBtn.addEventListener("click", () => openThisWeek(true));

  await loadPlanAndRender();

  // Auto-open on first load
  openThisWeek(false);
}

async function loadPlanAndRender() {
  const classId = classSelect.value || CLASSES[0];
  classSelect.value = classId;

  setStatus(`Loading plan: ${classId}…`);
  plan = await loadJSON(new URL(`data/plans/${classId}.json`, repoRoot).toString(), `${classId}.json`);
  clearStatus();

  // reset selection, keep collapse state
  selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };

  renderTree();
  renderLesson();
}

function renderTree() {
  treeEl.innerHTML = "";
  if (!plan?.terms) return;

  plan.terms.forEach((term, tIdx) => {
    const termKey = String(tIdx);
    if (collapsed.terms[termKey] === undefined) collapsed.terms[termKey] = true;

    const termBox = document.createElement("div");
    termBox.className = "treeItem";

    const hdr = document.createElement("div");
    hdr.className = "treeHdr";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="treeTitle">${escapeHtml(term.label || term.term_id || `Term ${tIdx+1}`)}</div>
      <div class="treeMeta">Term</div>
    `;

    const btn = document.createElement("button");
    btn.className = "iconBtn";
    btn.textContent = collapsed.terms[termKey] ? "+" : "−";
    btn.title = collapsed.terms[termKey] ? "Expand" : "Collapse";
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
        if (collapsed.weeks[wkKey] === undefined) collapsed.weeks[wkKey] = false;

        const weekBox = document.createElement("div");
        weekBox.className = "treeItem";

        const wh = document.createElement("div");
        wh.className = "treeHdr";

        const wLeft = document.createElement("div");
        const dateLabel = week.start_date ? ` • starts ${escapeHtml(week.start_date)}` : "";
        wLeft.innerHTML = `
          <div class="treeTitle">${escapeHtml(week.label || week.week_id || `Week ${wIdx+1}`)}</div>
          <div class="treeMeta">Week${dateLabel}</div>
        `;

        const wBtn = document.createElement("button");
        wBtn.className = "iconBtn";
        wBtn.textContent = collapsed.weeks[wkKey] ? "+" : "−";
        wBtn.title = collapsed.weeks[wkKey] ? "Expand" : "Collapse";
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
            const item = document.createElement("button");
            item.className = "btn";
            item.style.width = "100%";
            item.style.textAlign = "left";
            item.textContent = lesson.title || `Lesson ${lIdx+1}`;
            item.onclick = () => {
              selected = { termIndex: tIdx, weekIndex: wIdx, lessonIndex: lIdx };
              renderLesson();
            };
            weekChildren.appendChild(item);
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

function renderLesson() {
  const lesson = getSelectedLesson();
  if (!lesson) {
    viewerEmpty.classList.remove("hidden");
    viewer.classList.add("hidden");
    return;
  }

  viewerEmpty.classList.add("hidden");
  viewer.classList.remove("hidden");

  const { term, week } = getSelectedContext();
  lessonTitle.textContent = lesson.title || "Lesson";
  lessonMeta.textContent = `${term?.label || term?.term_id || ""} • ${week?.label || week?.week_id || ""}${week?.start_date ? ` • week starts ${week.start_date}` : ""}`;

  // syllabus
  syllabusList.innerHTML = "";
  (lesson.syllabus_ids || []).forEach(id => {
    const s = syllabus.find(x => x.id === id);
    syllabusList.appendChild(renderSyllabusCard(id, s));
  });
  if ((lesson.syllabus_ids || []).length === 0) syllabusList.innerHTML = `<div class="info">No syllabus objectives attached.</div>`;

  // textbooks
  textbookList.innerHTML = "";
  (lesson.textbook_ids || []).forEach(id => {
    const tb = textbooks.find(x => x.id === id);
    textbookList.appendChild(renderTextbookCard(id, tb));
  });
  if ((lesson.textbook_ids || []).length === 0) textbookList.innerHTML = `<div class="info">No textbook references attached.</div>`;

  homeworkEl.textContent = lesson.homework?.trim() ? lesson.homework : "No homework set.";
  notesEl.innerHTML = escapeHtml(lesson.notes_latex || "").replaceAll("\n", "<br/>");

  typesetMath().catch(() => {});
}

function renderSyllabusCard(id, s) {
  const div = document.createElement("div");
  div.className = "item";

  const topic = s?.topic || "";
  const section = s?.section || "";
  const text = s?.text || "";

  div.innerHTML = `
    <div class="itemTop">
      <div>
        <div class="itemId">${escapeHtml(id)}</div>
        <div class="itemSub">${escapeHtml(section)} • ${escapeHtml(topic)}</div>
      </div>
    </div>
    <div class="itemText">${escapeHtml(text)}</div>
  `;
  return div;
}

function renderTextbookCard(id, tb) {
  const div = document.createElement("div");
  div.className = "item";

  const label = tb?.label || "";
  const book = tb?.textbook || "";
  const detail = tb?.detail || "";
  const url = tb?.url || "";

  div.innerHTML = `
    <div class="itemTop">
      <div>
        <div class="itemId">${escapeHtml(id)}</div>
        <div class="itemSub">${escapeHtml(book)} • ${escapeHtml(label)}</div>
      </div>
      ${url ? `<div><a href="${escapeAttr(url)}" target="_blank" rel="noopener">Open</a></div>` : ""}
    </div>
    <div class="itemText">${escapeHtml(detail)}</div>
  `;
  return div;
}

// ---- "This week" auto-open ----
function openThisWeek(forceSelect) {
  const today = startOfLocalDay(new Date());
  const hit = findWeekContainingDate(today);

  if (!hit) {
    if (forceSelect) setStatus("No week found for today (missing start_date).", "error");
    return;
  }

  // expand term/week to show it
  collapsed.terms[String(hit.tIdx)] = false;
  collapsed.weeks[`${hit.tIdx}-${hit.wIdx}`] = false;

  // select first lesson in that week if available
  const week = plan.terms[hit.tIdx].weeks[hit.wIdx];
  const hasLesson = (week.lessons || []).length > 0;

  if (hasLesson) {
    selected = { termIndex: hit.tIdx, weekIndex: hit.wIdx, lessonIndex: 0 };
  } else {
    selected = { termIndex: hit.tIdx, weekIndex: hit.wIdx, lessonIndex: null };
  }

  renderTree();
  renderLesson();

  if (forceSelect) {
    setStatus(`Opened: ${plan.terms[hit.tIdx].label || "Term"} / ${week.label || "Week"} (this week).`, "ok");
    setTimeout(clearStatus, 1800);
  }
}

function findWeekContainingDate(dateLocalDay) {
  if (!plan?.terms) return null;

  for (let tIdx = 0; tIdx < plan.terms.length; tIdx++) {
    const term = plan.terms[tIdx];
    const weeks = term.weeks || [];
    for (let wIdx = 0; wIdx < weeks.length; wIdx++) {
      const w = weeks[wIdx];
      if (!w.start_date) continue;

      const start = parseISODateLocal(w.start_date);
      if (!start) continue;

      const end = addDays(start, 7);
      if (dateLocalDay >= start && dateLocalDay < end) return { tIdx, wIdx };
    }
  }
  return null;
}

// ---- selection helpers ----
function getSelectedContext() {
  const term = (plan?.terms || [])[selected.termIndex] || null;
  const week = (term?.weeks || [])[selected.weekIndex] || null;
  return { term, week };
}
function getSelectedLesson() {
  const { week } = getSelectedContext();
  if (!week) return null;
  if (selected.lessonIndex === null) return null;
  return (week.lessons || [])[selected.lessonIndex] || null;
}

// ---- util ----
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
  try {
    if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise();
  } catch {}
}

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
function escapeAttr(s){ return escapeHtml(s); }

function startOfLocalDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function parseISODateLocal(iso){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, da = Number(m[3]);
  return new Date(y, mo, da);
}
function addDays(d, n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function formatDateLocal(d){
  return d.toLocaleDateString(undefined, { weekday:"long", year:"numeric", month:"short", day:"numeric" });
}
