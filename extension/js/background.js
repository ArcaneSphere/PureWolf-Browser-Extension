// background.js
const RT = typeof browser !== "undefined" ? browser : chrome;

let nativePort = null;
let pending = {};
let reconnectTimer = null;

function connectNative() {
  if (nativePort) return;

  console.log("[native] connecting…");

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
  if (msg.id && pending[msg.id]) {
    pending[msg.id](msg);
    delete pending[msg.id];
  }
}

function onNativeDisconnect() {
  console.warn("[native] disconnected", RT.runtime.lastError);
  nativePort = null;
  scheduleReconnect();
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
    return; // stop here
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