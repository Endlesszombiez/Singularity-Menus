import { boardHTML, capacity, updateClocks } from "./board.js";

const display = document.querySelector("#display");
const connection = document.querySelector("#connection");
const slug = decodeURIComponent(
  location.pathname.split("/").filter(Boolean).pop(),
);
const key = `singularity-display-v1:${slug}`;
let current = null,
  page = 0,
  nextPage = 0,
  lastSuccess = 0;

function fit() {
  const board = display.querySelector(".board");
  if (!board) return;
  const scale = Math.min(innerWidth / 1600, innerHeight / 900);
  board.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
function render() {
  if (!current) return;
  display.innerHTML = boardHTML(current.board, current.settings, page);
  updateClocks(display, current.settings.timezone);
  fit();
}
function offline(message) {
  connection.hidden = false;
  connection.textContent = message;
}
try {
  const cached = JSON.parse(localStorage.getItem(key));
  if (cached?.board && cached?.settings) {
    current = cached;
    render();
    offline("Reconnecting · Showing last received content");
  }
} catch {
  /* Storage may be disabled on kiosk browsers. */
}

async function refresh() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`/api/display/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 404) {
        current = null;
        try {
          localStorage.removeItem(key);
        } catch {}
        display.innerHTML =
          '<div class="player-message">This screen is not assigned.<br><small>Check its address with your administrator.</small></div>';
      }
      throw new Error("Unavailable");
    }
    const data = await response.json();
    if (current?.revision !== data.revision) {
      current = data;
      page = 0;
      nextPage = Date.now() + data.board.page_seconds * 1000;
      render();
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {}
    }
    lastSuccess = Date.now();
    connection.hidden = true;
    document.title = `${data.screen_name} · Singularity`;
  } catch {
    offline(
      current
        ? `Connection lost · Last received ${lastSuccess ? new Date(lastSuccess).toLocaleTimeString() : "from saved content"}`
        : "Waiting for server · Retrying automatically",
    );
  } finally {
    clearTimeout(timeout);
    setTimeout(refresh, 5000);
  }
}
addEventListener("resize", fit);
setInterval(() => {
  if (!current) return;
  updateClocks(display, current.settings.timezone);
  if (Date.now() >= nextPage) {
    page =
      (page + 1) %
      Math.max(
        1,
        Math.ceil(
          current.board.items.length / capacity(current.board.template),
        ),
      );
    nextPage = Date.now() + current.board.page_seconds * 1000;
    render();
  }
}, 1000);
document.querySelector("#fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
refresh();
