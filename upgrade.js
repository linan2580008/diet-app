/* Diet App Personal Upgrade v2
   纯前端增强层：不改动原有数据结构，兼容 GitHub Pages + localStorage。
   原有 key（diet-goals / diet-foods / diet-log-*）全部保留，新功能使用独立 key。
*/
(function () {
  'use strict';

  var KEY = {
    profile: 'diet-profile-v2',
    weight: 'diet-weight-v1',
    workouts: 'diet-workouts-v1',
    supplements: 'diet-supplements-v1',
    dayType: 'diet-day-type-v1'
  };

  var defaultProfile = {
    height: 177, weight: 69, waist: 86, neck: 36,
    trainingCal: 2250, restCal: 2100,
    protein: 130, fat: 62, carbsTraining: 270, carbsRest: 235
  };

  // ---------- 工具 ----------
  function read(k, fallback) {
    try { var x = localStorage.getItem(k); return x ? JSON.parse(x) : fallback; }
    catch (_) { return fallback; }
  }
  function write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  // 统一使用本地日期（修复旧版 toISOString 的 UTC 时区 bug）
  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function today() { return fmtDate(new Date()); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function num(x, d) { return Number.isFinite(Number(x)) && x !== '' ? Number(x) : (d || 0); }

  function profile() {
    var p = {}; for (var k in defaultProfile) p[k] = defaultProfile[k];
    return Object.assign(p, read(KEY.profile, {}));
  }
  function dayType() { return localStorage.getItem(KEY.dayType) || 'training'; }

  function goalsFor(type) {
    var p = profile();
    type = type || dayType();
    if (type === 'rest') return { calories: p.restCal, protein: p.protein, fat: p.fat, carbs: p.carbsRest };
    return { calories: p.trainingCal, protein: p.protein, fat: p.fat, carbs: p.carbsTraining };
  }

  // 把当前日类型的目标同步回旧版 diet-goals，保证首页原有卡片显示正确目标
  function syncGoals() {
    if (typeof saveGoals === 'function') saveGoals(goalsFor());
  }

  function getTotals(date) {
    var logs = typeof getLogs === 'function' ? getLogs(date || today()) : [];
    return logs.reduce(function (a, x) {
      a.calories += num(x.calories); a.protein += num(x.protein);
      a.carbs += num(x.carbs); a.fat += num(x.fat);
      return a;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }

  // ---------- 身体数据 ----------
  function weightRecords() {
    return read(KEY.weight, []).slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  function latestWith(arr, field) {
    for (var i = arr.length - 1; i >= 0; i--) if (num(arr[i][field])) return arr[i];
    return null;
  }
  function avgOf(arr) {
    if (!arr.length) return null;
    return arr.reduce(function (s, x) { return s + num(x.weight); }, 0) / arr.length;
  }
  // 7日平均与趋势：不足7次明确提示"数据积累中"
  function weightStats(recs) {
    var withW = recs.filter(function (x) { return num(x.weight); });
    var r = { count: withW.length, avg7: null, trend: null, trendText: '' };
    if (withW.length < 7) {
      r.trendText = '数据积累中（' + withW.length + '/7 次记录）';
      return r;
    }
    var last7 = withW.slice(-7);
    r.avg7 = avgOf(last7);
    var prev = withW.slice(Math.max(0, withW.length - 14), withW.length - 7);
    if (prev.length) {
      var diff = r.avg7 - avgOf(prev);
      r.trend = diff;
      if (Math.abs(diff) < 0.2) r.trendText = '→ 基本稳定';
      else if (diff < 0) r.trendText = '↓ ' + Math.abs(diff).toFixed(1) + ' kg / 7日';
      else r.trendText = '↑ ' + diff.toFixed(1) + ' kg / 7日';
    } else {
      r.trendText = '→ 继续记录后生成趋势';
    }
    return r;
  }
  function waistStats(recs) {
    var withW = recs.filter(function (x) { return num(x.waist); });
    if (!withW.length) return { count: 0, latest: null, change: null, text: '还没有腰围记录' };
    var latest = withW[withW.length - 1];
    var r = { count: withW.length, latest: latest.waist, change: null, text: '' };
    if (withW.length >= 2) {
      var prev = withW[withW.length - 2];
      var diff = latest.waist - prev.waist;
      r.change = diff;
      if (Math.abs(diff) < 0.15) r.text = '→ 基本稳定';
      else r.text = (diff < 0 ? '↓ ' : '↑ ') + Math.abs(diff).toFixed(1) + ' cm（较 ' + prev.date + '）';
    } else {
      r.text = '继续记录后生成趋势。';
    }
    return r;
  }

  // ---------- 肌酸 ----------
  function creatineData() { return read(KEY.supplements, {}); }
  function creatineStreak() {
    var s = creatineData();
    var streak = 0;
    var d = new Date();
    if (!s[today()]) d.setDate(d.getDate() - 1); // 今天还没打卡则从昨天往前数
    while (true) {
      var k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (s[k]) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return streak;
  }
  function creatineWeek() {
    var s = creatineData();
    var d = new Date();
    var dow = (d.getDay() + 6) % 7; // 周一为一周开始
    var count = 0;
    for (var i = 0; i <= dow; i++) {
      var t = new Date(d); t.setDate(d.getDate() - i);
      var k = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
      if (s[k]) count++;
    }
    return count;
  }

  // ---------- 训练 ----------
  function workoutLogs() { return read(KEY.workouts, []); }
  function weekWorkoutStats() {
    var logs = workoutLogs();
    var d = new Date();
    var dow = (d.getDay() + 6) % 7;
    var monday = new Date(d); monday.setDate(d.getDate() - dow);
    var start = monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');
    var stats = { strength: 0, cardio: {} };
    logs.forEach(function (x) {
      if (x.date < start) return;
      if (x.kind === 'cardio') stats.cardio[x.category] = (stats.cardio[x.category] || 0) + 1;
      else stats.strength++;
    });
    return stats;
  }

  // ---------- 样式 ----------
  function injectCSS() {
    var css = ''
      + '.du-card{background:#fff;border-radius:14px;padding:14px;margin:10px 0;box-shadow:0 1px 5px rgba(0,0,0,.05)}'
      + '.du-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}'
      + '.du-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}'
      + '.du-metric{background:#f7f8fa;border-radius:12px;padding:12px}'
      + '.du-metric b{display:block;font-size:20px;color:#222;margin-top:2px}'
      + '.du-muted{color:#8a8a8a;font-size:12px}'
      + '.du-btn{border:0;border-radius:10px;padding:11px 14px;background:#4CAF50;color:#fff;font-size:14px;font-weight:600;width:100%}'
      + '.du-btn.secondary{background:#f0f0f0;color:#555}'
      + '.du-btn.danger{background:#fff0f0;color:#c62828}'
      + '.du-btn.half{width:50%}'
      + '.du-quick{background:#f0f7f0;border:1px solid #dceedd;border-radius:12px;padding:10px 4px;text-align:center;font-size:13px;color:#2e7d32;cursor:pointer}'
      + '.du-quick span{display:block;font-size:18px;margin-bottom:2px}'
      + '.du-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:8px 0}'
      + '.du-row input,.du-row select,.du-input{width:100%;padding:10px;border:1.5px solid #e5e5e5;border-radius:9px;background:#fff}'
      + '.du-pills{display:flex;gap:8px;margin:8px 0}'
      + '.du-pill{flex:1;text-align:center;padding:9px 0;border-radius:999px;background:#f0f0f0;color:#666;font-size:14px;cursor:pointer;border:1.5px solid transparent}'
      + '.du-pill.active{background:#eaf7ec;color:#2e7d32;border-color:#4CAF50;font-weight:600}'
      + '.du-list{margin:0;padding:0;list-style:none}.du-list li{padding:10px 0;border-bottom:1px solid #f0f0f0}'
      + '.du-list li:last-child{border-bottom:0}'
      + '.du-tip{background:#f0f7ff;border-left:3px solid #42A5F5;border-radius:8px;padding:10px 12px;font-size:13px;margin:10px 0;color:#555}'
      + '.du-chart-box{position:relative;height:180px;margin-top:8px}'
      + '.du-link-item{display:flex;justify-content:space-between;align-items:center;padding:13px 4px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:15px}'
      + '.du-link-item:last-child{border-bottom:0}'
      + '.du-del{border:0;background:none;color:#c62828;font-size:13px;padding:4px 6px;cursor:pointer}'
      + '.du-edit{border:0;background:none;color:#42A5F5;font-size:13px;padding:4px 6px;cursor:pointer}'
      + '@media(max-width:360px){.du-grid{grid-template-columns:1fr}.du-grid4{grid-template-columns:repeat(2,1fr)}}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- 页面与导航（5 栏：今日 / 记录 / ＋ / 训练 / 更多） ----------
  var NAV = [
    { page: 'home', icon: '🏠', label: '今日' },
    { page: 'history', icon: '📅', label: '记录' },
    { page: 'add', icon: '➕', label: '添加' },
    { page: 'workout', icon: '🏋️', label: '训练' },
    { page: 'more', icon: '⚙️', label: '更多' }
  ];
  var TITLES = {
    home: '今日饮食', history: '历史记录', add: '添加食物',
    workout: '训练', more: '更多', body: '身体数据',
    foods: '我的食物库', stats: '数据统计', settings: '设置'
  };

  function addPages() {
    var pages = document.querySelector('.pages');
    var nav = document.querySelector('.nav-bar');
    if (!pages || !nav || document.getElementById('page-workout')) return;

    pages.insertAdjacentHTML('beforeend',
      '<div class="page" id="page-body"><div id="du-body-content"></div></div>' +
      '<div class="page" id="page-workout"><div id="du-workout-content"></div></div>' +
      '<div class="page" id="page-more"><div id="du-more-content"></div></div>'
    );

    // 重建 5 栏导航
    nav.innerHTML = '';
    NAV.forEach(function (item, i) {
      var el = document.createElement('div');
      el.className = 'nav-item du-nav' + (i === 0 ? ' active' : '');
      el.setAttribute('data-page', item.page);
      el.innerHTML = '<span class="nav-icon">' + item.icon + '</span><span class="nav-label">' + item.label + '</span>';
      el.onclick = function () { duSwitch(item.page); };
      nav.appendChild(el);
    });
  }

  function duSwitch(page) {
    document.querySelectorAll('.page').forEach(function (x) { x.classList.remove('active'); });
    var target = document.getElementById('page-' + page);
    if (!target) return;
    target.classList.add('active');
    var titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = TITLES[page] || '';
    // 导航高亮：子页面（身体/食物库/统计/设置）归入"更多"
    var navPage = ['body', 'foods', 'stats', 'settings'].indexOf(page) >= 0 ? 'more' : page;
    document.querySelectorAll('.nav-bar .nav-item').forEach(function (x) {
      x.classList.toggle('active', x.getAttribute('data-page') === navPage);
    });
    if (page === 'home') renderHome();
    if (page === 'history') renderHistory();
    if (page === 'add') renderAddPage();
    if (page === 'foods') renderFoodsPage();
    if (page === 'stats') renderStats();
    if (page === 'settings') renderSettings();
    if (page === 'body') renderBody();
    if (page === 'workout') renderWorkout();
    if (page === 'more') renderMore();
  }

  // ---------- 首页增强面板 ----------
  function renderHomeUpgrade() {
    var p = profile(), g = goalsFor();
    var header = document.querySelector('.calorie-card');
    if (!header) return;

    var box = document.getElementById('du-home-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'du-home-panel';
      header.parentNode.insertBefore(box, header.nextSibling);
    }

    var recs = weightRecords();
    var ws = weightStats(recs);
    var wst = waistStats(recs);
    var latestW = latestWith(recs, 'weight');
    var curWeight = latestW ? latestW.weight : p.weight;
    var cre = creatineData()[today()];
    var trainedToday = workoutLogs().some(function (x) { return x.date === today(); });
    var isRest = dayType() === 'rest';

    box.innerHTML =
      '<div class="du-card">' +
        '<div class="du-pills">' +
          '<div class="du-pill' + (!isRest ? ' active' : '') + '" onclick="window.DietUpgrade.setDayType(\'training\')">训练日</div>' +
          '<div class="du-pill' + (isRest ? ' active' : '') + '" onclick="window.DietUpgrade.setDayType(\'rest\')">休息日</div>' +
        '</div>' +
        '<div class="du-muted">今日目标 ' + g.calories + ' kcal · 蛋白质 ' + g.protein + 'g · 碳水 ' + g.carbs + 'g · 脂肪 ' + g.fat + 'g</div>' +
      '</div>' +
      '<div class="du-card">' +
        '<div class="du-grid">' +
          '<div class="du-metric"><span class="du-muted">当前体重</span><b>' + num(curWeight).toFixed(1) + ' kg</b></div>' +
          '<div class="du-metric"><span class="du-muted">7日平均</span><b>' + (ws.avg7 ? ws.avg7.toFixed(1) + ' kg' : '数据积累中') + '</b>' +
            (ws.trendText && ws.avg7 ? '<div class="du-muted">' + esc(ws.trendText) + '</div>' : '') + '</div>' +
          '<div class="du-metric"><span class="du-muted">腰围</span><b>' + (wst.latest ? wst.latest + ' cm' : '—') + '</b></div>' +
          '<div class="du-metric"><span class="du-muted">肌酸 / 训练</span><b style="font-size:16px">' +
            (cre ? '✓ 肌酸' : '○ 肌酸') + ' · ' + (trainedToday ? '✓ 已练' : '○ 未练') + '</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="du-grid4" style="margin:10px 0">' +
        '<div class="du-quick" onclick="window.DietUpgrade.go(\'add\')"><span>🍚</span>＋食物</div>' +
        '<div class="du-quick" onclick="window.DietUpgrade.go(\'body\')"><span>⚖️</span>＋体重</div>' +
        '<div class="du-quick" onclick="window.DietUpgrade.go(\'workout\')"><span>🏋️</span>＋训练</div>' +
        '<div class="du-quick" onclick="window.DietUpgrade.toggleCreatine()"><span>💊</span>' + (cre ? '✓ 肌酸' : '＋肌酸') + '</div>' +
      '</div>';
  }

  // ---------- 身体数据页 ----------
  var weightChartInst = null, waistChartInst = null;

  function renderBody() {
    var recs = weightRecords();
    var ws = weightStats(recs);
    var wst = waistStats(recs);
    var latestW = latestWith(recs, 'weight');
    var p = profile();

    var html =
      '<h2 style="margin-bottom:4px">身体数据</h2>' +
      '<div class="du-card"><div class="du-grid">' +
        '<div class="du-metric"><span class="du-muted">当前体重</span><b>' + (latestW ? num(latestW.weight).toFixed(1) : p.weight) + ' kg</b></div>' +
        '<div class="du-metric"><span class="du-muted">7日平均</span><b>' + (ws.avg7 ? ws.avg7.toFixed(1) + ' kg' : '数据积累中') + '</b></div>' +
        '<div class="du-metric"><span class="du-muted">最近腰围</span><b>' + (wst.latest ? wst.latest + ' cm' : '—') + '</b></div>' +
        '<div class="du-metric"><span class="du-muted">趋势</span><b style="font-size:15px">' + esc(ws.trendText || '—') + '</b></div>' +
      '</div></div>' +

      '<div class="du-card"><b>记录身体数据</b>' +
        '<div class="du-row"><input id="du-weight" type="number" step="0.1" inputmode="decimal" placeholder="体重 kg">' +
        '<input id="du-waist" type="number" step="0.1" inputmode="decimal" placeholder="腰围 cm（可选）"></div>' +
        '<button class="du-btn" onclick="window.DietUpgrade.addBody()">保存</button>' +
        '<p class="du-muted" style="margin-top:6px">同一天重复保存会覆盖当天记录。腰围可单独记录。</p>' +
      '</div>' +

      '<div class="du-card"><b>体重趋势</b>' +
        '<p class="du-muted">' + (ws.avg7 ? '7日平均 ' + ws.avg7.toFixed(1) + ' kg · ' + esc(ws.trendText) : esc(ws.trendText)) + '</p>' +
        '<div class="du-chart-box"><canvas id="du-weight-chart"></canvas></div>' +
      '</div>' +

      '<div class="du-card"><b>腰围趋势</b>' +
        '<p class="du-muted">' + (wst.latest ? '当前 ' + wst.latest + ' cm · ' + esc(wst.text) : esc(wst.text)) + '</p>' +
        (wst.count >= 2 ? '<div class="du-chart-box"><canvas id="du-waist-chart"></canvas></div>' : '') +
      '</div>' +

      '<div class="du-card"><b>历史记录</b><ul class="du-list">' +
        (recs.slice().reverse().map(function (x) {
          return '<li style="display:flex;justify-content:space-between;align-items:center">' +
            '<span>' + esc(x.date) + '　<b>' + (num(x.weight) ? x.weight + ' kg' : '—') + '</b>' +
            (num(x.waist) ? '　腰 ' + x.waist + ' cm' : '') + '</span>' +
            '<span><button class="du-edit" onclick="window.DietUpgrade.editBody(\'' + x.date + '\')">编辑</button>' +
            '<button class="du-del" onclick="window.DietUpgrade.delBody(\'' + x.date + '\')">删除</button></span></li>';
        }).join('') || '<li class="du-muted">还没有记录</li>') +
      '</ul></div>' +

      '<div class="du-tip">不要用单日体重判断减脂效果。看 7 日平均体重 + 腰围 + 训练表现，单日 ±0.5kg 大多是水分波动。</div>';

    document.getElementById('du-body-content').innerHTML = html;
    renderWeightChart(recs);
    renderWaistChart(recs);
  }

  function renderWeightChart(recs) {
    var canvas = document.getElementById('du-weight-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    var data = recs.filter(function (x) { return num(x.weight); }).slice(-30);
    if (weightChartInst) { weightChartInst.destroy(); weightChartInst = null; }
    if (!data.length) return;

    var labels = data.map(function (x) { return x.date.slice(5); });
    var weights = data.map(function (x) { return x.weight; });
    // 每一点的7日滚动平均（不足7个时取已有记录的平均）
    var avgLine = data.map(function (_, i) {
      var win = data.slice(Math.max(0, i - 6), i + 1);
      return Math.round(avgOf(win) * 10) / 10;
    });

    weightChartInst = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: '体重', data: weights, borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,.08)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 },
          { label: '7日平均', data: avgLine, borderColor: '#FF7043', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, labels: { boxWidth: 12, font: { size: 10 } } } },
        scales: {
          x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { ticks: { font: { size: 10 } }, grace: '5%' }
        }
      }
    });
  }

  function renderWaistChart(recs) {
    var canvas = document.getElementById('du-waist-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    var data = recs.filter(function (x) { return num(x.waist); }).slice(-30);
    if (waistChartInst) { waistChartInst.destroy(); waistChartInst = null; }
    if (data.length < 2) return;

    waistChartInst = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: data.map(function (x) { return x.date.slice(5); }),
        datasets: [{ label: '腰围 cm', data: data.map(function (x) { return x.waist; }), borderColor: '#42A5F5', backgroundColor: 'rgba(66,165,245,.08)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
          y: { ticks: { font: { size: 10 } }, grace: '5%' }
        }
      }
    });
  }

  function addBody() {
    var w = document.getElementById('du-weight').value;
    var waist = document.getElementById('du-waist').value;
    if (!num(w) && !num(waist)) { alert('请至少输入体重或腰围'); return; }
    var editDate = window._duEditDate || today();
    var arr = weightRecords().filter(function (x) { return x.date !== editDate; });
    arr.push({ date: editDate, weight: num(w) || null, waist: num(waist) || null });
    arr.sort(function (a, b) { return a.date.localeCompare(b.date); });
    write(KEY.weight, arr);
    // 同步 profile 中的当前值（供首页默认显示）
    var p = profile();
    if (num(w)) p.weight = num(w);
    if (num(waist)) p.waist = num(waist);
    write(KEY.profile, p);
    window._duEditDate = null;
    renderBody();
  }
  function editBody(date) {
    var rec = weightRecords().find(function (x) { return x.date === date; });
    if (!rec) return;
    document.getElementById('du-weight').value = rec.weight || '';
    document.getElementById('du-waist').value = rec.waist || '';
    window._duEditDate = date;
    window.scrollTo(0, 0);
    alert('正在编辑 ' + date + ' 的记录，保存后将覆盖该天数据');
  }
  function delBody(date) {
    if (!confirm('删除 ' + date + ' 的身体数据？')) return;
    write(KEY.weight, weightRecords().filter(function (x) { return x.date !== date; }));
    renderBody();
  }

  // ---------- 训练页 ----------
  var STRENGTH_CATS = ['胸', '背', '肩', '腿', '核心', '综合'];
  var CARDIO_CATS = ['跑步', '游泳', '羽毛球', '骑行', '其他'];
  var workoutKind = 'strength';

  function renderWorkout() {
    var logs = workoutLogs();
    var wstats = weekWorkoutStats();
    var cardioSummary = Object.keys(wstats.cardio).map(function (k) { return k + ' ' + wstats.cardio[k] + '次'; }).join(' · ') || '0次';

    var strengthForm =
      '<div class="du-row"><select id="du-wcat" class="du-input">' +
        STRENGTH_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div>' +
      '<div class="du-row"><input id="du-wex" type="text" placeholder="动作（如：卧推，可留空）"></div>' +
      '<div class="du-row"><input id="du-wkg" type="number" step="0.5" inputmode="decimal" placeholder="重量 kg">' +
      '<input id="du-wreps" type="number" placeholder="次数">' +
      '<input id="du-wsets" type="number" placeholder="组数"></div>' +
      '<div class="du-row"><input id="du-wrpe" type="number" step="0.5" min="1" max="10" placeholder="RPE (1-10)">' +
      '<input id="du-wdur" type="number" placeholder="时长 分钟"></div>' +
      '<div class="du-row"><input id="du-wnote" type="text" placeholder="备注（可留空）"></div>';

    var cardioForm =
      '<div class="du-row"><select id="du-wcat" class="du-input">' +
        CARDIO_CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('') + '</select></div>' +
      '<div class="du-row"><input id="du-wdur" type="number" placeholder="时长 分钟">' +
      '<input id="du-wdist" type="number" step="0.1" inputmode="decimal" placeholder="距离 km（可选）"></div>' +
      '<div class="du-row"><input id="du-whr" type="number" placeholder="平均心率（可选）">' +
      '<input id="du-wnote" type="text" placeholder="备注（可留空）"></div>';

    document.getElementById('du-workout-content').innerHTML =
      '<h2 style="margin-bottom:4px">训练</h2>' +
      '<div class="du-card"><b>本周</b>' +
        '<p style="margin-top:6px">力量 <b>' + wstats.strength + '</b> 次 · 有氧 ' + esc(cardioSummary) + '</p>' +
        '<p class="du-muted">共 ' + logs.length + ' 次训练记录</p>' +
      '</div>' +

      '<div class="du-card"><b>添加训练</b>' +
        '<div class="du-pills">' +
          '<div class="du-pill' + (workoutKind === 'strength' ? ' active' : '') + '" onclick="window.DietUpgrade.setWorkoutKind(\'strength\')">力量训练</div>' +
          '<div class="du-pill' + (workoutKind === 'cardio' ? ' active' : '') + '" onclick="window.DietUpgrade.setWorkoutKind(\'cardio\')">有氧</div>' +
        '</div>' +
        (workoutKind === 'strength' ? strengthForm : cardioForm) +
        '<button class="du-btn" onclick="window.DietUpgrade.addWorkout()">保存训练</button>' +
        '<p class="du-muted" style="margin-top:6px">除了类型，其他字段都可以留空。最简单的记录如「胸，60分钟」也可以。</p>' +
      '</div>' +

      '<div class="du-card"><b>训练历史</b><ul class="du-list">' +
        (logs.slice(-30).reverse().map(function (x) {
          var realIdx = logs.indexOf(x);
          var desc = x.kind === 'cardio'
            ? [x.duration ? x.duration + ' min' : '', x.distance ? x.distance + ' km' : '', x.heartRate ? '心率 ' + x.heartRate : '', x.note].filter(Boolean).join(' · ')
            : [x.exercise, x.weight ? x.weight + 'kg' : '', x.reps ? x.reps + '次' : '', x.sets ? x.sets + '组' : '', x.rpe ? 'RPE ' + x.rpe : '', x.duration ? x.duration + ' min' : '', x.note].filter(Boolean).join(' · ');
          return '<li style="display:flex;justify-content:space-between;align-items:center">' +
            '<span><b>' + esc(x.date) + '</b> · ' + esc(x.category || x.type || '') +
            (desc ? '<br><span class="du-muted">' + esc(desc) + '</span>' : '') + '</span>' +
            '<button class="du-del" onclick="window.DietUpgrade.delWorkout(' + realIdx + ')">删除</button></li>';
        }).join('') || '<li class="du-muted">还没有训练记录</li>') +
      '</ul></div>';
  }

  function setWorkoutKind(k) { workoutKind = k; renderWorkout(); }

  function addWorkout() {
    var logs = workoutLogs();
    var rec = {
      date: today(),
      kind: workoutKind,
      category: document.getElementById('du-wcat').value
    };
    if (workoutKind === 'strength') {
      rec.exercise = document.getElementById('du-wex').value.trim();
      rec.weight = num(document.getElementById('du-wkg').value) || null;
      rec.reps = num(document.getElementById('du-wreps').value) || null;
      rec.sets = num(document.getElementById('du-wsets').value) || null;
      rec.rpe = num(document.getElementById('du-wrpe').value) || null;
      rec.duration = num(document.getElementById('du-wdur').value) || null;
      rec.note = document.getElementById('du-wnote').value.trim();
    } else {
      rec.duration = num(document.getElementById('du-wdur').value) || null;
      rec.distance = num(document.getElementById('du-wdist').value) || null;
      rec.heartRate = num(document.getElementById('du-whr').value) || null;
      rec.note = document.getElementById('du-wnote').value.trim();
    }
    logs.push(rec);
    write(KEY.workouts, logs);
    renderWorkout();
  }
  function delWorkout(idx) {
    if (!confirm('删除这条训练记录？')) return;
    var logs = workoutLogs();
    logs.splice(idx, 1);
    write(KEY.workouts, logs);
    renderWorkout();
  }

  // ---------- 更多页 ----------
  function renderMore() {
    var p = profile();
    var cre = creatineData()[today()];
    document.getElementById('du-more-content').innerHTML =
      '<h2 style="margin-bottom:4px">更多</h2>' +
      '<div class="du-card">' +
        '<div class="du-link-item" onclick="window.DietUpgrade.go(\'foods\')"><span>🍎 我的食物库</span><span class="du-muted">›</span></div>' +
        '<div class="du-link-item" onclick="window.DietUpgrade.go(\'stats\')"><span>📊 饮食数据统计</span><span class="du-muted">›</span></div>' +
        '<div class="du-link-item" onclick="window.DietUpgrade.go(\'settings\')"><span>🎯 每日营养目标（旧版）</span><span class="du-muted">›</span></div>' +
      '</div>' +

      '<div class="du-card"><b>我的目标</b>' +
        '<div class="du-row"><span class="du-muted" style="width:90px">训练日</span><input id="du-cal" type="number" value="' + p.trainingCal + '" placeholder="kcal"></div>' +
        '<div class="du-row"><span class="du-muted" style="width:90px">休息日</span><input id="du-restcal" type="number" value="' + p.restCal + '" placeholder="kcal"></div>' +
        '<div class="du-row"><span class="du-muted" style="width:90px">蛋白质</span><input id="du-protein" type="number" value="' + p.protein + '" placeholder="g"></div>' +
        '<div class="du-row"><span class="du-muted" style="width:90px">脂肪</span><input id="du-fat" type="number" value="' + p.fat + '" placeholder="g"></div>' +
        '<button class="du-btn" onclick="window.DietUpgrade.saveProfile()">保存目标</button>' +
        '<p class="du-muted" style="margin-top:6px">碳水会按「热量 − 蛋白质 − 脂肪」自动计算。切换训练日/休息日后，首页目标随之变化。</p>' +
      '</div>' +

      '<div class="du-card"><b>肌酸</b>' +
        '<div class="du-row"><span>今日（建议 3–5g/天）</span>' +
        '<button class="du-btn secondary half" onclick="window.DietUpgrade.toggleCreatine()">' + (cre ? '✓ 已记录 ' + (cre.dose || 5) + 'g' : '＋ 打卡 5g') + '</button></div>' +
        '<p class="du-muted">连续使用 ' + creatineStreak() + ' 天 · 本周完成 ' + creatineWeek() + ' / 7</p>' +
        '<p class="du-muted">仅作记录工具，不构成医疗建议。每天持续摄入比纠结具体时间更重要。</p>' +
      '</div>' +

      '<div class="du-card"><b>导出分析数据（给 AI 分析）</b>' +
        '<div class="du-pills">' +
          '<div class="du-pill' + (exportRange === 7 ? ' active' : '') + '" onclick="window.DietUpgrade.setExportRange(7, this)">最近7天</div>' +
          '<div class="du-pill' + (exportRange === 30 ? ' active' : '') + '" onclick="window.DietUpgrade.setExportRange(30, this)">最近30天</div>' +
          '<div class="du-pill' + (exportRange === 0 ? ' active' : '') + '" onclick="window.DietUpgrade.setExportRange(0, this)">全部</div>' +
        '</div>' +
        '<div class="du-row">' +
          '<button class="du-btn half" onclick="window.DietUpgrade.exportAnalysisMD()">导出 Markdown 报告</button>' +
          '<button class="du-btn secondary half" onclick="window.DietUpgrade.exportAnalysisJSON()">导出 JSON</button>' +
        '</div>' +
        '<p class="du-muted">Markdown 报告包含每日饮食/体重/训练/肌酸汇总，可直接粘贴给 AI 做周度或月度分析。</p>' +
      '</div>' +

      '<div class="du-card"><b>数据备份</b>' +
        '<div class="du-row">' +
          '<button class="du-btn secondary half" onclick="window.DietUpgrade.exportData()">导出数据 (JSON)</button>' +
          '<button class="du-btn secondary half" onclick="window.DietUpgrade.exportCSV()">导出饮食 CSV</button>' +
        '</div>' +
        '<label class="du-muted" for="du-import">导入数据（选择之前导出的 JSON 备份文件）：</label>' +
        '<input id="du-import" type="file" accept=".json" class="du-input" onchange="window.DietUpgrade.importData(event)">' +
      '</div>' +

      '<div class="du-tip">本工具只做记录与统计：热量缺口用于减脂，蛋白质 + 力量训练 + 恢复用于保肌。智能分析在下一阶段加入。</div>';
  }

  function saveProfile() {
    var p = profile();
    p.trainingCal = num(document.getElementById('du-cal').value, p.trainingCal);
    p.restCal = num(document.getElementById('du-restcal').value, p.restCal);
    p.protein = num(document.getElementById('du-protein').value, p.protein);
    p.fat = num(document.getElementById('du-fat').value, p.fat);
    p.carbsTraining = Math.max(0, Math.round((p.trainingCal - p.protein * 4 - p.fat * 9) / 4));
    p.carbsRest = Math.max(0, Math.round((p.restCal - p.protein * 4 - p.fat * 9) / 4));
    write(KEY.profile, p);
    syncGoals();
    if (typeof renderHome === 'function') renderHome();
    alert('目标已保存');
    renderMore();
  }

  function setDayType(v) {
    localStorage.setItem(KEY.dayType, v);
    syncGoals();
    if (typeof renderHome === 'function') renderHome();
  }

  function toggleCreatine() {
    var s = creatineData();
    if (s[today()]) delete s[today()];
    else s[today()] = { dose: 5, time: new Date().toTimeString().slice(0, 5) };
    write(KEY.supplements, s);
    // 根据当前所在页面刷新
    if (document.getElementById('page-more').classList.contains('active')) renderMore();
    else renderHome();
  }

  // ---------- 分析数据导出（供 AI 做周/月分析） ----------
  var exportRange = 7; // 7 | 30 | 0(全部)

  function collectAnalysisData(days) {
    var start = null;
    if (days) {
      var d = new Date(); d.setDate(d.getDate() - (days - 1));
      start = fmtDate(d);
    }
    var inRange = function (date) { return !start || date >= start; };

    var dates = (typeof getAllLogDates === 'function' ? getAllLogDates() : []).filter(inRange).sort();
    var diet = dates.map(function (d) {
      var logs = getLogs(d) || [];
      var totals = logs.reduce(function (a, x) {
        a.calories += num(x.calories); a.protein += num(x.protein);
        a.carbs += num(x.carbs); a.fat += num(x.fat);
        return a;
      }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
      return { date: d, totals: totals, meals: logs };
    });

    var supp = creatineData();
    return {
      range: { start: start || '(最早记录)', end: today(), days: days || 'all' },
      goals: { training: goalsFor('training'), rest: goalsFor('rest') },
      profile: profile(),
      diet: diet,
      bodyData: weightRecords().filter(function (x) { return inRange(x.date); }),
      workouts: workoutLogs().filter(function (x) { return inRange(x.date); }),
      creatine: Object.keys(supp).filter(inRange).sort().map(function (k) {
        return { date: k, dose: (supp[k] && supp[k].dose) || 5 };
      })
    };
  }

  var MEAL_NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐', other: '其他' };

  function buildAnalysisMarkdown(data) {
    var L = [];
    var g = data.goals;
    L.push('# 饮食与训练数据报告');
    L.push('');
    L.push('区间：' + data.range.start + ' ~ ' + data.range.end + ' · 导出于 ' + today());
    L.push('');
    L.push('## 当前目标');
    L.push('- 训练日：' + g.training.calories + ' kcal（蛋白质 ' + g.training.protein + 'g / 碳水 ' + g.training.carbs + 'g / 脂肪 ' + g.training.fat + 'g）');
    L.push('- 休息日：' + g.rest.calories + ' kcal（蛋白质 ' + g.rest.protein + 'g / 碳水 ' + g.rest.carbs + 'g / 脂肪 ' + g.rest.fat + 'g）');
    L.push('');
    L.push('## 每日饮食汇总');
    if (data.diet.length) {
      L.push('| 日期 | 热量 kcal | 蛋白质 g | 碳水 g | 脂肪 g |');
      L.push('|---|---|---|---|---|');
      data.diet.forEach(function (d) {
        L.push('| ' + d.date + ' | ' + Math.round(d.totals.calories) + ' | ' + d.totals.protein.toFixed(1) + ' | ' + d.totals.carbs.toFixed(1) + ' | ' + d.totals.fat.toFixed(1) + ' |');
      });
    } else L.push('（本区间无饮食记录）');
    L.push('');
    L.push('## 每日饮食明细');
    if (data.diet.length) {
      data.diet.forEach(function (d) {
        L.push('### ' + d.date + '（' + Math.round(d.totals.calories) + ' kcal）');
        d.meals.forEach(function (m) {
          L.push('- ' + (MEAL_NAMES[m.mealType] || '其他') + (m.mealTime ? ' ' + m.mealTime : '') + '｜' + (m.name || '') + ' ' + (m.weight || 0) + 'g · ' + Math.round(num(m.calories)) + ' kcal（蛋 ' + num(m.protein).toFixed(1) + ' / 碳 ' + num(m.carbs).toFixed(1) + ' / 脂 ' + num(m.fat).toFixed(1) + '）');
        });
        L.push('');
      });
    } else { L.push('（无）'); L.push(''); }
    L.push('## 体重与腰围');
    if (data.bodyData.length) {
      L.push('| 日期 | 体重 kg | 腰围 cm |');
      L.push('|---|---|---|');
      data.bodyData.forEach(function (x) {
        L.push('| ' + x.date + ' | ' + (num(x.weight) || '—') + ' | ' + (num(x.waist) || '—') + ' |');
      });
    } else L.push('（本区间无身体数据）');
    L.push('');
    L.push('## 训练记录');
    if (data.workouts.length) {
      L.push('| 日期 | 类型 | 内容 |');
      L.push('|---|---|---|');
      data.workouts.forEach(function (w) {
        var desc = w.kind === 'cardio'
          ? [w.duration ? w.duration + 'min' : '', w.distance ? w.distance + 'km' : '', w.heartRate ? '心率' + w.heartRate : '', w.note].filter(Boolean).join(' ')
          : [w.exercise, w.weight ? w.weight + 'kg' : '', w.reps ? w.reps + '次' : '', w.sets ? w.sets + '组' : '', w.rpe ? 'RPE' + w.rpe : '', w.duration ? w.duration + 'min' : '', w.note].filter(Boolean).join(' ');
        L.push('| ' + w.date + ' | ' + (w.kind === 'cardio' ? '有氧·' : '力量·') + (w.category || w.type || '') + ' | ' + (desc || '—') + ' |');
      });
    } else L.push('（本区间无训练记录）');
    L.push('');
    L.push('## 肌酸打卡');
    L.push(data.creatine.length
      ? data.creatine.map(function (c) { return c.date + '（' + c.dose + 'g）'; }).join('、') + ' · 共 ' + data.creatine.length + ' 天'
      : '（本区间无打卡）');
    L.push('');
    L.push('---');
    L.push('请基于以上数据分析：1) 每日热量与蛋白质达标情况；2) 体重/腰围趋势与热量摄入的关系；3) 训练频率与训练表现变化；4) 肌酸执行率；5) 下一阶段（下周/下月）的具体改进建议。');
    return L.join('\n');
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function rangeSuffix() { return exportRange ? exportRange + 'd' : 'all'; }

  function exportAnalysisMD() {
    var data = collectAnalysisData(exportRange);
    downloadFile('diet-analysis-' + rangeSuffix() + '-' + today() + '.md', '﻿' + buildAnalysisMarkdown(data), 'text/markdown;charset=utf-8');
  }
  function exportAnalysisJSON() {
    var data = collectAnalysisData(exportRange);
    var out = Object.assign({ app: 'diet-app', type: 'analysis', version: 2, exportedAt: new Date().toISOString() }, data);
    downloadFile('diet-analysis-' + rangeSuffix() + '-' + today() + '.json', JSON.stringify(out, null, 2), 'application/json');
  }
  function setExportRange(r, el) {
    exportRange = r;
    var pills = el.parentNode.querySelectorAll('.du-pill');
    for (var i = 0; i < pills.length; i++) pills[i].classList.remove('active');
    el.classList.add('active');
  }

  // ---------- 备份 / 恢复 ----------
  function exportData() {
    var data = { app: 'diet-app', version: 2, exportedAt: new Date().toISOString(), localStorage: {} };
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      data.localStorage[k] = localStorage.getItem(k);
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'diet-app-backup-' + today() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function exportCSV() {
    var rows = [['日期', '餐次', '食物', '重量', '热量', '蛋白质', '碳水', '脂肪']];
    var dates = typeof getAllLogDates === 'function' ? getAllLogDates() : [];
    dates.forEach(function (d) {
      (getLogs(d) || []).forEach(function (x) {
        rows.push([d, x.mealType || '', x.name || '', x.weight || '', x.calories || 0, x.protein || 0, x.carbs || 0, x.fat || 0]);
      });
    });
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'diet-history-' + today() + '.csv';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function importData(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data.localStorage) throw new Error('文件格式不正确（缺少 localStorage 字段）');
        if (!confirm('导入数据会覆盖当前浏览器中的全部数据，是否继续？')) return;
        if (confirm('建议先备份当前数据。点击「确定」先下载一份当前备份，再执行导入；点击「取消」直接导入。')) {
          exportData();
        }
        Object.keys(data.localStorage).forEach(function (k) {
          localStorage.setItem(k, data.localStorage[k]);
        });
        alert('导入完成，页面即将刷新');
        location.reload();
      } catch (err) {
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ---------- 对外接口 ----------
  window.DietUpgrade = {
    go: duSwitch,
    setDayType: setDayType,
    addBody: addBody, editBody: editBody, delBody: delBody,
    setWorkoutKind: setWorkoutKind, addWorkout: addWorkout, delWorkout: delWorkout,
    saveProfile: saveProfile,
    toggleCreatine: toggleCreatine,
    exportData: exportData, exportCSV: exportCSV, importData: importData,
    exportAnalysisMD: exportAnalysisMD, exportAnalysisJSON: exportAnalysisJSON, setExportRange: setExportRange
  };

  // ---------- 启动 ----------
  function init() {
    injectCSS();
    addPages();
    syncGoals(); // 让首页原有卡片显示当前日类型的目标
    // 包装原 renderHome：每次首页重绘后刷新增强面板
    if (typeof window.renderHome === 'function' && !window.renderHome._duWrapped) {
      var oldRenderHome = window.renderHome;
      var wrapped = function () { oldRenderHome(); renderHomeUpgrade(); };
      wrapped._duWrapped = true;
      window.renderHome = wrapped;
    }
    renderHomeUpgrade();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
