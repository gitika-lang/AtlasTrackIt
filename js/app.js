/* ================= DATA MODEL ================= */
// Intentionally left as the original key name so existing saved data keeps loading after the rebrand.
const STORAGE_KEY='ssc_cgl_state_v1';
const todayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
// Formats any Date object as a local-timezone YYYY-MM-DD string (same logic as
// todayStr, generalized to any date). Using d.toISOString().slice(0,10) instead
// converts to UTC first, which silently rolls the date back a day for part of
// the early morning in timezones ahead of UTC (e.g. IST) — that mismatch was
// why a revision due "today" could also show under "Tomorrow", and something
// scheduled for "tomorrow" could spill into "Next 7 Days".
const localDateStr = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
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
const DEFAULT_SUBJECT_COLORS=['#b3164f','#9c2861','#c2185b','#0f9d68','#c67c00','#7c3aed','#2563eb','#dc2626','#0891b2','#65a30d'];
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
    meta:{startDate:todayStr(),dark:false,targetHoursToday:7,mockCounter:0,questionTarget:50000,mockTargetScore:200,accent:'maroon',
      pomoWork:25,pomoBreak:5,pomoAutoTransition:true,pomoSound:true,pomoNotify:false,lastActiveDate:todayStr(),
      lastSessionSubjectKey:'',lastSessionTopicId:'',lastSessionTopicName:'',lastSessionSubtopic:'',lastSessionType:'Study'},
    sessions:[], subjects, subjectOrder:Object.keys(SYLLABUS), goals:[], habits:{}, mocks:[], pyq:[], errors:[],
    notes:{quick:'',formulas:[],vocab:[]}, tasks:{}, dailyTargets:{}, customRevisions:[], history:[], revisionLog:[], scheduledRevisions:[], dismissedRevisions:[],
    profile:{name:''}
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
      DB.revisionLog=Array.isArray(parsed.revisionLog)?parsed.revisionLog:[];
      DB.scheduledRevisions=Array.isArray(parsed.scheduledRevisions)?parsed.scheduledRevisions:[];
      DB.dismissedRevisions=Array.isArray(parsed.dismissedRevisions)?parsed.dismissedRevisions:[];
      DB.notes=Object.assign({quick:'',formulas:[],vocab:[]},parsed.notes||{});
      DB.profile=Object.assign({name:''},parsed.profile||{});
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
  document.documentElement.setAttribute('data-accent',DB.meta.accent||'maroon');
  pomo.mode='Work';
  pomo.seconds=(DB.meta.pomoWork||25)*60;
  loadPomoState();
  checkDayRollover();
  checkWeeklyRollover();
  checkScheduledRevisionReminders();
  render();
  maybeShowNamePrompt();
  if(pomo.running){
    studyTimer.running=(pomo.mode==='Work');
    pomo.interval=setInterval(pomoTick,1000);
    pomoScheduleEndTimeout();
  }
  clearInterval(dayRollcheckInterval);
  dayRollcheckInterval=setInterval(()=>{checkDayRollover();checkWeeklyRollover();checkScheduledRevisionReminders();},30000);
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
    DB.revisionLog=Array.isArray(parsed.revisionLog)?parsed.revisionLog:[];
    DB.scheduledRevisions=Array.isArray(parsed.scheduledRevisions)?parsed.scheduledRevisions:[];
    DB.dismissedRevisions=Array.isArray(parsed.dismissedRevisions)?parsed.dismissedRevisions:[];
    DB.notes=Object.assign({quick:'',formulas:[],vocab:[]},parsed.notes||{});
    DB.profile=Object.assign({name:''},parsed.profile||{});
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
    document.documentElement.setAttribute('data-accent',DB.meta.accent||'maroon');
    stopAlarm(); clearInterval(pomo.interval); clearTimeout(pomo.endTimeoutHandle);
    pomo.mode='Work'; pomo.seconds=(DB.meta.pomoWork||25)*60; pomo.running=false; pomo.targetEndTs=null; studyTimer.running=false;
    savePomoState();
    input.value='';
    scheduleSave();
    checkDayRollover();
    render();
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
  let d=new Date(); let streak=0;
  // allow today to be empty without breaking streak calc from yesterday
  let cursor=new Date(todayStr());
  if(!days.has(todayStr())){cursor.setDate(cursor.getDate()-1);}
  while(days.has(localDateStr(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
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
  const dismissed=DB.dismissedRevisions||[];
  const out=[];
  allTopics().forEach(t=>{
    if(t.status==='Completed'||t.status==='Revised'){
      const base=t.lastRevisionDate||t.completionDate;
      if(base && t.revisions<5){
        const revNum=t.revisions+1;
        if(dismissed.some(x=>x.topicId===t.id&&x.revNum===revNum))return; // user deleted this specific reminder — will resurface once revisions actually advances
        const due=new Date(base); due.setDate(due.getDate()+intervals[t.revisions]);
        out.push({name:t.name,subject:subjLabel(t.subject),subjectKey:t.subject,due:localDateStr(due),revNum,topicId:t.id});
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
/* ---- mistake progress ---- */
function mistakeStats(){
  const total=DB.errors.length, fixed=DB.errors.filter(e=>e.fixed).length, pending=total-fixed;
  const byTopic={};
  DB.errors.forEach(e=>{const key=(e.topic||'Unspecified')+' ('+subjLabel(e.subject)+')';byTopic[key]=(byTopic[key]||0)+1;});
  const top5=Object.entries(byTopic).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return {total,fixed,pending,pct:total?fixed/total*100:0,top5};
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
  const dueTomorrow=revisionQueue().filter(r=>{const t=new Date();t.setDate(t.getDate()+1);return r.due===localDateStr(t);});
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
  {id:'atlas',label:'Atlas AI',ic:'🤖'},
  {id:'settings',label:'Settings',ic:'⚙'}
];
let atlasMessages=[]; // session-only Atlas AI chat log (UI-only, not persisted, no backend yet)
const SUBTABS={
  study:[{key:'subjects',label:'Subjects',ic:'📚'},{key:'log',label:'Study Log',ic:'📝'},{key:'analytics',label:'Analytics',ic:'📊'},{key:'history',label:'History',ic:'🗂'}],
  goals:[{key:'goals',label:'Goals',ic:'🎯'},{key:'weekly',label:'Weekly Report',ic:'📆'},{key:'achievements',label:'Achievements',ic:'🏅'}],
  mocks:[{key:'mocks',label:'Mock Tests',ic:'🧪'},{key:'pyq',label:'PYQ Tracker',ic:'📄'},{key:'errors',label:'Error Log',ic:'⚠'}]
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

function render(){
  renderNav();
  document.getElementById('pageTitle').textContent=TABS.find(t=>t.id===currentTab).label;
  document.getElementById('sideStreak').textContent=currentStreak()+' day streak';
  const view=document.getElementById('view');
  if(currentTab==='dashboard')view.innerHTML=renderDashboard();
  else if(currentTab==='study')view.innerHTML=renderStudyPage();
  else if(currentTab==='goals')view.innerHTML=renderGoalsPage();
  else if(currentTab==='mocks')view.innerHTML=renderMocksPage();
  else if(currentTab==='atlas')view.innerHTML=renderAtlasPage();
  else if(currentTab==='settings')view.innerHTML=renderSettingsPage();
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
  else if(sub==='history')content=renderHistoryArchive();
  return subnavHtml('study')+content;
}
function renderGoalsPage(){
  const sub=currentSubtab.goals;
  let content='';
  if(sub==='goals')content=renderGoals();
  else if(sub==='weekly')content=renderWeeklyPage();
  else if(sub==='achievements')content=`<div class="section-title"><h2>Achievements</h2><span class="hint">Unlocked as you hit milestones</span></div>${renderBadges()}`;
  return subnavHtml('goals')+content;
}
function renderMocksPage(){
  const sub=currentSubtab.mocks;
  let content='';
  if(sub==='mocks')content=renderMocks();
  else if(sub==='pyq')content=renderPyq();
  else if(sub==='errors')content=renderErrors();
  return subnavHtml('mocks')+content;
}

/* ================= ATLAS AI ================= */
const ATLAS_CHIPS=[
  ['📅','What should I study today?'],
  ['📊','Analyze my last 15 days'],
  ['📚','Which subjects are my weakest?'],
  ['🧠',"Build today's study plan"],
  ['📈','Am I on track?'],
  ['🔥','Motivate me'],
  ['📝','Make a revision plan'],
  ['🎯','Improve my mock scores']
];
const ATLAS_FUTURE=['Daily Study Planning','Progress Analysis','Weak Topic Detection','Revision Scheduling','Mock Test Analysis','Personalized Recommendations','Smart Productivity Insights','Study Pattern Analysis'];
let atlasWaiting=false; // true while a request to /api/atlas is in flight
function atlasGreeting(){
  const name=(DB.profile&&DB.profile.name)?DB.profile.name.trim():'';
  if(!name)return 'Hello 👋';
  const hour=new Date().getHours();
  if(hour<12)return `Good Morning, ${esc(name)} 👋`;
  if(hour<17)return `Good Afternoon, ${esc(name)} ☀️`;
  return `Good Evening, ${esc(name)} 🌙`;
}

/* ---- ATLAS AI — data context builder ----
   Figures out what the message is asking about and hands Gemini only that
   slice of the student's data, instead of the whole database every turn.
   Keeps token usage, cost and latency down and keeps answers grounded. */
function atlasSnapshot(){
  const r=examReadiness();
  return {
    studentName:(DB.profile&&DB.profile.name)||null,
    streakDays:currentStreak(),
    todayStudyHours:Number(todayStudyTime().toFixed(2)),
    todayTargetHours:todayTarget(),
    daysElapsed:daysElapsed(),
    daysRemaining:daysRemaining(),
    examReadiness:{score:Math.round(r.score),label:r.label}
  };
}
function atlasSubjectDetail(key){
  const st=subjectStats(key);
  const topics=DB.subjects[key].topics;
  return {
    subject:subjLabel(key),
    progressPct:Math.round(st.pct),
    hoursSpent:Number(st.hrs.toFixed(1)),
    totalTopics:st.total, completedTopics:st.completed, remainingTopics:st.remaining,
    weakTopics:st.weak.slice(0,12), strongTopics:st.strong.slice(0,8),
    pendingTopicNames:topics.filter(t=>t.status==='Not Started'||t.status==='In Progress').map(t=>t.name).slice(0,15)
  };
}
function atlasAllSubjectsBrief(){
  return subjectKeys().map(k=>{const st=subjectStats(k);return {subject:subjLabel(k),progressPct:Math.round(st.pct),weakTopicCount:st.weak.length};});
}
function atlasWeakTopics(limit=10){
  return allTopics().filter(t=>t.confidence<=2&&t.status!=='Completed'&&t.status!=='Revised')
    .sort((a,b)=>a.confidence-b.confidence).slice(0,limit)
    .map(t=>({name:t.name,subject:subjLabel(t.subject),confidence:t.confidence,status:t.status}));
}
function atlasRevisionQueueBrief(limit=10){
  const today=todayStr();
  return revisionQueue().filter(r=>r.due<=today).slice(0,limit).map(r=>({name:r.name,subject:r.subject,due:r.due,revNum:r.revNum}));
}
function atlasRecentSessions(n=5,subjectKey){
  let sess=DB.sessions.slice();
  if(subjectKey)sess=sess.filter(s=>s.subject===subjectKey);
  return sess.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,n)
    .map(s=>({date:s.date,subject:subjLabel(s.subject),hours:Number(Number(s.hours||0).toFixed(2)),questions:s.qSolved||0,notes:(s.notes||'').slice(0,140)}));
}
function atlasMockBrief(n=5){
  const sorted=DB.mocks.slice().sort((a,b)=>b.number-a.number);
  return {count:DB.mocks.length, average:Math.round(mockAvg()), highest:mockHigh(),
    recent:sorted.slice(0,n).map(m=>({number:m.number,score:m.score,weak:m.weak,strong:m.strong}))};
}
function atlasHistorySummary(){
  const hist=DB.history||[];
  if(!hist.length)return null;
  const avgGoalPct=Math.round(hist.reduce((a,h)=>a+Number(h.goalPct||0),0)/hist.length);
  const avgStudyHours=Number((hist.reduce((a,h)=>a+Number(h.studyHours||0),0)/hist.length).toFixed(1));
  const missedTargetDays=hist.filter(h=>Number(h.goalPct||0)<100).length;
  const subjPct=subjectKeys().map(k=>({subject:subjLabel(k),pct:Math.round(subjectStats(k).pct)})).sort((a,b)=>b.pct-a.pct);
  return {daysTracked:hist.length, avgDailyGoalCompletionPct:avgGoalPct, avgDailyStudyHours:avgStudyHours,
    missedTargetDays, strongestSubject:subjPct[0]?subjPct[0].subject:null,
    weakestSubject:subjPct.length?subjPct[subjPct.length-1].subject:null};
}
function atlasWeeklyTrend(){
  const weeks=[];
  for(let i=0;i<4;i++){const to=i*7, from=to+7; weeks.push(Number((hoursSince(from)-hoursSince(to)).toFixed(1)));}
  return weeks.reverse(); // oldest week first, most recent last
}
function atlasMatchSubjectKey(q){
  return subjectKeys().find(k=>{
    const label=subjLabel(k).toLowerCase();
    return q.includes(label)||label.split(/[\s&/]+/).some(w=>w.length>3&&q.includes(w));
  });
}
function buildAtlasContext(message){
  const q=(message||'').toLowerCase();
  const ctx={snapshot:atlasSnapshot()};
  const matchedSubject=atlasMatchSubjectKey(q);
  if(matchedSubject){
    ctx.subjectFocus=atlasSubjectDetail(matchedSubject);
    ctx.recentSessions=atlasRecentSessions(5,matchedSubject);
    return ctx;
  }
  const wantsWeek=/\bweek|next 7|schedule|plan\b/.test(q);
  const wantsMonth=/\bmonth|trend|analytics|performance|improv|overall progress\b/.test(q);
  const wantsMock=/\bmock|test score|exam score\b/.test(q);
  const wantsWeak=/\bweak|struggl|difficult|bad at\b/.test(q);
  const wantsRevision=/\brevis/.test(q);
  const wantsMotivate=/\bmotivat|discourag|tired|lazy|procrastinat\b/.test(q);
  const wantsToday=/\btoday|now|right now|this morning|tonight\b/.test(q)||(!wantsWeek&&!wantsMonth&&!wantsMock&&!wantsRevision&&!wantsMotivate&&!wantsWeak);
  if(wantsToday){
    ctx.subjectsBrief=atlasAllSubjectsBrief();
    ctx.weakTopics=atlasWeakTopics(8);
    ctx.revisionDueToday=atlasRevisionQueueBrief(8);
    ctx.recentSessions=atlasRecentSessions(3);
  }
  if(wantsWeek){
    ctx.weeklyHoursTrend=atlasWeeklyTrend();
    ctx.subjectsBrief=atlasAllSubjectsBrief();
    ctx.weakTopics=atlasWeakTopics(10);
    ctx.revisionQueue=atlasRevisionQueueBrief(10);
  }
  if(wantsMonth){
    ctx.historySummary=atlasHistorySummary();
    ctx.weeklyHoursTrend=atlasWeeklyTrend();
    ctx.mocks=atlasMockBrief(5);
    ctx.subjectsBrief=atlasAllSubjectsBrief();
  }
  if(wantsMock)ctx.mocks=atlasMockBrief(8);
  if(wantsWeak){ctx.weakTopics=atlasWeakTopics(12); ctx.subjectsBrief=atlasAllSubjectsBrief();}
  if(wantsRevision){ctx.revisionQueue=atlasRevisionQueueBrief(15); ctx.weakTopics=atlasWeakTopics(8);}
  if(wantsMotivate){ctx.recentSessions=atlasRecentSessions(5); ctx.historySummary=atlasHistorySummary();}
  return ctx;
}

/* ---- ATLAS AI — chat rendering ---- */
function atlasRenderMarkdown(text){
  try{
    if(typeof marked!=='undefined'){
      const raw=marked.parse(text,{breaks:true});
      return (typeof DOMPurify!=='undefined')?DOMPurify.sanitize(raw):raw;
    }
  }catch(e){ /* fall through to plain escaped text */ }
  return esc(text).replace(/\n/g,'<br>');
}
function atlasMessageHtml(m){
  if(m.role==='pending'){
    return `<div class="atlas-msg assistant"><div class="atlas-bubble atlas-typing"><span></span><span></span><span></span></div></div>`;
  }
  const html=m.role==='assistant'?atlasRenderMarkdown(m.text):esc(m.text);
  return `<div class="atlas-msg ${m.role}"><div class="atlas-bubble${m.error?' atlas-error':''}">${html}</div></div>`;
}
function renderAtlasChatBody(){
  if(!atlasMessages.length){
    return `<div class="atlas-empty">
      <div class="atlas-empty-ic">✨</div>
      <p>Ask Atlas anything about your prep.</p>
      <span>Atlas already knows your subjects, progress, revisions and mock scores — no need to explain your journey, just ask.</span>
    </div>`;
  }
  return atlasMessages.map(atlasMessageHtml).join('');
}
function renderAtlasPage(){
  return `
  <div class="atlas-page">
    <div class="atlas-main">
      <div class="atlas-greet">
        <span class="atlas-badge">🤖 Atlas</span>
        <h2 class="atlas-greeting disp">${atlasGreeting()}</h2>
      </div>
      <div class="card atlas-welcome">
        <div class="atlas-welcome-icon">🤖</div>
        <div>
          <h3 style="margin:0 0 4px;font-size:15px;">Atlas AI</h3>
          <p style="margin:0 0 6px;font-size:13px;color:var(--text-muted);font-weight:600;">Your personal AI study coach.</p>
          <p style="margin:0;font-size:12.5px;color:var(--text-faint);line-height:1.6;">Atlas can analyze your study habits, revision history, subjects, mock tests and progress to help you study smarter.</p>
        </div>
      </div>
      <div class="atlas-chips">
        ${ATLAS_CHIPS.map(([ic,text])=>`<button class="atlas-chip" data-action="atlasChip" data-text="${esc(text)}"><span>${ic}</span>${esc(text)}</button>`).join('')}
      </div>
      <div class="card atlas-chatcard">
        <div id="atlasChatBody" class="atlas-chatbody">${renderAtlasChatBody()}</div>
        <div class="atlas-inputrow">
          <textarea id="atlasInput" placeholder="Ask Atlas anything about your prep..." rows="1"${atlasWaiting?' disabled':''}></textarea>
          <button class="btn atlas-sendbtn" data-action="atlasSend" title="Send"${atlasWaiting?' disabled':''}>➤</button>
        </div>
      </div>
    </div>
    <div class="atlas-side">
      <div class="card">
        <h3 style="margin:0 0 12px;font-size:14px;">Atlas Will Soon Help You With</h3>
        <div class="atlas-future-list">
          ${ATLAS_FUTURE.map(f=>`<div class="atlas-future-item">✓ ${esc(f)}</div>`).join('')}
        </div>
      </div>
    </div>
  </div>`;
}
function autosizeAtlasInput(ta){
  ta.style.height='auto';
  ta.style.height=Math.min(ta.scrollHeight,160)+'px';
}
function atlasSetSendDisabled(disabled){
  const btn=document.querySelector('.atlas-sendbtn'); if(btn)btn.disabled=disabled;
  const ta=document.getElementById('atlasInput'); if(ta)ta.disabled=disabled;
}
function atlasRefreshChatBody(scrollDown){
  const body=document.getElementById('atlasChatBody');
  if(!body)return;
  body.innerHTML=renderAtlasChatBody();
  if(scrollDown)body.scrollTop=body.scrollHeight;
}
async function atlasSendMessage(){
  if(atlasWaiting)return;
  const ta=document.getElementById('atlasInput');
  if(!ta)return;
  const val=ta.value.trim();
  if(!val)return;
  atlasMessages.push({role:'user',text:val});
  ta.value=''; ta.style.height='auto';
  atlasWaiting=true; atlasSetSendDisabled(true);
  atlasMessages.push({role:'pending'});
  atlasRefreshChatBody(true);
  // Recent turns (excluding the pending placeholder) give Atlas short-term memory
  // for this browser session, so follow-up questions stay in context.
  const history=atlasMessages.filter(m=>m.role==='user'||m.role==='assistant').slice(0,-1).slice(-12);
  try{
    const context=buildAtlasContext(val);
    const res=await fetch('/api/atlas',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:val,context,history})
    });
    let data=null;
    try{data=await res.json();}catch(e){ /* non-JSON error body */ }
    atlasMessages=atlasMessages.filter(m=>m.role!=='pending');
    if(res.ok&&data&&data.reply){
      atlasMessages.push({role:'assistant',text:data.reply});
    }else{
      atlasMessages.push({role:'assistant',text:(data&&data.error)||'Atlas is taking a short break right now. Please try again in a moment.',error:true});
    }
  }catch(e){
    atlasMessages=atlasMessages.filter(m=>m.role!=='pending');
    atlasMessages.push({role:'assistant',text:'Atlas is taking a short break right now. Please try again in a moment.',error:true});
  }
  atlasWaiting=false; atlasSetSendDisabled(false);
  atlasRefreshChatBody(true);
}

/* ---- Scheduled Revisions: plan a future revision (Subject + Topic + date/time +
   optional note), surfaced prominently on the Dashboard when due, with an optional
   browser-notification reminder. Separate from the auto-generated spaced-repetition
   queue and the quick freeform "+ Add Revision" reminder — this is planned in advance
   and tracked through Scheduled → Completed/Skipped, and can be rescheduled. ---- */
function scheduledRevisionDueTs(item){
  const t=item.time?item.time:'00:00';
  const ts=new Date(`${item.date}T${t}:00`).getTime();
  return isNaN(ts)?null:ts;
}
function scheduledRevisionsDueToday(){
  const today=todayStr();
  return (DB.scheduledRevisions||[]).filter(s=>s.status==='Scheduled'&&s.date<=today)
    .sort((a,b)=>(a.date+' '+(a.time||'00:00')).localeCompare(b.date+' '+(b.time||'00:00')));
}
// Builds the <option> list for a subject's tracked topics — shared by the
// Topic dropdown in both the Schedule Revision and Add Revision modals (kept
// as a function so it can be regenerated when the Subject select changes,
// without a full page render()).
function scheduleTopicOptionsHtml(subjectKey,selectedTopicId){
  if(!subjectKey||!DB.subjects[subjectKey])return '';
  return DB.subjects[subjectKey].topics.map(t=>`<option value="${t.id}" ${t.id===selectedTopicId?'selected':''}>${esc(t.name)}</option>`).join('');
}
// Topic field for a given subject + a DOM id prefix (so the same component can
// appear in more than one modal). If the subject has tracked topics, shows a
// dropdown of them plus a "type manually" option that reveals a free-text
// input — so a topic not yet in the list can still be entered even when a
// real subject is selected. Falls back straight to free text for "Other" /
// subjects with no topics yet.
function topicFieldHtml(subjectKey,prefix,selectedTopicId){
  if(subjectKey&&DB.subjects[subjectKey]&&DB.subjects[subjectKey].topics.length){
    return `<select id="${prefix}_topic" data-action="topicSelectChange" data-prefix="${prefix}">
      ${scheduleTopicOptionsHtml(subjectKey,selectedTopicId)}
      <option value="__custom__">✎ Other / type manually…</option>
    </select>
    <input type="text" id="${prefix}_topic_custom" placeholder="Type topic name" style="display:none;margin-top:6px;">`;
  }
  return `<input type="text" id="${prefix}_topic_custom" placeholder="e.g. Percentage formulas, Chapter 5">`;
}
// Reads back whichever topic was actually selected/typed for a given prefix +
// subject — used by both modals' save handlers.
function readTopicField(prefix,subjectKey){
  const select=document.getElementById(prefix+'_topic');
  const custom=document.getElementById(prefix+'_topic_custom');
  if(select&&select.value&&select.value!=='__custom__'){
    const topic=(subjectKey&&DB.subjects[subjectKey])?DB.subjects[subjectKey].topics.find(x=>x.id===select.value):null;
    return {topicId:select.value,topicName:topic?topic.name:''};
  }
  return {topicId:'',topicName:custom?custom.value.trim():''};
}
function notifyScheduledRevision(item){
  if(!DB.meta.pomoNotify)return;
  if(typeof Notification==='undefined')return;
  if(!document.hidden)return; // consistent with the Pomodoro reminder: only interrupt when the tab isn't active
  if(Notification.permission!=='granted')return; // see notifySessionEnd — can't request permission from a non-gesture context
  const body=`${item.topicName}${item.subtopic?' — '+item.subtopic:''}${item.subjectLabel?' · '+item.subjectLabel:''} is due for revision.`;
  new Notification('AtlasTrackIt — Revision Reminder',{body});
}
// Runs periodically (see dayRollcheckInterval) to fire a one-time reminder the
// moment a scheduled revision becomes due — by date if no time was given, or by
// the exact date+time otherwise. notifiedAt prevents repeat notifications.
function checkScheduledRevisionReminders(){
  const now=Date.now();
  let changed=false;
  (DB.scheduledRevisions||[]).forEach(item=>{
    if(item.status!=='Scheduled'||item.notifiedAt)return;
    const dueTs=scheduledRevisionDueTs(item);
    if(dueTs!==null&&now>=dueTs){
      notifyScheduledRevision(item);
      item.notifiedAt=new Date().toISOString();
      changed=true;
    }
  });
  if(changed){scheduleSave(); if(currentTab==='dashboard')render();}
}

/* ================= DASHBOARD (daily home screen) ================= */
function renderDashboard(){
  const today=todayStr();
  const target=todayTarget();
  const isOverride=DB.dailyTargets[today]!==undefined&&DB.dailyTargets[today]!==null&&DB.dailyTargets[today]!=='';
  const th=todayStudyTime();
  const tasks=DB.tasks[today]||[];
  const doneCount=tasks.filter(t=>t.done).length;
  const taskPct=tasks.length?doneCount/tasks.length*100:0;
  const quote=QUOTES[new Date().getDate()%QUOTES.length];
  return `
  <div class="grid g3">
    <div class="card stat">
      <div class="flexbetween">
        <div class="label">Today's Goal</div>
        <button class="icon-only" data-action="editTodayTarget" title="Edit today's target">✏</button>
      </div>
      <div class="value" id="todayGoalValue">${th.toFixed(1)} / ${target}h</div>
      <div class="sub">${isOverride?'Custom target for today':'Using default daily target'}</div>
    </div>
    <div class="card stat"><div class="label">365-Day Countdown</div><div class="value">${daysRemaining()}d left</div><div class="sub">Day ${daysElapsed()} of 365</div></div>
    <div class="card stat">
      <div class="flexbetween">
        <div class="label">Questions Solved Today</div>
        <button class="icon-only" data-action="editQuestionsToday" title="Edit today's question count">✏</button>
      </div>
      <div class="value" id="questionsTodayValue">${questionsOn(today)} <span style="font-size:13px;font-weight:600;color:var(--text-faint);">Questions</span></div>
    </div>
  </div>

  <div class="card" id="studySessionCard" style="margin-top:14px;">
    <div class="flexbetween">
      <div class="label">Study Session</div>
      <span class="sub" id="studySessionMode">${pomo.mode==='Work'?'🎯 Study Session':'☕ Break'}</span>
    </div>
    ${activeStudySession.active?`<div class="sub" style="margin:6px 0 0;font-size:12.5px;">
      <span style="color:var(--accent-700);font-weight:700;">${esc(activeStudySession.topicName)}${activeStudySession.subtopic?' — '+esc(activeStudySession.subtopic):''}</span>
      <span style="color:var(--text-faint);"> · ${esc(activeStudySession.subjectLabel)} · ${esc(activeStudySession.sessionType)}</span>
    </div>`:''}
    <div class="pomo-display mono" id="studySessionTimer">${fmtTime(pomo.seconds)}</div>
    <div class="sub" style="text-align:center;" id="studySessionTotal">Today: ${fmtHrsMin(todayStudyTime())}</div>
    <div class="pomo-controls">
      <button class="btn sm" id="studySessionStartBtn" data-action="pomoStart">${pomo.running?'Pause':'Start'}</button>
      <button class="btn ghost sm" data-action="pomoResetBtn">Reset</button>
    </div>
    ${activeStudySession.active?`<div class="pomo-controls" style="margin-top:8px;">
      <button class="btn ghost sm" data-action="openSwitchStudySession">🔁 Switch Subject</button>
      <button class="btn ghost sm" data-action="endStudySession">⏹ End Session</button>
    </div>`:''}
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
  </div>

  <div class="grid g2" style="margin-top:14px;align-items:stretch;">
    <div class="card" style="text-align:center;">
      <div class="label" style="margin-bottom:10px;">Today's Progress</div>
      <div class="ring-wrap" id="todayRingWrap">${ringSVG(Math.min(100,target?th/target*100:0))}<div class="ring-label"><b>${th.toFixed(1)}h</b><span>of ${target}h target</span></div></div>
    </div>
    <div class="card">
      <div class="flexbetween"><div class="label">Today's Tasks</div><span class="sub">${doneCount} / ${tasks.length} done</span></div>
      <div class="bar" style="margin:8px 0 12px;"><span style="width:${taskPct}%"></span></div>
      ${tasks.length===0?'<div class="emptystate">No tasks yet — add your first for today.</div>':
      tasks.map(t=>`<div class="checkbox-row" style="justify-content:space-between;">
        <label style="display:flex;align-items:center;gap:8px;flex:1;"><input type="checkbox" data-action="toggleTask" data-id="${t.id}" ${t.done?'checked':''}> <span style="${t.done?'text-decoration:line-through;color:var(--text-faint);':''}">${esc(t.text)}</span></label>
        <button class="icon-only" data-action="deleteTask" data-id="${t.id}">🗑</button>
      </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:12px;">
        <input type="text" id="newTaskInput" placeholder="e.g. Solve 100 Quant Questions" style="flex:1;">
        <button class="btn sm" data-action="addTask">Add</button>
      </div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:14px;align-items:stretch;">
    <div class="card">
      <div class="label" style="margin-bottom:10px;">Quick Progress Summary</div>
      <div class="grid g2" style="gap:10px;">
        <div class="sub">Syllabus<br><b style="color:var(--text);font-size:16px;">${syllabusPct().toFixed(0)}%</b></div>
        <div class="sub">Revision<br><b style="color:var(--text);font-size:16px;">${revisionPct().toFixed(0)}%</b></div>
        <div class="sub">Current Streak<br><b style="color:var(--text);font-size:16px;">${currentStreak()} 🔥</b></div>
        <div class="sub">Total Hours<br><b style="color:var(--text);font-size:16px;">${totalHours().toFixed(1)}h</b></div>
      </div>
    </div>
    ${renderStudyHistoryCard()}
  </div>

  <div style="margin-top:14px;">
    ${renderRevision()}
  </div>

  <div class="quote-box" style="margin-top:14px;"><p>"${esc(quote)}"</p><span>Daily motivation · Day ${daysElapsed()} of 365</span></div>
  `;
}
function renderStudyHistoryCard(){
  const y=[...Array(1)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-1);return localDateStr(d);})[0];
  const yEntry=(DB.history||[]).find(h=>h.date===y);
  return `
    <div class="card">
      <div class="flexbetween" style="margin-bottom:8px;">
        <div class="label">📅 Study History</div>
        <button class="btn ghost sm" data-action="openHistory">View History</button>
      </div>
      ${yEntry?`
      <div class="sub" style="margin-bottom:4px;">Yesterday</div>
      <div style="font-size:13px;line-height:1.9;">
        <div>• Goal Completion: <b>${yEntry.goalPct}%</b></div>
        <div>• Study Time: <b>${fmtHrsMin(yEntry.studyHours)}</b></div>
        <div>• Questions Solved: <b>${yEntry.questionsSolved}</b></div>
        <div>• Revisions Completed: <b>${yEntry.revisionsCompleted}</b></div>
      </div>`:`<div class="emptystate">No data recorded for yesterday yet.</div>`}
    </div>`;
}
/* ---- History / Archive: completed daily tasks + completed revisions, kept
   (not deleted) and organized by date with their original completion time ---- */
function fmtClock(iso){
  if(!iso)return '';
  const d=new Date(iso);
  if(isNaN(d.getTime()))return '';
  let h=d.getHours(); const m=d.getMinutes().toString().padStart(2,'0');
  const ap=h>=12?'PM':'AM'; h=h%12; if(h===0)h=12;
  return `${h}:${m} ${ap}`;
}
function buildActivityArchive(){
  const byDate={};
  Object.keys(DB.tasks||{}).forEach(date=>{
    (DB.tasks[date]||[]).filter(t=>t.done).forEach(t=>{
      (byDate[date]=byDate[date]||[]).push({type:'task',text:t.text,completedAt:t.completedAt||''});
    });
  });
  (DB.revisionLog||[]).forEach(r=>{
    const kindTag=r.kind==='custom'?' · Custom':(r.kind==='scheduled'?' · Scheduled':'');
    const label=r.name+(r.subject?' · '+r.subject:'')+(r.revNum?' · Rev '+r.revNum:'')+kindTag;
    (byDate[r.date]=byDate[r.date]||[]).push({type:'revision',text:label,completedAt:r.completedAt||''});
  });
  return byDate;
}
// Today's Completion: completed-today count vs. everything still outstanding
// today (pending tasks + revisions still due today across all three revision
// sources), so the ratio reflects "today's plan" rather than a shrinking
// denominator as items get completed.
function todaysCompletionSummary(){
  const today=todayStr();
  const completedToday=(buildActivityArchive()[today]||[]).length;
  const tasksLeft=(DB.tasks[today]||[]).filter(t=>!t.done).length;
  const queueLeft=revisionQueue().filter(r=>r.due<=today).length;
  const customLeft=(DB.customRevisions||[]).filter(c=>c.due<=today).length;
  const scheduledLeft=scheduledRevisionsDueToday().length;
  const outstanding=tasksLeft+queueLeft+customLeft+scheduledLeft;
  const total=completedToday+outstanding;
  const pct=total>0?Math.round(completedToday/total*100):0;
  return {completedToday,total,pct};
}
function renderTodaysCompletionSummary(){
  const {completedToday,total,pct}=todaysCompletionSummary();
  if(total===0){
    return `<div class="card" style="margin-bottom:14px;">
      <div class="label" style="margin-bottom:4px;">Today's Completion</div>
      <div class="emptystate" style="margin-top:4px;">Nothing planned or completed today yet.</div>
    </div>`;
  }
  return `<div class="card" style="margin-bottom:14px;">
    <div class="flexbetween" style="margin-bottom:8px;">
      <div class="label">Today's Completion</div>
      <span class="sub">${completedToday}/${total} completed</span>
    </div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <div class="sub" style="margin-top:6px;">${pct}% of today's activities & revisions done</div>
  </div>`;
}
function renderHistoryArchive(){
  const byDate=buildActivityArchive();
  const dates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
  const header=`<div class="section-title"><h2>History / Archive</h2><span class="hint">Completed tasks & revisions — kept, not deleted, organized by date</span></div>`;
  const summary=renderTodaysCompletionSummary();
  if(!dates.length){
    return header+summary+`<div class="emptystate">Nothing completed yet — finished daily tasks and completed revisions will show up here, grouped by the day you completed them.</div>`;
  }
  const sections=dates.map(date=>{
    const items=byDate[date].slice().sort((a,b)=>(a.completedAt||'').localeCompare(b.completedAt||''));
    const rows=items.map(it=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;">
      <span>${it.type==='task'?'✅':'🔁'} ${esc(it.text)}</span>
      <span class="sub" style="color:var(--text-faint);white-space:nowrap;">${it.completedAt?fmtClock(it.completedAt):''}</span>
    </div>`).join('');
    return `<div class="card" style="margin-bottom:12px;">
      <div class="flexbetween" style="margin-bottom:6px;"><div class="label">${esc(date)}</div><span class="sub">${items.length} completed</span></div>
      ${rows}
    </div>`;
  }).join('');
  return header+summary+sections;
}
function ringSVG(pct){
  const r=50,c=2*Math.PI*r,off=c-(Math.min(100,pct)/100)*c;
  return `<svg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${r}" stroke="var(--bg-soft)" stroke-width="10" fill="none"/>
    <circle class="ring-progress" cx="60" cy="60" r="${r}" stroke="var(--accent-600)" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
  </svg>`;
}
function renderBadges(){
  const qSolved=DB.sessions.reduce((a,b)=>a+Number(b.qSolved||0),0);
  const topicsDone=allTopics().filter(t=>t.status==='Completed'||t.status==='Revised').length;
  const badges=[
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
  return `<div class="badge-grid">${badges.map(b=>`<div class="badge ${b.unlocked?'unlocked':''}"><span class="bic">${b.ic}</span>${b.label}</div>`).join('')}</div>`;
}

/* ================= REVISION CALENDAR ================= */
function renderScheduledRevisionsSection(){
  const items=(DB.scheduledRevisions||[]).slice().sort((a,b)=>{
    if(a.status!==b.status){ const order={Scheduled:0,Skipped:1,Completed:2}; return (order[a.status]||0)-(order[b.status]||0); }
    return (a.date+' '+(a.time||'00:00')).localeCompare(b.date+' '+(b.time||'00:00'));
  });
  const statusPill=s=>({Scheduled:'inprogress',Completed:'completed',Skipped:'notstarted'}[s]||'notstarted');
  return `<div class="section-title"><h2>Scheduled Revisions</h2><span class="hint">Plan a revision in advance, on top of the auto-generated queue below</span></div>
  <div class="card" style="margin-bottom:10px;">
    <button class="btn sm" data-action="openScheduleRevision">📅 Schedule Revision</button>
  </div>
  <div class="card" style="overflow-x:auto;">
  ${items.length===0?'<div class="emptystate">Nothing scheduled yet — plan your next revision ahead of time.</div>':
  `<table><thead><tr><th>Topic</th><th>Subject</th><th>Rev #</th><th>Date</th><th>Time</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>
  ${items.map(s=>`<tr>
    <td>${esc(s.topicName)}${s.subtopic?`<div class="sub" style="color:var(--text-faint);">${esc(s.subtopic)}</div>`:''}</td>
    <td>${esc(s.subjectLabel||'—')}</td>
    <td>${s.revNum?esc(String(s.revNum)):'—'}</td>
    <td>${esc(s.date)}</td>
    <td>${esc(s.time||'—')}</td>
    <td class="notes-preview" title="${esc(s.note||'')}">${esc(s.note||'—')}</td>
    <td><span class="pill ${statusPill(s.status)}">${s.status}</span></td>
    <td style="white-space:nowrap;">
      ${s.status==='Scheduled'?`<button class="btn sm" data-action="markScheduledRevisionDone" data-id="${s.id}">Done</button>
      <button class="btn ghost sm" data-action="skipScheduledRevision" data-id="${s.id}">Skip</button>
      <button class="icon-only" data-action="openRescheduleRevision" data-id="${s.id}" title="Reschedule">🔁</button>`:''}
      ${s.status==='Skipped'?`<button class="icon-only" data-action="openRescheduleRevision" data-id="${s.id}" title="Reschedule">🔁</button>`:''}
      <button class="icon-only" data-action="deleteScheduledRevision" data-id="${s.id}" title="Delete">🗑</button>
    </td>
  </tr>`).join('')}
  </tbody></table>`}
  </div>`;
}
function normalizeQueueRow(r){
  return {name:r.name,subject:r.subject,revNum:'Rev '+r.revNum,due:r.due,
    actionHtml:`<button class="btn sm" data-action="addRevision" data-topic="${r.topicId}" data-key="${r.subjectKey}">Mark Revised</button> <button class="icon-only" data-action="dismissAutoRevision" data-topic="${r.topicId}" data-revnum="${r.revNum}" title="Delete this reminder">🗑</button>`};
}
function normalizeScheduledRow(s){
  return {name:s.topicName+(s.subtopic?' — '+s.subtopic:''),subject:s.subjectLabel||'—',
    revNum:s.revNum?('Rev '+esc(String(s.revNum))):'<span class="tag med">Scheduled</span>',
    due:s.date+(s.time?' · '+esc(s.time):''),
    actionHtml:`<button class="btn sm" data-action="markScheduledRevisionDone" data-id="${s.id}">Mark Completed</button>`};
}
// Legacy quick reminders created before Scheduled Revision became the single
// add-flow — kept visible here (rather than a separate widget) so nothing a
// user already entered disappears.
function normalizeCustomRow(c){
  return {name:c.text+(c.subtopic?' — '+c.subtopic:''),subject:c.subject||'—',
    revNum:c.revNum?('Rev '+esc(String(c.revNum))):'<span class="tag med">Reminder</span>',
    due:c.due,
    actionHtml:`<button class="btn sm" data-action="completeCustomRevision" data-id="${c.id}">Mark Completed</button> <button class="icon-only" data-action="deleteCustomRevision" data-id="${c.id}" title="Delete">🗑</button>`};
}
function renderRevision(){
  const q=revisionQueue();
  const today=todayStr();
  const tmr=new Date();tmr.setDate(tmr.getDate()+1);const tomorrowStr=localDateStr(tmr);
  const next7=localDateStr(new Date(Date.now()+7*86400000));
  const scheduled=(DB.scheduledRevisions||[]).filter(s=>s.status==='Scheduled');
  const legacy=DB.customRevisions||[];
  const groups={
    Today:[...q.filter(r=>r.due<=today).map(normalizeQueueRow), ...scheduled.filter(s=>s.date<=today).map(normalizeScheduledRow), ...legacy.filter(c=>c.due<=today).map(normalizeCustomRow)],
    Tomorrow:[...q.filter(r=>r.due===tomorrowStr).map(normalizeQueueRow), ...scheduled.filter(s=>s.date===tomorrowStr).map(normalizeScheduledRow), ...legacy.filter(c=>c.due===tomorrowStr).map(normalizeCustomRow)],
    'Next 7 Days':[...q.filter(r=>r.due>tomorrowStr&&r.due<=next7).map(normalizeQueueRow),
      ...scheduled.filter(s=>s.date>tomorrowStr&&s.date<=next7).map(normalizeScheduledRow),
      ...legacy.filter(c=>c.due>tomorrowStr&&c.due<=next7).map(normalizeCustomRow)]
  };
  return renderScheduledRevisionsSection()+Object.keys(groups).map(g=>{
    const items=groups[g];
    return `<div class="section-title"><h2>${g}</h2><span class="hint">${items.length} due</span></div>
    <div class="card">${items.length===0?'<div class="emptystate">Nothing here.</div>':
    `<table><thead><tr><th>Topic</th><th>Subject</th><th>Revision #</th><th>Due</th><th></th></tr></thead><tbody>
    ${items.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.subject)}</td><td>${r.revNum}</td><td>${r.due}</td>
    <td>${r.actionHtml}</td></tr>`).join('')}
    </tbody></table>`}</div>`;
  }).join('');
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
    return `<div class="card subjectcard" draggable="true" data-subj-drag="${k}" data-action="openSubject" data-key="${k}" style="${col?`border-top:3px solid ${col};`:''}">
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
  <div class="card" style="overflow-x:auto;">
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
  <div class="card" style="overflow-x:auto;">
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
  const upcoming=DB.goals.filter(g=>g.deadline&&g.status!=='Completed').sort((a,b)=>a.deadline.localeCompare(b.deadline)).slice(0,6);
  return `<div class="card">${upcoming.length===0?'<div class="emptystate">No upcoming deadlines set.</div>':
  upcoming.map(g=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;"><span>${esc(g.text)} <span class="sub" style="color:var(--text-faint);">· ${g.type}</span></span><span class="tag ${g.priority==='High'?'high':g.priority==='Low'?'low':'med'}">${g.deadline}</span></div>`).join('')}
  </div>`;
}
function renderGoals(){
  ensureGoalForm(); const f=formTemp.goal;
  const types=['Yearly','Monthly','Weekly','Daily'];
  return `
  <div class="section-title"><h2>Exam Readiness</h2></div>
  ${renderReadinessCard()}
  <div class="section-title"><h2>Upcoming Deadlines</h2><span class="hint">Calendar view of your goals</span></div>
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
  ${types.map(ty=>{
    const items=DB.goals.filter(g=>g.type===ty);
    return `<div class="section-title"><h2>${ty} Goals</h2><span class="hint">${items.length} active</span></div>
    <div class="card">${items.length===0?'<div class="emptystate">No '+ty.toLowerCase()+' goals yet.</div>':`
    <table><thead><tr><th>Goal</th><th>Deadline</th><th>Priority</th><th>Status</th><th>Progress</th><th></th></tr></thead><tbody>
    ${items.map(g=>`<tr><td style="min-width:180px;">${esc(g.text)}</td><td>${g.deadline||'—'}</td><td><span class="tag ${g.priority==='High'?'high':g.priority==='Low'?'low':'med'}">${g.priority}</span></td>
    <td><select data-action="goalStatus" data-id="${g.id}">${['Not Started','In Progress','Completed'].map(s=>`<option ${g.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
    <td style="min-width:120px;"><input type="range" min="0" max="100" value="${g.progress}" data-action="goalProgress" data-id="${g.id}"> <span class="mono">${g.progress}%</span></td>
    <td><button class="icon-only" data-action="deleteGoal" data-id="${g.id}">🗑</button></td></tr>`).join('')}
    </tbody></table>`}</div>`;
  }).join('')}
  `;
}

/* ================= HABITS ================= */
function renderHabits(){
  const today=todayStr();
  const h=DB.habits[today]||{};
  const last7=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return localDateStr(d);}).reverse();
  const weeklyAvg=last7.reduce((a,d)=>a+habitScore(d),0)/7;
  return `
  <div class="grid g2">
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Today's Habits — ${today}</div>
      ${HABITS.map(hb=>`<div class="checkbox-row"><input type="checkbox" id="hab_${hb.replace(/\\W/g,'')}" data-action="toggleHabit" data-habit="${esc(hb)}" ${h[hb]?'checked':''}> ${esc(hb)}</div>`).join('')}
    </div>
    <div class="card">
      <div class="label">Daily Score</div>
      <div class="value" style="font-size:28px;">${habitScore(today).toFixed(0)}%</div>
      <div class="bar"><span style="width:${habitScore(today)}%"></span></div>
      <div class="label" style="margin-top:16px;">Weekly Habit %</div>
      <div class="value" style="font-size:22px;">${weeklyAvg.toFixed(0)}%</div>
      <div style="display:flex;gap:4px;margin-top:8px;align-items:flex-end;height:60px;">
      ${last7.map(d=>`<div style="flex:1;background:var(--accent-600);opacity:${0.3+habitScore(d)/150};height:${Math.max(6,habitScore(d))}%;border-radius:4px 4px 0 0;" title="${d}: ${habitScore(d).toFixed(0)}%"></div>`).join('')}
      </div>
      <div class="sub" style="margin-top:4px;">Last 7 days</div>
    </div>
  </div>`;
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
  <div class="card" style="overflow-x:auto;">
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
  <div class="grid g2"><div class="card"><canvas id="mockScoreChart" height="180"></canvas></div><div class="card"><canvas id="mockAccChart" height="180"></canvas></div></div>`:''}
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
  <div class="card" style="overflow-x:auto;">
  ${DB.pyq.length===0?'<div class="emptystate">No PYQ papers logged yet.</div>':`
  <table><thead><tr><th>Paper</th><th>Year</th><th>Score</th><th>Accuracy</th><th>Status</th><th></th></tr></thead><tbody>
  ${DB.pyq.map(p=>`<tr><td>${esc(p.paper)}</td><td>${esc(p.year)}</td><td>${p.score}</td><td>${p.accuracy}%</td><td><span class="pill ${pillClass(p.status)}">${p.status}</span></td><td><button class="icon-only" data-action="deletePyq" data-id="${p.id}">🗑</button></td></tr>`).join('')}
  </tbody></table>`}
  </div>`;
}

/* ================= ERROR LOG ================= */
function ensureErrorForm(){if(!formTemp.error)formTemp.error={question:'',subject:subjectKeys()[0]||'',topic:'',why:'',concept:'',revisionNeeded:true,fixed:false};}
function renderErrors(){
  ensureErrorForm(); const f=formTemp.error;
  const ms=mistakeStats();
  return `
  <div class="grid g4">
    <div class="card stat"><div class="label">Total Mistakes</div><div class="value">${ms.total}</div></div>
    <div class="card stat"><div class="label">Fixed</div><div class="value">${ms.fixed}</div></div>
    <div class="card stat"><div class="label">Pending</div><div class="value">${ms.pending}</div></div>
    <div class="card stat"><div class="label">Resolution %</div><div class="value">${ms.pct.toFixed(0)}%</div></div>
  </div>
  <div class="card" style="margin-top:12px;"><div class="bar"><span style="width:${ms.pct}%"></span></div></div>
  <div class="section-title"><h2>Top 5 Topics with Most Mistakes</h2></div>
  <div class="card">${ms.top5.length===0?'<div class="emptystate">Not enough data yet.</div>':
  ms.top5.map(t=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px;"><span>${esc(t[0])}</span><span class="tag high">${t[1]}</span></div>`).join('')}
  </div>
  <div class="section-title"><h2>Add to Mistake Notebook</h2></div>
  <div class="card">
    <div class="label" style="margin-bottom:10px;">New Entry</div>
    <div class="formgrid">
      <label>Question <input type="text" id="e_question" value="${esc(f.question)}"></label>
      <label>Subject <select id="e_subject">${subjectKeys().map(k=>`<option value="${k}" ${f.subject===k?'selected':''}>${esc(subjLabel(k))}</option>`).join('')}</select></label>
      <label>Topic <input type="text" id="e_topic" value="${esc(f.topic)}"></label>
      <label style="flex-direction:row;align-items:center;gap:6px;">Revision needed <input type="checkbox" id="e_revisionNeeded" ${f.revisionNeeded?'checked':''}></label>
      <label>Why Wrong <textarea id="e_why">${esc(f.why)}</textarea></label>
      <label>Correct Concept <textarea id="e_concept">${esc(f.concept)}</textarea></label>
    </div>
    <button class="btn" data-action="saveError">Add Entry</button>
  </div>
  <div class="section-title"><h2>Mistake Notebook</h2><span class="hint">${DB.errors.length} entries</span></div>
  <div class="card" style="overflow-x:auto;">
  ${DB.errors.length===0?'<div class="emptystate">No mistakes logged yet — good, but stay honest with yourself.</div>':`
  <table><thead><tr><th>Question</th><th>Subject</th><th>Topic</th><th>Fixed?</th><th></th></tr></thead><tbody>
  ${DB.errors.map(e=>`<tr><td style="max-width:220px;">${esc(e.question)}</td><td>${esc(subjLabel(e.subject))}</td><td>${esc(e.topic)}</td>
  <td><input type="checkbox" data-action="toggleErrorFixed" data-id="${e.id}" ${e.fixed?'checked':''}></td>
  <td><button class="icon-only" data-action="deleteError" data-id="${e.id}">🗑</button></td></tr>`).join('')}
  </tbody></table>`}
  </div>`;
}

/* ================= ANALYTICS ================= */
function renderAnalytics(){
  const days=[...Array(91)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(90-i));return localDateStr(d);});
  const maxH=Math.max(1,...days.map(d=>hoursOn(d)));
  const p=paceMeter();
  return `
  <div class="section-title"><h2>Study Pace Meter</h2><span class="hint">Day ${daysElapsed()} of 365</span></div>
  <div class="card">
    <div class="flexbetween"><div class="value" style="font-size:20px;">${p.ic} ${p.status}</div><span class="tag ${p.cls}">${p.gap>=0?'+':''}${p.gap} topics</span></div>
    <div class="grid g3" style="margin-top:12px;">
      <div class="sub">Expected Completed<br><b style="color:var(--text);">${p.expected}</b></div>
      <div class="sub">Actual Completed<br><b style="color:var(--text);">${p.actual}</b></div>
      <div class="sub">Gap<br><b style="color:var(--text);">${p.gap>=0?'+':''}${p.gap}</b></div>
    </div>
  </div>
  <div class="section-title"><h2>Charts</h2></div>
  <div class="grid g2">
    <div class="card"><div class="label" style="margin-bottom:8px;">Hours per Subject</div><canvas id="subjHoursChart" height="200"></canvas></div>
    <div class="card"><div class="label" style="margin-bottom:8px;">Hours per Week (last 8 weeks)</div><canvas id="weekHoursChart" height="200"></canvas></div>
  </div>
  <div class="section-title"><h2>Study Heatmap</h2><span class="hint">Last 91 days</span></div>
  <div class="card">
    <div class="heatmap">${days.map(d=>{const h=hoursOn(d);const op=h===0?0.06:Math.min(1,0.25+h/maxH*0.75);return `<div class="heatcell" title="${d}: ${h.toFixed(1)}h" style="background:rgba(179,22,79,${op});"></div>`;}).join('')}</div>
  </div>
  <div class="section-title"><h2>Topic Completion Trend</h2></div>
  <div class="grid g3">
    ${subjectKeys().map(k=>{const st=subjectStats(k);return `<div class="card"><div class="label">${esc(subjLabel(k))}</div><div class="bar"><span style="width:${st.pct}%"></span></div><div class="sub">${st.pct.toFixed(0)}% complete</div></div>`;}).join('')}
  </div>
  <div class="section-title"><h2>Consistency</h2></div>
  <div class="grid g3">
    <div class="card stat"><div class="label">Consistency % (91d)</div><div class="value">${(days.filter(d=>hoursOn(d)>0).length/91*100).toFixed(0)}%</div></div>
    <div class="card stat"><div class="label">Avg Daily Study</div><div class="value">${(totalHours()/Math.max(1,daysElapsed())).toFixed(2)}h</div></div>
    <div class="card stat"><div class="label">Days with Zero Study</div><div class="value">${daysElapsed()-daysStudied()}</div></div>
  </div>`;
}

/* ================= REVIEWS ================= */
function renderReviews(){
  const today=todayStr();
  const todaySessions=DB.sessions.filter(s=>s.date===today);
  const th=todaySessions.reduce((a,b)=>a+Number(b.hours||0),0);
  const topicsCovered=[...new Set(todaySessions.map(s=>s.topic).filter(Boolean))];
  const qS=todaySessions.reduce((a,b)=>a+Number(b.qSolved||0),0), qC=todaySessions.reduce((a,b)=>a+Number(b.qCorrect||0),0);
  const acc=qS?(qC/qS*100).toFixed(0)+'%':'—';
  const weak=allTopics().filter(t=>t.confidence<=2).map(t=>t.name).slice(0,5);

  const now=new Date(); const weekAgo=new Date(); weekAgo.setDate(now.getDate()-7);
  const weekSessions=DB.sessions.filter(s=>new Date(s.date)>=weekAgo);
  const weekHours=weekSessions.reduce((a,b)=>a+Number(b.hours||0),0);
  const bySubjWeek={}; weekSessions.forEach(s=>{bySubjWeek[s.subject]=(bySubjWeek[s.subject]||0)+Number(s.hours||0);});
  const neglected=subjectKeys().filter(k=>!bySubjWeek[k]);
  const sortedSubj=Object.keys(bySubjWeek).sort((a,b)=>bySubjWeek[b]-bySubjWeek[a]);
  const strongest=sortedSubj[0]?subjLabel(sortedSubj[0]):'—';
  const weakest=neglected[0]?subjLabel(neglected[0]):(sortedSubj[sortedSubj.length-1]?subjLabel(sortedSubj[sortedSubj.length-1]):'—');

  const monthAgo=new Date(); monthAgo.setDate(now.getDate()-30);
  const monthSessions=DB.sessions.filter(s=>new Date(s.date)>=monthAgo);
  const monthHours=monthSessions.reduce((a,b)=>a+Number(b.hours||0),0);
  const monthMocks=DB.mocks.filter(m=>new Date(m.date)>=monthAgo);

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

  <div class="section-title"><h2>Weekly Review</h2></div>
  <div class="card review-block">Total hours (7d): ${weekHours.toFixed(1)}h
Subjects neglected: ${neglected.length?neglected.map(k=>subjLabel(k)).join(', '):'None — solid coverage'}
Strongest subject this week: ${strongest}
Weakest / most neglected: ${weakest}
Consistency score: ${(new Set(weekSessions.map(s=>s.date)).size/7*100).toFixed(0)}%
Recommendation: ${neglected.length?'Rotate in '+subjLabel(neglected[0])+' before Sunday.':'Maintain current rotation, add a mock test.'}</div>

  <div class="section-title"><h2>Monthly Review</h2></div>
  <div class="card review-block">Study hours (30d): ${monthHours.toFixed(1)}h
Syllabus completion: ${syllabusPct().toFixed(1)}%
Revision completion: ${revisionPct().toFixed(1)}%
Mock tests this month: ${monthMocks.length}${monthMocks.length?', avg score '+(monthMocks.reduce((a,b)=>a+Number(b.score||0),0)/monthMocks.length).toFixed(1):''}
Top achievement: ${totalHours()>=100?'Crossed 100 hours total':'Building the habit foundation'}
Next month goal: Push syllabus completion past ${Math.min(100,Math.ceil(syllabusPct()/10)*10+10)}%</div>
  `;
}

/* ================= WEEKLY STUDY PLAN / WEEKLY ANALYTICS =================
   Monday–Sunday weekly summary, built on the same primitives as the daily
   History archive (hoursOn/questionsOn/effectiveTargetFor). Reports are
   generated live for the current (in-progress) week, and auto-saved into
   DB.weeklyReports once a week has actually finished, via the same
   day-rollover heartbeat used for checkDayRollover — so old weeks stay
   viewable even as DB.sessions keeps growing. ---- */
function weekStartOf(dateStr){
  const d=new Date(dateStr+'T00:00:00');
  const diff=(d.getDay()+6)%7; // days since Monday (getDay: 0=Sun..6=Sat)
  d.setDate(d.getDate()-diff);
  return localDateStr(d);
}
function weekDatesFrom(weekStartStr){
  return [...Array(7)].map((_,i)=>{const d=new Date(weekStartStr+'T00:00:00');d.setDate(d.getDate()+i);return localDateStr(d);});
}
function buildWeeklyStats(weekStartStr){
  const days=weekDatesFrom(weekStartStr);
  const today=todayStr();
  const dailyBreakdown=days.map(dt=>{
    const hours=hoursOn(dt), questions=questionsOn(dt), target=effectiveTargetFor(dt);
    return {date:dt,hours,questions,target,goalPct:target?Math.min(100,hours/target*100):0,isFuture:dt>today};
  });
  const pastDays=dailyBreakdown.filter(d=>!d.isFuture);
  const subjSet=new Set();
  DB.sessions.forEach(s=>{if(days.includes(s.date))subjSet.add(s.subject);});
  const studiedDays=pastDays.filter(d=>d.hours>0);
  return {
    weekStart:weekStartStr, weekEnd:days[6], dailyBreakdown,
    hours:dailyBreakdown.reduce((a,b)=>a+b.hours,0),
    questions:dailyBreakdown.reduce((a,b)=>a+b.questions,0),
    subjectsStudied:[...subjSet].map(k=>subjLabel(k)),
    goalCompletionPct:pastDays.length?pastDays.reduce((a,b)=>a+b.goalPct,0)/pastDays.length:0,
    consistencyPct:pastDays.length?studiedDays.length/pastDays.length*100:0,
    bestDay:studiedDays.length?studiedDays.reduce((a,b)=>b.hours>a.hours?b:a):null,
    weakestDay:pastDays.length?pastDays.reduce((a,b)=>b.hours<a.hours?b:a):null
  };
}
function weeklyInsights(stats,prevReport){
  const out=[];
  if(stats.consistencyPct>=85)out.push('Strong consistency this week — you studied almost every day.');
  else if(stats.consistencyPct<50)out.push('You studied on fewer than half the days this week — consistency needs work.');
  if(stats.weakestDay&&stats.weakestDay.hours===0)out.push(`${stats.weakestDay.date} had no study logged.`);
  const neglected=subjectKeys().filter(k=>!stats.subjectsStudied.includes(subjLabel(k)));
  if(neglected.length)out.push(`Not touched this week: ${neglected.map(k=>subjLabel(k)).join(', ')}.`);
  if(prevReport){
    const hDiff=stats.hours-prevReport.hours;
    if(Math.abs(hDiff)>=0.5)out.push(`Study hours ${hDiff>0?'up':'down'} ${Math.abs(hDiff).toFixed(1)}h vs last week.`);
    const qDiff=stats.questions-prevReport.questions;
    if(qDiff!==0)out.push(`Questions solved ${qDiff>0?'up':'down'} by ${Math.abs(qDiff)} vs last week.`);
  }
  if(!out.length)out.push('No notable patterns this week — keep the pace steady.');
  return out;
}
function buildFullWeeklyReport(weekStartStr){
  const stats=buildWeeklyStats(weekStartStr);
  const prevWeekStart=weekStartOf(localDateStr(new Date(new Date(weekStartStr+'T00:00:00').getTime()-86400000)));
  const prevReport=(DB.weeklyReports||[]).find(r=>r.weekStart===prevWeekStart);
  const comparedToPrev=prevReport?{hoursDiff:+(stats.hours-prevReport.hours).toFixed(2),questionsDiff:stats.questions-prevReport.questions,goalCompletionDiff:+(stats.goalCompletionPct-prevReport.goalCompletionPct).toFixed(1)}:null;
  return {weekStart:stats.weekStart,weekEnd:stats.weekEnd,dailyBreakdown:stats.dailyBreakdown,
    hours:+stats.hours.toFixed(2),questions:stats.questions,subjectsStudied:stats.subjectsStudied,
    goalCompletionPct:+stats.goalCompletionPct.toFixed(1),consistencyPct:+stats.consistencyPct.toFixed(1),
    bestDay:stats.bestDay,weakestDay:stats.weakestDay,comparedToPrev,insights:weeklyInsights(stats,prevReport)};
}
// Auto-generates and saves a report for the week that just ended, keyed by
// weekStart so old weeks remain viewable even as new sessions get logged.
function generateWeeklyReport(weekStartStr){
  const report=Object.assign({id:uid(),generatedAt:new Date().toISOString()},buildFullWeeklyReport(weekStartStr));
  DB.weeklyReports=(DB.weeklyReports||[]).filter(r=>r.weekStart!==weekStartStr);
  DB.weeklyReports.push(report);
  DB.weeklyReports.sort((a,b)=>b.weekStart.localeCompare(a.weekStart));
  if(DB.weeklyReports.length>104)DB.weeklyReports=DB.weeklyReports.slice(0,104);
  scheduleSave();
  return report;
}
// Runs alongside checkDayRollover: once the calendar has moved into a new
// week, save a report for the week that just finished.
function checkWeeklyRollover(){
  const curWeekStart=weekStartOf(todayStr());
  const last=DB.meta.lastWeeklyReportCheck;
  if(last&&last!==curWeekStart){
    generateWeeklyReport(last);
    DB.meta.lastWeeklyReportCheck=curWeekStart;
    scheduleSave();
  }else if(!last){
    DB.meta.lastWeeklyReportCheck=curWeekStart;
    scheduleSave();
  }
}
function renderWeeklyReportBody(r){
  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const cmp=r.comparedToPrev;
  return `
  <div class="grid g3">
    <div class="card stat"><div class="label">Hours Studied</div><div class="value">${r.hours.toFixed(1)}h</div>${cmp?`<div class="sub">${cmp.hoursDiff>=0?'+':''}${cmp.hoursDiff.toFixed(1)}h vs last week</div>`:''}</div>
    <div class="card stat"><div class="label">Questions Solved</div><div class="value">${r.questions}</div>${cmp?`<div class="sub">${cmp.questionsDiff>=0?'+':''}${cmp.questionsDiff} vs last week</div>`:''}</div>
    <div class="card stat"><div class="label">Goal Completion</div><div class="value">${r.goalCompletionPct.toFixed(0)}%</div>${cmp?`<div class="sub">${cmp.goalCompletionDiff>=0?'+':''}${cmp.goalCompletionDiff.toFixed(0)}% vs last week</div>`:''}</div>
  </div>
  <div class="grid g2" style="margin-top:10px;">
    <div class="card stat"><div class="label">Weekly Consistency</div><div class="value">${r.consistencyPct.toFixed(0)}%</div></div>
    <div class="card stat"><div class="label">Subjects Studied</div><div class="value" style="font-size:14px;">${r.subjectsStudied.length?esc(r.subjectsStudied.join(', ')):'None yet'}</div></div>
  </div>
  <div class="card" style="margin-top:10px;overflow-x:auto;">
    <div class="label" style="margin-bottom:8px;">Daily Breakdown (${r.weekStart} → ${r.weekEnd})</div>
    <table><thead><tr><th>Day</th><th>Date</th><th>Hours</th><th>Questions</th><th>Goal %</th></tr></thead><tbody>
    ${r.dailyBreakdown.map((d,i)=>`<tr${d.isFuture?' style="opacity:.4;"':''}><td>${dayNames[i]}</td><td>${d.date}</td><td>${d.hours.toFixed(1)}</td><td>${d.questions}</td><td>${d.goalPct.toFixed(0)}%</td></tr>`).join('')}
    </tbody></table>
  </div>
  <div class="grid g2" style="margin-top:10px;">
    <div class="card"><div class="label">Best Day</div><div class="sub" style="margin-top:6px;">${r.bestDay?esc(r.bestDay.date)+' — '+r.bestDay.hours.toFixed(1)+'h':'Not enough data yet'}</div></div>
    <div class="card"><div class="label">Weakest Day</div><div class="sub" style="margin-top:6px;">${r.weakestDay?esc(r.weakestDay.date)+' — '+r.weakestDay.hours.toFixed(1)+'h':'Not enough data yet'}</div></div>
  </div>
  <div class="section-title"><h2>Weekly Insights</h2></div>
  <div class="card">${r.insights.map(i=>`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">💡 ${esc(i)}</div>`).join('')}</div>`;
}
function renderWeeklyPast(){
  const reports=(DB.weeklyReports||[]).slice().sort((a,b)=>b.weekStart.localeCompare(a.weekStart));
  return `<div class="section-title"><h2>Past Weekly Reports</h2><span class="hint">${reports.length} saved</span></div>
  <div class="card" style="overflow-x:auto;">
  ${reports.length===0?'<div class="emptystate">No past weekly reports yet — one saves automatically once a week finishes.</div>':`
  <table><thead><tr><th>Week</th><th>Hours</th><th>Questions</th><th>Goal %</th><th>Consistency</th><th></th></tr></thead><tbody>
  ${reports.map(r=>`<tr><td>${r.weekStart} → ${r.weekEnd}</td><td>${r.hours.toFixed(1)}h</td><td>${r.questions}</td><td>${r.goalCompletionPct.toFixed(0)}%</td><td>${r.consistencyPct.toFixed(0)}%</td>
  <td><button class="btn ghost sm" data-action="viewWeeklyReport" data-id="${r.id}">View</button></td></tr>`).join('')}
  </tbody></table>`}
  </div>`;
}
function renderWeeklyPage(){
  const live=buildFullWeeklyReport(weekStartOf(todayStr()));
  return `<div class="section-title"><h2>This Week</h2><span class="hint">${live.weekStart} → ${live.weekEnd} · in progress</span></div>
  <div class="card" style="margin-bottom:10px;">
    <button class="btn sm" data-action="saveWeeklyReportNow">💾 Save Snapshot Now</button>
    <span class="sub" style="margin-left:8px;">This week finalizes and archives automatically once it ends — this just saves a snapshot early if you want one.</span>
  </div>
  ${renderWeeklyReportBody(live)}
  ${renderWeeklyPast()}`;
}

/* ================= STUDY NOTES (quick notes + formulas + vocab) ================= */
function ensureExtrasTemp(){if(!formTemp.formula)formTemp.formula={text:''}; if(!formTemp.vocab)formTemp.vocab={word:'',meaning:''};}
function renderStudyNotes(){
  ensureExtrasTemp();
  return `
  <div class="card">
    <div class="label" style="margin-bottom:8px;">Quick Notes</div>
    <textarea id="quickNotes" style="width:100%;min-height:130px;" placeholder="Jot anything down...">${esc(DB.notes.quick)}</textarea>
    <button class="btn sm" style="margin-top:8px;" data-action="saveQuickNotes">Save Notes</button>
  </div>
  <div class="grid g2" style="margin-top:14px;">
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Formula Book</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <input type="text" id="formulaInput" placeholder="e.g. CI = P(1+r/100)^t - P" style="flex:1;" value="${esc(formTemp.formula.text)}">
        <button class="btn sm" data-action="addFormula">Add</button>
      </div>
      <div style="max-height:220px;overflow-y:auto;">
      ${DB.notes.formulas.length===0?'<div class="emptystate">No formulas saved yet.</div>':DB.notes.formulas.map(fm=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);"><span style="font-size:12.5px;">${esc(fm.text)}</span><button class="icon-only" data-action="deleteFormula" data-id="${fm.id}">🗑</button></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Vocabulary Book</div>
      <div class="formgrid" style="grid-template-columns:1fr 1fr;">
        <input type="text" id="vocabWord" placeholder="Word" value="${esc(formTemp.vocab.word)}">
        <input type="text" id="vocabMeaning" placeholder="Meaning" value="${esc(formTemp.vocab.meaning)}">
      </div>
      <button class="btn sm" data-action="addVocab">Add Word</button>
      <div style="max-height:190px;overflow-y:auto;margin-top:8px;">
      ${DB.notes.vocab.length===0?'<div class="emptystate">No words saved yet.</div>':DB.notes.vocab.map(v=>`<div class="flexbetween" style="padding:6px 0;border-bottom:1px solid var(--border);"><span style="font-size:12.5px;"><b>${esc(v.word)}</b> — ${esc(v.meaning)}</span><button class="icon-only" data-action="deleteVocab" data-id="${v.id}">🗑</button></div>`).join('')}
      </div>
    </div>
  </div>
  `;
}

/* ================= SETTINGS ================= */
function renderSettingsPage(){
  const dark=document.documentElement.classList.contains('dark');
  const accent=DB.meta.accent||'maroon';
  const swatches=[['maroon','#b3164f'],['rose','#e91e63'],['berry','#9c2861'],['crimson','#b3212d']];
  return `
  <div class="section-title"><h2>Profile</h2></div>
  <div class="card">
    <div class="settings-row">
      <div><div class="srlabel">Your Name</div><div class="srhint">Used to personalize AtlasTrackIt for you — no account or login involved</div></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input type="text" id="profileNameInput" placeholder="e.g. Gitika" maxlength="40" style="width:160px;" value="${esc(DB.profile.name||'')}">
        <button class="btn ghost sm" data-action="saveProfileName">Save</button>
      </div>
    </div>
  </div>

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
      <div><div class="srlabel">Sound Notification</div><div class="srhint">Play a louder ~5-second alarm when a session ends (stops as soon as you return to the tab or touch the timer)</div></div>
      <label class="checkbox-row"><input type="checkbox" data-action="togglePomoSound" ${DB.meta.pomoSound?'checked':''}></label>
    </div>
    <div class="settings-row">
      <div><div class="srlabel">Browser Notification</div><div class="srhint">Show a system notification when a session ends and the tab isn't active${typeof Notification!=='undefined'&&Notification.permission==='denied'?' — currently blocked; enable notifications for this site in your browser settings to receive them':''}${typeof Notification!=='undefined'&&Notification.permission==='default'&&DB.meta.pomoNotify?' — not yet allowed by your browser; click Enable to turn them on':''}</div></div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${typeof Notification!=='undefined'&&Notification.permission==='default'&&DB.meta.pomoNotify?'<button class="btn sm" data-action="requestPomoNotifyPermission">Enable</button>':''}
        <label class="checkbox-row"><input type="checkbox" data-action="togglePomoNotify" ${DB.meta.pomoNotify?'checked':''}></label>
      </div>
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
let pomo={seconds:25*60,running:false,mode:'Work',interval:null,targetEndTs:null,endTimeoutHandle:null};
let studyTimer={seconds:0,running:false}; // tracks total elapsed "Work" seconds today, feeds the dashboard ring
const SESSION_TYPES=['Study','Revision','Practice Questions','Mock Test'];
// The Subject/Topic/Sub-topic/Session Type the current Pomodoro session is being
// logged under. Set once via the Start Study Session dialog, then stays active
// across every Work/Break cycle until the user ends the session or switches it —
// this is what fixes study time being silently attributed to the wrong subject.
let activeStudySession={active:false,subjectKey:'',subjectLabel:'',topicId:'',topicName:'',subtopic:'',sessionType:'Study',startedAt:''};

function savePomoState(){
  try{
    localStorage.setItem(POMO_LS_KEY,JSON.stringify({
      mode:pomo.mode,seconds:pomo.seconds,running:pomo.running,
      ts:Date.now(),targetEndTs:pomo.running?pomo.targetEndTs:null,
      studySeconds:studyTimer.seconds,studyDate:todayStr(),
      activeStudySession
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
    pomoSavedDate=s.studyDate||todayStr();
    if(s.activeStudySession&&typeof s.activeStudySession==='object'){
      activeStudySession=Object.assign({active:false,subjectKey:'',subjectLabel:'',topicId:'',topicName:'',subtopic:'',sessionType:'Study',startedAt:''},s.activeStudySession);
    }
    if(pomo.running&&pomo.mode==='Work'&&!activeStudySession.active){
      // A Work-mode timer was running with no linked subject — this is exactly the
      // state that used to get silently logged under the first subject in the list.
      // Stop it here instead; the next Start click will require picking a subject.
      pomo.running=false; studyTimer.running=false; pomo.targetEndTs=null;
    }
    if(pomo.running){
      // Reconstruct the exact wall-clock moment this phase should end (prefer the
      // persisted value; fall back to deriving it from the old ts+seconds shape
      // so state saved before this fix still loads correctly), then catch up
      // using the same real-time sync used while the app stays open — this
      // covers the page being closed/refreshed just like it covers a
      // background tab, instead of a separate elapsed-seconds calculation.
      pomo.targetEndTs=typeof s.targetEndTs==='number'?s.targetEndTs:(s.ts?s.ts+pomo.seconds*1000:Date.now()+pomo.seconds*1000);
      studyTimer.running=(pomo.mode==='Work');
      syncPomoFromClock();
      if(pomo.seconds<=0){
        // missed the session-end transition while away; settle into a fresh
        // session in the current mode rather than guessing how many cycles passed
        pomo.seconds=pomoDurationSeconds(pomo.mode);
        pomo.targetEndTs=Date.now()+pomo.seconds*1000;
        pomo.running=false;
        studyTimer.running=false;
      }
    }
  }catch(e){/* ignore malformed state */}
}
function finalizeDay(oldDate){
  if(!oldDate||oldDate===todayStr())return;
  const alreadyArchived=(DB.history||[]).some(h=>h.date===oldDate);
  if(!alreadyArchived){
    // flush any live, not-yet-logged Pomodoro time for the old day into a real session,
    // correctly attributed to whatever the active study session actually was — so it
    // counts toward Total Study Hours / Streak / History under the right subject
    if(studyTimer.seconds>0)flushActiveStudySegment(oldDate);
    const studyHours=hoursOn(oldDate);
    const target=effectiveTargetFor(oldDate);
    const goalPct=target?Math.min(100,Math.round(studyHours/target*100)):0;
    const questionsSolved=questionsOn(oldDate);
    const revisionsCompleted=allTopics().filter(t=>t.lastRevisionDate===oldDate).length;
    DB.history=(DB.history||[]).filter(h=>h.date!==oldDate);
    DB.history.push({date:oldDate,studyHours,goalPct,questionsSolved,revisionsCompleted});
    DB.history.sort((a,b)=>b.date.localeCompare(a.date));
    if(DB.history.length>730)DB.history=DB.history.slice(0,730);
  }
  // Reset today's live counters whenever a new day has been detected — this must run
  // every time, independent of the archive-duplication guard above, otherwise a leftover
  // live Pomodoro counter from oldDate can survive and get added into today's progress.
  // A new calendar day is also a natural session boundary, so the active study
  // session ends here too — the next Pomodoro will ask for Subject/Topic again.
  activeStudySession={active:false,subjectKey:'',subjectLabel:'',topicId:'',topicName:'',subtopic:'',sessionType:'Study',startedAt:''};
  studyTimer.seconds=0; studyTimer.running=false;
  stopAlarm(); clearInterval(pomo.interval); clearTimeout(pomo.endTimeoutHandle); pomo.running=false; pomo.mode='Work'; pomo.seconds=pomoDurationSeconds('Work'); pomo.targetEndTs=null;
  savePomoState(); scheduleSave();
}
function checkDayRollover(){
  const today=todayStr();
  const last=DB.meta.lastActiveDate;
  if(last&&last!==today){
    // a new calendar day has begun since AtlasTrackIt was last active:
    // archive yesterday's stats into Study History and reset today's live counters
    finalizeDay(last);
    DB.meta.lastActiveDate=today;
    scheduleSave();
    render();
  }else if(!last){
    // legacy save with no lastActiveDate yet — start tracking from today
    DB.meta.lastActiveDate=today;
    scheduleSave();
  }
}
let pomoAlarmCtx=null, pomoAlarmOscillators=[], pomoAlarmStopTimeout=null;
// Browsers only let an AudioContext produce sound if it was created/resumed during
// a real user gesture (a click). The alarm itself always fires later from a
// background setTimeout with no gesture of its own, so creating a fresh
// AudioContext right there (as this used to do) starts it 'suspended' and it
// never actually plays — especially after the tab has sat idle through a whole
// session. Fix: unlock ONE context during a genuine click (see pomoStartPause)
// and keep reusing that same instance for every alarm from then on.
function ensurePomoAudioUnlocked(){
  try{
    if(!pomoAlarmCtx)pomoAlarmCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(pomoAlarmCtx.state==='suspended')pomoAlarmCtx.resume().catch(()=>{});
  }catch(e){/* Web Audio not available */}
}
function playAlarm(){
  if(!DB.meta.pomoSound)return;
  stopAlarm(); // never let two alarms overlap
  try{
    ensurePomoAudioUnlocked(); // safety net in case Start was never clicked as a real gesture (e.g. restored running state)
    const ctx=pomoAlarmCtx;
    if(!ctx)return;
    const totalSeconds=5, beepLen=0.35, gap=0.22;
    let t=ctx.currentTime;
    const end=t+totalSeconds;
    while(t<end){
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='square'; o.frequency.value=880; // brighter/louder-feeling than the old sine beep
      g.gain.setValueAtTime(0.0001,t);
      g.gain.exponentialRampToValueAtTime(0.9,t+0.03);
      g.gain.exponentialRampToValueAtTime(0.0001,t+beepLen);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t+beepLen+0.05);
      pomoAlarmOscillators.push(o);
      t+=beepLen+gap;
    }
    pomoAlarmStopTimeout=setTimeout(stopAlarm,(totalSeconds+0.3)*1000);
  }catch(e){/* audio not available */}
}
function stopAlarm(){
  if(pomoAlarmStopTimeout){clearTimeout(pomoAlarmStopTimeout); pomoAlarmStopTimeout=null;}
  pomoAlarmOscillators.forEach(o=>{try{o.stop();}catch(e){/* already stopped */}});
  pomoAlarmOscillators=[];
  // pomoAlarmCtx is intentionally kept open/alive here (not closed) so it stays
  // reusable for the next alarm — closing and recreating it every time was
  // exactly what forced each new alarm to start from an unlocked 'suspended' state.
}
function notifySessionEnd(nextMode){
  if(!DB.meta.pomoNotify)return;
  if(typeof Notification==='undefined')return;
  if(!document.hidden)return; // only notify when the tab isn't active
  // Only fire if permission was already granted. Browsers require a genuine user
  // gesture (a click) to show the permission prompt — requesting it here, from a
  // background setTimeout, is silently ignored by the browser (no prompt, no
  // grant), which is why notifications could look "enabled" via the checkbox yet
  // never actually appear. The only place permission can really be requested is
  // the Settings toggle / "Enable" button below, both real clicks.
  if(Notification.permission==='granted'){
    new Notification('AtlasTrackIt',{body:nextMode==='Break'?'Study session complete — time for a break!':'Break over — back to studying.'});
  }
  // Note: if Notification.permission is 'denied', the browser will never
  // prompt again — the user must re-enable notifications for this site in
  // their browser settings, there's no way for the page to force it.
}
function pomoDurationSeconds(mode){return (mode==='Work'?(DB.meta.pomoWork||25):(DB.meta.pomoBreak||5))*60;}

// Recomputes pomo.seconds (and the study-time credit) from the real wall-clock
// target end time instead of trusting a plain per-tick decrement. This is what
// keeps the countdown accurate even when the regular 1s interval gets throttled
// by the browser in a background/inactive tab and fires late or less often.
function syncPomoFromClock(){
  if(!pomo.running||!pomo.targetEndTs)return;
  const remainingSec=Math.max(0,Math.round((pomo.targetEndTs-Date.now())/1000));
  const elapsedSec=Math.max(0,pomo.seconds-remainingSec);
  if(elapsedSec>0&&pomo.mode==='Work'&&studyTimer.running)studyTimer.seconds+=elapsedSec;
  pomo.seconds=remainingSec;
}
// Schedules a one-shot timer aimed precisely at the real end-of-phase moment.
// A single setTimeout for the exact remaining duration is far more reliable in
// a backgrounded tab than waiting for a repeating 1s setInterval to notice —
// browsers still throttle it once a tab has been hidden for several minutes
// (Chrome, for example, can delay background timers to roughly once a
// minute), but it fires much closer to on-time than the old tick-counting
// approach, and the alarm/notification will still go off without needing the
// tab to be brought to the front first.
function pomoScheduleEndTimeout(){
  clearTimeout(pomo.endTimeoutHandle);
  if(!pomo.running||!pomo.targetEndTs)return;
  pomo.endTimeoutHandle=setTimeout(pomoPhaseEnd,Math.max(0,pomo.targetEndTs-Date.now()));
}
function pomoPhaseEnd(){
  if(!pomo.running)return; // guard against a stale timeout firing after a pause/reset
  syncPomoFromClock();
  playAlarm();
  const finishedMode=pomo.mode;
  const nextMode=finishedMode==='Work'?'Break':'Work';
  notifySessionEnd(nextMode);
  if(DB.meta.pomoAutoTransition){
    pomo.mode=nextMode; pomo.seconds=pomoDurationSeconds(nextMode);
    studyTimer.running=(nextMode==='Work');
    pomo.targetEndTs=Date.now()+pomo.seconds*1000;
    pomoScheduleEndTimeout();
  }else{
    pomo.running=false; clearInterval(pomo.interval); clearTimeout(pomo.endTimeoutHandle);
    pomo.mode=nextMode; pomo.seconds=pomoDurationSeconds(nextMode);
    studyTimer.running=false;
  }
  updateStudySessionUI();
  savePomoState();
}
// Lightweight UI heartbeat — while the tab is visible this just re-syncs the
// on-screen countdown from the clock every second (self-correcting any drift
// instead of compounding it); pomoPhaseEnd is normally triggered by the
// dedicated end-timeout above, but it's called here too as a fallback in case
// that timeout was ever missed, so the display never gets stuck at 0:00.
function pomoTick(){
  checkDayRollover();
  if(!pomo.running)return;
  syncPomoFromClock();
  if(pomo.seconds<=0){ pomoPhaseEnd(); return; }
  updateStudySessionUI();
  savePomoState();
}
// Sets the active Subject/Topic/Sub-topic/Session Type context and remembers it
// as the default for next time — called once when a study session starts (or
// when switching mid-session), never repeatedly for every Pomodoro/break cycle.
function beginActiveStudySession(subjectKey,topicId,topicName,subtopic,sessionType){
  activeStudySession={active:true,subjectKey,subjectLabel:subjLabel(subjectKey),topicId,topicName,subtopic,sessionType,startedAt:new Date().toISOString()};
  DB.meta.lastSessionSubjectKey=subjectKey; DB.meta.lastSessionTopicId=topicId; DB.meta.lastSessionTopicName=topicName;
  DB.meta.lastSessionSubtopic=subtopic; DB.meta.lastSessionType=sessionType;
  scheduleSave(); savePomoState();
}
// Logs everything accumulated in studyTimer.seconds as one correctly-categorized
// DB.sessions record (Subject/Topic/Sub-topic/Session Type/start/end/date), then
// clears the bucket. Called when a session ends, switches, or on a day rollover —
// never per-Pomodoro, so one continuous study session stays one log entry.
// dateOverride lets a day-rollover flush log under the day the time was actually
// earned, rather than the new "today".
function flushActiveStudySegment(dateOverride){
  if(studyTimer.seconds<=0)return;
  const hours=+(studyTimer.seconds/3600).toFixed(4);
  const endDate=new Date();
  const startDate=activeStudySession.startedAt?new Date(activeStudySession.startedAt):new Date(endDate.getTime()-studyTimer.seconds*1000);
  const pad=n=>String(n).padStart(2,'0');
  const fmtHM=dt=>`${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  const sessionType=activeStudySession.sessionType||'Study';
  DB.sessions.push({
    id:uid(),date:dateOverride||todayStr(),start:fmtHM(startDate),end:fmtHM(endDate),hours,
    subject:activeStudySession.subjectKey||subjectKeys()[0]||'',
    topic:activeStudySession.topicName||'Pomodoro Session',
    subtopic:activeStudySession.subtopic||'',
    qSolved:0,qCorrect:0,qWrong:0,
    source:'Pomodoro timer',mood:'Okay',energy:'Medium',focus:3,distractions:'',breakMin:0,
    revisionDone:sessionType==='Revision',mockDone:sessionType==='Mock Test',
    wins:'',problems:'',tomorrow:'',quickEdit:true,pomoLogged:true,sessionType
  });
  // Feed the same hours into the topic's tracked time so Subjects/Analytics (which
  // read topic.timeSpent) reflect real Pomodoro study, not only manual entries.
  if(activeStudySession.subjectKey&&activeStudySession.topicId&&DB.subjects[activeStudySession.subjectKey]){
    const topic=DB.subjects[activeStudySession.subjectKey].topics.find(x=>x.id===activeStudySession.topicId);
    if(topic)topic.timeSpent=+((Number(topic.timeSpent)||0)+hours).toFixed(2);
  }
  studyTimer.seconds=0;
  activeStudySession.startedAt=new Date().toISOString(); // fresh start for whatever segment comes next
  scheduleSave(); savePomoState();
}
// The "Start Study Session" / "Switch Subject" dialog — same form either way,
// asked once per session rather than before every Pomodoro. Pre-fills the last
// used Subject/Topic/Sub-topic/Session Type (or the current session's, when
// switching) so the user can just confirm or tweak instead of retyping.
function openStudySessionModal(opts){
  opts=opts||{};
  const isSwitch=opts.mode==='switch';
  const keys=subjectKeys();
  if(!keys.length){ alert('Add a subject first (Study → Subjects) before starting a study session.'); return; }
  const defaultKey=(opts.subjectKey&&DB.subjects[opts.subjectKey])?opts.subjectKey:((DB.meta.lastSessionSubjectKey&&DB.subjects[DB.meta.lastSessionSubjectKey])?DB.meta.lastSessionSubjectKey:keys[0]);
  const defaultTopicId=opts.topicId!==undefined?opts.topicId:(DB.meta.lastSessionTopicId||'');
  const defaultSubtopic=opts.subtopic!==undefined?opts.subtopic:(DB.meta.lastSessionSubtopic||'');
  const defaultType=opts.sessionType||DB.meta.lastSessionType||'Study';
  openModal(`<h3>${isSwitch?'🔁 Switch Subject / Session':'🎯 Start Study Session'}</h3>
  <p class="sub" style="margin:0 0 10px;">${isSwitch?"Time so far will be logged under the current topic first, then the timer keeps running under the new one.":"This stays active through every Pomodoro and break until you end or switch it — no need to re-enter it each cycle."}</p>
  <div class="formgrid" style="grid-template-columns:1fr;">
    <label>Subject
      <select id="ss_subject" data-action="subjectFieldChange" data-prefix="ss">
        ${keys.map(k=>`<option value="${k}" ${k===defaultKey?'selected':''}>${esc(subjLabel(k))}</option>`).join('')}
      </select>
    </label>
    <label>Topic <span id="ss_topic_wrap">${topicFieldHtml(defaultKey,'ss',defaultTopicId)}</span></label>
    <label>Sub-topic (optional) <input type="text" id="ss_subtopic" placeholder="e.g. Prime Factorization" value="${esc(defaultSubtopic)}"></label>
    <label>Session Type
      <select id="ss_type">
        ${SESSION_TYPES.map(t=>`<option value="${esc(t)}" ${t===defaultType?'selected':''}>${esc(t)}</option>`).join('')}
      </select>
    </label>
  </div>
  <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="${isSwitch?'confirmSwitchStudySession':'confirmStartStudySession'}">${isSwitch?'Switch & Continue':'Start'}</button></div>`);
}
function pomoStartPause(){
  stopAlarm(); // interacting with the timer is one of the ways to silence the alarm
  ensurePomoAudioUnlocked(); // must happen inside this real click so the alarm can play later, from a background timer with no gesture of its own
  pomo.running=!pomo.running;
  if(pomo.running){
    if(pomo.mode==='Work')studyTimer.running=true;
    pomo.targetEndTs=Date.now()+pomo.seconds*1000;
    pomo.interval=setInterval(pomoTick,1000);
    pomoScheduleEndTimeout();
  }else{
    syncPomoFromClock(); // capture the exact remaining time at the moment of pausing
    clearInterval(pomo.interval); clearTimeout(pomo.endTimeoutHandle);
    studyTimer.running=false;
  }
  updateStudySessionUI();
  savePomoState();
}
function pomoReset(){
  stopAlarm();
  clearInterval(pomo.interval); clearTimeout(pomo.endTimeoutHandle);
  pomo.running=false; studyTimer.running=false;
  pomo.mode='Work'; pomo.seconds=pomoDurationSeconds('Work'); pomo.targetEndTs=null;
  updateStudySessionUI();
  savePomoState();
}
function updateStudySessionUI(){
  const timerEl=document.getElementById('studySessionTimer'); if(timerEl)timerEl.textContent=fmtTime(pomo.seconds);
  const modeEl=document.getElementById('studySessionMode'); if(modeEl)modeEl.textContent=pomo.mode==='Work'?'🎯 Study Session':'☕ Break';
  const startBtn=document.getElementById('studySessionStartBtn'); if(startBtn)startBtn.textContent=pomo.running?'Pause':'Start';
  const totalEl=document.getElementById('studySessionTotal'); if(totalEl)totalEl.textContent='Today: '+fmtHrsMin(todayStudyTime());
  // keep the Today's Goal card and progress ring in sync live, without a full re-render
  const goalValueEl=document.getElementById('todayGoalValue');
  if(goalValueEl)goalValueEl.textContent=todayStudyTime().toFixed(1)+' / '+todayTarget()+'h';
  const ringWrap=document.getElementById('todayRingWrap');
  if(ringWrap){
    const target=todayTarget();
    const pct=Math.min(100,target?todayStudyTime()/target*100:0);
    const circle=ringWrap.querySelector('.ring-progress');
    if(circle){
      const r=50,c=2*Math.PI*r;
      circle.setAttribute('stroke-dashoffset',c-(pct/100)*c);
    }
    const b=ringWrap.querySelector('.ring-label b')||ringWrap.parentElement.querySelector('.ring-label b');
    if(b)b.textContent=todayStudyTime().toFixed(1)+'h';
  }
}

/* ================= MODAL ================= */
function openModal(html){document.getElementById('modalRoot').innerHTML=`<div class="modal-overlay" data-action="closeModalBg"><div class="modal" data-stop>${html}</div></div>`;}
function closeModal(){document.getElementById('modalRoot').innerHTML='';}

/* ================= PROFILE (name only — no accounts, no login) ================= */
function maybeShowNamePrompt(){
  if(DB.profile&&DB.profile.name)return; // already have a name — never ask again
  openModal(`<h3>Welcome to AtlasTrackIt</h3>
  <p class="sub" style="margin:0 0 10px;">What should I call you?</p>
  <input type="text" id="firstNameInput" placeholder="e.g. Gitika" maxlength="40" style="width:100%;">
  <div class="row"><button class="btn" data-action="saveFirstName">Continue</button></div>`);
}

/* ================= MOBILE SIDEBAR ================= */
function openMobileSidebar(){document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('show');}
function closeMobileSidebar(){document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('show');}

/* ================= EVENT HANDLING ================= */
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
  if(t.dataset.action==='subjectFieldChange'){
    const prefix=t.dataset.prefix;
    const wrap=document.getElementById(prefix+'_topic_wrap');
    if(wrap)wrap.innerHTML=topicFieldHtml(t.value,prefix);
  }
  if(t.dataset.action==='topicSelectChange'){
    const prefix=t.dataset.prefix;
    const custom=document.getElementById(prefix+'_topic_custom');
    if(custom){
      if(t.value==='__custom__'){ custom.style.display='block'; custom.focus(); }
      else custom.style.display='none';
    }
  }
  if(t.dataset.action==='goalStatus'){ const g=DB.goals.find(x=>x.id===t.dataset.id); g.status=t.value; scheduleSave(); render(); }
  if(t.dataset.action==='goalProgress'){ const g=DB.goals.find(x=>x.id===t.dataset.id); g.progress=Number(t.value); scheduleSave(); render(); }
  if(t.dataset.action==='setPriority'){ DB.subjects[t.dataset.key].priority=t.value; scheduleSave(); render(); }
  if(t.dataset.action==='toggleHabit'){ const d=todayStr(); DB.habits[d]=DB.habits[d]||{}; DB.habits[d][t.dataset.habit]=t.checked; scheduleSave(); render(); }
  if(t.dataset.action==='toggleErrorFixed'){ const er=DB.errors.find(x=>x.id===t.dataset.id); er.fixed=t.checked; if(t.checked)er.dateRevised=todayStr(); scheduleSave(); render(); }
  if(t.dataset.action==='setTarget'){ DB.meta.targetHoursToday=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='setQuestionTarget'){ DB.meta.questionTarget=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='setMockTarget'){ DB.meta.mockTargetScore=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='toggleTask'){ const d=todayStr(); const task=(DB.tasks[d]||[]).find(x=>x.id===t.dataset.id); if(task){task.done=t.checked; task.completedAt=t.checked?new Date().toISOString():''; scheduleSave(); render();} }
  if(t.dataset.action==='setPomoWork'){ DB.meta.pomoWork=Number(t.value)||25; if(!pomo.running&&pomo.mode==='Work'){pomo.seconds=DB.meta.pomoWork*60;} scheduleSave(); savePomoState(); render(); }
  if(t.dataset.action==='setPomoBreak'){ DB.meta.pomoBreak=Number(t.value)||5; if(!pomo.running&&pomo.mode==='Break'){pomo.seconds=DB.meta.pomoBreak*60;} scheduleSave(); savePomoState(); render(); }
  if(t.dataset.action==='togglePomoAuto'){ DB.meta.pomoAutoTransition=t.checked; scheduleSave(); }
  if(t.dataset.action==='togglePomoSound'){ DB.meta.pomoSound=t.checked; scheduleSave(); }
  if(t.dataset.action==='togglePomoNotify'){
    DB.meta.pomoNotify=t.checked; scheduleSave();
    if(t.checked && typeof Notification!=='undefined' && Notification.permission==='default'){
      Notification.requestPermission().then(()=>render());
    }else{
      render();
    }
  }
  if(t.id==='importFile'){ importDataFromFile(t); }
});
document.addEventListener('input',e=>{
  if(e.target.id==='searchInput') doSearch(e.target.value);
  if(e.target.id==='atlasInput') autosizeAtlasInput(e.target);
});
document.addEventListener('keydown',e=>{
  if(e.target && e.target.id==='atlasInput' && e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    if(!atlasWaiting)atlasSendMessage();
  }
});
// Returning to the tab is one of the ways to silence the alarm, and it also
// snaps the on-screen countdown back to the true remaining time immediately
// rather than waiting for the next (possibly still-throttled) tick — the
// dedicated end-timeout in pomoScheduleEndTimeout already handles firing the
// alarm/notification on time while hidden; this is just the "welcome back"
// catch-up for the UI and a safety net in the rare case that timeout was
// itself delayed past the point of returning.
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)return;
  stopAlarm();
  checkScheduledRevisionReminders();
  if(!pomo.running)return;
  syncPomoFromClock();
  if(pomo.seconds<=0){ pomoPhaseEnd(); }
  else{ updateStudySessionUI(); savePomoState(); }
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
  if(action==='requestPomoNotifyPermission'){
    if(typeof Notification!=='undefined')Notification.requestPermission().then(()=>render());
    return;
  }
  if(action==='atlasChip'){
    if(atlasWaiting)return;
    const ta=document.getElementById('atlasInput');
    if(ta){ta.value=d.text; ta.focus(); autosizeAtlasInput(ta);}
    return;
  }
  if(action==='atlasSend'){ atlasSendMessage(); return; }
  if(action==='saveFirstName'){
    const val=(document.getElementById('firstNameInput').value||'').trim();
    if(!val){alert('Please enter a name to continue.'); return;}
    DB.profile.name=val.slice(0,40); scheduleSave(); closeModal(); render(); return;
  }
  if(action==='saveProfileName'){
    const val=(document.getElementById('profileNameInput').value||'').trim();
    DB.profile.name=val.slice(0,40); scheduleSave(); render(); return;
  }
  if(action==='saveWeeklyReportNow'){
    generateWeeklyReport(weekStartOf(todayStr()));
    render();
    return;
  }
  if(action==='viewWeeklyReport'){
    const r=(DB.weeklyReports||[]).find(x=>x.id===d.id);
    if(!r)return;
    openModal(`<h3>Weekly Report — ${esc(r.weekStart)} → ${esc(r.weekEnd)}</h3>
    <div style="max-height:65vh;overflow:auto;">${renderWeeklyReportBody(r)}</div>
    <div class="row" style="margin-top:12px;"><button class="btn ghost" data-action="closeModal">Close</button></div>`);
    return;
  }
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
  if(action==='openSubject'){openSubject=d.key; render(); return;}
  if(action==='closeSubject'){openSubject=null; render(); return;}
  if(action==='addRevision'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    if(topic.revisions<5){
      topic.revisions++; topic.lastRevisionDate=todayStr(); if(topic.status==='Completed')topic.status='Revised';
      DB.revisionLog=DB.revisionLog||[];
      DB.revisionLog.push({id:uid(),kind:'topic',name:topic.name,subject:subjLabel(d.key),revNum:topic.revisions,date:todayStr(),completedAt:new Date().toISOString()});
      scheduleSave(); render();
    }
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
  /* ---- Legacy freeform revision reminders (no longer created via the UI —
     Schedule Revision is the single add-flow — but still completable/deletable
     so nothing a user already entered is lost) ---- */
  if(action==='completeCustomRevision'){
    const item=(DB.customRevisions||[]).find(c=>c.id===d.id);
    if(item){
      DB.revisionLog=DB.revisionLog||[];
      const name=item.text+(item.subtopic?' — '+item.subtopic:'');
      DB.revisionLog.push({id:uid(),kind:'custom',name,subject:item.subject||'',revNum:item.revNum||null,date:todayStr(),completedAt:new Date().toISOString()});
    }
    DB.customRevisions=(DB.customRevisions||[]).filter(c=>c.id!==d.id);
    scheduleSave(); render(); return;
  }
  if(action==='deleteCustomRevision'){
    if(!confirm('Remove this revision reminder?'))return;
    DB.customRevisions=(DB.customRevisions||[]).filter(c=>c.id!==d.id);
    scheduleSave(); render(); return;
  }
  // Dismisses one auto-suggested spaced-repetition reminder (Rev N for this
  // topic). It stays hidden only for that specific revision number — once the
  // topic is actually marked revised, revisions advances and the next
  // reminder (Rev N+1) is unaffected and will still show up as normal.
  if(action==='dismissAutoRevision'){
    DB.dismissedRevisions=DB.dismissedRevisions||[];
    DB.dismissedRevisions.push({topicId:d.topic,revNum:Number(d.revnum)});
    scheduleSave(); render(); return;
  }
  /* ---- Scheduled Revisions: planned in advance (Subject + Topic + date/time + note) ---- */
  if(action==='openScheduleRevision'){
    const firstKey=subjectKeys()[0]||'';
    openModal(`<h3>📅 Schedule a Revision</h3>
    <p class="sub" style="margin:0 0 10px;">Plan a revision in advance — it'll show up under Today's Revisions once it's due, with an optional reminder.</p>
    <div class="formgrid" style="grid-template-columns:1fr;">
      <label>Subject
        <select id="sr2_subject" data-action="subjectFieldChange" data-prefix="sr2">
          ${subjectKeys().map(k=>`<option value="${k}">${esc(subjLabel(k))}</option>`).join('')}
          <option value="">Other / not tracked</option>
        </select>
      </label>
      <label>Topic <span id="sr2_topic_wrap">${topicFieldHtml(firstKey,'sr2')}</span></label>
      <label>Sub-topic (optional) <input type="text" id="sr2_subtopic" placeholder="e.g. Prime Factorization"></label>
      <div class="grid g2" style="gap:10px;">
        <label>Revision Number (optional) <input type="number" min="1" id="sr2_revnum" placeholder="e.g. 1"></label>
        <label>Revision Date <input type="date" id="sr2_date" value="${todayStr()}" min="${MIN_DATE}"></label>
      </div>
      <label>Time (optional) <input type="time" id="sr2_time"></label>
      <label>Notes (optional) <textarea id="sr2_note" placeholder="Anything to remember for this revision"></textarea></label>
    </div>
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveScheduleRevision">Schedule Revision</button></div>`);
    return;
  }
  if(action==='saveScheduleRevision'){
    const subjectKey=document.getElementById('sr2_subject').value;
    const {topicId,topicName}=readTopicField('sr2',subjectKey);
    if(!topicName){alert('Please choose or enter a topic to revise.'); return;}
    const subtopic=document.getElementById('sr2_subtopic').value.trim();
    const revNum=document.getElementById('sr2_revnum').value?Number(document.getElementById('sr2_revnum').value):null;
    const date=document.getElementById('sr2_date').value||todayStr();
    const time=document.getElementById('sr2_time').value||'';
    const note=document.getElementById('sr2_note').value.trim();
    DB.scheduledRevisions=DB.scheduledRevisions||[];
    DB.scheduledRevisions.push({
      id:uid(),subjectKey:subjectKey||'',subjectLabel:subjectKey?subjLabel(subjectKey):'',
      topicId:topicId||'',topicName,subtopic,revNum,date,time,note,
      status:'Scheduled',createdAt:new Date().toISOString(),completedAt:'',notifiedAt:''
    });
    scheduleSave(); closeModal(); render(); return;
  }
  if(action==='markScheduledRevisionDone'){
    const item=(DB.scheduledRevisions||[]).find(s=>s.id===d.id);
    if(!item)return;
    item.status='Completed'; item.completedAt=new Date().toISOString();
    let revNum=item.revNum||null;
    if(item.subjectKey&&item.topicId&&DB.subjects[item.subjectKey]){
      const topic=DB.subjects[item.subjectKey].topics.find(x=>x.id===item.topicId);
      if(topic&&topic.revisions<5){
        topic.revisions++; topic.lastRevisionDate=todayStr(); if(topic.status==='Completed')topic.status='Revised';
        revNum=item.revNum||topic.revisions;
      }
    }
    DB.revisionLog=DB.revisionLog||[];
    const name=item.topicName+(item.subtopic?' — '+item.subtopic:'');
    DB.revisionLog.push({id:uid(),kind:'scheduled',name,subject:item.subjectLabel||'',revNum,date:todayStr(),completedAt:item.completedAt});
    scheduleSave(); render(); return;
  }
  if(action==='skipScheduledRevision'){
    const item=(DB.scheduledRevisions||[]).find(s=>s.id===d.id);
    if(item){ item.status='Skipped'; item.skippedAt=new Date().toISOString(); scheduleSave(); render(); }
    return;
  }
  if(action==='openRescheduleRevision'){
    const item=(DB.scheduledRevisions||[]).find(s=>s.id===d.id);
    if(!item)return;
    openModal(`<h3>🔁 Reschedule Revision</h3>
    <p class="sub" style="margin:0 0 10px;">${esc(item.topicName)}${item.subjectLabel?' · '+esc(item.subjectLabel):''}</p>
    <div class="formgrid" style="grid-template-columns:1fr 1fr;">
      <label>New Date <input type="date" id="sr2_reschedule_date" value="${item.date}" min="${MIN_DATE}"></label>
      <label>Time (optional) <input type="time" id="sr2_reschedule_time" value="${item.time||''}"></label>
    </div>
    <div class="row"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn" data-action="saveRescheduleRevision" data-id="${item.id}">Save</button></div>`);
    return;
  }
  if(action==='saveRescheduleRevision'){
    const item=(DB.scheduledRevisions||[]).find(s=>s.id===d.id);
    if(!item)return;
    item.date=document.getElementById('sr2_reschedule_date').value||item.date;
    item.time=document.getElementById('sr2_reschedule_time').value||'';
    item.status='Scheduled'; item.notifiedAt='';
    scheduleSave(); closeModal(); render(); return;
  }
  if(action==='deleteScheduledRevision'){
    if(!confirm('Delete this scheduled revision?'))return;
    DB.scheduledRevisions=(DB.scheduledRevisions||[]).filter(s=>s.id!==d.id);
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
      <label>Accent Color <input type="color" id="subjColorInput" value="${subjColor(d.key)||'#b3164f'}" style="width:100%;height:36px;padding:2px;"></label>
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
  if(action==='saveError'){
    const g=id=>document.getElementById(id);
    if(!g('e_question').value.trim())return;
    DB.errors.push({id:uid(),question:g('e_question').value,subject:g('e_subject').value,topic:g('e_topic').value,why:g('e_why').value,concept:g('e_concept').value,revisionNeeded:g('e_revisionNeeded').checked,fixed:false,dateRevised:''});
    delete formTemp.error; scheduleSave(); render(); return;
  }
  if(action==='deleteError'){DB.errors=DB.errors.filter(x=>x.id!==d.id); scheduleSave(); render(); return;}
  if(action==='saveQuickNotes'){DB.notes.quick=document.getElementById('quickNotes').value; scheduleSave(); return;}
  if(action==='addFormula'){
    const v=document.getElementById('formulaInput').value.trim(); if(!v)return;
    DB.notes.formulas.push({id:uid(),text:v}); formTemp.formula.text=''; scheduleSave(); render(); return;
  }
  if(action==='deleteFormula'){DB.notes.formulas=DB.notes.formulas.filter(x=>x.id!==d.id); scheduleSave(); render(); return;}
  if(action==='addVocab'){
    const w=document.getElementById('vocabWord').value.trim(), m=document.getElementById('vocabMeaning').value.trim();
    if(!w)return;
    DB.notes.vocab.push({id:uid(),word:w,meaning:m}); formTemp.vocab={word:'',meaning:''}; scheduleSave(); render(); return;
  }
  if(action==='deleteVocab'){DB.notes.vocab=DB.notes.vocab.filter(x=>x.id!==d.id); scheduleSave(); render(); return;}
  /* ---- Study Session (Pomodoro) controls ---- */
  if(action==='pomoStart'){
    if(!pomo.running&&!activeStudySession.active){ openStudySessionModal(); return; } // ask once, before the first Pomodoro of a new session
    pomoStartPause(); return;
  }
  if(action==='pomoResetBtn'){
    if(!confirm('Reset the current Study Session timer?'))return;
    pomoReset(); return;
  }
  if(action==='openSwitchStudySession'){
    if(!activeStudySession.active){ openStudySessionModal(); return; }
    openStudySessionModal({mode:'switch',subjectKey:activeStudySession.subjectKey,topicId:activeStudySession.topicId,subtopic:activeStudySession.subtopic,sessionType:activeStudySession.sessionType});
    return;
  }
  if(action==='confirmStartStudySession'){
    const subjectKey=document.getElementById('ss_subject').value;
    const {topicId,topicName}=readTopicField('ss',subjectKey);
    if(!topicName){alert('Please choose or enter a topic to study.'); return;}
    const subtopic=document.getElementById('ss_subtopic').value.trim();
    const sessionType=document.getElementById('ss_type').value;
    beginActiveStudySession(subjectKey,topicId,topicName,subtopic,sessionType);
    closeModal();
    pomoStartPause(); // context is set — now actually start the timer
    render();
    return;
  }
  if(action==='confirmSwitchStudySession'){
    const subjectKey=document.getElementById('ss_subject').value;
    const {topicId,topicName}=readTopicField('ss',subjectKey);
    if(!topicName){alert('Please choose or enter a topic to study.'); return;}
    const subtopic=document.getElementById('ss_subtopic').value.trim();
    const sessionType=document.getElementById('ss_type').value;
    syncPomoFromClock(); // capture the very latest elapsed time before logging it
    flushActiveStudySegment(); // log time-so-far under the OLD subject/topic before switching
    beginActiveStudySession(subjectKey,topicId,topicName,subtopic,sessionType);
    closeModal(); render();
    return;
  }
  if(action==='endStudySession'){
    if(!activeStudySession.active)return;
    if(!confirm('End the current study session? Time so far will be logged under '+activeStudySession.subjectLabel+' · '+activeStudySession.topicName+'.'))return;
    syncPomoFromClock(); // capture the very latest elapsed time before logging it
    flushActiveStudySegment();
    activeStudySession={active:false,subjectKey:'',subjectLabel:'',topicId:'',topicName:'',subtopic:'',sessionType:'Study',startedAt:''};
    pomoReset();
    savePomoState(); render();
    return;
  }
  if(action==='setPomoPreset'){
    DB.meta.pomoWork=Number(d.work); DB.meta.pomoBreak=Number(d.break);
    if(!pomo.running){ pomo.mode='Work'; pomo.seconds=pomoDurationSeconds('Work'); }
    scheduleSave(); savePomoState(); render(); return;
  }
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
function doSearch(q){
  const box=document.getElementById('searchResults');
  q=q.trim().toLowerCase();
  if(!q){box.style.display='none';box.innerHTML='';return;}
  const results=[];
  allTopics().forEach(t=>{if(t.name.toLowerCase().includes(q))results.push(`<b>Topic</b> — ${esc(t.name)} (${esc(subjLabel(t.subject))})`);});
  DB.notes.formulas.forEach(f=>{if(f.text.toLowerCase().includes(q))results.push(`<b>Formula</b> — ${esc(f.text)}`);});
  DB.notes.vocab.forEach(v=>{if(v.word.toLowerCase().includes(q)||v.meaning.toLowerCase().includes(q))results.push(`<b>Vocab</b> — ${esc(v.word)}: ${esc(v.meaning)}`);});
  DB.goals.forEach(gl=>{if(gl.text.toLowerCase().includes(q))results.push(`<b>Goal</b> — ${esc(gl.text)}`);});
  if(!results.length){box.innerHTML='<div class="sres">No matches found.</div>';}
  else box.innerHTML=results.slice(0,12).map(r=>`<div class="sres">${r}</div>`).join('');
  box.style.display='block';
}

/* ================= CHARTS ================= */
function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}
function afterRenderHooks(){
  if(currentTab==='mocks'&&currentSubtab.mocks==='mocks'&&DB.mocks.length>=2){
    const sorted=[...DB.mocks].sort((a,b)=>a.number-b.number);
    destroyChart('mockScoreChart'); destroyChart('mockAccChart');
    const ctx1=document.getElementById('mockScoreChart'); const ctx2=document.getElementById('mockAccChart');
    if(ctx1)charts.mockScoreChart=new Chart(ctx1,{type:'line',data:{labels:sorted.map(m=>'M'+m.number),datasets:[{label:'Score',data:sorted.map(m=>m.score),borderColor:'#b3164f',backgroundColor:'rgba(179,22,79,.12)',tension:.3,fill:true}]},options:{plugins:{legend:{display:false},title:{display:true,text:'Score Improvement'}},scales:{y:{beginAtZero:true}}}});
    if(ctx2)charts.mockAccChart=new Chart(ctx2,{type:'line',data:{labels:sorted.map(m=>'M'+m.number),datasets:[{label:'Accuracy %',data:sorted.map(m=>m.attempted?(m.correct/m.attempted*100).toFixed(1):0),borderColor:'#0f9d68',backgroundColor:'rgba(15,157,104,.12)',tension:.3,fill:true}]},options:{plugins:{legend:{display:false},title:{display:true,text:'Accuracy Trend'}},scales:{y:{beginAtZero:true,max:100}}}});
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
    if(ctx2)charts.weekHoursChart=new Chart(ctx2,{type:'bar',data:{labels:weekLabels,datasets:[{label:'Hours',data:weekData,backgroundColor:'#b3164f',borderRadius:6}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
  }
}

/* ================= INIT ================= */
loadDB();
