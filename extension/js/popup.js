const RT = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const openDashboardBtn = document.getElementById("open-dashboard");
  const startServerBtn = document.getElementById("start-server");
  const stopServerBtn = document.getElementById("stop-server");
  const toggleConnBtn = document.getElementById("toggle-connection");

  function send(cmd, params = {}) {
    return RT.runtime.sendMessage({ cmd, params });
  }

  // ✅ Create real DOM element instead of HTML string
  function createDot(state) {
    const span = document.createElement("span");
    span.className = `status-dot ${state}`;
    return span;
  }

  // ✅ Safe status setter
  function setStatus(state, message) {
    statusEl.textContent = ""; // clear safely
    statusEl.appendChild(createDot(state));
    statusEl.append(` ${message}`);
  }

  async function checkStatus() {
    try {
      const ping = await RT.runtime.sendMessage({ cmd: "native_ping" });
      const alive = ping && ping.ok && ping.alive;

      if (alive) {
        setStatus("connected", "Native Running");

        if (toggleConnBtn) {
          toggleConnBtn.textContent = "⏏ Disconnect";
          toggleConnBtn.dataset.state = "connected";
        }
      } else {
        setStatus("error", "Not Running");

        if (toggleConnBtn) {
          toggleConnBtn.textContent = "🔌 Connect";
          toggleConnBtn.dataset.state = "disconnected";
        }
      }
    } catch (e) {
      setStatus("error", `Error: ${e.message}`);
    }
  }

  // ------------------------
  // Theme
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
        setStatus("pending", "Disconnecting...");
        try {
          await RT.runtime.sendMessage({ cmd: "native_disconnect" });

          setStatus("error", "Disconnected");

          toggleConnBtn.textContent = "🔌 Connect";
          toggleConnBtn.dataset.state = "disconnected";
        } catch (e) {
          setStatus("error", `Error: ${e.message}`);
        }
      } else {
        setStatus("pending", "Connecting...");
        try {
          await RT.runtime.sendMessage({ cmd: "native_connect" });
          setTimeout(checkStatus, 800);
        } catch (e) {
          setStatus("error", `Error: ${e.message}`);
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
      setStatus("pending", "Starting...");

      try {
        const r = await send("server_start");

        if (r.ok) {
          setStatus("connected", "Server Started");
        } else {
          setStatus("error", "Failed to start");
        }
      } catch (e) {
        setStatus("error", `Error: ${e.message}`);
      }

      setTimeout(checkStatus, 1000);
    };
  }

  if (stopServerBtn) {
    stopServerBtn.onclick = async () => {
      setStatus("pending", "Stopping...");

      try {
        const r = await send("server_stop");

        if (r.ok) {
          setStatus("error", "Server Stopped");
        } else {
          setStatus("error", "Failed to stop");
        }
      } catch (e) {
        setStatus("error", `Error: ${e.message}`);
      }

      setTimeout(checkStatus, 1000);
    };
  }

  window.addEventListener("beforeunload", () => {
    RT.runtime.sendMessage({ type: "ui_closed" });
  });

  checkStatus();
  setInterval(checkStatus, 3000);
});