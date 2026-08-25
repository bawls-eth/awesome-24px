// ---------------------------------------------------------------------------
// PASTE YOUR FIREBASE CONFIG HERE  (this is the only setup step)
// ---------------------------------------------------------------------------
// 1. Go to https://console.firebase.google.com and create a free project.
// 2. In the project, click "Build" -> "Realtime Database" -> "Create Database"
//    (pick a location, then start in "Test mode" so friends can read/write —
//     see game/README.md for locking it down a bit later).
// 3. Click the gear icon -> "Project settings" -> scroll to "Your apps" ->
//    click the web icon "</>" to register a web app (any nickname, no hosting).
// 4. Firebase shows a `const firebaseConfig = { ... }` snippet. Copy the
//    OBJECT and replace the placeholder object below with it.
//
// The `databaseURL` line MUST be present. If Firebase's snippet doesn't show
// one, it looks like: https://YOUR-PROJECT-default-rtdb.firebaseio.com
//
// These keys are safe to commit — Firebase web config is meant to be public;
// access is controlled by the Realtime Database rules, not by hiding the key.
// ---------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: 'PASTE_YOUR_API_KEY',
  authDomain: 'PASTE_YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://PASTE_YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'PASTE_YOUR_PROJECT',
  appId: 'PASTE_YOUR_APP_ID',
};
