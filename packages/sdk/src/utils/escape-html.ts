/** Safely escape a string for use in innerHTML */
export function escapeHtml(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
