/* ================= DATA MODEL ================= */
// Intentionally left as the original key name so existing saved data keeps loading after the rebrand.
const STORAGE_KEY='ssc_cgl_state_v1';
/* ---- IST-anchored date/time ----
   This app is built for IST users, so "today" and all day/week boundaries are
   pinned to true India Standard Time (UTC+5:30) rather than the browser's
   local timezone (which may differ from IST, or simply parse things via UTC
   through Date.toISOString(), which previously caused the day — and the
   weekly report's Sunday reset — to flip at 5:30 AM IST instead of 12:00 AM).
   nowIST() reads the true, timezone-agnostic epoch (Date.now()) and shifts it
   by the IST offset, so the calendar day/hour/minute below are always the
   real IST wall-clock values no matter what timezone the device is set to. */
const IST_OFFSET_MS=5.5*60*60*1000;
function nowIST(){ return new Date(Date.now()+IST_OFFSET_MS); }
function pad2(n){ return String(n).padStart(2,'0'); }
const todayStr=()=>{ const d=nowIST(); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`; };
/* Epoch instant (ms) of true IST midnight for a given Y-M-D calendar string. */
function istMidnightEpoch(dateStr){
  const [y,m,day]=dateStr.split('-').map(Number);
  return Date.UTC(y,m-1,day)-IST_OFFSET_MS;
}
function endOfDayIST(dateStr){ return istMidnightEpoch(dateStr)+24*3600*1000-1; }
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* Storage adapter: uses the Claude artifact window.storage API when running
   inside Claude, and falls back to browser localStorage when run standalone
   (e.g. this exported project opened directly in a browser). */
const storageAdapter={
  async get(key,shared){
    if(typeof window.storage!=='undefined'&&window.storage&&typeof window.storage.get==='function'){
      return window.storage.get(key,shared);
    }
    const v=localStorage.getItem(key);
    if(v===null)throw new Error('not found');
    return {key,value:v,shared:!!shared};
  },
  async set(key,value,shared){
    if(typeof window.storage!=='undefined'&&window.storage&&typeof window.storage.set==='function'){
      return window.storage.set(key,value,shared);
    }
    localStorage.setItem(key,value);
    return {key,value,shared:!!shared};
  }
};

const SYLLABUS={
  quant:{label:'Quantitative Aptitude',icon:'∑',topics:["Number System","LCM & HCF","Percentage","Profit & Loss","Simple Interest","Compound Interest","Average","Ratio & Proportion","Mixture & Alligation","Time & Work","Pipes & Cisterns","Speed, Time & Distance","Boat & Stream","Algebra","Geometry","Mensuration","Trigonometry","Statistics","Data Interpretation"]},
  reasoning:{label:'Reasoning',icon:'🧩',topics:["Analogy","Classification","Series (Number/Alphabet)","Coding-Decoding","Blood Relations","Direction Sense","Ranking & Order","Alphabet Test","Syllogism","Venn Diagrams","Matrix","Non-Verbal Reasoning","Mirror & Water Images","Paper Folding & Cutting","Puzzle","Seating Arrangement","Statement & Conclusion","Statement & Assumption","Cube & Dice","Missing Number","Word Formation","Logical Sequence"]},
  english:{label:'English',icon:'📖',topics:["Reading Comprehension","Cloze Test","Fill in the Blanks","Spotting Errors","Sentence Improvement","Para Jumbles","One Word Substitution","Idioms & Phrases","Synonyms","Antonyms","Spelling Correction","Active/Passive Voice","Direct/Indirect Speech","Vocabulary Building"]},
  ga:{label:'General Awareness',icon:'🌐',topics:["Indian History","Geography","Indian Polity","Economics","Static GK","Physics","Chemistry","Biology","Awards & Honours","Books & Authors","Important Days","Sports"]},
  computer:{label:'Computer',icon:'💻',topics:["Computer Fundamentals","MS Office (Word/Excel/PPT)","Internet & Networking","Software & Hardware","Shortcut Keys","Cyber Security Basics","Abbreviations & Terminology"]},
  currentAffairs:{label:'Current Affairs',icon:'📰',topics:["National Affairs","International Affairs","Sports Current Affairs","Government Schemes","Appointments & Resignations","Awards & Honours (Current)","Banking & Economy Awareness","Important Days & Themes"]}
};
const HABITS=["Wake up on time","Study 6+ Hours","Revision","Current Affairs","Vocabulary","Math Practice","Reasoning Practice","Reading","Exercise","Meditation","Sleep before 11 PM","Water Intake (8 glasses)","No Social Media","No Procrastination"];
const QUOTES=[
"Small daily wins compound into results no one can ignore.",
"You don't need a perfect day. You need a done day.",
"The syllabus doesn't finish itself. Show up, chapter by chapter.",
"Mocks don't measure you. They measure the gap you're about to close.",
"Every revision is a receipt that today's effort will still be there in March.",
"Discipline is choosing between what you want now and what you want most.",
"A weak topic today is a scoring topic in ninety days, if you keep coming back.",
"Consistency beats intensity when the exam is a year away.",
"The streak isn't the goal. It's proof the goal is being worked on.",
"Every question you get wrong today is one you won't miss in the exam hall."
];
const DEFAULT_SUBJECT_COLORS=['#a855f7','#ec4899','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#06b6d4','#f43f5e','#14b8a6','#eab308'];
const DEFAULT_TOPIC_ICON='📘';
const POMO_PRESETS=[[25,5],[30,5],[45,10],[50,10],[90,15]];
// Earliest selectable date across all date pickers in the app. Fixed on purpose —
// this is the app's tracking start date, not "today minus N years" — so it never
// creeps forward. There is intentionally no upper bound: any future date is valid.
const MIN_DATE='2026-01-01';

function freshTopic(name){return {id:uid(),name,status:'Not Started',targetDate:'',completionDate:'',timeSpent:0,confidence:3,difficulty:'Medium',revisions:0,lastRevisionDate:'',notes:'',mistakes:''};}
function defaultState(){
  const subjects={};
  Object.keys(SYLLABUS).forEach(k=>{subjects[k]={priority:'Medium',topics:SYLLABUS[k].topics.map(freshTopic),name:SYLLABUS[k].label,icon:SYLLABUS[k].icon,color:'',builtin:true};});
  return {
    meta:{startDate:todayStr(),dark:true,targetHoursToday:7,mockCounter:0,questionTarget:50000,mockTargetScore:200,accent:'violet',
      pomoWork:25,pomoBreak:5,pomoAutoTransition:true,pomoSound:true,pomoNotify:false},
    sessions:[], subjects, subjectOrder:Object.keys(SYLLABUS), goals:[], habits:{}, mocks:[], pyq:[], errors:[],
    notes:{quick:'',formulas:[],vocab:[]}, tasks:{}, dailyTargets:{}, customRevisions:[], history:[],
    weeklyReports:[]
  };
}
let DB=defaultState();
let saveTimer=null;
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDB,450);}
async function saveDB(){try{await storageAdapter.set(STORAGE_KEY,JSON.stringify(DB),false);}catch(e){console.error('save failed',e);}}
async function loadDB(){
  try{
    const res=await storageAdapter.get(STORAGE_KEY,false);
    if(res&&res.value){
      const parsed=JSON.parse(res.value);
      DB=Object.assign(defaultState(),parsed);
      // deep-merge meta so newly added fields get defaults on old saved data
      DB.meta=Object.assign(defaultState().meta,parsed.meta||{});
      DB.tasks=parsed.tasks||{};
      DB.dailyTargets=parsed.dailyTargets||{};
      DB.customRevisions=Array.isArray(parsed.customRevisions)?parsed.customRevisions:[];
      DB.history=Array.isArray(parsed.history)?parsed.history:[];
      DB.notes=Object.assign({quick:'',formulas:[],vocab:[]},parsed.notes||{});
      DB.weeklyReports=Array.isArray(parsed.weeklyReports)?parsed.weeklyReports:[];
      // backfill any new syllabus topics not present (safe merge)
      Object.keys(SYLLABUS).forEach(k=>{
        if(!DB.subjects[k])DB.subjects[k]={priority:'Medium',topics:SYLLABUS[k].topics.map(freshTopic),name:SYLLABUS[k].label,icon:SYLLABUS[k].icon,color:'',builtin:true};
      });
      // backfill name/icon/color/builtin fields on subjects saved by older versions
      Object.keys(DB.subjects).forEach(k=>{
        const s=DB.subjects[k];
        if(!s.name)s.name=SYLLABUS[k]?SYLLABUS[k].label:k;
        if(!s.icon)s.icon=SYLLABUS[k]?SYLLABUS[k].icon:DEFAULT_TOPIC_ICON;
        if(s.color===undefined)s.color='';
        if(s.builtin===undefined)s.builtin=!!SYLLABUS[k];
      });
      // backfill subject order, keep any saved order but append missing keys
      const savedOrder=Array.isArray(parsed.subjectOrder)?parsed.subjectOrder.filter(k=>DB.subjects[k]):[];
      const missing=Object.keys(DB.subjects).filter(k=>!savedOrder.includes(k));
      DB.subjectOrder=[...savedOrder,...missing];
    }
  }catch(e){ /* no existing key yet */ }
  if(DB.meta.dark)document.documentElement.classList.add('dark');
  document.documentElement.setAttribute('data-accent',DB.meta.accent||'violet');
  pomo.mode='Work';
  pomo.seconds=(DB.meta.pomoWork||25)*60;
  loadPomoState();
  sessionDate=pomoSavedDate||todayStr();
  checkDayRollover();
  render();
  if(pomo.running){
    studyTimer.running=(pomo.mode==='Work');
    pomo.interval=setInterval(pomoTick,1000);
  }
  clearInterval(dayRollcheckInterval);
  dayRollcheckInterval=setInterval(checkDayRollover,30000);
}
let dayRollcheckInterval=null;

function importDataFromFile(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    let parsed;
    try{ parsed=JSON.parse(reader.result); }
    catch(e){ alert('That file is not a valid AtlasTrackIt backup.'); input.value=''; return; }
    if(!confirm('Import this backup? This will overwrite your current data.')){ input.value=''; return; }
    DB=Object.assign(defaultState(),parsed);
    DB.meta=Object.assign(defaultState().meta,parsed.meta||{});
    DB.tasks=parsed.tasks||{};
    DB.dailyTargets=parsed.dailyTargets||{};
    DB.customRevisions=Array.isArray(parsed.customRevisions)?parsed.customRevisions:[];
    DB.history=Array.isArray(parsed.history)?parsed.history:[];
    DB.notes=Object.assign({quick:'',formulas:[],vocab:[]},parsed.notes||{});
    DB.weeklyReports=Array.isArray(parsed.weeklyReports)?parsed.weeklyReports:[];
    Object.keys(SYLLABUS).forEach(k=>{ if(!DB.subjects[k])DB.subjects[k]={priority:'Medium',topics:SYLLABUS[k].topics.map(freshTopic),name:SYLLABUS[k].label,icon:SYLLABUS[k].icon,color:'',builtin:true}; });
    Object.keys(DB.subjects).forEach(k=>{
      const s=DB.subjects[k];
      if(!s.name)s.name=SYLLABUS[k]?SYLLABUS[k].label:k;
      if(!s.icon)s.icon=SYLLABUS[k]?SYLLABUS[k].icon:DEFAULT_TOPIC_ICON;
      if(s.color===undefined)s.color='';
      if(s.builtin===undefined)s.builtin=!!SYLLABUS[k];
    });
    const savedOrder=Array.isArray(parsed.subjectOrder)?parsed.subjectOrder.filter(k=>DB.subjects[k]):[];
    const missing=Object.keys(DB.subjects).filter(k=>!savedOrder.includes(k));
    DB.subjectOrder=[...savedOrder,...missing];
    if(DB.meta.dark)document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-accent',DB.meta.accent||'violet');
    clearInterval(pomo.interval);
    pomo.mode='Work'; pomo.seconds=(DB.meta.pomoWork||25)*60; pomo.running=false; studyTimer.running=false;
    savePomoState();
    input.value='';
    scheduleSave(); render();
  };
  reader.readAsText(file);
}

/* ================= SUBJECT HELPERS (built-in + custom, unified) ================= */
function subjectKeys(){return DB.subjectOrder.filter(k=>DB.subjects[k]);}
function subjLabel(key){const s=DB.subjects[key];return s&&s.name?s.name:(SYLLABUS[key]?SYLLABUS[key].label:key);}
function subjIcon(key){const s=DB.subjects[key];return s&&s.icon?s.icon:(SYLLABUS[key]?SYLLABUS[key].icon:DEFAULT_TOPIC_ICON);}
function subjColor(key){const s=DB.subjects[key];return s&&s.color?s.color:'';}

/* ================= DERIVED STATS ================= */
function allTopics(){let t=[];subjectKeys().forEach(k=>t.push(...DB.subjects[k].topics.map(x=>({...x,subject:k}))));return t;}
function totalHours(){return DB.sessions.reduce((s,x)=>s+Number(x.hours||0),0);}
function hoursOn(dateStr){return DB.sessions.filter(s=>s.date===dateStr).reduce((a,b)=>a+Number(b.hours||0),0);}
function hoursSince(daysBack){
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-daysBack);
  return DB.sessions.filter(s=>new Date(s.date)>=cutoff).reduce((a,b)=>a+Number(b.hours||0),0);
}
function daysStudied(){return new Set(DB.sessions.map(s=>s.date)).size;}
function currentStreak(){
  const days=new Set(DB.sessions.filter(s=>Number(s.hours)>0).map(s=>s.date));
  let streak=0;
  // allow today to be empty without breaking streak calc from yesterday
  let cursor=todayStr();
  if(!days.has(cursor)){cursor=addDaysStr(cursor,-1);}
  while(days.has(cursor)){streak++;cursor=addDaysStr(cursor,-1);}
  return streak;
}
function longestStreak(){
  const days=[...new Set(DB.sessions.filter(s=>Number(s.hours)>0).map(s=>s.date))].sort();
  let longest=0,run=0,prev=null;
  days.forEach(d=>{
    if(prev){const diff=(new Date(d)-new Date(prev))/86400000; run = diff===1? run+1:1;}
    else run=1;
    longest=Math.max(longest,run); prev=d;
  });
  return longest;
}
function daysElapsed(){return Math.floor((new Date(todayStr())-new Date(DB.meta.startDate))/86400000)+1;}
function daysRemaining(){return Math.max(0,365-daysElapsed());}
function pctYear(){return Math.min(100,(daysElapsed()/365*100));}
function syllabusPct(){const t=allTopics();if(!t.length)return 0;const done=t.filter(x=>x.status==='Completed'||x.status==='Revised').length;return done/t.length*100;}
function revisionPct(){const t=allTopics();if(!t.length)return 0;const done=t.filter(x=>x.revisions>0).length;return done/t.length*100;}
function missedGoals(){const today=todayStr();return DB.goals.filter(g=>g.deadline&&g.deadline<today&&g.status!=='Completed');}
/* ---- effective daily target (per-day override falls back to default) ---- */
function effectiveTargetFor(dateStr){
  const override=DB.dailyTargets[dateStr];
  return (override!==undefined&&override!==null&&override!=='')?Number(override):Number(DB.meta.targetHoursToday);
}
function todayTarget(){return effectiveTargetFor(todayStr());}
function subjectStats(key){
  const topics=DB.subjects[key].topics;
  const total=topics.length;
  const completed=topics.filter(t=>t.status==='Completed'||t.status==='Revised').length;
  const revisionPending=topics.filter(t=>t.status==='Completed'&&t.revisions===0).length;
  const hrs=topics.reduce((a,b)=>a+Number(b.timeSpent||0),0);
  const weak=topics.filter(t=>t.confidence<=2).map(t=>t.name);
  const strong=topics.filter(t=>t.confidence>=4).map(t=>t.name);
  return {total,completed,remaining:total-completed,revisionPending,pct:total?completed/total*100:0,hrs,avgPerTopic:completed?hrs/completed:0,weak,strong};
}
function mockAvg(){if(!DB.mocks.length)return 0;return DB.mocks.reduce((a,b)=>a+Number(b.score||0),0)/DB.mocks.length;}
function mockHigh(){if(!DB.mocks.length)return 0;return Math.max(...DB.mocks.map(m=>Number(m.score||0)));}
function habitScore(dateStr){const h=DB.habits[dateStr];if(!h)return 0;const done=HABITS.filter(x=>h[x]).length;return done/HABITS.length*100;}
function revisionQueue(){
  const intervals=[1,7,16,35,90];
  const out=[];
  allTopics().forEach(t=>{
    if(t.status==='Completed'||t.status==='Revised'){
      const base=t.lastRevisionDate||t.completionDate;
      if(base && t.revisions<5){
        const due=new Date(base); due.setDate(due.getDate()+intervals[t.revisions]);
        out.push({name:t.name,subject:subjLabel(t.subject),subjectKey:t.subject,due:due.toISOString().slice(0,10),revNum:t.revisions+1,topicId:t.id});
      }
    }
  });
  return out.sort((a,b)=>a.due.localeCompare(b.due));
}
/* ---- question counter ---- */
function questionsOn(dateStr){return DB.sessions.filter(s=>s.date===dateStr).reduce((a,b)=>a+Number(b.qSolved||0),0);}
function questionsOnExcludingQuickEdit(dateStr){return DB.sessions.filter(s=>s.date===dateStr&&!s.quickEdit).reduce((a,b)=>a+Number(b.qSolved||0),0);}
function questionsSince(daysBack){
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-daysBack);
  return DB.sessions.filter(s=>new Date(s.date)>=cutoff).reduce((a,b)=>a+Number(b.qSolved||0),0);
}
function totalQuestionsSolved(){return DB.sessions.reduce((a,b)=>a+Number(b.qSolved||0),0);}
/* ---- study pace meter ---- */
function paceMeter(){
  const total=allTopics().length;
  const expectedFraction=Math.min(1,daysElapsed()/365);
  const expected=Math.round(expectedFraction*total);
  const actual=allTopics().filter(t=>t.status==='Completed'||t.status==='Revised').length;
  const gap=actual-expected;
  const threshold=Math.max(1,Math.round(total*0.03));
  let status='On Track',cls='med',ic='🟡';
  if(gap>=threshold){status='Ahead';cls='low';ic='🟢';}
  else if(gap<=-threshold){status='Behind';cls='high';ic='🔴';}
  return {expected,actual,gap,status,cls,ic};
}
/* ---- exam readiness score ---- */
function examReadiness(){
  const syl=syllabusPct(), rev=revisionPct();
  const mockPerf=DB.mocks.length?Math.min(100,mockAvg()/(DB.meta.mockTargetScore||200)*100):0;
  const consistency=daysElapsed()?Math.min(100,daysStudied()/daysElapsed()*100):0;
  const ca=DB.subjects.currentAffairs?subjectStats('currentAffairs').pct:0;
  const score=syl*0.30+rev*0.25+mockPerf*0.20+consistency*0.15+ca*0.10;
  let label='Needs Improvement',cls='high';
  if(score>=75){label='Excellent';cls='low';}
  else if(score>=50){label='Good';cls='med';}
  return {score,label,cls,syl,rev,mockPerf,consistency,ca};
}
/* ---- smart daily review recommendations ---- */
function dailyRecommendations(){
  const today=todayStr(); const out=[];
  subjectKeys().forEach(k=>{
    const subjSessions=DB.sessions.filter(s=>s.subject===k);
    const last=subjSessions.length?subjSessions.map(s=>s.date).sort().slice(-1)[0]:null;
    const gap=last?Math.floor((new Date(today)-new Date(last))/86400000):daysElapsed();
    if(daysElapsed()>gap && gap>=4)out.push(`You haven't studied ${subjLabel(k)} for ${gap} days.`);
  });
  allTopics().filter(t=>t.confidence<=2).slice(0,2).forEach(t=>out.push(`${t.name} confidence is still low.`));
  const qToday=questionsOn(today);
  if(qToday>0)out.push(`You solved ${qToday} questions today.`);
  if(DB.subjects.currentAffairs){
    const caPct=subjectStats('currentAffairs').pct;
    if(caPct<syllabusPct()-10)out.push('Current Affairs needs attention.');
  }
  const dueTomorrow=revisionQueue().filter(r=>r.due===addDaysStr(todayStr(),1));
  if(dueTomorrow.length)out.push(`Tomorrow prioritize revising ${dueTomorrow[0].name}.`);
  else{
    const weakest=allTopics().filter(t=>t.status!=='Completed'&&t.status!=='Revised').sort((a,b)=>a.confidence-b.confidence)[0];
    if(weakest)out.push(`Tomorrow prioritize ${weakest.name} (${subjLabel(weakest.subject)}).`);
  }
  if(!out.length)out.push('No red flags today — keep the pace steady.');
  return out;
}
/* ---- live study time (logged + running Pomodoro session timer) ---- */
function todayStudyTime(){return hoursOn(todayStr())+(studyTimer.seconds/3600);}

/* ================= RENDER SHELL ================= */
const TABS=[
  {id:'dashboard',label:'Dashboard',ic:'🏠'},
  {id:'study',label:'Study',ic:'📚'},
  {id:'goals',label:'Goals',ic:'🎯'},
  {id:'mocks',label:'Mocks',ic:'🧪'},
  {id:'settings',label:'Settings',ic:'⚙'}
];
const SUBTABS={
  study:[{key:'subjects',label:'Subjects',ic:'📚'},{key:'log',label:'Study Log',ic:'📝'},{key:'analytics',label:'Analytics',ic:'📊'}],
  goals:[{key:'goals',label:'Goals',ic:'🎯'},{key:'weekly',label:'Weekly Report',ic:'🗓'},{key:'achievements',label:'Achievements',ic:'🏅'}],
  mocks:[{key:'mocks',label:'Mock Tests',ic:'🧪'},{key:'pyq',label:'PYQ Tracker',ic:'📄'}]
};
let currentTab='dashboard';
let currentSubtab={study:'subjects',goals:'goals',mocks:'mocks'};
let openSubject=null;
let formTemp={}; // scratch state for un-submitted add-forms
const charts={};

function renderNav(){
  document.getElementById('nav').innerHTML=TABS.map(t=>
    `<button class="navbtn ${t.id===currentTab?'active':''}" data-action="tab" data-tab="${t.id}"><span class="ic">${t.ic}</span>${t.label}</button>`
  ).join('');
}
function esc(s){return (s||'').toString().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function pillClass(status){return {'Not Started':'notstarted','In Progress':'inprogress','Completed':'completed','Revised':'revised'}[status]||'notstarted';}
function subnavHtml(group){
  return `<div class="subnav">${SUBTABS[group].map(it=>`<button class="${currentSubtab[group]===it.key?'active':''}" data-action="subtab" data-tabgroup="${group}" data-sub="${it.key}"><span>${it.ic}</span>${it.label}</button>`).join('')}</div>`;
}

let lastRenderKey=null; // tracks tab+subtab+subject so we only replay entrance animations on a genuinely new view, not on every field edit
function render(){
  renderNav();
  document.getElementById('pageTitle').textContent=TABS.find(t=>t.id===currentTab).label;
  document.getElementById('sideStreak').textContent=currentStreak()+' day streak';
  const streakEl=document.querySelector('.streakpill');
  if(streakEl)streakEl.classList.toggle('streak-hot',currentStreak()>=7);
  checkBadgeUnlocks();
  const view=document.getElementById('view');
  const renderKey=currentTab+'|'+(currentSubtab[currentTab]||'')+'|'+(openSubject||'');
  const isFreshView=renderKey!==lastRenderKey;
  lastRenderKey=renderKey;
  if(currentTab==='dashboard')view.innerHTML=renderDashboard();
  else if(currentTab==='study')view.innerHTML=renderStudyPage();
  else if(currentTab==='goals')view.innerHTML=renderGoalsPage();
  else if(currentTab==='mocks')view.innerHTML=renderMocksPage();
  else if(currentTab==='settings')view.innerHTML=renderSettingsPage();
  view.classList.toggle('no-entrance-anim',!isFreshView);
  afterRenderHooks();
  closeMobileSidebar();
}

/* ================= STUDY / GOALS / MOCKS PAGE DISPATCHERS ================= */
function renderStudyPage(){
  const sub=currentSubtab.study;
  let content='';
  if(sub==='subjects')content=renderSubjects();
  else if(sub==='log')content=renderLog();
  else if(sub==='analytics')content=renderAnalytics();
  return subnavHtml('study')+content;
}
function renderGoalsPage(){
  const sub=currentSubtab.goals;
  let content='';
  if(sub==='goals')content=renderGoals();
  else if(sub==='weekly')content=renderWeeklyReport();
  else if(sub==='achievements')content=`<div class="section-title"><h2>Achievements</h2><span class="hint">Unlocked as you hit milestones</span></div>${renderBadges()}`;
  return subnavHtml('goals')+content;
}
function renderMocksPage(){
  const sub=currentSubtab.mocks;
  let content='';
  if(sub==='mocks')content=renderMocks();
  else if(sub==='pyq')content=renderPyq();
  return subnavHtml('mocks')+content;
}

/* ================= DASHBOARD (daily home screen) ================= */
function renderDashboard(){
  const today=todayStr();
  const target=todayTarget();
  const th=todayStudyTime();
  const quote=QUOTES[new Date().getDate()%QUOTES.length];
  const pomoTopicObj=(DB.subjects[pomo.subjectKey]?.topics||[]).find(t=>t.id===pomo.topicId);
  const pomoSubjLabel=pomo.subjectKey?subjLabel(pomo.subjectKey):'No subject selected';
  const pomoTopicLabel=pomoTopicObj?pomoTopicObj.name:(pomo.subtopic||'');
  return `
  <div class="card glass-card hero-zone" id="studySessionCard" style="padding:28px 26px 24px;">
    <div class="flexbetween" style="margin-bottom:20px;">
      <div class="label" style="font-size:12px;">🎯 Today's Focus</div>
      <span class="sub">Day ${daysElapsed()} of 365 · ${daysRemaining()}d left</span>
    </div>
    <div style="display:flex;gap:30px;align-items:center;flex-wrap:wrap;">
      <div class="ring-wrap hero-ring" id="todayRingWrap">${ringSVG(Math.min(100,target?th/target*100:0),170)}<div class="ring-label"><b id="todayGoalValue">${th.toFixed(1)}h</b><span>of ${target}h target</span></div></div>
      <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:14px;">
        <div class="grid g3" style="gap:10px;">
          <div class="chip stat" style="padding:10px 12px;border-radius:14px;">
            <div class="label" style="margin:0 0 4px;">Streak</div>
            <div class="value" style="font-size:19px;${currentStreak()>=7?'text-shadow:0 0 14px rgba(255,150,60,.5);':''}">${currentStreak()} 🔥</div>
          </div>
          <div class="chip stat" style="padding:10px 12px;border-radius:14px;">
            <div class="flexbetween"><div class="label" style="margin:0 0 4px;">Questions</div><button class="icon-only" data-action="editQuestionsToday" title="Edit today's question count" style="font-size:10px;">✏</button></div>
            <div class="value" style="font-size:19px;" id="questionsTodayValue">${questionsOn(today)}</div>
          </div>
          <div class="chip stat" style="padding:10px 12px;border-radius:14px;">
            <div class="flexbetween"><div class="label" style="margin:0 0 4px;">Today's Goal</div><button class="icon-only" data-action="editTodayTarget" title="Edit today's target" style="font-size:10px;">✏</button></div>
            <div class="value" style="font-size:19px;">${target}h</div>
          </div>
        </div>

        <div class="session-row">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <span class="live-dot${pomo.running?'':' idle'}"></span>
            <div style="min-width:0;">
              <div style="font-family:var(--font-display);font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(pomoSubjLabel)}${pomoTopicLabel?' — '+esc(pomoTopicLabel):''}</div>
              <div class="sub" id="studySessionMode" style="margin-top:1px;">${pomo.mode==='Work'?'🎯 Study Session':'☕ Break'}</div>
            </div>
          </div>
          <div class="pomo-display mono" id="studySessionTimer" style="font-size:26px;">${fmtTime(pomo.seconds)}</div>
          <div style="display:flex;gap:8px;flex-shrink:0;">
            <button class="btn sm" id="studySessionStartBtn" data-action="pomoStart">${pomo.running?'Pause':'Start'}</button>
            <button class="btn ghost sm" data-action="pomoResetBtn">Reset</button>
          </div>
        </div>
        <div class="sub" id="studySessionTotal">Today: ${fmtHrsMin(todayStudyTime())}</div>

        <details class="session-settings" ${heroSettingsOpen?'open':''}>
          <summary>⚙ Session Settings</summary>
          <div class="sub" style="margin-bottom:6px;">Subject</div>
          <div class="tabsrow">
            ${subjectKeys().map(k=>`<button class="${pomo.subjectKey===k?'active':''}" data-action="setPomoSubjectBtn" data-key="${k}" ${pomo.running?'disabled':''}>${esc(subjLabel(k))}</button>`).join('')}
          </div>
          ${pomo.subjectKey&&(DB.subjects[pomo.subjectKey]?.topics||[]).length?`
          <div class="sub" style="margin:10px 0 6px;">Topic</div>
          <div class="tabsrow" style="max-height:96px;overflow-y:auto;">
            ${(DB.subjects[pomo.subjectKey].topics||[]).map(t=>`<button class="${pomo.topicId===t.id?'active':''}" data-action="setPomoTopicBtn" data-id="${t.id}" ${pomo.running?'disabled':''}>${esc(t.name)}</button>`).join('')}
          </div>`:''}
          <div class="sub" style="margin:10px 0 6px;">Session Type</div>
          <div class="tabsrow">
            <button class="${pomo.sessionType!=='Revision'?'active':''}" data-action="setPomoSessionTypeBtn" data-type="Study" ${pomo.running?'disabled':''}>🎯 Study Session</button>
            <button class="${pomo.sessionType==='Revision'?'active':''}" data-action="setPomoSessionTypeBtn" data-type="Revision" ${pomo.running?'disabled':''}>🔁 Revision</button>
          </div>
          <div class="formgrid" style="grid-template-columns:1fr;margin-top:10px;margin-bottom:0;">
            <label>Subtopic (optional) <input type="text" data-action="setPomoSubtopic" value="${esc(pomo.subtopic||'')}" placeholder="e.g. Laws of Thermodynamics" ${pomo.running?'disabled':''}></label>
          </div>
          <div style="margin-top:14px;">
            <div class="sub" style="margin-bottom:6px;">Presets</div>
            <div class="tabsrow">
              ${POMO_PRESETS.map(([w,b])=>`<button class="${DB.meta.pomoWork===w&&DB.meta.pomoBreak===b?'active':''}" data-action="setPomoPreset" data-work="${w}" data-break="${b}">${w}/${b}</button>`).join('')}
            </div>
            <div class="formgrid" style="grid-template-columns:1fr 1fr;margin-top:4px;margin-bottom:0;">
              <label>Study (min) <input type="number" min="1" value="${DB.meta.pomoWork||25}" data-action="setPomoWork"></label>
              <label>Break (min) <input type="number" min="1" value="${DB.meta.pomoBreak||5}" data-action="setPomoBreak"></label>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="section-title">
    <h2>Today's Schedule</h2>
    <div style="display:flex;gap:8px;">
      <button class="btn ghost sm" data-action="openAddCustomRevision">+ Add</button>
      <button class="btn ghost sm" data-action="viewFullScheduler">Full Scheduler →</button>
    </div>
  </div>
  ${renderTodaySchedule()}

  <div class="section-title"><h2>Needs Attention</h2></div>
  ${renderNeedsAttention()}

  <div class="grid g2" style="margin-top:14px;align-items:start;">
    <div>
      <div class="section-title" style="margin-top:0;"><h2>This Week</h2></div>
      ${renderThisWeek()}
    </div>
    <div>
      <div class="section-title" style="margin-top:0;"><h2>Yesterday</h2></div>
      ${renderYesterdayCompact()}
    </div>
  </div>

  <div class="quote-box" style="margin-top:14px;"><p>"${esc(quote)}"</p><span>Daily motivation · Day ${daysElapsed()} of 365</span></div>
  `;
}
/* ---- Today's Schedule: merges the auto revision queue + manually scheduled
   items due today (and a lighter preview of tomorrow), reusing the exact
   same underlying data/actions as the full Scheduler — nothing new is
   computed here, this is purely a compact same-day view of it. ---- */
function renderTodaySchedule(){
  const today=todayStr();
  const tmr=addDaysStr(today,1);
  const q=revisionQueue();
  const custom=(DB.customRevisions||[]).slice();
  const todayItems=[
    ...q.filter(r=>r.due===today).map(r=>({icon:'🔁',kindLabel:'Revision',sessCls:'',title:'Revise: '+esc(r.name),meta:esc(r.subject)+' · Rev '+r.revNum,
      check:`data-action="addRevision" data-topic="${r.topicId}" data-key="${r.subjectKey}"`})),
    ...custom.filter(c=>c.due===today).map(c=>({icon:c.kind==='session'?'📖':'🔁',kindLabel:c.kind==='session'?'Session':'Revision',sessCls:c.kind==='session'?'sess':'',
      title:esc(c.text),meta:c.subject?esc(c.subject):'',check:`data-action="completeCustomRevision" data-id="${c.id}"`}))
  ];
  const tmrItems=[
    ...q.filter(r=>r.due===tmr).map(r=>({icon:'🔁',title:'Revise: '+esc(r.name),meta:esc(r.subject)+' · Rev '+r.revNum})),
    ...custom.filter(c=>c.due===tmr).map(c=>({icon:c.kind==='session'?'📖':'🔁',title:esc(c.text),meta:c.subject?esc(c.subject):''}))
  ];
  return `<div class="card">
    ${todayItems.length===0?'<div class="emptystate schedule-empty">Nothing scheduled for today.</div>':
    `<div class="schedule-list">${todayItems.map(it=>`
      <div class="schedule-item">
        <input type="checkbox" ${it.check} style="width:17px;height:17px;flex-shrink:0;cursor:pointer;">
        <span class="schedule-check-icon">${it.icon}</span>
        <div class="schedule-body"><div class="schedule-title">${it.title}</div>${it.meta?`<div class="schedule-tag">${it.meta}</div>`:''}</div>
        <span class="schedule-kind ${it.sessCls}">${it.kindLabel}</span>
      </div>`).join('')}</div>`}
    ${tmrItems.length>0?`
    <div class="sub" style="margin:14px 4px 4px;font-weight:700;color:var(--text);">Tomorrow (${tmrItems.length})</div>
    <div class="schedule-list">${tmrItems.map(it=>`
      <div class="schedule-item" style="opacity:.65;">
        <span class="schedule-check-icon">${it.icon}</span>
        <div class="schedule-body"><div class="schedule-title">${it.title}</div>${it.meta?`<div class="schedule-tag">${it.meta}</div>`:''}</div>
      </div>`).join('')}</div>`:''}
  </div>`;
}
/* ---- Needs Attention: signal pills for genuinely urgent things only.
   Overdue items are deliberately excluded from Today's Schedule above so
   nothing is shown twice — a revision only appears here once it's actually
   late, not while it's simply due today. ---- */
function renderNeedsAttention(){
  const today=todayStr();
  const q=revisionQueue();
  const overdueRevisions=q.filter(r=>r.due<today).length+(DB.customRevisions||[]).filter(c=>c.kind!=='session'&&c.due<today).length;
  const missedSessions=(DB.customRevisions||[]).filter(c=>c.kind==='session'&&c.due<today).length;
  const overdueGoals=missedGoals().length;
  const in48h=Date.now()+48*3600*1000;
  const soonGoals=DB.goals.filter(g=>{
    if(!g.deadline||g.status==='Completed')return false;
    const dueBy=endOfDayIST(g.deadline);
    return dueBy>=Date.now()&&dueBy<=in48h;
  }).length;
  const neglected=computeWeekStats(weekStartOf(today)).neglected;

  const pills=[];
  if(overdueRevisions>0)pills.push(`<div class="pill urgent"><span>⚠️</span><b>${overdueRevisions}</b> revision${overdueRevisions>1?'s':''} overdue</div>`);
  if(missedSessions>0)pills.push(`<div class="pill urgent"><span>📋</span><b>${missedSessions}</b> missed session${missedSessions>1?'s':''}</div>`);
  if(overdueGoals>0)pills.push(`<div class="pill urgent"><span>🚫</span><b>${overdueGoals}</b> goal${overdueGoals>1?'s':''} overdue</div>`);
  if(soonGoals>0)pills.push(`<div class="pill warn"><span>⏰</span><b>${soonGoals}</b> goal${soonGoals>1?'s':''} due soon</div>`);
  if(neglected.length>0)pills.push(`<div class="pill info"><span>📉</span>${neglected.slice(0,2).map(esc).join(', ')}${neglected.length>2?' +'+(neglected.length-2):''} neglected this week</div>`);

  if(pills.length===0)return `<div class="card"><div class="emptystate schedule-empty">✅ All caught up — nothing urgent right now.</div></div>`;
  return `<div class="card"><div class="pill-row">${pills.join('')}</div></div>`;
}
/* ---- This Week: compact 7-day activity strip + weekly goal, reusing the
   exact same computeWeekStats()/hoursOn() the Weekly Report itself uses. ---- */
function renderThisWeek(){
  const today=todayStr();
  const ws=weekStartOf(today);
  const stats=computeWeekStats(ws);
  const dates=weekDates(ws);
  const dayLabels=['S','M','T','W','T','F','S'];
  const maxH=Math.max(...dates.map(d=>hoursOn(d)),1);
  return `<div class="card">
    <div class="week-bars">
      ${dates.map((d,i)=>{
        const h=hoursOn(d), isToday=d===today;
        return `<div class="week-bar-col"><div class="week-bar${isToday?' today':''}" style="height:${Math.max(4,h/maxH*100)}%;" title="${d}: ${h.toFixed(1)}h"></div><div class="week-bar-day">${dayLabels[i]}</div></div>`;
      }).join('')}
    </div>
    <div class="flexbetween">
      <span class="sub"><b style="color:var(--text);">${stats.hours.toFixed(1)}h</b> logged · ${stats.studyDays}/7 days</span>
      <span class="sub">Goal <b style="color:var(--green);">${stats.goalPct}%</b></span>
    </div>
  </div>`;
}
/* ---- Yesterday: same DB.history data + openHistory action as before,
   just laid out compactly with an explicit "View Report" link. ---- */
function renderYesterdayCompact(){
  const y=addDaysStr(todayStr(),-1);
  const yEntry=(DB.history||[]).find(h=>h.date===y);
  return `<div class="card card-solid">
    ${yEntry?`
    <div class="y-stat-row">
      <div class="y-stat"><div class="y-stat-val">${fmtHrsMin(yEntry.studyHours)}</div><div class="y-stat-label">Studied</div></div>
      <div class="y-stat"><div class="y-stat-val">${yEntry.questionsSolved}</div><div class="y-stat-label">Questions</div></div>
      <div class="y-stat"><div class="y-stat-val">${yEntry.revisionsCompleted}</div><div class="y-stat-label">Revisions</div></div>
    </div>
    <button class="btn ghost sm" data-action="openHistory" style="width:100%;">View Report →</button>`:
    `<div class="emptystate schedule-empty">No data recorded for yesterday yet.</div>`}
  </div>`;
}
let ringIdCounter=0;
function ringSVG(pct,size){
  const s=size||120, r=s*0.4167, c=2*Math.PI*r, off=c-(Math.min(100,pct)/100)*c, gid='ringGrad'+(ringIdCounter++);
  // Colors are set via inline style="" (not bare presentation attributes) because
  // var() resolution inside raw SVG attributes like stroke="var(...)" is unreliable
  // across browsers — style="" is guaranteed to run through the normal CSS cascade.
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" style="overflow:visible;">
    <defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:var(--atm-cyan,var(--accent-500));"/><stop offset="100%" style="stop-color:var(--accent-600);"/>
    </linearGradient></defs>
    <circle cx="${s/2}" cy="${s/2}" r="${r}" style="stroke:var(--bg-soft);" stroke-width="${s*0.0833}" fill="none"/>
    <circle class="ring-progress" cx="${s/2}" cy="${s/2}" r="${r}" style="stroke:url(#${gid});filter:drop-shadow(0 0 8px rgba(45,227,255,.35));" stroke-width="${s*0.0833}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
  </svg>`;
}
function badgeList(){
  const qSolved=DB.sessions.reduce((a,b)=>a+Number(b.qSolved||0),0);
  const topicsDone=allTopics().filter(t=>t.status==='Completed'||t.status==='Revised').length;
  return [
    {ic:'🔥',label:'7 Day Streak',unlocked:currentStreak()>=7||longestStreak()>=7},
    {ic:'🔥',label:'30 Day Streak',unlocked:longestStreak()>=30},
    {ic:'⏱',label:'100 Hours',unlocked:totalHours()>=100},
    {ic:'⏱',label:'300 Hours',unlocked:totalHours()>=300},
    {ic:'✏️',label:'500 Questions',unlocked:qSolved>=500},
    {ic:'✏️',label:'1000 Questions',unlocked:qSolved>=1000},
    {ic:'📘',label:'50 Topics Done',unlocked:topicsDone>=50},
    {ic:'🧪',label:'First Mock Test',unlocked:DB.mocks.length>=1},
    {ic:'🧪',label:'10 Mock Tests',unlocked:DB.mocks.length>=10},
  ];
}
function renderBadges(){
  const badges=badgeList();
  return `<div class="badge-grid">${badges.map(b=>`<div class="badge ${b.unlocked?'unlocked':''}"><span class="bic">${b.ic}</span>${b.label}</div>`).join('')}</div>`;
}

/* ================= REVISIONS (Dashboard) =================
   Merges what used to be Study > Revision (the auto spaced-repetition queue)
   with the "Manually Added / Scheduled" custom list. A custom entry can
   optionally be linked to a real tracked topic — completing a linked entry
   calls logTopicRevision() on that topic, the same function the spaced-
   repetition queue uses, so it counts toward that subject's revision stats
   exactly like an auto-recommended revision would. */
function renderDashboardRevisions(){
  const q=revisionQueue();
  const today=todayStr();
  const tmr=addDaysStr(today,1);
  const in7=addDaysStr(today,7);
  const groups={Today:q.filter(r=>r.due<=today),Tomorrow:q.filter(r=>r.due===tmr),'Next 7 Days':q.filter(r=>r.due>tmr&&r.due<=in7)};
  const custom=(DB.customRevisions||[]).slice().sort((a,b)=>a.due.localeCompare(b.due));
  return `
  <div class="grid g2" style="align-items:start;">
    <div class="card">
      <div class="label" style="margin-bottom:10px;">🔁 Recommended</div>
      <div style="max-height:340px;overflow-y:auto;">
      ${Object.keys(groups).every(g=>groups[g].length===0)?'<div class="emptystate">Nothing recommended yet.</div>':
      Object.keys(groups).map(g=>{
        const items=groups[g];
        if(items.length===0)return '';
        return `<div class="sub" style="margin:10px 0 4px;font-weight:700;color:var(--text);">${g} (${items.length})</div>
        ${items.map(r=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
          <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;">
            <input type="checkbox" data-action="addRevision" data-topic="${r.topicId}" data-key="${r.subjectKey}" style="width:15px;height:15px;flex-shrink:0;">
            <span>${esc(r.name)} <span class="sub" style="color:var(--text-faint);">· ${esc(r.subject)} · Rev ${r.revNum} · due ${r.due}</span></span>
          </label>
        </div>`).join('')}`;
      }).join('')}
      </div>
    </div>
    <div class="card">
      <div class="label" style="margin-bottom:10px;">📌 Manually Added & Scheduled</div>
      <div style="max-height:340px;overflow-y:auto;">
      ${custom.length===0?'<div class="emptystate">Nothing planned yet.</div>':
      (()=>{
        const wgroups={Today:custom.filter(c=>c.due<=today),Tomorrow:custom.filter(c=>c.due===tmr),'This Week':custom.filter(c=>c.due>tmr&&c.due<=in7),Later:custom.filter(c=>c.due>in7)};
        return Object.keys(wgroups).map(g=>{
          const items=wgroups[g];
          if(items.length===0)return '';
          return `<div class="sub" style="margin:10px 0 4px;font-weight:700;color:var(--text);">${g} (${items.length})</div>
          ${items.map(c=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
            <label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;">
              <input type="checkbox" data-action="completeCustomRevision" data-id="${c.id}" style="width:15px;height:15px;flex-shrink:0;">
              <span>${c.kind==='session'?'📖':'🔁'} ${esc(c.text)} <span class="sub" style="color:var(--text-faint);">${c.subject?'· '+esc(c.subject):''} · due ${c.due}</span></span>
            </label>
            <button class="icon-only" data-action="deleteCustomRevision" data-id="${c.id}" title="Remove">🗑</button>
          </div>`).join('')}`;
        }).join('');
      })()}
      </div>
    </div>
  </div>`;
}

/* ================= SUBJECTS ================= */
function renderSubjects(){
  if(openSubject) return renderSubjectDetail(openSubject);
  return `<div class="flexbetween" style="margin-bottom:4px;">
    <span class="hint" style="font-size:11.5px;color:var(--text-faint);">Drag cards to reorder</span>
    <button class="btn sm" data-action="openAddSubject">+ Add Subject</button>
  </div>
  <div class="grid g3" id="subjectGrid">
  ${subjectKeys().map(k=>{
    const st=subjectStats(k);
    const col=subjColor(k);
    return `<div class="card subjectcard" draggable="true" data-subj-drag="${k}" data-action="openSubject" data-key="${k}" style="${col?`border-top:3px solid ${col};background:linear-gradient(180deg,${col}17,var(--card) 65%);`:''}">
      <div class="flexbetween"><h3 style="margin:0;font-size:14.5px;">${subjIcon(k)} ${esc(subjLabel(k))}</h3><span class="tag ${DB.subjects[k].priority==='High'?'high':DB.subjects[k].priority==='Low'?'low':'med'}">${DB.subjects[k].priority}</span></div>
      <div class="bar" style="margin-top:10px;"><span style="width:${st.pct}%${col?`;background:${col};`:''}"></span></div>
      <div class="sub" style="margin-top:4px;">${st.completed}/${st.total} topics · ${st.pct.toFixed(0)}%</div>
      <div class="grid g2" style="margin-top:10px;gap:8px;">
        <div class="sub">Hours spent<br><b style="color:var(--text);">${st.hrs.toFixed(1)}h</b></div>
        <div class="sub">Avg/topic<br><b style="color:var(--text);">${st.avgPerTopic.toFixed(1)}h</b></div>
        <div class="sub">Revision pending<br><b style="color:var(--text);">${st.revisionPending}</b></div>
        <div class="sub">Remaining<br><b style="color:var(--text);">${st.remaining}</b></div>
      </div>
    </div>`;
  }).join('')}
  </div>`;
}
function renderSubjectDetail(k){
  if(!DB.subjects[k]){openSubject=null;return renderSubjects();}
  const st=subjectStats(k); const topics=DB.subjects[k].topics;
  const minDate=MIN_DATE;
  return `
  <button class="btn ghost sm" data-action="closeSubject" style="margin-bottom:12px;">← All subjects</button>
  <div class="flexbetween">
    <h2 style="margin:0;">${subjIcon(k)} ${esc(subjLabel(k))}</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <label style="font-size:12px;color:var(--text-muted);">Priority
        <select data-action="setPriority" data-key="${k}">
          ${['High','Medium','Low'].map(p=>`<option ${DB.subjects[k].priority===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </label>
      <button class="btn ghost sm" data-action="openEditSubject" data-key="${k}">✏ Edit Subject</button>
      <button class="btn danger sm" data-action="deleteSubject" data-key="${k}">🗑 Delete Subject</button>
    </div>
  </div>
  <div class="grid g4" style="margin-top:12px;">
    <div class="card stat"><div class="label">Total Topics</div><div class="value">${st.total}</div></div>
    <div class="card stat"><div class="label">Completed</div><div class="value">${st.completed}</div></div>
    <div class="card stat"><div class="label">Remaining</div><div class="value">${st.remaining}</div></div>
    <div class="card stat"><div class="label">Completion %</div><div class="value">${st.pct.toFixed(0)}%</div></div>
  </div>
  <div class="grid g3" style="margin-top:10px;">
    <div class="card stat"><div class="label">Hours Spent</div><div class="value">${st.hrs.toFixed(1)}h</div></div>
    <div class="card stat"><div class="label">Avg Time / Topic</div><div class="value">${st.avgPerTopic.toFixed(1)}h</div></div>
    <div class="card stat"><div class="label">Revision Pending</div><div class="value">${st.revisionPending}</div></div>
  </div>
  <div class="grid g2" style="margin-top:10px;">
    <div class="card"><div class="label">Weak Topics (confidence ≤2)</div><div style="margin-top:6px;">${st.weak.length?st.weak.map(w=>`<span class="tag high" style="margin:2px;">${esc(w)}</span>`).join(''):'<span class="sub">None yet</span>'}</div></div>
    <div class="card"><div class="label">Strong Topics (confidence ≥4)</div><div style="margin-top:6px;">${st.strong.length?st.strong.map(w=>`<span class="tag low" style="margin:2px;">${esc(w)}</span>`).join(''):'<span class="sub">None yet</span>'}</div></div>
  </div>
  <div class="section-title"><h2>Topic Tracker</h2><span class="hint">Update inline — status, dates, confidence & time save instantly</span></div>
  <div class="card" style="margin-bottom:10px;">
    <button class="btn sm" data-action="openAddTopic" data-key="${k}">+ Add Topic</button>
  </div>
  <div class="card card-solid" style="overflow-x:auto;">
  <table><thead><tr>
    <th>Topic</th><th>Status</th><th>Target Date</th><th>Completion</th><th>Time (h)</th><th>Confidence</th><th>Difficulty</th><th>Revisions</th><th>Notes</th><th>Mistakes</th><th></th>
  </tr></thead><tbody>
  ${topics.map(t=>`<tr data-topic="${t.id}">
    <td style="min-width:160px;">${esc(t.name)} <button class="icon-only" data-action="openEditTopicName" data-topic="${t.id}" data-key="${k}" title="Rename topic">✏</button></td>
    <td><select data-field="status" data-topic="${t.id}" data-key="${k}">
      ${['Not Started','In Progress','Completed','Revised'].map(o=>`<option ${t.status===o?'selected':''}>${o}</option>`).join('')}
    </select></td>
    <td><input type="date" value="${t.targetDate}" min="${minDate}" data-field="targetDate" data-topic="${t.id}" data-key="${k}" style="width:130px;"></td>
    <td><input type="date" value="${t.completionDate}" min="${minDate}" data-field="completionDate" data-topic="${t.id}" data-key="${k}" style="width:130px;"></td>
    <td><input type="number" step="0.5" min="0" value="${t.timeSpent}" data-field="timeSpent" data-topic="${t.id}" data-key="${k}" style="width:60px;"></td>
    <td><select data-field="confidence" data-topic="${t.id}" data-key="${k}">${[1,2,3,4,5].map(n=>`<option ${t.confidence==n?'selected':''}>${n}</option>`).join('')}</select></td>
    <td><select data-field="difficulty" data-topic="${t.id}" data-key="${k}">${['Easy','Medium','Hard'].map(o=>`<option ${t.difficulty===o?'selected':''}>${o}</option>`).join('')}</select></td>
    <td style="white-space:nowrap;">
      <span class="mono">${t.revisions}</span>
      <button class="icon-only" data-action="addRevision" data-topic="${t.id}" data-key="${k}" title="Log a revision">＋</button>
      <button class="icon-only" data-action="openEditRevisions" data-topic="${t.id}" data-key="${k}" title="Set or edit revision count">✏</button>
    </td>
    <td><button class="icon-only" data-action="openNote" data-topic="${t.id}" data-key="${k}" data-field="notes" title="Edit notes">📝${t.notes?'<span class=\"notes-preview\">'+esc(t.notes.slice(0,14))+'</span>':''}</button></td>
    <td><button class="icon-only" data-action="openNote" data-topic="${t.id}" data-key="${k}" data-field="mistakes" title="Edit mistakes">⚠${t.mistakes?'<span class=\"notes-preview\">'+esc(t.mistakes.slice(0,14))+'</span>':''}</button></td>
    <td><button class="icon-only" data-action="deleteTopic" data-topic="${t.id}" data-key="${k}" title="Delete topic">🗑</button></td>
  </tr>`).join('')}
  </tbody></table>
  ${topics.length===0?'<div class="emptystate">No topics yet — add your first one above.</div>':''}
  </div>`;
}

/* ================= DAILY LOG ================= */
function ensureLogForm(){
  if(!formTemp.log)formTemp.log={date:todayStr(),start:'',end:'',hours:'',subject:subjectKeys()[0]||'',topic:'',subtopic:'',qSolved:'',qCorrect:'',qWrong:'',source:'',mood:'Okay',energy:'Medium',focus:3,distractions:'',breakMin:'',revisionDone:false,mockDone:false,wins:'',problems:'',tomorrow:''};
}
function renderLog(){
  ensureLogForm();
  const f=formTemp.log;
  const sorted=[...DB.sessions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40);
  return `
  <div class="card">
    <div class="label" style="margin-bottom:10px;">Quick Session Entry <span class="hint">— under 2 minutes</span></div>
    <div class="formgrid">
      <label>Date <input type="date" id="f_date" value="${f.date}" min="${MIN_DATE}"></label>
      <label>Start <input type="time" id="f_start" value="${f.start}"></label>
      <label>End <input type="time" id="f_end" value="${f.end}"></label>
      <label>Total Hours <input type="number" step="0.25" min="0" id="f_hours" value="${f.hours}" placeholder="auto or manual"></label>
      <label>Subject <select id="f_subject">${subjectKeys().map(k=>`<option value="${k}" ${f.subject===k?'selected':''}>${esc(subjLabel(k))}</option>`).join('')}</select></label>
      <label>Topic <input type="text" id="f_topic" value="${esc(f.topic)}" placeholder="e.g. Algebra"></label>
      <label>Subtopic <input type="text" id="f_subtopic" value="${esc(f.subtopic)}"></label>
      <label>Questions Solved <input type="number" min="0" id="f_qSolved" value="${f.qSolved}"></label>
      <label>Correct <input type="number" min="0" id="f_qCorrect" value="${f.qCorrect}"></label>
      <label>Wrong <input type="number" min="0" id="f_qWrong" value="${f.qWrong}"></label>
      <label>Source <input type="text" id="f_source" value="${esc(f.source)}" placeholder="Book/App"></label>
      <label>Mood <select id="f_mood">${['Great','Okay','Low','Stressed'].map(m=>`<option ${f.mood===m?'selected':''}>${m}</option>`).join('')}</select></label>
      <label>Energy <select id="f_energy">${['High','Medium','Low'].map(m=>`<option ${f.energy===m?'selected':''}>${m}</option>`).join('')}</select></label>
      <label>Focus (1-5) <select id="f_focus">${[1,2,3,4,5].map(n=>`<option ${f.focus==n?'selected':''}>${n}</option>`).join('')}</select></label>
      <label>Distractions <input type="text" id="f_distractions" value="${esc(f.distractions)}"></label>
      <label>Break (min) <input type="number" min="0" id="f_breakMin" value="${f.breakMin}"></label>
      <label style="flex-direction:row;align-items:center;gap:6px;">Revision done <input type="checkbox" id="f_revisionDone" ${f.revisionDone?'checked':''}></label>
      <label style="flex-direction:row;align-items:center;gap:6px;">Mock done <input type="checkbox" id="f_mockDone" ${f.mockDone?'checked':''}></label>
    </div>
    <div class="formgrid" style="grid-template-columns:1fr 1fr 1fr;">
      <label>Today's Wins <textarea id="f_wins">${esc(f.wins)}</textarea></label>
      <label>Today's Problems <textarea id="f_problems">${esc(f.problems)}</textarea></label>
      <label>Tomorrow's Target <textarea id="f_tomorrow">${esc(f.tomorrow)}</textarea></label>
    </div>
    <button class="btn" data-action="saveSession">Save Session</button>
  </div>
  <div class="section-title"><h2>Recent Entries</h2><span class="hint">${DB.sessions.length} total logged</span></div>
  <div class="card card-solid" style="overflow-x:auto;">
  ${sorted.length===0?'<div class="emptystate">No sessions logged yet. Add your first one above.</div>':`
  <table><thead><tr><th>Date</th><th>Hrs</th><th>Subject</th><th>Topic</th><th>Qs</th><th>Accuracy</th><th>Mood</th><th>Focus</th><th></th></tr></thead><tbody>
  ${sorted.map(s=>{
    const acc=s.qSolved>0?(s.qCorrect/s.qSolved*100).toFixed(0)+'%':'—';
    return `<tr><td>${s.date}</td><td>${Number(s.hours).toFixed(1)}</td><td>${esc(subjLabel(s.subject))}</td><td>${esc(s.topic)}</td><td>${s.qSolved||0}</td><td>${acc}</td><td>${s.mood}</td><td>${s.focus}</td>
    <td><button class="icon-only" data-action="deleteSession" data-id="${s.id}">🗑</button></td></tr>`;
  }).join('')}
  </tbody></table>`}
  </div>`;
}

/* ================= GOALS ================= */
function ensureGoalForm(){if(!formTemp.goal)formTemp.goal={type:'Weekly',text:'',deadline:'',priority:'Medium'};}
function renderReadinessCard(){
  const r=examReadiness();
  return `<div class="grid g3">
    <div class="card" style="text-align:center;">
      <div class="ring-wrap">${ringSVG(r.score)}<div class="ring-label"><b>${r.score.toFixed(0)}%</b><span>Readiness</span></div></div>
      <div style="margin-top:10px;"><span class="tag ${r.cls}">${r.label}</span></div>
    </div>
    <div class="card" style="grid-column:span 2;">
      <div class="label" style="margin-bottom:8px;">Score Breakdown</div>
      ${[['Syllabus Completion (30%)',r.syl],['Revision Completion (25%)',r.rev],['Mock Performance (20%)',r.mockPerf],['Study Consistency (15%)',r.consistency],['Current Affairs (10%)',r.ca]].map(x=>`<div style="margin-bottom:8px;"><div class="flexbetween"><span class="sub">${x[0]}</span><span class="sub">${x[1].toFixed(0)}%</span></div><div class="bar"><span style="width:${x[1]}%"></span></div></div>`).join('')}
    </div>
  </div>`;
}
function renderUpcomingDeadlines(){
  const now=Date.now();
  const in24h=now+24*3600*1000;
  const upcoming=DB.goals.filter(g=>{
    if(!g.deadline||g.status==='Completed')return false;
    const dueBy=endOfDayIST(g.deadline); // goal is due by the end of its deadline day, in IST
    return dueBy>=now&&dueBy<=in24h;
  }).sort((a,b)=>a.deadline.localeCompare(b.deadline));
  return `<div class="card">${upcoming.length===0?'<div class="emptystate">No deadlines in the next 24 hours.</div>':
  upcoming.map(g=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;"><span>${esc(g.text)} <span class="sub" style="color:var(--text-faint);">· ${g.type}</span></span><span class="tag ${g.priority==='High'?'high':g.priority==='Low'?'low':'med'}">${g.deadline}</span></div>`).join('')}
  </div>`;
}
let goalTypeFilter='All';
let heroSettingsOpen=false; // preserves the Session Settings <details> open/closed state across re-renders
function renderGoals(){
  ensureGoalForm(); const f=formTemp.goal;
  const types=['Yearly','Monthly','Weekly','Daily'];
  const filterTypes=goalTypeFilter==='All'?types:[goalTypeFilter];
  return `
  <div class="section-title"><h2>Exam Readiness</h2></div>
  ${renderReadinessCard()}
  <div class="section-title"><h2>Upcoming Deadlines</h2><span class="hint">Due in the next 24 hours</span></div>
  ${renderUpcomingDeadlines()}
  <div class="section-title"><h2>Add a Target</h2></div>
  <div class="card">
    <div class="label" style="margin-bottom:10px;">New Goal</div>
    <div class="formgrid">
      <label>Type <select id="g_type">${types.map(t=>`<option ${f.type===t?'selected':''}>${t}</option>`).join('')}</select></label>
      <label>Goal <input type="text" id="g_text" value="${esc(f.text)}" placeholder="e.g. Finish Algebra by July 30"></label>
      <label>Deadline <input type="date" id="g_deadline" value="${f.deadline}" min="${MIN_DATE}"></label>
      <label>Priority <select id="g_priority">${['High','Medium','Low'].map(p=>`<option ${f.priority===p?'selected':''}>${p}</option>`).join('')}</select></label>
    </div>
    <button class="btn" data-action="saveGoal">Add Target</button>
  </div>
  <div class="section-title"><h2>Your Goals</h2><span class="hint">${DB.goals.length} total</span></div>
  <div class="tabsrow">
    ${['All',...types].map(t=>`<button class="${goalTypeFilter===t?'active':''}" data-action="setGoalTypeFilter" data-type="${t}">${t}${t!=='All'?' ('+DB.goals.filter(g=>g.type===t).length+')':''}</button>`).join('')}
  </div>
  ${filterTypes.map(ty=>{
    const items=DB.goals.filter(g=>g.type===ty);
    return `<div class="section-title"><h2>${ty} Goals</h2><span class="hint">${items.length} active</span></div>
    <div class="card card-solid">${items.length===0?'<div class="emptystate">No '+ty.toLowerCase()+' goals yet.</div>':`
    <table><thead><tr><th>Goal</th><th>Deadline</th><th>Priority</th><th>Status</th><th>Progress</th><th></th></tr></thead><tbody>
    ${items.map(g=>`<tr><td style="min-width:180px;">${esc(g.text)}</td><td>${g.deadline||'—'}</td><td><span class="tag ${g.priority==='High'?'high':g.priority==='Low'?'low':'med'}">${g.priority}</span></td>
    <td><select data-action="goalStatus" data-id="${g.id}">${['Not Started','In Progress','Completed'].map(s=>`<option ${g.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
    <td style="min-width:120px;"><input type="range" min="0" max="100" value="${g.progress}" data-action="goalProgress" data-id="${g.id}"> <span class="mono">${g.progress}%</span></td>
    <td><button class="icon-only" data-action="deleteGoal" data-id="${g.id}">🗑</button></td></tr>`).join('')}
    </tbody></table>`}</div>`;
  }).join('')}
  `;
}

/* ================= MOCKS ================= */
function ensureMockForm(){if(!formTemp.mock)formTemp.mock={date:todayStr(),score:'',attempted:'',correct:'',wrong:'',timeTaken:'',weak:'',strong:'',mistakes:'',lessons:'',nextTarget:''};}
function mockReadiness(){
  if(!DB.mocks.length)return 'Take your first mock to establish a baseline.';
  const sorted=[...DB.mocks].sort((a,b)=>a.date.localeCompare(b.date));
  const last=sorted[sorted.length-1];
  const daysSinceLast=Math.floor((new Date(todayStr())-new Date(last.date))/86400000);
  const lastAcc=last.attempted?last.correct/last.attempted*100:0;
  if(daysSinceLast<2)return 'Spend 2 days revising weak areas first.';
  if(lastAcc<60)return 'Spend 2 days revising weak areas first.';
  return 'Ready for another Full Mock.';
}
function renderMocks(){
  ensureMockForm(); const f=formTemp.mock;
  const sorted=[...DB.mocks].sort((a,b)=>a.number-b.number);
  const scores=sorted.map(m=>Number(m.score||0));
  const lowest=scores.length?Math.min(...scores):0;
  const avgAcc=sorted.length?sorted.reduce((a,m)=>a+(m.attempted?m.correct/m.attempted*100:0),0)/sorted.length:0;
  const scoreImprovement=(sorted.length>=2&&scores[0]>0)?((scores[scores.length-1]-scores[0])/scores[0]*100):0;
  const recentNeg=sorted.slice(-3).reduce((a,m)=>a+m.wrong*0.5,0)/Math.max(1,sorted.slice(-3).length);
  const earlierNeg=sorted.slice(0,-3).length?sorted.slice(0,-3).reduce((a,m)=>a+m.wrong*0.5,0)/sorted.slice(0,-3).length:recentNeg;
  const negTrend=sorted.length>=2?(recentNeg<earlierNeg?'Improving ↓':recentNeg>earlierNeg?'Rising ↑':'Stable →'):'—';
  const recentAtt=sorted.slice(-3).reduce((a,m)=>a+Number(m.attempted||0),0)/Math.max(1,sorted.slice(-3).length);
  const earlierAtt=sorted.slice(0,-3).length?sorted.slice(0,-3).reduce((a,m)=>a+Number(m.attempted||0),0)/sorted.slice(0,-3).length:recentAtt;
  const attTrend=sorted.length>=2?(recentAtt>earlierAtt?'Rising ↑':recentAtt<earlierAtt?'Falling ↓':'Stable →'):'—';
  return `
  <div class="grid g4">
    <div class="card stat"><div class="label">Target Score</div><div class="value"><input type="number" style="width:70px;" value="${DB.meta.mockTargetScore}" data-action="setMockTarget"></div></div>
    <div class="card stat"><div class="label">Current Average</div><div class="value">${mockAvg().toFixed(1)}</div></div>
    <div class="card stat"><div class="label">Highest Score</div><div class="value">${mockHigh()}</div></div>
    <div class="card stat"><div class="label">Lowest Score</div><div class="value">${lowest}</div></div>
  </div>
  <div class="grid g4" style="margin-top:12px;">
    <div class="card stat"><div class="label">Average Accuracy</div><div class="value">${avgAcc.toFixed(1)}%</div></div>
    <div class="card stat"><div class="label">Negative Marks Trend</div><div class="value" style="font-size:16px;">${negTrend}</div></div>
    <div class="card stat"><div class="label">Score Improvement</div><div class="value">${scoreImprovement>=0?'+':''}${scoreImprovement.toFixed(1)}%</div></div>
    <div class="card stat"><div class="label">Attempt Trend</div><div class="value" style="font-size:16px;">${attTrend}</div></div>
  </div>
  <div class="card" style="margin-top:12px;">
    <div class="label">Readiness for Next Mock</div>
    <div class="value" style="font-size:16px;margin-top:4px;">${mockReadiness()}</div>
  </div>
  <div class="section-title"><h2>Log a Mock Test</h2></div>
  <div class="card">
    <div class="label" style="margin-bottom:10px;">Add a New Entry</div>
    <div class="formgrid">
      <label>Date <input type="date" id="m_date" value="${f.date}" min="${MIN_DATE}"></label>
      <label>Score <input type="number" id="m_score" value="${f.score}"></label>
      <label>Attempted <input type="number" id="m_attempted" value="${f.attempted}"></label>
      <label>Correct <input type="number" id="m_correct" value="${f.correct}"></label>
      <label>Wrong <input type="number" id="m_wrong" value="${f.wrong}"></label>
      <label>Time Taken (min) <input type="number" id="m_timeTaken" value="${f.timeTaken}"></label>
      <label>Weak Areas <input type="text" id="m_weak" value="${esc(f.weak)}"></label>
      <label>Strong Areas <input type="text" id="m_strong" value="${esc(f.strong)}"></label>
      <label>Next Target Score <input type="number" id="m_nextTarget" value="${f.nextTarget}"></label>
      <label>Mistakes <textarea id="m_mistakes">${esc(f.mistakes)}</textarea></label>
      <label>Lessons Learned <textarea id="m_lessons">${esc(f.lessons)}</textarea></label>
    </div>
    <button class="btn" data-action="saveMock">Save Mock Test</button>
  </div>
  <div class="section-title"><h2>Mock Test History</h2></div>
  <div class="card card-solid" style="overflow-x:auto;">
  ${sorted.length===0?'<div class="emptystate">No mock tests logged yet.</div>':`
  <table><thead><tr><th>#</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Neg. Marks</th><th>Time</th><th></th></tr></thead><tbody>
  ${sorted.map(m=>{
    const acc=m.attempted>0?(m.correct/m.attempted*100).toFixed(1)+'%':'—';
    const neg=(m.wrong*0.5).toFixed(1);
    return `<tr><td>${m.number}</td><td>${m.date}</td><td><b>${m.score}</b></td><td>${acc}</td><td>-${neg}</td><td>${m.timeTaken||'—'}m</td><td><button class="icon-only" data-action="deleteMock" data-id="${m.id}">🗑</button></td></tr>`;
  }).join('')}
  </tbody></table>`}
  </div>
  ${DB.mocks.length>=2?`<div class="section-title"><h2>Trend Charts</h2></div>
  <div class="grid g2"><div class="card card-solid"><canvas id="mockScoreChart" height="180"></canvas></div><div class="card card-solid"><canvas id="mockAccChart" height="180"></canvas></div></div>`:''}
  `;
}

/* ================= PYQ ================= */
function ensurePyqForm(){if(!formTemp.pyq)formTemp.pyq={paper:'',year:'',score:'',accuracy:'',time:'',mistakes:'',weakChapters:'',status:'Not Started'};}
function renderPyq(){
  ensurePyqForm(); const f=formTemp.pyq;
  return `
  <div class="card">
    <div class="label" style="margin-bottom:10px;">Add Previous Year Paper</div>
    <div class="formgrid">
      <label>Paper Name <input type="text" id="p_paper" value="${esc(f.paper)}"></label>
      <label>Year <input type="text" id="p_year" value="${esc(f.year)}"></label>
      <label>Score <input type="number" id="p_score" value="${f.score}"></label>
      <label>Accuracy % <input type="number" id="p_accuracy" value="${f.accuracy}"></label>
      <label>Time (min) <input type="number" id="p_time" value="${f.time}"></label>
      <label>Status <select id="p_status">${['Not Started','In Progress','Completed'].map(s=>`<option ${f.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Weak Chapters <input type="text" id="p_weakChapters" value="${esc(f.weakChapters)}"></label>
      <label>Mistakes <input type="text" id="p_mistakes" value="${esc(f.mistakes)}"></label>
    </div>
    <button class="btn" data-action="savePyq">Add Paper</button>
  </div>
  <div class="section-title"><h2>PYQ Papers</h2></div>
  <div class="card card-solid" style="overflow-x:auto;">
  ${DB.pyq.length===0?'<div class="emptystate">No PYQ papers logged yet.</div>':`
  <table><thead><tr><th>Paper</th><th>Year</th><th>Score</th><th>Accuracy</th><th>Status</th><th></th></tr></thead><tbody>
  ${DB.pyq.map(p=>`<tr><td>${esc(p.paper)}</td><td>${esc(p.year)}</td><td>${p.score}</td><td>${p.accuracy}%</td><td><span class="pill ${pillClass(p.status)}">${p.status}</span></td><td><button class="icon-only" data-action="deletePyq" data-id="${p.id}">🗑</button></td></tr>`).join('')}
  </tbody></table>`}
  </div>`;
}

/* ================= ANALYTICS ================= */
function renderAnalytics(){
  const days=[...Array(91)].map((_,i)=>addDaysStr(todayStr(),-(90-i)));
  const maxH=Math.max(1,...days.map(d=>hoursOn(d)));
  const p=paceMeter();
  const mg=missedGoals();
  return `
  <div class="section-title"><h2>Key Numbers</h2><span class="hint">At a glance</span></div>
  <div class="grid g4">
    <div class="card stat"><div class="label">Total Hours (all time)</div><div class="value">${totalHours().toFixed(1)}h</div></div>
    <div class="card stat"><div class="label">Consistency (91d)</div><div class="value">${(days.filter(d=>hoursOn(d)>0).length/91*100).toFixed(0)}%</div></div>
    <div class="card stat"><div class="label">Avg Daily Study</div><div class="value">${(totalHours()/Math.max(1,daysElapsed())).toFixed(2)}h</div></div>
    <div class="card stat"><div class="label">Days with Zero Study</div><div class="value">${daysElapsed()-daysStudied()}</div></div>
  </div>

  <div class="section-title"><h2>Study Pace Meter</h2><span class="hint">Day ${daysElapsed()} of 365</span></div>
  <div class="card">
    <div class="flexbetween"><div class="value" style="font-size:20px;">${p.ic} ${p.status}</div><span class="tag ${p.cls}">${p.gap>=0?'+':''}${p.gap} topics</span></div>
    <div class="grid g3" style="margin-top:12px;">
      <div class="sub">Expected Completed<br><b style="color:var(--text);">${p.expected}</b></div>
      <div class="sub">Actual Completed<br><b style="color:var(--text);">${p.actual}</b></div>
      <div class="sub">Gap<br><b style="color:var(--text);">${p.gap>=0?'+':''}${p.gap}</b></div>
    </div>
  </div>

  <div class="section-title"><h2>Goals</h2><span class="hint">Missed / overdue, all time</span></div>
  <div class="card">
    ${mg.length===0?'<div class="emptystate">No missed goals — everything on track.</div>':`
    <div class="flexbetween" style="margin-bottom:8px;"><div class="value" style="font-size:20px;">${mg.length} missed</div><span class="tag high">Overdue</span></div>
    <div class="sub" style="line-height:1.9;font-size:12.5px;">${mg.slice(0,6).map(g=>'⚠ '+esc(g.text)+' <span style="color:var(--text-faint);">(was due '+g.deadline+')</span>').join('<br>')}</div>`}
  </div>

  <div class="section-title"><h2>Trends</h2><span class="hint">Where your hours are going</span></div>
  <div class="grid g2">
    <div class="card card-solid"><div class="label" style="margin-bottom:8px;">Hours per Subject</div><canvas id="subjHoursChart" height="200"></canvas></div>
    <div class="card card-solid"><div class="label" style="margin-bottom:8px;">Hours per Week (last 8 weeks)</div><canvas id="weekHoursChart" height="200"></canvas></div>
  </div>

  <div class="section-title"><h2>Study Heatmap</h2><span class="hint">Last 91 days</span></div>
  <div class="card">
    <div class="heatmap">${days.map(d=>{const h=hoursOn(d);const op=h===0?0.06:Math.min(1,0.25+h/maxH*0.75);return `<div class="heatcell" title="${d}: ${h.toFixed(1)}h" style="background:rgba(168,85,247,${op});"></div>`;}).join('')}</div>
  </div>

  <div class="section-title"><h2>Subject Progress</h2><span class="hint">Syllabus completion by subject</span></div>
  <div class="grid g3">
    ${subjectKeys().map(k=>{const st=subjectStats(k);return `<div class="card"><div class="label">${esc(subjLabel(k))}</div><div class="value" style="font-size:18px;">${st.pct.toFixed(0)}%</div><div class="bar"><span style="width:${st.pct}%"></span></div></div>`;}).join('')}
  </div>`;
}

/* ================= WEEKLY REPORT (merges the old Weekly Report + Reviews systems) =================
   A report period always runs Sunday → Saturday. computeWeekStats() is the single
   source of truth for a week's numbers — it's used for the live current week, for
   auto-archived completed weeks, and for manual snapshots, so all three read the
   same underlying session/topic/mock data and never drift apart. */
function weekStartOf(dateStr){
  const [y,m,day]=dateStr.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1,day));
  d.setUTCDate(d.getUTCDate()-d.getUTCDay()); // getUTCDay(): 0=Sunday
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
}
function addDaysStr(dateStr,n){
  const [y,m,day]=dateStr.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1,day));
  d.setUTCDate(d.getUTCDate()+n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
}
function weekEndOf(weekStart){return addDaysStr(weekStart,6);}
function weekDates(weekStart){return [...Array(7)].map((_,i)=>addDaysStr(weekStart,i));}

function computeWeekStats(weekStart){
  const days=weekDates(weekStart);
  const daySet=new Set(days);
  const sessions=DB.sessions.filter(s=>daySet.has(s.date));
  const hours=sessions.reduce((a,b)=>a+Number(b.hours||0),0);
  const studyDays=new Set(sessions.map(s=>s.date)).size;
  const questions=sessions.reduce((a,b)=>a+Number(b.qSolved||0),0);
  const qCorrect=sessions.reduce((a,b)=>a+Number(b.qCorrect||0),0);
  const revisions=allTopics().filter(t=>t.lastRevisionDate&&daySet.has(t.lastRevisionDate)).length;
  const bySubj={};
  sessions.forEach(s=>{bySubj[s.subject]=(bySubj[s.subject]||0)+Number(s.hours||0);});
  const subjectBreakdown=subjectKeys().map(k=>({key:k,label:subjLabel(k),hours:+(bySubj[k]||0).toFixed(2)}));
  const touchedKeys=subjectKeys().filter(k=>bySubj[k]>0);
  const neglectedKeys=subjectKeys().filter(k=>!bySubj[k]);
  const sortedTouched=[...touchedKeys].sort((a,b)=>bySubj[b]-bySubj[a]);
  const strongestKey=sortedTouched[0]||null;
  const byTopic={};
  sessions.forEach(s=>{if(s.topic)byTopic[s.topic]=(byTopic[s.topic]||0)+Number(s.hours||0);});
  const topTopics=Object.keys(byTopic).sort((a,b)=>byTopic[b]-byTopic[a]).slice(0,3);
  const targetTotal=days.reduce((a,d)=>a+effectiveTargetFor(d),0);
  const goalPct=targetTotal?Math.min(100,Math.round(hours/targetTotal*100)):0;
  const mocks=DB.mocks.filter(m=>daySet.has(m.date));
  const missedGoalsThisWeek=DB.goals.filter(g=>g.deadline&&daySet.has(g.deadline)&&g.status!=='Completed');
  // "Preparation balance": how evenly time was spread across every subject this
  // week (100% = perfectly even, lower = skewed toward one or two subjects).
  const allHrsArr=subjectKeys().map(k=>bySubj[k]||0);
  const meanAll=allHrsArr.length?allHrsArr.reduce((a,b)=>a+b,0)/allHrsArr.length:0;
  const variance=allHrsArr.length?allHrsArr.reduce((a,b)=>a+Math.pow(b-meanAll,2),0)/allHrsArr.length:0;
  const balance=meanAll>0?Math.max(0,Math.round(100-(Math.sqrt(variance)/meanAll)*100)):0;
  return {
    weekStart,weekEnd:weekEndOf(weekStart),
    hours:+hours.toFixed(2),studyDays,sessionsCount:sessions.length,
    questions,accuracy:questions?Math.round(qCorrect/questions*100):null,
    revisions,subjectBreakdown,
    neglected:neglectedKeys.map(k=>subjLabel(k)),
    strongest:strongestKey?subjLabel(strongestKey):null,
    topTopics,goalPct,
    mocksCount:mocks.length,
    mockAvgScore:mocks.length?+(mocks.reduce((a,b)=>a+Number(b.score||0),0)/mocks.length).toFixed(1):null,
    balance,consistencyPct:Math.round(studyDays/7*100),
    missedGoalsCount:missedGoalsThisWeek.length,
    missedGoalsList:missedGoalsThisWeek.slice(0,5).map(g=>g.text)
  };
}
function weekComparison(cur,prev){
  const delta=key=>{
    const c=cur[key]||0,p=prev[key]||0,diff=+(c-p).toFixed(2);
    return {cur:c,prev:p,diff,pct:p?Math.round(diff/p*100):(c>0?100:0)};
  };
  return {hours:delta('hours'),questions:delta('questions'),revisions:delta('revisions'),goalPct:delta('goalPct')};
}
/* Renders one week's Summary + Review body. Shared by the live current-week view
   and by archived/snapshot detail views — same data shape, same layout. */
function renderWeekStatsHTML(stats,cmp){
  const arrow=n=>n>0?'▲':n<0?'▼':'—';
  const dcolor=n=>n>0?'color:var(--green);':n<0?'color:var(--red);':'';
  return `
  <div class="section-title"><h2>Weekly Summary</h2><span class="hint">${stats.weekStart} → ${stats.weekEnd}</span></div>
  <div class="grid g4">
    <div class="card stat"><div class="label">Total Study Hours</div><div class="value">${stats.hours.toFixed(1)}h</div></div>
    <div class="card stat"><div class="label">Study Days</div><div class="value">${stats.studyDays} / 7</div></div>
    <div class="card stat"><div class="label">Study Sessions</div><div class="value">${stats.sessionsCount}</div></div>
    <div class="card stat"><div class="label">Questions Solved</div><div class="value">${stats.questions}</div></div>
  </div>
  <div class="grid g4" style="margin-top:12px;">
    <div class="card stat"><div class="label">Revisions Completed</div><div class="value">${stats.revisions}</div></div>
    <div class="card stat"><div class="label">Weekly Goal</div><div class="value">${stats.goalPct}%</div></div>
    <div class="card stat"><div class="label">Mock Tests</div><div class="value">${stats.mocksCount}</div></div>
    <div class="card stat"><div class="label">Accuracy</div><div class="value">${stats.accuracy!==null?stats.accuracy+'%':'—'}</div></div>
  </div>
  <div class="section-title"><h2>Subject Breakdown</h2></div>
  <div class="grid g3">
    ${stats.subjectBreakdown.map(s=>`<div class="card"><div class="label">${esc(s.label)}</div><div class="value" style="font-size:18px;">${s.hours.toFixed(1)}h</div></div>`).join('')}
  </div>

  <div class="section-title"><h2>Weekly Review</h2><span class="hint">Balance & insights</span></div>
  <div class="grid g2">
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Preparation Balance</div>
      <div class="value" style="font-size:24px;">${stats.balance}%</div>
      <div class="bar"><span style="width:${stats.balance}%"></span></div>
      <div class="sub" style="margin-top:6px;">How evenly study time was spread across subjects this week.</div>
    </div>
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Consistency</div>
      <div class="value" style="font-size:24px;">${stats.consistencyPct}%</div>
      <div class="bar"><span style="width:${stats.consistencyPct}%"></span></div>
      <div class="sub" style="margin-top:6px;">${stats.studyDays} of 7 days had logged study time.</div>
    </div>
  </div>
  <div class="grid g2" style="margin-top:14px;align-items:stretch;">
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Subject Focus</div>
      <div class="sub" style="line-height:1.9;font-size:12.5px;">
        Most studied subject: <b style="color:var(--text);">${stats.strongest||'—'}</b><br>
        Most studied topics: <b style="color:var(--text);">${stats.topTopics.length?stats.topTopics.join(', '):'—'}</b><br>
        Subjects needing attention: <b style="color:var(--text);">${stats.neglected.length?stats.neglected.join(', '):'None — solid coverage'}</b>
      </div>
    </div>
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Revision Performance</div>
      <div class="sub" style="line-height:1.9;font-size:12.5px;">
        Revisions completed this week: <b style="color:var(--text);">${stats.revisions}</b><br>
        All-time revision completion: <b style="color:var(--text);">${revisionPct().toFixed(0)}%</b><br>
        Recommendation: ${stats.neglected.length?'Rotate in '+esc(stats.neglected[0])+' before the week ends.':'Maintain current rotation, add a mock test.'}
      </div>
    </div>
  </div>
  <div class="grid g2" style="margin-top:14px;align-items:stretch;">
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Goals — This Week</div>
      <div class="sub" style="line-height:1.9;font-size:12.5px;">
        ${stats.missedGoalsCount>0?`Missed / overdue: <b style="color:var(--red,#ef4444);">${stats.missedGoalsCount}</b><br>${stats.missedGoalsList.map(t=>'⚠ '+esc(t)).join('<br>')}`:'No goals were missed this week — nice work.'}
      </div>
    </div>
  </div>
  ${cmp?`
  <div class="section-title"><h2>Week-over-Week Comparison</h2><span class="hint">vs previous week</span></div>
  <div class="card card-solid" style="overflow-x:auto;">
  <table><thead><tr><th>Metric</th><th>Previous Week</th><th>This Week</th><th>Change</th></tr></thead><tbody>
    <tr><td>Study Hours</td><td>${cmp.hours.prev.toFixed(1)}h</td><td>${cmp.hours.cur.toFixed(1)}h</td><td style="${dcolor(cmp.hours.diff)}">${arrow(cmp.hours.diff)} ${Math.abs(cmp.hours.diff).toFixed(1)}h</td></tr>
    <tr><td>Questions Solved</td><td>${cmp.questions.prev}</td><td>${cmp.questions.cur}</td><td style="${dcolor(cmp.questions.diff)}">${arrow(cmp.questions.diff)} ${Math.abs(cmp.questions.diff)}</td></tr>
    <tr><td>Revisions Completed</td><td>${cmp.revisions.prev}</td><td>${cmp.revisions.cur}</td><td style="${dcolor(cmp.revisions.diff)}">${arrow(cmp.revisions.diff)} ${Math.abs(cmp.revisions.diff)}</td></tr>
    <tr><td>Weekly Goal</td><td>${cmp.goalPct.prev}%</td><td>${cmp.goalPct.cur}%</td><td style="${dcolor(cmp.goalPct.diff)}">${arrow(cmp.goalPct.diff)} ${Math.abs(cmp.goalPct.diff)}%</td></tr>
  </tbody></table>
  </div>`:''}
  `;
}
function renderWeeklyReport(){
  const today=todayStr();
  const todaySessions=DB.sessions.filter(s=>s.date===today);
  const th=todaySessions.reduce((a,b)=>a+Number(b.hours||0),0);
  const topicsCovered=[...new Set(todaySessions.map(s=>s.topic).filter(Boolean))];
  const qS=todaySessions.reduce((a,b)=>a+Number(b.qSolved||0),0), qC=todaySessions.reduce((a,b)=>a+Number(b.qCorrect||0),0);
  const acc=qS?(qC/qS*100).toFixed(0)+'%':'—';
  const weak=allTopics().filter(t=>t.confidence<=2).map(t=>t.name).slice(0,5);

  const curWeekStart=weekStartOf(today);
  const curStats=computeWeekStats(curWeekStart);
  const prevStats=computeWeekStats(addDaysStr(curWeekStart,-7));
  const cmp=weekComparison(curStats,prevStats);

  const monthAgo=new Date(); monthAgo.setDate(new Date().getDate()-30);
  const monthSessions=DB.sessions.filter(s=>new Date(s.date)>=monthAgo);
  const monthHours=monthSessions.reduce((a,b)=>a+Number(b.hours||0),0);
  const monthMocks=DB.mocks.filter(m=>new Date(m.date)>=monthAgo);

  const archiveCount=(DB.weeklyReports||[]).length;

  return `
  <div class="section-title"><h2>Smart Recommendations</h2><span class="hint">Auto-generated from your logged data</span></div>
  <div class="card">${dailyRecommendations().map(r=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">💡 ${esc(r)}</div>`).join('')}</div>

  <div class="section-title"><h2>Today's Summary</h2></div>
  <div class="card review-block">Hours studied: ${th.toFixed(1)}h
Topics covered: ${topicsCovered.length?topicsCovered.join(', '):'None logged'}
Accuracy: ${acc}
Weak areas to watch: ${weak.length?weak.join(', '):'None flagged'}
Missed goals: ${DB.goals.filter(g=>g.type==='Daily'&&g.status!=='Completed').length} daily goal(s) still open
Suggestion: ${th<todayTarget()?"You are below today's target — consider a short focused session before bed.":"Target met — use spare time for revision."}</div>

  <div class="section-title">
    <h2>Weekly Report</h2>
    <span class="hint">Sun ${curStats.weekStart} → Sat ${curStats.weekEnd} · current week</span>
  </div>
  <div class="flexbetween" style="margin:-4px 0 14px;">
    <span class="sub">A new report period starts every Sunday. Nothing here overwrites a previous week.</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn ghost sm" data-action="viewWeeklyArchive">📂 Past Reports (${archiveCount})</button>
      <button class="btn sm" data-action="takeWeeklySnapshot">📸 Take Snapshot</button>
    </div>
  </div>
  ${renderWeekStatsHTML(curStats,cmp)}

  <div class="section-title"><h2>Monthly Review</h2></div>
  <div class="card review-block">Study hours (30d): ${monthHours.toFixed(1)}h
Syllabus completion: ${syllabusPct().toFixed(1)}%
Revision completion: ${revisionPct().toFixed(1)}%
Mock tests this month: ${monthMocks.length}${monthMocks.length?', avg score '+(monthMocks.reduce((a,b)=>a+Number(b.score||0),0)/monthMocks.length).toFixed(1):''}
Top achievement: ${totalHours()>=100?'Crossed 100 hours total':'Building the habit foundation'}
Next month goal: Push syllabus completion past ${Math.min(100,Math.ceil(syllabusPct()/10)*10+10)}%</div>
  `;
}

/* ================= SETTINGS ================= */
function renderSettingsPage(){
  const dark=document.documentElement.classList.contains('dark');
  const accent=DB.meta.accent||'violet';
  const swatches=[['violet','#a855f7'],['pink','#ec4899'],['blue','#3b82f6'],['green','#22c55e']];
  return `
  <div class="section-title"><h2>Appearance</h2></div>
  <div class="card">
    <div class="settings-row">
      <div><div class="srlabel">Theme</div><div class="srhint">Toggle light / dark mode</div></div>
      <button class="btn ghost sm" data-action="toggleDark">${dark?'☀ Light Mode':'🌙 Dark Mode'}</button>
    </div>
    <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
      <div><div class="srlabel">Accent Color</div><div class="srhint">Pick the premium accent used across the app</div></div>
      <div class="swatch-row">
        ${swatches.map(([key,hex])=>`<button class="swatch ${accent===key?'active':''}" style="background:${hex};" data-action="setAccent" data-accent="${key}" title="${key}"></button>`).join('')}
      </div>
    </div>
  </div>

  <div class="section-title"><h2>Study Defaults</h2></div>
  <div class="card">
    <div class="settings-row">
      <div><div class="srlabel">Default Daily Hours</div><div class="srhint">Used as today's target on the Dashboard, unless overridden for a specific day</div></div>
      <input type="number" step="0.5" min="1" style="width:70px;" value="${DB.meta.targetHoursToday}" data-action="setTarget">
    </div>
    <div class="settings-row">
      <div><div class="srlabel">Lifetime Question Target</div><div class="srhint">Your long-term question-solving goal</div></div>
      <input type="number" step="500" min="1" style="width:90px;" value="${DB.meta.questionTarget}" data-action="setQuestionTarget">
    </div>
    <div class="settings-row">
      <div><div class="srlabel">Mock Test Target Score</div><div class="srhint">Used in the exam readiness calculation</div></div>
      <input type="number" style="width:70px;" value="${DB.meta.mockTargetScore}" data-action="setMockTarget">
    </div>
  </div>

  <div class="section-title"><h2>Study Session (Pomodoro) Behavior</h2></div>
  <div class="card">
    <div class="settings-row">
      <div><div class="srlabel">Study / Break durations</div><div class="srhint">Set from the Study Session card on the Dashboard</div></div>
      <button class="btn ghost sm" data-action="tab" data-tab="dashboard">Go to Dashboard</button>
    </div>
    <div class="settings-row">
      <div><div class="srlabel">Auto-switch Study ↔ Break</div><div class="srhint">Automatically start the next session when the timer ends</div></div>
      <label class="checkbox-row"><input type="checkbox" data-action="togglePomoAuto" ${DB.meta.pomoAutoTransition?'checked':''}></label>
    </div>
    <div class="settings-row">
      <div><div class="srlabel">Sound Notification</div><div class="srhint">Play a short beep when a session ends</div></div>
      <label class="checkbox-row"><input type="checkbox" data-action="togglePomoSound" ${DB.meta.pomoSound?'checked':''}></label>
    </div>
    <div class="settings-row">
      <div><div class="srlabel">Browser Notification</div><div class="srhint">Show a system notification when a session ends and the tab isn't active</div></div>
      <label class="checkbox-row"><input type="checkbox" data-action="togglePomoNotify" ${DB.meta.pomoNotify?'checked':''}></label>
    </div>
  </div>

  <div class="section-title"><h2>Subjects</h2></div>
  <div class="card">
    <div class="settings-row">
      <div><div class="srlabel">Manage Subjects</div><div class="srhint">Add, edit, reorder, or delete subjects from the Study → Subjects tab</div></div>
      <button class="btn ghost sm" data-action="goSubjects">Go to Subjects</button>
    </div>
  </div>

  <div class="section-title"><h2>Backup</h2></div>
  <div class="card">
    <div class="settings-row">
      <div><div class="srlabel">Export</div><div class="srhint">Download all your data as a JSON backup file</div></div>
      <button class="btn ghost sm" data-action="exportData">Download JSON backup</button>
    </div>
    <div class="settings-row">
      <div><div class="srlabel">Import / Restore</div><div class="srhint">Restore from a previously exported JSON backup</div></div>
      <label class="btn ghost sm" style="cursor:pointer;">Choose File<input type="file" id="importFile" accept="application/json" style="display:none;" data-action="importData"></label>
    </div>
  </div>

  <div class="section-title"><h2>Danger Zone</h2></div>
  <div class="danger-zone">
    <div class="flexbetween">
      <div><div class="label">Reset All Data</div><div class="srhint" style="margin-top:4px;">Permanently erases everything and starts fresh. This cannot be undone.</div></div>
      <button class="btn danger sm" data-action="resetData">Reset Data</button>
    </div>
  </div>

  <div class="version-tag">AtlasTrackIt · v1.2.0</div>
  `;
}
function fmtTime(sec){sec=Math.max(0,Math.round(sec));const m=Math.floor(sec/60).toString().padStart(2,'0');const s=(sec%60).toString().padStart(2,'0');return m+':'+s;}
function fmtHMS(sec){const h=Math.floor(sec/3600).toString().padStart(2,'0');const m=Math.floor((sec%3600)/60).toString().padStart(2,'0');const s=Math.floor(sec%60).toString().padStart(2,'0');return h+':'+m+':'+s;}
function fmtHrsMin(hrs){const h=Math.floor(hrs);const m=Math.round((hrs-h)*60);return h+'h '+m+'m';}

/* ================= STUDY SESSION TIMER (Pomodoro) =================
   Lives on the Dashboard as a permanent card. Runs on a single global
   interval so it keeps counting while the user navigates between tabs —
   only the DOM elements it updates change based on what's currently
   rendered. State is persisted to localStorage on every tick so it
   survives a page refresh or the tab being closed and reopened. */
const POMO_LS_KEY='atlastrackit_pomo_state_v1';
let pomo={seconds:25*60,running:false,mode:'Work',interval:null,subjectKey:'',topicId:'',subtopic:'',sessionType:'Study'};
let studyTimer={seconds:0,running:false}; // tracks total elapsed "Work" seconds today, feeds the dashboard ring
function pomoSelectedTopic(){
  const key=pomo.subjectKey;
  if(!key||!DB.subjects[key])return null;
  return DB.subjects[key].topics.find(t=>t.id===pomo.topicId)||null;
}

function savePomoState(){
  try{
    localStorage.setItem(POMO_LS_KEY,JSON.stringify({
      mode:pomo.mode,seconds:pomo.seconds,running:pomo.running,
      ts:Date.now(),studySeconds:studyTimer.seconds,studyDate:todayStr(),
      subjectKey:pomo.subjectKey,topicId:pomo.topicId,subtopic:pomo.subtopic,sessionType:pomo.sessionType
    }));
  }catch(e){/* localStorage unavailable */}
}
let pomoSavedDate=null; // date the restored studyTimer.seconds belongs to (may be a previous day)
function loadPomoState(){
  try{
    const raw=localStorage.getItem(POMO_LS_KEY);
    if(!raw)return;
    const s=JSON.parse(raw);
    pomo.mode=s.mode==='Break'?'Break':'Work';
    pomo.seconds=typeof s.seconds==='number'?s.seconds:pomoDurationSeconds(pomo.mode);
    pomo.running=!!s.running;
    studyTimer.seconds=Number(s.studySeconds)||0;
    pomo.subjectKey=s.subjectKey||'';
    pomo.topicId=s.topicId||'';
    pomo.subtopic=s.subtopic||'';
    pomo.sessionType=s.sessionType==='Revision'?'Revision':'Study';
    pomoSavedDate=s.studyDate||todayStr();
    if(pomo.running&&s.ts){
      // catch up for time elapsed while the page was closed/refreshed
      const elapsed=Math.max(0,Math.floor((Date.now()-s.ts)/1000));
      if(pomo.mode==='Work')studyTimer.seconds+=elapsed;
      pomo.seconds-=elapsed;
      if(pomo.seconds<=0){
        // missed the session-end transition while away; settle into a fresh
        // session in the current mode rather than guessing how many cycles passed
        pomo.seconds=pomoDurationSeconds(pomo.mode);
        pomo.running=false;
        studyTimer.running=false;
      }
    }
  }catch(e){/* ignore malformed state */}
}
let sessionDate=null; // tracks the "current" date for an open session, used to detect midnight rollover while the app stays open
function finalizeDay(oldDate){
  if(!oldDate||oldDate===todayStr())return;
  if((DB.history||[]).some(h=>h.date===oldDate))return; // already finalized this date, avoid double-counting
  // flush any live, not-yet-logged Pomodoro time for the old day into a real session
  // so it counts toward Total Study Hours / Streak / History, then clear the live counter
  if(studyTimer.seconds>0){
    DB.sessions.push({id:uid(),date:oldDate,start:'',end:'',hours:+(studyTimer.seconds/3600).toFixed(4),
      subject:subjectKeys()[0]||'',topic:'Pomodoro Session',subtopic:'',qSolved:0,qCorrect:0,qWrong:0,
      source:'Pomodoro timer',mood:'Okay',energy:'Medium',focus:3,distractions:'',breakMin:0,
      revisionDone:false,mockDone:false,wins:'',problems:'',tomorrow:'',quickEdit:true,pomoLogged:true});
  }
  const studyHours=hoursOn(oldDate);
  const target=effectiveTargetFor(oldDate);
  const goalPct=target?Math.min(100,Math.round(studyHours/target*100)):0;
  const questionsSolved=questionsOn(oldDate);
  const revisionsCompleted=allTopics().filter(t=>t.lastRevisionDate===oldDate).length;
  DB.history=(DB.history||[]).filter(h=>h.date!==oldDate);
  DB.history.push({date:oldDate,studyHours,goalPct,questionsSolved,revisionsCompleted});
  DB.history.sort((a,b)=>b.date.localeCompare(a.date));
  if(DB.history.length>120)DB.history=DB.history.slice(0,120);
  // reset only today's live counters — subjects, topics, streak, goals, mocks, totals are untouched
  studyTimer.seconds=0; studyTimer.running=false;
  clearInterval(pomo.interval); pomo.running=false; pomo.mode='Work'; pomo.seconds=pomoDurationSeconds('Work');
  savePomoState(); scheduleSave();
}
function checkDayRollover(){
  const today=todayStr();
  if(sessionDate&&sessionDate!==today){
    finalizeDay(sessionDate); // flush any live pomodoro time into a session first, so it counts
    archivePreviousWeekIfNeeded(sessionDate,today);
    sessionDate=today;
    render();
  }
}
/* Auto-archives the just-finished Sun→Sat week the first time the app is opened
   after it ends. Never overwrites an existing 'completed' entry for that week —
   if several weeks pass while the app is unopened, only the most recent boundary
   crossed is archived (same limitation finalizeDay already has for single days). */
function archivePreviousWeekIfNeeded(oldDateStr,newDateStr){
  const oldWeekStart=weekStartOf(oldDateStr);
  if(oldWeekStart===weekStartOf(newDateStr))return;
  DB.weeklyReports=DB.weeklyReports||[];
  if(DB.weeklyReports.some(w=>w.weekStart===oldWeekStart&&w.kind==='completed'))return;
  const stats=computeWeekStats(oldWeekStart);
  const prevStats=computeWeekStats(addDaysStr(oldWeekStart,-7));
  DB.weeklyReports.push({id:uid(),weekStart:oldWeekStart,weekEnd:weekEndOf(oldWeekStart),savedAt:new Date().toISOString(),kind:'completed',stats,prevStats});
  DB.weeklyReports.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
  scheduleSave();
}
function playBeep(){
  if(!DB.meta.pomoSound)return;
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const beepAt=(startOffset)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine'; o.frequency.value=880;
      const t=ctx.currentTime+startOffset;
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.9,t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t+0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t+0.4);
    };
    beepAt(0); beepAt(0.45); beepAt(0.9); // 3 loud beeps instead of 1 soft one
  }catch(e){/* audio not available */}
}
function notifySessionEnd(nextMode){
  if(!DB.meta.pomoNotify)return;
  if(typeof Notification==='undefined')return;
  if(!document.hidden)return; // only notify when the tab isn't active
  const fire=()=>new Notification('AtlasTrackIt',{body:nextMode==='Break'?'Study session complete — time for a break!':'Break over — back to studying.'});
  if(Notification.permission==='granted')fire();
  else if(Notification.permission!=='denied')Notification.requestPermission().then(p=>{if(p==='granted')fire();});
}
function pomoDurationSeconds(mode){return (mode==='Work'?(DB.meta.pomoWork||25):(DB.meta.pomoBreak||5))*60;}
function logTopicRevision(topic){
  if(!topic||topic.revisions>=5)return false;
  topic.revisions++; topic.lastRevisionDate=todayStr();
  if(topic.status==='Completed')topic.status='Revised';
  return true;
}
/* ================= CELEBRATIONS (quick, cute, non-blocking) ================= */
function celebrate(msg,emoji){
  const el=document.createElement('div');
  el.className='celebrate-toast';
  el.innerHTML=`<span class="ce-emoji">${emoji||'🎉'}</span><span>${esc(msg)}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  spawnConfetti();
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),300); },1500);
}
function spawnConfetti(){
  const colors=['#a855f7','#ec4899','#22c55e','#3b82f6','#f59e0b'];
  for(let i=0;i<16;i++){
    const p=document.createElement('span');
    p.className='confetti-piece';
    p.style.left=(50+(Math.random()*44-22))+'vw';
    p.style.background=colors[i%colors.length];
    p.style.animationDelay=(Math.random()*0.15)+'s';
    p.style.setProperty('--rot',(Math.random()*360)+'deg');
    p.style.setProperty('--drift',(Math.random()*70-35)+'px');
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),1300);
  }
}
/* Compares currently-unlocked badges against what's already been celebrated
   (persisted in DB.meta.seenBadges) and fires a toast for any newly earned
   one. Cheap to run every render — just a small array diff. */
function checkBadgeUnlocks(){
  const list=badgeList();
  DB.meta.seenBadges=DB.meta.seenBadges||[];
  const newlyUnlocked=list.filter(b=>b.unlocked&&!DB.meta.seenBadges.includes(b.label));
  if(newlyUnlocked.length===0)return;
  DB.meta.seenBadges=[...DB.meta.seenBadges,...newlyUnlocked.map(b=>b.label)];
  scheduleSave();
  newlyUnlocked.forEach((b,i)=>setTimeout(()=>celebrate('Badge unlocked: '+b.label,b.ic),i*900));
}
function logCompletedWorkBlock(){
  if(studyTimer.seconds<=0)return false;
  const topic=pomoSelectedTopic();
  const isRevision=pomo.sessionType==='Revision';
  DB.sessions.push({id:uid(),date:todayStr(),start:'',end:'',hours:+(studyTimer.seconds/3600).toFixed(4),
    subject:pomo.subjectKey||subjectKeys()[0]||'',topic:topic?topic.name:'General Study',subtopic:pomo.subtopic||'',
    qSolved:0,qCorrect:0,qWrong:0,source:'Pomodoro timer',mood:'Okay',energy:'Medium',focus:3,distractions:'',
    breakMin:0,revisionDone:isRevision,mockDone:false,wins:'',problems:'',tomorrow:'',quickEdit:true,pomoLogged:true});
  if(isRevision&&topic)logTopicRevision(topic);
  studyTimer.seconds=0;
  scheduleSave();
  return true;
}
function pomoTick(){
  checkDayRollover();
  pomo.seconds--;
  if(pomo.mode==='Work'&&studyTimer.running)studyTimer.seconds++;
  if(pomo.seconds<=0){
    playBeep();
    const finishedMode=pomo.mode;
    const nextMode=finishedMode==='Work'?'Break':'Work';
    notifySessionEnd(nextMode);
    if(finishedMode==='Work'){ if(logCompletedWorkBlock())celebrate('Focus session complete!','⏱'); }
    if(DB.meta.pomoAutoTransition){
      pomo.mode=nextMode; pomo.seconds=pomoDurationSeconds(nextMode);
      studyTimer.running=(nextMode==='Work');
    }else{
      pomo.running=false; clearInterval(pomo.interval);
      pomo.mode=nextMode; pomo.seconds=pomoDurationSeconds(nextMode);
      studyTimer.running=false;
    }
  }
  // updateStudySessionUI() only touches elements that exist while the Dashboard
  // is the active tab — but wrapping it defensively means a UI-sync issue can
  // never interrupt the tick itself or the state save that follows it, on any tab.
  try{ updateStudySessionUI(); }catch(e){ /* ignore — the timer state above is unaffected */ }
  savePomoState();
}
function beginOrPauseStudySession(){
  if(pomo.running){ pomoStartPause(); return; }
  if(pomo.mode==='Break'){ pomoStartPause(); return; } // resuming a break needs no subject picker
  if(studyTimer.seconds>0){ pomoStartPause(); return; } // resuming a paused, not-yet-logged work block
  openStartSessionModal();
}
function openStartSessionModal(subjectKeyOverride){
  const keys=subjectKeys();
  const key=subjectKeyOverride||pomo.subjectKey||keys[0]||'';
  const topics=(key&&DB.subjects[key])?DB.subjects[key].topics:[];
  openModal(`<h3>Start Study Session</h3>
  <p class="sub" style="margin:0 0 10px;">Pick what you're studying — starting will mark the topic In Progress, and the session is saved automatically once it's complete.</p>
  <div class="formgrid" style="grid-template-columns:1fr;">
    <label>Subject
      <select id="ss_subject" data-action="refreshStartSessionModal">
        ${keys.length===0?'<option value="">No subjects yet</option>':keys.map(k=>`<option value="${k}" ${key===k?'selected':''}>${esc(subjLabel(k))}</option>`).join('')}
      </select>
    </label>
    <label>Topic
      <select id="ss_topic">
        <option value="">— none / general study —</option>
        ${topics.map(t=>`<option value="${t.id}" ${pomo.topicId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
        <option value="__new__">+ Add new topic…</option>
      </select>
    </label>
    <label id="ss_newtopic_wrap" style="display:none;">New topic name <input type="text" id="ss_newtopic" placeholder="e.g. Thermodynamics"></label>
    <label>Subtopic (optional) <input type="text" id="ss_subtopic" placeholder="e.g. Laws of Thermodynamics" value="${esc(pomo.subtopic||'')}"></label>
  </div>
  <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="confirmStartSession">Start Session</button></div>`);
}
function pomoStartPause(){
  pomo.running=!pomo.running;
  clearInterval(pomo.interval); // always clear first — guards against ever accidentally stacking a duplicate interval
  if(pomo.running){
    if(pomo.mode==='Work')studyTimer.running=true;
    pomo.interval=setInterval(pomoTick,1000);
    const topic=pomoSelectedTopic();
    if(pomo.sessionType!=='Revision'&&topic&&topic.status==='Not Started'){ topic.status='In Progress'; scheduleSave(); }
  }else{
    studyTimer.running=false;
  }
  updateStudySessionUI();
  savePomoState();
}
function pomoReset(){
  clearInterval(pomo.interval); pomo.running=false; studyTimer.running=false;
  pomo.mode='Work'; pomo.seconds=pomoDurationSeconds('Work');
  updateStudySessionUI();
  savePomoState();
}
function updateStudySessionUI(){
  const timerEl=document.getElementById('studySessionTimer'); if(timerEl)timerEl.textContent=fmtTime(pomo.seconds);
  const modeEl=document.getElementById('studySessionMode'); if(modeEl)modeEl.textContent=pomo.mode==='Work'?'🎯 Study Session':'☕ Break';
  const startBtn=document.getElementById('studySessionStartBtn'); if(startBtn)startBtn.textContent=pomo.running?'Pause':'Start';
  const totalEl=document.getElementById('studySessionTotal'); if(totalEl)totalEl.textContent='Today: '+fmtHrsMin(todayStudyTime());
  // keep the Today's Goal ring in sync live, without a full re-render
  const goalValueEl=document.getElementById('todayGoalValue');
  if(goalValueEl)goalValueEl.textContent=todayStudyTime().toFixed(1)+'h';
  const ringWrap=document.getElementById('todayRingWrap');
  if(ringWrap){
    const target=todayTarget();
    const pct=Math.min(100,target?todayStudyTime()/target*100:0);
    const circle=ringWrap.querySelector('.ring-progress');
    if(circle){
      const r=Number(circle.getAttribute('r'))||50, c=2*Math.PI*r;
      circle.setAttribute('stroke-dashoffset',c-(pct/100)*c);
    }
    const b=ringWrap.querySelector('.ring-label b')||ringWrap.parentElement.querySelector('.ring-label b');
    if(b)b.textContent=todayStudyTime().toFixed(1)+'h';
  }
}

/* ================= MODAL ================= */
function openModal(html,wide){document.getElementById('modalRoot').innerHTML=`<div class="modal-overlay" data-action="closeModalBg"><div class="modal${wide?' wide':''}" data-stop>${html}</div></div>`;}
function closeModal(){document.getElementById('modalRoot').innerHTML='';}

/* ================= MOBILE SIDEBAR ================= */
function openMobileSidebar(){document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('show');}
function closeMobileSidebar(){document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('show');}

/* ================= EVENT HANDLING ================= */
// 'toggle' events on <details> don't bubble, so this must be a capturing listener
// to catch it via delegation. Keeps the Session Settings panel's open/closed state
// stable across the full-DOM re-renders that happen when a field inside it changes.
document.addEventListener('toggle', e=>{
  if(e.target && e.target.classList && e.target.classList.contains('session-settings')){
    heroSettingsOpen=e.target.open;
  }
}, true);
document.addEventListener('click',e=>{
  if(e.target.closest('[data-stop]') && e.target.closest('.modal-overlay') && !e.target.closest('[data-action]')) return;
  const bg=e.target.closest('[data-action="closeModalBg"]');
  if(bg && e.target===bg){closeModal();return;}
  if(e.target.id==='sidebarOverlay'){closeMobileSidebar();return;}
  const btn=e.target.closest('[data-action]');
  if(!btn)return;
  const action=btn.dataset.action;
  handleAction(action,btn);
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.action==='tab'){/* handled in click */}
  if(t.dataset.field && t.dataset.topic){ handleTopicField(t); }
  if(t.dataset.action==='goalStatus'){ const g=DB.goals.find(x=>x.id===t.dataset.id); const wasCompleted=g.status==='Completed'; g.status=t.value; if(!wasCompleted&&g.status==='Completed')celebrate('Goal complete: '+g.text,'🏆'); scheduleSave(); render(); }
  if(t.dataset.action==='goalProgress'){ const g=DB.goals.find(x=>x.id===t.dataset.id); const was100=g.progress>=100; g.progress=Number(t.value); if(!was100&&g.progress>=100)celebrate('Goal complete: '+g.text,'🏆'); scheduleSave(); render(); }
  if(t.dataset.action==='setPriority'){ DB.subjects[t.dataset.key].priority=t.value; scheduleSave(); render(); }
  if(t.dataset.action==='setTarget'){ DB.meta.targetHoursToday=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='setQuestionTarget'){ DB.meta.questionTarget=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='setMockTarget'){ DB.meta.mockTargetScore=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='toggleTask'){ const d=todayStr(); const task=(DB.tasks[d]||[]).find(x=>x.id===t.dataset.id); if(task){task.done=t.checked; scheduleSave(); render();} }
  if(t.id==='ss_topic'){ const w=document.getElementById('ss_newtopic_wrap'); if(w)w.style.display=(t.value==='__new__')?'flex':'none'; }
  if(t.dataset.action==='setPomoSubtopic'){ pomo.subtopic=t.value; savePomoState(); }
  if(t.dataset.action==='setPomoWork'){ DB.meta.pomoWork=Number(t.value)||25; if(!pomo.running&&pomo.mode==='Work'){pomo.seconds=DB.meta.pomoWork*60;} scheduleSave(); savePomoState(); render(); }
  if(t.dataset.action==='setPomoBreak'){ DB.meta.pomoBreak=Number(t.value)||5; if(!pomo.running&&pomo.mode==='Break'){pomo.seconds=DB.meta.pomoBreak*60;} scheduleSave(); savePomoState(); render(); }
  if(t.dataset.action==='togglePomoAuto'){ DB.meta.pomoAutoTransition=t.checked; scheduleSave(); }
  if(t.dataset.action==='togglePomoSound'){ DB.meta.pomoSound=t.checked; scheduleSave(); }
  if(t.dataset.action==='togglePomoNotify'){
    DB.meta.pomoNotify=t.checked; scheduleSave();
    if(t.checked && typeof Notification!=='undefined' && Notification.permission==='default')Notification.requestPermission();
  }
  if(t.id==='importFile'){ importDataFromFile(t); }
});

function handleTopicField(t){
  const key=t.dataset.key, topicId=t.dataset.topic, field=t.dataset.field;
  const subj=DB.subjects[key]; if(!subj)return;
  const topic=subj.topics.find(x=>x.id===topicId); if(!topic)return;
  let val=t.value;
  if((field==='targetDate'||field==='completionDate') && val && val<MIN_DATE){
    alert('Dates before 1 January 2026 are not allowed for '+(field==='targetDate'?'Target Date':'Completion Date')+'. Resetting to 1 January 2026.');
    val=MIN_DATE; t.value=val;
  }
  if(field==='timeSpent'||field==='confidence')val=Number(val);
  topic[field]=val;
  if(field==='status'&&val==='Completed'&&!topic.completionDate)topic.completionDate=todayStr();
  scheduleSave();
  // lightweight: just update the header stats without full table rebuild loss of focus (safe since selects not text)
  render();
}

function handleAction(action,btn){
  const d=btn.dataset;
  if(action==='tab'){currentTab=d.tab; openSubject=null; render(); return;}
  if(action==='subtab'){currentSubtab[d.tabgroup]=d.sub; openSubject=null; render(); return;}
  if(action==='setGoalTypeFilter'){goalTypeFilter=d.type; render(); return;}
  if(action==='openMobileSidebar'){openMobileSidebar(); return;}
  if(action==='closeMobileSidebar'){closeMobileSidebar(); return;}
  if(action==='setAccent'){DB.meta.accent=d.accent; document.documentElement.setAttribute('data-accent',d.accent); scheduleSave(); render(); return;}
  if(action==='resetData'){
    if(!confirm('This will permanently erase all your data and cannot be undone. Continue?'))return;
    clearInterval(pomo.interval);
    DB=defaultState(); pomo.mode='Work'; pomo.seconds=pomoDurationSeconds('Work'); pomo.running=false; studyTimer={seconds:0,running:false};
    savePomoState(); scheduleSave(); render(); return;
  }
  if(action==='toggleDark'){document.documentElement.classList.toggle('dark'); DB.meta.dark=document.documentElement.classList.contains('dark'); scheduleSave(); return;}
  if(action==='openHistory'){
    const rows=(DB.history||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
    openModal(`<h3>📅 Study History</h3>
    <p class="sub" style="margin:0 0 10px;">A saved summary of every completed day.</p>
    ${rows.length===0?'<div class="emptystate">No completed days recorded yet. Check back after your first full day.</div>':`
    <div style="max-height:60vh;overflow:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border);">
        <th style="padding:6px 4px;">Date</th><th style="padding:6px 4px;">Goal</th><th style="padding:6px 4px;">Study Time</th><th style="padding:6px 4px;">Questions</th><th style="padding:6px 4px;">Revisions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r=>`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 4px;">${esc(r.date)}</td>
          <td style="padding:6px 4px;">${r.goalPct}%</td>
          <td style="padding:6px 4px;">${fmtHrsMin(r.studyHours)}</td>
          <td style="padding:6px 4px;">${r.questionsSolved}</td>
          <td style="padding:6px 4px;">${r.revisionsCompleted}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
    <div class="row" style="margin-top:12px;"><button class="btn ghost" data-action="closeModal">Close</button></div>`);
    return;
  }
  if(action==='goSubjects'){currentTab='study'; currentSubtab.study='subjects'; openSubject=null; render(); return;}
  if(action==='goRevision'){currentTab='dashboard'; render(); return;}
  if(action==='quickStartStudy'){ beginOrPauseStudySession(); currentTab='dashboard'; render(); return; }
  if(action==='openSubject'){openSubject=d.key; render(); return;}
  if(action==='closeSubject'){openSubject=null; render(); return;}
  if(action==='addRevision'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    if(logTopicRevision(topic)){ celebrate('Revised: '+topic.name,'🔁'); scheduleSave(); render(); }
    return;
  }
  if(action==='openEditRevisions'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    openModal(`<h3>Revisions — ${esc(topic.name)}</h3>
    <p class="sub" style="margin:0 0 10px;">Set exactly how many times you've revised this topic (0–5).</p>
    <input type="number" min="0" max="5" id="revCountInput" value="${topic.revisions}" style="width:100%;">
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveEditRevisions" data-key="${d.key}" data-topic="${d.topic}">Save</button></div>`);
    return;
  }
  if(action==='saveEditRevisions'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    let val=Number(document.getElementById('revCountInput').value);
    if(isNaN(val))val=0;
    val=Math.max(0,Math.min(5,Math.round(val)));
    const increased=val>topic.revisions;
    topic.revisions=val;
    if(val===0){ topic.lastRevisionDate=''; if(topic.status==='Revised')topic.status='Completed'; }
    else{ if(increased)topic.lastRevisionDate=todayStr(); if(topic.status==='Completed')topic.status='Revised'; }
    scheduleSave(); closeModal(); render(); return;
  }
  /* ---- Scheduler: freeform or topic-linked revisions, and planned study sessions ---- */
  if(action==='viewFullScheduler'){
    openModal(`<div class="flexbetween" style="margin-bottom:10px;"><h3 style="margin:0;">📅 Full Scheduler</h3><button class="btn sm" data-action="openAddCustomRevision">+ Add / Schedule Item</button></div>
    <div style="max-height:68vh;overflow-y:auto;">${renderDashboardRevisions()}</div>
    <div class="row" style="margin-top:14px;"><button class="btn ghost" data-action="closeModal">Close</button></div>`, true);
    return;
  }
  if(action==='openAddCustomRevision'){
    openModal(`<h3>Plan a Revision or Study Session</h3>
    <div class="formgrid" style="grid-template-columns:1fr;">
      <label>Type
        <select id="cr_kind">
          <option value="revision">🔁 Revision</option>
          <option value="session">📖 Study Session</option>
        </select>
      </label>
      <label>Link to a tracked topic (optional)
        <select id="cr_topic">
          <option value="">— freeform, not linked —</option>
          ${subjectKeys().map(k=>`<optgroup label="${esc(subjLabel(k))}">${(DB.subjects[k].topics||[]).map(t=>`<option value="${k}|${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>`).join('')}
        </select>
      </label>
      <label>Topic / Item (used if not linked above) <input type="text" id="cr_text" placeholder="e.g. Percentage formulas, Chapter 5, or a quick note"></label>
      <label>Due Date <input type="date" id="cr_due" value="${todayStr()}" min="${MIN_DATE}"></label>
    </div>
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveCustomRevision">Save</button></div>`);
    return;
  }
  if(action==='saveCustomRevision'){
    const kind=document.getElementById('cr_kind').value==='session'?'session':'revision';
    const topicSel=document.getElementById('cr_topic').value;
    const freeText=document.getElementById('cr_text').value.trim();
    const due=document.getElementById('cr_due').value||todayStr();
    let subjectKey='',topicId='',subjectLabelText='',text=freeText;
    if(topicSel){
      const [key,tId]=topicSel.split('|');
      const topic=DB.subjects[key]&&DB.subjects[key].topics.find(t=>t.id===tId);
      if(topic){ subjectKey=key; topicId=tId; subjectLabelText=subjLabel(key); text=text||topic.name; }
    }
    if(!text){alert('Please link a topic or type something to plan.'); return;}
    DB.customRevisions=DB.customRevisions||[];
    DB.customRevisions.push({id:uid(),kind,text,subject:subjectLabelText,subjectKey,topicId,due});
    scheduleSave(); closeModal(); render(); return;
  }
  if(action==='completeCustomRevision'){
    const c=(DB.customRevisions||[]).find(x=>x.id===d.id);
    const isSession=c&&c.kind==='session';
    if(c&&!isSession&&c.topicId&&c.subjectKey&&DB.subjects[c.subjectKey]){
      const topic=DB.subjects[c.subjectKey].topics.find(t=>t.id===c.topicId);
      if(topic)logTopicRevision(topic); // counts toward that subject's revision stats
    }
    celebrate(c?(isSession?'Session done: '+c.text:'Revised: '+c.text):'Done','🎉');
    DB.customRevisions=(DB.customRevisions||[]).filter(c=>c.id!==d.id);
    scheduleSave(); render(); return;
  }
  if(action==='deleteCustomRevision'){
    if(!confirm('Remove this revision reminder?'))return;
    DB.customRevisions=(DB.customRevisions||[]).filter(c=>c.id!==d.id);
    scheduleSave(); render(); return;
  }
  if(action==='openNote'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    const field=d.field;
    openModal(`<h3>${field==='notes'?'Notes':'Mistakes'} — ${esc(topic.name)}</h3>
    <textarea id="modalTextarea">${esc(topic[field])}</textarea>
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveNote" data-key="${d.key}" data-topic="${d.topic}" data-field="${field}">Save</button></div>`);
    return;
  }
  if(action==='closeModal'){closeModal();return;}
  if(action==='saveNote'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    topic[d.field]=document.getElementById('modalTextarea').value;
    scheduleSave(); closeModal(); render(); return;
  }
  /* ---- Today's target quick editor ---- */
  if(action==='editTodayTarget'){
    const today=todayStr();
    const cur=DB.dailyTargets[today]!==undefined&&DB.dailyTargets[today]!==null&&DB.dailyTargets[today]!==''?DB.dailyTargets[today]:'';
    openModal(`<h3>Edit Today's Target</h3>
    <p class="sub" style="margin:0 0 10px;">Default daily target: ${DB.meta.targetHoursToday}h. Leave blank to use the default.</p>
    <input type="number" step="0.5" min="0" id="todayTargetInput" placeholder="e.g. 5" value="${cur}" style="width:100%;">
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveTodayTarget">Save</button></div>`);
    return;
  }
  if(action==='saveTodayTarget'){
    const v=document.getElementById('todayTargetInput').value;
    const today=todayStr();
    if(v===''||v===null)delete DB.dailyTargets[today]; else DB.dailyTargets[today]=Number(v);
    scheduleSave(); closeModal(); render(); return;
  }
  /* ---- Today's questions solved quick editor ---- */
  if(action==='editQuestionsToday'){
    openModal(`<h3>Update Today's Question Count</h3>
    <p class="sub" style="margin:0 0 10px;">Set the total number of questions you've solved today.</p>
    <input type="number" min="0" id="questionsTodayInput" placeholder="e.g. 125" value="${questionsOn(todayStr())}" style="width:100%;">
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveQuestionsToday">Save</button></div>`);
    return;
  }
  if(action==='saveQuestionsToday'){
    const newTotal=Math.max(0,Number(document.getElementById('questionsTodayInput').value)||0);
    const today=todayStr();
    const base=questionsOnExcludingQuickEdit(today);
    const diff=newTotal-base;
    let qe=DB.sessions.find(s=>s.date===today&&s.quickEdit);
    if(diff===0){
      if(qe)DB.sessions=DB.sessions.filter(s=>s!==qe);
    }else if(qe){
      qe.qSolved=diff;
    }else{
      DB.sessions.push({id:uid(),date:today,start:'',end:'',hours:0,subject:subjectKeys()[0]||'',topic:'Quick Update',subtopic:'',
        qSolved:diff,qCorrect:0,qWrong:0,source:'Dashboard quick edit',mood:'Okay',energy:'Medium',focus:3,
        distractions:'',breakMin:0,revisionDone:false,mockDone:false,wins:'',problems:'',tomorrow:'',quickEdit:true});
    }
    scheduleSave(); closeModal(); render(); return;
  }
  /* ---- Subject management ---- */
  if(action==='openAddSubject'){
    openModal(`<h3>Add Subject</h3>
    <div class="formgrid" style="grid-template-columns:1fr;">
      <label>Subject Name <input type="text" id="subjNameInput" placeholder="e.g. Programming"></label>
      <label>Icon (emoji) <input type="text" id="subjIconInput" placeholder="💻" maxlength="4"></label>
      <label>Accent Color <input type="color" id="subjColorInput" value="${DEFAULT_SUBJECT_COLORS[subjectKeys().length%DEFAULT_SUBJECT_COLORS.length]}" style="width:100%;height:36px;padding:2px;"></label>
    </div>
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveNewSubject">Add Subject</button></div>`);
    return;
  }
  if(action==='saveNewSubject'){
    const name=document.getElementById('subjNameInput').value.trim();
    if(!name){alert('Please enter a subject name.'); return;}
    const icon=document.getElementById('subjIconInput').value.trim()||DEFAULT_TOPIC_ICON;
    const color=document.getElementById('subjColorInput').value||'';
    const key=uid();
    DB.subjects[key]={priority:'Medium',topics:[],name,icon,color,builtin:false};
    DB.subjectOrder.push(key);
    scheduleSave(); closeModal(); openSubject=null; render(); return;
  }
  if(action==='openEditSubject'){
    const s=DB.subjects[d.key];
    openModal(`<h3>Edit Subject</h3>
    <div class="formgrid" style="grid-template-columns:1fr;">
      <label>Subject Name <input type="text" id="subjNameInput" value="${esc(subjLabel(d.key))}"></label>
      <label>Icon (emoji) <input type="text" id="subjIconInput" value="${esc(subjIcon(d.key))}" maxlength="4"></label>
      <label>Accent Color <input type="color" id="subjColorInput" value="${subjColor(d.key)||'#a855f7'}" style="width:100%;height:36px;padding:2px;"></label>
    </div>
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveEditSubject" data-key="${d.key}">Save Changes</button></div>`);
    return;
  }
  if(action==='saveEditSubject'){
    const name=document.getElementById('subjNameInput').value.trim();
    if(!name){alert('Please enter a subject name.'); return;}
    const s=DB.subjects[d.key];
    s.name=name;
    s.icon=document.getElementById('subjIconInput').value.trim()||DEFAULT_TOPIC_ICON;
    s.color=document.getElementById('subjColorInput').value||'';
    scheduleSave(); closeModal(); render(); return;
  }
  if(action==='deleteSubject'){
    if(!confirm('Delete "'+subjLabel(d.key)+'" and all its topics? This cannot be undone.'))return;
    delete DB.subjects[d.key];
    DB.subjectOrder=DB.subjectOrder.filter(k=>k!==d.key);
    openSubject=null; scheduleSave(); render(); return;
  }
  /* ---- Topic management ---- */
  if(action==='openAddTopic'){
    openModal(`<h3>Add Topic</h3>
    <input type="text" id="newTopicInput" placeholder="Topic name" style="width:100%;">
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveNewTopic" data-key="${d.key}">Add Topic</button></div>`);
    return;
  }
  if(action==='saveNewTopic'){
    const name=document.getElementById('newTopicInput').value.trim();
    if(!name)return;
    DB.subjects[d.key].topics.push(freshTopic(name));
    scheduleSave(); closeModal(); render(); return;
  }
  if(action==='openEditTopicName'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    openModal(`<h3>Rename Topic</h3>
    <input type="text" id="renameTopicInput" value="${esc(topic.name)}" style="width:100%;">
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveTopicName" data-key="${d.key}" data-topic="${d.topic}">Save</button></div>`);
    return;
  }
  if(action==='saveTopicName'){
    const v=document.getElementById('renameTopicInput').value.trim();
    if(!v)return;
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    topic.name=v; scheduleSave(); closeModal(); render(); return;
  }
  if(action==='deleteTopic'){
    if(!confirm('Delete this topic? This cannot be undone.'))return;
    const subj=DB.subjects[d.key];
    subj.topics=subj.topics.filter(x=>x.id!==d.topic);
    scheduleSave(); render(); return;
  }
  if(action==='saveSession'){
    const g=id=>document.getElementById(id);
    let hours=parseFloat(g('f_hours').value);
    if((!hours||isNaN(hours)) && g('f_start').value && g('f_end').value){
      const [sh,sm]=g('f_start').value.split(':').map(Number), [eh,em]=g('f_end').value.split(':').map(Number);
      let diff=(eh*60+em)-(sh*60+sm); if(diff<0)diff+=24*60; hours=diff/60;
    }
    hours=hours||0;
    DB.sessions.push({id:uid(),date:g('f_date').value||todayStr(),start:g('f_start').value,end:g('f_end').value,hours,
      subject:g('f_subject').value,topic:g('f_topic').value,subtopic:g('f_subtopic').value,
      qSolved:Number(g('f_qSolved').value)||0,qCorrect:Number(g('f_qCorrect').value)||0,qWrong:Number(g('f_qWrong').value)||0,
      source:g('f_source').value,mood:g('f_mood').value,energy:g('f_energy').value,focus:Number(g('f_focus').value),
      distractions:g('f_distractions').value,breakMin:Number(g('f_breakMin').value)||0,
      revisionDone:g('f_revisionDone').checked,mockDone:g('f_mockDone').checked,
      wins:g('f_wins').value,problems:g('f_problems').value,tomorrow:g('f_tomorrow').value});
    delete formTemp.log; scheduleSave(); render(); return;
  }
  if(action==='deleteSession'){DB.sessions=DB.sessions.filter(s=>s.id!==d.id); scheduleSave(); render(); return;}
  if(action==='saveGoal'){
    const g=id=>document.getElementById(id);
    if(!g('g_text').value.trim())return;
    DB.goals.push({id:uid(),type:g('g_type').value,text:g('g_text').value,deadline:g('g_deadline').value,priority:g('g_priority').value,status:'Not Started',progress:0});
    delete formTemp.goal; scheduleSave(); render(); return;
  }
  if(action==='deleteGoal'){DB.goals=DB.goals.filter(x=>x.id!==d.id); scheduleSave(); render(); return;}
  if(action==='takeWeeklySnapshot'){
    const curWeekStart=weekStartOf(todayStr());
    const stats=computeWeekStats(curWeekStart);
    const prevStats=computeWeekStats(addDaysStr(curWeekStart,-7));
    DB.weeklyReports=DB.weeklyReports||[];
    DB.weeklyReports.push({id:uid(),weekStart:curWeekStart,weekEnd:weekEndOf(curWeekStart),savedAt:new Date().toISOString(),kind:'snapshot',stats,prevStats});
    DB.weeklyReports.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
    scheduleSave();
    openModal(`<h3>📸 Snapshot Saved</h3><p class="sub" style="margin:0 0 12px;">A point-in-time copy of this week's report (${stats.weekStart} → ${stats.weekEnd}) has been saved to your archive. It won't change even as you keep studying this week, and your underlying study data is untouched.</p><div class="row"><button class="btn ghost" data-action="closeModal">Close</button></div>`);
    return;
  }
  if(action==='viewWeeklyArchive'){
    const rows=(DB.weeklyReports||[]).slice().sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
    openModal(`<h3>📂 Past Weekly Reports</h3>
    <p class="sub" style="margin:0 0 10px;">Completed weeks are saved automatically; snapshots are saved manually. Nothing here is ever overwritten.</p>
    ${rows.length===0?'<div class="emptystate">No saved weekly reports yet. Check back after your first full week, or take a manual snapshot.</div>':`
    <div style="max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:8px;">
    ${rows.map(r=>`<div class="flexbetween" style="padding:10px 12px;border:1px solid var(--border);border-radius:12px;">
      <span>
        <b>${r.weekStart} → ${r.weekEnd}</b><br>
        <span class="sub">${r.kind==='snapshot'?'📸 Snapshot':'✅ Completed week'} · saved ${new Date(r.savedAt).toLocaleDateString()} · ${r.stats.hours.toFixed(1)}h logged</span>
      </span>
      <button class="btn sm ghost" data-action="viewWeeklyReportEntry" data-id="${r.id}">View</button>
    </div>`).join('')}
    </div>`}
    <div class="row"><button class="btn ghost" data-action="closeModal">Close</button></div>`,true);
    return;
  }
  if(action==='viewWeeklyReportEntry'){
    const r=(DB.weeklyReports||[]).find(x=>x.id===d.id);
    if(!r)return;
    const cmp=r.prevStats?weekComparison(r.stats,r.prevStats):null;
    openModal(`<h3>${r.kind==='snapshot'?'📸 Snapshot':'✅ Weekly Report'} — ${r.weekStart} → ${r.weekEnd}</h3>
    <p class="sub" style="margin:0 0 12px;">Saved ${new Date(r.savedAt).toLocaleString()}. This is a frozen record and will not update.</p>
    <div style="max-height:65vh;overflow:auto;">${renderWeekStatsHTML(r.stats,cmp)}</div>
    <div class="row"><button class="btn ghost" data-action="viewWeeklyArchive">← Back</button><button class="btn ghost" data-action="closeModal">Close</button></div>`,true);
    return;
  }
  if(action==='saveMock'){
    const g=id=>document.getElementById(id);
    DB.meta.mockCounter=(DB.meta.mockCounter||0)+1;
    DB.mocks.push({id:uid(),number:DB.meta.mockCounter,date:g('m_date').value||todayStr(),score:Number(g('m_score').value)||0,
      attempted:Number(g('m_attempted').value)||0,correct:Number(g('m_correct').value)||0,wrong:Number(g('m_wrong').value)||0,
      timeTaken:Number(g('m_timeTaken').value)||0,weak:g('m_weak').value,strong:g('m_strong').value,mistakes:g('m_mistakes').value,
      lessons:g('m_lessons').value,nextTarget:g('m_nextTarget').value});
    delete formTemp.mock; scheduleSave(); render(); return;
  }
  if(action==='deleteMock'){DB.mocks=DB.mocks.filter(x=>x.id!==d.id); scheduleSave(); render(); return;}
  if(action==='savePyq'){
    const g=id=>document.getElementById(id);
    if(!g('p_paper').value.trim())return;
    DB.pyq.push({id:uid(),paper:g('p_paper').value,year:g('p_year').value,score:Number(g('p_score').value)||0,accuracy:Number(g('p_accuracy').value)||0,time:Number(g('p_time').value)||0,mistakes:g('p_mistakes').value,weakChapters:g('p_weakChapters').value,status:g('p_status').value});
    delete formTemp.pyq; scheduleSave(); render(); return;
  }
  if(action==='deletePyq'){DB.pyq=DB.pyq.filter(x=>x.id!==d.id); scheduleSave(); render(); return;}
  /* ---- Study Session (Pomodoro) controls ---- */
  if(action==='pomoStart'){ beginOrPauseStudySession(); return; }
  if(action==='refreshStartSessionModal'){ openStartSessionModal(document.getElementById('ss_subject').value); return; }
  if(action==='confirmStartSession'){
    const subjKey=document.getElementById('ss_subject').value;
    let topicVal=document.getElementById('ss_topic').value;
    const subtopic=(document.getElementById('ss_subtopic').value||'').trim();
    if(topicVal==='__new__'){
      const name=(document.getElementById('ss_newtopic').value||'').trim();
      if(name&&subjKey&&DB.subjects[subjKey]){
        const nt=freshTopic(name);
        DB.subjects[subjKey].topics.push(nt);
        topicVal=nt.id;
        scheduleSave();
      }else topicVal='';
    }
    pomo.subjectKey=subjKey||''; pomo.topicId=topicVal||''; pomo.subtopic=subtopic;
    savePomoState();
    closeModal();
    pomoStartPause();
    render();
    return;
  }
  if(action==='pomoResetBtn'){
    if(!confirm('Reset the current Study Session timer?'))return;
    pomoReset(); return;
  }
  if(action==='setPomoPreset'){
    DB.meta.pomoWork=Number(d.work); DB.meta.pomoBreak=Number(d.break);
    if(!pomo.running){ pomo.mode='Work'; pomo.seconds=pomoDurationSeconds('Work'); }
    scheduleSave(); savePomoState(); render(); return;
  }
  if(action==='setPomoSubjectBtn'){ pomo.subjectKey=d.key; pomo.topicId=''; savePomoState(); render(); return; }
  if(action==='setPomoTopicBtn'){ pomo.topicId=d.id; savePomoState(); render(); return; }
  if(action==='setPomoSessionTypeBtn'){ pomo.sessionType=d.type==='Revision'?'Revision':'Study'; savePomoState(); render(); return; }
  if(action==='exportData'){
    const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='atlastrackit_backup_'+todayStr()+'.json'; a.click(); URL.revokeObjectURL(url); return;
  }
  if(action==='importData'){
    // handled on the file input's change event (see importDataFromFile)
    return;
  }
  if(action==='addTask'){
    const inp=document.getElementById('newTaskInput'); if(!inp||!inp.value.trim())return;
    const dte=todayStr(); DB.tasks[dte]=DB.tasks[dte]||[];
    DB.tasks[dte].push({id:uid(),text:inp.value.trim(),done:false});
    scheduleSave(); render(); return;
  }
  if(action==='deleteTask'){
    const dte=todayStr(); DB.tasks[dte]=(DB.tasks[dte]||[]).filter(x=>x.id!==d.id);
    scheduleSave(); render(); return;
  }
}

/* ================= SUBJECT DRAG-AND-DROP REORDERING ================= */
let dragSrcKey=null;
document.addEventListener('dragstart',e=>{
  const card=e.target.closest('[data-subj-drag]');
  if(!card)return;
  dragSrcKey=card.dataset.subjDrag;
  e.dataTransfer.effectAllowed='move';
  try{e.dataTransfer.setData('text/plain',dragSrcKey);}catch(err){}
});
document.addEventListener('dragover',e=>{
  const card=e.target.closest('[data-subj-drag]');
  if(!card)return;
  e.preventDefault();
});
document.addEventListener('drop',e=>{
  const card=e.target.closest('[data-subj-drag]');
  if(!card||!dragSrcKey)return;
  e.preventDefault();
  const targetKey=card.dataset.subjDrag;
  if(targetKey===dragSrcKey){dragSrcKey=null;return;}
  const order=DB.subjectOrder;
  const from=order.indexOf(dragSrcKey), to=order.indexOf(targetKey);
  if(from===-1||to===-1)return;
  order.splice(from,1);
  order.splice(to,0,dragSrcKey);
  dragSrcKey=null;
  scheduleSave(); render();
});
/* touch-based reordering for mobile: long-press + drag isn't trivial without a
   library, so on touch devices we offer simple "move up / move down" affordance
   via the same drag handlers where supported; most modern mobile browsers
   support HTML5 DnD polyfilled by touch, so the above handlers degrade gracefully. */

/* ================= SEARCH ================= */
/* ================= CHARTS ================= */
function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function afterRenderHooks(){
  // Chart.js defaults to dark gray axis/legend text, which is unreadable on
  // dark cards. This was already true before the v3 visual pass — fixing it
  // here since it's a pure readability/color setting, not a data change.
  const isDark=document.documentElement.classList.contains('dark');
  if(typeof Chart!=='undefined'){
    Chart.defaults.color=isDark?'#a79fc9':'#665c85';
    Chart.defaults.borderColor=isDark?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)';
  }
  if(currentTab==='mocks'&&currentSubtab.mocks==='mocks'&&DB.mocks.length>=2){
    const sorted=[...DB.mocks].sort((a,b)=>a.number-b.number);
    destroyChart('mockScoreChart'); destroyChart('mockAccChart');
    const ctx1=document.getElementById('mockScoreChart'); const ctx2=document.getElementById('mockAccChart');
    if(ctx1)charts.mockScoreChart=new Chart(ctx1,{type:'line',data:{labels:sorted.map(m=>'M'+m.number),datasets:[{label:'Score',data:sorted.map(m=>m.score),borderColor:'#a855f7',backgroundColor:'rgba(168,85,247,.15)',tension:.3,fill:true}]},options:{plugins:{legend:{display:false},title:{display:true,text:'Score Improvement'}},scales:{y:{beginAtZero:true}}}});
    if(ctx2)charts.mockAccChart=new Chart(ctx2,{type:'line',data:{labels:sorted.map(m=>'M'+m.number),datasets:[{label:'Accuracy %',data:sorted.map(m=>m.attempted?(m.correct/m.attempted*100).toFixed(1):0),borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,.15)',tension:.3,fill:true}]},options:{plugins:{legend:{display:false},title:{display:true,text:'Accuracy Trend'}},scales:{y:{beginAtZero:true,max:100}}}});
  }
  if(currentTab==='study'&&currentSubtab.study==='analytics'){
    destroyChart('subjHoursChart'); destroyChart('weekHoursChart');
    const ctx1=document.getElementById('subjHoursChart');
    const subjHours=subjectKeys().map(k=>subjectStats(k).hrs);
    if(ctx1)charts.subjHoursChart=new Chart(ctx1,{type:'doughnut',data:{labels:subjectKeys().map(k=>subjLabel(k)),datasets:[{data:subjHours,backgroundColor:subjectKeys().map((k,i)=>subjColor(k)||DEFAULT_SUBJECT_COLORS[i%DEFAULT_SUBJECT_COLORS.length])}]},options:{plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}}});
    const ctx2=document.getElementById('weekHoursChart');
    const weeks=[...Array(8)].map((_,i)=>7*(7-i));
    const weekLabels=weeks.map((w,i)=>'W-'+(7-i));
    const weekData=weeks.map((w,i)=>{const from=w, to=i===7?0:weeks[i+1]; return hoursSince(from)-(to?hoursSince(to):0);});
    if(ctx2)charts.weekHoursChart=new Chart(ctx2,{type:'bar',data:{labels:weekLabels,datasets:[{label:'Hours',data:weekData,backgroundColor:'#8b5cf6',borderRadius:6}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
  }
}

/* ================= INIT ================= */
loadDB();
