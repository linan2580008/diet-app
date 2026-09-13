
/* Diet App Personal Upgrade v1
   纯前端增强层：不改动原有数据结构，兼容 GitHub Pages + localStorage。
   在 index.html 的 </body> 前加入：
   <script src="upgrade.js"></script>
*/
(function () {
  'use strict';

  const KEY = {
    profile: 'diet-profile-v2',
    weight: 'diet-weight-v1',
    body: 'diet-body-v1',
    workouts: 'diet-workouts-v1',
    supplements: 'diet-supplements-v1',
    mealType: 'diet-day-type-v1'
  };

  const defaultProfile = {
    height: 177, weight: 69, waist: 86, neck: 36,
    bmr: 1690, tdee: 2600,
    trainingCal: 2250, restCal: 2100,
    protein: 130, fat: 62, carbsTraining: 270, carbsRest: 235
  };

  const read = (k, fallback) => {
    try { const x = localStorage.getItem(k); return x ? JSON.parse(x) : fallback; }
    catch (_) { return fallback; }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const today = () => new Date().toISOString().slice(0,10);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
  const n = (x, d=0) => Number.isFinite(Number(x)) ? Number(x) : d;

  function profile() {
    return Object.assign({}, defaultProfile, read(KEY.profile, {}));
  }

  function dayType() {
    return localStorage.getItem(KEY.mealType) || 'training';
  }

  function goalsFor(type = dayType()) {
    const p = profile();
    if (type === 'rest') return {
      calories: p.restCal, protein: p.protein, fat: p.fat, carbs: p.carbsRest
    };
    if (type === 'long') return {
      calories: p.trainingCal + 250, protein: p.protein, fat: p.fat, carbs: p.carbsTraining + 60
    };
    return {
      calories: p.trainingCal, protein: p.protein, fat: p.fat, carbs: p.carbsTraining
    };
  }

  function getTotals(date=today()) {
    const logs = typeof getLogs === 'function' ? getLogs(date) : [];
    return logs.reduce((a, x) => {
      a.calories += n(x.calories); a.protein += n(x.protein);
      a.carbs += n(x.carbs); a.fat += n(x.fat);
      return a;
    }, {calories:0, protein:0, carbs:0, fat:0});
  }

  function bodyFat(p=profile()) {
    // US Navy-style circumference estimate; waist/neck in cm, height in cm.
    // This is an estimate, not a medical measurement.
    if (!p.height || !p.waist || !p.neck) return null;
    const h = p.height / 2.54, w = p.waist / 2.54, c = p.neck / 2.54;
    const bf = 86.010 * Math.log10(w-c) - 70.041 * Math.log10(h) + 36.76;
    return Math.max(3, Math.min(45, bf));
  }

  function injectCSS() {
    const css = `
      .du-card{background:#fff;border-radius:14px;padding:14px;margin:10px 0;box-shadow:0 1px 5px rgba(0,0,0,.05)}
      .du-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
      .du-metric{background:#f7f8fa;border-radius:12px;padding:12px}
      .du-metric b{display:block;font-size:21px;color:#222}
      .du-muted{color:#8a8a8a;font-size:12px}
      .du-btn{border:0;border-radius:10px;padding:11px 14px;background:#4CAF50;color:#fff;font-size:14px;font-weight:600}
      .du-btn.secondary{background:#f0f0f0;color:#555}
      .du-btn.danger{background:#fff0f0;color:#c62828}
      .du-row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:8px 0}
      .du-row input,.du-row select,.du-input{width:100%;padding:10px;border:1.5px solid #e5e5e5;border-radius:9px;font-size:16px;background:#fff}
      .du-row .du-half{width:50%}
      .du-progress{height:7px;background:#e8e8e8;border-radius:99px;overflow:hidden;margin-top:7px}
      .du-progress i{display:block;height:100%;background:#4CAF50;border-radius:99px}
      .du-tag{display:inline-block;padding:4px 8px;border-radius:999px;background:#eaf7ec;color:#2e7d32;font-size:12px;margin:2px}
      .du-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;min-width:0}
      .du-nav-item span:first-child{font-size:21px}.du-nav-item span:last-child{font-size:11px;color:#999}
      .du-nav-item.active span:last-child{color:#4CAF50;font-weight:600}
      .du-list{margin:0;padding:0;list-style:none}.du-list li{padding:10px 0;border-bottom:1px solid #f0f0f0}
      .du-list li:last-child{border-bottom:0}
      .du-tip{background:#f0f7ff;border-left:3px solid #42A5F5;border-radius:8px;padding:10px 12px;font-size:13px;margin:10px 0}
      @media(max-width:360px){.du-grid{grid-template-columns:1fr}}
    `;
    const style = document.createElement('style'); style.textContent = css;
    document.head.appendChild(style);
  }

  function addPages() {
    const pages = document.querySelector('.pages');
    const nav = document.querySelector('.nav-bar');
    if (!pages || !nav || document.getElementById('page-body')) return;

    pages.insertAdjacentHTML('beforeend', `
      <div class="page" id="page-body">
        <h2>身体数据</h2>
        <div id="du-body-content"></div>
      </div>
      <div class="page" id="page-workout">
        <h2>训练</h2>
        <div id="du-workout-content"></div>
      </div>
      <div class="page" id="page-more">
        <h2>更多</h2>
        <div id="du-more-content"></div>
      </div>
    `);

    // 保留原来的6项导航，但把“设置”替换为“更多”，并在末尾加入身体/训练。
    const old = Array.from(nav.querySelectorAll('.nav-item'));
    if (old.length >= 6) {
      old[5].innerHTML = '<span class="nav-icon">⚙️</span><span class="nav-label">更多</span>';
      old[5].onclick = () => duSwitch('more', '更多');
    }
    const make = (icon,label,page) => {
      const el = document.createElement('div');
      el.className='du-nav-item';
      el.innerHTML=`<span>${icon}</span><span>${label}</span>`;
      el.onclick=()=>duSwitch(page,label);
      nav.insertBefore(el, nav.firstChild);
      return el;
    };
    make('⚖️','身体','body');
    make('🏋️','训练','workout');
  }

  function duSwitch(page,title) {
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    const target=document.getElementById('page-'+page);
    if(target) target.classList.add('active');
    const titleEl=document.getElementById('page-title');
    if(titleEl) titleEl.textContent=title;
    document.querySelectorAll('.nav-item,.du-nav-item').forEach(x=>x.classList.remove('active'));
    const active=Array.from(document.querySelectorAll('.nav-item,.du-nav-item')).find(x =>
      x.textContent.includes(title)
    );
    if(active) active.classList.add('active');
    if(page==='body') renderBody();
    if(page==='workout') renderWorkout();
    if(page==='more') renderMore();
  }

  function renderHomeUpgrade() {
    const p=profile(), g=goalsFor(), t=getTotals();
    const header=document.querySelector('.calorie-card');
    if(!header) return;

    let box=document.getElementById('du-home-panel');
    if(!box){
      box=document.createElement('div'); box.id='du-home-panel'; box.className='du-card';
      header.parentNode.insertBefore(box, header.nextSibling);
    }
    const bf=bodyFat(p);
    const remain=Math.max(0,g.calories-t.calories);
    const proteinRemain=Math.max(0,g.protein-t.protein);
    box.innerHTML=`
      <div class="du-row">
        <b>今日模式</b>
        <select id="du-daytype" class="du-input" style="width:145px" onchange="window.DietUpgrade.setDayType(this.value)">
          <option value="training" ${dayType()==='training'?'selected':''}>力量/普通训练</option>
          <option value="rest" ${dayType()==='rest'?'selected':''}>休息日</option>
          <option value="long" ${dayType()==='long'?'selected':''}>长距离运动</option>
        </select>
      </div>
      <div class="du-grid">
        <div class="du-metric"><span class="du-muted">今日还可吃</span><b>${Math.round(remain)} kcal</b></div>
        <div class="du-metric"><span class="du-muted">还差蛋白质</span><b>${Math.round(proteinRemain)} g</b></div>
      </div>
      <div class="du-tip">${proteinRemain>20
        ? `建议优先补约 ${Math.round(proteinRemain)}g 蛋白质，选择低脂高蛋白食物。`
        : '蛋白质完成得不错，接下来按饥饿感和训练情况安排剩余碳水。'}</div>
      <div class="du-muted">当前估算体脂 ${bf ? bf.toFixed(1)+'%' : '—'} · 今日目标 ${g.calories} kcal / 蛋白质 ${g.protein}g</div>
    `;
  }

  function renderBody() {
    const p=profile(), weights=read(KEY.weight,[]);
    const latest=weights.length?weights[weights.length-1]:null;
    const bf=bodyFat(p);
    const avg7=weights.slice(-7).reduce((s,x)=>s+n(x.weight),0)/(Math.min(7,weights.length)||1);
    document.getElementById('du-body-content').innerHTML=`
      <div class="du-card">
        <div class="du-grid">
          <div class="du-metric"><span class="du-muted">身高</span><b>${p.height} cm</b></div>
          <div class="du-metric"><span class="du-muted">当前体重</span><b>${latest?latest.weight:p.weight} kg</b></div>
          <div class="du-metric"><span class="du-muted">腰围</span><b>${p.waist} cm</b></div>
          <div class="du-metric"><span class="du-muted">估算体脂</span><b>${bf?bf.toFixed(1)+'%':'—'}</b></div>
        </div>
      </div>
      <div class="du-card">
        <b>记录今天</b>
        <div class="du-row"><input id="du-weight" type="number" step="0.1" placeholder="体重 kg"><input id="du-waist" type="number" step="0.1" placeholder="腰围 cm"></div>
        <button class="du-btn" onclick="window.DietUpgrade.addBody()">保存身体数据</button>
      </div>
      <div class="du-card">
        <b>体重趋势</b>
        <p class="du-muted">7日平均：${weights.length?avg7.toFixed(1)+' kg':'暂无数据'}</p>
        <ul class="du-list">${weights.slice(-14).reverse().map(x=>`<li>${esc(x.date)}　<b>${x.weight} kg</b>${x.waist?`　腰 ${x.waist} cm`:''}</li>`).join('')||'<li class="du-muted">还没有记录</li>'}</ul>
      </div>
      <div class="du-tip">体脂率只是围度估算值。真正判断减脂进度时，优先看 7 日平均体重 + 腰围 + 训练表现。</div>
    `;
  }

  function renderWorkout() {
    const logs=read(KEY.workouts,[]);
    document.getElementById('du-workout-content').innerHTML=`
      <div class="du-card">
        <b>添加训练</b>
        <div class="du-row"><select id="du-wtype" class="du-input"><option>胸+三头+核心</option><option>背+二头</option><option>肩+核心</option><option>下肢</option><option>全身</option><option>跑步</option><option>游泳</option><option>羽毛球</option><option>骑行</option></select></div>
        <div class="du-row"><input id="du-wdetail" type="text" placeholder="例如：卧推 50kg×8×3，RPE 8"></div>
        <div class="du-row"><input id="du-duration" type="number" placeholder="时长（分钟）"><input id="du-rpe" type="number" step="0.5" min="1" max="10" placeholder="RPE"></div>
        <button class="du-btn" onclick="window.DietUpgrade.addWorkout()">保存训练</button>
      </div>
      <div class="du-card"><b>最近训练</b><ul class="du-list">${
        logs.slice(-20).reverse().map(x=>`<li><b>${esc(x.date)}</b> · ${esc(x.type)}<br><span class="du-muted">${esc(x.detail||'')} ${x.duration?`· ${x.duration} min`:''}${x.rpe?` · RPE ${x.rpe}`:''}</span></li>`).join('')||'<li class="du-muted">还没有训练记录</li>'
      }</ul></div>
      <div class="du-tip">本周手腕不舒服时，不要测试大重量。恢复后从平时约 60–70% 的训练量重新加载，再逐步回到正常训练。</div>
    `;
  }

  function renderMore() {
    const p=profile(), g=goalsFor();
    document.getElementById('du-more-content').innerHTML=`
      <div class="du-card">
        <b>我的目标</b>
        <div class="du-row"><input id="du-cal" type="number" value="${p.trainingCal}" placeholder="训练日 kcal"></div>
        <div class="du-row"><input id="du-restcal" type="number" value="${p.restCal}" placeholder="休息日 kcal"></div>
        <div class="du-row"><input id="du-protein" type="number" value="${p.protein}" placeholder="蛋白质 g"></div>
        <div class="du-row"><input id="du-fat" type="number" value="${p.fat}" placeholder="脂肪 g"></div>
        <button class="du-btn" onclick="window.DietUpgrade.saveProfile()">保存目标</button>
      </div>
      <div class="du-card">
        <b>补剂</b>
        <div class="du-row"><span>肌酸 3–5g/天</span><button class="du-btn secondary" onclick="window.DietUpgrade.toggleCreatine()">今日 ${read(KEY.supplements,{})[today()]?'✓ 已记录':'＋ 打卡'}</button></div>
        <p class="du-muted">肌酸无需严格卡训练后时间；每天持续摄入更重要。蛋白粉按全天蛋白质缺口使用。</p>
      </div>
      <div class="du-card">
        <b>数据备份</b>
        <div class="du-row"><button class="du-btn secondary" onclick="window.DietUpgrade.exportData()">导出 JSON</button><button class="du-btn secondary" onclick="window.DietUpgrade.exportCSV()">导出饮食 CSV</button></div>
        <input id="du-import" type="file" accept=".json" class="du-input" onchange="window.DietUpgrade.importData(event)">
      </div>
      <div class="du-card">
        <b>本项目逻辑</b>
        <p class="du-muted">热量缺口用于减脂；蛋白质+力量训练+恢复用于保肌/增肌。快慢碳不做绝对分类，训练前后根据消化和运动需求灵活安排。</p>
      </div>
    `;
  }

  function addBody(){
    const w=n(document.getElementById('du-weight').value), waist=n(document.getElementById('du-waist').value);
    if(!w) return alert('请先输入体重');
    const arr=read(KEY.weight,[]).filter(x=>x.date!==today());
    arr.push({date:today(),weight:w,waist:waist||null});
    arr.sort((a,b)=>a.date.localeCompare(b.date));
    write(KEY.weight,arr);
    if(waist){const p=profile();p.weight=w;p.waist=waist;write(KEY.profile,p);}
    renderBody();
  }

  function addWorkout(){
    const logs=read(KEY.workouts,[]);
    logs.push({
      date:today(),
      type:document.getElementById('du-wtype').value,
      detail:document.getElementById('du-wdetail').value,
      duration:n(document.getElementById('du-duration').value),
      rpe:n(document.getElementById('du-rpe').value)
    });
    write(KEY.workouts,logs); renderWorkout();
  }

  function saveProfile(){
    const p=profile();
    p.trainingCal=n(document.getElementById('du-cal').value,p.trainingCal);
    p.restCal=n(document.getElementById('du-restcal').value,p.restCal);
    p.protein=n(document.getElementById('du-protein').value,p.protein);
    p.fat=n(document.getElementById('du-fat').value,p.fat);
    p.carbsTraining=Math.max(0,Math.round((p.trainingCal-p.protein*4-p.fat*9)/4));
    p.carbsRest=Math.max(0,Math.round((p.restCal-p.protein*4-p.fat*9)/4));
    write(KEY.profile,p);
    // 同步旧版目标，保证首页原有组件继续工作
    if(typeof saveGoals==='function') saveGoals(goalsFor());
    if(typeof renderHome==='function') renderHome();
    alert('目标已保存');
  }

  function setDayType(v){
    localStorage.setItem(KEY.mealType,v);
    const g=goalsFor(v);
    if(typeof saveGoals==='function') saveGoals(g);
    if(typeof renderHome==='function') renderHome();
  }

  function toggleCreatine(){
    const s=read(KEY.supplements,{});
    if(s[today()]) delete s[today()]; else s[today()]={dose:5,time:new Date().toTimeString().slice(0,5)};
    write(KEY.supplements,s); renderMore();
  }

  function exportData(){
    const data={version:2,exportedAt:new Date().toISOString(),localStorage:{}};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);data.localStorage[k]=localStorage.getItem(k);}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='diet-app-backup-'+today()+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function exportCSV(){
    const rows=[['日期','餐次','食物','重量','热量','蛋白质','碳水','脂肪']];
    const dates=typeof getAllLogDates==='function'?getAllLogDates():[];
    dates.forEach(d=>(getLogs(d)||[]).forEach(x=>rows.push([d,x.meal||'',x.name||'',x.weight||'',x.calories||0,x.protein||0,x.carbs||0,x.fat||0])));
    const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='diet-history.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function importData(e){
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        if(!data.localStorage) throw new Error('格式不正确');
        if(!confirm('导入会覆盖当前浏览器中的本地数据，确定继续吗？')) return;
        Object.entries(data.localStorage).forEach(([k,v])=>localStorage.setItem(k,v));
        location.reload();
      }catch(err){alert('导入失败：'+err.message);}
    };
    reader.readAsText(file);
  }

  window.DietUpgrade={setDayType,addBody,addWorkout,saveProfile,toggleCreatine,exportData,exportCSV,importData};

  function init(){
    injectCSS(); addPages();
    renderHomeUpgrade();
    const oldRenderHome=window.renderHome;
    if(typeof oldRenderHome==='function'){
      window.renderHome=function(){oldRenderHome();renderHomeUpgrade();};
    }
    const observer=new MutationObserver(()=>renderHomeUpgrade());
    const home=document.getElementById('page-home');
    if(home) observer.observe(home,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
