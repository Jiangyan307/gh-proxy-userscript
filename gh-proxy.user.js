// ==UserScript==
// @name         GitHub 下载加速 (gh-proxy)
// @name:zh-CN   GitHub 下载加速 (gh-proxy)
// @namespace    gh-proxy-edge.route-userscript
// @version      1.0.0
// @description  把 GitHub 的 releases 下载 / archive / raw / zipball / tarball 以及 gist raw 链接改写成 https://gh-proxy.com/ 前缀，加速下载。
// @author       gh-proxy-userscript contributors
// @license      MIT
// @homepageURL  https://github.com/Jiangyan307/gh-proxy-userscript
// @supportURL   https://github.com/Jiangyan307/gh-proxy-userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Jiangyan307/gh-proxy-userscript/main/gh-proxy.user.js
// @updateURL    https://raw.githubusercontent.com/Jiangyan307/gh-proxy-userscript/main/gh-proxy.user.js
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @match        https://raw.githubusercontent.com/*
// @match        https://codeload.github.com/*
// @match        https://objects.githubusercontent.com/*
// @match        https://gist.githubusercontent.com/*
// ==/UserScript==

/**
 * gh-proxy Tampermonkey 用户脚本
 * ---------------------------------------------------------------------------
 * 与扩展 gh-proxy-edge 的对应关系：
 *   src/core.js      -> 下方「1. 纯函数区」（内联副本，不依赖扩展文件）
 *   src/content.js   -> 下方「3./4.」href 就地改写 + 点击捕获兜底 + MutationObserver
 *   rules.json (DNR) -> 下方「6. 主框架兜底跳转」（用户脚本没有 declarativeNetRequest，
 *                       用 location.replace 在匹配域名的页面上做等效跳转）
 *   popup 开关       -> 下方「2.」GM_registerMenuCommand 菜单开关（GM_* 不可用时回退 localStorage）
 *
 * 设计要点：
 *   - href 就地改写（而不是只在点击时跳转）才能覆盖：左键 / 中键 / 右键「复制链接地址」
 *     / 右键「链接另存为」/ 拖拽到标签栏 —— 这些都读的是 href 本身。
 *   - 幂等：已经是 https://gh-proxy.com/<原地址> 的链接不再改写，绝不套娃。
 *   - 只处理下载类路径；普通仓库页 / issue / PR / blob 页面原样不动。
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  /* =========================================================================
   * 1. 纯函数区（等价于扩展 src/core.js）
   * ========================================================================= */

  var SCRIPT_VERSION = "1.0.0";

  /** 代理前缀（拼在原地址前面，形如 https://gh-proxy.com/https://github.com/...） */
  var PROXY_ORIGIN = "https://gh-proxy.com/";

  /** 需要走代理的链接形态（与 rules.json 的三条规则一一对应） */
  var PROXYABLE = [
    // github.com/<owner>/<repo>/releases/download|archive|raw|zipball|tarball/...
    /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(?:releases\/download|releases\/latest\/download|archive|raw|zipball|tarball)\//i,
    // gist.github.com/<user>/<id>/raw/...
    /^https?:\/\/gist\.github\.com\/[^/]+\/[^/]+\/raw\//i,
    // 各类 githubusercontent / codeload
    /^https?:\/\/(?:raw\.githubusercontent\.com|codeload\.github\.com|gist\.githubusercontent\.com|objects\.githubusercontent\.com)\//i
  ];

  /** 是否已经被代理过（幂等判断，防止二次套娃） */
  function isProxied(url) {
    return typeof url === "string" && url.slice(0, PROXY_ORIGIN.length) === PROXY_ORIGIN;
  }

  /** 是否是需要代理的 GitHub 下载链接 */
  function isProxyable(url) {
    if (typeof url !== "string" || url === "") return false;
    if (isProxied(url)) return false;
    for (var i = 0; i < PROXYABLE.length; i++) {
      if (PROXYABLE[i].test(url)) return true;
    }
    return false;
  }

  /** 转换：不满足条件时原样返回 */
  function toProxyUrl(url) {
    return isProxyable(url) ? PROXY_ORIGIN + url : url;
  }

  /** 相对 href -> 绝对 URL；解析失败返回 null */
  function toAbsolute(href, base) {
    try {
      return new URL(href, base || location.href).href;
    } catch (e) {
      return null;
    }
  }

  /* =========================================================================
   * 2. 开关持久化：GM_* 优先（GM_x 裸函数 + GM.x 对象两种风格），回退 localStorage
   * ========================================================================= */

  var STORE_KEY = "ghProxyEnabled";
  var LS_PREFIX = "ghproxy:";
  var GMObj = (typeof GM === "object" && GM) ? GM : null;

  function lsStore() {
    try {
      return (typeof localStorage !== "undefined" && localStorage) ? localStorage : null;
    } catch (e) {
      return null;
    }
  }

  function storageBackend() {
    if (typeof GM_setValue === "function" || typeof GM_getValue === "function") return "GM";
    if (GMObj && (typeof GMObj.setValue === "function" || typeof GMObj.getValue === "function")) return "GM";
    return "localStorage";
  }

  /** 读：GM 优先，回退 localStorage（存的是 "true"/"false" 字符串） */
  function gmGet(key, fallback) {
    if (typeof GM_getValue === "function") {
      try {
        var v = GM_getValue(key, fallback);
        if (v !== undefined) return v;
      } catch (e) { /* 落到下一级 */ }
    }
    if (GMObj && typeof GMObj.getValue === "function") {
      try {
        var v2 = GMObj.getValue(key, fallback);
        if (v2 !== undefined) return v2;
      } catch (e) { /* 落到下一级 */ }
    }
    var store = lsStore();
    if (!store) return fallback;
    try {
      var raw = store.getItem(LS_PREFIX + key);
      return raw === null ? fallback : raw;
    } catch (e) {
      return fallback;
    }
  }

  /** 写：GM 优先，回退 localStorage */
  function gmSet(key, value) {
    var ok = false;
    if (typeof GM_setValue === "function") {
      try { GM_setValue(key, value); ok = true; } catch (e) { ok = false; }
    }
    if (!ok && GMObj && typeof GMObj.setValue === "function") {
      try { GMObj.setValue(key, value); ok = true; } catch (e) { ok = false; }
    }
    var store = lsStore();
    if (!ok && store) {
      try { store.setItem(LS_PREFIX + key, String(value)); } catch (e) { /* ignore */ }
    }
    return ok;
  }

  /** 删：GM 优先，回退 localStorage */
  function gmDel(key) {
    var ok = false;
    if (typeof GM_deleteValue === "function") {
      try { GM_deleteValue(key); ok = true; } catch (e) { ok = false; }
    }
    if (!ok && GMObj && typeof GMObj.deleteValue === "function") {
      try { GMObj.deleteValue(key); ok = true; } catch (e) { ok = false; }
    }
    var store = lsStore();
    if (store) {
      try { store.removeItem(LS_PREFIX + key); } catch (e) { /* ignore */ }
    }
    return ok;
  }

  /** 归一化成布尔值：默认开启 */
  function readEnabled() {
    var v = gmGet(STORE_KEY, true);
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v !== "false";
    return v !== false;
  }

  function writeEnabled(v) {
    return gmSet(STORE_KEY, v === true);
  }

  /* =========================================================================
   * 3. 状态 + 菜单开关
   * ========================================================================= */

  var enabled = readEnabled();
  var menuId = null;

  function menuLabel() {
    return "开启/关闭 gh-proxy（当前：" + (enabled ? "开" : "关") + "）";
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== "function") return;
    try {
      var id = GM_registerMenuCommand(menuLabel(), function () { setEnabled(!enabled); });
      menuId = (id === undefined) ? null : id;
    } catch (e) {
      menuId = null;
    }
  }

  /** 开关变化后刷新菜单文案（能注销就注销后重注册，否则再注册一条） */
  function refreshMenu() {
    if (typeof GM_unregisterMenuCommand === "function" && menuId !== null) {
      try {
        GM_unregisterMenuCommand(menuId);
        menuId = null;
      } catch (e) { /* ignore */ }
    }
    registerMenu();
  }

  function setEnabled(next) {
    enabled = (next === true);
    writeEnabled(enabled);
    if (enabled) scan(document);
    else unrewriteAll();
    refreshMenu();
    return enabled;
  }

  /* =========================================================================
   * 4. 页面改写：href 就地改写 + MutationObserver 增量扫描
   * ========================================================================= */

  function rewriteAnchor(a) {
    if (!enabled || !a || a.tagName !== "A") return;
    var raw = a.getAttribute("href");
    if (!raw) return;
    var url = toAbsolute(raw);
    if (!url) return;
    if (isProxied(url)) {
      // 已经是代理地址：只打标记，不改写（防套娃）
      a.dataset.ghProxy = "done";
      return;
    }
    if (!isProxyable(url)) return;
    a.setAttribute("href", toProxyUrl(url));
    a.dataset.ghProxy = "done";
    a.setAttribute("rel", (a.getAttribute("rel") || "") + " noopener");
    a.title = "gh-proxy 加速：" + url;
  }

  function scan(root) {
    if (!enabled || !root) return;
    if (root.nodeType === 1 && root.tagName === "A") rewriteAnchor(root);
    if (!root.querySelectorAll) return;
    var list = root.querySelectorAll("a[href]");
    for (var i = 0; i < list.length; i++) rewriteAnchor(list[i]);
  }

  /** 关闭时把已改写的 href 还原成原始地址（去掉 PROXY_ORIGIN 前缀），并清掉标记 */
  function unrewriteAll() {
    if (!document || !document.querySelectorAll) return;
    var list = document.querySelectorAll("a[data-gh-proxy]");
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var href = a.getAttribute("href") || "";
      if (isProxied(href)) a.setAttribute("href", href.slice(PROXY_ORIGIN.length));
      delete a.dataset.ghProxy;
    }
  }

  /* =========================================================================
   * 5. 点击兜底（捕获阶段）
   * -------------------------------------------------------------------------
   * 覆盖：JS 动态生成、点击时 href 才被赋值、扩展/脚本拦了默认行为等
   *      「href 还没来得及改写就已经被点」的场景。
   *
   * 明确的边界（覆盖不到）：
   *   - 右键菜单「复制链接地址」「链接另存为」：不触发 click 事件，
   *     只能靠第 4 节的 href 就地改写；若该 <a> 未被改写则无法覆盖。
   *   - 中键点击走 auxclick（已监听）；但部分页面/管理器对中键只发 mousedown，
   *     这依赖 href 已被改写。
   *   - <a download> 由浏览器直接接管下载的极端情况、form.submit()、
   *     脚本直接 window.location= / fetch() / XHR / sendBeacon 请求，均不经过本监听。
   *   - 跨域 iframe 内的链接不在本脚本作用域（@match 不覆盖该 iframe）。
   *   - 已有显式 target=_blank 的链接用 location.href 跳转会丢失新标签语义，
   *     因此代码里对 ctrl/meta/shift/中键统一走 window.open。
   * ========================================================================= */

  function onClick(ev) {
    if (!enabled) return;
    if (!ev || !ev.target || typeof ev.target.closest !== "function") return;
    var a = ev.target.closest("a[href]");
    if (!a) return;
    var url = toAbsolute(a.getAttribute("href"));
    if (!url || isProxied(url) || !isProxyable(url)) return;
    var proxied = toProxyUrl(url);
    if (typeof ev.preventDefault === "function") ev.preventDefault();
    if (typeof ev.stopPropagation === "function") ev.stopPropagation();
    var newTab = (ev.type === "auxclick") || ev.button === 1 || ev.ctrlKey || ev.metaKey || ev.shiftKey;
    if (newTab) window.open(proxied, "_blank", "noopener");
    else location.href = proxied;
  }

  /* =========================================================================
   * 6. 主框架兜底跳转（等效扩展 rules.json 的三条 declarativeNetRequest 规则）
   * -------------------------------------------------------------------------
   * 用户脚本没有 DNR，无法在导航发出前拦截。这里在页面已加载后判断：
   * 如果当前页面地址本身就是可代理的下载地址（例如直接把
   * https://github.com/o/r/releases/download/v1/a.zip 粘进地址栏，
   * 或 GitHub 用 JS 把 location 切到 archive/zipball），就整页 replace 到代理地址。
   * isProxyable 对已带前缀的地址返回 false，所以不会来回跳。
   * ========================================================================= */

  function mainFrameRedirect() {
    if (!enabled) return false;
    var here;
    try {
      here = location.href;
    } catch (e) {
      return false;
    }
    if (!isProxyable(here)) return false;
    var target = toProxyUrl(here);
    try {
      if (typeof location.replace === "function") location.replace(target);
      else location.href = target;
    } catch (e) {
      try { location.href = target; } catch (e2) { return false; }
    }
    return true;
  }

  /* =========================================================================
   * 7. 启动
   * ========================================================================= */

  if (document && document.addEventListener) {
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
  }

  var MO = (typeof MutationObserver === "function") ? MutationObserver : null;
  if (MO && document && document.documentElement) {
    try {
      var observer = new MO(function (mutations) {
        if (!enabled) return;
        for (var i = 0; i < mutations.length; i++) {
          var m = mutations[i];
          if (m.type === "attributes") {
            rewriteAnchor(m.target);
            continue;
          }
          var added = m.addedNodes || [];
          for (var j = 0; j < added.length; j++) {
            if (added[j] && added[j].nodeType === 1) scan(added[j]);
          }
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href"]
      });
    } catch (e) { /* 老浏览器/桩环境忽略 */ }
  }

  mainFrameRedirect();
  if (enabled) scan(document);
  else unrewriteAll();
  registerMenu();

  /* =========================================================================
   * 8. 测试/排查出口：只暴露 window.__ghProxy 一个名字，不污染其它全局
   * -------------------------------------------------------------------------
   * 篡改猴里 window 有可能是沙箱代理，所以优先写 page 的 unsafeWindow
   * （@grant unsafeWindow 已声明），拿不到就退回 window。
   * ========================================================================= */

  var api = {
    version: SCRIPT_VERSION,
    PROXY_ORIGIN: PROXY_ORIGIN,
    isProxied: isProxied,
    isProxyable: isProxyable,
    toProxyUrl: toProxyUrl,
    toAbsolute: toAbsolute,
    isEnabled: function () { return enabled; },
    setEnabled: setEnabled,
    menuLabel: menuLabel,
    rewriteAnchor: rewriteAnchor,
    scan: scan,
    unrewriteAll: unrewriteAll,
    onClick: onClick,
    mainFrameRedirect: mainFrameRedirect,
    storageBackend: storageBackend,
    storage: { get: gmGet, set: gmSet, del: gmDel, key: STORE_KEY, lsPrefix: LS_PREFIX }
  };

  var pageWindow = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;
  pageWindow.__ghProxy = api;
})();
