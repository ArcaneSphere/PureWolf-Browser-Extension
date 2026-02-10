const RT = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const openDashboardBtn = document.getElementById("open-dashboard");
  const startServerBtn = document.getElementById("start-server");
  const stopServerBtn = document.getElementById("stop-server");

  function send(cmd, params = {}) {
    return RT.runtime.sendMessage({ cmd, params });
  }

  async function checkStatus() {
    try {
      const r = await send("server_status");
      if (r && r.ok && r.result) {
        statusEl.textContent = r.result.connected
          ? "🟢 Server Running"
          : "🔴 Server Stopped";
      } else {
        statusEl.textContent = "⚠ No connection";
      }
    } catch (e) {
      statusEl.textContent = "❌ Error: " + e.message;
    }
  }

  // ------------------------
  // Light / Dark / System switching
  // ------------------------
  const theme = localStorage.getItem("theme") || "dark";

  function applyTheme() {
    if (theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }

  applyTheme();

  // ------------------------
  // Button handlers
  // ------------------------
  if (openDashboardBtn) {
    openDashboardBtn.onclick = () => {
      const url = RT.runtime.getURL("dashboard/dashboard.html");
      RT.tabs.create({ url });
    };
  }

  if (startServerBtn) {
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
  }

  if (stopServerBtn) {
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
  }

  window.addEventListener("beforeunload", () => {
    RT.runtime.sendMessage({ type: "ui_closed" });
  });

  // Check status on load and repeat
  checkStatus();
  setInterval(checkStatus, 3000);
});