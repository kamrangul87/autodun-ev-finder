"use client";
import React from "react";
import { createPortal } from "react-dom";

type Props = { children: React.ReactNode };

export default function DrawerPortalWrapper({ children }: Props) {
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    let el = document.getElementById("station-drawer-root") as HTMLElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = "station-drawer-root";
      document.body.appendChild(el);
    }
    setHost(el);
  }, []);

  if (!host) return null;

  return createPortal(
    <div
      id="station-drawer"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        width: "min(420px, 92vw)",
        maxHeight: "72vh",
        overflow: "auto",
        zIndex: 1000,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 12px 28px rgba(0,0,0,.28)",
        border: "1px solid rgba(0,0,0,.06)",
      }}
    >
      {children}
    </div>,
    host
  );
}
