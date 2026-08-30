import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const CLOUD_CACHE_KEY = "japanese3000_cloud_cache_v1";
const configured =
  SUPABASE_URL &&
  SUPABASE_PUBLISHABLE_KEY &&
  !SUPABASE_URL.includes("PASTE_") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_");

const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

const el = id => document.getElementById(id);
const nowIsoDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const isoPlusYears = (iso, years) => {
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y + years, m - 1, d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};
const defaultState = () => {
  const start = nowIsoDate();
  return {
    version: 2,
    goalHours: 3000,
    weeklyTarget: 3000 / (6 * 52),
    startDate: start,
    targetDate: isoPlusYears(start, 6),
    sessions: [],
    running: null,
    acknowledgedRewards: []
  };
};

let state = defaultState();
let user = null;
let ticker = null;
let saveQueue = Promise.resolve();

function cacheState() {
  try { localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(state)); } catch {}
}
function loadCache() {
  try {
    const x = JSON.parse(localStorage.getItem(CLOUD_CACHE_KEY));
    return x && Array.isArray(x.sessions) ? { ...defaultState(), ...x } : null;
  } catch { return null; }
}
function setSync(text, kind="") {
  el("syncStatus").textContent = text;
  el("syncStatus").className = `sync-status ${kind}`.trim();
}
async function loadCloudState() {
  if (!user) return;
  setSync("Loading…","syncing");
  const { data, error } = await supabase
    .from("tracker_state")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    const cached = loadCache();
    if (cached) state = cached;
    setSync("Offline copy","error");
    render();
    throw error;
  }

  if (data?.data && Array.isArray(data.data.sessions)) {
    state = { ...defaultState(), ...data.data, version: 2 };
  } else {
    state = defaultState();
    const { error: createError } = await supabase
      .from("tracker_state")
      .insert({ user_id: user.id, data: state });
    if (createError) throw createError;
  }
  cacheState();
  setSync("Cloud synced");
  render();
}
function saveCloud() {
  if (!user || !supabase) return Promise.resolve();
  cacheState();
  setSync("Saving…","syncing");

  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const snapshot = JSON.parse(JSON.stringify(state));
      const { error } = await supabase
        .from("tracker_state")
        .upsert({
          user_id: user.id,
          data: snapshot,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
      if (error) {
        setSync("Not synced","error");
        throw error;
      }
      setSync("Cloud synced");
    });
  return saveQueue;
}

function totalCompletedSeconds() {
  return state.sessions.reduce((sum,s) => sum + (Number(s.seconds)||0), 0);
}
function runningSeconds() {
  if (!state.running?.startedAt) return 0;
  return Math.max(0, Math.floor((Date.now()-state.running.startedAt)/1000));
}
function totalSecondsIncludingRunning() { return totalCompletedSeconds()+runningSeconds(); }
function h(s) { return s/3600; }
function fmtTimer(seconds) {
  seconds=Math.max(0,Math.floor(seconds));
  const hh=Math.floor(seconds/3600), mm=Math.floor((seconds%3600)/60), ss=seconds%60;
  return [hh,mm,ss].map(v=>String(v).padStart(2,"0")).join(":");
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y,m,d]=iso.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined,{year:"numeric",month:"short",day:"numeric"}).format(new Date(y,m-1,d));
}
function clamp(n,a,b){ return Math.min(b,Math.max(a,n)); }
function weekStartLocal(date=new Date()){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const day=d.getDay(); d.setDate(d.getDate()+(day===0?-6:1-day)); return d;
}
function sessionDateLocal(s){
  const [y,m,d]=s.date.split("-").map(Number); return new Date(y,m-1,d);
}
function thisWeekSeconds(){
  const start=weekStartLocal(), end=new Date(start); end.setDate(end.getDate()+7);
  let total=state.sessions.reduce((sum,s)=>{
    const d=sessionDateLocal(s); return d>=start&&d<end?sum+s.seconds:sum;
  },0);
  if(state.running){
    const d=new Date(state.running.startedAt);
    if(d>=start&&d<end) total+=runningSeconds();
  }
  return total;
}
function elapsedWeeks(){
  const [y,m,d]=state.startDate.split("-").map(Number);
  const start=new Date(y,m-1,d);
  return Math.max(1/7,(Date.now()-start.getTime())/604800000);
}
function averageWeeklyHours(){ return h(totalSecondsIncludingRunning())/elapsedWeeks(); }
function nextReward(totalHours){
  const next50=Math.floor(totalHours/50+1)*50;
  return {hours:next50,type:next50%500===0?"dinner":"treat"};
}
function unlockedRewardMilestones(totalHours){
  const out=[]; for(let x=50;x<=Math.floor(totalHours/50)*50;x+=50) out.push(x); return out;
}
function renderRewardRail(){
  const totalH=h(totalSecondsIncludingRunning()), rail=el("rewardRail");
  rail.innerHTML="";
  const block=Math.floor(totalH/500)*500;
  let start=totalH<500?50:block+50;
  if(start>state.goalHours) start=Math.max(50,state.goalHours-450);
  const milestones=[];
  for(let i=0;i<10;i++){ const x=start+i*50; if(x>state.goalHours) break; milestones.push(x); }
  if(!milestones.length) milestones.push(state.goalHours);
  milestones.forEach(x=>{
    const node=document.createElement("div");
    node.className=`reward-node ${totalH>=x?"unlocked":""} ${x%500===0?"dinner":""}`;
    node.innerHTML=`<span class="reward-icon">${x%500===0?"🍽️":"🍰"}</span><span class="reward-hours">${x.toLocaleString()} h</span>`;
    rail.appendChild(node);
  });
}
function renderHistory(){
  const list=el("historyList"); list.innerHTML="";
  const sorted=[...state.sessions].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,20);
  el("emptyHistory").hidden=sorted.length>0;
  sorted.forEach(s=>{
    const row=document.createElement("div"); row.className="history-row";
    const date=document.createElement("div"); date.className="history-date"; date.textContent=fmtDate(s.date);
    const hours=document.createElement("div"); hours.className="history-hours"; hours.textContent=`${(s.seconds/3600).toFixed(2)} h`;
    const note=document.createElement("div"); note.className="history-note"; note.textContent=s.note||(s.source==="timer"?"Timed session":"Manual entry");
    const del=document.createElement("button"); del.className="delete-btn"; del.type="button"; del.textContent="×"; del.setAttribute("aria-label","Delete session");
    del.addEventListener("click",async()=>{
      if(confirm("Delete this study session?")){
        state.sessions=state.sessions.filter(x=>x.id!==s.id);
        await saveCloud().catch(()=>{});
        render();
      }
    });
    row.append(date,hours,note,del); list.appendChild(row);
  });
}
function render(){
  const running=Boolean(state.running), totalH=h(totalSecondsIncludingRunning()), weekH=h(thisWeekSeconds());
  const pct=clamp(totalH/state.goalHours*100,0,100), reward=nextReward(totalH), avg=averageWeeklyHours();
  el("timer").textContent=fmtTimer(runningSeconds());
  el("timerLabel").textContent=running?"STUDYING NOW":"READY TO STUDY";
  el("startPauseBtn").textContent=running?"Pause & save":"Start timer";
  el("finishBtn").disabled=!running;
  el("runningNote").textContent=running
    ?"Timer start time is saved in the cloud. You can close the page and come back later."
    :"Your progress is saved to your private account.";
  el("totalHours").textContent=`${totalH.toFixed(1)} h`;
  el("goalPercent").textContent=`${pct.toFixed(1)}% of ${state.goalHours.toLocaleString()} h`;
  el("weekHours").textContent=`${weekH.toFixed(1)} h`;
  const rem=Math.max(0,state.weeklyTarget-weekH);
  el("weekRemaining").textContent=weekH>=state.weeklyTarget?`${(weekH-state.weeklyTarget).toFixed(2)} h above target`:`${rem.toFixed(2)} h to goal`;

  if(totalH>=state.goalHours){
    el("nextRewardHours").textContent="Goal!";
    el("nextRewardText").textContent="3,000 hours complete 🎉";
  }else{
    el("nextRewardHours").textContent=`${reward.hours.toLocaleString()} h`;
    el("nextRewardText").textContent=reward.type==="dinner"?"Celebratory dinner 🍽️":"Sweet treat 🍰";
  }

  if(state.sessions.length||running){
    el("pace").textContent=`${avg.toFixed(2)} h/week average`;
    if(avg>0){
      const weeks=Math.max(0,state.goalHours-totalH)/avg;
      const projected=new Date(Date.now()+weeks*604800000);
      el("projection").textContent=totalH>=state.goalHours?"Complete 🎉":new Intl.DateTimeFormat(undefined,{month:"short",year:"numeric"}).format(projected);
    }
  }else{
    el("projection").textContent="—"; el("pace").textContent="Build a study streak first";
  }
  el("remainingText").textContent=`${Math.max(0,state.goalHours-totalH).toFixed(1)} h remaining`;
  el("bigProgressBar").style.width=`${pct}%`;
  el("startDateText").textContent=`Start: ${fmtDate(state.startDate)}`;
  el("targetDateText").textContent=`Target: ${fmtDate(state.targetDate)}`;
  el("unlockedCount").textContent=`${unlockedRewardMilestones(totalH).length} unlocked`;
  renderRewardRail(); renderHistory();
}
function startTicker(){ stopTicker(); ticker=setInterval(render,1000); }
function stopTicker(){ if(ticker) clearInterval(ticker); ticker=null; }

async function toggleTimer(){
  if(state.running){ await finishRunningSession(); return; }
  state.running={startedAt:Date.now()};
  await saveCloud().catch(()=>{});
  render(); startTicker();
}
async function finishRunningSession(){
  if(!state.running) return;
  const before=h(totalCompletedSeconds()), sec=runningSeconds();
  if(sec>=1){
    state.sessions.push({
      id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,
      date:nowIsoDate(),seconds:sec,note:"Timed session",source:"timer",createdAt:Date.now()
    });
  }
  state.running=null;
  stopTicker();
  checkRewards(before,h(totalCompletedSeconds()));
  await saveCloud().catch(()=>{});
  render();
}
function checkRewards(before,after){
  const crossed=[], first=Math.floor(before/50)*50+50;
  for(let x=first;x<=after;x+=50){
    if(x>0&&!state.acknowledgedRewards.includes(x)) crossed.push(x);
  }
  if(!crossed.length) return;
  crossed.forEach(x=>{ if(!state.acknowledgedRewards.includes(x)) state.acknowledgedRewards.push(x); });
  const biggest=crossed[crossed.length-1], dinner=biggest%500===0;
  el("rewardEmoji").textContent=dinner?"🍽️✨":"🍰✨";
  el("rewardTitle").textContent=`${biggest.toLocaleString()} hours!`;
  el("rewardMessage").textContent=dinner
    ?"You unlocked a celebratory dinner. Put it on the calendar — you earned this one."
    :"You unlocked a sweet treat. Enjoy the little victory.";
  el("rewardDialog").showModal(); launchConfetti();
}
function launchConfetti(){
  const holder=el("confetti"); holder.innerHTML="";
  const colors=["#d15b44","#728a70","#b78b3d","#6d7f9b","#c8796b"];
  for(let i=0;i<42;i++){
    const p=document.createElement("span"); p.className="confetti-piece";
    p.style.left=`${Math.random()*100}%`; p.style.background=colors[i%colors.length]; p.style.animationDelay=`${Math.random()*.45}s`;
    holder.appendChild(p);
  }
  setTimeout(()=>holder.innerHTML="",3000);
}

async function signIn(email,password){
  const { error }=await supabase.auth.signInWithPassword({email,password});
  if(error) throw error;
}
async function signUp(email,password){
  const { data,error }=await supabase.auth.signUp({email,password});
  if(error) throw error;
  return data;
}
function showAuth(){
  el("authScreen").hidden=false; el("appShell").hidden=true;
  stopTicker();
}
async function showApp(nextUser){
  user=nextUser;
  el("authScreen").hidden=true; el("appShell").hidden=false;
  try{
    await loadCloudState();
    if(state.running) startTicker();
  }catch(err){
    console.error(err);
    alert("Signed in, but the tracker database could not load. Make sure you ran supabase-setup.sql.");
  }
}

el("authForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!configured) return;
  const email=el("emailInput").value.trim(), password=el("passwordInput").value;
  el("authMessage").textContent="Signing in…";
  try{ await signIn(email,password); el("authMessage").textContent=""; }
  catch(err){ el("authMessage").textContent=err.message||"Could not sign in."; }
});
el("signUpBtn").addEventListener("click",async()=>{
  if(!configured) return;
  const email=el("emailInput").value.trim(), password=el("passwordInput").value;
  if(!email||!password){ el("authMessage").textContent="Enter an email and password first."; return; }
  el("authMessage").textContent="Creating account…";
  try{
    const data=await signUp(email,password);
    el("authMessage").textContent=data.session
      ?"Account created."
      :"Account created. Check your email to confirm it, then sign in.";
  }catch(err){ el("authMessage").textContent=err.message||"Could not create account."; }
});

el("startPauseBtn").addEventListener("click",toggleTimer);
el("finishBtn").addEventListener("click",finishRunningSession);

el("manualBtn").addEventListener("click",()=>{
  el("manualDate").value=nowIsoDate(); el("manualHours").value=""; el("manualNote").value=""; el("manualDialog").showModal();
});
el("manualSaveBtn").addEventListener("click",async()=>{
  const hours=Number(el("manualHours").value), date=el("manualDate").value;
  if(!date||!Number.isFinite(hours)||hours<=0||hours>24){ alert("Enter a valid date and hours between 0 and 24."); return; }
  const before=h(totalCompletedSeconds());
  state.sessions.push({
    id:crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`,
    date,seconds:Math.round(hours*3600),note:el("manualNote").value.trim(),source:"manual",createdAt:Date.now()
  });
  el("manualDialog").close();
  checkRewards(before,h(totalCompletedSeconds()));
  await saveCloud().catch(()=>{});
  render();
});
el("settingsBtn").addEventListener("click",()=>{
  el("goalHoursInput").value=state.goalHours;
  el("weeklyTargetInput").value=state.weeklyTarget.toFixed(2);
  el("startDateInput").value=state.startDate;
  el("targetDateInput").value=state.targetDate;
  el("settingsDialog").showModal();
});
el("settingsSaveBtn").addEventListener("click",async()=>{
  const goal=Number(el("goalHoursInput").value), weekly=Number(el("weeklyTargetInput").value);
  const startDate=el("startDateInput").value, targetDate=el("targetDateInput").value;
  if(!Number.isFinite(goal)||goal<=0||!Number.isFinite(weekly)||weekly<=0||!startDate||!targetDate){ alert("Please enter valid settings."); return; }
  state.goalHours=goal; state.weeklyTarget=weekly; state.startDate=startDate; state.targetDate=targetDate;
  el("settingsDialog").close(); await saveCloud().catch(()=>{}); render();
});
el("resetBtn").addEventListener("click",async()=>{
  if(confirm("Reset all study history, rewards, and settings? Export a backup first if you may want it later.")){
    state=defaultState(); stopTicker(); el("settingsDialog").close();
    await saveCloud().catch(()=>{}); render();
  }
});
el("rewardCloseBtn").addEventListener("click",()=>el("rewardDialog").close());
el("signOutBtn").addEventListener("click",async()=>{
  await supabase.auth.signOut(); user=null; showAuth();
});

el("exportBtn").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=`japanese-study-backup-${nowIsoDate()}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
el("importInput").addEventListener("change",async event=>{
  const file=event.target.files?.[0]; if(!file) return;
  try{
    const incoming=JSON.parse(await file.text());
    if(!incoming||!Array.isArray(incoming.sessions)) throw new Error("Invalid backup");
    if(confirm("Replace your cloud tracker with the imported backup?")){
      state={...defaultState(),...incoming,version:2};
      await saveCloud(); render();
    }
  }catch{ alert("That file is not a valid tracker backup."); }
  event.target.value="";
});
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) render(); });

async function initialize(){
  if(!configured){
    el("configWarning").hidden=false;
    el("signInBtn").disabled=true; el("signUpBtn").disabled=true;
    return;
  }
  supabase.auth.onAuthStateChange(async(event,session)=>{
    if(session?.user){
      if(!user || user.id!==session.user.id) await showApp(session.user);
    }else{
      user=null; showAuth();
    }
  });
  const { data:{ session } }=await supabase.auth.getSession();
  if(session?.user) await showApp(session.user); else showAuth();
}
initialize();
