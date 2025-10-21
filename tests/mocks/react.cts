const path = require("node:path");

/** @typedef {{ target: T }} ChangeEvent */
/** @typedef {{ current: T }} MutableRefObject */

const resolveReactPath = () =>
  path.join(__dirname, "../../node_modules/react/index.js");

const React = require(resolveReactPath());

const dispatcherStorageKey = Symbol.for("mock-react-dispatcher");
const dispatcherStorage = (globalThis[dispatcherStorageKey] ||= { current: null });

const __setDispatcher = (dispatcher) => {
  dispatcherStorage.current = dispatcher;
};

const ensureDispatcher = () => {
  if (!dispatcherStorage.current) {
    throw new Error("Hooks can only be used within renderHook");
  }
  return dispatcherStorage.current;
};

const useState = (initial) => {
  return ensureDispatcher().useState(initial);
};

const useEffect = (effect, deps) => {
  ensureDispatcher().useEffect(effect, deps);
};

const useRef = (initial) => {
  return ensureDispatcher().useRef(initial);
};

const createElement = React.createElement.bind(React);

React.useState = useState;
React.useEffect = useEffect;
React.useRef = useRef;
React.createElement = createElement;

module.exports = React;
module.exports.default = React;
module.exports.__setDispatcher = __setDispatcher;
module.exports.useState = useState;
module.exports.useEffect = useEffect;
module.exports.useRef = useRef;
module.exports.createElement = createElement;
module.exports.default.__setDispatcher = __setDispatcher;
module.exports.default.useState = useState;
module.exports.default.useEffect = useEffect;
module.exports.default.useRef = useRef;
module.exports.default.createElement = createElement;
