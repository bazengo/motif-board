import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A small (i) that reveals its explanation on hover/focus. The bubble is
 * portaled to <body> and positioned with fixed coords so scrolling panels and
 * stacking contexts can't clip it.
 */
export function InfoTip({
  children,
  label = 'More information',
}: {
  children: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function show() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
  }
  const hide = () => setPos(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="infotip-btn"
        aria-label={label}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault();
          pos ? hide() : show();
        }}
      >
        i
      </button>
      {pos &&
        createPortal(
          <div
            className="infotip-bubble"
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
