import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function Portal({ children, containerId = "portal-root" }) {
  const [el, setEl] = useState(null);

  useEffect(() => {
    let node = document.getElementById(containerId);
    if (!node) {
      node = document.createElement("div");
      node.id = containerId;
      document.body.appendChild(node);
    }
    setEl(node);
  }, [containerId]);

  return el ? createPortal(children, el) : null;
}
