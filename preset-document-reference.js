/* Shared preset reference number and date handling. Legacy saved references are left unchanged. */
export const familyCode={quotation:'QUO','purchase-order':'PO','delivery-ticket':'DT','returning-ticket':'RT',invoice:'INV','payment-voucher':'PV','pay-slip':'SP'};
export function shortDate(value){
 if(!value)return '';
 const d=new Date(String(value).slice(0,10)+'T12:00:00');
 if(Number.isNaN(d.getTime()))return String(value);
 const parts=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).formatToParts(d);
 const val=type=>parts.find(p=>p.type===type)?.value||'';
 return val('weekday')+', '+val('day')+' '+val('month')+', '+val('year');
}
export function refPrefix(code,date){
 const year=/^\d{4}/.exec(String(date||''))?.[0]||String(new Date().getFullYear());
 return 'WLR-'+code+'('+year.slice(-2)+')-';
}
export function fullReference(prefix,input){return prefix+String(input??'').replace(/^\s+/,'');}
export function referenceSuffix(full,prefix){
 const val=String(full||'');return val.startsWith(prefix)?val.slice(prefix.length):val;
}
export function updateReferenceYear(oldValue,code,date){
 const prefix=refPrefix(code,date),old=String(oldValue||'');
 const matching=new RegExp('^WLR-'+code+'\\([0-9]{2}\\)-');
 if(!old||matching.test(old))return prefix+old.replace(matching,'');
 return old; // historical reference without standard prefix
}
export function mountReferenceField(input,code,date,full){
 if(!input)return;
 const prefix=refPrefix(code,date),v=String(full||'');
 if(v&&!v.startsWith('WLR-'+code+'('))return; // legacy document stays fully editable
 const wrapper=document.createElement('div');wrapper.className='preset-reference-control';
 const tag=document.createElement('span');tag.className='preset-reference-prefix';tag.textContent=prefix;
 input.parentNode.insertBefore(wrapper,input);wrapper.append(tag,input);
 input.value=referenceSuffix(v,prefix);
 input.dataset.referenceSuffix=code;
 input.placeholder='Enter number';
}
export function syncReferenceField(root,code,date,value){
 const prefix=refPrefix(code,date),input=root?.querySelector('[data-reference-suffix]');
 if(!input)return;
 const tag=input.parentElement.querySelector('.preset-reference-prefix');if(tag)tag.textContent=prefix;
 input.value=referenceSuffix(value,prefix);
}
