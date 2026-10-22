// ID document helpers. Plain functions with no page code, so the browser and the tests can both use them.
// ID documents are checked in the browser only. They are never sent to the AI.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BID_DESK_ID = api;
})(typeof self !== "undefined" ? self : this, function () {
  const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  /** True when the file name says it is an ID or passport copy. Only the file name is read, not the folder. */
  function looksLikeId(path) {
    const name = String(path || "").split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();
    return /(^|[^a-z0-9])(id|passport)([^a-z0-9]|$)/.test(name) || /identity (document|copy|card|book)/.test(name);
  }

  /** The name written on an ID document, or "" when the text has no name line. */
  function idHolder(text) {
    const m = String(text || "").match(/(?:full\s+names?|names?\s+and\s+surname|surname\s+and\s+names?|holder|name)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,60})/i);
    return m ? m[1].trim() : "";
  }

  /** Two names are the same person when one name's words all appear in the other, or one uses an initial ("L. Nkosi"). */
  function sameName(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    const xp = x.split(" "), yp = y.split(" ");
    const [small, big] = xp.length <= yp.length ? [xp, new Set(yp)] : [yp, new Set(xp)];
    if (small.every(t => big.has(t))) return true;
    const initial = xp[0].length === 1 || yp[0].length === 1;
    return initial && xp[xp.length - 1] === yp[yp.length - 1] && xp[0][0] === yp[0][0];
  }

  return { looksLikeId, idHolder, sameName };
});
