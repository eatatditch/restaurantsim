/**
 * Tiny hyperscript helper. The UI builds REAL DOM elements (not string
 * templates) and re-renders from game state, so it stays a pure function of
 * state with no render/state desync.
 */

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  id?: string;
  type?: string;
  value?: string | number;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  href?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  onClick?: (e: MouseEvent) => void;
  onInput?: (e: Event) => void;
  onChange?: (e: Event) => void;
  style?: string;
  dataset?: Record<string, string>;
}

export function h(tag: string, props: Props = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.type) (el as HTMLInputElement).type = props.type;
  if (props.value !== undefined) (el as HTMLInputElement).value = String(props.value);
  if (props.placeholder) (el as HTMLInputElement).placeholder = props.placeholder;
  if (props.disabled) (el as HTMLButtonElement).disabled = true;
  if (props.title) el.title = props.title;
  if (props.href) (el as HTMLAnchorElement).href = props.href;
  if (props.min !== undefined) (el as HTMLInputElement).min = String(props.min);
  if (props.max !== undefined) (el as HTMLInputElement).max = String(props.max);
  if (props.step !== undefined) (el as HTMLInputElement).step = String(props.step);
  if (props.style) el.setAttribute("style", props.style);
  if (props.onClick) el.addEventListener("click", props.onClick);
  if (props.onInput) el.addEventListener("input", props.onInput);
  if (props.onChange) el.addEventListener("change", props.onChange);
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) el.dataset[k] = v;
  for (const child of children) append(el, child);
  return el;
}

function append(el: HTMLElement, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (typeof child === "string" || typeof child === "number") {
    el.appendChild(document.createTextNode(String(child)));
  } else {
    el.appendChild(child);
  }
}

/** Replace all children of a container with new nodes. */
export function render(container: HTMLElement, ...children: Child[]): void {
  container.replaceChildren();
  for (const child of children) append(container, child);
}

export function clear(container: HTMLElement): void {
  container.replaceChildren();
}
