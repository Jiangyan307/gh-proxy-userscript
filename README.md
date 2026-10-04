# gh-proxy-userscript

> 点 GitHub 的下载链接时，自动改走 [gh-proxy.com](https://gh-proxy.com/) 加速。一个装在 **篡改猴（Tampermonkey）** 里的用户脚本，装一次，之后你**怎么启动浏览器都生效**。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Manifest](https://img.shields.io/badge/UserScript-Tampermonkey-004d40)

---

## 它做什么

在 GitHub 页面上把下面这些**下载类链接**就地改写成 `https://gh-proxy.com/<原地址>`：

- `github.com/<owner>/<repo>/releases/download/...`
- `github.com/<owner>/<repo>/releases/latest/download/...`
- `github.com/<owner>/<repo>/archive/...`（源码 zip / tar.gz）
- `github.com/<owner>/<repo>/raw/...`、`zipball`、`tarball`
- `gist.github.com/<user>/<id>/raw/...`
- `raw.githubusercontent.com`、`codeload.github.com`、`gist.githubusercontent.com`、`objects.githubusercontent.com`

普通仓库页、issue、PR、代码浏览等链接**不会**被改动；已经带 `gh-proxy.com` 前缀的链接不会重复套娃。

改写的是 `<a>` 的 `href` 本身，所以左键、中键、右键「复制链接地址」、「链接另存为」拿到的都是加速地址。

## 安装

1. 浏览器装好 **篡改猴 / Tampermonkey**（[Edge 扩展商店](https://microsoftedge.microsoft.com/addons/detail/iikmkjmpaadaobahmlepeloendndfphd) / [Chrome 应用商店](https://chromewebstore.google.com/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo)）。
2. **确保开关是开的**（缺一个脚本就不会注入）：
   - `edge://extensions`（或 `chrome://extensions`）左侧栏 → **开发人员模式 / 开发者模式** = 开
   - 篡改猴这一条 → 开关 = 开
   - 篡改猴**详情页** → **允许用户脚本 / Allow User Scripts** = 开
3. 点这里安装脚本 → **[gh-proxy.user.js](https://raw.githubusercontent.com/Jiangyan307/gh-proxy-userscript/main/gh-proxy.user.js)**
   （或者：打开本仓库的 `gh-proxy.user.js`，点右上角 `Raw`。）
4. 篡改猴弹出安装页，点一次「安装」。
5. 本地文件安装也行：下载 `gh-proxy.user.js`，在篡改猴仪表盘点「+」新建脚本，把内容粘进去，`Ctrl+S`。

## 开关

篡改猴图标 → 菜单里的 **「开启/关闭 gh-proxy（当前：开/关）」**。关闭会把已经改写的链接**立刻还原**成原生 GitHub 地址。

## 怎么确认它在工作

1. 打开任意 GitHub 仓库的 Release / Tags 页面。
2. 右键任意 `.zip` / `.tar.gz` 下载链接 → 「复制链接」，地址应以 `https://gh-proxy.com/` 开头。
3. 页面控制台执行：`window.__ghProxy.isEnabled()` → `true`；`document.querySelectorAll('[data-gh-proxy]').length` → 大于 0。

## 已知边界

- 覆盖不到：链接**尚未被改写**时的右键「复制链接地址 / 另存为」（不触发 `click`）；页面脚本内部的 `location` 赋值 / `fetch` / `XHR` / `form.submit`；`<a download>` 被浏览器直接接管的极端情况；跨域 iframe 内的链接。
- 只处理下载类路径，其它页面原样不动。
- 加速效果完全取决于代理站的可用性与出口带宽。

## 致谢

**本项目只是一个链接改写器，真正的加速能力来自第三方公益服务 —— 感谢 [gh-proxy.com](https://gh-proxy.com/) 免费提供 GitHub 地址解析 / 加速转发。** 没有它，这个脚本没有任何意义。如果你觉得它好用，请把这份感谢记在它头上，而不是记在这个脚本上。

同样感谢 [篡改猴 / Tampermonkey](https://www.tampermonkey.net/) 提供了让用户脚本能跨浏览器、跨启动方式稳定运行的宿主。

## 免责声明

- 本脚本与 gh-proxy.com 无隶属关系，也不由它维护；脚本只是拼一个地址前缀，不代理、不缓存、不接触你的任何数据。
- 第三方代理站的可用性、稳定性与隐私策略由该站自行决定。介意的话请关闭开关，或改用自建代理。
- 请遵守 GitHub 的服务条款与所在地区的法律法规。请勿用于下载你无权获取的内容。

## License

[MIT](LICENSE)

---

## English (short)

A Tampermonkey userscript that rewrites GitHub download links (`releases/download`, `archive`, `raw`, `zipball`, `tarball`, gist raw, `raw.githubusercontent.com`, `codeload.github.com`, …) to `https://gh-proxy.com/<original-url>` so downloads go through a public proxy.

**Credit:** all acceleration is provided by the free third-party service **[gh-proxy.com](https://gh-proxy.com/)** — this repo only prepends a prefix. Thanks also to [Tampermonkey](https://www.tampermonkey.net/).

Install: make sure *Developer mode* and *Allow User Scripts* are enabled for Tampermonkey, then open [gh-proxy.user.js](https://raw.githubusercontent.com/Jiangyan307/gh-proxy-userscript/main/gh-proxy.user.js) and click **Install**.

Not affiliated with gh-proxy.com, GitHub or Tampermonkey. Use at your own risk.
