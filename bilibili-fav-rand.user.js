// ==UserScript==
// @name         B站收藏夹抽签
// @namespace    bilibili-fav-rand
// @version      1.4.1
// @description  任意B站页面右下角悬浮按钮，随机抽取收藏夹视频并打开。首次点击会一次性读取收藏夹全部视频并缓存24小时（期间抽取零请求），自动跳过失效视频，支持私密收藏夹。长按按钮可更换收藏夹。
// @match        *://*.bilibili.com/*
// @run-at       document-idle
// @license      MIT
// @grant        none
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self) return;

  // fid 优先级：当前页URL参数 → 本机记忆 → 首次点击时询问
  var fid = (location.search.match(/[?&]fid=(\d+)/) || [])[1] || '';
  try { fid = fid || localStorage.getItem('biliRandomFid') || ''; } catch (e) {}

  var btn = document.createElement('div');
  btn.textContent = '🎲';
  btn.title = '随机抽取（长按/右键更换收藏夹）';
  btn.style.cssText = 'position:fixed;right:18px;bottom:88px;z-index:99999;width:52px;height:52px;'
    + 'border-radius:50%;background:#fb7299;color:#fff;font-size:26px;line-height:52px;text-align:center;'
    + 'cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);user-select:none;-webkit-user-select:none;';
  document.body.appendChild(btn);

  function saveFid(f) {
    fid = f;
    clearCache();
    try { localStorage.setItem('biliRandomFid', fid); } catch (e) {}
  }
  function askFid() {
    var f = prompt('当前收藏夹fid：' + (fid || '未设置')
      + '\n输入要抽取的fid（收藏夹链接里fid=后面的数字）：');
    if (f && /^\d+$/.test(f)) { saveFid(f); return true; }
    if (f) alert('fid应为纯数字');
    return false;
  }
  function riskUntil() {
    try { return +(localStorage.getItem('biliRandomRiskUntil') || 0); } catch (e) { return 0; }
  }
  function markRisk() {
    // 触发风控后冷却3分钟，期间点击不再发请求
    try { localStorage.setItem('biliRandomRiskUntil', String(Date.now() + 3 * 60 * 1000)); } catch (e) {}
  }

  var CACHE_TTL = 24 * 60 * 60 * 1000; // 存活列表缓存24小时；长按重新输入同一fid可强制刷新

  var busy = false;
  var lastReq = 0;
  async function get(pn) {
    // 请求间至少间隔500ms，平稳读取整本收藏夹
    var wait = lastReq + 500 - Date.now();
    if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
    lastReq = Date.now();
    var r = await fetch('https://api.bilibili.com/x/v3/fav/resource/list?media_id=' + fid
      + '&pn=' + pn + '&ps=20&type=0&need_api_username=true', { credentials: 'include' });
    var text = await r.text();
    try {
      var res = JSON.parse(text);
      if (res.code === -352 || res.code === 403) throw { risk: true };
      return res.data;
    } catch (e) {
      if (e && e.risk) throw e;
      // 收到非JSON响应（412/403挑战页等）= 触发风控
      throw { risk: true };
    }
  }

  function isAlive(it) {
    return it && it.bv_id && it.title !== '-1' && ((it.attr | 0) & 1) === 0;
  }
  function cacheKey() { return 'biliRandomCache:' + fid; }
  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
      if (c && Date.now() - c.ts < CACHE_TTL && c.alive && c.alive.length) return c.alive;
    } catch (e) {}
    return null;
  }
  function saveCache(alive) {
    try { localStorage.setItem(cacheKey(), JSON.stringify({ ts: Date.now(), alive: alive })); } catch (e) {}
  }
  function clearCache() {
    try { localStorage.removeItem(cacheKey()); } catch (e) {}
  }

  btn.addEventListener('click', async function () {
    if (suppressed) { suppressed = false; return; } // 长按结束后的那次click不触发抽取
    if (busy) return;
    var cool = riskUntil() - Date.now();
    if (cool > 0) {
      alert('B站风控冷却中（约还需 ' + Math.ceil(cool / 60000) + ' 分钟）：等冷却结束再点，期间请求只会加重风控');
      return;
    }
    busy = true;
    btn.style.opacity = '.5';
    try {
      if (!fid && !askFid()) return;

      // 30分钟内的缓存直接用（零请求）；过期则一次性读取全部页并筛出存活视频
      var alive = loadCache();
      if (!alive) {
        var d = await get(1);
        if (!d) { alert('收藏夹不存在、已删除或未公开'); return; }
        var n = d.info.media_count | 0;
        if (!n) { alert('这个收藏夹是空的'); return; }
        var totalPages = Math.ceil(n / 20);
        alive = [];
        for (var p = 1; p <= totalPages; p++) {
          btn.textContent = Math.round(p / totalPages * 100) + '%';
          var medias = p === 1 ? (d.medias || []) : (((await get(p)) || {}).medias || []);
          for (var k = 0; k < medias.length; k++) {
            var it = medias[k];
            if (isAlive(it)) alive.push({
              i: (p - 1) * 20 + k,
              t: it.title,
              u: (it.upper && it.upper.name) || '-',
              b: it.bv_id
            });
          }
        }
        btn.textContent = '🎲';
        if (!alive.length) { alert('这个收藏夹里没有可播放的视频（可能大多已失效）'); return; }
        saveCache(alive);
      }

      var pick = alive[(Math.random() * alive.length) | 0];
      var act = prompt('#' + (pick.i + 1) + ' ' + pick.t
        + '\nUP: ' + pick.u
        + '\nBV: ' + pick.b
        + '\n\n点「确定」打开视频；文本可复制', 'https://www.bilibili.com/video/' + pick.b);
      if (act) {
        var w = window.open(act);
        if (!w) location.href = act;
      }
    } catch (e) {
      btn.textContent = '🎲';
      if (e && e.risk) {
        markRisk();
        alert('已触发B站风控（短时间内请求过多）：请等待至少几分钟再点；若收藏夹页面也打不开，说明当前IP被B站暂时限制，等待恢复或切换网络即可');
      } else {
        alert('出错：' + (e && e.message || e));
      }
    } finally {
      busy = false;
      btn.style.opacity = '';
      btn.textContent = '🎲';
    }
  });

  // 长按（手机）或右键（电脑）更换收藏夹
  function changeFid(e) {
    if (e && e.preventDefault) e.preventDefault();
    askFid();
  }
  var lpTimer = null, suppressed = false;
  btn.addEventListener('touchstart', function () {
    lpTimer = setTimeout(function () { lpTimer = null; suppressed = true; changeFid(); }, 600);
  }, { passive: true });
  btn.addEventListener('touchend', function () {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
  });
  btn.addEventListener('contextmenu', changeFid);
})();
