/* Mini runtime: renders the page template with the page's Component logic. */
(function () {
  function DCLogic() { this.props = {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, p);
    if (this.__render) this.__render();
  };
  DCLogic.prototype.forceUpdate = function () { if (this.__render) this.__render(); };
  window.DCLogic = DCLogic;

  function look(scope, path) {
    path = path.trim();
    if (path === "true") return true;
    if (path === "false") return false;
    var v = scope, parts = path.split(".");
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function interp(s, scope) {
    return s.replace(/\{\{([^}]+)\}\}/g, function (m, p) { var v = look(scope, p); return v == null ? "" : String(v); });
  }

  var handlers = [];
  function renderNodes(nodes, scope, parent) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) { parent.appendChild(document.createTextNode(interp(n.nodeValue, scope))); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      if (tag === "sc-for") {
        var list = look(scope, n.getAttribute("list").replace(/[{}]/g, "")) || [];
        var as = n.getAttribute("as");
        for (var j = 0; j < list.length; j++) {
          var sc = Object.assign({}, scope); sc[as] = list[j]; sc.$index = j;
          renderNodes(n.childNodes, sc, parent);
        }
        continue;
      }
      if (tag === "sc-if") {
        if (look(scope, n.getAttribute("value").replace(/[{}]/g, ""))) renderNodes(n.childNodes, scope, parent);
        continue;
      }
      var el = n.namespaceURI === "http://www.w3.org/2000/svg"
        ? document.createElementNS(n.namespaceURI, n.tagName)
        : document.createElement(n.tagName);
      for (var a = 0; a < n.attributes.length; a++) {
        var at = n.attributes[a];
        if (/^hint-placeholder/.test(at.name)) continue;
        var whole = at.value.match(/^\{\{([^}]+)\}\}$/);
        if (/^on[a-z]+$/i.test(at.name)) {
          var fn = whole && look(scope, whole[1]);
          if (typeof fn === "function") { handlers.push(fn); el.setAttribute("data-dc-" + at.name.slice(2).toLowerCase(), String(handlers.length - 1)); }
          continue;
        }
        el.setAttribute(at.name === "classname" ? "class" : at.name, interp(at.value, scope));
      }
      renderNodes((tag === "template" ? n.content : n).childNodes, scope, el);
      parent.appendChild(el);
    }
  }

  var EVENTS = ["click", "input", "change", "keydown", "submit"];

  window.DC = {
    mount: function (Component) {
      try {
        if (!window.localStorage.getItem("domi-prefs")) {
          var nl = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
          window.localStorage.setItem("domi-prefs", JSON.stringify({ lang: /^es/i.test(nl) ? "es" : "en" }));
        }
      } catch (e) {}
      var tpl = document.getElementById("dc-tpl").content;
      var root = document.getElementById("root");
      var inst = new Component();
      inst.state = inst.state || {};
      var first = true;
      inst.__render = function () {
        handlers = [];
        var vals = inst.renderVals();
        var next = document.createElement("div");
        next.id = "root";
        renderNodes(tpl.childNodes, vals, next);
        if (first) {
          root.innerHTML = "";
          while (next.firstChild) root.appendChild(next.firstChild);
        } else {
          window.morphdom(root, next, {
            onBeforeElUpdated: function (from, to) {
              var rv = from.getAttribute("data-rv");
              if (rv) to.setAttribute("data-rv", rv);
              return true;
            }
          });
        }
        var langEl = root.querySelector("[lang]");
        if (langEl) document.documentElement.lang = langEl.getAttribute("lang");
        if (first) {
          first = false;
          if (location.hash) {
            var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
            if (target) setTimeout(function () { target.scrollIntoView(); }, 50);
          }
        }
      };
      EVENTS.forEach(function (type) {
        document.addEventListener(type, function (e) {
          var node = e.target;
          while (node && node !== document) {
            if (node.nodeType === 1 && node.hasAttribute("data-dc-" + type)) {
              var fn = handlers[Number(node.getAttribute("data-dc-" + type))];
              if (fn) fn.call(inst, e);
              if (e.cancelBubble) break;
            }
            node = node.parentNode;
          }
        });
      });
      inst.__render();
    }
  };
})();
