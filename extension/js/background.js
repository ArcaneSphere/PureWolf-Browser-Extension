// background.js
let port = null;
let pending = {};

function connectNative() {
  if (port) return;

  console.log("Connecting to native host…");

  port = browser.runtime.connectNative("com.purewolf");

  port.onMessage.addListener(msg => {
    if (msg.id && pending[msg.id]) {
      pending[msg.id](msg);
      delete pending[msg.id];
    }
  });

  port.onDisconnect.addListener(() => {
    console.error("Native disconnected", browser.runtime.lastError);
    port = null;
    setTimeout(connectNative, 1000);
  });
}

connectNative();

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!port) {
    sendResponse({ ok: false, error: "native_not_connected" });
    return;
  }

  const id = Date.now() + Math.random();

  pending[id] = sendResponse;

  port.postMessage({
    proto: "tela-nm/1",
    id,
    cmd: msg.cmd,
    params: msg.params || {}
  });

  return true;
});
