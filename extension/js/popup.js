// popup.js

const statusEl = document.getElementById("status");
const openDashboardBtn = document.getElementById("open-dashboard");
const startServerBtn = document.getElementById("start-server");
const stopServerBtn = document.getElementById("stop-server");

// ------------------------
// Light / Dark / System switching
// ------------------------

const theme = localStorage.getItem("theme") || "system";

function applyTheme() {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

applyTheme();

// ------------------------
// Controls
// ------------------------

function send(cmd, params = {}) {
  return browser.runtime.sendMessage({ cmd, params });
}

async function checkStatus() {
  try {
    const r = await send("server_status");
    if (r && r.ok && r.result) {
      statusEl.textContent = r.result.running ? "🟢 Server Running" : "🔴 Server Stopped";
    } else {
      statusEl.textContent = "⚠ No connection";
    }
  } catch (e) {
    statusEl.textContent = "❌ Error: " + e.message;
  }
}

openDashboardBtn.onclick = () => {
  const url = browser.runtime.getURL("dashboard/dashboard.html");
  browser.tabs.create({ url });
};


startServerBtn.onclick = async () => {
  statusEl.textContent = "⏳ Starting...";
  try {
    const r = await send("server_start");
    if (r.ok) {
      statusEl.textContent = "🟢 Server Started";
    } else {
      statusEl.textContent = "❌ Failed to start";
    }
  } catch (e) {
    statusEl.textContent = "❌ Error: " + e.message;
  }
  setTimeout(checkStatus, 1000);
};

stopServerBtn.onclick = async () => {
  statusEl.textContent = "⏳ Stopping...";
  try {
    const r = await send("server_stop");
    if (r.ok) {
      statusEl.textContent = "🔴 Server Stopped";
    } else {
      statusEl.textContent = "❌ Failed to stop";
    }
  } catch (e) {
    statusEl.textContent = "❌ Error: " + e.message;
  }
  setTimeout(checkStatus, 1000);
};

// Check status on load
checkStatus();
setInterval(checkStatus, 3000);