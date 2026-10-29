import * as cloud from "./cloud.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDPIAoqy9mbWU-4M4kPK9mfSjtVSSA2gI8",
  authDomain: "docsystem-c29ec.firebaseapp.com",
  projectId: "docsystem-c29ec",
  storageBucket: "docsystem-c29ec.firebasestorage.app",
  messagingSenderId: "25451628479",
  appId: "1:25451628479:web:ec00096fc84d744c48c30a",
  measurementId: "G-0ZZ1KHP7MH"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const screen = document.getElementById("authGate");
const message = document.getElementById("authMessage");
const form = document.getElementById("authForm");
const submit = document.getElementById("authSubmit");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const account = document.getElementById("authAccount");
const logout = document.getElementById("authLogout");
let currentUid = null;
function lock(text = "") {
  document.documentElement.classList.remove("auth-ready");
  screen.hidden = false;
  account.hidden = true;
  if(text) message.textContent = text;
}
function unlock(user, profile) {
  screen.hidden = true;
  message.textContent = "";
  account.hidden = false;
  account.textContent = (profile.email || user.email) + " · " + profile.role;
  document.documentElement.classList.add("auth-ready");
}
lock("Checking sign-in...");
form.addEventListener("submit", async event => {
  event.preventDefault();
  submit.disabled = true;
  message.textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
    loginPassword.value = "";
  } catch (error) {
    console.error("DocSystem sign-in failed:", error);
    message.textContent = "Sign-in failed: " + (error.code || error.message);
  } finally {
    submit.disabled = false;
  }
});
logout.addEventListener("click", async () => {
  lock("Signing out...");
  await signOut(auth);
});
onAuthStateChanged(auth, async user => {
  const uid = user?.uid || null;
  currentUid = uid;
  if (!user) {
    cloud.clearCloud();
    window.DocSystemCloud=null;
    lock("Sign in with your approved account.");
    return;
  }
  lock("Checking account access...");
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (currentUid !== uid) return;
    const profile = snap.exists() ? snap.data() : null;
    const validRole = ["superadmin", "manager", "staff"].includes(profile?.role);
    if (!profile || profile.status !== "active" || !validRole ||
        (profile.email || "").toLowerCase() !== (user.email || "").toLowerCase()) {
      await signOut(auth);
      lock("Account not approved, inactive, or missing a valid user profile. Contact an administrator.");
      return;
    }
    window.DocSystemCloud=cloud;
    document.querySelectorAll('[data-tab="company"],[data-tab="template"],[data-tab="backup"]').forEach(x=>x.hidden=!["superadmin","manager"].includes(profile.role));
    unlock(user, profile);
    cloud.startCloud(user, profile).catch(error => {
      console.error("DocSystem cloud initialization failed:", error);
      const status=document.getElementById("cloudStatus");
      if(status) status.textContent="Cloud loading failed: "+(error.code || error.message);
    });
  } catch (error) {
    console.error("DocSystem user profile check failed:", error);
    lock("Account verification failed: " + (error.code || error.message));
  }
});
