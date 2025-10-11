import React, { useEffect, useRef, useState } from 'react';
import styles from './StationDrawer.module.css';

type Station = {
  id: string;
  title: string;
  address?: string;
  connectors?: number;
  coords: [number, number];
};

type Props = {
  open: boolean;
  station: Station | null;
  onClose: () => void;
  onSubmitFeedback: (args: {
    stationId: string;
    rating: 'good' | 'bad';
    comment?: string;
  }) => Promise<void> | void;
  onDirections?: (coords: [number, number]) => void;
};

export default function StationDrawer({
  open,
  station,
  onClose,
  onSubmitFeedback,
  onDirections,
}: Props) {
  const [rating, setRating] = useState<'good' | 'bad' | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (open) {
      setRating(null);
      setComment('');
      document.body.style.overflow = 'hidden';
      setTimeout(() => firstFocusableRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !drawerRef.current) return;

    const drawer = drawerRef.current;
    const focusableElements = drawer.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    drawer.addEventListener('keydown', trapFocus);
    return () => drawer.removeEventListener('keydown', trapFocus);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!station || !rating) return;

    setSubmitting(true);
    try {
      await onSubmitFeedback({
        stationId: station.id,
        rating,
        comment: comment.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Feedback submission failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !station) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <button
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          ×
        </button>

        <div className={styles.content}>
          <h2 ref={firstFocusableRef} id="drawer-title" tabIndex={-1}>
            {station.title}
          </h2>

          {station.address && (
            <p className={styles.address}>{station.address}</p>
          )}

          {station.connectors !== undefined && (
            <p className={styles.connectors}>
              {station.connectors} {station.connectors === 1 ? 'connector' : 'connectors'}
            </p>
          )}

          {onDirections && (
            <button
              type="button"
              className={styles.directionsButton}
              onClick={() => onDirections(station.coords)}
            >
              Get Directions
            </button>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Rate this station</legend>
              <div className={styles.ratingButtons}>
                <button
                  type="button"
                  className={`${styles.ratingButton} ${rating === 'good' ? styles.active : ''}`}
                  onClick={() => setRating('good')}
                  aria-pressed={rating === 'good'}
                >
                  👍 Good
                </button>
                <button
                  type="button"
                  className={`${styles.ratingButton} ${rating === 'bad' ? styles.active : ''}`}
                  onClick={() => setRating('bad')}
                  aria-pressed={rating === 'bad'}
                >
                  👎 Bad
                </button>
              </div>
            </fieldset>

            <div className={styles.formGroup}>
              <label htmlFor="comment" className={styles.label}>
                Comments (optional)
              </label>
              <textarea
                id="comment"
                className={styles.textarea}
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 280))}
                maxLength={280}
                rows={4}
                placeholder="Share your experience..."
              />
              <div className={styles.charCount}>{comment.length}/280</div>
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={!rating || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
