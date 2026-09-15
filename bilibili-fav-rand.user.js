// ==UserScript==
// @name         B站收藏夹抽签
// @namespace    bilibili-fav-rand
// @version      1.2
// @description  任意B站页面右下角悬浮按钮，一键随机抽取收藏夹视频并打开（自动跳过失效视频，支持私密收藏夹）。首次使用需输入一次fid，长按按钮可更换收藏夹。
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
    try { localStorage.setItem('biliRandomFid', fid); } catch (e) {}
  }
  function askFid() {
    var f = prompt('当前收藏夹fid：' + (fid || '未设置')
      + '\n输入要抽取的fid（收藏夹链接里fid=后面的数字）：');
    if (f && /^\d+$/.test(f)) { saveFid(f); return true; }
    if (f) alert('fid应为纯数字');
    return false;
  }

  var busy = false;
  async function get(pn) {
    var r = await fetch('https://api.bilibili.com/x/v3/fav/resource/list?media_id=' + fid
      + '&pn=' + pn + '&ps=20&type=0&need_api_username=true', { credentials: 'include' });
    return (await r.json()).data;
  }

  btn.addEventListener('click', async function () {
    if (suppressed) { suppressed = false; return; } // 长按结束后的那次click不触发抽取
    if (busy) return;
    busy = true;
    btn.style.opacity = '.5';
    try {
      if (!fid && !askFid()) return;
      var d = await get(1);
      if (!d) { alert('收藏夹不存在、已删除或未公开'); return; }
      var n = d.info.media_count | 0;
      if (!n) { alert('这个收藏夹是空的'); return; }
      var got = null;
      for (var t = 0; t < 10 && !got; t++) {
        var i = Math.floor(Math.random() * n), pn = (i / 20 | 0) + 1, ps = i % 20;
        var it = (pn === 1 ? d : await get(pn)).medias[ps];
        if (it && it.bv_id && it.title !== '-1' && ((it.attr | 0) & 1) === 0) got = { i: i, it: it };
      }
      if (!got) { alert('连续多次抽中失效视频，请稍后再试'); return; }
      var it = got.it;
      var act = prompt('#' + (got.i + 1) + ' ' + it.title
        + '\nUP: ' + (it.upper ? it.upper.name : '-')
        + '\nBV: ' + it.bv_id
        + '\n\n点「确定」打开视频；文本可复制', 'https://www.bilibili.com/video/' + it.bv_id);
      if (act) {
        var w = window.open(act);
        if (!w) location.href = act;
      }
    } catch (e) {
      alert('出错：' + (e && e.message || e));
    } finally {
      busy = false;
      btn.style.opacity = '';
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
  btn.addEventListener('click', function () {
    if (suppressed) { suppressed = false; return; }
  }, true);
})();
