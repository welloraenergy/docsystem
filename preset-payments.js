import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,query,where,limit,getDocs,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import {sharedPresetSlot} from './preset-shared.js';
import {currencyAmountWords} from './preset-amount-words.js';
import {paginatePresetDocument} from './preset-pagination.js?v=20261114-payment-layout1';
import {encodePreset,decodePreset,reportPresetSaved,reportPresetSaveError} from './preset-online-sync.js';
import {refPrefix,fullReference,updateReferenceYear,mountReferenceField,syncReferenceField} from './preset-document-reference.js';
const kind=new URLSearchParams(location.search).get('family')||document.body.dataset.family;
const slip=kind==='pay-slip',family=slip?'pay-slip':'payment-voucher',title=slip?'SALARY PAYSLIP':'PAYMENT VOUCHER',code=slip?'PS':'PV';
const app=initializeApp({apiKey:"AIzaSyDPIAoqy9mbWU-4M4kPK9mfSjtVSSA2gI8",authDomain:"docsystem-c29ec.firebaseapp.com",projectId:"docsystem-c29ec",storageBucket:"docsystem-c29ec.firebasestorage.app",messagingSenderId:"25451628479",appId:"1:25451628479:web:ec00096fc84d744c48c30a"});
const auth=getAuth(app),db=getFirestore(app),params=new URLSearchParams(location.search),embedded=params.get('embedded')==='1';
if(embedded)document.body.classList.add('embedded');
const $=id=>document.getElementById(id),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const emptyNumber=v=>String(v??'').trim()?fmt(number(v)):' ';
const number=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const today=()=>new Date().toLocaleDateString('en-CA').split('/').reverse().join('-');
const dateText=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?d.slice(8)+'/'+d.slice(5,7)+'/'+d.slice(0,4):d||'';
const shortSignatureDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')?d.slice(8)+'/'+d.slice(5,7)+'/'+d.slice(2,4):String(d||'').replace(/^(\d{2}\/\d{2}\/)(\d{4})$/,(_,prefix,year)=>prefix+year.slice(-2));
function parseDateDisplay(value){const raw=String(value||'').trim();if(!raw)return '';const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);if(!m)return null;const day=+m[1],month=+m[2],year=+m[3],d=new Date(year,month-1,day);return d.getFullYear()===year&&d.getMonth()===month-1&&d.getDate()===day?String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'):null}
function dateEditor(value,attrs){return '<span class="payment-date-control"><input type="text" inputmode="numeric" placeholder="DD/MM/YYYY" data-payment-date-display '+attrs+' value="'+esc(dateText(value))+'"><button type="button" class="payment-date-trigger" data-payment-open-date aria-label="Choose date" title="Choose date">📅</button><input type="date" class="payment-native-date" tabindex="-1" data-payment-date-picker '+attrs+' value="'+esc(value||'')+'"></span>'}
const notice=s=>{$('status').textContent=s;post('status',{status:s})};
const post=(kind,extra={})=>{if(embedded&&window.parent!==window)window.parent.postMessage({type:'docsystem-preset-'+kind,...extra},location.origin)};
let user,profile,profiles=[],role='user',docId=params.get('docId')||null,recordSnapshot=null,headSnapshot=null,globalPlaceholders={},state;
function defaults(){
 const date=new Date(),month=String(date.getMonth()+1).padStart(2,'0');
 return slip?{reference:refPrefix(code,date.toISOString().slice(0,10)),month,year:String(date.getFullYear()),fullName:'',icNo:'',department:'',employeeNo:'',epfNo:'',earnings:{basicSalary:'',overtime:'',bonus:'',commission:'',allowance:'',other:''},deductions:{epf:'',socso:'',eis:'',pcb:'',skbbk:''},bankAccountName:'',bankAccountNo:'',employerEPF:'',employerSocso:'',employerEIS:''}
 :{reference:refPrefix(code,date.toISOString().slice(0,10)),date:date.toISOString().slice(0,10),chequeNo:'-',currency:'MYR',payTo:'',items:Array.from({length:5},()=>({description:'',amount:''})),postings:Array.from({length:5},()=>({debitCode:'',debitAccount:'',debitAmount:'',creditCode:'',creditAccount:'',creditAmount:''})),signatures:{checked:{},authorised:{},received:{}},receivedIc:''};
}
state=defaults();
function currentBusiness(){
 const co=(profile?.company||{});return recordSnapshot||{id:profile?.id||'',name:co.name||'',logo:co.logo||'',info:typeof co.headerText==='string'&&co.headerText.trim()?co.headerText:(co.fields||[]).filter(x=>x.value&&x.place!=='footer').map(x=>(x.label?x.label+': ':'')+x.value).join('\n'),defaultCurrency:co.defaultCurrency||'MYR',placeholders:globalPlaceholders};
}
function slot(id){return sharedPresetSlot(id,{...currentBusiness(),documentTitle:title,documentNumber:state.reference,documentDate:state.date||''},headSnapshot||profile?.presetHeader||{},globalPlaceholders)}
function input(label,key,type='text',options=null){
 const v=state[key]??'',id='f-'+key;
 let el=type==='date'?dateEditor(v,'data-field="'+key+'"'):options?'<select data-field="'+key+'" id="'+id+'">'+options.map(o=>'<option value="'+esc(o.value||o)+'" '+(String(o.value||o)===String(v)?'selected':'')+'>'+esc(o.label||o)+'</option>').join('')+'</select>':'<input id="'+id+'" data-field="'+key+'" type="'+type+'" value="'+esc(v)+'">';
 return '<label class="form-field"><span class="field-label">'+esc(label)+'</span>'+el+'</label>';
}
function moneyField(label,group,key){return '<label class="form-field"><span class="field-label">'+esc(label)+'</span><input inputmode="decimal" data-money-group="'+group+'" data-money-key="'+key+'" value="'+esc(state[group]?.[key]??'')+'"></label>'}
function referenceDate(){return slip?String(state.year||new Date().getFullYear())+'-01-01':state.date||new Date().toISOString().slice(0,10)}
function renderForm(){
 const monthOptions=Array.from({length:12},(_,i)=>({value:String(i+1).padStart(2,'0'),label:new Date(2020,i,1).toLocaleString('en-GB',{month:'long'})}));
 let html=slip?'':'<h3 class="editor-section-title">Currency Settings</h3><div class="form-grid currency-settings">'+input('Currency','currency','text',[{value:'MYR',label:'Ringgit Malaysia (MYR)'},{value:'USD',label:'United States Dollar (USD)'}])+'</div>';
  html+='<h3 class="editor-section-title">Document Information</h3><div class="form-grid">'+input('Document Reference','reference')+(slip?input('Month','month','text',monthOptions)+input('Year','year','number'):input('Date','date','date')+input('Cheque No.','chequeNo'))+'</div>';
 if(slip){
  html+='<h3>Employee Information</h3><div class="form-grid">'+[['Full Name','fullName'],['IC No.','icNo'],['Department','department'],['Employee No.','employeeNo'],['EPF No.','epfNo'],['Bank Account Name','bankAccountName'],['Bank Account No.','bankAccountNo']].map(([label,key])=>input(label,key)).join('')+'</div>';
  html+='<h3>Earnings (RM)</h3><div class="form-grid">'+[['Basic Salary','basicSalary'],['Over Time','overtime'],['Bonus','bonus'],['Commission','commission'],['Allowance','allowance'],['Other / Additional Earning','other']].map(([label,key])=>moneyField(label,'earnings',key)).join('')+'</div>';
  html+='<h3>Employee Deductions (RM)</h3><div class="form-grid">'+[['Employee EPF','epf'],['Employee Socso','socso'],['Employee EIS','eis'],['PCB','pcb'],['SKBBK','skbbk']].map(([label,key])=>moneyField(label,'deductions',key)).join('')+'</div>';
  html+='<h3>Employer Contributions (RM)</h3><div class="form-grid">'+[['Employer EPF','employerEPF'],['Employer Socso','employerSocso'],['Employer EIS','employerEIS']].map(([label,key])=>input(label,key,'number')).join('')+'</div>';
 }else{
  html+='<h3>Payee</h3>'+input('Pay To','payTo');
  html+='<h3>Payment Details</h3><div class="table-scroll"><table class="edit-table" style="table-layout:fixed;width:100%"><colgroup><col style="width:36px"><col style="width:62%"><col><col style="width:48px"></colgroup><thead><tr><th>No.</th><th>Description</th><th>Amount</th><th></th></tr></thead><tbody>'+state.items.map((r,i)=>'<tr><td>'+(i+1)+'</td><td><textarea data-array="items" data-index="'+i+'" data-key="description">'+esc(r.description)+'</textarea></td><td><input inputmode="decimal" data-array="items" data-index="'+i+'" data-key="amount" value="'+esc(r.amount)+'"></td><td><button type="button" data-remove-item="'+i+'">×</button></td></tr>').join('')+'</tbody></table></div><button type="button" id="addItem">+ Add Item</button>';
  html+='<h3>Posting To — Debit / Credit</h3><div class="table-scroll"><table class="edit-table"><thead><tr><th>Debit Code</th><th>Debit Account Name</th><th>Debit Amount</th><th>Credit Code</th><th>Credit Account Name</th><th>Credit Amount</th><th></th></tr></thead><tbody>'+state.postings.map((r,i)=>'<tr>'+[['debitCode','text'],['debitAccount','text'],['debitAmount','decimal'],['creditCode','text'],['creditAccount','text'],['creditAmount','decimal']].map(([k])=>'<td><input data-array="postings" data-index="'+i+'" data-key="'+k+'" value="'+esc(r[k])+'"></td>').join('')+'<td><button type="button" data-remove-posting="'+i+'">×</button></td></tr>').join('')+'</tbody></table></div><button type="button" id="addPosting">+ Add Posting Row</button>';
  html+='<h3>Approval / Receipt</h3><div class="pv-sign-editor">'+['checked','authorised','received'].map(k=>'<fieldset><legend>'+({checked:'Checked By',authorised:'Authorised By',received:'Received By'}[k])+'</legend>'+[['Name','name'],['Position','position'],['Date','date']].map(([l,field])=>'<label class="form-field"><span class="field-label">'+l+'</span>'+(field==='date'?dateEditor(state.signatures[k]?.[field]||'','data-sign="'+k+'" data-sign-key="'+field+'"'):'<input type="text" data-sign="'+k+'" data-sign-key="'+field+'" value="'+esc(state.signatures[k]?.[field]||'')+'">')+'</label>').join('')+'</fieldset>').join('')+'</div><div class="pv-received-id">'+input('Received By — IC No.','receivedIc')+'</div>';
 }
 $('formFields').innerHTML=html;
 mountReferenceField($('f-reference'),code,referenceDate(),state.reference);
}
function sums(){const gross=Object.values(state.earnings||{}).reduce((a,b)=>a+number(b),0),ded=Object.values(state.deductions||{}).reduce((a,b)=>a+number(b),0);return {gross,ded,net:gross-ded,total:(state.items||[]).reduce((s,r)=>s+number(r.amount),0)}}
function table(headers,rows,cls=''){return '<table class="document-table '+cls+'">'+(cls.includes('financial')?'<colgroup><col style="width:7%"><col style="width:71%"><col style="width:22%"></colgroup>':'')+'<thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>'}
function tr(cells,cl=''){return '<tr class="'+cl+'">'+cells.map(x=>'<td>'+x+'</td>').join('')+'</tr>'}
function renderDocument(){
 const v=sums(),co=currentBusiness(),head='<div class="document-head"><div class="company">'+slot('logo')+slot('name')+slot('details')+'</div><div class="document-right"><h1>'+title+'</h1><div class="ref">Reference No: '+esc(state.reference)+'</div>'+(slip?'<div>Month / Year: '+esc(new Date(2020,Number(state.month||1)-1,1).toLocaleString('en-GB',{month:'long'}))+' '+esc(state.year)+'</div>':'<div>Date: '+dateText(state.date)+'</div><div>Cheque No: '+esc(state.chequeNo)+'</div><div>Currency: '+esc(state.currency)+'</div>')+'</div></div>';
 let body;
 if(slip){
  body='<section class="doc-section"><div class="section-head">Employee Information</div><div class="info-grid">'+[['Full Name','fullName'],['IC No.','icNo'],['Department','department'],['Employee No.','employeeNo'],['EPF No.','epfNo']] .map(([l,k])=>'<div><b>'+l+':</b> <span>'+esc(state[k])+'</span></div>').join('')+'</div></section>';
  const earning=[['a) Basic Salary','basicSalary'],['b) Over Time','overtime'],['c) Bonus','bonus'],['d) Commission','commission'],['e) Allowance','allowance'],['f) Other / Additional Earning','other']];
  const deduction=[['a) Employee EPF','epf'],['b) Employee Socso','socso'],['c) Employee EIS','eis'],['d) PCB','pcb'],['e) SKBBK','skbbk']];
  const rows=[tr(['1','<strong>Earning</strong>',''],'group'),...earning.map(([l,k])=>tr(['',esc(l),emptyNumber(state.earnings[k])])),tr(['','<b>Gross Pay</b>','<b>'+fmt(v.gross)+'</b>'],'total'),tr(['2','<strong>Deduction</strong>',''],'group'),...deduction.map(([l,k])=>tr(['',esc(l),emptyNumber(state.deductions[k])])),tr(['','<b>Total Deduction</b>','<b>'+fmt(v.ded)+'</b>'],'total'),tr(['','<b>Net Pay (RM)</b>','<b>'+fmt(v.net)+'</b>'],'net')];
  body+='<div class="section-head">Earnings &amp; Deductions</div>'+table(['No.','Description','Amount (RM)'],rows,'financial excel-table');
  body+='<section class="doc-section"><div class="section-head">Payment &amp; Employer Contributions</div><div class="info-grid">'+[['Bank Account Name','bankAccountName'],['Bank Account No.','bankAccountNo'],['Employer EPF','employerEPF'],['Employer Socso','employerSocso'],['Employer EIS','employerEIS']] .map(([l,k])=>'<div><b>'+l+':</b> <span>'+esc(k.startsWith('employer')?emptyNumber(state[k]):state[k])+'</span></div>').join('')+'</div></section><p class="electronic-note">This document is generated electronically, no signature required</p>';
 }else{
  body='<div class="section-head">Payment Information</div><div class="pay-to"><b>Pay To:</b> '+esc(state.payTo)+'</div>';
  body+=table(['No.','Description','Amount ('+esc(state.currency)+')'],state.items.map((r,i)=>tr([String(i+1),esc(r.description).replace(/\n/g,'<br>'),emptyNumber(r.amount)])),'financial excel-table');
  body+='<div class="totals"><b>Total ('+esc(state.currency)+')</b><b>'+fmt(v.total)+'</b></div><div class="amount-words"><b>Amount in Words:</b> '+esc(currencyAmountWords(v.total,state.currency))+'</div>';
  body+='<div class="section-head">Posting To</div>'+table(['Debit Code','Debit Account Name','Amount','Credit Code','Credit Account Name','Amount'],state.postings.map(r=>tr([esc(r.debitCode),esc(r.debitAccount),emptyNumber(r.debitAmount),esc(r.creditCode),esc(r.creditAccount),emptyNumber(r.creditAmount)])),'postings');
  const debit=state.postings.reduce((s,r)=>s+number(r.debitAmount),0),credit=state.postings.reduce((s,r)=>s+number(r.creditAmount),0);
  body+='<div class="posting-totals"><span>Debit: '+fmt(debit)+'</span><span>Credit: '+fmt(credit)+'</span><span class="'+(Math.abs(debit-credit)<0.005?'balanced':'unbalanced')+'">'+(Math.abs(debit-credit)<0.005?'Balanced':'Not balanced')+'</span></div>';
  body+='<div class="section-head">Approvals</div>'+table(['','Name','Position','Date','Signature'],['checked','authorised','received'].map(k=>tr([({checked:'Checked By',authorised:'Authorised By',received:'Received By'}[k]),esc(state.signatures[k]?.name),esc(state.signatures[k]?.position),shortSignatureDate(state.signatures[k]?.date),'<div class="signature-space"></div>'])),'approval')+'<div class="received-ic">Received By — IC No.: '+esc(state.receivedIc)+'</div>';
 }
 $('paper').innerHTML='<article class="paper">'+head+body+'</article>';
 const pages=paginatePresetDocument($('paper'),{fit:'normal',bottomReserveMm:10});
 $('pageCount').textContent=pages+' page(s)';
 fitPreview();
}
function fitPreview(){const holder=document.querySelector('.preview-column'),root=$('paper');if(!holder||!root)return;const pageWidth=210*96/25.4,scale=Math.min(1,Math.max(.3,(holder.clientWidth-16)/pageWidth));root.querySelectorAll('.paper').forEach(p=>p.style.zoom=String(Math.round(scale*1000)/1000))}
function redraw(){renderForm();renderDocument();post('height',{height:document.documentElement.scrollHeight+8})}
window.addEventListener('resize',()=>{fitPreview();post('height',{height:document.documentElement.scrollHeight+8})});
async function save(){
 if(!user)return alert('Sign in to DocSystem first');
 if(!profile)return alert('Select a Business Profile');
 if(!String(state.reference||'').trim()||state.reference===refPrefix(code,state.date||new Date().toISOString().slice(0,10)))return alert('Enter a complete reference number');
 if(slip&&!state.fullName.trim())return alert('Enter employee full name');
 if(!slip&&(!state.payTo.trim()||!['MYR','USD'].includes(state.currency)))return alert('Enter Pay To and select a valid currency');
 try{
 const co=currentBusiness();
 if(!docId){
  const hits=await getDocs(query(collection(db,'documents'),where('number','==',state.reference.trim()),limit(100)));
  if(hits.docs.some(x=>x.data().templateFamily===family&&x.data().profileId===co.id))return alert('This reference already exists for this Business Profile. Open the saved document instead.');
 }
 const ref=docId?doc(db,'documents',docId):doc(collection(db,'documents')),old=await getDoc(ref);
 await setDoc(ref,{templateSource:'preset',templateFamily:family,templateId:'standard',templateVersion:1,documentType:slip?'Pay Slip':'Payment Voucher',number:state.reference,date:slip?state.year+'-'+state.month+'-01':state.date,presetData:encodePreset(state),profileId:co.id,profileName:co.name||'',companySnapshot:encodePreset(co),presetHeaderSnapshot:encodePreset(headSnapshot||profile?.presetHeader||{}),updatedAt:serverTimestamp(),updatedBy:user.uid,...(!old.exists()?{createdAt:serverTimestamp(),createdBy:user.uid,creatorRole:role}:{})},{merge:true});
 docId=ref.id;recordSnapshot=co;notice('Saved online: '+state.reference);reportPresetSaved(state.reference,docId);
 }catch(e){notice('Save failed: '+(e.code||e.message));reportPresetSaveError(e)}
}
async function openSaved(){
 try{const snap=await getDoc(doc(db,'documents',docId));if(!snap.exists())throw Error('Document not found');const d=snap.data();if(d.templateFamily!==family)throw Error('Different document family');state=decodePreset(d.presetData);recordSnapshot=decodePreset(d.companySnapshot||null);headSnapshot=decodePreset(d.presetHeaderSnapshot||null);profile=profiles.find(x=>x.id===d.profileId)||profile;redraw();notice('Opened '+d.number);ready()}catch(e){notice('Cannot open saved document: '+e.message)}
}
function ready(){post('ready',{profiles:profiles.map(p=>({id:p.id,name:p.company?.name||'Business'})),selected:currentBusiness().id,locked:!!docId,status:$('status').textContent})}
function newDoc(){docId=null;recordSnapshot=null;headSnapshot=null;state=defaults();if(!slip)state.currency=currentBusiness().defaultCurrency||'MYR';redraw();notice('New '+title);ready()}
window.printDoc=()=>{const ref=(state.reference||title).replace(/[\\/:*?"<>|]/g,'-');document.title=ref;if(window.parent!==window){const previous=window.parent.document.title;window.parent.document.title=ref;window.addEventListener('afterprint',()=>window.parent.document.title=previous,{once:true})}document.body.classList.add('printing');renderDocument();window.print()};
window.addEventListener('afterprint',()=>document.body.classList.remove('printing'));
document.addEventListener('input',e=>{const d=e.target.dataset;if(d.paymentDateDisplay!==undefined||d.paymentDatePicker!==undefined)return;if(d.field){if(d.field==='reference'&&e.target.dataset.referenceSuffix)state.reference=fullReference(refPrefix(code,referenceDate()),e.target.value);else{state[d.field]=e.target.value;if(d.field==='date'||slip&&d.field==='year'){state.reference=updateReferenceYear(state.reference,code,referenceDate());syncReferenceField($('formFields'),code,referenceDate(),state.reference)}}renderDocument()}else if(d.moneyGroup){state[d.moneyGroup][d.moneyKey]=e.target.value;renderDocument()}else if(d.array){state[d.array][Number(d.index)][d.key]=e.target.value;renderDocument()}else if(d.sign){state.signatures[d.sign][d.signKey]=e.target.value;renderDocument()}});
document.addEventListener('change',e=>{const d=e.target.dataset;if(d.paymentDateDisplay===undefined&&d.paymentDatePicker===undefined)return;const iso=d.paymentDateDisplay!==undefined?parseDateDisplay(e.target.value):e.target.value;if(iso===null){e.target.setCustomValidity('Enter a valid date as DD/MM/YYYY');e.target.reportValidity();return}e.target.setCustomValidity('');const host=e.target.closest('.payment-date-control');host.querySelector('[data-payment-date-display]').value=dateText(iso);host.querySelector('[data-payment-date-picker]').value=iso;if(d.sign){state.signatures[d.sign]??={};state.signatures[d.sign][d.signKey]=iso}else if(d.field){state[d.field]=iso;if(d.field==='date'){state.reference=updateReferenceYear(state.reference,code,state.date);syncReferenceField($('formFields'),code,referenceDate(),state.reference)}}renderDocument()});
document.addEventListener('click',e=>{const open=e.target.closest('[data-payment-open-date]');if(open){const picker=open.closest('.payment-date-control').querySelector('[data-payment-date-picker]');if(picker.showPicker)picker.showPicker();else picker.click();return}const b=e.target;if(b.id==='addItem'){state.items.push({description:'',amount:''});redraw()}if(b.id==='addPosting'){state.postings.push({debitCode:'',debitAccount:'',debitAmount:'',creditCode:'',creditAccount:'',creditAmount:''});redraw()}if(b.dataset.removeItem!==undefined){state.items.splice(Number(b.dataset.removeItem),1);if(!state.items.length)state.items.push({description:'',amount:''});redraw()}if(b.dataset.removePosting!==undefined){state.postings.splice(Number(b.dataset.removePosting),1);if(!state.postings.length)state.postings.push({debitCode:'',debitAccount:'',debitAmount:'',creditCode:'',creditAccount:'',creditAmount:''});redraw()}});
$('newBtn').onclick=()=>{if(confirm('Clear all fields and start a new document?'))newDoc()};$('saveBtn').onclick=save;$('printBtn').onclick=window.printDoc;
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='docsystem-preset-command')return;const a=e.data.action;if(a==='new')newDoc();if(a==='save')save();if(a==='print')window.printDoc();if(a==='view'){document.body.classList.toggle('printing',!!e.data.preview);renderDocument()}if(a==='business'&&!docId){profile=profiles.find(p=>p.id===e.data.profileId)||profile;redraw();ready()}});
onAuthStateChanged(auth,async u=>{user=u;if(!u){notice('Sign in from DocSystem first');return}try{const x=await getDoc(doc(db,'users',u.uid));role=x.data()?.role||'user'}catch{}try{const x=await getDoc(doc(db,'appSettings','main')),settings=x.data()?.settings||{};globalPlaceholders=settings.globalPlaceholders||{};profiles=(settings.profiles||[]).filter(p=>p?.company);profile=profiles.find(p=>p.id===settings.activeProfileId)||profiles[0];if(docId)await openSaved();else{if(!slip)state.currency=currentBusiness().defaultCurrency||'MYR';redraw();notice(title+' ready');ready()}}catch(e){notice('Unable to load Business Profiles: '+e.message)}});
