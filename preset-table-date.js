// A4 table-only date formatting. Firebase keeps ISO YYYY-MM-DD values.
export function tableDate(value){
 const raw=String(value??'').trim();
 if(!raw)return '';
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
 if(!iso)return raw;
 const [,year,month,day]=iso;
 const d=new Date(Number(year),Number(month)-1,Number(day),12);
 if(d.getFullYear()!==Number(year)||d.getMonth()!==Number(month)-1||d.getDate()!==Number(day))return raw;
 return day+'/'+month+'/'+year.slice(-2);
}
