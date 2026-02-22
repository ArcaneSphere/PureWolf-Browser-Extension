const RT = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const openDashboardBtn = document.getElementById("open-dashboard");
  const startServerBtn = document.getElementById("start-server");
  const stopServerBtn = document.getElementById("stop-server");

  const toggleConnBtn = document.getElementById("toggle-connection");

  // Track whether user has manually disconnected
  let manuallyDisconnected = false;

  function send(cmd, params = {}) {
    return RT.runtime.sendMessage({ cmd, params });
  }

  async function checkStatus() {
    try {
      // Use native_ping to check if purewolf-native is alive — this works
      // regardless of whether a node is connected in the dashboard.
      const ping = await RT.runtime.sendMessage({ cmd: "native_ping" });
      const alive = ping && ping.ok && ping.alive;

      if (alive) {
        statusEl.textContent = "🟢 Native Running";
        if (toggleConnBtn) {
          toggleConnBtn.textContent = "⏏ Disconnect";
          toggleConnBtn.dataset.state = "connected";
        }
      } else {
        statusEl.textContent = manuallyDisconnected
          ? "🔴 Disconnected"
          : "🔴 Native Stopped";
        if (toggleConnBtn) {
          toggleConnBtn.textContent = "🔌 Reconnect";
          toggleConnBtn.dataset.state = "disconnected";
        }
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
  if (toggleConnBtn) {
    toggleConnBtn.onclick = async () => {
      const state = toggleConnBtn.dataset.state;
      if (state === "connected") {
        // Disconnect
        statusEl.textContent = "⏳ Disconnecting...";
        manuallyDisconnected = true;
        try {
          await RT.runtime.sendMessage({ cmd: "native_disconnect" });
          statusEl.textContent = "🔴 Disconnected";
          toggleConnBtn.textContent = "🔌 Reconnect";
          toggleConnBtn.dataset.state = "disconnected";
        } catch (e) {
          statusEl.textContent = "❌ Error: " + e.message;
        }
      } else {
        // Reconnect
        statusEl.textContent = "⏳ Reconnecting...";
        manuallyDisconnected = false;
        try {
          await RT.runtime.sendMessage({ cmd: "native_reconnect" });
          setTimeout(checkStatus, 800);
        } catch (e) {
          statusEl.textContent = "❌ Error: " + e.message;
        }
      }
    };
  }


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