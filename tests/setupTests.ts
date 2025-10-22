import { randomUUID } from "node:crypto";

class BaseNode {
  childNodes: BaseNode[] = [];
  parentNode: BaseNode | null = null;
  ownerDocument: DocumentShim | null = null;

  get firstChild(): BaseNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): BaseNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): BaseNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    if (index === -1) return null;
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  get previousSibling(): BaseNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    if (index === -1) return null;
    return this.parentNode.childNodes[index - 1] ?? null;
  }

  appendChild(node: BaseNode): BaseNode {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  insertBefore(node: BaseNode, reference: BaseNode | null): BaseNode {
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    if (!reference) {
      return this.appendChild(node);
    }
    const index = this.childNodes.indexOf(reference);
    if (index === -1) {
      this.childNodes.push(node);
    } else {
      this.childNodes.splice(index, 0, node);
    }
    node.parentNode = this;
    return node;
  }

  removeChild(node: BaseNode): BaseNode {
    const index = this.childNodes.indexOf(node);
    if (index !== -1) {
      this.childNodes.splice(index, 1);
      node.parentNode = null;
    }
    return node;
  }

  get textContent(): string {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (value) {
      const text = this.ownerDocument?.createTextNode(value) ?? new TextNode(value);
      text.ownerDocument = this.ownerDocument;
      this.appendChild(text);
    }
  }
}

class TextNode extends BaseNode {
  data: string;
  readonly nodeType = 3;
  readonly nodeName = "#text";

  constructor(data: string) {
    super();
    this.data = data;
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(value: string) {
    this.data = value;
  }
}

class CommentNode extends BaseNode {
  data: string;
  readonly nodeType = 8;
  readonly nodeName = "#comment";

  constructor(data: string) {
    super();
    this.data = data;
  }
}

class DocumentFragmentNode extends BaseNode {
  readonly nodeType = 11;
  readonly nodeName = "#document-fragment";
}

class DOMTokenList {
  #owner: ElementNode;
  #tokens: Set<string> = new Set();

  constructor(owner: ElementNode) {
    this.#owner = owner;
  }

  add(...tokens: string[]): void {
    tokens.forEach((token) => {
      if (token) this.#tokens.add(token);
    });
    this.#sync();
  }

  remove(...tokens: string[]): void {
    tokens.forEach((token) => this.#tokens.delete(token));
    this.#sync();
  }

  contains(token: string): boolean {
    return this.#tokens.has(token);
  }

  toggle(token: string, force?: boolean): boolean {
    if (force === true) {
      this.#tokens.add(token);
      this.#sync();
      return true;
    }
    if (force === false) {
      this.#tokens.delete(token);
      this.#sync();
      return false;
    }
    if (this.#tokens.has(token)) {
      this.#tokens.delete(token);
      this.#sync();
      return false;
    }
    this.#tokens.add(token);
    this.#sync();
    return true;
  }

  toString(): string {
    return Array.from(this.#tokens).join(" ");
  }

  #sync() {
    this.#owner.setAttribute("class", this.toString());
  }
}

class ElementNode extends BaseNode {
  readonly nodeType = 1;
  readonly tagName: string;
  readonly nodeName: string;
  namespaceURI: string | null;
  attributes: Map<string, string> = new Map();
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  classList: DOMTokenList;
  #listeners: Map<string, Set<EventListener>> = new Map();

  constructor(tagName: string, namespace: string | null = null) {
    super();
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespace;
    this.classList = new DOMTokenList(this);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
    if (name === "class") {
      this.classList = new DOMTokenList(this);
      String(value)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((token) => this.classList.add(token));
    }
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      delete this.dataset[key];
    }
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }
    this.#listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event) {
    event.target = this;
    const listeners = this.#listeners.get(event.type);
    if (listeners) {
      for (const listener of Array.from(listeners)) {
        listener.call(this, event);
      }
    }
    return !event.defaultPrevented;
  }

  contains(node: BaseNode | null): boolean {
    let cursor: BaseNode | null = node;
    while (cursor) {
      if (cursor === this) return true;
      cursor = cursor.parentNode;
    }
    return false;
  }

  get innerHTML(): string {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set innerHTML(value: string) {
    this.textContent = value;
  }

  getElementsByTagName(tag: string): ElementNode[] {
    const matches: ElementNode[] = [];
    const upper = tag === "*" ? "*" : tag.toUpperCase();
    const queue: BaseNode[] = [...this.childNodes];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current instanceof ElementNode) {
        if (upper === "*" || current.tagName === upper) {
          matches.push(current);
        }
      }
      queue.push(...current.childNodes);
    }
    return matches;
  }
}

type EventListener = (event: Event) => void;

class DocumentShim extends BaseNode {
  readonly nodeType = 9;
  readonly nodeName = "#document";
  readonly documentElement: ElementNode;
  readonly head: ElementNode;
  readonly body: ElementNode;
  defaultView: typeof globalThis | null = null;

  constructor() {
    super();
    this.documentElement = new ElementNode("html");
    this.documentElement.ownerDocument = this;
    super.appendChild(this.documentElement);

    this.head = new ElementNode("head");
    this.head.ownerDocument = this;
    this.documentElement.appendChild(this.head);

    this.body = new ElementNode("body");
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): ElementNode {
    const element = new ElementNode(tag);
    element.ownerDocument = this;
    return element;
  }

  createElementNS(namespace: string | null, tag: string): ElementNode {
    const element = new ElementNode(tag, namespace);
    element.ownerDocument = this;
    return element;
  }

  createTextNode(text: string): TextNode {
    const node = new TextNode(text);
    node.ownerDocument = this;
    return node;
  }

  createComment(text: string): CommentNode {
    const node = new CommentNode(text);
    node.ownerDocument = this;
    return node;
  }

  createDocumentFragment(): DocumentFragmentNode {
    const fragment = new DocumentFragmentNode();
    fragment.ownerDocument = this;
    return fragment;
  }

  getElementById(id: string): ElementNode | null {
    const queue: BaseNode[] = [this.documentElement];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current instanceof ElementNode) {
        if (current.getAttribute("id") === id) {
          return current;
        }
      }
      queue.push(...current.childNodes);
    }
    return null;
  }

  getElementsByTagName(tag: string): ElementNode[] {
    const matches: ElementNode[] = [];
    const upper = tag === "*" ? "*" : tag.toUpperCase();
    const queue: BaseNode[] = [this.documentElement];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current instanceof ElementNode) {
        if (upper === "*" || current.tagName === upper) {
          matches.push(current);
        }
      }
      queue.push(...current.childNodes);
    }
    return matches;
  }
}

class Event {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented = false;
  target: unknown;

  constructor(type: string, options: { bubbles?: boolean; cancelable?: boolean } = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
    this.cancelable = Boolean(options.cancelable);
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {}
}

class CustomEvent<T> extends Event {
  detail: T;

  constructor(type: string, options: { detail?: T; bubbles?: boolean; cancelable?: boolean } = {}) {
    super(type, options);
    this.detail = options.detail as T;
  }
}

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

type BroadcastMessage = unknown;

type BroadcastListener = (event: { data: BroadcastMessage }) => void;

class BroadcastChannelShim {
  name: string;
  #listeners: Set<BroadcastListener> = new Set();

  constructor(name: string) {
    this.name = name;
  }

  postMessage(data: BroadcastMessage) {
    for (const listener of Array.from(this.#listeners)) {
      listener({ data });
    }
  }

  addEventListener(_: "message", listener: BroadcastListener) {
    this.#listeners.add(listener);
  }

  removeEventListener(_: "message", listener: BroadcastListener) {
    this.#listeners.delete(listener);
  }

  close() {
    this.#listeners.clear();
  }
}

function createStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
  };
}

function installDom() {
  if (typeof globalThis.window !== "undefined") {
    return;
  }

  const document = new DocumentShim();
  const windowListeners = new Map<string, Set<EventListener>>();

  const windowLike = {
    document,
    navigator: { userAgent: "vitest-shim" },
    requestAnimationFrame(callback: FrameRequestCallback) {
      return setTimeout(() => callback(Date.now()), 16);
    },
    cancelAnimationFrame(handle: number) {
      clearTimeout(handle);
    },
    addEventListener(type: string, listener: EventListener) {
      if (!windowListeners.has(type)) {
        windowListeners.set(type, new Set());
      }
      windowListeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      windowListeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      const listeners = windowListeners.get(event.type);
      if (listeners) {
        for (const listener of Array.from(listeners)) {
          listener.call(windowLike, event);
        }
      }
      return !event.defaultPrevented;
    },
    getComputedStyle() {
      return {
        getPropertyValue() {
          return "";
        },
      };
    },
    matchMedia(query: string) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      };
    },
    queueMicrotask: globalThis.queueMicrotask?.bind(globalThis) ?? ((cb: () => void) => Promise.resolve().then(cb)),
  } as unknown as Window & typeof globalThis;

  document.defaultView = windowLike;

  Object.assign(windowLike, {
    Event,
    CustomEvent,
    ResizeObserver,
    IntersectionObserver,
    BroadcastChannel: BroadcastChannelShim,
  });

  globalThis.window = windowLike;
  globalThis.document = document as unknown as Document;
  globalThis.HTMLElement = ElementNode as unknown as typeof HTMLElement;
  globalThis.HTMLDivElement = ElementNode as unknown as typeof HTMLDivElement;
  globalThis.Node = BaseNode as unknown as typeof Node;
  globalThis.Text = TextNode as unknown as typeof Text;
  globalThis.DocumentFragment = DocumentFragmentNode as unknown as typeof DocumentFragment;
  globalThis.Event = Event as unknown as typeof Event;
  globalThis.CustomEvent = CustomEvent as unknown as typeof CustomEvent;
  globalThis.ResizeObserver = ResizeObserver as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver = IntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.BroadcastChannel = BroadcastChannelShim as unknown as typeof BroadcastChannel;
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  globalThis.navigator = windowLike.navigator;
  globalThis.matchMedia = windowLike.matchMedia;
  globalThis.requestAnimationFrame = windowLike.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowLike.cancelAnimationFrame;

  const cryptoShim = {
    randomUUID: () => randomUUID(),
  };
  globalThis.crypto = cryptoShim as unknown as Crypto;
}

installDom();

export {};
