// ================= ELEMENTS =================
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggle-sidebar");
const statusEl = document.getElementById("status");
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");

const telaStatus = document.getElementById("tela-status");
const gnomonStatus = document.getElementById("gnomon-status");

const nodeInput = document.getElementById("node");
const connectNodeBtn = document.getElementById("connectNodeBtn");
const scidInput = document.getElementById("scid");
const loadBtn = document.getElementById("load");
const scidListEl = document.getElementById("scid-list"); // container for search page SCIDs

const bookmarkScidBtn = document.getElementById("bookmark-scid");
const bookmarkNodeBtn = document.getElementById("bookmark-node");
const bookmarkedScidsEl = document.getElementById("bookmarked-scids");
const bookmarkedNodesEl = document.getElementById("bookmarked-nodes");

const themeToggle = document.getElementById("theme-toggle");

const RT = typeof browser !== "undefined" ? browser : chrome;


// ================= STATE =================
let bookmarks = { scids: {}, nodes: {} };
let settings = { autostart: false, refreshInterval: 3, defaultNode: "" };

// ================= THEME =================
const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);

themeToggle.onclick = () => {
  const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
};

// ================= NAV =================
toggleSidebarBtn.onclick = () => sidebar.classList.toggle("collapsed");

navItems.forEach(item => {
  item.onclick = () => {
    navItems.forEach(n => n.classList.remove("active"));
    pages.forEach(p => p.classList.remove("active"));
    item.classList.add("active");
    document.getElementById(`page-${item.dataset.page}`).classList.add("active");
  };
});

// ================= HELPERS =================
function send(cmd, params = {}) {
  return browser.runtime.sendMessage({ cmd, params });
}

function setStatus(el, running) {
  const icon = el.querySelector(".sb-icon");
  const text = el.querySelector(".sb-text");

  if (!icon || !text) return;

  if (running) {
    icon.textContent = "🟢";
    text.textContent = "Connected";
  } else {
    icon.textContent = "🔴";
    text.textContent = "Stopped";
  }
}

// ---------------- LIVE SYNC ----------------
// Make page-server status match sidebar
function syncServerPageStatus() {
  const sidebarTela = document.querySelector("#sidebar #tela-status");
  const sidebarGnomon = document.querySelector("#sidebar #gnomon-status");

  if (!sidebarTela || !sidebarGnomon) return;

  const pageTela = document.querySelector("#page-server #tela-status");
  const pageGnomon = document.querySelector("#page-server #gnomon-status");

  if (pageTela) pageTela.innerHTML = sidebarTela.innerHTML;
  if (pageGnomon) pageGnomon.innerHTML = sidebarGnomon.innerHTML;
}

// Call after every update
setInterval(syncServerPageStatus, 3000); // every second

// ================= START SVG =================

function createStarSVG() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z");
  svg.appendChild(path);
  return svg;
}

function createNoResults(text) {
  const div = document.createElement("div");
  div.className = "no-results";
  div.textContent = text;
  return div;
}

// ================= SCID LIST =================
function updateSCIDList(scids) {
  if (!scidListEl) return; // <--- guard

  scidListEl.replaceChildren();
  if (!scids || !scids.length) {
    scidListEl.appendChild(createNoResults("No SCIDs loaded"));
    return;
  }
  scids.forEach(scid => {
    const div = document.createElement("div");
    div.className = "scid-item";
    div.textContent = scid;
    scidListEl.appendChild(div);
  });
}

// ================= NODE CONNECT =================
connectNodeBtn.onclick = async () => {
  const node = nodeInput.value.trim();
  if (!node) return alert("Enter node first");

  statusEl.textContent = "⏳ Connecting...";

  try {
    const r = await send("set_node", { node });
    if (!r.ok) return alert("Failed to connect node: " + r.error);

    statusEl.textContent = `🟢 Connected to ${node}`;
    updateStatusIndicators();

    // Fire custom event for other scripts
    document.dispatchEvent(new CustomEvent("nodeConnected", { detail: { node } }));

    if (typeof saveSettings === "function") saveSettings();
  } catch (e) {
    statusEl.textContent = "❌ Error connecting node";
    alert("Error: " + e.message);
  }
};

// ================= LOAD SCID =================
loadBtn.onclick = async () => {
  const scid = scidInput.value.trim();
  if (!scid) return alert("Enter SCID first");
  if (!nodeInput.value.trim()) return alert("Set node first");

  statusEl.textContent = "⏳ Loading SCID...";

  try {
    const r = await send("load_scid", { scid });
    if (!r.ok) {
      statusEl.textContent = "❌ Error: " + (r.error || "Unknown error");
      alert("Failed to load SCID: " + (r.error || "Unknown error"));
      return;
    }

    const url = r.result?.url;
    if (!url) {
      statusEl.textContent = "⚠ Loaded, but no URL returned";
      return;
    }

    statusEl.textContent = "✅ SCID loaded";
    window.open(url, "_blank");

    // Refresh search page SCID list
    const listResp = await send("list_scids");
    if (listResp.ok) updateSCIDList(listResp.result.scids);

  } catch (e) {
    statusEl.textContent = "❌ Error loading SCID";
    alert("Error: " + e.message);
  }
};

// ================= STATUS =================
async function updateStatusIndicators() {
  try {
    const r = await send("server_status");
    if (!r.ok) return;
    const connected = r.result.connected;

    setStatus(telaStatus, connected);
    setStatus(gnomonStatus, connected);
  } catch {}
}

setInterval(updateStatusIndicators, 5000);
updateStatusIndicators();


// ================= DEFAULT BOOKMARKS =================
const defaultBookmarks = {
  nodes: {
    "192.168.1.154:10102": { node: "192.168.1.154:10102", label: "Local Node" },
    "dero-node.net:10102": { node: "dero-node.net:10102", label: "Public Node" }
  },
  scids: {
    "a6832a5a09b82dc4b1034fd726b118da1df8ca9ad33e76bee4563e3f69d1d99a": {
      scid: "a6832a5a09b82dc4b1034fd726b118da1df8ca9ad33e76bee4563e3f69d1d99a",
      label: "Tela Demo"
    }
  }
};

// ================= BOOKMARKS =================
function saveBookmarks() {
  localStorage.setItem("tela_bookmarks", JSON.stringify(bookmarks));
  renderBookmarks();
  updateBookmarkButtons();
}

function updateBookmarkButtons() {
  bookmarkScidBtn.replaceChildren(createStarSVG());
  bookmarkNodeBtn.replaceChildren(createStarSVG());

  bookmarkScidBtn.classList.toggle("saved", !!bookmarks.scids[scidInput.value.trim()]);
  bookmarkNodeBtn.classList.toggle("saved", !!bookmarks.nodes[nodeInput.value.trim()]);
}

scidInput.oninput = updateBookmarkButtons;
nodeInput.oninput = updateBookmarkButtons;

bookmarkScidBtn.onclick = () => {
  const scid = scidInput.value.trim();
  if (!scid) return alert("Enter SCID first");

  const label = prompt("Label:", bookmarks.scids[scid]?.label || "");
  if (label === null) return;

  bookmarks.scids[scid] = { scid, label: label || scid.slice(0, 8) };
  saveBookmarks();
};

bookmarkNodeBtn.onclick = () => {
  const node = nodeInput.value.trim();
  if (!node) return alert("Enter node first");

  const label = prompt("Label:", bookmarks.nodes[node]?.label || "");
  if (label === null) return;

  bookmarks.nodes[node] = { node, label: label || node };
  saveBookmarks();
};

function renderBookmarks() {
  if (!bookmarkedNodesEl || !bookmarkedScidsEl) return;

  // Clear existing
  bookmarkedNodesEl.replaceChildren();
  bookmarkedScidsEl.replaceChildren();

  const nodes = Object.values(bookmarks.nodes);
  const scids = Object.values(bookmarks.scids);

  if (!nodes.length) bookmarkedNodesEl.appendChild(createNoResults("No bookmarked nodes"));
  else nodes.forEach(b => bookmarkedNodesEl.appendChild(createBookmarkItem(
    b.label, b.node,
    () => { nodeInput.value = b.node; updateBookmarkButtons(); },
    () => { delete bookmarks.nodes[b.node]; saveBookmarks(); }
  )));

  if (!scids.length) bookmarkedScidsEl.appendChild(createNoResults("No bookmarked SCIDs"));
  else scids.forEach(b => bookmarkedScidsEl.appendChild(createBookmarkItem(
    b.label, b.scid,
    () => { scidInput.value = b.scid; updateBookmarkButtons(); },
    () => { delete bookmarks.scids[b.scid]; saveBookmarks(); }
  )));
}

function createBookmarkItem(label, value, onLoad, onRemove) {
  const root = document.createElement("div");
  root.className = "bookmark-item";

  const info = document.createElement("div");
  info.className = "bookmark-info";

  const l = document.createElement("div");
  l.className = "bookmark-label";
  l.textContent = label;

  const v = document.createElement("div");
  v.className = "bookmark-value";
  v.textContent = value;

  const actions = document.createElement("div");
  actions.className = "bookmark-actions";

  const load = document.createElement("button");
  load.className = "small";
  load.textContent = "Load";
  load.onclick = onLoad;

  const remove = document.createElement("button");
  remove.className = "small danger";
  remove.textContent = "Remove";
  remove.onclick = onRemove;

  info.append(l, v);
  actions.append(load, remove);
  root.append(info, actions);
  return root;
}

// ================= INIT BOOKMARKS =================
function initBookmarks() {
  // Load bookmarks from localStorage or first-install defaults
  const storedBookmarks = localStorage.getItem("tela_bookmarks");
  if (storedBookmarks) {
    bookmarks = JSON.parse(storedBookmarks);
  } else {
    bookmarks = JSON.parse(JSON.stringify(defaultBookmarks));
    localStorage.setItem("tela_bookmarks", JSON.stringify(bookmarks));
  }

  // Render now
  renderBookmarks();
  updateBookmarkButtons();
}

// Run after DOM loaded
document.addEventListener("DOMContentLoaded", () => {
  initBookmarks();
});

// ================= EXTENSION CLOSE UNIFIED =================

let nativePort = null;

function connectNative() {
  if (!nativePort) {
    nativePort = RT.runtime.connectNative("purewolf.native");

    nativePort.onDisconnect.addListener(() => {
      console.log("Native port disconnected");
      nativePort = null;
    });
  }
  return nativePort;
}

function sendNative(msg) {
  try {
    const port = connectNative();
    port.postMessage(msg);
  } catch (e) {
    console.warn("Native send failed:", e);
  }
}

// ================= CHROME EXTENSION CLOSE =================
// Chrome-only suspend hook

if (RT.runtime.onSuspend) {
  RT.runtime.onSuspend.addListener(() => {
    console.log("Runtime suspended → shutdown native");
    sendNative({ cmd: "shutdown" });
  });
}


// ================= FIREFOX EXTENSION CLOSE =================
// Firefox / UI close fallback (also works in Chrome popups)

RT.runtime.onConnect.addListener(port => {
  port.onDisconnect.addListener(() => {
    console.log("Extension UI disconnected → shutdown native");
    sendNative({ cmd: "shutdown" });
  });
});

// Native binary hard-kill safety

while (read_message_from_stdin(msg)) {
  if (msg.cmd == "shutdown") {
    stop_all();
    exit(0);
  }
}

// stdin closed → browser died
stop_all();
exit(0);




