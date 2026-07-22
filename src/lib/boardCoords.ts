import { useStore } from '../store';

/**
 * Convert a pointer position to unscaled board coordinates — the space card
 * and mix positions live in. Centralised because every drag handler needs it
 * and getting the zoom divisor wrong is invisible until you zoom.
 */
export function clientToBoard(clientX: number, clientY: number) {
  const board = document.querySelector('.board') as HTMLElement | null;
  if (!board) return { x: clientX, y: clientY };
  const zoom = useStore.getState().zoom || 1;
  const r = board.getBoundingClientRect();
  return {
    x: (clientX - r.left + board.scrollLeft) / zoom,
    y: (clientY - r.top + board.scrollTop) / zoom,
  };
}
