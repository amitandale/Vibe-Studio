if (typeof globalThis.fetch !== "function") {
  // @ts-expect-error - minimal fetch polyfill for tests
  globalThis.fetch = async () => ({ ok: true });
}

class MockNode {
  parentNode: MockElement | null = null;
  ownerDocument: Document;
  nodeType: number;

  constructor(ownerDocument: Document, nodeType: number) {
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
  }
}

class MockText extends MockNode {
  nodeValue: string;

  constructor(ownerDocument: Document, value: string) {
    super(ownerDocument, 3);
    this.nodeValue = value;
  }
}

class MockElement extends MockNode {
  tagName: string;
  nodeName: string;
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  children: (MockElement | MockText)[] = [];
  textContent = "";

  constructor(ownerDocument: Document, tag: string) {
    super(ownerDocument, 1);
    this.tagName = tag.toUpperCase();
    this.nodeName = this.tagName;
  }

  appendChild<T extends MockElement | MockText>(child: T): T {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild<T extends MockElement | MockText>(child: T): T {
    this.children = this.children.filter((node) => node !== child);
    child.parentNode = null;
    return child;
  }

  insertBefore<T extends MockElement | MockText>(child: T, reference: MockElement | MockText | null): T {
    child.parentNode = this;
    if (!reference) {
      this.children.push(child);
      return child;
    }
    const index = this.children.indexOf(reference);
    if (index === -1) {
      this.children.push(child);
    } else {
      this.children.splice(index, 0, child);
    }
    return child;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  addEventListener() {}

  removeEventListener() {}

  get firstChild(): MockElement | MockText | null {
    return this.children[0] ?? null;
  }

  get childNodes(): (MockElement | MockText)[] {
    return this.children;
  }
}

class MockDocument {
  documentElement: MockElement;
  head: MockElement;
  body: MockElement;

  constructor() {
    this.documentElement = new MockElement(this as unknown as Document, "html");
    this.head = new MockElement(this as unknown as Document, "head");
    this.body = new MockElement(this as unknown as Document, "body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): MockElement {
    return new MockElement(this as unknown as Document, tag);
  }

  createTextNode(value: string): MockText {
    return new MockText(this as unknown as Document, value);
  }

  addEventListener() {}

  removeEventListener() {}
}

globalThis.document = new MockDocument() as unknown as Document;
const mockNavigator = { userAgent: "node" } as Navigator;
const mockWindow = {
  document: globalThis.document,
  navigator: mockNavigator,
  addEventListener() {},
  removeEventListener() {},
} as unknown as Window & typeof globalThis;
Object.assign(mockWindow, { Node: MockNode, Element: MockElement, HTMLElement: MockElement, Document: MockDocument });
globalThis.window = mockWindow;
// @ts-expect-error connect defaultView
globalThis.document.defaultView = globalThis.window as Window;

export {};
globalThis.Node = MockNode as unknown as typeof Node;
globalThis.Element = MockElement as unknown as typeof Element;
globalThis.HTMLElement = MockElement as unknown as typeof HTMLElement;
globalThis.Document = MockDocument as unknown as typeof Document;
globalThis.HTMLDocument = MockDocument as unknown as typeof HTMLDocument;

