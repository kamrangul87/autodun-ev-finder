"use client";

import React from "react";

type Props = { children: React.ReactNode };

export default class SafeBoundary extends React.Component<Props, { hasError: boolean }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Keep this console, it’s invaluable in Vercel previews
    // You’ll see the real stack instead of the generic white screen.
    // eslint-disable-next-line no-console
    console.error("[StationDrawer] crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      // Fail soft: don’t render the drawer at all if it crashed.
      return null;
    }
    return this.props.children;
  }
}
