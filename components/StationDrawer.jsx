import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Station {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  connectors?: Array<{ type: string; count: number }>;
}

interface StationDrawerProps {
  /** whether the drawer is visible */
  open: boolean;
  /** selected station (or null) */
  station: Station | null;
  /** called when the user clicks “×” or presses Escape */
  onClose: () => void;
  /** optional feedback handler */
  onFeedbackSubmit?: (stationId: string, vote: 'good' | 'bad', comment: string) => void;
}

export function StationDrawer({
  open,
  station,
  onClose,
  onFeedbackSubmit
}: StationDrawerProps) {
  // reset form & focus on close button when station changes
  const [vote, setVote] = useState<'good' | 'bad' | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (station) {
      setVote(null);
      setComment('');
      setIsSubmitting(false);
      setTimeout(() => closeButtonRef.current?.focus(), 100);
    }
  }, [station]);

  // close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // prevent outside focus jumping when drawer is open
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    const drawer = drawerRef.current;
    const focusable = drawer.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    drawer.addEventListener('keydown', trap as any);
    return () => drawer.removeEventListener('keydown', trap as any);
  }, [open]);

  // only render when open & station present
  if (!open || !station) return null;

  // … existing feedback submission, cancel, directions handlers stay unchanged …
  // (keep handleSubmit, handleCancel, handleDirections and UI markup exactly as before)

  // totalConnectors calculation remains unchanged
  const totalConnectors = station.connectors
    ? Array.isArray(station.connectors)
      ? station.connectors.reduce((sum, c) => sum + c.count, 0)
      : 0
    : 0;

  const drawer = (
    <>
      {/* Mobile backdrop (no onClick to prevent auto‑close) */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 lg:hidden"
        style={{ zIndex: 9998 }}
        aria-hidden="true"
      />
      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className="fixed bg-white overflow-auto left-0 right-0 bottom-0 h-[55vh] rounded-t-2xl
                   lg:top-[70px] lg:right-0 lg:left-auto lg:bottom-auto lg:w-[380px]
                   lg:h-[calc(100vh-70px)] lg:rounded-none lg:border-l lg:border-gray-200"
        style={{
          zIndex: 9999,
          boxShadow: '0 10px 30px rgba(0,0,0,0.12)'
        }}
      >
        {/* header with close button, content, feedback form, etc. (unchanged) */}
        {/* … */}
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}

// provide both default and named exports
export default StationDrawer;
export { StationDrawer };
