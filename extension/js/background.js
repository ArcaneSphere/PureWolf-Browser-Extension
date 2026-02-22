// background.js
const RT = typeof browser !== "undefined" ? browser : chrome;

let nativePort = null;
let pending = {};
let reconnectTimer = null;

let userDisconnected = false;

function connectNative() {
  if (nativePort) return;

  console.log("[native] connecting…");
  userDisconnected = false;

  try {
    nativePort = RT.runtime.connectNative("com.purewolf");

    nativePort.onMessage.addListener(onNativeMessage);
    nativePort.onDisconnect.addListener(onNativeDisconnect);

  } catch (e) {
    console.error("[native] connect failed", e);
    scheduleReconnect();
  }
}

function onNativeMessage(msg) {
  // Handle responses to pending requests
  if (msg.id && pending[msg.id]) {
    pending[msg.id](msg);
    delete pending[msg.id];
    return;
  }

  // Forward native events (sync_progress, sync_complete, etc.) to dashboard
  if (msg.event) {
    RT.runtime.sendMessage(msg).catch(() => {
      // Dashboard may not be open — ignore
    });
  }
}

function onNativeDisconnect() {
  console.warn("[native] disconnected", RT.runtime.lastError);
  nativePort = null;
  if (!userDisconnected) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNative();
  }, 1000);
}

// Send to native
function sendNative(cmd, params = {}) {
  return new Promise((resolve, reject) => {
    if (!nativePort) {
      reject(new Error("native_not_connected"));
      return;
    }

    const id = Date.now() + Math.random();

    pending[id] = resolve;

    try {
      nativePort.postMessage({
        proto: "tela-nm/1",
        id,
        cmd,
        params
      });
    } catch (e) {
      delete pending[id];
      reject(e);
    }
  });
}

/* ===================== EXTENSION MESSAGE API ===================== */

RT.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // UI lifecycle only
  if (msg.type === "ui_closed") {
    console.log("[popup] closed (UI detached)");
    sendResponse({ ok: true });
    return;
  }

  // Disconnect: kill the native host and clear the port
  if (msg.cmd === "native_disconnect") {
    userDisconnected = true;
    // Cancel any pending reconnect so we stay disconnected
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (nativePort) {
      // Send shutdown via the proper protocol envelope the native host expects,
      // then force-disconnect the port after a short grace period
      try {
        nativePort.postMessage({ proto: "tela-nm/1", id: Date.now(), cmd: "shutdown", params: {} });
      } catch {}
      const portRef = nativePort;
      nativePort = null;
      setTimeout(() => { try { portRef.disconnect(); } catch {} }, 300);
    }
    // Broadcast to dashboard so it can update status indicators immediately
    RT.runtime.sendMessage({ cmd: "native_disconnect" }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  // Reconnect: re-establish native connection
  if (msg.cmd === "native_reconnect") {
    connectNative();
    // Broadcast to dashboard so it can show reconnecting state
    RT.runtime.sendMessage({ cmd: "native_reconnect" }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

   // Native port alive check — answers regardless of node connection state
  if (msg.cmd === "native_ping") {
    sendResponse({ ok: true, alive: !!nativePort });
    return;
  }

  // Native bridge
  if (!nativePort) {
    sendResponse({ ok: false, error: "native_not_connected" });
    return;
  }

  sendNative(msg.cmd, msg.params)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: err.message }));

  return true; // keep channel open
});


/* ===================== LIFECYCLE ===================== */

// Chrome / MV3
if (RT.runtime.onSuspend) {
  RT.runtime.onSuspend.addListener(() => {
    console.log("[ext] suspended → shutting down native");
    try { nativePort?.postMessage({ cmd: "shutdown" }); } catch {}
  });
}

// Firefox background unload
if (RT.runtime.onConnect) {
  RT.runtime.onConnect.addListener(port => {
    port.onDisconnect.addListener(() => {
      console.log("[ext] UI disconnected → shutdown native");
      try { nativePort?.postMessage({ cmd: "shutdown" }); } catch {}
    });
  });
}

/* ===================== START ===================== */

connectNative();