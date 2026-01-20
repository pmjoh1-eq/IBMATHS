const CLASSES = ["12AA_SL","12AA_HL","12AI_SL","11AA_SL","11AA_HL","11AI_SL"];

const classSelect = document.getElementById("classSelect");
const searchEl = document.getElementById("search");

const statusEl = document.getElementById("status");
const totalCount = document.getElementById("totalCount");
const scheduledCount = document.getElementById("scheduledCount");
const unscheduledCount = document.getElementById("unscheduledCount");
const listEl = document.getElementById("list");

let repoRoot = "";
let syllabus = [];
let plan = null;
let scheduledSet = new Set();

init().catch(showError);

async function init(){
  repoRoot = getRepoRoot();

  classSelect.innerHTML = "";
  for (const c of CLASSES){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    classSelect.appendChild(opt);
  }

  setStatus("Loading syllabus…");
  syllabus = await loadJSON(new URL("data/syllabus_objectives.json", repoRoot).toString(), "syllabus_objectives.json");
  clearStatus();

  classSelect.addEventListener("change", () => loadPlanAndRender().catch(showError));
  searchEl.addEventListener("input", () => render());

  await loadPlanAndRender();
}

async function loadPlanAndRender(){
  const classId = classSelect.value || CLASSES[0];
  classSelect.value = classId;

  setStatus(`Loading plan: ${classId}…`);
  plan = await loadJSON(new URL(`data/plans/${classId}.json`, repoRoot).toString(), `${classId}.json`);
  clearStatus();

  scheduledSet = collectScheduledIds(plan);
  render();
}

function collectScheduledIds(plan){
  const set = new Set();
  for (const term of (plan?.terms || [])){
    for (const week of (term.weeks || [])){
      for (const lesson of (week.lessons || [])){
        for (const id of (lesson.syllabus_ids || [])) set.add(id);
      }
    }
  }
  return set;
}

function render(){
  const q = (searchEl.value || "").trim().toLowerCase();

  const total = syllabus.length;
  const scheduled = scheduledSet.size;

  const unscheduled = syllabus.filter(s => !scheduledSet.has(s.id))
    .filter(s => {
      if (!q) return true;
      return `${s.id} ${s.section} ${s.topic} ${s.text}`.toLowerCase().includes(q);
    });

  totalCount.textContent = String(total);
  scheduledCount.textContent = String(scheduled);
  unscheduledCount.textContent = String(unscheduled.length);

  listEl.innerHTML = "";

  if (unscheduled.length === 0){
    listEl.innerHTML = `<div class="info">All objectives are scheduled (or your filter removed them).</div>`;
    return;
  }

  // group by topic for readability
  const groups = groupBy(unscheduled, s => s.topic || "Other");
  for (const [topic, items] of groups){
    const header = document.createElement("div");
    header.className = "info";
    header.style.fontWeight = "900";
    header.textContent = `${topic} (${items.length})`;
    listEl.appendChild(header);

    for (const s of items){
      const card = document.createElement("div");
      card.className = "item";
      card.innerHTML = `
        <div class="itemTop">
          <div>
            <div class="itemId">${escapeHtml(s.id)}</div>
            <div class="itemSub">${escapeHtml(s.section || "")}</div>
          </div>
        </div>
        <div class="itemText">${escapeHtml(s.text || "")}</div>
      `;
      listEl.appendChild(card);
    }
  }
}

function groupBy(arr, keyFn){
  const map = new Map();
  for (const x of arr){
    const k = keyFn(x);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(x);
  }
  return map;
}

// ---- util ----
async function loadJSON(url, label){
  const res = await fetch(url, { cache:"no-store" });
  if (!res.ok) throw new Error(`Failed to load ${label}: ${res.status} ${res.statusText}\nURL: ${url}`);
  return await res.json();
}
function getRepoRoot(){
  const path = window.location.pathname;
  const idx = path.lastIndexOf("/coverage/");
  if (idx >= 0) return window.location.origin + path.slice(0, idx + 1);
  const url = new URL(".", window.location.href);
  return url.toString();
}
function setStatus(msg, kind="info"){
  statusEl.hidden = false;
  statusEl.className = "status" + (kind==="error" ? " error" : kind==="ok" ? " ok" : "");
  statusEl.textContent = msg;
}
function clearStatus(){ statusEl.hidden = true; statusEl.textContent=""; }
function showError(err){ console.error(err); setStatus(err?.message || String(err), "error"); }
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
}
