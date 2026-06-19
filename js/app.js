// Design Ref: §9, §10 Implementation Guide — 기존 inline <script>을 모듈로 이전, 데이터 접근부를 js/api.js로 교체 (module-3, module-4)
import { getSites, createSite, updateSite, deleteSite as apiDeleteSite, isLoggedIn, getCurrentUser } from './api.js';
import { handleUnauthorized } from './auth.js';

const MANUAL_ORDER_KEY='lsd_manual_order';
const STAGES=['발굴','접촉','제안','협상','입찰진행','계약완료','실패'];
const STAGE_COLORS={'발굴':'#B4B2A9','접촉':'#85B7EB','제안':'#FAC775','협상':'#ED93B1','입찰진행':'#7C5CBF','계약완료':'#97C459','실패':'#F09595'};
const STAGE_CLASS={'발굴':'s-prospect','접촉':'s-contact','제안':'s-proposal','협상':'s-negotiation','입찰진행':'s-bid','계약완료':'s-won','실패':'s-lost'};
const PROC_TYPE_COLOR={'미팅':'#185FA5','전화':'#1D9E75','이메일':'#5F5E5A','제안서':'#BA7517','견적':'#BA7517','데모':'#D4537E','계약':'#3B6D11','방문':'#533FB7','기타':'#888780'};

let sites=[];
let filteredSites=[];
let currentSiteId=null;
let editCustomerName=null;
let editProcId=null;
let currentTab='basic';
let formVisible=true;
let currentStage='발굴';

const demoFiles=['제안서_최종.pdf','견적서.xlsx','계약서_초안.docx','기술문서.pdf','미팅록.docx'];

function fmt(n){if(!n)return '0';if(n>=10000)return (n/10000).toFixed(1)+'억';return n.toLocaleString()+'만';}
function esc(str){const d=document.createElement('div');d.textContent=str??'';return d.innerHTML;}
function stageBadge(s){return `<span class="stage-badge ${STAGE_CLASS[s]}"><span class="stage-dot" style="background:${STAGE_COLORS[s]}"></span>${esc(s)}</span>`;}
function priorityBar(p){let b='';for(let i=1;i<=3;i++)b+=`<div class="priority-dot" style="background:${i<=p?(p===3?'#185FA5':p===2?'#BA7517':'#888780'):'#D3D1C7'}"></div>`;return `<div class="priority-bar">${b}</div>`;}
function isOverdue(d,s){return d&&new Date(d)<new Date()&&s!=='계약완료'&&s!=='실패';}
function today(){return new Date().toISOString().split('T')[0];}

function getSiteYear(s){
  if(s.startDate)return parseInt(s.startDate.substring(0,4));
  if(s.createdAt)return new Date(s.createdAt).getFullYear();
  if(s.deadline)return parseInt(s.deadline.substring(0,4));
  return new Date().getFullYear();
}

function buildYearOptions(selectId, onChange){
  const curYear=new Date().getFullYear();
  const years=new Set([curYear]);
  sites.forEach(s=>years.add(getSiteYear(s)));
  const sorted=[...years].sort((a,b)=>b-a);
  const sel=document.getElementById(selectId);
  if(!sel)return;
  const prev=sel.value||String(curYear);
  sel.innerHTML=sorted.map(y=>`<option value="${y}"${String(y)===prev?'selected':''}>${y}년</option>`).join('');
  if(!sel.value)sel.value=String(curYear);
}

/* ── DATA LOAD (Design Ref: §4.1 GET /api/sites, §6 401 처리) ── */
async function loadSites(){
  try{
    const res=await getSites();
    sites=res?.data||res||[];
  }catch(err){
    if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
    console.error('영업건 목록을 불러오지 못했습니다.',err);
    sites=[];
  }
}

async function init(){
  await loadSites();
  renderDashboard();
  if(document.getElementById('page-sites').classList.contains('active'))renderSites();
}

if(isLoggedIn())init();
document.addEventListener('lsd:login',init);

/* ── PAGE NAV ── */
function showPage(id,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(el)el.classList.add('active');
  const titles={dashboard:'대시보드',sites:'영업 파이프라인',report:'매출 분석'};
  document.getElementById('pageTitle').textContent=titles[id]||'';
  document.getElementById('topbarActions').style.display=(id==='dashboard')?'none':'flex';
  if(id==='sites')renderSites();
  if(id==='report')renderReport();
}

/* ── DASHBOARD ── */
function renderDashboard(){
  buildYearOptions('dashYearFilter');
  const selYear=parseInt(document.getElementById('dashYearFilter')?.value||new Date().getFullYear());
  const ySites=sites.filter(s=>getSiteYear(s)===selYear);

  const active=ySites.filter(s=>s.stage!=='계약완료'&&s.stage!=='실패');
  const won=ySites.filter(s=>s.stage==='계약완료');
  const wonAmt=won.reduce((a,b)=>a+(b.amount||0),0);
  const exp=active.reduce((a,b)=>a+(b.amount||0)*(b.prob||0)/100,0);
  const rate=(wonAmt+exp)>0?Math.round(wonAmt/(wonAmt+exp)*100):0;

  const totalAmt=ySites.reduce((a,b)=>a+(b.amount||0),0);
  const yearRate=totalAmt>0?Math.round(wonAmt/totalAmt*100):0;
  const el_goal=document.getElementById('kpi-goal');
  const el_yr=document.getElementById('kpi-year-rate');
  const el_goal_sub=document.getElementById('kpi-goal-sub');
  const el_yr_sub=document.getElementById('kpi-year-rate-sub');
  if(el_goal)el_goal.textContent=fmt(totalAmt);
  if(el_yr)el_yr.textContent=yearRate+'%';
  if(el_goal_sub)el_goal_sub.textContent='계약완료 '+fmt(wonAmt)+' / 전체 '+ySites.length+'건';
  if(el_yr_sub){
    el_yr_sub.textContent='계약완료 '+won.length+'건 기준';
    el_yr_sub.className='kpi-change '+(yearRate>=50?'up':yearRate>0?'':'');
  }
  document.getElementById('kpi-rate').textContent=rate+'%';
  document.getElementById('kpi-active').textContent=active.length+'건';
  document.getElementById('kpi-won').textContent=fmt(wonAmt);
  document.getElementById('kpi-expected').textContent=fmt(Math.round(exp));

  const stageCounts={};const stageAmts={};
  STAGES.slice(0,5).forEach(s=>{stageCounts[s]=0;stageAmts[s]=0;});
  ySites.forEach(s=>{if(stageCounts[s.stage]!==undefined){stageCounts[s.stage]++;stageAmts[s.stage]+=(s.amount||0);}});
  const maxC=Math.max(...Object.values(stageCounts),1);
  let ph='';
  STAGES.slice(0,5).forEach(s=>{
    const pct=Math.round(stageCounts[s]/maxC*100);
    ph+=`<div class="stage-row"><span class="stage-name">${s}</span><div class="stage-bar-bg"><div class="stage-bar" style="width:${pct}%;background:${STAGE_COLORS[s]}"></div></div><span class="stage-count">${stageCounts[s]}</span><span class="stage-amount">${fmt(stageAmts[s])}</span></div>`;
  });
  document.getElementById('pipelineChart').innerHTML=ph;

  const allActs=[];
  ySites.forEach(s=>(s.process||[]).forEach(t=>allActs.push({...t,siteName:s.site,siteStage:s.stage})));
  allActs.sort((a,b)=>b.date.localeCompare(a.date));
  let af='';
  allActs.slice(0,5).forEach(a=>{
    af+=`<div class="activity-item"><div class="activity-dot" style="background:${PROC_TYPE_COLOR[a.type]||'#888'}"></div><div><div class="activity-text"><strong>${esc(a.siteName)}</strong> — ${esc(a.title)}</div><div class="activity-time">${esc(a.date)} · ${esc(a.type)}</div></div></div>`;
  });
  document.getElementById('activityFeed').innerHTML=af||'<div style="font-size:12px;color:var(--text2)">활동 내역 없음</div>';

  const top5=[...ySites].filter(s=>s.stage!=='실패').sort((a,b)=>(b.amount||0)-(a.amount||0)).slice(0,5);
  let th='';
  top5.forEach(s=>{
    const od=isOverdue(s.deadline,s.stage);
    th+=`<tr onclick="openEditDrawer('${s._id}')"><td><strong>${esc(s.site)}</strong></td><td>${s.type==='정부기관'?'<span class="type-tag type-gov">정부기관</span>':'<span class="type-tag type-smb">중소기업</span>'}</td><td>${stageBadge(s.stage)}</td><td class="won-amount">${fmt(s.amount)}</td><td>${esc(s.managerName)}</td><td>${esc(s.deadline)||'-'}${od?'<span class="overdue-tag">지연</span>':''}</td></tr>`;
  });
  document.getElementById('dashTopSites').innerHTML=th||'<tr><td colspan="6" style="text-align:center;padding:16px;font-size:13px;color:var(--text2)">${selYear}년 데이터 없음</td></tr>';
  document.getElementById('siteBadge').textContent=sites.filter(s=>s.stage!=='계약완료'&&s.stage!=='실패').length;
}

/* ── SITES ── */
function renderSites(){filterSites();}
async function filterSites(){
  buildYearOptions('yearFilter');
  const selYear=parseInt(document.getElementById('yearFilter')?.value||new Date().getFullYear());
  const q=(document.getElementById('searchInput')||{value:''}).value.trim();
  const sf=(document.getElementById('stageFilter')||{value:''}).value;
  const tf=(document.getElementById('typeFilter')||{value:''}).value;
  const so=(document.getElementById('sortFilter')||{value:'recent'}).value;

  // Design Ref: §4.1 GET /api/sites?q=&stage=&type=&sort= — 서버 측 검색/필터/정렬
  const params={};
  if(q)params.q=q;
  if(sf)params.stage=sf;
  if(tf)params.type=tf;
  if(so)params.sort=so;

  let data;
  try{
    const res=await getSites(params);
    data=res?.data||res||[];
  }catch(err){
    if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
    data=[];
  }
  // 상세 Drawer(openEditDrawer)에서 조회 가능하도록 로컬 캐시에 병합
  data.forEach(s=>{
    const idx=sites.findIndex(x=>x._id===s._id);
    if(idx>=0)sites[idx]=s;else sites.push(s);
  });

  // 년도 필터
  data=data.filter(s=>getSiteYear(s)===selYear);

  const isManual=so==='manual';
  if(isManual){
    const order=JSON.parse(localStorage.getItem(MANUAL_ORDER_KEY)||'[]');
    if(order.length){
      data.sort((a,b)=>{
        const ai=order.indexOf(a._id),bi=order.indexOf(b._id);
        if(ai<0&&bi<0)return 0;
        if(ai<0)return 1;
        if(bi<0)return -1;
        return ai-bi;
      });
    }
  }
  const el=document.getElementById('siteCount');if(el)el.textContent=data.length+'건';
  // 드래그 핸들 헤더 표시/숨김
  const dhTh=document.getElementById('dragHandleTh');
  if(dhTh)dhTh.style.display=isManual?'':'none';

  let html='';
  data.forEach(s=>{
    const od=isOverdue(s.deadline,s.stage);
    const cost=s.cost||0;
    const profit=(s.amount||0)-cost;
    const hasCost=s.cost!=null&&s.cost!==''&&Number(s.cost)>0;
    const profitClass=profit>0?'won-amount':'';
    const profitStyle=profit<0?'color:var(--red);font-weight:500':'';
    const profitCell=hasCost?fmt(profit):(s.amount?`<span class="won-amount">${fmt(s.amount)}</span>`:'<span class="empty-cell">-</span>');
    const paidTotal=(s.payments||[]).reduce((a,r)=>a+(parseInt(r.paidAmount)||0),0);
    const paidCell=paidTotal>0?`<span class="paid-amount">${fmt(paidTotal)}</span>`:'<span class="empty-cell">-</span>';
    const handle=isManual?`<td><span class="drag-handle" title="드래그하여 순서 변경">⠿</span></td>`:`<td style="display:none"></td>`;
    html+=`<tr draggable="${isManual}" data-id="${s._id}" onclick="openEditDrawer('${s._id}')">${handle}<td><strong>${esc(s.site)}</strong></td><td>${esc(s.customer)}</td><td>${s.type==='정부기관'?'<span class="type-tag type-gov">정부기관</span>':'<span class="type-tag type-smb">중소기업</span>'}</td><td>${stageBadge(s.stage)}</td><td>${esc(s.product)}</td><td class="${s.stage==='계약완료'?'won-amount':''}">${fmt(s.amount)}</td><td>${hasCost?fmt(cost):'<span class="empty-cell">-</span>'}</td><td class="${profitClass}" style="${profitStyle}">${profitCell}</td><td>${paidCell}</td><td>${esc(s.managerName)}</td><td>${esc(s.deadline)||'-'}${od?'<span class="overdue-tag">지연</span>':''}</td><td>${priorityBar(s.priority)}</td></tr>`;
  });
  filteredSites=data;
  const tb=document.getElementById('sitesTableBody');
  if(tb){
    tb.innerHTML=html||`<tr><td colspan="13" style="text-align:center;padding:24px;font-size:12px;color:var(--text2)">검색 결과 없음</td></tr>`;
    if(isManual)initDragRows(tb);
  }
}

/* ── CUSTOMERS ── */
function renderCustomers(){
  const custMap={};
  sites.forEach(s=>{
    if(!custMap[s.customer])custMap[s.customer]={type:s.type,total:0,active:0,recent:'',cemail:s.cemail||'',ctel:s.ctel||'',cname:s.cname||'',cpos:s.cpos||''};
    custMap[s.customer].total+=s.amount;
    if(s.stage!=='계약완료'&&s.stage!=='실패')custMap[s.customer].active++;
    if(!custMap[s.customer].recent||s.deadline>custMap[s.customer].recent)custMap[s.customer].recent=s.deadline||'';
  });
  const q=(document.getElementById('custSearch')||{value:''}).value.toLowerCase();
  const tf=(document.getElementById('custTypeFilter')||{value:''}).value;
  let html='';
  Object.entries(custMap).filter(([n,c])=>{
    if(q&&!n.toLowerCase().includes(q))return false;
    if(tf&&c.type!==tf)return false;
    return true;
  }).forEach(([name,c])=>{
    const safeN=name.replace(/'/g,"\\'");
    html+=`<tr style="cursor:pointer" onclick="openCustomerEdit('${safeN}')"><td><strong>${esc(name)}</strong></td><td>${c.type==='정부기관'?'<span class="type-tag type-gov">정부기관</span>':'<span class="type-tag type-smb">중소기업</span>'}</td><td>${esc(c.cname)||'<span class="empty-cell">미입력</span>'}</td><td>${esc(c.ctel)||'<span class="empty-cell">미입력</span>'}</td><td class="won-amount">${fmt(c.total)}</td><td>${c.active>0?c.active+'건':'-'}</td><td>${esc(c.recent)||'-'}</td></tr>`;
  });
  const tb=document.getElementById('custTableBody');if(tb)tb.innerHTML=html;
}

function openCustomerEdit(name){
  const matches=sites.filter(s=>s.customer===name);
  if(!matches.length)return;
  const first=matches[0];
  editCustomerName=name;
  document.getElementById('ce-name').value=name;
  document.getElementById('ce-type').value=first.type||'정부기관';
  document.getElementById('ce-cname').value=first.cname||'';
  document.getElementById('ce-cpos').value=first.cpos||'';
  document.getElementById('ce-cemail').value=first.cemail||'';
  document.getElementById('ce-ctel').value=first.ctel||'';
  showCustomerMessage('');
  document.getElementById('customerModal').classList.add('open');
}
function closeCustomerModal(){
  document.getElementById('customerModal').classList.remove('open');
}
function showCustomerMessage(msg){
  const el=document.getElementById('customerError');if(!el)return;
  el.textContent=msg;
  el.style.display=msg?'block':'none';
}
async function saveCustomerEdit(){
  const newName=document.getElementById('ce-name').value.trim();
  if(!newName){showCustomerMessage('고객사명을 입력하세요.');return;}
  const type=document.getElementById('ce-type').value;
  const cname=document.getElementById('ce-cname').value.trim();
  const cpos=document.getElementById('ce-cpos').value.trim();
  const cemail=document.getElementById('ce-cemail').value.trim();
  const ctel=document.getElementById('ce-ctel').value.trim();
  const matches=sites.filter(s=>s.customer===editCustomerName);
  try{
    for(const s of matches){
      const patch={customer:newName,type,cname,cpos,cemail,ctel};
      await updateSite(s._id,patch);
      Object.assign(s,patch);
    }
  }catch(err){
    if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
    showCustomerMessage('저장 중 오류가 발생했습니다.');
    return;
  }
  closeCustomerModal();
  renderCustomers();
  renderDashboard();
}

/* ── SCHEDULE ── */
function renderSchedule(){
  const schedItems=[];
  sites.forEach(s=>{if(s.nextAction&&s.nextAction.date)schedItems.push({...s.nextAction,site:s.site,id:s._id});});
  schedItems.sort((a,b)=>a.date.localeCompare(b.date));
  let sh='',vh='';
  schedItems.slice(0,4).forEach(a=>{
    sh+=`<div class="activity-item"><div class="activity-dot" style="background:#185FA5"></div><div><div class="activity-text"><strong>${esc(a.site)}</strong> — ${esc(a.type)}</div><div class="activity-time">${esc(a.date)} · ${esc(a.person)}</div></div></div>`;
    if(a.type==='현장 방문'||a.type==='미팅 예약')vh+=`<div class="activity-item"><div class="activity-dot" style="background:#ED93B1"></div><div><div class="activity-text"><strong>${esc(a.site)}</strong> — ${esc(a.desc||a.type)}</div><div class="activity-time">${esc(a.date)}</div></div></div>`;
  });
  if(document.getElementById('scheduleList'))document.getElementById('scheduleList').innerHTML=sh||'<div style="font-size:12px;color:var(--text2)">예정 일정 없음</div>';
  if(document.getElementById('visitList'))document.getElementById('visitList').innerHTML=vh||'<div style="font-size:12px;color:var(--text2)">방문 예정 없음</div>';

  let fh=`<table class="tbl"><thead><tr><th>사이트</th><th>액션</th><th>담당자</th><th>기한</th></tr></thead><tbody>`;
  schedItems.forEach(a=>{
    const od=isOverdue(a.date,'');
    fh+=`<tr><td><strong>${esc(a.site)}</strong></td><td>${esc(a.type)}</td><td>${esc(a.person)}</td><td>${esc(a.date)}${od?'<span class="overdue-tag">기한초과</span>':''}</td></tr>`;
  });
  fh+='</tbody></table>';
  if(document.getElementById('followupList'))document.getElementById('followupList').innerHTML=fh;
}

/* ── REPORT ── */
function renderReport(){
  buildYearOptions('reportYearFilter');
  const selYear=parseInt(document.getElementById('reportYearFilter')?.value||new Date().getFullYear());
  const ySites=sites.filter(s=>getSiteYear(s)===selYear);

  const wonSites=ySites.filter(s=>s.stage==='계약완료');
  const totalAmt=ySites.reduce((a,b)=>a+(b.amount||0),0);
  const wonAmt=wonSites.reduce((a,b)=>a+(b.amount||0),0);
  const rate=totalAmt>0?Math.round(wonAmt/totalAmt*100):0;

  // 평균 영업사이클: 계약완료 건의 createdAt → updatedAt 평균 일수
  let cycleText='-';
  const cycleDays=wonSites.map(s=>{
    if(!s.createdAt||!s.updatedAt)return null;
    const diff=(new Date(s.updatedAt)-new Date(s.createdAt))/(1000*60*60*24);
    return diff>=0?Math.round(diff):null;
  }).filter(d=>d!=null);
  if(cycleDays.length)cycleText=Math.round(cycleDays.reduce((a,b)=>a+b,0)/cycleDays.length)+'일';

  const el0=document.getElementById('rep-total');if(el0)el0.textContent=fmt(totalAmt);
  const el1=document.getElementById('rep-ytd');if(el1)el1.textContent=fmt(wonAmt);
  const el2=document.getElementById('rep-rate');if(el2)el2.textContent=rate+'%';
  const el3=document.getElementById('rep-cycle');if(el3)el3.textContent=cycleText;

  // 월별 계약완료 금액 차트 (선택 년도 기준)
  const monthlyWon={};
  wonSites.forEach(s=>{
    const d=s.updatedAt||s.createdAt;
    if(!d)return;
    const m=d.substring(0,7); // YYYY-MM
    monthlyWon[m]=(monthlyWon[m]||0)+(s.amount||0);
  });
  const months=[];
  for(let m=1;m<=12;m++){
    months.push({key:`${selYear}-${String(m).padStart(2,'0')}`,label:`${m}월`});
  }
  const vals=months.map(m=>monthlyWon[m.key]||0);
  const maxV=Math.max(...vals,1);
  let mh='';
  months.forEach((m,i)=>{
    const v=vals[i];
    const h=v?Math.max(Math.round(v/maxV*100),6):4;
    mh+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;">
      <span style="font-size:10px;color:var(--text);font-weight:500">${v?fmt(v):''}</span>
      <div style="width:100%;height:${h}%;background:${v?'#185FA5':'#D3D1C7'};border-radius:3px 3px 0 0"></div>
      <span style="font-size:10px;color:var(--text2)">${m.label}</span>
    </div>`;
  });
  const mc=document.getElementById('monthlyChart');if(mc)mc.innerHTML=mh;

  // 제품/서비스별 수주현황 (선택 년도 기준)
  const prodStats={};
  ySites.forEach(s=>{
    const p=s.product||'미분류';
    if(!prodStats[p])prodStats[p]={total:0,wonCount:0,wonAmt:0,activeCount:0,activeAmt:0};
    if(s.stage==='계약완료'){
      prodStats[p].wonCount++;
      prodStats[p].wonAmt+=s.amount||0;
    } else if(s.stage!=='실패'){
      prodStats[p].activeCount++;
      prodStats[p].activeAmt+=s.amount||0;
    }
    prodStats[p].total++;
  });
  let pr='<table class="tbl"><thead><tr>'
    +'<th>제품/서비스</th>'
    +'<th style="text-align:right">전체 건수</th>'
    +'<th style="text-align:right">진행중 금액</th>'
    +'<th style="text-align:right">계약완료 건수</th>'
    +'<th style="text-align:right">계약완료 금액</th>'
    +'<th>전환율</th>'
    +'</tr></thead><tbody>';
  if(Object.keys(prodStats).length===0){
    pr+='<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text2);font-size:13px">등록된 영업 데이터가 없습니다.</td></tr>';
  } else {
    Object.entries(prodStats)
      .sort((a,b)=>(b[1].wonAmt+b[1].activeAmt)-(a[1].wonAmt+a[1].activeAmt))
      .forEach(([name,st])=>{
        const convRate=st.total>0?Math.round(st.wonCount/st.total*100):0;
        const barColor=convRate>=50?'#1D9E75':convRate>=20?'#BA7517':'#D3D1C7';
        pr+=`<tr>`
          +`<td><strong>${esc(name)}</strong></td>`
          +`<td style="text-align:right">${st.total}건</td>`
          +`<td style="text-align:right">${st.activeAmt?fmt(st.activeAmt):'<span class="empty-cell">-</span>'}</td>`
          +`<td style="text-align:right">${st.wonCount?st.wonCount+'건':'<span class="empty-cell">-</span>'}</td>`
          +`<td style="text-align:right" class="${st.wonAmt?'won-amount':''}">${st.wonAmt?fmt(st.wonAmt):'<span class="empty-cell">-</span>'}</td>`
          +`<td><div style="display:flex;align-items:center;gap:6px;">`
          +`<div style="flex:1;height:5px;background:var(--bg2);border-radius:2px;">`
          +`<div style="width:${convRate}%;height:100%;background:${barColor};border-radius:2px;"></div></div>`
          +`<span style="font-size:11px;min-width:28px">${convRate}%</span></div></td>`
          +`</tr>`;
      });
  }
  pr+='</tbody></table>';
  const pel=document.getElementById('productReport');if(pel)pel.innerHTML=pr;
}

/* ── PRODUCT ── */
function renderProduct(){
  const products=[
    {name:'ERP 솔루션',type:'SW 솔루션',price:'3,000만원~'},
    {name:'CRM 솔루션',type:'SW 솔루션',price:'1,500만원~'},
    {name:'보안 SW',type:'SW 솔루션',price:'800만원~'},
    {name:'클라우드 서비스',type:'클라우드',price:'월 150만원~'},
    {name:'IT 컨설팅',type:'컨설팅',price:'일 80만원~'},
    {name:'유지보수',type:'서비스',price:'연 500만원~'},
  ];
  const ps={};
  sites.forEach(s=>{if(!ps[s.product])ps[s.product]={count:0,won:0,customers:[]};ps[s.product].count++;if(s.stage==='계약완료')ps[s.product].won+=s.amount;if(!ps[s.product].customers.includes(s.customer))ps[s.product].customers.push(s.customer);});
  let html='';
  products.forEach(p=>{const st=ps[p.name]||{count:0,won:0,customers:[]};html+=`<tr><td><strong>${esc(p.name)}</strong></td><td><span class="type-tag type-gov">${esc(p.type)}</span></td><td>${esc(p.price)}</td><td>${st.count}건</td><td class="won-amount">${fmt(st.won)}</td><td>${st.customers.map(esc).slice(0,2).join(', ')||'-'}</td></tr>`;});
  const tb=document.getElementById('productTableBody');if(tb)tb.innerHTML=html;
}

/* ── DRAWER ── */
function openNewDrawer(){
  currentSiteId=null;
  document.getElementById('deleteBtn').style.display='none';
  document.getElementById('drawerTitle').textContent='신규 영업 등록';
  document.getElementById('drawerStageBadge').innerHTML='';
  ['f-site','f-customer','f-manager','f-note','f-amount','f-cost','f-cname','f-cpos','f-cemail','f-ctel'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-type').value='정부기관';
  document.getElementById('f-product').value='';
  document.getElementById('f-priority').value='2';
  document.getElementById('f-prob').value=50;
  document.getElementById('probVal').textContent='50%';
  document.getElementById('f-start-date').value=today();
  const d=new Date();d.setMonth(d.getMonth()+3);
  document.getElementById('f-deadline').value=d.toISOString().split('T')[0];
  calcProfit();
  currentStage='발굴';
  renderStageStepper('발굴');
  clearProcessForm();
  renderProcessTimeline([]);
  renderAttachments([]);
  renderNextAction(null);
  initPayments([{ id:'pay_'+Date.now(), stage:'1단계', expectedAmount:0, expectedDate:'', paidAmount:0, paidDate:'', note:'' }]);
  renderPayments();
  switchTab('basic',document.querySelector('.d-tab'));
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}

function openEditDrawer(id){
  const s=sites.find(x=>x._id===id);if(!s)return;
  currentSiteId=id;
  document.getElementById('deleteBtn').style.display='';
  document.getElementById('drawerTitle').textContent=s.site;
  document.getElementById('drawerStageBadge').innerHTML=stageBadge(s.stage);
  document.getElementById('f-site').value=s.site;
  document.getElementById('f-customer').value=s.customer;
  document.getElementById('f-type').value=s.type;
  document.getElementById('f-product').value=s.product;
  document.getElementById('f-amount').value=s.amount;
  document.getElementById('f-cost').value=s.cost||'';
  calcProfit();
  document.getElementById('f-manager').value=s.managerName||'';
  document.getElementById('f-start-date').value=s.startDate||today();
  document.getElementById('f-deadline').value=s.deadline||'';
  document.getElementById('f-priority').value=s.priority;
  document.getElementById('f-prob').value=s.prob;
  document.getElementById('probVal').textContent=s.prob+'%';
  document.getElementById('f-note').value=s.note||'';
  document.getElementById('f-cname').value=s.cname||'';
  document.getElementById('f-cpos').value=s.cpos||'';
  document.getElementById('f-cemail').value=s.cemail||'';
  document.getElementById('f-ctel').value=s.ctel||'';
  currentStage=s.stage;
  renderStageStepper(s.stage);
  clearProcessForm();
  renderProcessTimeline(s.process||[]);
  renderAttachments(s.attachments||[]);
  renderNextAction(s.nextAction);
  initPayments(s.payments||[]);
  renderPayments();
  document.getElementById('pf-date').value=today();
  switchTab('basic',document.querySelector('.d-tab'));
  document.getElementById('drawerOverlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}

function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

function renderStageStepper(active){
  let html='';
  STAGES.forEach(s=>{
    const idx=STAGES.indexOf(s),aidx=STAGES.indexOf(active);
    let cls='';
    if(s==='실패'){cls=active==='실패'?'failed':''}
    else if(s===active)cls='active';
    else if(idx<aidx)cls='done';
    html+=`<div class="ss-step ${cls}" onclick="setStage('${s}')">${s}</div>`;
  });
  document.getElementById('stageStepper').innerHTML=html;
}
function setStage(s){
  currentStage=s;
  renderStageStepper(s);
  if(currentSiteId){
    document.getElementById('drawerStageBadge').innerHTML=stageBadge(s);
  }
  renderPaymentSummary();
}

/* ── TAB ── */
function switchTab(id,el){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.d-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  if(el)el.classList.add('active');
  else document.querySelectorAll('.d-tab')[['basic','process','files','next'].indexOf(id)]&&document.querySelectorAll('.d-tab')[['basic','process','files','next'].indexOf(id)].classList.add('active');
  currentTab=id;
}

/* ── 진행과정 (Design Ref: §4.2 PUT /api/sites/:id — module-4) ── */
function toggleProcessForm(){
  formVisible=!formVisible;
  document.getElementById('processFormBody').style.display=formVisible?'':'none';
  document.getElementById('processFormToggleBtn').textContent=formVisible?'접기':'펼치기';
}
function clearProcessForm(){
  document.getElementById('pf-date').value=today();
  document.getElementById('pf-type').value='미팅';
  document.getElementById('pf-title').value='';
  document.getElementById('pf-desc').value='';
  document.getElementById('pf-stage').value='';
  document.getElementById('pf-attendee').value='';
  editProcId=null;
  document.getElementById('processFormTitle').textContent='+ 진행 내용 추가';
}
async function saveProcessEntry(){
  const title=document.getElementById('pf-title').value.trim();
  const date=document.getElementById('pf-date').value;
  if(!title||!date){alert('날짜와 제목을 입력하세요.');return;}
  const entry={
    id:editProcId||('p'+Date.now()),
    date,
    type:document.getElementById('pf-type').value,
    title,
    desc:document.getElementById('pf-desc').value,
    stage:document.getElementById('pf-stage').value||currentStage,
    attendee:document.getElementById('pf-attendee').value,
  };
  if(currentSiteId){
    const s=sites.find(x=>x._id===currentSiteId);
    if(s){
      if(editProcId){const idx=s.process.findIndex(p=>p.id===editProcId);if(idx>=0)s.process[idx]=entry;}
      else s.process.push(entry);
      if(document.getElementById('pf-stage').value){
        s.stage=document.getElementById('pf-stage').value;
        currentStage=s.stage;
        renderStageStepper(s.stage);
        document.getElementById('drawerStageBadge').innerHTML=stageBadge(s.stage);
      }
      s.process.sort((a,b)=>a.date.localeCompare(b.date));
      try{
        await updateSite(s._id,{process:s.process,stage:s.stage});
      }catch(err){
        if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
        alert('진행 내용 저장 중 오류가 발생했습니다.');
        return;
      }
      renderProcessTimeline(s.process);
      renderDashboard();
      if(document.getElementById('page-sites').classList.contains('active'))renderSites();
    }
  } else {
    window._tempProcess=window._tempProcess||[];
    if(editProcId){const idx=window._tempProcess.findIndex(p=>p.id===editProcId);if(idx>=0)window._tempProcess[idx]=entry;}
    else window._tempProcess.push(entry);
    window._tempProcess.sort((a,b)=>a.date.localeCompare(b.date));
    renderProcessTimeline(window._tempProcess);
  }
  clearProcessForm();
}
function editProcessEntry(pid){
  const s=currentSiteId?sites.find(x=>x._id===currentSiteId):null;
  const proc=s?s.process:window._tempProcess||[];
  const entry=proc.find(p=>p.id===pid);if(!entry)return;
  editProcId=pid;
  document.getElementById('pf-date').value=entry.date;
  document.getElementById('pf-type').value=entry.type;
  document.getElementById('pf-title').value=entry.title;
  document.getElementById('pf-desc').value=entry.desc||'';
  document.getElementById('pf-stage').value=entry.stage||'';
  document.getElementById('pf-attendee').value=entry.attendee||'';
  document.getElementById('processFormTitle').textContent='✎ 진행 내용 수정';
  if(!formVisible)toggleProcessForm();
  document.getElementById('processAddBox').scrollIntoView({behavior:'smooth'});
}
async function deleteProcessEntry(pid){
  if(!confirm('이 항목을 삭제하시겠습니까?'))return;
  const s=currentSiteId?sites.find(x=>x._id===currentSiteId):null;
  if(s){
    s.process=s.process.filter(p=>p.id!==pid);
    try{
      await updateSite(s._id,{process:s.process});
    }catch(err){
      if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
      alert('진행 내용 삭제 중 오류가 발생했습니다.');
      return;
    }
    renderProcessTimeline(s.process);
  }
  else{window._tempProcess=(window._tempProcess||[]).filter(p=>p.id!==pid);renderProcessTimeline(window._tempProcess);}
  if(editProcId===pid)clearProcessForm();
}
function renderProcessTimeline(proc){
  const sorted=[...proc].sort((a,b)=>b.date.localeCompare(a.date));
  const tl=document.getElementById('processTimeline');if(!tl)return;
  if(!sorted.length){tl.innerHTML='<div style="font-size:12px;color:var(--text2);padding:8px 0">진행 내용이 없습니다. 위 폼에서 추가하세요.</div>';return;}
  let html='';
  sorted.forEach((p,i)=>{
    const dotClass=p.type==='계약'?'teal':p.type==='미팅'?'filled':p.type==='제안서'||p.type==='견적'?'amber':p.type==='데모'?'pink':p.type==='실패'?'red':'filled';
    const stageChange=p.stage&&p.stage!==currentStage?`<span style="font-size:10px;background:var(--blue-light);color:var(--blue-dark);padding:1px 6px;border-radius:10px;margin-left:4px;">→ ${esc(p.stage)}</span>`:'';
    html+=`<div class="pt-item"><div class="pt-left"><div class="pt-dot ${dotClass}"></div>${i<sorted.length-1?'<div class="pt-line"></div>':''}</div>
      <div class="pt-card" id="ptcard-${p.id}">
        <div class="pt-card-header">
          <span class="pt-stage-tag" style="background:${PROC_TYPE_COLOR[p.type]?PROC_TYPE_COLOR[p.type]+'22':'var(--bg2)'};color:${PROC_TYPE_COLOR[p.type]||'var(--text2)'};">${esc(p.type)}</span>
          ${stageChange}
          <span class="pt-date">${esc(p.date)}</span>
          <span class="pt-edit-btn" onclick="editProcessEntry('${p.id}')">수정</span>
          <span class="pt-del-btn" onclick="deleteProcessEntry('${p.id}')">삭제</span>
        </div>
        <div class="pt-title">${esc(p.title)}</div>
        ${p.desc?`<div class="pt-desc">${esc(p.desc)}</div>`:''}
        ${p.attendee?`<div class="pt-meta"><div class="pt-meta-item">참석자 <span class="pt-meta-val">${esc(p.attendee)}</span></div></div>`:''}
      </div>
    </div>`;
  });
  tl.innerHTML=html;
}

/* ── 첨부파일 (v1: 로컬 표시만, Storage 연동은 v1.1+) ── */
function renderAttachments(list){
  const al=document.getElementById('attachList');
  const nf=document.getElementById('noFiles');
  if(!al)return;
  if(!list||!list.length){al.innerHTML='';if(nf)nf.style.display='';return;}
  if(nf)nf.style.display='none';
  const icons={'.pdf':'PDF','.xlsx':'XLS','.docx':'DOC','.pptx':'PPT'};
  al.innerHTML=list.map(f=>{
    const ext=Object.keys(icons).find(e=>f.name.endsWith(e))||'.etc';
    return `<div class="attach-item"><div class="attach-icon">${icons[ext]||'FILE'}</div><div class="attach-name">${esc(f.name)}</div><div class="attach-date">${esc(f.date)}</div><div class="pt-del-btn" style="margin-left:8px;" onclick="removeFile('${f.name}')">삭제</div></div>`;
  }).join('');
}
async function addDemoFile(){
  if(!currentSiteId)return;
  const s=sites.find(x=>x._id===currentSiteId);if(!s)return;
  s.attachments=s.attachments||[];
  const name=demoFiles[Math.floor(Math.random()*demoFiles.length)];
  s.attachments.push({name,date:today()});
  try{await updateSite(s._id,{attachments:s.attachments});}catch(err){if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}}
  renderAttachments(s.attachments);
}
async function removeFile(name){
  if(!currentSiteId)return;
  const s=sites.find(x=>x._id===currentSiteId);if(!s)return;
  s.attachments=s.attachments.filter(f=>f.name!==name);
  try{await updateSite(s._id,{attachments:s.attachments});}catch(err){if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}}
  renderAttachments(s.attachments);
}

/* ── 다음 액션 (Design Ref: §4.2 PUT /api/sites/:id — module-4) ── */
function renderNextAction(na){
  const el=document.getElementById('nextActionDisplay');if(!el)return;
  if(!na){el.innerHTML='';return;}
  const od=isOverdue(na.date,'');
  el.innerHTML=`<div class="next-action-box"><div class="na-title">등록된 다음 액션</div><div class="na-content">${esc(na.type)} — ${esc(na.desc)}</div><div class="na-date">${esc(na.date)} · ${esc(na.person)}${od?'<span class="overdue-tag" style="margin-left:6px">기한초과</span>':''}</div></div>`;
  document.getElementById('na-type').value=na.type;
  document.getElementById('na-date').value=na.date;
  document.getElementById('na-desc').value=na.desc||'';
  document.getElementById('na-person').value=na.person||'';
}
async function saveNextAction(){
  const type=document.getElementById('na-type').value;
  const date=document.getElementById('na-date').value;
  const desc=document.getElementById('na-desc').value;
  const person=document.getElementById('na-person').value;
  if(!date){alert('예정일을 입력하세요.');return;}
  const na={type,date,desc,person};
  if(currentSiteId){
    const s=sites.find(x=>x._id===currentSiteId);
    if(s){
      try{
        await updateSite(s._id,{nextAction:na});
      }catch(err){
        if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
        alert('다음 액션 저장 중 오류가 발생했습니다.');
        return;
      }
      s.nextAction=na;renderNextAction(na);renderSchedule();
    }
  } else {window._tempNextAction=na;renderNextAction(na);}
  alert('다음 액션이 저장되었습니다.');
}

/* ── SAVE / DELETE (Design Ref: §4.2 POST/PUT/DELETE /api/sites — module-3) ── */
async function saveSite(){
  const site=document.getElementById('f-site').value.trim();
  const customer=document.getElementById('f-customer').value.trim();
  if(!site||!customer){alert('프로젝트명과 고객사명은 필수입니다.');return;}
  const managerName=document.getElementById('f-manager').value.trim();
  const data={
    site,customer,
    type:document.getElementById('f-type').value,
    stage:currentStage,
    product:document.getElementById('f-product').value,
    amount:parseInt(document.getElementById('f-amount').value)||0,
    cost:parseInt(document.getElementById('f-cost').value)||0,
    managerName,
    startDate:document.getElementById('f-start-date').value||today(),
    deadline:document.getElementById('f-deadline').value,
    priority:parseInt(document.getElementById('f-priority').value),
    prob:parseInt(document.getElementById('f-prob').value)||50,
    note:document.getElementById('f-note').value,
    cname:document.getElementById('f-cname').value,
    cpos:document.getElementById('f-cpos').value,
    cemail:document.getElementById('f-cemail').value,
    ctel:document.getElementById('f-ctel').value,
    payments:_payments,
  };
  try{
    if(currentSiteId){
      const idx=sites.findIndex(s=>s._id===currentSiteId);
      const res=await updateSite(currentSiteId,data);
      const updated=res?.data||res;
      if(idx>=0)sites[idx]={...sites[idx],...data,...updated};
    }else{
      const user=getCurrentUser();
      data.managerId=user?.id||'';
      data.process=window._tempProcess||[];
      data.attachments=[];
      data.nextAction=window._tempNextAction||null;
      const res=await createSite(data);
      const created=res?.data||res;
      window._tempProcess=[];window._tempNextAction=null;
      sites.unshift({...data,...created});
    }
  }catch(err){
    if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
    alert('영업건 저장 중 오류가 발생했습니다.');
    return;
  }
  closeDrawer();
  renderDashboard();
  if(document.getElementById('page-sites').classList.contains('active'))renderSites();
}
async function deleteSite(){
  if(!currentSiteId||!confirm('이 영업건을 삭제하시겠습니까?'))return;
  try{
    await apiDeleteSite(currentSiteId);
  }catch(err){
    if(err.code==='UNAUTHORIZED'){handleUnauthorized();return;}
    alert('영업건 삭제 중 오류가 발생했습니다.');
    return;
  }
  sites=sites.filter(s=>s._id!==currentSiteId);
  closeDrawer();renderDashboard();
  if(document.getElementById('page-sites').classList.contains('active'))renderSites();
}

function exportData(){
  const data=filteredSites.length?filteredSites:sites;
  const yearVal=document.getElementById('yearFilter')?.value||new Date().getFullYear();
  const priorityLabel=p=>p===3?'높음':p===2?'보통':'낮음';

  let rows='';
  data.forEach(s=>{
    const cost=s.cost||0;
    const profit=(s.amount||0)-cost;
    const hasCost=cost>0;
    const od=isOverdue(s.deadline,s.stage)?'지연':'';
    rows+=`<tr>
      <td>${esc(s.site)}</td>
      <td>${esc(s.customer)}</td>
      <td>${esc(s.type)}</td>
      <td>${esc(s.stage)}</td>
      <td>${esc(s.product||'')}</td>
      <td style="mso-number-format:'#,##0'">${s.amount||0}</td>
      <td style="mso-number-format:'#,##0'">${hasCost?cost:''}</td>
      <td style="mso-number-format:'#,##0'">${hasCost?profit:''}</td>
      <td>${esc(s.managerName||'')}</td>
      <td>${esc(s.deadline||'')}</td>
      <td>${od}</td>
      <td>${priorityLabel(s.priority)}</td>
      <td style="mso-number-format:'0%'">${(s.prob||0)/100}</td>
    </tr>`;
  });

  const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>영업파이프라인</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  th{background:#185FA5;color:#fff;font-weight:bold;padding:6px 10px;border:1px solid #ccc;white-space:nowrap;}
  td{padding:5px 10px;border:1px solid #ddd;vertical-align:middle;}
  tr:nth-child(even) td{background:#f7f6f3;}
</style></head>
<body>
<table border="1" cellspacing="0" cellpadding="0">
  <thead><tr>
    <th>프로젝트명</th><th>고객사</th><th>유형</th><th>단계</th><th>제품/서비스</th>
    <th>금액(만원)</th><th>원가(만원)</th><th>수익(만원)</th>
    <th>담당자</th><th>마감예정</th><th>지연여부</th><th>우선순위</th><th>수주확률</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

  const blob=new Blob(['﻿'+html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`LSD_영업파이프라인_${yearVal}_${today()}.xls`;
  a.click();
}

document.getElementById('pf-date').value=today();

/* ── 드래그&드롭 행 정렬 ── */
function initDragRows(tbody){
  let dragSrc=null;
  tbody.querySelectorAll('tr[draggable="true"]').forEach(row=>{
    row.setAttribute('draggable','false');
    const handle=row.querySelector('.drag-handle');
    if(handle){
      handle.addEventListener('mousedown',()=>row.setAttribute('draggable','true'));
      handle.addEventListener('mouseup',()=>row.setAttribute('draggable','false'));
    }
    row.addEventListener('dragstart',e=>{
      dragSrc=row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
    });
    row.addEventListener('dragend',()=>{
      row.setAttribute('draggable','false');
      dragSrc=null;
      tbody.querySelectorAll('tr').forEach(r=>r.classList.remove('dragging','drag-over'));
    });
    row.addEventListener('dragover',e=>{
      e.preventDefault();
      if(row===dragSrc)return;
      tbody.querySelectorAll('tr').forEach(r=>r.classList.remove('drag-over'));
      row.classList.add('drag-over');
      e.dataTransfer.dropEffect='move';
    });
    row.addEventListener('drop',e=>{
      e.preventDefault();
      e.stopPropagation();
      if(!dragSrc||row===dragSrc)return;
      const rows=[...tbody.querySelectorAll('tr')];
      const srcIdx=rows.indexOf(dragSrc);
      const tgtIdx=rows.indexOf(row);
      if(srcIdx<tgtIdx)row.after(dragSrc);
      else row.before(dragSrc);
      const newOrder=[...tbody.querySelectorAll('tr')].map(r=>r.dataset.id).filter(Boolean);
      localStorage.setItem(MANUAL_ORDER_KEY,JSON.stringify(newOrder));
      row.classList.remove('drag-over');
    });
  });
}

/* ── 수금 관리 ── */
let _payments = [];


function initPayments(payments) {
  _payments = payments ? JSON.parse(JSON.stringify(payments)) : [];
}

function getPaymentStatus(row) {
  if (!row.paidAmount || row.paidAmount <= 0) return 'pending';
  if (row.paidAmount >= row.expectedAmount) return 'done';
  return 'partial';
}

function payStatusBadge(row) {
  const s = getPaymentStatus(row);
  const map = { done: ['pay-s-done','입금완료'], partial: ['pay-s-partial','일부입금'], pending: ['pay-s-pending','대기'] };
  const [cls, label] = map[s];
  return `<span class="pay-status ${cls}">${label}</span>`;
}

function _buildPaySummaryHTML() {
  const contractAmt = parseInt(document.getElementById('f-amount')?.value) || 0;
  const donePaid = _payments.reduce((a, r) => getPaymentStatus(r) === 'done' ? a + (parseInt(r.paidAmount)||0) : a, 0);
  const anyDone = _payments.some(r => getPaymentStatus(r) === 'done');
  const isWon = currentStage === '계약완료';
  const showFull = isWon || anyDone;
  const remaining = contractAmt - donePaid;

  let html = `<div class="pay-summary-item"><div class="pay-summary-label">계약금액</div><div class="pay-summary-val">${fmt(contractAmt)}</div></div>`;
  if (showFull) {
    html += `<div class="pay-summary-item"><div class="pay-summary-label">입금액</div><div class="pay-summary-val paid-amount">${fmt(donePaid)}</div></div>`;
    html += `<div class="pay-summary-item"><div class="pay-summary-label">미수금액</div><div class="pay-summary-val" style="color:${remaining>0?'var(--amber)':'var(--teal)'};">${fmt(remaining)}</div></div>`;
  }
  return html;
}

function renderPayments() {
  const list = document.getElementById('paymentList');
  const summary = document.getElementById('paymentSummary');
  if (!list) return;

  summary.style.display = 'flex';
  summary.innerHTML = _buildPaySummaryHTML();

  if (_payments.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text2);font-size:13px;">+ 추가 버튼으로 수금 단계를 등록하세요.</div>`;
    return;
  }

  list.innerHTML = _payments.map((r, i) => `
    <div style="border:0.5px solid var(--border);border-radius:var(--r);padding:8px 10px;margin-bottom:6px;background:var(--bg);">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="font-size:11px;color:var(--text2);min-width:16px;">${i+1}</span>
        <input class="pay-input" style="flex:1;" placeholder="단계명" value="${esc(r.stage||'')}" onchange="updatePayment(${i},'stage',this.value)">
        ${payStatusBadge(r)}
        <span style="cursor:pointer;color:var(--red);font-size:16px;line-height:1;padding:0 2px;" onclick="deletePayment(${i})">×</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
        <div><div style="font-size:11px;color:var(--text2);margin-bottom:2px;">예상금액(만)</div>
          <input class="pay-input" type="number" placeholder="0" value="${r.expectedAmount||''}" onchange="updatePayment(${i},'expectedAmount',this.value)"></div>
        <div><div style="font-size:11px;color:var(--text2);margin-bottom:2px;">예정일</div>
          <input class="pay-input" type="date" value="${r.expectedDate||''}" onchange="updatePayment(${i},'expectedDate',this.value)"></div>
        <div><div style="font-size:11px;color:var(--text2);margin-bottom:2px;">입금액(만)</div>
          <input class="pay-input" type="number" placeholder="0" value="${r.paidAmount||''}" onchange="updatePayment(${i},'paidAmount',this.value)"></div>
        <div><div style="font-size:11px;color:var(--text2);margin-bottom:2px;">입금일</div>
          <input class="pay-input" type="date" value="${r.paidDate||''}" onchange="updatePayment(${i},'paidDate',this.value)"></div>
        <div style="grid-column:1/-1;"><div style="font-size:11px;color:var(--text2);margin-bottom:2px;">비고</div>
          <input class="pay-input" placeholder="메모" value="${esc(r.note||'')}" onchange="updatePayment(${i},'note',this.value)"></div>
      </div>
    </div>`).join('');
}

function updatePayment(idx, field, value) {
  if (!_payments[idx]) return;
  _payments[idx][field] = field === 'expectedAmount' || field === 'paidAmount' ? (parseInt(value) || 0) : value;
  const list = document.getElementById('paymentList');
  // 상태 배지만 갱신 (리렌더 없이)
  const rows = list.querySelectorAll('tbody tr');
  if (rows[idx]) {
    const statusCell = rows[idx].querySelectorAll('td')[7];
    if (statusCell) statusCell.innerHTML = payStatusBadge(_payments[idx]);
  }
  // 서머리 갱신
  renderPaymentSummary();
}

function renderPaymentSummary() {
  const summary = document.getElementById('paymentSummary');
  if (!summary) return;
  summary.style.display = 'flex';
  summary.innerHTML = _buildPaySummaryHTML();
}

function addPaymentStage() {
  _payments.push({ id:'pay_'+Date.now(), stage:'', expectedAmount:0, expectedDate:'', paidAmount:0, paidDate:'', note:'' });
  renderPayments();
}


function deletePayment(idx) {
  _payments.splice(idx, 1);
  renderPayments();
}

function getTotalPaid() {
  return _payments.reduce((a, r) => a + (parseInt(r.paidAmount) || 0), 0);
}

function calcProfit(){
  const amount=parseInt(document.getElementById('f-amount').value)||0;
  const cost=parseInt(document.getElementById('f-cost').value)||0;
  const el=document.getElementById('f-profit');
  if(!el)return;
  if(!amount&&!cost){el.value='';return;}
  const profit=amount-cost;
  el.value=profit;
  el.style.color=profit>=0?'var(--teal)':'var(--red)';
}

/* ── 인라인 onclick 핸들러 호환을 위한 전역 노출 (Design Ref: §9.3) ── */
Object.assign(window,{
  showPage,openNewDrawer,openEditDrawer,closeDrawer,switchTab,setStage,
  filterSites,renderCustomers,openCustomerEdit,closeCustomerModal,saveCustomerEdit,renderSchedule,renderReport,renderProduct,
  calcProfit,
  toggleProcessForm,clearProcessForm,saveProcessEntry,editProcessEntry,deleteProcessEntry,
  addDemoFile,removeFile,saveNextAction,saveSite,deleteSite,exportData,
  addPaymentStage,deletePayment,updatePayment,
});
