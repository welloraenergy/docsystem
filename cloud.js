import {listPresetCopies} from "./preset-user-templates.js?v=20261101-copy-1";
import {uploadPdfDocument,viewPdfDocument,removePdfPayload,displayDocumentDate,uploadDateToIso} from "./document-upload.js?v=20261118-full-year-date";
import {mayManageLocks,isDocumentLocked,setDocumentLocked,confirmDeleteUnlocked} from "./document-lock.js?v=20261117-lock1";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,collection,query,where,orderBy,limit,startAfter,getDocs,getDocsFromServer,getDocFromServer,deleteDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
let db=null;
let user=null, role=null, currentId=null, writeTimer=null, loading=false; const rank={user:1,staff:1,manager:2,superadmin:3};
const el=id=>document.getElementById(id);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const notify=s=>{el("cloudStatus").textContent=s;};
const bridge=()=>window.DocSystemBridge;
const encode = (value, nested = false) => {
 if (Array.isArray(value)) {
   const result = value.map(v => encode(v, true));
   return nested ? { nestedArrayData: result } : result;
 }
 if (value && typeof value === "object") {
   return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)]));
 }
 return value;
};
const decode = value => {
 if (Array.isArray(value)) return value.map(decode);
 if (value && typeof value === "object") {
   if (Object.keys(value).length === 1 && Array.isArray(value.nestedArrayData))
     return value.nestedArrayData.map(decode);
   return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,decode(v)]));
 }
 return value;
};

function canManage(){return role==="superadmin"||role==="manager"}
function canAdmin(){return role==="superadmin"}
export async function startCloud(authUser,profile){
  db=getFirestore();user=authUser;role=profile.role;currentId=null;loading=true;
  el("cloudMenuUsers").hidden=!canManage();
  el("newSuperadminOption").hidden=!canAdmin();
  document.querySelectorAll(".cloud-admin-only").forEach(x=>x.hidden=!canManage());
  const snap=await getDocFromServer(doc(db,"appSettings","main"));
  if(snap.exists() && snap.data().settings)bridge().setSettings(decode(snap.data().settings));
  else if(canManage())await setDoc(doc(db,"appSettings","main"),{settings:encode(bridge().getSettings()),updatedAt:serverTimestamp(),updatedBy:user.uid});
  loading=false;notify("Online · "+profile.role);
  await loadDocs();
  await loadSavedPresetCopies();
  if(canManage())await loadUsers();
}
// Refresh the shared Firestore list whenever the user returns to this PC/tab.
let lastFocusRefresh=0;
async function refreshDocumentsOnReturn(){
 if(!user||loading||document.hidden)return;
 if(Date.now()-lastFocusRefresh<15000)return;
 lastFocusRefresh=Date.now();
 await loadDocs();
}
window.addEventListener('focus',()=>{refreshDocumentsOnReturn().catch(()=>{})});
document.addEventListener('visibilitychange',()=>{refreshDocumentsOnReturn().catch(()=>{})});
export function clearCloud(){documentListRequest++;user=null;role=null;currentId=null;loading=true;el("cloudList").innerHTML="";el("userList").innerHTML="";const list=el("workspacePresetCopiesList");if(list)list.innerHTML="";const lib=el("presetCopyLibraryList");if(lib)lib.innerHTML="";notify("Not signed in");}
export function settingsChanged(){
  if(!user||!canManage()||loading)return;
  clearTimeout(writeTimer);
  writeTimer=setTimeout(async()=>{
    try {
      await setDoc(doc(db,"appSettings","main"),{settings:encode(bridge().getSettings()),updatedBy:user.uid,updatedAt:serverTimestamp()});
      notify("Settings saved online");
      window.dispatchEvent(new CustomEvent('docsystem-settings-sync',{detail:{ok:true}}));
    }catch(e){
      notify("Settings save failed: "+e.message);
      window.dispatchEvent(new CustomEvent('docsystem-settings-sync',{detail:{ok:false,message:e.message}}));
    }
  },900);
}
export function changedDocument(){currentId=null;}
function documentSaveMessage(reference,duplicate=false){
 return new Promise(resolve=>{
  // Preset editors run in same-origin iframes. Mount in the top document so
  // the dialog stays in the visible browser viewport, not the scrolled form.
  let host=document;
  try{if(window.top&&window.top!==window&&window.top.document?.body)host=window.top.document}catch(e){}
  const previous=host.activeElement;
  const veil=host.createElement('div');
  veil.style.cssText='position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.52);display:flex;justify-content:center;align-items:flex-start;padding:clamp(24px,12vh,110px) 16px 16px;box-sizing:border-box;overflow-y:auto';
  const panel=host.createElement('div');
  panel.setAttribute('role','alertdialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-labelledby','doc-save-dialog-title');
  panel.setAttribute('aria-describedby','doc-save-dialog-text');
  panel.style.cssText='background:#192321;color:#ecf6f2;border:1px solid #334942;border-radius:14px;padding:24px;max-width:570px;width:100%;box-shadow:0 18px 48px #0007;font:15px Arial,sans-serif;box-sizing:border-box';
  const title=host.createElement('h3');title.id='doc-save-dialog-title';title.textContent=duplicate?'Document Already Exists':'Saved Successfully';title.style.cssText='font-size:18px;font-weight:700;margin:0 0 14px';
  const message=host.createElement('p');message.id='doc-save-dialog-text';message.textContent=duplicate?'Document '+reference+' already exists. Overwrite the existing document?':'Document '+reference+' has been saved online successfully.';message.style.cssText='font-size:15px;line-height:1.5;margin:0;overflow-wrap:anywhere';
  const actions=host.createElement('div');actions.style.cssText='display:flex;justify-content:flex-end;gap:10px;margin-top:26px;flex-wrap:wrap';
  let closed=false;
  const finish=value=>{if(closed)return;closed=true;host.removeEventListener('keydown',onKey,true);veil.remove();if(previous&&previous.isConnected)previous.focus?.();resolve(value)};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();finish(false)}else if(e.key==='Tab'){const buttons=[...actions.querySelectorAll('button')];if(!buttons.length)return;const index=buttons.indexOf(host.activeElement);if(e.shiftKey&&index<=0){e.preventDefault();buttons[buttons.length-1].focus()}else if(!e.shiftKey&&index===buttons.length-1){e.preventDefault();buttons[0].focus()}}};
  const button=(label,value,primary)=>{const element=host.createElement('button');element.type='button';element.textContent=label;element.style.cssText='border:0;border-radius:24px;padding:11px 22px;min-height:42px;min-width:90px;cursor:pointer;font:600 14px Arial,sans-serif;background:'+(primary?'#88dcd0':'#005c55')+';color:'+(primary?'#10352f':'#e6fffa');element.addEventListener('click',()=>finish(value));actions.append(element);return element};
  const cancel=duplicate?button('Cancel',false,false):null;
  const okay=button(duplicate?'Overwrite':'OK',true,true);
  panel.append(title,message,actions);veil.append(panel);host.body.append(veil);host.addEventListener('keydown',onKey,true);(cancel||okay).focus();
 })
}
export async function saveDocument(){
  if(!user)return;
  const payload=bridge().getDocument();
  const d=payload.doc, num=String(d.fieldValues?.docno||"").trim(), date=String(d.fieldValues?.date||"").slice(0,10);
  if(!num){alert("Enter a document number before saving.");return}
  try{
    const opened=currentId?await getDoc(doc(db,"documents",currentId)):null;
    const newReference=!opened?.exists()||String(opened.data().number||"").trim()!==num;
    let savedDoc=!newReference&&currentId?doc(db,"documents",currentId):doc(collection(db,"documents"));
    if(newReference){
      const matches=await getDocs(query(collection(db,"documents"),where("number","==",num),limit(100)));
      const existing=matches.docs.find(x=>x.data().profileId===payload.profileId && x.data().documentType===d.type);
      if(existing){
        if(!await documentSaveMessage(num,true))return;
        savedDoc=doc(db,"documents",existing.id);
      }
    }
    const prior=await getDoc(savedDoc);
    await setDoc(savedDoc,{...encode(payload),number:num,documentType:d.type,date:date||new Date().toISOString().slice(0,10),profileId:payload.profileId,updatedAt:serverTimestamp(),updatedBy:user.uid,...(!prior.exists()?{createdAt:serverTimestamp(),createdBy:user.uid,creatorRole:role}:{})},{merge:true});
    currentId=savedDoc.id;notify("Document saved online: "+num);await loadDocs();await documentSaveMessage(num);
  }catch(e){notify("Save failed: "+e.message);alert("Could not save document: "+e.message)}
}
// Saved Documents uses one month-scoped Firestore scan and client-side family /
// natural document-number sorting; no extra composite Firestore indexes required.
const documentNumberCollator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
function savedDocumentFamily(record){
 const family=String(record.templateFamily||'');
 if(family)return family;
 if(record.templateSource==='preset'){
  const known={'Quotation':'quotation','Purchase Order':'purchase-order','Delivery Ticket':'delivery-ticket','Return Ticket':'returning-ticket','Returning Ticket':'returning-ticket','Invoice':'invoice','Commercial Invoice / Packing List':'commercial-invoice-packing-list','Goods Received Note':'goods-received-note','Payment Voucher':'payment-voucher','Salary Payslip':'salary-payslip'};
  return known[record.documentType]||'custom';
 }
 return 'custom';
}
let documentListRequest=0;
export async function loadDocs(){
 if(!user)return;
 const requestId=++documentListRequest;
 const period=["all","year","month"].includes(el("cloudPeriod").value)?el("cloudPeriod").value:"all";
 const year=String(el("cloudYear").value||"").trim();
 const month=el("cloudMonth").value;
 const dateStart=period==="all"?"":period==="year"?year+"-01-01":month+"-01";
 const dateEnd=period==="all"?"":period==="year"?year+"-12-31":month+"-31";
 const reference=String(el("cloudReferenceSearch")?.value||"").trim();
 const family=String(el("cloudFamily")?.value||"");
 const sort=el("cloudNumberSort")?.value==="asc"?"asc":"desc";
 // Load a complete monthly set in batches, rather than filtering families
 // AFTER the first 150 records (which hid valid PV/SP documents).
 const batchSize=250, maxRecords=3000;
 const collectionRef=collection(db,"documents");
 try{
  const records=[];
  let truncated=false;
  if(reference){
   const direct=await getDocsFromServer(query(collectionRef,where("number","==",reference),limit(100)));
   records.push(...direct.docs);
   truncated=direct.size===100;
  }else{
   let cursor=null;
   do{
    const queryParts=dateStart&&dateEnd
     ?[where("date",">=",dateStart),where("date","<=",dateEnd),orderBy("date","desc")]
     :[orderBy("date","desc")];
    if(cursor)queryParts.push(startAfter(cursor));
    queryParts.push(limit(Math.min(batchSize,maxRecords-records.length)));
    const page=await getDocsFromServer(query(collectionRef,...queryParts));
    records.push(...page.docs);
    if(page.empty||page.size<batchSize)break;
    cursor=page.docs[page.docs.length-1];
    if(records.length>=maxRecords){truncated=true;break}
   }while(true);
  }
  // A previous month/search request must never overwrite a newer refresh.
  if(requestId!==documentListRequest||!user)return;
  const filtered=records.filter(s=>!family||savedDocumentFamily(s.data())===family);
  filtered.sort((a,b)=>{
   const result=documentNumberCollator.compare(String(a.data().number||''),String(b.data().number||''));
   return (sort==="asc"?result:-result)||a.id.localeCompare(b.id);
  });
  el("cloudList").innerHTML=!filtered.length?"<p>No matching documents found.</p>":filtered.map(s=>{
   const d=s.data(),uploaded=d.templateSource==="uploaded-pdf",locked=isDocumentLocked(d),manager=mayManageLocks(role);
   // Display the recipient already saved by each preset; do not duplicate metadata or modify document saving.
   const preset=d.templateSource==="preset"&&!uploaded?decode(d.presetData||{}):{};
   const familyName=savedDocumentFamily(d);
   const byFamily={
    'quotation':['To',preset.client],
    'purchase-order':['To',preset.fields?.vendorName],
    'delivery-ticket':['Deliver To',preset.deliverTo?.company],
    'returning-ticket':['Collect From',preset.collection?.company],
    'invoice':['To',preset.client?.company],
    'commercial-invoice-packing-list':['Consignee',preset.consignee?.company],
    'goods-received-note':['Delivery To',preset.deliveryTo?.company],
    'payment-voucher':['Pay To',preset.payTo],
    'salary-payslip':['Employee',preset.fullName]
   };
   const [recipientLabel,recipientValue]=byFamily[familyName]||[];
   const recipientName=typeof recipientValue==="string"?recipientValue.trim():"";
   const recipient=recipientLabel&&recipientName&&!/^\{[^{}]+\}$/.test(recipientName)
    ?'<div class="muted">'+escape(recipientLabel)+': '+escape(recipientName)+'</div>':'';
   const open=uploaded?'<button data-view-pdf="'+escape(s.id)+'">View PDF</button>':'<button data-open-doc="'+escape(s.id)+'">Open</button><button data-copy-doc="'+escape(s.id)+'">Duplicate</button>';
   const lock=manager?'<button data-toggle-lock="'+escape(s.id)+'" data-next-lock="'+(locked?'false':'true')+'">'+(locked?'Unlock':'Lock')+'</button>':'';
   const del=manager&&!locked?'<button class="danger" data-delete-doc="'+escape(s.id)+'">Delete</button>':'';
   return '<div class="cloud-entry"><div><b>'+escape(d.number||"Untitled")+'</b><div class="muted">'+escape(d.documentType||savedDocumentFamily(d))+" · "+escape(displayDocumentDate(d.date))+" · "+escape(d.profileName||"")+(uploaded?' · Uploaded PDF':' · Saved Document')+' · '+(locked?'Locked':'Unlocked')+'</div>'+recipient+'</div><div class="actions">'+open+lock+del+'</div></div>';
  }).join("");
  const scope=reference?" · Reference: "+reference:(period==="all"?" · All dates":period==="year"?" · Full Year "+year:month?" · "+month:" · Recent documents");
  notify("Online · "+filtered.length+" matching document(s)"+scope+(truncated?" · More records exist; narrow the filters to find all results.":""));
 }catch(e){if(requestId===documentListRequest)notify("Document load failed: "+e.message);throw e}
}
export async function deleteDocument(id){
 if(!user)return;
 try{
  const record=await confirmDeleteUnlocked({db,id,user,role});
  if(!record)return;
  await deleteDoc(doc(db,"documents",id));
  if(record.templateSource==="uploaded-pdf"){
   try{await removePdfPayload(db,record.fileId||id)}catch(error){notify("Document removed but PDF cleanup failed: "+error.message)}
  }
  if(currentId===id)currentId=null;
  await loadDocs();
 }catch(error){alert("Delete failed: "+(error.code||error.message))}
}
async function toggleDocumentLock(id,locked){
 try{
  await setDocumentLocked({db,id,user,role,locked});
  await loadDocs();
 }catch(error){alert("Lock update failed: "+(error.code||error.message))}
}
async function uploadDocumentFromForm(){
 const btn=el("cloudUploadSubmit"),status=el("cloudUploadStatus");
 if(btn.disabled||!user)return;
 btn.disabled=true;status.textContent="Validating and uploading PDF...";
 try{
  const originalDate=uploadDateToIso(el("cloudUploadDate").value);
  const result=await uploadPdfDocument({db,user,reference:el("cloudUploadReference").value,date:originalDate,family:el("cloudUploadFamily").value,file:el("cloudUploadFile").files[0]});
  status.textContent="Uploaded PDF ("+Math.ceil(result.size/1024)+" KB) · Locked by default";
  el("cloudUploadForm").reset();
  // Show the newly uploaded PDF in Saved Documents, regardless of previous filters.
  el("cloudPeriod").value="all";
  updatePeriodControls();
  el("cloudYear").value=originalDate.slice(0,4);
  el("cloudMonth").value=originalDate.slice(0,7);
  el("cloudFamily").value="";
  // Search the exact uploaded reference so the record is visible regardless of date filters.
  el("cloudReferenceSearch").value=result.reference;
  await loadDocs();
 }catch(error){status.textContent="Upload failed: "+(error.code||error.message)}
 finally{btn.disabled=false}
}

export async function openDocument(id,duplicate=false){
  try{
    const s=await getDoc(doc(db,"documents",id));
    if(!s.exists())throw Error("Document not found");
    if(s.data().templateSource==="preset"){
      const data=s.data(),isPo=data.templateFamily==='purchase-order'||data.documentType==='Purchase Order',isDo=data.templateFamily==='delivery-ticket'||data.documentType==='Delivery Ticket',isReturn=data.templateFamily==='returning-ticket'||data.documentType==='Returning Ticket',isInvoice=data.templateFamily==='invoice'||data.documentType==='Invoice';
      const preset=encodeURIComponent(data.templateId||((isInvoice||isReturn||isDo||data.templateFamily==='salary-payslip'||data.templateFamily==='payment-voucher'||data.templateFamily==='commercial-invoice-packing-list'||data.templateFamily==='goods-received-note')?'standard':isPo?'purchase-credit':'rental3'));
      const family=data.templateFamily==='goods-received-note'?'&family=goods-received-note':data.templateFamily==='commercial-invoice-packing-list'?'&family=commercial-invoice-packing-list':data.templateFamily==='payment-voucher'?'&family=payment-voucher':data.templateFamily==='salary-payslip'?'&family=salary-payslip':isInvoice?'&family=invoice':isReturn?'&family=returning-ticket':isDo?'&family=delivery-ticket':isPo?'&family=purchase-order':'';
      const saved=duplicate?'&docId='+encodeURIComponent(id)+'&duplicate=1':(data.templateFamily==='goods-received-note'||data.templateFamily==='commercial-invoice-packing-list'?'&docId=':isInvoice?'&invoiceDoc=':isReturn?'&returnDoc=':isDo?'&doDoc=':isPo?'&poDoc=':'&presetDoc=')+encodeURIComponent(id);
      if(typeof window.DocSystemOpenPreset==='function'){
        window.DocSystemOpenPreset(data,id,duplicate);
        notify((duplicate?'Duplicate ready — enter a new reference: ':'Opening saved document: ')+(data.number||id));
        return;
      }
      // Legacy fallback for duplication or an older workspace without the in-place handler.
      window.location.href="./?preset="+preset+family+saved;
      return;
    }
    // A saved custom document must never inherit the last-used preset editor.
    const sourcePicker=document.getElementById("workspaceTemplateSource");
    if(sourcePicker && sourcePicker.value!=="custom"){
      sourcePicker.value="custom";
      sourcePicker.dispatchEvent(new Event("change",{bubbles:true}));
    }
    const payload=decode(s.data());
    if(duplicate&&payload.doc?.fieldValues)payload.doc.fieldValues.docno='';
    bridge().setDocument(payload);currentId=duplicate?null:id;
    if(duplicate)notify('Duplicate ready: enter a new document number (for example, add -R2) and save');
    else notify("Document opened: "+(s.data().number||""));
    document.querySelector('[data-tab="create"]').click();
  }catch(e){notify("Open failed: "+e.message)}
}
export async function loadUsers(){
  if(!user||!canManage())return;
  try{
    const snaps=await getDocs(canAdmin()?query(collection(db,"users"),limit(200)):query(collection(db,"users"),where("role","in",["manager","user","staff"]),limit(200)));
    el("userList").innerHTML=snaps.docs.map(s=>{let x=s.data();return '<div class="cloud-entry"><div><b>'+escape(x.email)+'</b><div class="muted">Account</div></div><div class="actions"><select data-role-uid="'+escape(s.id)+'" '+(!canAdmin()?'disabled':'')+'>'+(canAdmin()?["superadmin","manager","user"]:["manager","user"]).map(r=>'<option '+(r===(x.role==='staff'?'user':x.role)?'selected':'')+'>'+r+'</option>').join("")+'</select><select data-status-uid="'+escape(s.id)+'"><option '+(x.status==="active"?"selected":"")+'>active</option><option '+(x.status==="inactive"?"selected":"")+'>inactive</option></select><button data-user-save="'+escape(s.id)+'">Update</button></div></div>'}).join("");
  }catch(e){el("userList").textContent="Could not load users: "+e.message}
}
export async function saveUser(uid){
  if(!canManage())return;
  const row=el("userList").querySelector('[data-user-save="'+uid+'"]').closest(".cloud-entry");
  const newRole=row.querySelector("select[data-role-uid]").value;
  const status=row.querySelector("select[data-status-uid]").value;
  if(uid===user.uid&&status==="inactive"){alert("You cannot deactivate yourself.");return}
  try{const ref=doc(db,"users",uid);const current=await getDoc(ref);if(!current.exists())throw Error("Account missing");
    if(!canAdmin()&&current.data().role==="superadmin")throw Error("Manager cannot modify a superadmin account");
    const storedRole=canAdmin()?newRole:current.data().role;
    if(!["superadmin","manager","user","staff"].includes(storedRole))throw Error("Invalid role");
    await setDoc(ref,{role:storedRole,status},{merge:true});notify("Account updated");await loadUsers();
  }catch(e){alert("Update failed: "+e.message)}
}
export async function addUser(){
  if(!canManage())return;
  const email=el("newUserEmail").value.trim().toLowerCase();
  const password=el("newUserPassword").value;
  const chosenRole=el("newUserRole").value;
  if(!email.includes("@") || password.length<6)return alert("Enter an email and a password of at least 6 characters.");
  if(!["user","manager","superadmin"].includes(chosenRole))return alert("Select a valid role.");
  if(!canAdmin() && chosenRole==="superadmin")return alert("Superadmin assignment is restricted.");
  const button=el("cloudUserAdd");button.disabled=true;
  let secondary=null;
  try{
    const {getApp}=await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js");
    const config=getApp().options;
    secondary=initializeApp(config,"docsystem-user-provisioning");
    const newAuth=getAuth(secondary);
    const credentials=await createUserWithEmailAndPassword(newAuth,email,password);
    try{
      await setDoc(doc(db,"users",credentials.user.uid),{email,role:chosenRole,status:"active"});
    }catch(error){
      notify("Authentication user created, but profile creation failed. Contact administrator.");
      throw error;
    }
    await signOut(newAuth);
    el("newUserEmail").value="";el("newUserPassword").value="";
    notify("New user added: "+email);await loadUsers();
  }catch(error){alert("User creation failed: "+(error.code||error.message))}
  finally{button.disabled=false;if(secondary){try{await deleteApp(secondary)}catch(e){console.warn(e)}}}
}


export async function loadSavedPresetCopies(){
 const containers=[el('workspacePresetCopiesList'),el('presetCopyLibraryList')].filter(Boolean);
 if(!containers.length)return;
 if(!user){containers.forEach(x=>x.innerHTML='');return}
 try{
  const copies=await listPresetCopies(user);
  const label={'quotation':'Quotation','purchase-order':'Purchase Order','delivery-ticket':'Delivery Ticket','returning-ticket':'Returning Ticket','invoice':'Invoice'};
  const markup=copies.length?copies.map(copy=>
   '<div class="cloud-entry"><div><b>'+escape(copy.name)+'</b><div class="muted">'+escape(label[copy.family]||copy.family)+' · Based on '+escape(copy.basePresetId)+' · My Template</div></div>'+
   '<button type="button" class="small" data-open-preset-copy="'+escape(copy.id)+'" data-copy-family="'+escape(copy.family)+'" data-copy-base="'+escape(copy.basePresetId)+'">Use in Workspace</button>'+
   '<button type="button" class="small cloud-admin-only" data-edit-preset-copy="'+escape(copy.id)+'" data-copy-family="'+escape(copy.family)+'" data-copy-base="'+escape(copy.basePresetId)+'">Configure Copy</button></div>').join('')
   :'<p class="muted">No saved preset copies yet. Choose Configure Preset Templates above to duplicate an original and save a new reusable template.</p>';
  containers.forEach(x=>x.innerHTML=markup);
 }catch(error){
  containers.forEach(x=>x.innerHTML='<p class="muted">Cannot load saved preset copies: '+escape(error.message)+'</p>');
 }
}

el("cloudUploadForm").addEventListener("submit",e=>{e.preventDefault();uploadDocumentFromForm()});
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-open-doc]");if(a)openDocument(a.dataset.openDoc);
  const pdf=e.target.closest("[data-view-pdf]");if(pdf)viewPdfDocument(db,pdf.dataset.viewPdf).catch(error=>alert("PDF open failed: "+error.message));
  const lock=e.target.closest("[data-toggle-lock]");if(lock)toggleDocumentLock(lock.dataset.toggleLock,lock.dataset.nextLock==="true");
  const del=e.target.closest("[data-delete-doc]");if(del)deleteDocument(del.dataset.deleteDoc);
  const b=e.target.closest("[data-copy-doc]");if(b)openDocument(b.dataset.copyDoc,true);
  const c=e.target.closest("[data-user-save]");if(c)saveUser(c.dataset.userSave);
  if(e.target.id==="cloudRefresh")loadDocs();
  if(e.target.id==="cloudSave")saveDocument();
  if(e.target.id==="cloudUserAdd")addUser();
});
const initialDate=new Date();
el("cloudYear").value=String(initialDate.getFullYear());
el("cloudMonth").value=String(initialDate.getFullYear())+"-"+String(initialDate.getMonth()+1).padStart(2,"0");
const updatePeriodControls=()=>{
 const period=el("cloudPeriod").value;
 el("cloudMonth").disabled=period!=="month";
 el("cloudMonthLabel").hidden=period!=="month";
};
el("cloudPeriod").addEventListener("change",()=>{updatePeriodControls();if(el("cloudReferenceSearch"))el("cloudReferenceSearch").value="";loadDocs()});
el("cloudYear").addEventListener("change",()=>{
 const year=Number(el("cloudYear").value);
 if(!Number.isInteger(year)||year<2000||year>2100){el("cloudYear").value=String(new Date().getFullYear());return}
 if(el("cloudPeriod").value==="month")el("cloudMonth").value=year+"-"+(el("cloudMonth").value.slice(5)||String(new Date().getMonth()+1).padStart(2,"0"));
 if(el("cloudReferenceSearch"))el("cloudReferenceSearch").value="";
 loadDocs();
});
el("cloudMonth").addEventListener("change",()=>{if(el("cloudMonth").value)el("cloudYear").value=el("cloudMonth").value.slice(0,4);if(el("cloudReferenceSearch"))el("cloudReferenceSearch").value="";loadDocs()});
updatePeriodControls();
el("cloudFamily")?.addEventListener("change",loadDocs);
el("cloudNumberSort")?.addEventListener("change",loadDocs);
el("cloudReferenceSearch")?.addEventListener("change",loadDocs);
