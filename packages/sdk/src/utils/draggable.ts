export interface DraggableOptions {
  /** Clear CSS transform on drag (for elements using transform for positioning) */
  clearTransform?: boolean;
  /** Callback fired when element is dragged */
  onDragged?: () => void;
  /** Skip drag when pointer target matches interactive elements */
  filterInteractive?: boolean;
}

/**
 * Make an element draggable by pointer events.
 * Clamps to viewport with 8px padding.
 */
export function makeDraggable(
  target: HTMLElement,
  handle: HTMLElement,
  options: DraggableOptions = {},
): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const left = Math.max(8, Math.min(startLeft + dx, window.innerWidth - target.offsetWidth - 8));
    const top = Math.max(8, Math.min(startTop + dy, window.innerHeight - target.offsetHeight - 8));
    target.style.left = `${left}px`;
    target.style.top = `${top}px`;
    target.style.right = 'auto';
    target.style.bottom = 'auto';
    if (options.clearTransform) {
      target.style.transform = 'none';
    }
    options.onDragged?.();
  };

  const onPointerUp = () => {
    dragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (options.filterInteractive) {
      const el = event.target as HTMLElement | null;
      if (el?.closest('button, input, textarea, select, a, [data-no-drag="true"]')) return;
    }
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    const rect = target.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    target.style.left = `${rect.left}px`;
    target.style.top = `${rect.top}px`;
    target.style.right = 'auto';
    target.style.bottom = 'auto';
    if (options.clearTransform) {
      target.style.transform = 'none';
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}
