import React, { useEffect, useMemo, useState } from "react";

const BANNER_SNOOZE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // Chrome/Edge/Firefox PWA
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari PWA
  if ((window.navigator as any).standalone === true) return true;
  return false;
}

function isiOSSafari(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in window);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  return iOS && isSafari;
}

function shouldSnooze(): boolean {
  if (typeof window === "undefined") return true;
  const until = localStorage.getItem("pwa-snooze-until");
  return !!until && Date.now() < Number(until);
}

export default function InstallPrompt() {
  const [deferredEvt, setDeferredEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  const showIOSCard = useMemo(() => {
    return !isStandalone() && isiOSSafari();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBIP = (e: Event) => {
      // Only Chrome/Edge/Android/desktop
      e.preventDefault();
      setDeferredEvt(e as BeforeInstallPromptEvent);
      if (!isStandalone() && !shouldSnooze()) setShowBanner(true);
    };

    const onInstalled = () => {
      try { localStorage.setItem("pwa-installed", "1"); } catch {}
      setShowBanner(false);
      setDeferredEvt(null);
    };

    window.addEventListener("beforeinstallprompt", onBIP as any);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleInstallClick() {
    if (!deferredEvt) return;
    // Show browser install prompt at a user-gesture time. :contentReference[oaicite:3]{index=3}
    await deferredEvt.prompt();
    const choice = await deferredEvt.userChoice;
    if (choice?.outcome === "accepted") {
      setShowBanner(false);
    } else {
      try {
        localStorage.setItem("pwa-snooze-until", String(Date.now() + BANNER_SNOOZE_MS));
      } catch {}
      setShowBanner(false);
    }
    setDeferredEvt(null);
  }

  function handleDismiss() {
    try {
      localStorage.setItem("pwa-snooze-until", String(Date.now() + BANNER_SNOOZE_MS));
    } catch {}
    setShowBanner(false);
  }

  // iOS helper (manual add flow). :contentReference[oaicite:4]{index=4}
  const IOSHelper = () => (
    <div style={{
      position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 1000,
      background: "#0b1220", color: "#fff", padding: "12px 14px",
      borderRadius: 12, boxShadow: "0 6px 24px rgba(0,0,0,.25)"
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Install Autodun</div>
      <div style={{ fontSize: 13, lineHeight: 1.35 }}>
        Open the <b>Share</b> sheet, then tap <b>Add to Home Screen</b>.
      </div>
      <button onClick={handleDismiss}
        style={{ marginTop: 10, background: "transparent", border: "1px solid #7c8499",
                 color: "#cdd3e0", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
        Dismiss
      </button>
    </div>
  );

  const Banner = () => (
    <div style={{
      position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 1000,
      background: "#0b1220", color: "#fff", padding: "12px 14px",
      borderRadius: 12, display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 6px 24px rgba(0,0,0,.25)"
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>Install Autodun</div>
        <div style={{ fontSize: 13, opacity: 0.9 }}>Get offline access & faster launch.</div>
      </div>
      <button onClick={handleInstallClick}
        style={{ background: "#38bdf8", border: "none", color: "#001520", fontWeight: 700,
                 borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
        Install
      </button>
      <button onClick={handleDismiss}
        aria-label="Dismiss"
        style={{ background: "transparent", border: "1px solid #7c8499",
                 color: "#cdd3e0", borderRadius: 10, padding: "8px 12px", cursor: "pointer" }}>
        Later
      </button>
    </div>
  );

  // Don’t render in standalone or when snoozed.
  if (isStandalone() || shouldSnooze()) return null;

  return (
    <>
      {showIOSCard && <IOSHelper />}
      {deferredEvt && showBanner && !showIOSCard && <Banner />}
    </>
  );
}
