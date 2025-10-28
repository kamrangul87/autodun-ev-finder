'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '@/utils/useLockBodyScroll';
import styles from './bottom-sheet.module.css';

const SHEET_HEIGHTS = {
  peek: 72,
  half: 0.5,
  full: 0.9,
};

const SNAP_POINTS = ['peek', 'half', 'full'];
const VELOCITY_THRESHOLD = 500;

export const BottomSheet = ({
  isOpen,
  initialState = 'half',
  onRequestClose,
  onStateChange,
  header,
  children,
  footer,
  ariaLabel,
}) => {
  const [currentState, setCurrentState] = useState(initialState);
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef(null);
  const handleRef = useRef(null);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastYRef = useRef(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLockBodyScroll(isOpen);

  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;

    previousFocusRef.current = document.activeElement;
    const focusables = sheetRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onRequestClose();
        return;
      }
      if (e.key === 'Tab' && focusables.length > 0) {
        const activeIdx = Array.from(focusables).indexOf(document.activeElement);
        if (e.shiftKey) {
          if (activeIdx <= 0) {
            focusables[focusables.length - 1].focus();
            e.preventDefault();
          }
        } else {
          if (activeIdx >= focusables.length - 1) {
            focusables[0].focus();
            e.preventDefault();
          }
        }
      }
      if (e.key === 'ArrowUp' && currentState !== 'full') {
        const next = currentState === 'peek' ? 'half' : 'full';
        setCurrentState(next);
        onStateChange?.(next);
      }
      if (e.key === 'ArrowDown' && currentState !== 'peek') {
        const next = currentState === 'full' ? 'half' : 'peek';
        setCurrentState(next);
        onStateChange?.(next);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, currentState, onRequestClose, onStateChange]);

  const getHeightPx = useCallback(() => {
    if (typeof window === 'undefined') return 0;
    const vh = window.innerHeight;
    const heights = {
      peek: SHEET_HEIGHTS.peek,
      half: Math.round(vh * SHEET_HEIGHTS.half),
      full: Math.round(vh * SHEET_HEIGHTS.full),
    };
    return heights[currentState];
  }, [currentState]);

  const handlePointerDown = (e) => {
    startYRef.current = e.clientY;
    lastYRef.current = e.clientY;
    startTimeRef.current = Date.now();
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const delta = e.clientY - startYRef.current;
    setOffsetY(delta);
    lastYRef.current = e.clientY;
  };

  const handlePointerUp = () => {
    if (!isDragging) return;

    const elapsed = Date.now() - startTimeRef.current;
    const distance = lastYRef.current - startYRef.current;
    const velocity = elapsed > 0 ? (distance / elapsed) * 1000 : 0;

    let nextState = currentState;

    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
      if (velocity > 0) {
        nextState = currentState === 'full' ? 'half' : currentState === 'half' ? 'peek' : 'peek';
      } else {
        nextState = currentState === 'peek' ? 'half' : currentState === 'half' ? 'full' : 'full';
      }
    } else {
      const snapState = SNAP_POINTS.reduce((prev, curr) => {
        const currH = curr === 'peek' ? SHEET_HEIGHTS.peek : 
                      (curr === 'half' ? window.innerHeight * SHEET_HEIGHTS.half : 
                       window.innerHeight * SHEET_HEIGHTS.full);
        const prevH = prev === 'peek' ? SHEET_HEIGHTS.peek :
                      (prev === 'half' ? window.innerHeight * SHEET_HEIGHTS.half :
                       window.innerHeight * SHEET_HEIGHTS.full);
        return Math.abs(currH) < Math.abs(prevH) ? curr : prev;
      });
      nextState = snapState;
    }

    setCurrentState(nextState);
    onStateChange?.(nextState);
    setIsDragging(false);
    setOffsetY(0);
  };

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    el.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging]);

  if (!mounted || !isOpen) return null;

  const heightPx = getHeightPx();
  const transform = `translateY(${offsetY}px)`;

  return createPortal(
    <>
      <div
        className={styles.backdrop}
        onClick={onRequestClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        className={styles.sheet}
        style={{
          height: `${heightPx}px`,
          transform,
          willChange: isDragging ? 'transform' : 'auto',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-header"
        aria-label={ariaLabel}
      >
        <div
          ref={handleRef}
          className={styles.handle}
          role="button"
          tabIndex={0}
          aria-label="Drag to move sheet"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (currentState !== 'full') {
                const next = currentState === 'peek' ? 'half' : 'full';
                setCurrentState(next);
                onStateChange?.(next);
              }
            }
          }}
        >
          <div className={styles.handleBar} />
        </div>

        {header && (
          <div className={styles.header}>
            <div id="bs-header" className={styles.headerTitle}>
              {header}
            </div>
            <div className={styles.headerActions}>
              {currentState !== 'full' && (
                <button
                  className={styles.iconBtn}
                  onClick={() => {
                    const next = currentState === 'peek' ? 'half' : 'full';
                    setCurrentState(next);
                    onStateChange?.(next);
                  }}
                  aria-label="Expand"
                >
                  ▲
                </button>
              )}
              {currentState !== 'peek' && (
                <button
                  className={styles.iconBtn}
                  onClick={() => {
                    const next = currentState === 'full' ? 'half' : 'peek';
                    setCurrentState(next);
                    onStateChange?.(next);
                  }}
                  aria-label="Collapse"
                >
                  ▼
                </button>
              )}
              <button
                className={styles.iconBtn}
                onClick={onRequestClose}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className={styles.content}>
          {children}
        </div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </>,
    document.body
  );
};

export default BottomSheet;
