// Shared renderer: the editor and TV use exactly the same layouts.
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const statusClass = (status) =>
  ({
    "To do": "todo",
    "In progress": "progress",
    Done: "done",
    Blocked: "blocked",
  })[status] || "todo";
export const capacity = (template) =>
  ({
    production: 6,
    briefing: 4,
    announcements: 3,
    schedule: 6,
    metrics: 4,
    menu: 6,
    safety: 4,
    welcome: 4,
  })[template] || 4;
export function dateLabel(day) {
  if (!day) return "";
  return new Date(day + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
export function boardHTML(board, settings = {}, page = 0) {
  const pages = Math.max(
    1,
    Math.ceil(board.items.length / capacity(board.template)),
  );
  const rows = board.items.slice(
    (page % pages) * capacity(board.template),
    ((page % pages) + 1) * capacity(board.template),
  );
  const total = board.items.length;
  const done = board.items.filter((i) => i.status === "Done").length;
  const inProgress = board.items.filter(
    (i) => i.status === "In progress",
  ).length;
  const blocked = board.items.filter((i) => i.status === "Blocked").length;
  let body;
  if (board.template === "production") {
    body = `<div class="production-summary"><div><strong>${total}</strong> tasks today</div><div><span class="dot progress"></span><strong>${inProgress}</strong> in progress</div><div><span class="dot done"></span><strong>${done}</strong> complete</div>${blocked ? `<div><span class="dot blocked"></span><strong>${blocked}</strong> blocked</div>` : ""}<div class="completion">${total ? Math.round((done / total) * 100) : 0}% complete <span class="progress-track"><i style="width:${total ? (done / total) * 100 : 0}%"></i></span></div></div>
    <div class="task-table"><div class="task-head"><span>Task / work order</span><span>Assigned to</span><span>Due</span><span>Status</span></div>${rows.map((i) => `<div class="task-row ${i.status === "Done" ? "is-done" : ""}"><div class="task-name"><span class="task-check ${statusClass(i.status)}">${i.status === "Done" ? "✓" : i.status === "Blocked" ? "!" : ""}</span><div><strong>${esc(i.title)}</strong><small>${esc(i.detail)}</small></div>${i.priority !== "Normal" ? `<span class="priority">${esc(i.priority)}</span>` : ""}</div><span class="task-owner">${esc(i.owner)}</span><span class="task-due">${esc(i.due || "—")}</span><span class="status ${statusClass(i.status)}">${esc(i.status)}</span></div>`).join("")}</div>`;
  } else if (board.template === "metrics") {
    body = `<div class="metric-grid">${rows
      .map((i) => {
        const percent =
          +i.target > 0 ? Math.min(100, (+i.value / +i.target) * 100) : 0;
        return `<article class="metric"><span>${esc(i.title)}</span><div class="metric-value">${esc(i.value)}<small>${esc(i.unit)}</small></div><div class="metric-target">Target ${esc(i.target)} <span>${Math.round(percent)}%</span></div><div class="progress-track"><i style="width:${percent}%"></i></div><small>${esc(i.detail)}</small></article>`;
      })
      .join("")}</div>`;
  } else if (board.template === "schedule") {
    body = `<div class="agenda">${rows.map((i) => `<article><time>${esc(i.time)}</time><div><strong>${esc(i.title)}</strong><p>${esc(i.detail)}</p></div><span>${esc(i.owner)}</span></article>`).join("")}</div>`;
  } else if (board.template === "menu") {
    body = `<div class="menu-grid">${rows.map((i) => `<article><small>${esc(i.owner)}</small><div><strong>${esc(i.title)}</strong><b>${esc(i.price)}</b></div><p>${esc(i.detail)}</p></article>`).join("")}</div>`;
  } else {
    body = `<div class="info-grid layout-${esc(board.template)}">${rows.map((i, index) => `<article><span class="info-label">${board.template === "safety" ? String(index + 1 + page * capacity(board.template)).padStart(2, "0") + " / " : ""}${esc(i.owner)}</span><h2>${esc(i.title)}</h2><p>${esc(i.detail)}</p>${board.template === "welcome" ? '<span class="direction">↗</span>' : ""}</article>`).join("")}</div>`;
  }
  return `<section class="board template-${esc(board.template)} theme-${Number(board.theme)}"><header class="board-top"><span class="board-brand"><i></i>${esc(settings.site_name || "Singularity workspace")}</span><span class="board-date">${esc(dateLabel(board.date))}</span></header><div class="board-heading"><div><div class="board-eyebrow">${esc({ production: "Daily operations", briefing: "Shift handover", announcements: "Team noticeboard", schedule: "On the agenda", metrics: "At a glance", menu: "Fresh from our kitchen", safety: "Look out for each other", welcome: "Make yourself at home" }[board.template])}</div><h1>${esc(board.title)}</h1><p>${esc(board.subtitle)}</p></div>${board.template === "production" ? '<span class="shift-badge"><span class="dot done"></span> SHIFT PLAN</span>' : ""}</div><div class="board-content">${total ? body : '<div class="empty-board">No entries to show yet.</div>'}</div><footer class="board-footer"><span>${esc(board.footer)}</span><span class="board-page">${pages > 1 ? `${(page % pages) + 1} / ${pages} · ` : ""}<time data-clock></time></span></footer></section>`;
}

export function updateClocks(root, zone = "America/New_York") {
  const label = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  });
  root
    .querySelectorAll("[data-clock]")
    .forEach((el) => (el.textContent = label));
}

export function fitBoards(root = document) {
  root.querySelectorAll(".board-frame").forEach((frame) => {
    const board = frame.querySelector(".board");
    if (!board) return;
    board.style.transform = `scale(${frame.clientWidth / 1600})`;
  });
}
