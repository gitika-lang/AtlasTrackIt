/* ================= DATA MODEL ================= */
const STORAGE_KEY='ssc_cgl_state_v1';
const todayStr=()=>new Date().toISOString().slice(0,10);
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

function freshTopic(name){return {id:uid(),name,status:'Not Started',targetDate:'',completionDate:'',timeSpent:0,confidence:3,difficulty:'Medium',revisions:0,lastRevisionDate:'',notes:'',mistakes:''};}
function defaultState(){
  const subjects={};
  Object.keys(SYLLABUS).forEach(k=>{subjects[k]={priority:'Medium',topics:SYLLABUS[k].topics.map(freshTopic)};});
  return {
    meta:{startDate:todayStr(),dark:false,targetHoursToday:7,mockCounter:0,questionTarget:50000,mockTargetScore:200},
    sessions:[], subjects, goals:[], habits:{}, mocks:[], pyq:[], errors:[],
    notes:{quick:'',formulas:[],vocab:[]}, tasks:{}
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
      DB.notes=Object.assign({quick:'',formulas:[],vocab:[]},parsed.notes||{});
      // backfill any new syllabus topics not present (safe merge)
      Object.keys(SYLLABUS).forEach(k=>{
        if(!DB.subjects[k])DB.subjects[k]={priority:'Medium',topics:SYLLABUS[k].topics.map(freshTopic)};
      });
    }
  }catch(e){ /* no existing key yet */ }
  if(DB.meta.dark)document.documentElement.classList.add('dark');
  render();
  renderFloatingTimer();
  setInterval(tickFloatingTimer,1000);
}

/* ================= DERIVED STATS ================= */
function allTopics(){let t=[];Object.keys(DB.subjects).forEach(k=>t.push(...DB.subjects[k].topics.map(x=>({...x,subject:k}))));return t;}
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
  while(days.has(cursor.toISOString().slice(0,10))){streak++;cursor.setDate(cursor.getDate()-1);}
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
        out.push({name:t.name,subject:SYLLABUS[t.subject]?SYLLABUS[t.subject].label:t.subject,subjectKey:t.subject,due:due.toISOString().slice(0,10),revNum:t.revisions+1,topicId:t.id});
      }
    }
  });
  return out.sort((a,b)=>a.due.localeCompare(b.due));
}
/* ---- question counter ---- */
function questionsOn(dateStr){return DB.sessions.filter(s=>s.date===dateStr).reduce((a,b)=>a+Number(b.qSolved||0),0);}
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
  const ca=subjectStats('currentAffairs').pct;
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
  DB.errors.forEach(e=>{const key=(e.topic||'Unspecified')+' ('+(SYLLABUS[e.subject]?SYLLABUS[e.subject].label:e.subject)+')';byTopic[key]=(byTopic[key]||0)+1;});
  const top5=Object.entries(byTopic).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return {total,fixed,pending,pct:total?fixed/total*100:0,top5};
}
/* ---- smart daily review recommendations ---- */
function dailyRecommendations(){
  const today=todayStr(); const out=[];
  Object.keys(SYLLABUS).forEach(k=>{
    const subjSessions=DB.sessions.filter(s=>s.subject===k);
    const last=subjSessions.length?subjSessions.map(s=>s.date).sort().slice(-1)[0]:null;
    const gap=last?Math.floor((new Date(today)-new Date(last))/86400000):daysElapsed();
    if(daysElapsed()>gap && gap>=4)out.push(`You haven't studied ${SYLLABUS[k].label} for ${gap} days.`);
  });
  allTopics().filter(t=>t.confidence<=2).slice(0,2).forEach(t=>out.push(`${t.name} confidence is still low.`));
  const qToday=questionsOn(today);
  if(qToday>0)out.push(`You solved ${qToday} questions today.`);
  const caPct=subjectStats('currentAffairs').pct;
  if(caPct<syllabusPct()-10)out.push('Current Affairs needs attention.');
  const dueTomorrow=revisionQueue().filter(r=>{const t=new Date();t.setDate(t.getDate()+1);return r.due===t.toISOString().slice(0,10);});
  if(dueTomorrow.length)out.push(`Tomorrow prioritize revising ${dueTomorrow[0].name}.`);
  else{
    const weakest=allTopics().filter(t=>t.status!=='Completed'&&t.status!=='Revised').sort((a,b)=>a.confidence-b.confidence)[0];
    if(weakest)out.push(`Tomorrow prioritize ${weakest.name} (${SYLLABUS[weakest.subject].label}).`);
  }
  if(!out.length)out.push('No red flags today — keep the pace steady.');
  return out;
}
/* ---- live study time (logged + running floating timer) ---- */
function todayStudyTime(){return hoursOn(todayStr())+(studyTimer.running?studyTimer.seconds/3600:0);}

/* ================= RENDER SHELL ================= */
const TABS=[
  {id:'today',label:"Today's Mission",ic:'🚀'},
  {id:'dashboard',label:'Dashboard',ic:'⌂'},
  {id:'subjects',label:'Subjects & Syllabus',ic:'📚'},
  {id:'revision',label:'Revision Calendar',ic:'🔁'},
  {id:'log',label:'Daily Study Log',ic:'📝'},
  {id:'goals',label:'Targets',ic:'🎯'},
  {id:'habits',label:'Habit Tracker',ic:'✅'},
  {id:'mocks',label:'Mock Tests',ic:'🧪'},
  {id:'pyq',label:'PYQ Tracker',ic:'📄'},
  {id:'errors',label:'Error Log',ic:'⚠'},
  {id:'analytics',label:'Analytics',ic:'📊'},
  {id:'reviews',label:'Reviews',ic:'🗓'},
  {id:'extras',label:'Extras',ic:'✨'}
];
let currentTab='today';
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

function render(){
  renderNav();
  document.getElementById('pageTitle').textContent=TABS.find(t=>t.id===currentTab).label;
  document.getElementById('sideStreak').textContent=currentStreak()+' day streak';
  const view=document.getElementById('view');
  if(currentTab==='today')view.innerHTML=renderToday();
  else if(currentTab==='dashboard')view.innerHTML=renderDashboard();
  else if(currentTab==='subjects')view.innerHTML=renderSubjects();
  else if(currentTab==='revision')view.innerHTML=renderRevision();
  else if(currentTab==='log')view.innerHTML=renderLog();
  else if(currentTab==='goals')view.innerHTML=renderGoals();
  else if(currentTab==='habits')view.innerHTML=renderHabits();
  else if(currentTab==='mocks')view.innerHTML=renderMocks();
  else if(currentTab==='pyq')view.innerHTML=renderPyq();
  else if(currentTab==='errors')view.innerHTML=renderErrors();
  else if(currentTab==='analytics')view.innerHTML=renderAnalytics();
  else if(currentTab==='reviews')view.innerHTML=renderReviews();
  else if(currentTab==='extras')view.innerHTML=renderExtras();
  afterRenderHooks();
}

/* ================= DASHBOARD ================= */
function renderDashboard(){
  const today=todayStr();
  const th=hoursOn(today), tt=totalHours(), wk=hoursSince(7), mo=hoursSince(30);
  const target=DB.meta.targetHoursToday;
  const quote=QUOTES[new Date().getDate()%QUOTES.length];
  const yearPct=pctYear();
  const stats=[
    ['Total Study Hours',tt.toFixed(1)+'h',''],
    ["Today's Hours",th.toFixed(1)+'h','Target '+target+'h'],
    ['Weekly Hours',wk.toFixed(1)+'h','Last 7 days'],
    ['Monthly Hours',mo.toFixed(1)+'h','Last 30 days'],
    ['Days Studied',daysStudied(),'of '+daysElapsed()+' elapsed'],
    ['Current Streak',currentStreak()+' 🔥',''],
    ['Longest Streak',longestStreak(),''],
    ['Days Remaining',daysRemaining(),'of 365'],
  ];
  return `
  <div class="grid g4">
    ${stats.map(s=>`<div class="card stat"><div class="label">${s[0]}</div><div class="value">${s[1]}</div><div class="sub">${s[2]}</div></div>`).join('')}
  </div>
  <div class="grid g3" style="margin-top:14px;">
    <div class="card">
      <div class="label">Year Completed</div>
      <div class="value">${yearPct.toFixed(1)}%</div>
      <div class="bar"><span style="width:${yearPct}%"></span></div>
    </div>
    <div class="card">
      <div class="label">Syllabus Completion</div>
      <div class="value">${syllabusPct().toFixed(1)}%</div>
      <div class="bar"><span style="width:${syllabusPct()}%"></span></div>
    </div>
    <div class="card">
      <div class="label">Revision Completion</div>
      <div class="value">${revisionPct().toFixed(1)}%</div>
      <div class="bar"><span style="width:${revisionPct()}%"></span></div>
    </div>
  </div>
  <div class="grid g3" style="margin-top:14px;">
    <div class="card stat"><div class="label">Mock Tests Taken</div><div class="value">${DB.mocks.length}</div></div>
    <div class="card stat"><div class="label">Average Mock Score</div><div class="value">${mockAvg().toFixed(1)}</div></div>
    <div class="card stat"><div class="label">Highest Mock Score</div><div class="value">${mockHigh()}</div></div>
  </div>
  <div class="grid g3" style="margin-top:14px;align-items:stretch;">
    <div class="card" style="grid-column:span 1;">
      <div class="label" style="margin-bottom:10px;">Today's Progress</div>
      <div class="ring-wrap">
        ${ringSVG(Math.min(100,target?th/target*100:0))}
        <div class="ring-label"><b>${th.toFixed(1)}h</b><span>of ${target}h target</span></div>
      </div>
      <div class="flexbetween" style="margin-top:12px;">
        <label style="font-size:11px;color:var(--text-muted);">Adjust today's target</label>
        <input type="number" step="0.5" min="1" style="width:60px;" value="${target}" data-action="setTarget">
      </div>
    </div>
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Revision Due</div>
      ${revisionQueue().filter(r=>r.due<=today).length===0?`<div class="emptystate">Nothing due — great pacing.</div>`:
        `<div style="max-height:150px;overflow-y:auto;">${revisionQueue().filter(r=>r.due<=today).slice(0,6).map(r=>`<div style="font-size:12px;padding:5px 0;border-bottom:1px solid var(--border);">${esc(r.name)} <span class="sub" style="color:var(--text-faint);">· ${esc(r.subject)} · Rev ${r.revNum}</span></div>`).join('')}</div>`}
    </div>
    <div class="quote-box"><p>"${esc(quote)}"</p><span>Daily motivation · Day ${daysElapsed()} of 365</span></div>
  </div>
  <div class="section-title"><h2>Question Tracker</h2></div>
  <div class="grid g4">
    <div class="card stat"><div class="label">Solved Today</div><div class="value">${questionsOn(today)}</div></div>
    <div class="card stat"><div class="label">This Week</div><div class="value">${questionsSince(7)}</div></div>
    <div class="card stat"><div class="label">This Month</div><div class="value">${questionsSince(30)}</div></div>
    <div class="card stat"><div class="label">Total Solved</div><div class="value">${totalQuestionsSolved()}</div></div>
  </div>
  <div class="card" style="margin-top:14px;">
    <div class="flexbetween">
      <div class="label">Lifetime Target</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="sub">Target</span>
        <input type="number" step="500" min="1" style="width:80px;" value="${DB.meta.questionTarget}" data-action="setQuestionTarget">
      </div>
    </div>
    <div class="value" style="margin-top:6px;">${totalQuestionsSolved()} <span class="sub" style="font-size:13px;">/ ${DB.meta.questionTarget}</span></div>
    <div class="bar"><span style="width:${Math.min(100,totalQuestionsSolved()/Math.max(1,DB.meta.questionTarget)*100)}%"></span></div>
    <div class="sub" style="margin-top:4px;">${(totalQuestionsSolved()/Math.max(1,DB.meta.questionTarget)*100).toFixed(1)}% of lifetime target</div>
  </div>

  <div class="section-title"><h2>Study Pace Meter</h2><span class="hint">Day ${daysElapsed()} of 365</span></div>
  ${(()=>{const p=paceMeter();return `<div class="card">
    <div class="flexbetween"><div class="value" style="font-size:20px;">${p.ic} ${p.status}</div><span class="tag ${p.cls}">${p.gap>=0?'+':''}${p.gap} topics</span></div>
    <div class="grid g3" style="margin-top:12px;">
      <div class="sub">Expected Completed<br><b style="color:var(--text);">${p.expected}</b></div>
      <div class="sub">Actual Completed<br><b style="color:var(--text);">${p.actual}</b></div>
      <div class="sub">Gap<br><b style="color:var(--text);">${p.gap>=0?'+':''}${p.gap}</b></div>
    </div>
  </div>`;})()}

  <div class="section-title"><h2>Exam Readiness Score</h2></div>
  ${(()=>{const r=examReadiness();return `<div class="grid g3">
    <div class="card" style="text-align:center;">
      <div class="ring-wrap">${ringSVG(r.score)}<div class="ring-label"><b>${r.score.toFixed(0)}%</b><span>Readiness</span></div></div>
      <div style="margin-top:10px;"><span class="tag ${r.cls}">${r.label}</span></div>
    </div>
    <div class="card" style="grid-column:span 2;">
      <div class="label" style="margin-bottom:8px;">Score Breakdown</div>
      ${[['Syllabus Completion (30%)',r.syl],['Revision Completion (25%)',r.rev],['Mock Performance (20%)',r.mockPerf],['Study Consistency (15%)',r.consistency],['Current Affairs (10%)',r.ca]].map(x=>`<div style="margin-bottom:8px;"><div class="flexbetween"><span class="sub">${x[0]}</span><span class="sub">${x[1].toFixed(0)}%</span></div><div class="bar"><span style="width:${x[1]}%"></span></div></div>`).join('')}
    </div>
  </div>`;})()}

  <div class="section-title"><h2>Achievement Badges</h2></div>
  ${renderBadges()}
  `;
}
function ringSVG(pct){
  const r=50,c=2*Math.PI*r,off=c-(Math.min(100,pct)/100)*c;
  return `<svg width="120" height="120" viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${r}" stroke="var(--bg-soft)" stroke-width="10" fill="none"/>
    <circle cx="60" cy="60" r="${r}" stroke="var(--blue-600)" stroke-width="10" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
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

/* ================= TODAY'S MISSION ================= */
function renderToday(){
  const today=todayStr();
  const tasks=DB.tasks[today]||[];
  const doneCount=tasks.filter(t=>t.done).length;
  const pct=tasks.length?doneCount/tasks.length*100:0;
  const target=DB.meta.targetHoursToday;
  const th=todayStudyTime();
  const quote=QUOTES[new Date().getDate()%QUOTES.length];
  const dueToday=revisionQueue().filter(r=>r.due<=today);
  return `
  <div class="grid g3">
    <div class="card stat"><div class="label">Today's Study Target</div><div class="value">${target}h</div></div>
    <div class="card stat"><div class="label">Current Study Time Today</div><div class="value">${th.toFixed(1)}h</div></div>
    <div class="card stat"><div class="label">365-Day Countdown</div><div class="value">${daysRemaining()} days left</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px;align-items:stretch;">
    <div class="card">
      <div class="flexbetween"><div class="label">Today's Task Checklist</div><span class="sub">${doneCount} / ${tasks.length} Tasks Completed</span></div>
      <div class="bar" style="margin:8px 0 12px;"><span style="width:${pct}%"></span></div>
      ${tasks.length===0?'<div class="emptystate">No tasks yet — add your first mission below.</div>':
      tasks.map(t=>`<div class="checkbox-row" style="justify-content:space-between;">
        <label style="display:flex;align-items:center;gap:8px;flex:1;"><input type="checkbox" data-action="toggleTask" data-id="${t.id}" ${t.done?'checked':''}> <span style="${t.done?'text-decoration:line-through;color:var(--text-faint);':''}">${esc(t.text)}</span></label>
        <button class="icon-only" data-action="deleteTask" data-id="${t.id}">🗑</button>
      </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:12px;">
        <input type="text" id="newTaskInput" placeholder="e.g. Solve 100 Quant Questions" style="flex:1;">
        <button class="btn sm" data-action="addTask">Add</button>
      </div>
    </div>
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Due Revisions Today</div>
      ${dueToday.length===0?'<div class="emptystate">Nothing due — great pacing.</div>':
      `<div style="max-height:150px;overflow-y:auto;margin-bottom:14px;">${dueToday.slice(0,6).map(r=>`<div class="flexbetween" style="padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span>${esc(r.name)} <span class="sub" style="color:var(--text-faint);">· ${esc(r.subject)} · Rev ${r.revNum}</span></span>
        <button class="btn ghost sm" data-action="addRevision" data-topic="${r.topicId}" data-key="${r.subjectKey}">Mark Revised</button>
      </div>`).join('')}</div>`}
      <div class="label" style="margin-bottom:6px;">Quick Start Pomodoro</div>
      <div class="pomo-display" id="pomoDisplay" style="font-size:30px;">${fmtTime(pomo.seconds)}</div>
      <div class="pomo-controls">
        <button class="btn sm" data-action="pomoStart">${pomo.running?'Pause':'Start'}</button>
        <button class="btn ghost sm" data-action="pomoReset">Reset</button>
      </div>
    </div>
  </div>
  <div class="quote-box" style="margin-top:14px;"><p>"${esc(quote)}"</p><span>Daily motivation · Day ${daysElapsed()} of 365</span></div>
  `;
}

/* ================= REVISION CALENDAR ================= */
function renderRevision(){
  const q=revisionQueue();
  const today=todayStr();
  const tmr=new Date();tmr.setDate(tmr.getDate()+1);const tomorrowStr=tmr.toISOString().slice(0,10);
  const groups={Today:q.filter(r=>r.due<=today),Tomorrow:q.filter(r=>r.due===tomorrowStr),'Next 7 Days':q.filter(r=>r.due>tomorrowStr&&r.due<=new Date(Date.now()+7*86400000).toISOString().slice(0,10))};
  return Object.keys(groups).map(g=>{
    const items=groups[g];
    return `<div class="section-title"><h2>${g}</h2><span class="hint">${items.length} due</span></div>
    <div class="card">${items.length===0?'<div class="emptystate">Nothing here.</div>':
    `<table><thead><tr><th>Topic</th><th>Subject</th><th>Revision #</th><th>Due</th><th></th></tr></thead><tbody>
    ${items.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.subject)}</td><td>Rev ${r.revNum}</td><td>${r.due}</td>
    <td><button class="btn sm" data-action="addRevision" data-topic="${r.topicId}" data-key="${r.subjectKey}">Mark Revised</button></td></tr>`).join('')}
    </tbody></table>`}</div>`;
  }).join('');
}

/* ================= SUBJECTS ================= */
function renderSubjects(){
  if(openSubject) return renderSubjectDetail(openSubject);
  return `<div class="grid g3">
  ${Object.keys(SYLLABUS).map(k=>{
    const st=subjectStats(k);
    return `<div class="card subjectcard" data-action="openSubject" data-key="${k}">
      <div class="flexbetween"><h3 style="margin:0;font-size:14.5px;">${SYLLABUS[k].icon} ${SYLLABUS[k].label}</h3><span class="tag ${DB.subjects[k].priority==='High'?'high':DB.subjects[k].priority==='Low'?'low':'med'}">${DB.subjects[k].priority}</span></div>
      <div class="bar" style="margin-top:10px;"><span style="width:${st.pct}%"></span></div>
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
  const s=SYLLABUS[k]; const st=subjectStats(k); const topics=DB.subjects[k].topics;
  return `
  <button class="btn ghost sm" data-action="closeSubject" style="margin-bottom:12px;">← All subjects</button>
  <div class="flexbetween">
    <h2 style="margin:0;">${s.icon} ${s.label}</h2>
    <label style="font-size:12px;color:var(--text-muted);">Priority
      <select data-action="setPriority" data-key="${k}">
        ${['High','Medium','Low'].map(p=>`<option ${DB.subjects[k].priority===p?'selected':''}>${p}</option>`).join('')}
      </select>
    </label>
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
  <div class="card" style="overflow-x:auto;">
  <table><thead><tr>
    <th>Topic</th><th>Status</th><th>Target Date</th><th>Completion</th><th>Time (h)</th><th>Confidence</th><th>Difficulty</th><th>Revisions</th><th>Notes</th><th>Mistakes</th>
  </tr></thead><tbody>
  ${topics.map(t=>`<tr data-topic="${t.id}">
    <td style="min-width:160px;">${esc(t.name)}</td>
    <td><select data-field="status" data-topic="${t.id}" data-key="${k}">
      ${['Not Started','In Progress','Completed','Revised'].map(o=>`<option ${t.status===o?'selected':''}>${o}</option>`).join('')}
    </select></td>
    <td><input type="date" value="${t.targetDate}" data-field="targetDate" data-topic="${t.id}" data-key="${k}" style="width:130px;"></td>
    <td><input type="date" value="${t.completionDate}" data-field="completionDate" data-topic="${t.id}" data-key="${k}" style="width:130px;"></td>
    <td><input type="number" step="0.5" min="0" value="${t.timeSpent}" data-field="timeSpent" data-topic="${t.id}" data-key="${k}" style="width:60px;"></td>
    <td><select data-field="confidence" data-topic="${t.id}" data-key="${k}">${[1,2,3,4,5].map(n=>`<option ${t.confidence==n?'selected':''}>${n}</option>`).join('')}</select></td>
    <td><select data-field="difficulty" data-topic="${t.id}" data-key="${k}">${['Easy','Medium','Hard'].map(o=>`<option ${t.difficulty===o?'selected':''}>${o}</option>`).join('')}</select></td>
    <td>
      <span class="mono">${t.revisions}</span>
      <button class="icon-only" data-action="addRevision" data-topic="${t.id}" data-key="${k}" title="Log a revision">＋</button>
    </td>
    <td><button class="icon-only" data-action="openNote" data-topic="${t.id}" data-key="${k}" data-field="notes" title="Edit notes">📝${t.notes?'<span class=\"notes-preview\">'+esc(t.notes.slice(0,14))+'</span>':''}</button></td>
    <td><button class="icon-only" data-action="openNote" data-topic="${t.id}" data-key="${k}" data-field="mistakes" title="Edit mistakes">⚠${t.mistakes?'<span class=\"notes-preview\">'+esc(t.mistakes.slice(0,14))+'</span>':''}</button></td>
  </tr>`).join('')}
  </tbody></table>
  </div>`;
}

/* ================= DAILY LOG ================= */
function ensureLogForm(){
  if(!formTemp.log)formTemp.log={date:todayStr(),start:'',end:'',hours:'',subject:'quant',topic:'',subtopic:'',qSolved:'',qCorrect:'',qWrong:'',source:'',mood:'Okay',energy:'Medium',focus:3,distractions:'',breakMin:'',revisionDone:false,mockDone:false,wins:'',problems:'',tomorrow:''};
}
function renderLog(){
  ensureLogForm();
  const f=formTemp.log;
  const sorted=[...DB.sessions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40);
  return `
  <div class="card">
    <div class="label" style="margin-bottom:10px;">Quick Session Entry <span class="hint">— under 2 minutes</span></div>
    <div class="formgrid">
      <label>Date <input type="date" id="f_date" value="${f.date}"></label>
      <label>Start <input type="time" id="f_start" value="${f.start}"></label>
      <label>End <input type="time" id="f_end" value="${f.end}"></label>
      <label>Total Hours <input type="number" step="0.25" min="0" id="f_hours" value="${f.hours}" placeholder="auto or manual"></label>
      <label>Subject <select id="f_subject">${Object.keys(SYLLABUS).map(k=>`<option value="${k}" ${f.subject===k?'selected':''}>${SYLLABUS[k].label}</option>`).join('')}</select></label>
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
    return `<tr><td>${s.date}</td><td>${Number(s.hours).toFixed(1)}</td><td>${SYLLABUS[s.subject]?SYLLABUS[s.subject].label:s.subject}</td><td>${esc(s.topic)}</td><td>${s.qSolved||0}</td><td>${acc}</td><td>${s.mood}</td><td>${s.focus}</td>
    <td><button class="icon-only" data-action="deleteSession" data-id="${s.id}">🗑</button></td></tr>`;
  }).join('')}
  </tbody></table>`}
  </div>`;
}

/* ================= GOALS ================= */
function ensureGoalForm(){if(!formTemp.goal)formTemp.goal={type:'Weekly',text:'',deadline:'',priority:'Medium'};}
function renderGoals(){
  ensureGoalForm(); const f=formTemp.goal;
  const types=['Yearly','Monthly','Weekly','Daily'];
  return `
  <div class="card">
    <div class="label" style="margin-bottom:10px;">Add a Target</div>
    <div class="formgrid">
      <label>Type <select id="g_type">${types.map(t=>`<option ${f.type===t?'selected':''}>${t}</option>`).join('')}</select></label>
      <label>Goal <input type="text" id="g_text" value="${esc(f.text)}" placeholder="e.g. Finish Algebra by July 30"></label>
      <label>Deadline <input type="date" id="g_deadline" value="${f.deadline}"></label>
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
  const last7=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return d.toISOString().slice(0,10);}).reverse();
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
      ${last7.map(d=>`<div style="flex:1;background:var(--blue-600);opacity:${0.3+habitScore(d)/150};height:${Math.max(6,habitScore(d))}%;border-radius:4px 4px 0 0;" title="${d}: ${habitScore(d).toFixed(0)}%"></div>`).join('')}
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
      <label>Date <input type="date" id="m_date" value="${f.date}"></label>
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
function ensureErrorForm(){if(!formTemp.error)formTemp.error={question:'',subject:'quant',topic:'',why:'',concept:'',revisionNeeded:true,fixed:false};}
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
      <label>Subject <select id="e_subject">${Object.keys(SYLLABUS).map(k=>`<option value="${k}" ${f.subject===k?'selected':''}>${SYLLABUS[k].label}</option>`).join('')}</select></label>
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
  ${DB.errors.map(e=>`<tr><td style="max-width:220px;">${esc(e.question)}</td><td>${SYLLABUS[e.subject]?SYLLABUS[e.subject].label:e.subject}</td><td>${esc(e.topic)}</td>
  <td><input type="checkbox" data-action="toggleErrorFixed" data-id="${e.id}" ${e.fixed?'checked':''}></td>
  <td><button class="icon-only" data-action="deleteError" data-id="${e.id}">🗑</button></td></tr>`).join('')}
  </tbody></table>`}
  </div>`;
}

/* ================= ANALYTICS ================= */
function renderAnalytics(){
  const days=[...Array(91)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(90-i));return d.toISOString().slice(0,10);});
  const maxH=Math.max(1,...days.map(d=>hoursOn(d)));
  return `
  <div class="grid g2">
    <div class="card"><div class="label" style="margin-bottom:8px;">Hours per Subject</div><canvas id="subjHoursChart" height="200"></canvas></div>
    <div class="card"><div class="label" style="margin-bottom:8px;">Hours per Week (last 8 weeks)</div><canvas id="weekHoursChart" height="200"></canvas></div>
  </div>
  <div class="section-title"><h2>Study Heatmap</h2><span class="hint">Last 91 days</span></div>
  <div class="card">
    <div class="heatmap">${days.map(d=>{const h=hoursOn(d);const op=h===0?0.06:Math.min(1,0.25+h/maxH*0.75);return `<div class="heatcell" title="${d}: ${h.toFixed(1)}h" style="background:rgba(37,99,235,${op});"></div>`;}).join('')}</div>
  </div>
  <div class="section-title"><h2>Topic Completion Trend</h2></div>
  <div class="grid g3">
    ${Object.keys(SYLLABUS).map(k=>{const st=subjectStats(k);return `<div class="card"><div class="label">${SYLLABUS[k].label}</div><div class="bar"><span style="width:${st.pct}%"></span></div><div class="sub">${st.pct.toFixed(0)}% complete</div></div>`;}).join('')}
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
  const neglected=Object.keys(SYLLABUS).filter(k=>!bySubjWeek[k]);
  const sortedSubj=Object.keys(bySubjWeek).sort((a,b)=>bySubjWeek[b]-bySubjWeek[a]);
  const strongest=sortedSubj[0]?SYLLABUS[sortedSubj[0]].label:'—';
  const weakest=neglected[0]?SYLLABUS[neglected[0]].label:(sortedSubj[sortedSubj.length-1]?SYLLABUS[sortedSubj[sortedSubj.length-1]].label:'—');

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
Suggestion: ${th<DB.meta.targetHoursToday?"You are below today's target — consider a short focused session before bed.":"Target met — use spare time for revision."}</div>

  <div class="section-title"><h2>Weekly Review</h2></div>
  <div class="card review-block">Total hours (7d): ${weekHours.toFixed(1)}h
Subjects neglected: ${neglected.length?neglected.map(k=>SYLLABUS[k].label).join(', '):'None — solid coverage'}
Strongest subject this week: ${strongest}
Weakest / most neglected: ${weakest}
Consistency score: ${(new Set(weekSessions.map(s=>s.date)).size/7*100).toFixed(0)}%
Recommendation: ${neglected.length?'Rotate in '+SYLLABUS[neglected[0]].label+' before Sunday.':'Maintain current rotation, add a mock test.'}</div>

  <div class="section-title"><h2>Monthly Review</h2></div>
  <div class="card review-block">Study hours (30d): ${monthHours.toFixed(1)}h
Syllabus completion: ${syllabusPct().toFixed(1)}%
Revision completion: ${revisionPct().toFixed(1)}%
Mock tests this month: ${monthMocks.length}${monthMocks.length?', avg score '+(monthMocks.reduce((a,b)=>a+Number(b.score||0),0)/monthMocks.length).toFixed(1):''}
Top achievement: ${totalHours()>=100?'Crossed 100 hours total':'Building the habit foundation'}
Next month goal: Push syllabus completion past ${Math.min(100,Math.ceil(syllabusPct()/10)*10+10)}%</div>
  `;
}

/* ================= EXTRAS ================= */
let pomo={seconds:25*60,running:false,mode:'Work',interval:null};
function ensureExtrasTemp(){if(!formTemp.formula)formTemp.formula={text:''}; if(!formTemp.vocab)formTemp.vocab={word:'',meaning:''};}
function renderExtras(){
  ensureExtrasTemp();
  return `
  <div class="grid g2">
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Pomodoro Timer</div>
      <div class="pomo-display" id="pomoDisplay">${fmtTime(pomo.seconds)}</div>
      <div class="sub" style="text-align:center;">${pomo.mode} session</div>
      <div class="pomo-controls">
        <button class="btn sm" data-action="pomoStart">${pomo.running?'Pause':'Start'}</button>
        <button class="btn ghost sm" data-action="pomoReset">Reset</button>
        <button class="btn ghost sm" data-action="pomoSwitch">Switch to ${pomo.mode==='Work'?'Break':'Work'}</button>
      </div>
    </div>
    <div class="card">
      <div class="label" style="margin-bottom:8px;">Quick Notes</div>
      <textarea id="quickNotes" style="width:100%;min-height:140px;" placeholder="Jot anything down...">${esc(DB.notes.quick)}</textarea>
      <button class="btn sm" style="margin-top:8px;" data-action="saveQuickNotes">Save Notes</button>
    </div>
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
  <div class="section-title"><h2>Export</h2><span class="hint">Back up your data as a JSON file</span></div>
  <div class="card"><button class="btn ghost" data-action="exportData">Download JSON backup</button></div>
  `;
}
function fmtTime(sec){const m=Math.floor(sec/60).toString().padStart(2,'0');const s=(sec%60).toString().padStart(2,'0');return m+':'+s;}
function fmtHMS(sec){const h=Math.floor(sec/3600).toString().padStart(2,'0');const m=Math.floor((sec%3600)/60).toString().padStart(2,'0');const s=Math.floor(sec%60).toString().padStart(2,'0');return h+':'+m+':'+s;}
function fmtHrsMin(hrs){const h=Math.floor(hrs);const m=Math.round((hrs-h)*60);return h+'h '+m+'m';}

/* ================= FLOATING STUDY TIMER ================= */
let studyTimer={seconds:0,running:false};
function renderFloatingTimer(){
  const div=document.createElement('div');
  div.id='floatingTimer';
  div.style.cssText='position:fixed;bottom:18px;right:18px;background:var(--card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:12px 14px;z-index:60;min-width:190px;font-family:var(--font-body);';
  div.innerHTML=`
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;letter-spacing:.05em;">Current Session</div>
    <div class="mono" id="floatSessionTime" style="font-size:20px;font-weight:700;margin:2px 0 6px;">${fmtHMS(studyTimer.seconds)}</div>
    <div style="font-size:10px;color:var(--text-faint);" id="floatTodayTotal">Today: ${fmtHrsMin(todayStudyTime())}</div>
    <div style="display:flex;gap:6px;margin-top:8px;">
      <button class="btn sm" data-action="studyTimerToggle" id="floatToggleBtn">${studyTimer.running?'Pause':'Start'}</button>
      <button class="btn ghost sm" data-action="studyTimerReset">Reset</button>
    </div>`;
  document.body.appendChild(div);
}
function tickFloatingTimer(){
  if(studyTimer.running)studyTimer.seconds++;
  const t=document.getElementById('floatSessionTime'); if(t)t.textContent=fmtHMS(studyTimer.seconds);
  const tot=document.getElementById('floatTodayTotal'); if(tot)tot.textContent='Today: '+fmtHrsMin(todayStudyTime());
}

/* ================= MODAL ================= */
function openModal(html){document.getElementById('modalRoot').innerHTML=`<div class="modal-overlay" data-action="closeModalBg"><div class="modal" data-stop>${html}</div></div>`;}
function closeModal(){document.getElementById('modalRoot').innerHTML='';}

/* ================= EVENT HANDLING ================= */
document.addEventListener('click',e=>{
  if(e.target.closest('[data-stop]') && e.target.closest('.modal-overlay') && !e.target.closest('[data-action]')) return;
  const bg=e.target.closest('[data-action="closeModalBg"]');
  if(bg && e.target===bg){closeModal();return;}
  const btn=e.target.closest('[data-action]');
  if(!btn)return;
  const action=btn.dataset.action;
  handleAction(action,btn);
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.action==='tab'){/* handled in click */}
  if(t.dataset.field && t.dataset.topic){ handleTopicField(t); }
  if(t.dataset.action==='goalStatus'){ const g=DB.goals.find(x=>x.id===t.dataset.id); g.status=t.value; scheduleSave(); render(); }
  if(t.dataset.action==='goalProgress'){ const g=DB.goals.find(x=>x.id===t.dataset.id); g.progress=Number(t.value); scheduleSave(); render(); }
  if(t.dataset.action==='setPriority'){ DB.subjects[t.dataset.key].priority=t.value; scheduleSave(); render(); }
  if(t.dataset.action==='toggleHabit'){ const d=todayStr(); DB.habits[d]=DB.habits[d]||{}; DB.habits[d][t.dataset.habit]=t.checked; scheduleSave(); render(); }
  if(t.dataset.action==='toggleErrorFixed'){ const er=DB.errors.find(x=>x.id===t.dataset.id); er.fixed=t.checked; if(t.checked)er.dateRevised=todayStr(); scheduleSave(); render(); }
  if(t.dataset.action==='setTarget'){ DB.meta.targetHoursToday=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='setQuestionTarget'){ DB.meta.questionTarget=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='setMockTarget'){ DB.meta.mockTargetScore=Number(t.value)||1; scheduleSave(); render(); }
  if(t.dataset.action==='toggleTask'){ const d=todayStr(); const task=(DB.tasks[d]||[]).find(x=>x.id===t.dataset.id); if(task){task.done=t.checked; scheduleSave(); render();} }
});
document.addEventListener('input',e=>{
  if(e.target.id==='searchInput') doSearch(e.target.value);
});

function handleTopicField(t){
  const key=t.dataset.key, topicId=t.dataset.topic, field=t.dataset.field;
  const topic=DB.subjects[key].topics.find(x=>x.id===topicId);
  let val=t.value;
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
  if(action==='toggleDark'){document.documentElement.classList.toggle('dark'); DB.meta.dark=document.documentElement.classList.contains('dark'); scheduleSave(); return;}
  if(action==='openSubject'){openSubject=d.key; render(); return;}
  if(action==='closeSubject'){openSubject=null; render(); return;}
  if(action==='addRevision'){
    const topic=DB.subjects[d.key].topics.find(x=>x.id===d.topic);
    if(topic.revisions<5){topic.revisions++; topic.lastRevisionDate=todayStr(); if(topic.status==='Completed')topic.status='Revised'; scheduleSave(); render();}
    return;
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
  if(action==='pomoStart'){
    pomo.running=!pomo.running;
    if(pomo.running){pomo.interval=setInterval(()=>{pomo.seconds--; if(pomo.seconds<=0){clearInterval(pomo.interval); pomo.running=false; pomo.seconds=pomo.mode==='Work'?25*60:5*60;} updatePomoDisplay();},1000);}
    else clearInterval(pomo.interval);
    render(); return;
  }
  if(action==='pomoReset'){clearInterval(pomo.interval); pomo.running=false; pomo.seconds=pomo.mode==='Work'?25*60:5*60; render(); return;}
  if(action==='pomoSwitch'){clearInterval(pomo.interval); pomo.running=false; pomo.mode=pomo.mode==='Work'?'Break':'Work'; pomo.seconds=pomo.mode==='Work'?25*60:5*60; render(); return;}
  if(action==='exportData'){
    const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='ssc_cgl_backup_'+todayStr()+'.json'; a.click(); URL.revokeObjectURL(url); return;
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
  if(action==='studyTimerToggle'){
    studyTimer.running=!studyTimer.running;
    const btn=document.getElementById('floatToggleBtn'); if(btn)btn.textContent=studyTimer.running?'Pause':'Start';
    return;
  }
  if(action==='studyTimerReset'){
    studyTimer.running=false; studyTimer.seconds=0;
    const btn=document.getElementById('floatToggleBtn'); if(btn)btn.textContent='Start';
    tickFloatingTimer();
    return;
  }
}
function updatePomoDisplay(){const el=document.getElementById('pomoDisplay'); if(el)el.textContent=fmtTime(pomo.seconds);}

/* ================= SEARCH ================= */
function doSearch(q){
  const box=document.getElementById('searchResults');
  q=q.trim().toLowerCase();
  if(!q){box.style.display='none';box.innerHTML='';return;}
  const results=[];
  allTopics().forEach(t=>{if(t.name.toLowerCase().includes(q))results.push(`<b>Topic</b> — ${esc(t.name)} (${SYLLABUS[t.subject].label})`);});
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
  if(currentTab==='mocks'&&DB.mocks.length>=2){
    const sorted=[...DB.mocks].sort((a,b)=>a.number-b.number);
    destroyChart('mockScoreChart'); destroyChart('mockAccChart');
    const ctx1=document.getElementById('mockScoreChart'); const ctx2=document.getElementById('mockAccChart');
    if(ctx1)charts.mockScoreChart=new Chart(ctx1,{type:'line',data:{labels:sorted.map(m=>'M'+m.number),datasets:[{label:'Score',data:sorted.map(m=>m.score),borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.12)',tension:.3,fill:true}]},options:{plugins:{legend:{display:false},title:{display:true,text:'Score Improvement'}},scales:{y:{beginAtZero:true}}}});
    if(ctx2)charts.mockAccChart=new Chart(ctx2,{type:'line',data:{labels:sorted.map(m=>'M'+m.number),datasets:[{label:'Accuracy %',data:sorted.map(m=>m.attempted?(m.correct/m.attempted*100).toFixed(1):0),borderColor:'#0f9d68',backgroundColor:'rgba(15,157,104,.12)',tension:.3,fill:true}]},options:{plugins:{legend:{display:false},title:{display:true,text:'Accuracy Trend'}},scales:{y:{beginAtZero:true,max:100}}}});
  }
  if(currentTab==='analytics'){
    destroyChart('subjHoursChart'); destroyChart('weekHoursChart');
    const ctx1=document.getElementById('subjHoursChart');
    const subjHours=Object.keys(SYLLABUS).map(k=>subjectStats(k).hrs);
    if(ctx1)charts.subjHoursChart=new Chart(ctx1,{type:'doughnut',data:{labels:Object.keys(SYLLABUS).map(k=>SYLLABUS[k].label),datasets:[{data:subjHours,backgroundColor:['#2563eb','#3b82f6','#60a5fa','#93c5fd','#1d4ed8','#0b2e6b']}]},options:{plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:10}}}}}});
    const ctx2=document.getElementById('weekHoursChart');
    const weeks=[...Array(8)].map((_,i)=>7*(7-i));
    const weekLabels=weeks.map((w,i)=>'W-'+(7-i));
    const weekData=weeks.map((w,i)=>{const from=w, to=i===7?0:weeks[i+1]; return hoursSince(from)-(to?hoursSince(to):0);});
    if(ctx2)charts.weekHoursChart=new Chart(ctx2,{type:'bar',data:{labels:weekLabels,datasets:[{label:'Hours',data:weekData,backgroundColor:'#2563eb',borderRadius:6}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
  }
}

/* ================= INIT ================= */
loadDB();
