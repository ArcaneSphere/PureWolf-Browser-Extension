// ================= ELEMENTS =================
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggle-sidebar");
const statusEl = document.getElementById("status");
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");

const sidebarTelaStatus = document.getElementById("sidebar-tela-status");
const sidebarGnomonStatus = document.getElementById("sidebar-gnomon-status");

const pageTelaStatus = document.getElementById("page-tela-status");
const pageGnomonStatus = document.getElementById("page-gnomon-status");

const nodeInput = document.getElementById("node");
const connectNodeBtn = document.getElementById("connectNodeBtn");
const scidInput = document.getElementById("scid");
const loadBtn = document.getElementById("load");
const scidListEl = document.getElementById("scid-list");

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

function navigateTo(page) {
  navItems.forEach(n => n.classList.remove("active"));
  pages.forEach(p => p.classList.remove("active"));
  const navItem = document.querySelector(`[data-page=${page}]`);
  const pageEl  = document.getElementById(`page-${page}`);
  if (navItem) navItem.classList.add("active");
  if (pageEl)  pageEl.classList.add("active");
}

navItems.forEach(item => {
  item.onclick = () => navigateTo(item.dataset.page);
});

// Wire up all internal nav links — avoids CSP issues with inline onclick
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("a.nav-link[data-target]").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(a.dataset.target);
    });
  });
});

// ================= HELPERS =================
function send(cmd, params = {}) {
  return RT.runtime.sendMessage({ cmd, params });
}

// Creates a status dot span safely — no innerHTML
function createDot(state) {
  const span = document.createElement("span");
  span.className = "status-dot " + state;
  return span;
}

// Sets an element to [dot + text] safely using only DOM methods
function setDotText(el, state, text) {
  el.replaceChildren(createDot(state), document.createTextNode(" " + text));
}

function setStatus(el, running) {
  const icon = el.querySelector(".sb-icon");
  const text = el.querySelector(".sb-text");

  if (icon && text) {
    // Sidebar format
    icon.replaceChildren(createDot(running ? "connected" : "error"));
    text.textContent = running ? "Connected" : "Not connected";
  } else {
    // Plain span (page-server)
    setDotText(el, running ? "connected" : "error", running ? "Connected" : "Not connected");
  }
}

// ================= STAR SVG =================

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
  if (!scidListEl) return;

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

// ================= NODE CONNECT / DISCONNECT =================

function setNodeConnected(connected, node = "") {
  if (connected) {
    connectNodeBtn.textContent = "Disconnect";
    connectNodeBtn.classList.add("danger");
    nodeInput.disabled = true;
    setDotText(statusEl, "connected", "Connected to " + (node || nodeInput.value.trim()));
  } else {
    connectNodeBtn.textContent = "Connect";
    connectNodeBtn.classList.remove("danger");
    nodeInput.disabled = false;
    resetSyncProgress();
    if (!statusEl.textContent.startsWith("Error")) {
      setDotText(statusEl, "warning", "Waiting for node...");
    }
  }
}

connectNodeBtn.onclick = async () => {
  const isConnected = connectNodeBtn.textContent === "Disconnect";

  if (isConnected) {
    try {
      await send("disconnect_node");
    } catch (e) {}
    setNodeConnected(false);
    updateStatusIndicators();
    document.dispatchEvent(new CustomEvent("nodeDisconnected"));
    return;
  }

  const node = nodeInput.value.trim();
  if (!node) return alert("Enter node first");

  setDotText(statusEl, "pending", "Connecting...");
  connectNodeBtn.disabled = true;

  try {
    const r = await send("set_node", { node });
    if (!r.ok) {
      setDotText(statusEl, "error", "Failed to connect");
      alert("Failed to connect node: " + r.error);
      return;
    }
    setNodeConnected(true, node);
    updateStatusIndicators();
    document.dispatchEvent(new CustomEvent("nodeConnected", { detail: { node } }));
    if (typeof saveSettings === "function") saveSettings();
  } catch (e) {
    setDotText(statusEl, "error", "Error connecting node");
    alert("Error: " + e.message);
  } finally {
    connectNodeBtn.disabled = false;
  }
};


// ================= LOAD SCID =================
loadBtn.onclick = async () => {
  const scid = scidInput.value.trim();
  if (!scid) return alert("Enter SCID first");
  if (!nodeInput.value.trim()) return alert("Set node first");

  setDotText(statusEl, "pending", "Loading SCID...");

  try {
    const r = await send("load_scid", { scid });
    if (!r.ok) {
      setDotText(statusEl, "error", r.error || "Unknown error");
      alert("Failed to load SCID: " + (r.error || "Unknown error"));
      return;
    }

    const url = r.result?.url;
    if (!url) {
      setDotText(statusEl, "warning", "Loaded, but no URL returned");
      return;
    }

    setDotText(statusEl, "connected", "SCID loaded");
    window.open(url, "_blank");

    const listResp = await send("list_scids");
    if (listResp.ok) updateSCIDList(listResp.result.scids);

  } catch (e) {
    setDotText(statusEl, "error", "Error loading SCID");
    alert("Error: " + e.message);
  }
};

// ================= STATUS =================
async function updateStatusIndicators() {
  try {
    const r = await send("server_status");
    if (!r?.ok || !r?.result) return;

    const { tela, gnomon, connected, node, heights } = r.result;

    if (sidebarTelaStatus) setStatus(sidebarTelaStatus, tela);
    if (sidebarGnomonStatus) setStatus(sidebarGnomonStatus, gnomon);
    if (pageTelaStatus) setStatus(pageTelaStatus, tela);
    if (pageGnomonStatus) setStatus(pageGnomonStatus, gnomon);

    // Sync button state from server truth — fixes kill/reconnect desyncs
    const hasNode = !!node && connected;
    setNodeConnected(hasNode, node);

    if (heights) updateSyncProgress(heights.indexed, heights.chain);

  } catch (e) {
    console.warn("Status update failed:", e);
  }
}

setInterval(updateStatusIndicators, 5000);
updateStatusIndicators();

async function autoConnect() {
  loadSettings();
  if (!settings.defaultNode) return;

  nodeInput.value = settings.defaultNode;
  updateBookmarkButtons();

  setDotText(statusEl, "pending", "Auto-connecting...");
  try {
    const r = await send("set_node", { node: settings.defaultNode });
    if (r.ok) {
      setNodeConnected(true, settings.defaultNode);
      updateStatusIndicators();

      const status = await send("server_status");
      if (status.ok && status.result.heights) {
        updateSyncProgress(status.result.heights.indexed, status.result.heights.chain);
      }

      document.dispatchEvent(new CustomEvent("nodeConnected", { detail: { node: settings.defaultNode } }));
    }
  } catch (e) {
    setDotText(statusEl, "error", "Auto-connect failed");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initBookmarks();
  autoConnect();
});

// ================= DEFAULT BOOKMARKS =================
const defaultBookmarks = {
  nodes: {
    "127.0.0.1:10102": { node: "127.0.0.1:10102", label: "Local Node (default)" },
    "dero.geeko.cloud:10102": { node: "dero.geeko.cloud:10102", label: "Public Node" },
    "node.derofoundation.org:11012": { node: "node.derofoundation.org:11012", label: "Public Node" },
    "192.168.1.154:10102": { node: "192.168.1.154:10102", label: "PureWolf Devs" }
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
  const storedBookmarks = localStorage.getItem("tela_bookmarks");
  if (storedBookmarks) {
    bookmarks = JSON.parse(storedBookmarks);
  } else {
    bookmarks = JSON.parse(JSON.stringify(defaultBookmarks));
    localStorage.setItem("tela_bookmarks", JSON.stringify(bookmarks));
  }

  renderBookmarks();
  updateBookmarkButtons();
}

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

if (RT.runtime.onSuspend) {
  RT.runtime.onSuspend.addListener(() => {
    console.log("Runtime suspended → shutdown native");
    sendNative({ cmd: "shutdown" });
  });
}

RT.runtime.onConnect.addListener(port => {
  port.onDisconnect.addListener(() => {
    console.log("Extension UI disconnected → shutdown native");
    sendNative({ cmd: "shutdown" });
  });
});

// ================= SETTINGS =================
function saveSettings() {
  settings.defaultNode = document.getElementById("setting-default-node").value.trim();
  localStorage.setItem("purewolf_settings", JSON.stringify(settings));
}

function loadSettings() {
  const stored = localStorage.getItem("purewolf_settings");
  if (stored) settings = JSON.parse(stored);

  const defaultNodeInput = document.getElementById("setting-default-node");
  if (defaultNodeInput && settings.defaultNode) {
    defaultNodeInput.value = settings.defaultNode;
  }
}

const saveBtn = document.getElementById("save-settings");
if (saveBtn) {
  saveBtn.onclick = () => {
    saveSettings();
    alert("Settings saved");
  };
}

const resetBtn = document.getElementById("reset-settings");
if (resetBtn) {
  resetBtn.onclick = () => {
    settings = { autostart: false, refreshInterval: 3, defaultNode: "" };
    localStorage.removeItem("purewolf_settings");
    const input = document.getElementById("setting-default-node");
    if (input) input.value = "";
  };
}

function addCopyButtons() {
  document.querySelectorAll("pre").forEach(pre => {
    // Prevent duplicates
    if (pre.querySelector(".copy-btn")) return;

    const button = document.createElement("button");
    button.textContent = "Copy";
    button.className = "copy-btn";

    button.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      if (!code) return;

      try {
        await navigator.clipboard.writeText(code.innerText);

        button.textContent = "Copied ✓";
        button.classList.add("copied");

        setTimeout(() => {
          button.textContent = "Copy";
          button.classList.remove("copied");
        }, 1500);

      } catch (err) {
        console.error("Copy failed:", err);
      }
    });

    pre.appendChild(button);
  });
}

document.addEventListener("DOMContentLoaded", addCopyButtons);

// ================= SYNC PROGRESS =================
function updateSyncProgress(indexed, chain) {
  const syncInfo  = document.getElementById("sync-info");
  const syncLabel = document.getElementById("sync-label");
  const syncBar   = document.getElementById("sync-bar");
  const daemonEl  = document.getElementById("daemon-height");
  const dbEl      = document.getElementById("db-height");

  if (!syncInfo) { console.log("[sync] sync-info element not found!"); return; }

  syncInfo.style.display = "block";
  if (daemonEl) daemonEl.textContent = chain.toLocaleString();
  if (dbEl)     dbEl.textContent     = indexed.toLocaleString();

  const pct = chain > 0 ? Math.min(100, (indexed / chain) * 100) : 0;
  if (syncBar) syncBar.style.width = pct.toFixed(1) + "%";

  const wasSyncing = syncLabel && !syncLabel.textContent.includes("Synced");

  if (indexed >= chain - 3) {
    if (syncLabel) syncLabel.textContent = "Synced";
    // First time we hit synced — auto-reload search SCIDs
    if (wasSyncing && typeof window.loadSearchSCIDs === "function") {
      window.loadSearchSCIDs();
    }
  } else {
    if (syncLabel) syncLabel.textContent = pct.toFixed(1) + "% synced";
  }
}

function clearSyncProgress(height) {
  const syncLabel = document.getElementById("sync-label");
  const syncBar   = document.getElementById("sync-bar");
  const wasSyncing = syncLabel && !syncLabel.textContent.includes("Synced");
  if (syncLabel) syncLabel.textContent = "Synced";
  if (syncBar)   syncBar.style.width = "100%";
  // Auto-reload search SCIDs on sync_complete event
  if (wasSyncing && typeof window.loadSearchSCIDs === "function") {
    window.loadSearchSCIDs();
  }
}

RT.runtime.onMessage.addListener((msg) => {
  if (msg.event === "sync_progress") {
    updateSyncProgress(msg.indexed, msg.chain);
  } else if (msg.event === "sync_complete") {
    clearSyncProgress(msg.height);
  } else if (msg.cmd === "native_disconnect") {
    if (sidebarTelaStatus) setStatus(sidebarTelaStatus, false);
    if (sidebarGnomonStatus) setStatus(sidebarGnomonStatus, false);
    if (pageTelaStatus) setStatus(pageTelaStatus, false);
    if (pageGnomonStatus) setStatus(pageGnomonStatus, false);
    if (statusEl) statusEl.textContent = "🔴 Disconnected";
    const syncInfo  = document.getElementById("sync-info");
    const syncBar   = document.getElementById("sync-bar");
    const syncLabel = document.getElementById("sync-label");
    const daemonEl  = document.getElementById("daemon-height");
    const dbEl      = document.getElementById("db-height");
    if (syncInfo)  syncInfo.style.display = "none";
    if (syncBar)   syncBar.style.width = "0%";
    if (syncLabel) syncLabel.textContent = "";
    if (daemonEl)  daemonEl.textContent = "—";
    if (dbEl)      dbEl.textContent = "—";
  } else if (msg.cmd === "native_connect") {
    autoConnect();
    startSyncPolling();
  }
});

// ================= MESSAGE LISTENER =================
RT.runtime.onMessage.addListener((msg) => {
  if (msg.event === "sync_progress") {
    updateSyncProgress(msg.indexed, msg.chain);

  } else if (msg.event === "sync_complete") {
    clearSyncProgress();
    // Auto-reload search SCIDs now that sync is done
    if (typeof window.loadSearchSCIDs === "function") {
      window.loadSearchSCIDs();
    }  

    } else if (msg.event === "node_unreachable") {
      const nodeStr = typeof msg.node === "string" ? msg.node.replace("http://", "") : "";
      setDotText(statusEl, "warning", "Node unreachable: " + nodeStr);
      if (sidebarTelaStatus) setStatus(sidebarTelaStatus, false);
      if (sidebarGnomonStatus) setStatus(sidebarGnomonStatus, false);
      if (pageTelaStatus) setStatus(pageTelaStatus, false);
      if (pageGnomonStatus) setStatus(pageGnomonStatus, false);
      resetSyncProgress();

    } else if (msg.cmd === "native_disconnect") {
      if (sidebarTelaStatus) setStatus(sidebarTelaStatus, false);
      if (sidebarGnomonStatus) setStatus(sidebarGnomonStatus, false);
      if (pageTelaStatus) setStatus(pageTelaStatus, false);
      if (pageGnomonStatus) setStatus(pageGnomonStatus, false);
      if (statusEl) setDotText(statusEl, "error", "Disconnected");
      resetSyncProgress();

    } else if (msg.cmd === "native_connect") {
      if (statusEl) setDotText(statusEl, "pending", "Connecting...");
      setTimeout(updateStatusIndicators, 1000);
    }
});