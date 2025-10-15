import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function StationDrawer({ open, onClose, station }) {
  const panelRef = useRef(null);

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

  // NO ESC HANDLER - User must click X or Close button
  // NO BACKDROP CLOSE - User must click X or Close button
  // NO AUTO-CLOSE - User must click X or Close button

  if (!open || !station) return null;

  const stationName = station.name || station.title || 'Charging Station';
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

  const drawerContent = (
    <>
      {/* Backdrop - dimming only, does NOT close on click */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 10000,
          pointerEvents: 'none', // Let clicks pass through to map
        }}
        aria-hidden="true"
      />

      {/* Drawer Panel - User must click X or Close to dismiss */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="drawer-title"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '420px',
          maxWidth: '90vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          boxShadow: '-12px 0 24px rgba(0, 0, 0, 0.25)',
          zIndex: 10001,
          pointerEvents: 'auto', // Drawer itself is clickable
        }}
      >
        {/* Header - Sticky with Close X */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            padding: '20px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1, paddingRight: '12px' }}>
              <h2
                id="drawer-title"
                style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: '600',
                  color: '#111827',
                  lineHeight: '1.3',
                }}
              >
                {stationName}
              </h2>
              {station.address && (
                <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#6b7280', lineHeight: '1.5' }}>
                  {station.address}
                  {station.postcode && `, ${station.postcode}`}
                </p>
              )}
            </div>
            {/* X Button - ONLY way to close (besides footer Close button) */}
            <button
              onClick={onClose}
              aria-label="Close drawer"
              title="Close"
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e5e7eb';
                e.currentTarget.style.color = '#111827';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.color = '#374151';
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Content - Scrollable */}
        <section
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
          }}
        >
          {/* Station Info Card */}
          {(station.connectors !== undefined || station.source) && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '16px', 
              backgroundColor: '#f9fafb', 
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
            }}>
              {station.connectors !== undefined && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  marginBottom: station.source ? '12px' : '0',
                  fontSize: '15px',
                }}>
                  <span style={{ fontWeight: '500', color: '#374151' }}>Connectors</span>
                  <span style={{ fontWeight: '700', color: '#111827', fontSize: '16px' }}>
                    {station.connectors}
                  </span>
                </div>
              )}
              {station.source && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px' }}>
                  <span style={{ fontWeight: '500', color: '#374151' }}>Data Source</span>
                  <span style={{ 
                    fontSize: '12px', 
                    color: '#6b7280', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em',
                    fontWeight: '600',
                  }}>
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
              gap: '10px',
              width: '100%',
              padding: '14px 20px',
              marginBottom: '20px',
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              textDecoration: 'none',
              borderRadius: '10px',
              fontWeight: '600',
              fontSize: '15px',
              transition: 'all 0.2s',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
            }}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Get Directions
          </a>

          {/* Feedback Form */}
          <div style={{ 
            padding: '16px', 
            backgroundColor: '#f0fdf4', 
            borderRadius: '10px',
            border: '1px solid #d1fae5',
          }}>
            <form action="/api/feedback" method="POST">
              <input type="hidden" name="stationId" value={station.id} />
              
              <label
                htmlFor="feedback-note"
                style={{
                  display: 'block',
                  marginBottom: '10px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#065f46',
                }}
              >
                Share Your Experience
              </label>
              <textarea
                id="feedback-note"
                name="note"
                rows={4}
                placeholder="Tell us about your charging experience at this station..."
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1fae5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  marginBottom: '12px',
                  backgroundColor: '#ffffff',
                  color: '#111827',
                }}
              />
              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#059669';
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#10b981';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                }}
              >
                Submit Feedback
              </button>
            </form>
          </div>
        </section>

        {/* Footer - Sticky with Close button */}
        <footer
          style={{
            position: 'sticky',
            bottom: 0,
            padding: '16px 20px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#ffffff',
          }}
        >
          {/* Close Button - Alternative way to close */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 20px',
              backgroundColor: '#f9fafb',
              color: '#374151',
              border: '2px solid #e5e7eb',
              borderRadius: '10px',
              fontWeight: '600',
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#111827';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.color = '#374151';
            }}
          >
            Close
          </button>
        </footer>
      </aside>
    </>
  );

  return createPortal(drawerContent, document.body);
}
