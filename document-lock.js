// Document deletion lock rules for generated and uploaded records.
// Server-side Firebase security rules must mirror these restrictions.
import {doc,getDocFromServer,updateDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
export const mayManageLocks=role=>role==="manager"||role==="superadmin";
export const isDocumentLocked=data=>data?.locked!==false;
export async function setDocumentLocked({db,id,user,role,locked}){
 if(!navigator.onLine)throw Error('Internet connection required.');
 if(!user||!mayManageLocks(role))throw Error("Only Manager or Superadmin may change document locks.");
 const ref=doc(db,"documents",id),snap=await getDocFromServer(ref);
 if(!snap.exists())throw Error("Document no longer exists.");
 if(isDocumentLocked(snap.data())===locked)return;
 await updateDoc(ref,{locked,lockUpdatedBy:user.uid,lockUpdatedAt:serverTimestamp(),lockAction:locked?"locked":"unlocked"});
}
export async function confirmDeleteUnlocked({db,id,user,role}){
 if(!user||!mayManageLocks(role))throw Error("Only Manager or Superadmin can delete documents.");
 const snap=await getDocFromServer(doc(db,"documents",id));
 if(!snap.exists())throw Error("Document no longer exists.");
 const data=snap.data();
 if(isDocumentLocked(data))throw Error("This document is locked. Unlock it first.");
 const reference=String(data.number||id);
 if(!window.confirm('Permanently delete document "'+reference+'"? This cannot be undone.'))return null;
 return data;
}
