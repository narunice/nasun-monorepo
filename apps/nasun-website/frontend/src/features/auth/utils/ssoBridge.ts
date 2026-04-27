const BRIDGE_ORIGIN = "https://nasun.io";
const BRIDGE_URL = `${BRIDGE_ORIGIN}/sso-bridge.html`;
const TIMEOUT_MS = 4000;

// Fetch the nasun.io session profile via a hidden iframe + postMessage.
// No credentials are written to any cookie; data travels in browser memory only.
// Returns the raw JSON string stored in nasun.io's localStorage, or null.
export function fetchSsoBridgeProfile(): Promise<string | null> {
  return new Promise((resolve) => {
    // Only meaningful when called from a different subdomain of nasun.io
    if (window.location.hostname === "nasun.io") {
      resolve(null);
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.src = BRIDGE_URL;
    iframe.style.cssText = "display:none;width:0;height:0;border:0;position:absolute;";
    iframe.setAttribute("aria-hidden", "true");

    let settled = false;

    function finish(value: string | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      resolve(value);
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== BRIDGE_ORIGIN) return;
      if (!e.data || e.data.type !== "SSO_RESPONSE") return;
      finish(typeof e.data.profile === "string" ? e.data.profile : null);
    }

    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    window.addEventListener("message", onMessage);

    iframe.onload = () => {
      iframe.contentWindow?.postMessage({ type: "REQUEST_SSO" }, BRIDGE_ORIGIN);
    };

    iframe.onerror = () => finish(null);

    document.body.appendChild(iframe);
  });
}
