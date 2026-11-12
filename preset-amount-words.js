// Shared wording for totals in the monetary document presets.
const small=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function belowThousand(n){
 if(n<20)return small[n];
 if(n<100)return tens[Math.floor(n/10)]+(n%10?' '+small[n%10]:'');
 return small[Math.floor(n/100)]+' Hundred'+(n%100?' '+belowThousand(n%100):'');
}
function spell(n){
 if(!n)return 'Zero';
 const parts=[];
 for(const [scale,name] of [[1000000000,'Billion'],[1000000,'Million'],[1000,'Thousand'],[1,'']]){
  const group=Math.floor(n/scale)%1000;
  if(group)parts.push(belowThousand(group)+(name?' '+name:''));
 }
 return parts.join(' ');
}
export function currencyAmountWords(amount,currency='MYR'){
 const code=String(currency||'MYR').toUpperCase();
 const names={MYR:'Malaysian Ringgit',USD:'United States Dollar'};
 const minor={MYR:'Sen',USD:'Cent'};
 const total=Math.round(Math.abs(Number(amount)||0)*100);
 const whole=Math.floor(total/100),fraction=total%100;
 const label=names[code]||code;
 if(whole>999999999999)return label+': '+Number(amount).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})+'.';
 return label+': '+spell(whole)+(fraction?' And '+spell(fraction)+' '+minor[code]:' Only')+'.';
}
