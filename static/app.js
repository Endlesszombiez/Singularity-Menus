import { esc, boardHTML, fitBoards, updateClocks, capacity } from "./board.js";

const root = document.querySelector("#app");
const modal = document.querySelector("#modal");
let session,
  state,
  catalog,
  editor,
  editorRevision,
  dirty = false,
  search = "",
  category = "All",
  previewPage = 0;
let route = location.hash.slice(1) || "boards";
let toastTimer;
const icons = {
  boards:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  templates:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  screens:
    '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  schedule:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-12 4h2m3 0h2"/>',
  settings:
    '<path d="m12 3 2 3 4-1 1 4 3 3-3 3-1 4-4-1-2 3-2-3-4 1-1-4-3-3 3-3 1-4 4 1z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m14 6-6 6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  tasks: '<path d="m3 6 2 2 4-4m3 2h9M3 13l2 2 4-4m3 2h9M3 20h6m3 0h9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
  megaphone: '<path d="m3 10 15-6v16L3 14zm4 6 2 5h3l-2-6M21 9v6"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-12 5h2m4 0h2"/>',
  chart: '<path d="M3 3v18h18M7 16v-4m5 4V8m5 8V5"/>',
  coffee:
    '<path d="M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zm13 1h2a3 3 0 0 1 0 6h-2M6 2v3m4-3v3m4-3v3"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="m8 12 3 3 5-6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M9 3H3v18h6m6-15 6 6-6 6m-9-6h15"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  link: '<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
};
function icon(name, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.boards}</svg>`;
}
function toast(message, error = false) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.className = `visible ${error ? "error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 5000);
}
async function api(path, method = "GET", body) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": session?.csrf || "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "login") {
      dirty = false;
      session = await api("session");
      renderAuth();
    }
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}
async function loadState() {
  const data = await api("state");
  state = data.state;
  catalog = data.catalog;
}
function afterRender() {
  requestAnimationFrame(() => {
    fitBoards();
    if (state) updateClocks(root, state.settings.timezone);
    root
      .querySelectorAll(".board-frame")
      .forEach((frame) => resizeObserver.observe(frame));
  });
}
const resizeObserver = new ResizeObserver(() => fitBoards());
function frame(board, cls = "") {
  return `<div class="board-frame ${cls}">${boardHTML(board, state?.settings)}</div>`;
}
function dateAgo(value) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(value)) / 60000));
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : new Date(value).toLocaleDateString();
}
function formValue(form) {
  return Object.fromEntries(new FormData(form));
}
function option(value, label, selected) {
  return `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
}
function boardOptions(selected) {
  return Object.entries(state.boards)
    .filter(([, r]) => r.published)
    .map(([id, r]) => option(id, r.published.name, selected))
    .join("");
}
function screenURL(slug) {
  return `${location.origin}/display/${encodeURIComponent(slug)}`;
}
function pageHead(eyebrow, title, description, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}

function renderAuth() {
  root.innerHTML = `<main class="auth"><section class="auth-story"><a class="wordmark" href="/"><img src="/static/singularity-logo.svg" alt="">singularity<span>MENUS</span></a><div><span class="auth-kicker">YOUR NETWORK. YOUR SCREENS.</span><h1>A clear picture.<br>For the whole team.</h1><p>Today's tasks. The next shift. The updates that matter.<br>One workspace for every screen.</p><div class="auth-pills"><span>Local by design</span><span>No subscriptions</span><span>Made for teams</span></div></div><small>Singularity Menus · v${esc(session.version)}</small></section><section class="auth-panel"><form id="auth-form"><span class="section-icon">${icon("screens")}</span><h2>${session.setup ? "Make it your workspace." : "Welcome back."}</h2><p>${session.setup ? "Set up your local display server. Your content stays here, on your network." : "Sign in to manage your boards and screens."}</p>${session.setup ? `<label>Workspace name<input name="site_name" required maxlength="80" value="My workspace" autocomplete="organization"></label><label>Timezone<input name="timezone" required value="${esc(session.timezone || "America/New_York")}" list="timezones"></label>` : ""}<label>${session.setup ? "Create an admin password" : "Admin password"}<input name="password" type="password" required minlength="${session.setup ? "12" : "1"}" maxlength="128" autocomplete="${session.setup ? "new-password" : "current-password"}" autofocus></label>${session.setup ? "<small>Use at least 12 characters. You’ll use this password to edit your displays.</small>" : ""}<p class="form-error" id="auth-error" role="alert"></p><button class="btn primary full" type="submit">${session.setup ? "Create workspace" : "Sign in"} ${icon("arrow")}</button><div class="auth-note">${icon("shield")} Administration is protected. Screen URLs are view-only.</div></form></section></main>${timezoneList()}`;
  document
    .querySelector("#auth-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.target.querySelector("button");
      button.disabled = true;
      try {
        await api(
          session.setup ? "setup" : "login",
          "POST",
          formValue(event.target),
        );
        session = await api("session");
        await loadState();
        render();
      } catch (error) {
        document.querySelector("#auth-error").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
}
function timezoneList() {
  return '<datalist id="timezones"><option>America/New_York</option><option>America/Chicago</option><option>America/Denver</option><option>America/Los_Angeles</option><option>Europe/London</option><option>Europe/Stockholm</option><option>Europe/Berlin</option><option>Asia/Tokyo</option><option>Australia/Sydney</option><option>UTC</option></datalist>';
}
function shell(content) {
  const active = route.startsWith("edit/") ? "boards" : route;
  const online = Object.values(state.screens).filter((s) => s.online).length;
  root.innerHTML = `<div class="app-shell"><aside class="sidebar"><a class="wordmark" href="#boards" data-nav="boards"><img src="/static/singularity-logo.svg" alt="">singularity<span>MENUS</span></a><div class="workspace-label"><span class="workspace-avatar">${esc(state.settings.site_name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(state.settings.site_name)}</strong><small>Local workspace</small></div></div><div class="nav-label">WORKSPACE</div><nav aria-label="Workspace navigation">${[
    ["boards", "Boards"],
    ["templates", "Templates"],
    ["screens", "Screens"],
    ["schedule", "Schedule"],
  ]
    .map(
      ([id, label]) =>
        `<a href="#${id}" data-nav="${id}" class="nav-item ${active === id ? "active" : ""}">${icon(id)}${label}${id === "boards" ? `<span class="nav-count">${Object.keys(state.boards).length}</span>` : ""}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><div class="server-card"><span class="server-dot"></span><strong>Local server</strong><small>${online} / ${Object.keys(state.screens).length} screens connected</small><span class="server-tag">SELF-HOSTED</span></div><a href="#settings" data-nav="settings" class="nav-item ${active === "settings" ? "active" : ""}">${icon("settings")}Settings</a><button class="nav-item" data-action="logout">${icon("logout")}Sign out</button><div class="sidebar-version">SINGULARITY <span>v${esc(session.version)}</span></div></div></aside><div class="main-shell"><header class="topbar"><div class="topbar-path">Workspace ${icon("chevron")} <span>${{ boards: "Boards", templates: "Template library", screens: "Screens", schedule: "Schedule", settings: "Settings" }[active] || "Boards"}</span></div><div class="local-indicator"><span class="server-dot"></span>Local network<span class="admin-avatar">A</span></div></header><main id="content" class="content ${route.startsWith("edit/") ? "editor-content" : ""}">${content}</main></div></div>`;
  afterRender();
}
function render() {
  resizeObserver.disconnect();
  if (!session?.authenticated) {
    renderAuth();
    return;
  }
  if (route.startsWith("edit/")) {
    const id = route.split("/")[1];
    if (!state.boards[id]) {
      route = "boards";
      location.hash = route;
    } else {
      if (!editor || editor.id !== id) {
        editor = structuredClone(state.boards[id].draft);
        editorRevision = state.boards[id].revision;
        dirty = false;
        previewPage = 0;
      }
      shell(editorHTML());
      bindEditor();
      return;
    }
  }
  editor = null;
  shell(
    (
      {
        boards: boardsHTML,
        templates: templatesHTML,
        screens: screensHTML,
        schedule: scheduleHTML,
        settings: settingsHTML,
      }[route] || boardsHTML
    )(),
  );
  if (route === "settings") bindSettings();
}
async function navigate(next) {
  if (dirty && !confirm("Leave this board? Your unsaved edits will be lost.")) {
    history.replaceState(null, "", `#${route}`);
    return;
  }
  dirty = false;
  editor = null;
  route = next;
  history.replaceState(null, "", `#${next}`);
  render();
  window.scrollTo(0, 0);
}

function boardsHTML() {
  const records = Object.entries(state.boards);
  const published = records.filter(([, r]) => r.published).length;
  const online = Object.values(state.screens).filter((s) => s.online).length;
  return `${pageHead("YOUR DISPLAY WORKSPACE", "Good things start with a clear plan.", "Create a board. Make it yours. Put it where your team can see it.", `<button class="btn primary" data-nav="templates">${icon("plus")}Create board</button>`)}<div class="stats-row"><div>${icon("boards")}<span><strong>${records.length}</strong> Total boards</span></div><div>${icon("check")}<span><strong>${published}</strong> Published</span></div><div>${icon("screens")}<span><strong>${online}<small> / ${Object.keys(state.screens).length}</small></strong> Screens connected</span></div><div class="stats-note"><span class="server-dot"></span>Everything stays on your network</div></div><div class="section-toolbar"><div class="tabs"><button class="active">All boards <span>${records.length}</span></button></div><label class="search-box">${icon("search")}<input id="board-search" placeholder="Find a board…" aria-label="Find a board" value="${esc(search)}"></label></div><div class="board-grid" id="board-grid">${boardCards(records)}</div><div class="workspace-footnote">${icon("screens")} A screen is a permanent web address. Open it on any browser, TV or kiosk on your network.</div>`;
}
function boardCards(records) {
  const filtered = records.filter(([, r]) =>
    `${r.draft.name} ${catalog[r.draft.template].name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (!filtered.length)
    return '<div class="empty-state"><h3>No boards found</h3><p>Try a different name or create a board from a template.</p><button class="btn" data-nav="templates">Browse templates</button></div>';
  return (
    filtered
      .map(([id, r]) => {
        const count = Object.values(state.screens).filter(
          (s) => s.board === id,
        ).length;
        const draftChanges = r.revision !== r.published_revision;
        return `<article class="board-card"><button class="card-preview" data-nav="edit/${id}" aria-label="Edit ${esc(r.draft.name)}">${frame(r.draft)}<span class="preview-edit">${icon("eye")}Open board</span></button><div class="card-details"><div class="card-title"><h2><button data-nav="edit/${id}">${esc(r.draft.name)}</button></h2><span class="badge ${r.published ? "green" : "neutral"}">${r.published ? "Published" : "Draft"}</span></div><p>${icon(catalog[r.draft.template].icon)}${esc(catalog[r.draft.template].name)}${draftChanges && r.published ? '<span class="draft-dot" title="Has unpublished changes"></span>' : ""}</p><div class="card-bottom"><span>${count ? `${icon("screens")}${count} default screen${count === 1 ? "" : "s"}` : `${icon("calendar")}${dateAgo(r.updated)}`}</span><div><button class="icon-btn" title="Duplicate board" aria-label="Duplicate ${esc(r.draft.name)}" data-action="duplicate" data-id="${id}">${icon("copy")}</button><button class="icon-btn" title="Delete board" aria-label="Delete ${esc(r.draft.name)}" data-action="delete-board" data-id="${id}">${icon("trash")}</button><button class="small-link" data-nav="edit/${id}">Edit ${icon("arrow")}</button></div></div></div></article>`;
      })
      .join("") +
    `<button class="new-board-card" data-nav="templates"><span>${icon("plus")}</span><strong>What's on your next screen?</strong><small>Start with a template and make it your own.</small><b>Explore templates ${icon("arrow")}</b></button>`
  );
}
function sampleBoard(key, theme = 0) {
  const spec = catalog[key];
  return {
    template: key,
    name: spec.name,
    title: spec.title,
    subtitle: spec.subtitle,
    footer: spec.footer,
    items: spec.items,
    theme,
    date: key === "production" ? new Date().toLocaleDateString("en-CA") : "",
    page_seconds: 15,
  };
}
function templatesHTML() {
  const categories = [
    "All",
    "Operations",
    "Communication",
    "Planning",
    "Hospitality",
  ];
  return `${pageHead("START WITH A LITTLE STRUCTURE", "A template for every kind of day.", "Eight starting points. Three distinct themes each. Endless ways to make them yours.")}<div class="template-callout"><span class="section-icon">${icon("tasks")}</span><div><strong>Your next shift, all on one screen.</strong><p>Our production task list brings owners, priorities and progress together.</p></div><button class="btn" data-action="create-board" data-template="production">Use production template ${icon("arrow")}</button></div><div class="section-toolbar"><div class="tabs wrap">${categories.map((c) => `<button class="${category === c ? "active" : ""}" data-action="category" data-value="${c}">${c}${c === "All" ? "<span>8</span>" : ""}</button>`).join("")}</div><span class="muted small">Every theme works offline</span></div><div class="template-grid">${Object.entries(
    catalog,
  )
    .filter(([, s]) => category === "All" || s.category === category)
    .map(
      ([key, spec]) =>
        `<article class="template-card"><button class="card-preview" data-action="template-preview" data-template="${key}" aria-label="Preview ${esc(spec.name)}">${frame(sampleBoard(key))}<span class="preview-edit">${icon("eye")}Explore themes</span></button><div class="card-details"><div class="template-meta">${icon(spec.icon)}<span>${esc(spec.category)}</span><span class="theme-dots">${spec.themes.map((t, i) => `<i class="swatch swatch-${key}-${i}" title="${esc(t)}"></i>`).join("")}<small>3 themes</small></span></div><h2>${esc(spec.name)}</h2><p class="template-description">${esc(spec.description)}</p><button class="btn full" data-action="create-board" data-template="${key}">Use template ${icon("arrow")}</button></div></article>`,
    )
    .join("")}</div>`;
}
function editorHTML() {
  const spec = catalog[editor.template];
  const record = state.boards[editor.id];
  return `<div class="editor-toolbar"><div><button class="icon-btn" data-nav="boards" aria-label="Back to boards">${icon("back")}</button><div><h1>${esc(editor.name)}</h1><span id="save-status">${dirty ? "Unsaved changes" : record.published_revision === record.revision ? "Published · All changes saved" : "Draft · Not published"}</span></div></div><div><button class="btn" data-action="preview-editor">${icon("eye")}<span>Preview</span></button><button class="btn" data-action="save-board">Save draft</button><button class="btn primary" data-action="publish-board">${icon("arrow")}Publish board</button></div></div><div class="editor-layout"><form id="editor-form" class="editor-fields"><section class="panel"><div class="panel-heading"><span class="section-icon">${icon(spec.icon)}</span><div><h2>Make it your board</h2><p>${esc(spec.name)}</p></div></div><label>Board name <small>Only shown in your workspace</small><input data-board-key="name" maxlength="80" required value="${esc(editor.name)}"></label><label>Display title<input data-board-key="title" maxlength="100" required value="${esc(editor.title)}"></label><label>Subtitle<input data-board-key="subtitle" maxlength="180" value="${esc(editor.subtitle)}"></label>${editor.template === "production" ? `<label>Plan date <small>Shown on the display; update for each shift</small><input type="date" data-board-key="date" value="${esc(editor.date)}"></label>` : ""}</section><section class="panel entries-panel"><div class="panel-heading"><div><h2>${editor.template === "production" ? "Production tasks" : "Board entries"} <span class="count-pill">${editor.items.length}</span></h2><p>Entries appear in this order on your display.</p></div><button type="button" class="btn compact" data-action="add-entry">${icon("plus")}Add</button></div><div id="entry-list">${entryListHTML()}</div>${!editor.items.length ? '<p class="empty-inline">Add your first entry to bring this board to life.</p>' : ""}<button type="button" class="btn full dashed" data-action="add-entry">${icon("plus")}Add ${editor.template === "production" ? "task" : "entry"}</button></section><section class="panel"><h2>The finishing touches</h2><label>Footer message<textarea data-board-key="footer" maxlength="250" rows="2">${esc(editor.footer)}</textarea></label><label>Seconds per page <small>Long boards cycle automatically on the TV</small><input type="number" min="5" max="120" required data-board-key="page_seconds" value="${editor.page_seconds}"></label><p class="muted small">${capacity(editor.template)} entries per page · ${Math.max(1, Math.ceil(editor.items.length / capacity(editor.template)))} page(s)</p></section></form><aside class="editor-preview"><section class="panel"><div class="panel-heading"><h2>Live preview</h2><span class="badge neutral">16:9</span></div><div id="editor-preview">${frame(editor)}</div><div class="preview-caption"><span>Previewing your draft</span><button class="small-link" data-action="next-preview">Next page ${icon("chevron")}</button></div></section><section class="panel"><h2>Choose your theme</h2><p class="muted small">Same content. A different feel.</p><div class="theme-options">${spec.themes.map((theme, index) => `<button class="theme-option ${editor.theme === index ? "selected" : ""}" data-action="theme" data-theme="${index}" aria-pressed="${editor.theme === index}"><span class="theme-sample swatch-${editor.template}-${index}"><i></i><i></i><i></i></span><span>${esc(theme)}</span><span class="theme-check">${editor.theme === index ? "✓" : ""}</span></button>`).join("")}</div></section><div class="editor-tip">${icon("screens")}<p>Saving a draft keeps your live screens as they are. Publish when you’re ready. Screens update within about five seconds.</p></div></aside></div>`;
}
function entryListHTML() {
  const spec = catalog[editor.template];
  return editor.items
    .map(
      (item, index) =>
        `<article class="entry-card"><div class="entry-header"><span>ENTRY ${String(index + 1).padStart(2, "0")}</span><div><button class="icon-btn" type="button" title="Move up" aria-label="Move entry ${index + 1} up" data-action="move-entry" data-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-btn" type="button" title="Move down" aria-label="Move entry ${index + 1} down" data-action="move-entry" data-index="${index}" data-direction="1" ${index === editor.items.length - 1 ? "disabled" : ""}>↓</button><button class="icon-btn" type="button" title="Remove entry" aria-label="Remove entry ${index + 1}" data-action="remove-entry" data-index="${index}">${icon("trash")}</button></div></div><div class="entry-fields">${spec.columns.map(([key, label]) => `<label class="field-${key}">${esc(label)}${entryInput(key, item[key] || "", index)}</label>`).join("")}</div></article>`,
    )
    .join("");
}
function entryInput(key, value, index) {
  const attrs = `data-item-index="${index}" data-item-key="${key}"`;
  if (key === "status" || key === "priority") {
    const options =
      key === "status"
        ? ["To do", "In progress", "Done", "Blocked"]
        : ["Normal", "High", "Urgent"];
    return `<select ${attrs}>${options.map((o) => option(o, o, value)).join("")}</select>`;
  }
  if (key === "detail")
    return `<textarea ${attrs} maxlength="250" rows="2">${esc(value)}</textarea>`;
  return `<input ${attrs} type="${key === "due" ? "time" : ["value", "target"].includes(key) ? "number" : "text"}" ${["value", "target"].includes(key) ? 'min="0" max="999999999.999" step="0.001" required' : ""} maxlength="100" ${key === "title" ? "required" : ""} value="${esc(value)}">`;
}
function markDirty() {
  dirty = true;
  document.querySelector("#save-status").textContent = "Unsaved changes";
}
function updateEditorPreview() {
  const el = document.querySelector("#editor-preview");
  el.innerHTML = `<div class="board-frame">${boardHTML(editor, state.settings, previewPage)}</div>`;
  fitBoards();
  updateClocks(el, state.settings.timezone);
}
function bindEditor() {
  document
    .querySelector("#editor-form")
    .addEventListener("submit", (event) => event.preventDefault());
  document.querySelector("#editor-form").addEventListener("input", (event) => {
    const el = event.target;
    if (el.dataset.boardKey)
      editor[el.dataset.boardKey] =
        el.dataset.boardKey === "page_seconds" ? Number(el.value) : el.value;
    if (el.dataset.itemKey)
      editor.items[Number(el.dataset.itemIndex)][el.dataset.itemKey] = el.value;
    markDirty();
    updateEditorPreview();
  });
}

function screensHTML() {
  const screens = Object.entries(state.screens);
  return `${pageHead("THE RIGHT BOARD. THE RIGHT PLACE.", "Give every screen a purpose.", "One permanent address per screen. Any browser on your network can display it.", `<button class="btn primary" data-action="add-screen">${icon("plus")}Add screen</button>`)}<div class="info-banner">${icon("link")}<p>Open a screen’s address on a TV, tablet or kiosk. Set the browser to full screen. Multiple devices can use the same address.</p></div><div class="screen-grid">${screens.map(([slug, s]) => `<article class="screen-card"><div class="screen-card-top"><span class="section-icon">${icon("screens")}</span><span class="badge ${s.online ? "green" : "neutral"}"><span class="dot ${s.online ? "done" : "todo"}"></span>${s.online ? "Connected" : "Not connected"}</span></div><h2>${esc(s.name)}</h2><div class="screen-board-label">${s.scheduled ? "Scheduled board" : "Default board"}</div><strong class="screen-board-name">${esc(state.boards[s.active_board]?.published?.name || "Unassigned")}</strong><div class="screen-address"><code>${esc(screenURL(slug))}</code><button class="icon-btn" title="Copy address" aria-label="Copy screen address" data-action="copy-url" data-slug="${esc(slug)}">${icon("copy")}</button></div><div class="screen-card-foot"><button class="small-link" data-action="edit-screen" data-slug="${esc(slug)}">Edit assignment</button><a class="btn compact" href="${esc(screenURL(slug))}" target="_blank" rel="noopener">Open display ${icon("arrow")}</a><button class="icon-btn" title="Delete screen" aria-label="Delete ${esc(s.name)}" data-action="delete-screen" data-slug="${esc(slug)}">${icon("trash")}</button></div><small class="muted">${s.last_seen ? `Last request ${new Date(s.last_seen * 1000).toLocaleString()}` : "Waiting for its first connection"}</small></article>`).join("") || '<div class="empty-state"><h3>Your screens start here.</h3><p>Add a screen and give it a published board.</p></div>'}</div><div class="workspace-footnote">${icon("shield")} Screen addresses are view-only and accessible to anyone on your LAN. Use a reserved server IP to keep bookmarks stable.</div>`;
}
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function scheduleHTML() {
  const rules = state.schedules;
  return `${pageHead("SET IT ONCE. STAY IN SYNC.", "A different board, right on time.", "Switch content automatically while every screen keeps the same address.", `<button class="btn primary" data-action="add-rule">${icon("plus")}Add time window</button>`)}<div class="info-banner">${icon("calendar")}<p>Schedules use <strong>${esc(state.settings.timezone)}</strong>. Outside these windows, screens show their default board. Overnight windows continue into the next day.</p></div><section class="panel schedule-panel"><div class="panel-heading"><h2>Weekly time windows <span class="count-pill">${rules.length}</span></h2><span class="muted small">Non-overlapping · Minute precision</span></div>${rules.length ? `<div class="table-scroll"><table class="schedule-table"><thead><tr><th>Screen</th><th>Days</th><th>Time window</th><th>Board</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rules.map((r, index) => `<tr><td><strong>${esc(state.screens[r.screen].name)}</strong></td><td><div class="day-chips">${dayNames.map((d, i) => `<span class="${r.days.includes(i) ? "on" : ""}">${d[0]}</span>`).join("")}</div><small>${r.days.map((d) => dayNames[d]).join(", ")}</small></td><td>${esc(r.start)} → ${esc(r.end)}${r.start > r.end ? "<small>Ends next day</small>" : ""}</td><td>${esc(state.boards[r.board].published.name)}</td><td><button class="small-link" data-action="edit-rule" data-index="${index}">Edit</button><button class="icon-btn" title="Delete window" aria-label="Delete schedule window ${index + 1}" data-action="delete-rule" data-index="${index}">${icon("trash")}</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><span class="empty-icon">${icon("schedule")}</span><h3>A little planning goes a long way.</h3><p>Show a shift briefing in the morning, today's tasks during work,<br>and a handover board at the end of the day.</p><button class="btn" data-action="add-rule">${icon("plus")}Create your first time window</button></div>`}</section>`;
}
function settingsHTML() {
  return `${pageHead("YOUR WORKSPACE, YOUR WAY.", "Keep everything in good order.", "Manage your workspace, protect your account and take your content with you.")}<div class="settings-grid"><form id="workspace-form" class="panel"><div class="panel-heading"><span class="section-icon">${icon("settings")}</span><div><h2>Workspace</h2><p>Shown across your display boards.</p></div></div><label>Workspace name<input name="site_name" maxlength="80" required value="${esc(state.settings.site_name)}"></label><label>Timezone<input name="timezone" required list="timezones" value="${esc(state.settings.timezone)}"></label><p class="muted small">Use an IANA timezone. Schedules and display clocks follow this setting, including daylight saving time.</p><button class="btn primary" type="submit">Save workspace</button></form><section class="panel"><div class="panel-heading"><span class="section-icon">${icon("copy")}</span><div><h2>Backup & restore</h2><p>Your content should always be yours.</p></div></div><p class="muted">Export boards, published content, screen assignments, schedules and workspace settings.</p><a class="btn" href="/api/backup" download>Download backup ${icon("arrow")}</a><hr><h3>Restore a workspace</h3><p class="muted small">Restoring replaces all content. Your admin password stays the same. Download a backup first.</p><label class="file-label">Select a Singularity backup<input id="restore-file" type="file" accept="application/json,.json"></label><button class="btn" data-action="restore">Restore backup</button></section><form id="password-form" class="panel"><div class="panel-heading"><span class="section-icon">${icon("shield")}</span><div><h2>Admin password</h2><p>Protect the place where changes happen.</p></div></div><label>Current password<input name="current_password" type="password" required autocomplete="current-password"></label><label>New password<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>Confirm new password<input name="confirm_password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><button class="btn" type="submit">Update password</button></form><section class="panel about-panel"><img src="/static/singularity-logo.svg" width="48" height="48" alt=""><h2>Singularity Menus</h2><p>A clear picture for the whole team.</p><div class="about-facts"><span>Version<strong>${esc(session.version)}</strong></span><span>Hosting<strong>Your local server</strong></span><span>Storage<strong>SQLite · Persistent volume</strong></span><span>Screen refresh<strong>Every 5 seconds</strong></span></div><p class="muted small">All fonts, styles and scripts are served locally. No accounts in the cloud, no external assets, no tracking.</p></section></div>${timezoneList()}`;
}
function bindSettings() {
  document
    .querySelector("#workspace-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("settings", "PUT", formValue(e.target));
        await loadState();
        render();
        toast("Workspace updated.");
      } catch (error) {
        toast(error.message, true);
      }
    });
  document
    .querySelector("#password-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = formValue(e.target);
      if (body.password !== body.confirm_password) {
        toast("Your new passwords do not match.", true);
        return;
      }
      try {
        await api("password", "PUT", body);
        e.target.reset();
        toast("Password updated. Other admin sessions have been signed out.");
      } catch (error) {
        toast(error.message, true);
      }
    });
}

function showModal(title, body, submitLabel, onSubmit) {
  modal.className = "";
  modal.innerHTML = `<form id="modal-form"><header><h2>${title}</h2><button class="icon-btn" type="button" data-close aria-label="Close dialog">×</button></header><div class="modal-body">${body}</div><p id="modal-error" class="form-error" role="alert"></p><footer><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="submit">${submitLabel}</button></footer></form>`;
  modal
    .querySelectorAll("[data-close]")
    .forEach((el) => el.addEventListener("click", () => modal.close()));
  modal.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await onSubmit(e.target);
      modal.close();
      await loadState();
      render();
    } catch (error) {
      modal.querySelector("#modal-error").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  modal.showModal();
}
function screenModal(slug) {
  if (!Object.values(state.boards).some((r) => r.published)) {
    toast("Publish a board before adding a screen.", true);
    return;
  }
  const screen = slug ? state.screens[slug] : null;
  showModal(
    screen ? "Edit screen assignment" : "Give your screen an address",
    `<p class="muted">${screen ? "The permanent address stays the same when you change the board." : "Create a permanent web address for your TV or kiosk."}</p><label>Screen name<input name="name" required maxlength="80" value="${esc(screen?.name || "")}" placeholder="e.g. Assembly floor"></label>${!screen ? '<label>Screen address<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="60" placeholder="e.g. assembly-floor"><small>Lowercase letters, numbers and hyphens. This address is permanent.</small></label>' : `<div class="address-note">${esc(screenURL(slug))}</div>`}<label>Default board<select name="board" required>${boardOptions(screen?.board)}</select></label>`,
    screen ? "Save assignment" : "Create screen",
    async (form) => {
      await api(
        slug ? `screens/${slug}` : "screens",
        slug ? "PUT" : "POST",
        formValue(form),
      );
      toast(
        slug
          ? "Screen assignment updated."
          : "Screen created. Open its address on your display.",
      );
    },
  );
}
function scheduleModal(index) {
  if (!Object.keys(state.screens).length) {
    toast("Add a screen first.", true);
    return;
  }
  const rule = index === undefined ? null : state.schedules[index];
  showModal(
    rule ? "Edit time window" : "Plan a time window",
    `<label>Screen<select name="screen" required>${Object.entries(state.screens)
      .map(([id, s]) => option(id, s.name, rule?.screen))
      .join(
        "",
      )}</select></label><label>Show this board<select name="board" required>${boardOptions(rule?.board)}</select></label><fieldset class="days-field"><legend>Starting on</legend><div>${dayNames.map((d, i) => `<label><input type="checkbox" name="days" value="${i}" ${(rule?.days || [0, 1, 2, 3, 4]).includes(i) ? "checked" : ""}><span>${d}</span></label>`).join("")}</div></fieldset><div class="two-fields"><label>From<input type="time" name="start" required value="${rule?.start || "07:00"}"></label><label>Until<input type="time" name="end" required value="${rule?.end || "08:00"}"></label></div><p class="muted small">Timezone: ${esc(state.settings.timezone)}. If the end is earlier than the start, the window continues into the next day. Overlapping windows are rejected.</p>`,
    "Save time window",
    async (form) => {
      const value = formValue(form);
      value.days = new FormData(form).getAll("days").map(Number);
      const rules = structuredClone(state.schedules);
      if (rule) rules[index] = value;
      else rules.push(value);
      await api("schedules", "PUT", rules);
      toast("Schedule updated.");
    },
  );
}
function previewModal(board, templateKey) {
  let theme = board.theme,
    page = 0;
  modal.className = "preview-modal";
  function draw() {
    modal.innerHTML = `<header><div><span class="eyebrow">${templateKey ? "TEMPLATE PREVIEW" : "DRAFT PREVIEW"}</span><h2>${esc(catalog[board.template].name)}</h2></div><button class="icon-btn" data-close aria-label="Close preview">×</button></header><div class="modal-preview-frame">${frame({ ...board, theme })}</div><footer><div class="preview-themes">${catalog[board.template].themes.map((t, i) => `<button class="btn ${theme === i ? "selected" : ""}" data-preview-theme="${i}">${esc(t)}</button>`).join("")}</div>${templateKey ? `<button class="btn primary" data-use-template>Use this theme ${icon("arrow")}</button>` : '<button class="btn" data-preview-page>Next page →</button>'}</footer>`;
    modal.querySelector("[data-close]").onclick = () => modal.close();
    modal.querySelectorAll("[data-preview-theme]").forEach(
      (b) =>
        (b.onclick = () => {
          theme = Number(b.dataset.previewTheme);
          draw();
        }),
    );
    if (templateKey)
      modal.querySelector("[data-use-template]").onclick = async () => {
        try {
          const result = await api("boards", "POST", { template: templateKey });
          await loadState();
          modal.close();
          dirty = false;
          editor = null;
          await navigate(`edit/${result.id}`);
          editor.theme = theme;
          markDirty();
          render();
          updateEditorPreview();
        } catch (error) {
          toast(error.message, true);
        }
      };
    else
      modal.querySelector("[data-preview-page]").onclick = () => {
        page =
          (page + 1) %
          Math.max(1, Math.ceil(board.items.length / capacity(board.template)));
        modal.querySelector(".modal-preview-frame").innerHTML =
          `<div class="board-frame">${boardHTML({ ...board, theme }, state.settings, page)}</div>`;
        fitBoards(modal);
        updateClocks(modal, state.settings.timezone);
      };
    requestAnimationFrame(() => {
      fitBoards(modal);
      updateClocks(modal, state.settings.timezone);
    });
  }
  draw();
  modal.showModal();
  requestAnimationFrame(() => fitBoards(modal));
}

root.addEventListener("input", (event) => {
  if (event.target.id === "board-search") {
    search = event.target.value;
    document.querySelector("#board-grid").innerHTML = boardCards(
      Object.entries(state.boards),
    );
    afterRender();
  }
});
root.addEventListener("click", async (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    await navigate(nav.dataset.nav);
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === "category") {
      category = button.dataset.value;
      render();
    }
    if (action === "create-board") {
      button.disabled = true;
      const result = await api("boards", "POST", {
        template: button.dataset.template,
      });
      await loadState();
      await navigate(`edit/${result.id}`);
    }
    if (action === "template-preview")
      previewModal(
        sampleBoard(button.dataset.template),
        button.dataset.template,
      );
    if (action === "duplicate") {
      await api("boards", "POST", { duplicate: button.dataset.id });
      await loadState();
      render();
      toast("Board duplicated as a draft.");
    }
    if (action === "delete-board") {
      const record = state.boards[button.dataset.id];
      if (!confirm(`Delete “${record.draft.name}”? This cannot be undone.`))
        return;
      await api(`boards/${button.dataset.id}`, "DELETE", {
        revision: record.revision,
      });
      await loadState();
      render();
      toast("Board deleted.");
    }
    if (action === "logout") {
      if (dirty && !confirm("Sign out and discard unsaved edits?")) return;
      await api("logout", "POST", {});
      dirty = false;
      editor = null;
      session = await api("session");
      renderAuth();
    }
    if (action === "save-board" || action === "publish-board") {
      if (!document.querySelector("#editor-form").reportValidity()) return;
      button.disabled = true;
      await api(
        `boards/${editor.id}${action === "publish-board" ? "/publish" : ""}`,
        action === "publish-board" ? "POST" : "PUT",
        { revision: editorRevision, board: editor },
      );
      dirty = false;
      await loadState();
      editor = structuredClone(state.boards[editor.id].draft);
      editorRevision = state.boards[editor.id].revision;
      render();
      toast(
        action === "publish-board"
          ? "Published. Your screens will update shortly."
          : "Draft saved.",
      );
    }
    if (action === "theme") {
      editor.theme = Number(button.dataset.theme);
      markDirty();
      render();
    }
    if (action === "preview-editor") previewModal(editor);
    if (action === "next-preview") {
      previewPage =
        (previewPage + 1) %
        Math.max(1, Math.ceil(editor.items.length / capacity(editor.template)));
      updateEditorPreview();
    }
    if (action === "add-entry") {
      if (editor.items.length >= 100) {
        toast("Use up to 100 entries per board.", true);
        return;
      }
      const item = Object.fromEntries(
        catalog[editor.template].columns.map(([key]) => [key, ""]),
      );
      if (editor.template === "production")
        Object.assign(item, { status: "To do", priority: "Normal" });
      if (editor.template === "metrics")
        Object.assign(item, { value: "0", target: "100" });
      editor.items.push(item);
      markDirty();
      render();
      const last = document.querySelector(".entry-card:last-child");
      last.scrollIntoView({ behavior: "smooth", block: "center" });
      last.querySelector("input").focus({ preventScroll: true });
    }
    if (action === "remove-entry") {
      editor.items.splice(Number(button.dataset.index), 1);
      markDirty();
      render();
    }
    if (action === "move-entry") {
      const index = Number(button.dataset.index),
        target = index + Number(button.dataset.direction);
      [editor.items[index], editor.items[target]] = [
        editor.items[target],
        editor.items[index],
      ];
      markDirty();
      render();
    }
    if (action === "add-screen") screenModal();
    if (action === "edit-screen") screenModal(button.dataset.slug);
    if (action === "delete-screen") {
      if (
        !confirm(
          `Delete this screen address? Devices using it will stop displaying content.`,
        )
      )
        return;
      await api(`screens/${button.dataset.slug}`, "DELETE", {});
      await loadState();
      render();
      toast("Screen deleted.");
    }
    if (action === "copy-url") {
      const url = screenURL(button.dataset.slug);
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        toast("Screen address copied.");
      } else
        showModal(
          "Screen address",
          `<p class="muted">Copy this address and open it on your display.</p><input aria-label="Screen address" readonly value="${esc(url)}">`,
          "Done",
          async () => {},
        );
    }
    if (action === "add-rule") scheduleModal();
    if (action === "edit-rule") scheduleModal(Number(button.dataset.index));
    if (action === "delete-rule") {
      if (
        !confirm(
          "Remove this time window? The screen will use its default board during this period.",
        )
      )
        return;
      await api(
        "schedules",
        "PUT",
        state.schedules.filter((_, i) => i !== Number(button.dataset.index)),
      );
      await loadState();
      render();
      toast("Time window removed.");
    }
    if (action === "restore") {
      const file = document.querySelector("#restore-file").files[0];
      if (!file) {
        toast("Choose a backup file first.", true);
        return;
      }
      if (file.size > 32 * 1024 * 1024) {
        toast("Backups must be smaller than 32 MB.", true);
        return;
      }
      const backup = JSON.parse(await file.text());
      if (
        !confirm(
          "Replace all boards, screens, schedules and workspace settings with this backup? Download your current backup first.",
        )
      )
        return;
      button.disabled = true;
      await api("restore", "POST", backup);
      await loadState();
      render();
      toast("Workspace restored.");
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
addEventListener("hashchange", () =>
  navigate(location.hash.slice(1) || "boards"),
);
addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
addEventListener("resize", () => {
  fitBoards();
  if (modal.open) fitBoards(modal);
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});
setInterval(() => {
  if (state) updateClocks(document, state.settings.timezone);
}, 10000);
setInterval(async () => {
  if (
    !session?.authenticated ||
    modal.open ||
    !["boards", "screens"].includes(route)
  )
    return;
  try {
    await loadState();
    if (
      !modal.open &&
      ["boards", "screens"].includes(route) &&
      document.activeElement?.id !== "board-search"
    )
      render();
  } catch {}
}, 15000);

async function init() {
  try {
    session = await api("session");
    if (session.authenticated) await loadState();
    render();
  } catch (error) {
    root.innerHTML = `<div class="boot"><h2>We couldn't reach your workspace.</h2><p>${esc(error.message)}</p><button class="btn" id="retry">Try again</button></div>`;
    document.querySelector("#retry").onclick = init;
  }
}
init();
