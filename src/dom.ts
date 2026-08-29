// Security #5: the only way report/error content reaches the DOM in this
// app — every text node goes through textContent, never innerHTML.
import { sanitizeForDisplay } from './sanitize';

type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: Child[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  if (children) {
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? text(child) : child);
    }
  }
  return node;
}

export function text(value: string): Text {
  return document.createTextNode(sanitizeForDisplay(value));
}

export function setText(node: Element, value: string): void {
  node.textContent = sanitizeForDisplay(value);
}

export function clear(node: Element): void {
  node.replaceChildren();
}
