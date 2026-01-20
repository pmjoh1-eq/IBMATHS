
// Milestone 2 Teacher Editor
// - Loads syllabus_objectives.json + textbook_references.json
// - Loads selected plan json
// - Lets you edit lessons + attach IDs
// - Download JSON OR commit via GitHub Contents API
//
// No frameworks. Works on GitHub Pages and locally.

const treeEl = document.getElementById("tree");
const statusEl = document.getElementById("status");

const classSelect = document.getElementById("classSelect");

const downloadBtn = document.getElementById("downloadBtn");
const commitBtn = document.getElementById("commitBtn");

const addWeekBtn = document.getElementById("addWeekBtn");
const addLessonBtn = document.getElementById("addLessonBtn");

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

const CLASSES = [
  "12AA_SL", "12AA_HL", "12AI_SL",
  "11AA_SL", "11AA_HL", "11AI_SL"
];

let repoRoot = "";
let syllabus = [];
let textbooks = [];
let plan = null;

// selection state
let selected = {
  termIndex: null,
  weekIndex: null,
  lessonIndex: null
};

init().catch(showError);

async function init() {
  repoRoot = getRepoRoot();
  hydrateGitHubFields();

  // populate classes
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

  classSelect.addEventListener("change", () => {
    loadPlanAndRender().catch(showError);
  });

  downloadBtn.addEventListener("click", () => downloadCurrentPlan());
  commitBtn.addEventListener("click", () => commitCurrentPlanToGitHub().catch(showError));

  saveGhBtn.addEventListener("click", () => {
    saveGitHubFields();
    setStatus("Saved GitHub settings locally.", "ok");
    setTimeout(clearStatus, 1500);
  });

  addWeekBtn.addEventListener("click", () => addWeekToSelectedTerm());
  addLessonBtn.addEventListener("click", () => addLessonToSelectedWeek());

  // editor actions
  applyLessonBtn.addEventListener("click", () => applyLessonEdits());
  moveUpBtn.addEventListener("click", () => moveLesson(-1));
  moveDownBtn.addEventListener("click", () => moveLesson(1));
  deleteLessonBtn.addEventListener("click", () => deleteLesson());

  previewMathBtn.addEventListener("click", async () => {
    notesPreview.innerHTML = escapeHtmlAllowLatex(lessonNotesEl.value || "");
    await typesetMath();
  });

  // search wiring
  syllabusSearch.addEventListener("input", () => renderSyllabusSearch());
  textbookSearch.addEventListener("input", () => renderTextbookSearch());

  await loadPlanAndRender();
}

async function loadPlanAndRender() {
  const classId = classSelect.value || CLASSES[0];
  classSelect.value = classId;

  resetSelection();

  setStatus(`Loading plan: ${classId}…`);
  const planUrl = new URL(`data/plans/${classId}.json`, repoRoot).toString();
  plan = await loadJSON(planUrl, `${classId}.json`);
  clearStatus();

  renderTree();
  renderEditor();
}

// ---------- Tree ----------
function renderTree() {
  treeEl.innerHTML = "";
  if (!plan) return;

  plan.terms = plan.terms || [];

  plan.terms.forEach((term, tIdx) => {
    const termBox = makeTreeItem("Term", term.label || term.term_id || `Term ${tIdx + 1}`, () => {
      selected.termIndex = tIdx;
      selected.weekIndex = null;
      selected.lessonIndex = null;
      renderTree();
      renderEditor();
    }, isTermSelected(tIdx));

    const termChildren = document.createElement("div");
    termChildren.className = "children";

    (term.weeks || []).forEach((week, wIdx) => {
      const weekBox = makeTreeItem("Week", week.label || week.week_id || `Week ${wIdx + 1}`, () => {
        selected.termIndex = tIdx;
        selected.weekIndex = wIdx;
        selected.lessonIndex = null;
        renderTree();
        renderEditor();
      }, isWeekSelected(tIdx, wIdx));

      const weekChildren = document.createElement("div");
      weekChildren.className = "children";

      (week.lessons || []).forEach((lesson, lIdx) => {
        const lessonBox = makeTreeItem("Lesson", lesson.title || lesson.lesson_id || `Lesson ${lIdx + 1}`, () => {
          selected.termIndex = tIdx;
          selected.weekIndex = wIdx;
          selected.lessonIndex = lIdx;
          renderTree();
          renderEditor();
        }, isLessonSelected(tIdx, wIdx, lIdx));

        weekChildren.appendChild(lessonBox);
      });

      weekBox.appendChild(weekChildren);
      termChildren.appendChild(weekBox);
    });

    termBox.appendChild(termChildren);
    treeEl.appendChild(termBox);
  });
}

function makeTreeItem(kind, name, onSelect, isSelected) {
  const box = document.createElement("div");
  box.className = "treeItem";
  box.style.outline = isSelected ? "2px solid #0b4f6c" : "none";

  const hdr = document.createElement("div");
  hdr.className = "hdr";

  const left = document.createElement("div");
  left.innerHTML = `<div class="name">${escapeHtml(name)}</div><div class="meta">${kind}</div>`;

  const btn = document.createElement("button");
  btn.className = "treeBtn";
  btn.textContent = isSelected ? "Selected" : "Select";
  btn.onclick = onSelect;

  hdr.appendChild(left);
  hdr.appendChild(btn);

  box.appendChild(hdr);
  return box;
}

function isTermSelected(tIdx) {
  return selected.termIndex === tIdx && selected.weekIndex === null && selected.lessonIndex === null;
}
function isWeekSelected(tIdx, wIdx) {
  return selected.termIndex === tIdx && selected.weekIndex === wIdx && selected.lessonIndex === null;
}
function isLessonSelected(tIdx, wIdx, lIdx) {
  return selected.termIndex === tIdx && selected.weekIndex === wIdx && selected.lessonIndex === lIdx;
}

function resetSelection() {
  selected.termIndex = 0;
  selected.weekIndex = 0;
  selected.lessonIndex = null;
}

// ---------- Add week / lesson ----------
function addWeekToSelectedTerm() {
  if (!plan) return;

  const tIdx = selected.termIndex ?? 0;
  const term = plan.terms[tIdx];
  if (!term) return;

  term.weeks = term.weeks || [];
  const next = term.weeks.length + 1;

  term.weeks.push({
    week_id: `${term.term_id || `T${tIdx + 1}`}-W${next}`,
    label: `Week ${next}`,
    lessons: []
  });

  selected.weekIndex = term.weeks.length - 1;
  selected.lessonIndex = null;

  renderTree();
  renderEditor();
}

function addLessonToSelectedWeek() {
  if (!plan) return;
  const { termIndex: tIdx, weekIndex: wIdx } = selected;

  const term = plan.terms[tIdx ?? 0];
  if (!term) return;
  const week = (term.weeks || [])[wIdx ?? 0];
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
  if (!plan) return;

  const lesson = getSelectedLesson();
  if (!lesson) {
    editorEmpty.classList.remove("hidden");
    editorForm.classList.add("hidden");
    return;
  }

  editorEmpty.classList.add("hidden");
  editorForm.classList.remove("hidden");

  // populate fields
  lessonTitleEl.value = lesson.title || "";
  lessonHomeworkEl.value = lesson.homework || "";
  lessonNotesEl.value = lesson.notes_latex || "";
  notesPreview.innerHTML = "";

  // selected chips
  renderSelectedChips();

  // search results
  renderSyllabusSearch();
  renderTextbookSearch();
}

function applyLessonEdits() {
  const lesson = getSelectedLesson();
  if (!lesson) return;

  lesson.title = lessonTitleEl.value || "";
  lesson.homework = lessonHomeworkEl.value || "";
  lesson.notes_latex = lessonNotesEl.value || "";

  setStatus("Applied lesson changes (not saved to GitHub yet).", "ok");
  setTimeout(clearStatus, 1200);

  renderTree();
}

function moveLesson(delta) {
  const { termIndex: tIdx, weekIndex: wIdx, lessonIndex: lIdx } = selected;
  if (lIdx === null) return;

  const week = getSelectedWeek();
  if (!week) return;

  const arr = week.lessons || [];
  const newIdx = lIdx + delta;
  if (newIdx < 0 || newIdx >= arr.length) return;

  const tmp = arr[lIdx];
  arr[lIdx] = arr[newIdx];
  arr[newIdx] = tmp;

  selected.lessonIndex = newIdx;
  renderTree();
  renderEditor();
}

function deleteLesson() {
  const week = getSelectedWeek();
  if (!week) return;

  const lIdx = selected.lessonIndex;
  if (lIdx === null) return;

  week.lessons.splice(lIdx, 1);
  selected.lessonIndex = null;

  renderTree();
  renderEditor();
}

// ---------- Selection getters ----------
function getSelectedTerm() {
  const tIdx = selected.termIndex ?? 0;
  return (plan?.terms || [])[tIdx] || null;
}
function getSelectedWeek() {
  const term = getSelectedTerm();
  if (!term) return null;
  const wIdx = selected.weekIndex ?? 0;
  return (term.weeks || [])[wIdx] || null;
}
function getSelectedLesson() {
  const week = getSelectedWeek();
  if (!week) return null;
  const lIdx = selected.lessonIndex;
  if (lIdx === null) return null;
  return (week.lessons || [])[lIdx] || null;
}

// ---------- Syllabus + Textbook selection ----------
function renderSyllabusSearch() {
  const q = (syllabusSearch.value || "").trim().toLowerCase();
  const lesson = getSelectedLesson();
  if (!lesson) return;

  const items = syllabus
    .filter(x => {
      if (!q) return true;
      return `${x.id} ${x.section} ${x.topic} ${x.text}`.toLowerCase().includes(q);
    })
    .slice(0, 60);

  syllabusResults.innerHTML = "";
  for (const s of items) {
    const row = document.createElement("div");
    row.className = "result";

    const left = document.createElement("div");
    left.className = "text";
    left.innerHTML = `<div><strong>${escapeHtml(s.id)}</strong> <span class="sub">${escapeHtml(s.section || "")}</span></div>
                      <div class="sub">${escapeHtml(s.topic || "")}</div>`;

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

function renderTextbookSearch() {
  const q = (textbookSearch.value || "").trim().toLowerCase();
  const lesson = getSelectedLesson();
  if (!lesson) return;

  const items = textbooks
    .filter(x => {
      if (!q) return true;
      return `${x.id} ${x.textbook} ${x.label} ${x.detail}`.toLowerCase().includes(q);
    })
    .slice(0, 60);

  textbookResults.innerHTML = "";
  for (const tb of items) {
    const row = document.createElement("div");
    row.className = "result";

    const left = document.createElement("div");
    left.className = "text";
    left.innerHTML = `<div><strong>${escapeHtml(tb.id)}</strong> <span class="sub">${escapeHtml(tb.textbook || "")}</span></div>
                      <div class="sub">${escapeHtml(tb.label || "")}</div>`;

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

  // syllabus chips
  syllabusSelected.innerHTML = "";
  (lesson.syllabus_ids || []).forEach(id => {
    const chip = makeChip(id, () => {
      lesson.syllabus_ids = (lesson.syllabus_ids || []).filter(x => x !== id);
      renderSelectedChips();
    });
    syllabusSelected.appendChild(chip);
  });

  // textbook chips
  textbookSelected.innerHTML = "";
  (lesson.textbook_ids || []).forEach(id => {
    const chip = makeChip(id, () => {
      lesson.textbook_ids = (lesson.textbook_ids || []).filter(x => x !== id);
      renderSelectedChips();
    });
    textbookSelected.appendChild(chip);
  });

  // refresh math if preview was shown
  typesetMath().catch(() => {});
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

  // GET existing file to obtain sha (required for updates)
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const existing = await ghRequest(getUrl, token);

  const sha = existing.sha;
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(plan, null, 2))));

  setStatus(`Committing update to ${path} on ${branch}…`);

  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body = {
    message: `Update plan: ${classId}`,
    content,
    sha,
    branch
  };

  const res = await ghRequest(putUrl, token, "PUT", body);
  setStatus(`Committed successfully.\n${res?.commit?.sha ? "Commit: " + res.commit.sha : ""}`, "ok");
}

async function ghRequest(url, token, method = "GET", body = null) {
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
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = json?.message || res.statusText || "GitHub API error";
    throw new Error(`GitHub API error (${res.status}): ${msg}\nURL: ${url}`);
  }
  return json;
}

// ---------- Helpers ----------
async function loadJSON(url, labelForErrors) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${labelForErrors}: ${res.status} ${res.statusText}\nURL: ${url}`);
  return await res.json();
}

function getRepoRoot() {
  const path = window.location.pathname;
  const idx = path.lastIndexOf("/teacher/");
  if (idx >= 0) return window.location.origin + path.slice(0, idx + 1);
  const url = new URL(".", window.location.href);
  return url.toString();
}

function setStatus(msg, kind = "info") {
  statusEl.hidden = false;
  statusEl.className = "status" + (kind === "error" ? " error" : kind === "ok" ? " ok" : "");
  statusEl.textContent = msg;
}
function clearStatus() {
  statusEl.hidden = true;
  statusEl.textContent = "";
}

function showError(err) {
  console.error(err);
  setStatus(err?.message ? err.message : String(err), "error");
}

async function typesetMath() {
  try {
    if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
      await window.MathJax.typesetPromise();
    }
  } catch (e) {
    // keep functional even if MathJax fails
  }
}

function hydrateGitHubFields() {
  const saved = safeParse(localStorage.getItem("planner_github") || "{}");
  ghOwnerEl.value = saved.owner || "";
  ghRepoEl.value = saved.repo || "";
  ghBranchEl.value = saved.branch || "main";
  ghTokenEl.value = saved.token || "";
}

function saveGitHubFields() {
  const payload = {
    owner: (ghOwnerEl.value || "").trim(),
    repo: (ghRepoEl.value || "").trim(),
    branch: (ghBranchEl.value || "main").trim(),
    token: (ghTokenEl.value || "").trim()
  };
  localStorage.setItem("planner_github", JSON.stringify(payload));
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return {}; }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAllowLatex(s) {
  // same as escapeHtml (LaTeX is plain text). We are not allowing HTML tags.
  return escapeHtml(s);
}
