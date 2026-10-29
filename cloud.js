import {getFirestore,doc,getDoc,setDoc,collection,query,where,orderBy,limit,getDocs,deleteDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
const db=getFirestore();
let user=null, role=null, currentId=null, writeTimer=null, loading=false;
const el=id=>document.getElementById(id);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const notify=s=>{el("cloudStatus").textContent=s;};
const bridge=()=>window.DocSystemBridge;
function canManage(){return role==="superadmin"||role==="manager"}
function canAdmin(){return role==="superadmin"}
export async function startCloud(authUser,profile){
  user=authUser;role=profile.role;currentId=null;loading=true;
  el("cloudMenuUsers").hidden=!canManage();
  document.querySelectorAll(".cloud-admin-only").forEach(x=>x.hidden=!canManage());
  const snap=await getDoc(doc(db,"appSettings","main"));
  if(snap.exists() && snap.data().settings)bridge().setSettings(snap.data().settings);
  else if(canManage())await setDoc(doc(db,"appSettings","main"),{settings:bridge().getSettings(),updatedAt:serverTimestamp(),updatedBy:user.uid});
  loading=false;notify("Online · "+profile.role);
  await loadDocs();
  if(canManage())await loadUsers();
}
export function clearCloud(){user=null;role=null;currentId=null;loading=true;el("cloudList").innerHTML="";el("userList").innerHTML="";notify("Not signed in");}
export function settingsChanged(){
  if(!user||!canManage()||loading)return;
  clearTimeout(writeTimer);
  writeTimer=setTimeout(async()=>{
    try {await setDoc(doc(db,"appSettings","main"),{settings:bridge().getSettings(),updatedBy:user.uid,updatedAt:serverTimestamp()});notify("Settings saved online");}
    catch(e){notify("Settings save failed: "+e.message);}
  },900);
}
export function changedDocument(){currentId=null;}
export async function saveDocument(){
  if(!user)return;
  const payload=bridge().getDocument();
  const d=payload.doc, num=String(d.fieldValues?.docno||"").trim(), date=String(d.fieldValues?.date||"").slice(0,10);
  if(!num){alert("Enter a document number before saving.");return}
  const savedDoc= currentId ? doc(db,"documents",currentId):doc(collection(db,"documents"));
  try{
    const prior=currentId?await getDoc(savedDoc):null;
    await setDoc(savedDoc,{...payload,number:num,documentType:d.type,date:date||new Date().toISOString().slice(0,10),profileId:payload.profileId,updatedAt:serverTimestamp(),updatedBy:user.uid,...(!prior?.exists()?{createdAt:serverTimestamp(),createdBy:user.uid}:{})},{merge:true});
    currentId=savedDoc.id;notify("Document saved online: "+num);await loadDocs();
  }catch(e){notify("Save failed: "+e.message);alert("Could not save document: "+e.message)}
}
export async function loadDocs(){
  if(!user)return;
  const month=el("cloudMonth").value;
  const q=month?query(collection(db,"documents"),where("date",">=",month+"-01"),where("date","<=",month+"-31"),orderBy("date","desc"),limit(150)):query(collection(db,"documents"),orderBy("date","desc"),limit(150));
  try{
    const snaps=await getDocs(q);
    el("cloudList").innerHTML=snaps.empty?"<p>No documents found.</p>":snaps.docs.map(s=>{const d=s.data();return '<div class="cloud-entry"><div><b>'+escape(d.number||"Untitled")+'</b><div class="muted">'+escape(d.documentType)+" · "+escape(d.date)+" · "+escape(d.profileName)+'</div></div><div class="actions"><button data-open-doc="'+escape(s.id)+'">Open</button><button data-copy-doc="'+escape(s.id)+'">Duplicate</button></div></div>'}).join("");
    notify("Online · "+snaps.size+" documents loaded");
  }catch(e){notify("Document load failed: "+e.message)}
}
export async function openDocument(id,duplicate=false){
  try{
    const s=await getDoc(doc(db,"documents",id));
    if(!s.exists())throw Error("Document not found");
    bridge().setDocument(s.data());currentId=duplicate?null:id;
    if(duplicate)notify("Duplicate ready: change document number and save");
    else notify("Document opened: "+(s.data().number||""));
    document.querySelector('[data-tab="create"]').click();
  }catch(e){notify("Open failed: "+e.message)}
}
export async function loadUsers(){
  if(!user||!canManage())return;
  try{
    const snaps=await getDocs(query(collection(db,"users"),limit(200)));
    el("userList").innerHTML=snaps.docs.map(s=>{let x=s.data();return '<div class="cloud-entry"><div><b>'+escape(x.email)+'</b><div class="muted">'+escape(s.id)+'</div></div><div class="actions"><select data-role-uid="'+escape(s.id)+'" '+(!canAdmin()?'disabled':'')+'>'+["superadmin","manager","staff"].map(r=>'<option '+(r===x.role?'selected':'')+'>'+r+'</option>').join("")+'</select><select data-status-uid="'+escape(s.id)+'"><option '+(x.status==="active"?"selected":"")+'>active</option><option '+(x.status==="inactive"?"selected":"")+'>inactive</option></select><button data-user-save="'+escape(s.id)+'">Update</button></div></div>'}).join("");
  }catch(e){el("userList").textContent="Could not load users: "+e.message}
}
export async function saveUser(uid){
  if(!canManage())return;
  const row=el("userList").querySelector('[data-user-save="'+uid+'"]').closest(".cloud-entry");
  const newRole=row.querySelector("select[data-role-uid]").value;
  const status=row.querySelector("select[data-status-uid]").value;
  if(uid===user.uid&&status==="inactive"){alert("You cannot deactivate yourself.");return}
  try{const ref=doc(db,"users",uid);const current=await getDoc(ref);if(!current.exists())throw Error("Account missing");
    if(!canAdmin()&&current.data().role!==newRole)throw Error("Manager cannot modify roles");
    await setDoc(ref,{role:newRole,status},{merge:true});notify("Account updated");await loadUsers();
  }catch(e){alert("Update failed: "+e.message)}
}
export async function addUser(){
  if(!canManage())return;
  const uid=el("newUserUid").value.trim(),email=el("newUserEmail").value.trim().toLowerCase(),chosenRole=el("newUserRole").value;
  if(!uid||!email||!email.includes("@"))return alert("Enter a valid Authentication UID and email.");
  if(!canAdmin()&&chosenRole==="superadmin")return alert("Only superadmin can assign that role.");
  try{await setDoc(doc(db,"users",uid),{email,role:chosenRole,status:"active"});notify("Profile added. Firebase Authentication account must already exist.");await loadUsers();}
  catch(e){alert("Could not add user: "+e.message)}
}
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-open-doc]");if(a)openDocument(a.dataset.openDoc);
  const b=e.target.closest("[data-copy-doc]");if(b)openDocument(b.dataset.copyDoc,true);
  const c=e.target.closest("[data-user-save]");if(c)saveUser(c.dataset.userSave);
  if(e.target.id==="cloudRefresh")loadDocs();
  if(e.target.id==="cloudSave")saveDocument();
  if(e.target.id==="cloudUserAdd")addUser();
});
el("cloudMonth").value=new Date().toISOString().slice(0,7);
el("cloudMonth").addEventListener("change",loadDocs);
