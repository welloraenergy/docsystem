import * as cloud from "./cloud.js?v=20261126-preset-only";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

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

const installButton = document.getElementById("installApp");
let installPrompt = null;
const installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
installButton.hidden = installed;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.hidden = true;
});
installButton.addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
  } else {
    alert("Use your browser menu and choose Install app (Chrome/Edge) or Add to Home Screen (Safari).");
  }
});
let sessionCheck = 0;
let currentUid = null;
let lastOnlineCheck = 0;
function lock(text = "") {
  document.documentElement.classList.remove("auth-ready");
  screen.hidden = false;
  account.hidden = true;
  if (text) message.textContent = text;
}
function unlock(user, profile) {
  screen.hidden = true;
  message.textContent = "";
  account.hidden = false;
  account.textContent = (profile.email || user.email) + " · " + profile.role;
  document.documentElement.classList.add("auth-ready");
}
async function verifyOnlineSession(user) {
  const attempt = ++sessionCheck;
  const uid = user?.uid || null;
  const alreadyOpen = document.documentElement.classList.contains("auth-ready") && currentUid === uid;
  currentUid = uid;
  if (!navigator.onLine) {
    lock("Internet connection required. DocSystem cannot be used offline.");
    return;
  }
  if (!user) {
    cloud.clearCloud();
    window.DocSystemRole = null;
    window.DocSystemCloud = null;
    lock("Sign in with your approved account.");
    return;
  }
  if (!alreadyOpen) lock("Verifying live online access...");
  try {
    // Server-only verification: never unlock using a cached account profile.
    const snap = await getDocFromServer(doc(db, "users", uid));
    if (attempt !== sessionCheck || currentUid !== uid || !navigator.onLine) return;
    const profile = snap.exists() ? snap.data() : null;
    const validRole = ["superadmin", "manager", "user", "staff"].includes(profile?.role);
    if (!profile || profile.status !== "active" || !validRole ||
        (profile.email || "").toLowerCase() !== (user.email || "").toLowerCase()) {
      await signOut(auth);
      lock("Account not approved, inactive, or missing a valid user profile. Contact an administrator.");
      return;
    }
    const normalizedRole = profile.role === "staff" ? "user" : profile.role;
    lastOnlineCheck = Date.now();
    // Periodic/focus checks must not reset the currently edited document.
    if (alreadyOpen) return;
    const managerOrAbove = ["superadmin", "manager"].includes(normalizedRole);
    window.DocSystemRole = normalizedRole;
    window.DocSystemCloud = cloud;
    document.querySelectorAll('#settingsNavTab, nav.tabs [data-tab="library"], [data-subpage="template"], #cloudMenuUsers').forEach(x => x.hidden = !managerOrAbove);
    // Wait for live settings and document listing before giving access to the workspace.
    await cloud.startCloud(user, profile);
    if (attempt !== sessionCheck || !navigator.onLine || auth.currentUser?.uid !== uid) return;
    lastOnlineCheck = Date.now();
    unlock(user, {...profile, role: normalizedRole});
  } catch (error) {
    if (attempt !== sessionCheck) return;
    console.error("DocSystem live access check failed:", error);
    lock("Online connection required. Live data could not be verified: " + (error.code || error.message));
  }
}
lock(navigator.onLine ? "Checking live connection..." : "Internet connection required. DocSystem cannot be used offline.");
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
const googleButton = document.getElementById("authGoogleSignIn");
if (googleButton) {
  googleButton.addEventListener("click", async () => {
    googleButton.disabled = true;
    message.textContent = "Signing in with Google...";
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      // Existing onAuthStateChanged verifies approved Firestore profile and role.
    } catch (error) {
      console.error("DocSystem Google sign-in failed:", error);
      message.textContent = error.code === "auth/popup-closed-by-user"
        ? "Google sign-in was cancelled."
        : "Google sign-in failed: " + (error.code || error.message);
    } finally {
      googleButton.disabled = false;
    }
  });
}
logout.addEventListener("click", async () => {
  lock("Signing out...");
  await signOut(auth);
});

onAuthStateChanged(auth, user => {
  verifyOnlineSession(user);
});
window.addEventListener("offline", () => {
  ++sessionCheck;
  lock("Internet connection required. DocSystem cannot be used offline.");
});
window.addEventListener("online", () => {
  if (auth.currentUser) verifyOnlineSession(auth.currentUser);
});
window.addEventListener("focus", () => {
  if (auth.currentUser && navigator.onLine && Date.now() - lastOnlineCheck > 30000) {
    verifyOnlineSession(auth.currentUser);
  }
});
// An open installed window must not continue functioning after it loses server access.
setInterval(async () => {
  if (!auth.currentUser || !navigator.onLine) return;
  if (!document.documentElement.classList.contains("auth-ready")) return;
  const uid = auth.currentUser.uid;
  try {
    const snap = await getDocFromServer(doc(db, "users", uid));
    if (!snap.exists() || snap.data().status !== "active") {
      ++sessionCheck;
      lock("Live account verification failed. Online access is required.");
    } else lastOnlineCheck = Date.now();
  } catch {
    ++sessionCheck;
    lock("Connection to Firestore lost. Reconnect to continue.");
  }
}, 60000);
