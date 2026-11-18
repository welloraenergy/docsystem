// PDF upload module: Base64 bytes are stored separately from document-list metadata.
import {doc,getDoc,setDoc,deleteDoc,collection,query,where,limit,getDocs,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
const TARGET_PDF_BYTES=100*1024;
const MAX_PDF_BYTES=200*1024;
// Display dates as dd/mm/yy; retain ISO YYYY-MM-DD in Firestore for date filtering.
export function displayDocumentDate(value){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||""));
 return match?match[3]+"/"+match[2]+"/"+match[1].slice(-2):String(value||"");
}
export function uploadDateToIso(value){
 const match=/^(\d{2})\/(\d{2})\/(\d{2})$/.exec(String(value||"").trim());
 if(!match)throw Error("Enter document date as dd/mm/yy (e.g. 17/11/26).");
 const year=2000+Number(match[3]),month=Number(match[2]),day=Number(match[1]);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw Error("Enter a valid document date as dd/mm/yy.");
 return String(year)+"-"+match[2]+"-"+match[1];
}
const fileRecord=id=>({collection:"documentFiles",id});
const asBase64=bytes=>{let out="";for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out)};
const fromBase64=s=>{const binary=atob(s);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes};
const looksLikePdf=bytes=>bytes.length>=5&&String.fromCharCode(...bytes.subarray(0,5))==="%PDF-";
async function optimizedPdf(file){
 const original=new Uint8Array(await file.arrayBuffer());
 if(!looksLikePdf(original))throw Error("Only valid PDF files can be uploaded.");
 if(original.length<=TARGET_PDF_BYTES)return original;
 // Prefer lossless PDF structure optimization: keep vector text, images, and signatures intact.
 // Never replace a smaller original with a larger optimized result.
 let best=original;
 try{
  const {PDFDocument}=await import("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm");
  const pdf=await PDFDocument.load(original);
  const optimized=await pdf.save({useObjectStreams:true,objectsPerTick:50});
  if(looksLikePdf(optimized)&&optimized.length<best.length)best=optimized;
 }catch(e){
  // A valid original within the fallback limit remains uploadable even if
  // PDF-lib cannot process its encryption, signatures, or unsupported features.
  if(original.length>MAX_PDF_BYTES)throw Error("PDF optimization could not be completed and the original is above 200 KB. "+(e.message||""));
 }
 if(best.length>MAX_PDF_BYTES)throw Error("PDF remains "+Math.ceil(best.length/1024)+" KB after optimization. Maximum is 200 KB; please reduce the PDF size without making its text or signatures unreadable.");
 return best;
}
export async function uploadPdfDocument({db,user,reference,date,family,file}){
 if(!user)throw Error("Please sign in first.");
 const number=String(reference||"").trim();
 if(!number)throw Error("Document reference is required.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T12:00:00")))throw Error("Enter the original document date.");
 if(!file||(!/\.pdf$/i.test(file.name)&&file.type!=="application/pdf"))throw Error("Select a PDF file.");
 const bytes=await optimizedPdf(file);
 let match;
 try{match=await getDocs(query(collection(db,"documents"),where("number","==",number),limit(1))}
 catch(e){if(e.code==="permission-denied")throw Error("Permission denied checking document references in Firestore documents. Check documents read/query rules.");throw e}
 if(!match.empty)throw Error("A document with this reference already exists. Use a unique reference.");
 const ref=doc(collection(db,"documents"));
 const pdfRef=doc(db,"documentFiles",ref.id);
 // Write the payload first to avoid a listing row without an accessible PDF.
 try{await setDoc(pdfRef,{base64:asBase64(bytes),contentType:"application/pdf",size:bytes.length,createdBy:user.uid,createdAt:serverTimestamp()})}
 catch(e){if(e.code==="permission-denied")throw Error("Permission denied saving PDF data in Firestore documentFiles. Check documentFiles create rules for the signed-in user.");throw e}
 try{
  await setDoc(ref,{number,date,documentType:family,templateFamily:family,templateSource:"uploaded-pdf",fileType:"application/pdf",fileName:file.name,fileSize:bytes.length,fileId:ref.id,locked:true,createdBy:user.uid,updatedBy:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 }catch(e){try{await deleteDoc(pdfRef)}catch{}if(e.code==="permission-denied")throw Error("Permission denied creating document metadata in Firestore documents. Check documents create rules for uploaded PDFs.");throw e}
 return {id:ref.id,size:bytes.length};
}
export async function viewPdfDocument(db,id){
 // Open synchronously before Firebase awaits to avoid popup blocking.
 const tab=window.open("","_blank");
 try{
  const ref=doc(db,"documentFiles",id);
  const snap=await getDoc(ref);
  if(!snap.exists()||typeof snap.data().base64!=="string")throw Error("Uploaded PDF data not found.");
  const bytes=fromBase64(snap.data().base64);
  if(!looksLikePdf(bytes))throw Error("Stored document is not a valid PDF.");
  const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  if(tab){tab.location.href=url;tab.addEventListener("load",()=>setTimeout(()=>URL.revokeObjectURL(url),60000),{once:true})}
  else{const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 }catch(e){if(tab)tab.close();throw e}
}
export async function removePdfPayload(db,id){await deleteDoc(doc(db,"documentFiles",id))}
