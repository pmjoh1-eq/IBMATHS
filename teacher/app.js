// Teacher Editor: default-collapsed tree + topic/textbook filter buttons

const treeEl = document.getElementById("tree");
const statusEl = document.getElementById("status");

const classSelect = document.getElementById("classSelect");
const downloadBtn = document.getElementById("downloadBtn");
const commitBtn = document.getElementById("commitBtn");

const addWeekBtn = document.getElementById("addWeekBtn");
const addLessonBtn = document.getElementById("addLessonBtn");

const weekStartDateEl = document.getElementById("weekStartDate");
const applyWeekBtn = document.getElementById("applyWeekBtn");

const ghOwnerEl = document.getElementById("ghOwner");
const ghRepoEl = document.getElementById("ghRepo");
const ghBranchEl = document.getElementById("ghBranch");
const ghTokenEl = document.getElementById("ghToken");
const saveGhBtn = document.getElementById("saveGhBtn");

const editorEmpty = document.getElementById("editorEmpty");
const editorForm = document.getElementById("editorForm");

const lessonTitleEl = document.getElementById("lessonTitle");
const lessonHomeworkEl = document.getElementById("lessonHomework");
const lessonNotesEl = document.getElementById("lessonNotes");
const previewMathBtn = document.getElementById("previewMathBtn");
const notesPreview = document.getElementById("notesPreview");

const moveUpBtn = document.getElementById("moveUpBtn");
const moveDownBtn = document.getElementById("moveDownBtn");
const deleteLessonBtn = document.getElementById("deleteLessonBtn");
const applyLessonBtn = document.getElementById("applyLessonBtn");

const syllabusSearch = document.getElementById("syllabusSearch");
const syllabusResults = document.getElementById("syllabusResults");
const syllabusSelected = document.getElementById("syllabusSelected");

const textbookSearch = document.getElementById("textbookSearch");
const textbookResults = document.getElementById("textbookResults");
const textbookSelected = document.getElementById("textbookSelected");

const CLASSES = ["12AA_SL","12AA_HL","12AI_SL","11AA_SL","11AA_HL","11AI_SL"];

// --- NEW: filter button containers (injected under search bars)
let syllabusFilterBar = null;
let textbookFilterBar = null;

// Canonical IB topic buckets
const TOPIC_BUCKETS = [
  { key: "Number and Algebra", match: ["number", "algebra"] },
  { key: "Functions", match: ["function"] },
  { key: "Geometry and Trigonometry", match: ["geometry", "trigonometry"] },
  { key: "Statistics and Probability", match: ["statistics", "probability"] },
  { key: "Calculus", match: ["calculus"] },
];

let repoRoot = "";
let syllabus = [];
let textbooks = [];
let plan = null;

let selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };

// Default collapsed: everything starts collapsed
let collapsed = {
  terms: {}, // tIdx -> bool
  weeks: {}  // `${tIdx}-${wIdx}` -> bool
};

// Active filters
let activeSyllabusBucket = TOPIC_BUCKETS[0].key; // default first bucket
let activeTextbookKey = null; // set after load based on available textbooks

init().catch(showError);

async function init() {
  repoRoot = getRepoRoot();
  hydrateGitHubFields();

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

  // Build filter bars
  injectFilterBars();

  // Default textbook filter = first textbook group encountered
  const tbKeys = getTextbookKeys();
  activeTextbookKey = tbKeys[0] || null;
  renderTextbookFilterButtons();

  classSelect.addEventListener("change", () => loadPlanAndRender().catch(showError));
  downloadBtn.addEventListener("click", () => downloadCurrentPlan());
  commitBtn.addEventListener("click", () => commitCurrentPlanToGitHub().catch(showError));

  saveGhBtn.addEventListener("click", () => {
    saveGitHubFields();
    setStatus("Saved GitHub settings locally.", "ok");
    setTimeout(clearStatus, 1200);
  });

  addWeekBtn.addEventListener("click", () => addWeekToSelectedTerm());
  addLessonBtn.addEventListener("click", () => addLessonToSelectedWeek());

  applyWeekBtn.addEventListener("click", () => applyWeekStartDate());

  applyLessonBtn.addEventListener("click", () => applyLessonEdits());
  moveUpBtn.addEventListener("click", () => moveLesson(-1));
  moveDownBtn.addEventListener("click", () => moveLesson(1));
  deleteLessonBtn.addEventListener("click", () => deleteLesson());

  previewMathBtn.addEventListener("click", async () => {
    notesPreview.innerHTML = escapeHtml(lessonNotesEl.value || "").replaceAll("\n","<br/>");
    await typesetMath();
  });

  syllabusSearch.addEventListener("input", () => renderSyllabusSearch());
  textbookSearch.addEventListener("input", () => renderTextbookSearch());

  await loadPlanAndRender();
}

async function loadPlanAndRender() {
  const classId = classSelect.value || CLASSES[0];
  classSelect.value = classId;

  setStatus(`Loading plan: ${classId}…`);
  plan = await loadJSON(new URL(`data/plans/${classId}.json`, repoRoot).toString(), `${classId}.json`);
  clearStatus();

  selected = { termIndex: 0, weekIndex: 0, lessonIndex: null };

  // Reset collapse state for a new plan (default everything collapsed)
  collapsed = { terms: {}, weeks: {} };

  renderTree();
  renderWeekEditor();
  renderEditor();
}

// ---------- Tree (default collapsed) ----------
function renderTree() {
  treeEl.innerHTML = "";
  if (!plan?.terms) return;

  plan.terms.forEach((term, tIdx) => {
    const termKey = String(tIdx);
    if (collapsed.terms[termKey] === undefined) collapsed.terms[termKey] = true; // default collapsed

    const termBox = document.createElement("div");
    termBox.className = "treeItem";

    const hdr = document.createElement("div");
    hdr.className = "treeHdr";

    const left = document.createElement("div");
    left.innerHTML = `<div class="treeTitle">${escapeHtml(term.label || term.term_id || `Term ${tIdx+1}`)}</div>
                      <div class="treeMeta">Term</div>`;
    left.style.cursor = "pointer";
    left.onclick = () => {
      selected.termIndex = tIdx;
      selected.weekIndex = 0;
      selected.lessonIndex = null;

      // Expand just this term when selected (keeps "starts collapsed" behaviour)
      collapsed.terms[termKey] = false;

      renderTree(); renderWeekEditor(); renderEditor();
    };

    const btn = document.createElement("button");
    btn.className = "iconBtn";
    btn.textContent = collapsed.terms[termKey] ? "+" : "−";
    btn.title = collapsed.terms[termKey] ? "Expand" : "Collapse";
    btn.onclick = () => { collapsed.terms[termKey] = !collapsed.terms[termKey]; renderTree(); };

    hdr.appendChild(left);
    hdr.appendChild(btn);
    termBox.appendChild(hdr);

    if (!collapsed.terms[termKey]) {
      const termChildren = document.createElement("div");
      termChildren.className = "treeChildren";

      (term.weeks || []).forEach((week, wIdx) => {
        const wkKey = `${tIdx}-${wIdx}`;
        if (collapsed.weeks[wkKey] === undefined) collapsed.weeks[wkKey] = true; // default collapsed

        const weekBox = document.createElement("div");
        weekBox.className = "treeItem";

        const wh = document.createElement("div");
        wh.className = "treeHdr";

        const wLeft = document.createElement("div");
        const dateLabel = week.start_date ? ` • starts ${escapeHtml(week.start_date)}` : "";
        wLeft.innerHTML = `<div class="treeTitle">${escapeHtml(week.label || week.week_id || `Week ${wIdx+1}`)}</div>
                           <div class="treeMeta">Week${dateLabel}</div>`;
        wLeft.style.cursor = "pointer";
        wLeft.onclick = () => {
          selected.termIndex = tIdx;
          selected.weekIndex = wIdx;
          selected.lessonIndex = null;

          // Expand this week when selected
          collapsed.terms[String(tIdx)] = false;
          collapsed.weeks[wkKey] = false;

          renderTree(); renderWeekEditor(); renderEditor();
        };

        const wBtn = document.createElement("button");
        wBtn.className = "iconBtn";
        wBtn.textContent = collapsed.weeks[wkKey] ? "+" : "−";
        wBtn.title = collapsed.weeks[wkKey] ? "Expand" : "Collapse";
        wBtn.onclick = () => { collapsed.weeks[wkKey] = !collapsed.weeks[wkKey]; renderTree(); };

        wh.appendChild(wLeft);
        wh.appendChild(wBtn);
        weekBox.appendChild(wh);

        if (!collapsed.weeks[wkKey]) {
          const weekChildren = document.createElement("div");
          weekChildren.className = "treeChildren";

          (week.lessons || []).forEach((lesson, lIdx) => {
            const btnLesson = document.createElement("button");
            btnLesson.className = "btn";
            btnLesson.style.width = "100%";
            btnLesson.style.textAlign = "left";
            btnLesson.textContent = lesson.title || `Lesson ${lIdx+1}`;
            btnLesson.onclick = () => {
              selected.termIndex = tIdx;
              selected.weekIndex = wIdx;
              selected.lessonIndex = lIdx;
              // Keep current expand state; selecting lesson shouldn't auto-expand anything else
              renderWeekEditor();
              renderEditor();
            };
            weekChildren.appendChild(btnLesson);
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

// ---------- Week editor ----------
function renderWeekEditor() {
  const week = getSelectedWeek();
  weekStartDateEl.value = week?.start_date || "";
}

function applyWeekStartDate() {
  const week = getSelectedWeek();
  if (!week) return;

  const v = (weekStartDateEl.value || "").trim();
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    setStatus("Week start date must be YYYY-MM-DD.", "error");
    return;
  }
  week.start_date = v || undefined;

  setStatus("Applied week date (not committed yet).", "ok");
  setTimeout(clearStatus, 1200);

  renderTree();
}

// ---------- Add week / lesson ----------
function addWeekToSelectedTerm() {
  const term = getSelectedTerm();
  if (!term) return;

  term.weeks = term.weeks || [];
  const next = term.weeks.length + 1;

  term.weeks.push({
    week_id: `${term.term_id || `T${selected.termIndex+1}`}-W${next}`,
    label: `Week ${next}`,
    start_date: "",
    lessons: []
  });

  selected.weekIndex = term.weeks.length - 1;
  selected.lessonIndex = null;

  // Expand selected path
  collapsed.terms[String(selected.termIndex)] = false;
  collapsed.weeks[`${selected.termIndex}-${selected.weekIndex}`] = false;

  renderTree();
  renderWeekEditor();
  renderEditor();
}

function addLessonToSelectedWeek() {
  const week = getSelectedWeek();
  if (!week) return;

  week.lessons = week.lessons || [];
  const next = week.lessons.length + 1;

  week.lessons.push({
    lesson_id: `L${next}`,
    title: `New Lesson ${next}`,
    syllabus_ids: [],
    textbook_ids: [],
    homework: "",
    notes_latex: ""
  });

  selected.lessonIndex = week.lessons.length - 1;

  renderTree();
  renderEditor();
}

// ---------- Editor ----------
function renderEditor() {
  const lesson = getSelectedLesson();
  if (!lesson) {
    editorEmpty.classList.remove("hidden");
    editorForm.classList.add("hidden");
    return;
  }

  editorEmpty.classList.add("hidden");
  editorForm.classList.remove("hidden");

  lessonTitleEl.value = lesson.title || "";
  lessonHomeworkEl.value = lesson.homework || "";
  lessonNotesEl.value = lesson.notes_latex || "";
  notesPreview.innerHTML = "";

  renderSelectedChips();
  renderSyllabusSearch();
  renderTextbookSearch();
}

function applyLessonEdits() {
  const lesson = getSelectedLesson();
  if (!lesson) return;

  lesson.title = lessonTitleEl.value || "";
  lesson.homework = lessonHomeworkEl.value || "";
  lesson.notes_latex = lessonNotesEl.value || "";

  setStatus("Applied lesson changes (not committed yet).", "ok");
  setTimeout(clearStatus, 1200);

  renderTree();
}

function moveLesson(delta) {
  const week = getSelectedWeek();
  if (!week || selected.lessonIndex === null) return;

  const arr = week.lessons || [];
  const lIdx = selected.lessonIndex;
  const newIdx = lIdx + delta;
  if (newIdx < 0 || newIdx >= arr.length) return;

  [arr[lIdx], arr[newIdx]] = [arr[newIdx], arr[lIdx]];
  selected.lessonIndex = newIdx;

  renderTree();
  renderEditor();
}

function deleteLesson() {
  const week = getSelectedWeek();
  if (!week || selected.lessonIndex === null) return;

  week.lessons.splice(selected.lessonIndex, 1);
  selected.lessonIndex = null;

  renderTree();
  renderEditor();
}

// ---------- NEW: Filter bars ----------
function injectFilterBars() {
  // Syllabus filter bar
  syllabusFilterBar = document.createElement("div");
  syllabusFilterBar.className = "filterBar";
  syllabusSearch.insertAdjacentElement("afterend", syllabusFilterBar);
  renderSyllabusFilterButtons();

  // Textbook filter bar
  textbookFilterBar = document.createElement("div");
  textbookFilterBar.className = "filterBar";
  textbookSearch.insertAdjacentElement("afterend", textbookFilterBar);
  renderTextbookFilterButtons();
}

function renderSyllabusFilterButtons() {
  syllabusFilterBar.innerHTML = "";
  for (const b of TOPIC_BUCKETS) {
    const btn = document.createElement("button");
    btn.className = "filterBtn" + (activeSyllabusBucket === b.key ? " active" : "");
    btn.textContent = b.key;
    btn.onclick = () => {
      activeSyllabusBucket = b.key;
      renderSyllabusFilterButtons();
      renderSyllabusSearch();
    };
    syllabusFilterBar.appendChild(btn);
  }
}

function getTextbookKeys() {
  const keys = [...new Set(textbooks.map(t => (t.textbook || "").trim()).filter(Boolean))];
  keys.sort((a,b)=>a.localeCompare(b));
  return keys;
}

function renderTextbookFilterButtons() {
  const keys = getTextbookKeys();
  if (!activeTextbookKey) activeTextbookKey = keys[0] || null;

  textbookFilterBar.innerHTML = "";
  for (const k of keys) {
    const btn = document.createElement("button");
    btn.className = "filterBtn" + (activeTextbookKey === k ? " active" : "");
    btn.textContent = k;
    btn.onclick = () => {
      activeTextbookKey = k;
      renderTextbookFilterButtons();
      renderTextbookSearch();
    };
    textbookFilterBar.appendChild(btn);
  }
}

// ---------- Syllabus + Textbook listing (filtered) ----------
function renderSyllabusSearch() {
  const q = (syllabusSearch.value || "").trim().toLowerCase();
  const lesson = getSelectedLesson();
  if (!lesson) { syllabusResults.innerHTML = ""; return; }

  const bucket = TOPIC_BUCKETS.find(b => b.key === activeSyllabusBucket);

  const items = syllabus
    .filter(s => inSyllabusBucket(s, bucket))
    .filter(s => !q || `${s.id} ${s.section} ${s.topic} ${s.text}`.toLowerCase().includes(q))
    .slice(0, 80);

  syllabusResults.innerHTML = "";
  for (const s of items) {
    const row = document.createElement("div");
    row.className = "result";

    const left = document.createElement("div");
    left.className = "text";
    left.innerHTML = `
      <div><strong>${escapeHtml(s.id)}</strong> <span class="sub">${escapeHtml(s.section || "")}</span></div>
      <div class="sub">${escapeHtml(s.topic || "")}</div>
      <div class="sub">${escapeHtml(trunc(s.text || "", 170))}</div>
    `;

    const btn = document.createElement("button");
    btn.className = "treeBtn";
    btn.textContent = "Add";
    btn.onclick = () => {
      lesson.syllabus_ids = lesson.syllabus_ids || [];
      if (!lesson.syllabus_ids.includes(s.id)) lesson.syllabus_ids.push(s.id);
      renderSelectedChips();
    };

    row.appendChild(left);
    row.appendChild(btn);
    syllabusResults.appendChild(row);
  }
}

function inSyllabusBucket(s, bucket) {
  if (!bucket) return true;
  const hay = `${s.topic || ""} ${s.section || ""}`.toLowerCase();
  return bucket.match.some(m => hay.includes(m));
}

function renderTextbookSearch() {
  const q = (textbookSearch.value || "").trim().toLowerCase();
  const lesson = getSelectedLesson();
  if (!lesson) { textbookResults.innerHTML = ""; return; }

  const items = textbooks
    .filter(tb => !activeTextbookKey || (tb.textbook || "").trim() === activeTextbookKey)
    .filter(tb => !q || `${tb.id} ${tb.textbook} ${tb.label} ${tb.detail}`.toLowerCase().includes(q))
    .slice(0, 120);

  textbookResults.innerHTML = "";
  for (const tb of items) {
    const row = document.createElement("div");
    row.className = "result";

    const left = document.createElement("div");
    left.className = "text";
    left.innerHTML = `
      <div><strong>${escapeHtml(tb.id)}</strong> <span class="sub">${escapeHtml(tb.textbook || "")}</span></div>
      <div class="sub">${escapeHtml(tb.label || "")}</div>
      <div class="sub">${escapeHtml(trunc(tb.detail || "", 170))}</div>
    `;

    const btn = document.createElement("button");
    btn.className = "treeBtn";
    btn.textContent = "Add";
    btn.onclick = () => {
      lesson.textbook_ids = lesson.textbook_ids || [];
      if (!lesson.textbook_ids.includes(tb.id)) lesson.textbook_ids.push(tb.id);
      renderSelectedChips();
    };

    row.appendChild(left);
    row.appendChild(btn);
    textbookResults.appendChild(row);
  }
}

function renderSelectedChips() {
  const lesson = getSelectedLesson();
  if (!lesson) return;

  syllabusSelected.innerHTML = "";
  (lesson.syllabus_ids || []).forEach(id => {
    syllabusSelected.appendChild(makeChip(id, () => {
      lesson.syllabus_ids = (lesson.syllabus_ids || []).filter(x => x !== id);
      renderSelectedChips();
    }));
  });

  textbookSelected.innerHTML = "";
  (lesson.textbook_ids || []).forEach(id => {
    textbookSelected.appendChild(makeChip(id, () => {
      lesson.textbook_ids = (lesson.textbook_ids || []).filter(x => x !== id);
      renderSelectedChips();
    }));
  });

  typesetMath().catch(()=>{});
}

function makeChip(id, onRemove) {
  const div = document.createElement("div");
  div.className = "chip";
  div.innerHTML = `<code>${escapeHtml(id)}</code>`;
  const btn = document.createElement("button");
  btn.textContent = "×";
  btn.onclick = onRemove;
  div.appendChild(btn);
  return div;
}

// ---------- Download ----------
function downloadCurrentPlan() {
  if (!plan) return;
  const classId = plan.class_id || classSelect.value || "plan";
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${classId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus("Downloaded plan JSON.", "ok");
  setTimeout(clearStatus, 1200);
}

// ---------- GitHub Commit ----------
async function commitCurrentPlanToGitHub() {
  if (!plan) return;

  const owner = (ghOwnerEl.value || "").trim();
  const repo = (ghRepoEl.value || "").trim();
  const branch = (ghBranchEl.value || "main").trim();
  const token = (ghTokenEl.value || "").trim();

  if (!owner || !repo || !branch || !token) {
    throw new Error("Missing GitHub settings. Fill owner/repo/branch/token and click 'Save GitHub Settings'.");
  }

  const classId = plan.class_id || classSelect.value;
  const path = `data/plans/${classId}.json`;

  setStatus(`Fetching current SHA for ${path}…`);

  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const existing = await ghRequest(getUrl, token);

  const sha = existing.sha;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(plan, null, 2))));

  setStatus(`Committing update to ${path} on ${branch}…`);

  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = { message: `Update plan: ${classId}`, content, sha, branch };

  const res = await ghRequest(putUrl, token, "PUT", body);
  setStatus(`Committed successfully.\n${res?.commit?.sha ? "Commit: " + res.commit.sha : ""}`, "ok");
}

async function ghRequest(url, token, method="GET", body=null) {
  const res = await fetch(url, {
    method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : null
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = json?.message || res.statusText || "GitHub API error";
    throw new Error(`GitHub API error (${res.status}): ${msg}\nURL: ${url}`);
  }
  return json;
}

// ---------- Selection getters ----------
function getSelectedTerm() {
  return (plan?.terms || [])[selected.termIndex] || null;
}
function getSelectedWeek() {
  const term = getSelectedTerm();
  return (term?.weeks || [])[selected.weekIndex] || null;
}
function getSelectedLesson() {
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
  const idx = path.lastIndexOf("/teacher/");
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

function hydrateGitHubFields(){
  const saved = safeParse(localStorage.getItem("planner_github") || "{}");
  ghOwnerEl.value = saved.owner || "";
  ghRepoEl.value = saved.repo || "";
  ghBranchEl.value = saved.branch || "main";
  ghTokenEl.value = saved.token || "";
}
function saveGitHubFields(){
  const payload = {
    owner: (ghOwnerEl.value||"").trim(),
    repo: (ghRepoEl.value||"").trim(),
    branch: (ghBranchEl.value||"main").trim(),
    token: (ghTokenEl.value||"").trim()
  };
  localStorage.setItem("planner_github", JSON.stringify(payload));
}
function safeParse(s){ try { return JSON.parse(s); } catch { return {}; } }

function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
function trunc(s, n){
  const t = String(s);
  return t.length <= n ? t : t.slice(0, n-1) + "…";
}
