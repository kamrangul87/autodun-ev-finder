import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function StationDrawer({ open, onClose, station }) {
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      // Focus the panel
      setTimeout(() => {
        if (panelRef.current) {
          panelRef.current.focus();
        }
      }, 100);

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // ESC key handler
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open || !panelRef.current) return;

    const panel = panelRef.current;
    const focusableElements = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    panel.addEventListener('keydown', handleTab);
    return () => panel.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open || !station) return null;

  const stationName = station.name || station.title || 'Charging Station';
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

  const drawerContent = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          zIndex: 10000,
        }}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '400px',
          maxWidth: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          boxShadow: '-12px 0 24px rgba(0, 0, 0, 0.18)',
          zIndex: 10001,
        }}
      >
        {/* Header - Sticky */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            padding: '16px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, paddingRight: '8px' }}>
              <h2
                id="drawer-title"
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#111827',
                  lineHeight: '1.4',
                }}
              >
                {stationName}
              </h2>
              {station.address && (
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#6b7280' }}>
                  {station.address}
                  {station.postcode && `, ${station.postcode}`}
                </p>
              )}
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close drawer"
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: 'transparent',
                color: '#6b7280',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Content - Scrollable */}
        <section
          className="drawer-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
          }}
        >
          {/* Station Details */}
          {(station.connectors !== undefined || station.source) && (
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
              {station.connectors !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                  <span style={{ fontWeight: '500', color: '#374151' }}>Connectors:</span>
                  <span style={{ fontWeight: '600', color: '#111827' }}>{station.connectors}</span>
                </div>
              )}
              {station.source && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ fontWeight: '500', color: '#374151' }}>Source:</span>
                  <span style={{ fontSize: '12px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {station.source}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Directions Button */}
          
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '12px 16px',
              marginBottom: '16px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '8px',
              fontWeight: '500',
              fontSize: '15px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Get Directions
          </a>

          {/* Feedback Form */}
          <form
            action="/api/feedback"
            method="POST"
            style={{
              padding: '12px',
              backgroundColor: '#f0fdf4',
              borderRadius: '8px',
            }}
          >
            <input type="hidden" name="stationId" value={station.id} />
            
            <label
              htmlFor="feedback-note"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
              }}
            >
              Quick Feedback
            </label>
            <textarea
              id="feedback-note"
              name="note"
              rows={4}
              placeholder="Share your experience..."
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
                marginBottom: '12px',
              }}
            />
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '500',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#059669')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#10b981')}
            >
              Submit Feedback
            </button>
          </form>
        </section>

        {/* Footer - Sticky */}
        <footer
          style={{
            position: 'sticky',
            bottom: 0,
            padding: '12px 16px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
          }}
        >
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontWeight: '500',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#e5e7eb')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f3f4f6')}
          >
            Close
          </button>
        </footer>
      </aside>
    </>
  );

  return createPortal(drawerContent, document.body);
}
