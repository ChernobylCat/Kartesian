export function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function debounce(fn, delay, {
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  let timer = null;
  let lastArgs = null;
  let lastThis = null;

  function invoke() {
    if (timer === null) return undefined;
    clearTimer(timer);
    timer = null;
    const args = lastArgs;
    const context = lastThis;
    lastArgs = null;
    lastThis = null;
    return fn.apply(context, args);
  }

  function debounced(...args) {
    if (timer !== null) clearTimer(timer);
    lastArgs = args;
    lastThis = this;
    timer = setTimer(() => {
      timer = null;
      const pendingArgs = lastArgs;
      const pendingContext = lastThis;
      lastArgs = null;
      lastThis = null;
      fn.apply(pendingContext, pendingArgs);
    }, delay);
  }

  debounced.cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    lastArgs = null;
    lastThis = null;
  };
  debounced.flush = invoke;
  debounced.pending = () => timer !== null;
  return debounced;
}
