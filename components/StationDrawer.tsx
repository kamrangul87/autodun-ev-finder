import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Station {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

interface StationDrawerProps {
  station: Station | null;
  onClose: () => void;
  onFeedbackSubmit?: (stationId: string, vote: 'good' | 'bad', comment: string) => void;
}

export function StationDrawer({ station, onClose, onFeedbackSubmit }: StationDrawerProps) {
  const [vote, setVote] = useState<'good' | 'bad' | null>(null);
  const [comment, setComment] = useState('');
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (station) {
      setVote(null);
      setComment('');
    }
  }, [station]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && station) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [station, onClose]);

  const handleSubmit = async () => {
    if (!vote || !station) return;
    
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: station.id,
          vote,
          comment: comment.trim(),
          timestamp: new Date().toISOString()
        })
      });
      
      onFeedbackSubmit?.(station.id, vote, comment);
      setVote(null);
      setComment('');
      onClose();
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const handleCancel = () => {
    setVote(null);
    setComment('');
    onClose();
  };

  const handleDirections = () => {
    if (!station) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`, '_blank');
  };

  if (!station) return null;

  const drawer = (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 9998
        }}
      />

      <div
        ref={drawerRef}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'white',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
          padding: '20px',
          zIndex: 9999,
          maxHeight: '80vh',
          overflow: 'auto'
        }}
      >
        <div style={{ marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#111' }}>
            {station.name}
          </h2>
        </div>

        {station.address && (
          <p style={{ fontSize: '14px', color: '#666', margin: '8px 0 16px 0' }}>
            {station.address}
          </p>
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={() => setVote('good')}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '14px',
              fontWeight: '500',
              border: vote === 'good' ? '2px solid #10b981' : '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: vote === 'good' ? '#d1fae5' : 'white',
              color: '#111',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            😊 Good
          </button>
          <button
            onClick={() => setVote('bad')}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '14px',
              fontWeight: '500',
              border: vote === 'bad' ? '2px solid #ef4444' : '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: vote === 'bad' ? '#fee2e2' : 'white',
              color: '#111',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            😞 Bad
          </button>
        </div>

        {vote && (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment (e.g., price, access, reliability)..."
            maxLength={280}
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '10px',
              fontSize: '14px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              marginBottom: '12px',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
          />
        )}

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={handleSubmit}
            disabled={!vote}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '15px',
              fontWeight: '600',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: vote ? '#2563eb' : '#d1d5db',
              color: 'white',
              cursor: vote ? 'pointer' : 'not-allowed',
              opacity: vote ? 1 : 0.6
            }}
          >
            Submit feedback
          </button>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: '12px',
              fontSize: '15px',
              fontWeight: '600',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: 'white',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>

        <button
          onClick={handleDirections}
          style={{
            width: '100%',
            padding: '0',
            fontSize: '14px',
            fontWeight: '500',
            border: 'none',
            background: 'none',
            color: '#2563eb',
            cursor: 'pointer',
            textAlign: 'left',
            textDecoration: 'none'
          }}
        >
          Get directions →
        </button>
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}
