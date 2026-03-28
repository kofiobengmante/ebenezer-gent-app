// app.js

// ---- Firebase Initialization ----
const firebaseConfig = {
  apiKey: "AIzaSyBUaW40a0S5KHW4IL5Y32ovx_yLhGfiOzM",
  authDomain: "gentpcgdb.firebaseapp.com",
  projectId: "gentpcgdb",
  storageBucket: "gentpcgdb.firebasestorage.app",
  messagingSenderId: "664791677905",
  appId: "1:664791677905:web:9b9e09e3e43bc8dda83ef0",
  measurementId: "G-WF0LJ06PZ0"
};

// Use compat libraries from CDN
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ---- State Management ----
let currentRoute = 'home';
let currentRouteParams = null; // Used for passing IDs to detailed views
let userState = null; 
let currentHymnTab = 'english'; 

let liveChatData = [];
let liveEvents = [];
let liveSermons = [];
let liveMembers = [];
let liveHymns = [];
let liveActivities = [];
let liveAlmanac = [];
let livePrivateMessages = [];
let churchInfo = { address: "oude Brusselseweg 59A, 9050 Gentbrugge", tel: "0499987556" };

let currentChatType = 'public'; // 'public' or 'private'
let activeRecipientId = null; 

let editingEventId = null;
let editingSermonId = null;
let editingHymnId = null;
let editingActivityId = null;
let editingAlmanacId = null;
let isBulkHymnMode = false;
let isNotificationsEnabled = localStorage.getItem('pcg_notif_enabled') === 'true';

// ---- Global Admin Utilities ----
window.cancelEdit = function() {
    editingEventId = null;
    editingSermonId = null;
    editingHymnId = null;
    editingActivityId = null;
    editingAlmanacId = null;
    renderApp();
}

window.deleteDoc = async function(coll, id) {
    if(!confirm('Are you sure you want to delete this?')) return;
    try {
        await db.collection(coll).doc(id).delete();
    } catch(e) { alert("Error deleting document"); }
}

window.toggleHymnTab = function(lang) {
    currentHymnTab = lang;
    setupLiveListeners(); // Re-listen for the new language
}

let unsubscribeChat = null;
let unsubscribeEvents = null;
let unsubscribeSermons = null;
let unsubscribeMembers = null;
let unsubscribeHymns = null;
let unsubscribeActivities = null;
let unsubscribeChurchInfo = null;
let unsubscribeAlmanac = null;
let unsubscribePrivateMessages = null;
let unsubscribeUnreadBadge = null;

let hasNewPrivateMsg = false;

const ADMIN_EMAIL = 'kofi.obeng.mante@gmail.com';

// ---- Local Fallback Data (Will be seeded to Firebase if empty) ----
const starterAlmanac = [
    { date: "2026-03-27", theme: "Mercy and Forgiveness", reading: "John 8:2-11", season: "Lent" },
    { date: "2026-03-29", theme: "Palm Sunday: The Humble King", reading: "Matthew 21:1-11", season: "Lent" },
    { date: "2026-04-03", theme: "Good Friday: The Sacrifice", reading: "Isaiah 53:1-12", season: "Lent" },
    { date: "2026-04-05", theme: "Easter Sunday: He Is Risen!", reading: "Matthew 28:1-10", season: "Easter" }
];

const starterActivities = [
    { day: "Sunday", title: "Church Divine Service", time: "10:00 AM - 1:00 PM" },
    { day: "Wednesday", title: "Bible Study", time: "8:00 PM - 9:00 PM" },
    { day: "Friday", title: "Prayer Evening", time: "8:00 PM - 9:00 PM" }
];

const starterChurchInfo = {
    address: "oude Brusselseweg 59A, 9050 Gentbrugge",
    tel: "0499987556",
    almanacPdfUrl: "",
    facebookUrl: "",
    youtubeUrl: "",
    tiktokUrl: ""
};

const fallbackEvents = [
    { title: "Sunday Divine Service", month: "Mar", day: "29", time: "10:00 AM", location: "Main Auditorium, Gent", description: "Join us for our weekly Divine Service. We will be taking communion and dedicating the new church project." },
    { title: "Mid-Week Bible Study", month: "Apr", day: "01", time: "6:30 PM", location: "Online (Zoom)", description: "We are diving deep into the Book of Romans. Bring your Bible and a notepad! Zoom Link: 812 3456 7890" }
];
const fallbackSermons = [
    { title: "Walking in Faith", speaker: "Rev. Dr. Samuel", date: "Mar 22, 2026", duration: "45:00", audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", isLive: false },
    { title: "Sunday Live Service Stream", speaker: "Ebenezer Congregation", date: "Live Now", duration: "--:--", audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", isLive: true }
];

const starterHymns = [];

// ---- App Initialization ----
document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth State
    auth.onAuthStateChanged(async (user) => {
        userState = user;
        if (user) {
            setupLiveListeners();
            await ensureDatabaseSeeded();
            
            // Register member into directory if not already there (simple logic for now)
            try {
                const membersSnap = await db.collection('members').where('email', '==', user.email).get();
                if(membersSnap.empty && user.email !== ADMIN_EMAIL) {
                    await db.collection('members').add({
                        name: user.displayName || user.email.split('@')[0],
                        email: user.email,
                        role: "Member",
                        initials: (user.displayName ? user.displayName.substring(0,2) : "MB").toUpperCase()
                    });
                }
            } catch(e) {}
        }
        renderApp();
    });
});

function setupLiveListeners() {
    // Unsubscribe existing listeners
    if (unsubscribeEvents) unsubscribeEvents();
    if (unsubscribeSermons) unsubscribeSermons();
    if (unsubscribeMembers) unsubscribeMembers();
    if (unsubscribeHymns) unsubscribeHymns();
    if (unsubscribeActivities) unsubscribeActivities();
    if (unsubscribeChurchInfo) unsubscribeChurchInfo();
    if (unsubscribeAlmanac) unsubscribeAlmanac();
    if (unsubscribePrivateMessages) unsubscribePrivateMessages();
    if (unsubscribeUnreadBadge) unsubscribeUnreadBadge();

    unsubscribeEvents = db.collection('events').orderBy('timestamp', 'desc').onSnapshot(snap => {
        liveEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentRoute === 'home' || currentRoute === 'admin') renderApp();
    });

    unsubscribeSermons = db.collection('sermons').onSnapshot(snap => {
        liveSermons = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentRoute === 'sermons' || currentRoute === 'admin') renderApp();
    });

    unsubscribeMembers = db.collection('members').onSnapshot(snap => {
        liveMembers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentRoute === 'directory' || currentRoute === 'admin') renderApp();
    });

    unsubscribeHymns = db.collection('hymns')
        .onSnapshot(snap => {
            liveHymns = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a,b) => (a.number || 0) - (b.number || 0));
            if (currentRoute === 'hymns' || currentRoute === 'admin') renderApp();
        }, err => console.error("Hymn Listener Error:", err));

    unsubscribeActivities = db.collection('activities').onSnapshot(snap => {
        liveActivities = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentRoute === 'home' || currentRoute === 'admin') renderApp();
    });

    unsubscribeChurchInfo = db.collection('settings').doc('church_info').onSnapshot(doc => {
        if(doc.exists) {
            churchInfo = doc.data();
            if (currentRoute === 'home' || currentRoute === 'admin') renderApp();
        }
    });

    unsubscribeAlmanac = db.collection('almanac').orderBy('date', 'asc').onSnapshot(snap => {
        liveAlmanac = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (currentRoute === 'home' || currentRoute === 'almanac' || currentRoute === 'admin') renderApp();
    });

    // Global listener for unread badge on Chat icon
    unsubscribeUnreadBadge = db.collection('private_messages')
        .where('receiverUid', '==', userState.uid)
        .where('read', '==', false)
        .onSnapshot(snap => {
            hasNewPrivateMsg = !snap.empty;
            renderNav(document.getElementById('bottom-nav'));
        });

    // Admin Social Moderation Listener (Sees all messages)
    if (userState.email === ADMIN_EMAIL) {
        db.collection('messages').orderBy('timestamp', 'desc').limit(10).onSnapshot(snap => {
            const pub = snap.docs.map(d => ({...d.data(), id: d.id, type: 'Public'}));
            db.collection('private_messages').orderBy('timestamp', 'desc').limit(10).onSnapshot(s => {
                const priv = s.docs.map(d => ({...d.data(), id: d.id, type: 'Private'}));
                const combined = [...pub, ...priv].sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)).slice(0, 15);
                updateAdminModFeed(combined);
            });
        });
    }
}

function updateAdminModFeed(msgs) {
    const feed = document.getElementById('admin-mod-feed');
    if(!feed) return;
    
    feed.innerHTML = msgs.map(m => `
        <div style="font-size: 0.75rem; border-bottom: 1px solid #fed7aa; padding: 0.4rem 0; display:flex; justify-content:space-between; align-items:center;">
            <div style="flex-grow:1;">
                <span class="badge" style="background:${m.type==='Public'?'#dcfce7':'#fee2e2'}; color:${m.type==='Public'?'#166534':'#991b1b'}; font-size:0.5rem; padding:0.1rem 0.3rem;">${m.type}</span>
                <strong>${m.name}</strong>: ${m.text}
            </div>
            <button onclick="deleteDoc('${m.type==='Public'?'messages':'private_messages'}', '${m.id}')" style="background:none; border:none; color:red; cursor:pointer; padding:0 0.5rem;"><i class="ph ph-trash"></i></button>
        </div>
    `).join('') || '<p class="text-center text-muted">No recent chat activity.</p>';
}

async function ensureDatabaseSeeded() {
    try {
        // Seed Events & Sermons if empty
        const eventsSnap = await db.collection('events').limit(1).get();
        if (eventsSnap.empty) {
            fallbackEvents.forEach(e => db.collection('events').add({ ...e, timestamp: firebase.firestore.FieldValue.serverTimestamp() }));
            fallbackSermons.forEach(s => db.collection('sermons').add(s));
            await db.collection('settings').doc('church_info').set(starterChurchInfo);
        }

        // Seed Hymns if empty
        const hymnsSnap = await db.collection('hymns').limit(1).get();
        if (hymnsSnap.empty) {
            console.log("Seeding hymns...");
            for (const h of starterHymns) {
                await db.collection('hymns').add(h);
            }
            console.log("Hymns seeded successfully.");
        }

        // Seed Almanac if empty
        const almanacSnap = await db.collection('almanac').limit(1).get();
        if (almanacSnap.empty) {
            starterAlmanac.forEach(al => db.collection('almanac').add(al));
        }

        // Seed Activities if empty
        const activitySnap = await db.collection('activities').limit(1).get();
        if (activitySnap.empty) {
            starterActivities.forEach(a => db.collection('activities').add(a));
        }

        // Seed Admin to directory
        const adminSnap = await db.collection('members').where('email', '==', ADMIN_EMAIL).get();
        if (adminSnap.empty) {
            db.collection('members').add({
                 name: "Kofi Admin", role: "Master Administrator", email: ADMIN_EMAIL, initials: "AD"
            });
        }
    } catch(e) { console.error("Seeding error:", e); }
}

// ---- Render Main App Shell ----
function renderApp() {
    const mainContent = document.getElementById('main-content');
    const header = document.getElementById('main-header');
    const bottomNav = document.getElementById('bottom-nav');

    if (!userState) {
        header.classList.add('hidden');
        bottomNav.classList.add('hidden');
        renderAuth(mainContent);
    } else {
        header.classList.remove('hidden');
        bottomNav.classList.remove('hidden');
        renderNav(bottomNav);
        
        // Render current route view
        if(currentRoute === 'home') renderHome(mainContent);
        else if(currentRoute === 'event-detail') renderEventDetail(mainContent, currentRouteParams);
        else if(currentRoute === 'almanac') renderAlmanac(mainContent);
        else if(currentRoute === 'sermons') renderSermons(mainContent);
        else if(currentRoute === 'hymns') renderHymnal(mainContent);
        else if(currentRoute === 'chat') renderChat(mainContent);
        else if(currentRoute === 'directory') renderDirectory(mainContent);
        else if(currentRoute === 'admin') renderAdmin(mainContent);
        else if(currentRoute === 'profile') renderProfile(mainContent);
    }
}

// ---- Navigation Controller ----
window.navigate = function(route, params = null) {
    currentRoute = route;
    currentRouteParams = params;
    
    // Cleanup chat listener if leaving chat
    if (route !== 'chat' && unsubscribeChat) {
        unsubscribeChat();
        unsubscribeChat = null;
    }

    renderApp();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.logout = function() {
    auth.signOut();
}

// ---- Bottom Navigation Render ----
function renderNav(bottomNav) {
    const isAdmin = userState && userState.email === ADMIN_EMAIL;
    
    bottomNav.innerHTML = `
        <button class="nav-item ${currentRoute === 'home' || currentRoute === 'event-detail' ? 'active' : ''}" onclick="navigate('home')">
            <i class="${currentRoute === 'home' || currentRoute === 'event-detail' ? 'ph-fill' : 'ph'} ph-house"></i>
            Home
        </button>
        <button class="nav-item ${currentRoute === 'almanac' ? 'active' : ''}" onclick="navigate('almanac')">
            <i class="${currentRoute === 'almanac' ? 'ph-fill' : 'ph'} ph-calendar-star"></i>
            Almanac
        </button>
        <button class="nav-item ${currentRoute === 'hymns' ? 'active' : ''}" onclick="navigate('hymns')">
            <i class="${currentRoute === 'hymns' ? 'ph-fill' : 'ph'} ph-book-open"></i>
            Hymns
        </button>
        <button class="nav-item ${currentRoute === 'sermons' ? 'active' : ''}" onclick="navigate('sermons')">
            <i class="${currentRoute === 'sermons' ? 'ph-fill' : 'ph'} ph-headphones"></i>
            Media
        </button>
        <button class="nav-item ${currentRoute === 'chat' ? 'active' : ''}" style="position:relative;" onclick="navigate('chat')">
            <i class="${currentRoute === 'chat' ? 'ph-fill' : 'ph'} ph-chat-circle-dots"></i>
            Chat
            ${hasNewPrivateMsg ? '<div style="position:absolute; top:4px; right:20%; width:8px; height:8px; background:red; border-radius:50%; border:1px solid white;"></div>' : ''}
        </button>
        <button class="nav-item ${currentRoute === 'directory' ? 'active' : ''}" onclick="navigate('directory')">
            <i class="${currentRoute === 'directory' ? 'ph-fill' : 'ph'} ph-users"></i>
            Members
        </button>
        ${isAdmin ? `
        <button class="nav-item ${currentRoute === 'admin' ? 'active' : ''}" onclick="navigate('admin')" style="color:red; font-weight:bold;">
            <i class="${currentRoute === 'admin' ? 'ph-fill' : 'ph'} ph-shield-check"></i>
            Admin
        </button>
        ` : ''}
    `;
}

// ---- Authentication View (Secret Invite Code lock) ----
let authMode = 'login';
function renderAuth(mainContent) {
    mainContent.innerHTML = `
        <div class="flex-col items-center justify-center p-4 mt-6">
            <div style="display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 2.5rem; width: 100%;">
                <img src="auth-logo.png" alt="PCG Official Crest" style="height: 14rem; width: auto; margin-bottom: 2rem; filter: drop-shadow(0 15px 30px rgba(0,0,0,0.1));">
                <h1 style="color: var(--pcg-blue); font-size: 2rem; margin: 0; font-weight: 800; letter-spacing: -0.02em;">PCG Ebenezer Gent</h1>
                <p style="font-size: 1.1rem; margin-top: 0.5rem; font-weight: 600; color: var(--pcg-blue); opacity: 0.9;">Presbyterian Church of Ghana</p>
            </div>
            <div class="card w-full">
                <h2 class="mb-4" style="font-size:1.25rem;">${authMode === 'login' ? 'Member Login' : 'Create Account'}</h2>
                <div id="auth-error" class="hidden" style="color: red; font-size: 0.8rem; margin-bottom: 1rem; background: #fee2e2; padding: 0.5rem; border-radius: 4px;"></div>
                
                ${authMode === 'register' ? `
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" id="auth-name" class="form-control" placeholder="John Doe">
                </div>
                <div class="form-group">
                    <label style="color: var(--pcg-blue); font-weight:bold;"><i class="ph ph-lock-key"></i> Church Invite Code</label>
                    <input type="text" id="auth-invite-code" class="form-control" placeholder="Required for registration">
                </div>
                ` : ''}
                
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="auth-email" class="form-control" placeholder="member@ebenezerpcg.org" value="member@ebenezerpcg.org">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="auth-password" class="form-control" placeholder="Enter your password" value="password123">
                </div>
                <button class="btn-primary w-full mt-4" id="auth-submit-btn" onclick="handleAuth()">
                    ${authMode === 'login' ? 'Sign In' : 'Register'}
                </button>
                ${authMode === 'login' ? `
                    <p class="text-center mt-3" style="font-size: 0.8rem;">
                        <a href="#" onclick="sendPasswordReset()" style="color: var(--text-muted); text-decoration: none;">Forgot Password?</a>
                    </p>
                ` : ''}
                <p class="text-center text-muted mt-4" style="font-size: 0.8rem;">
                    ${authMode === 'login' ? 
                        `Don't have an account? <a href="#" onclick="toggleAuthMode('register')" style="color: var(--pcg-blue); text-decoration: none; font-weight: 600;">Register Here</a>` : 
                        `Already have an account? <a href="#" onclick="toggleAuthMode('login')" style="color: var(--pcg-blue); text-decoration: none; font-weight: 600;">Login Here</a>`
                    }
                </p>
            </div>
        </div>
    `;
}

window.toggleAuthMode = function(mode) {
    authMode = mode;
    renderAuth(document.getElementById('main-content'));
}

window.handleAuth = async function() {
    const errorEl = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit-btn');
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    errorEl.classList.add('hidden');
    btn.innerText = "Loading...";
    btn.disabled = true;

    try {
        if (authMode === 'login') {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const inviteEl = document.getElementById('auth-invite-code');
            if(inviteEl.value.trim().toUpperCase() !== 'PCGGENT2026') {
                throw new Error("Invalid Church Invite Code. Please see an Elder for the registration code.");
            }

            const nameEl = document.getElementById('auth-name');
            const res = await auth.createUserWithEmailAndPassword(email, password);
            if(nameEl && nameEl.value) {
                await res.user.updateProfile({ displayName: nameEl.value });
            }
        }
    } catch (error) {
        errorEl.innerText = error.message;
        errorEl.classList.remove('hidden');
    } finally {
        btn.innerText = authMode === 'login' ? 'Sign In' : 'Register';
        btn.disabled = false;
    }
}

window.sendPasswordReset = async function() {
    const email = document.getElementById('auth-email').value;
    if(!email) return alert("Please enter your email address first.");
    
    try {
        await auth.sendPasswordResetEmail(email);
        alert("Password reset email sent! Please check your inbox (and spam folder).");
    } catch(e) {
        alert("Error sending reset email: " + e.message);
    }
}

// ---- Profile Management View ----
function renderProfile(mainContent) {
    const user = auth.currentUser;
    if(!user) return navigate('home');

    mainContent.innerHTML = `
        <div class="mb-4 flex items-center gap-2">
            <button class="icon-btn" onclick="navigate('home')"><i class="ph ph-arrow-left"></i></button>
            <h2 style="flex-grow: 1; font-size: 1.25rem; color: var(--pcg-blue);">My Profile</h2>
        </div>

        <div class="card p-6">
            <div class="flex-col items-center mb-6">
                <div class="avatar" style="width: 5rem; height: 5rem; font-size: 2.5rem; margin: 0 auto 1rem auto; background: var(--bg-light); color: var(--pcg-blue);">
                    ${(user.displayName ? user.displayName.substring(0,2) : "MB").toUpperCase()}
                </div>
                <h3 class="text-center">${user.displayName || 'Member'}</h3>
                <p class="text-center text-muted" style="font-size: 0.85rem;">${user.email}</p>
            </div>

            <div class="form-group">
                <label>Change Display Name</label>
                <input type="text" id="profile-name" class="form-control" value="${user.displayName || ''}" placeholder="Full Name">
            </div>

            <button class="btn-primary w-full mt-4" id="profile-save-btn" onclick="updateUserProfile()">
                Update Details
            </button>
            
            <p class="text-center text-muted mt-6" style="font-size:0.75rem;">
                Account ID: ${user.uid}
            </p>
        </div>
    `;
}

window.updateUserProfile = async function() {
    const btn = document.getElementById('profile-save-btn');
    const newName = document.getElementById('profile-name').value.trim();
    if(!newName) return alert("Please enter a name.");

    btn.innerText = "Updating...";
    btn.disabled = true;

    try {
        // 1. Update Firebase Auth Profile
        await auth.currentUser.updateProfile({ displayName: newName });
        
        // 2. Sync with Members Directory
        const membersSnap = await db.collection('members').where('email', '==', auth.currentUser.email).get();
        if(!membersSnap.empty) {
            const docId = membersSnap.docs[0].id;
            await db.collection('members').doc(docId).update({
                name: newName,
                initials: newName.substring(0,2).toUpperCase()
            });
        }

        alert("Profile updated successfully!");
        renderApp();
    } catch(e) {
        alert("Error updating profile: " + e.message);
    } finally {
        btn.innerText = "Update Details";
        btn.disabled = false;
    }
}


// ---- Home (Dashboard) View ----
function renderHome(mainContent) {
    let eventsHtml = liveEvents.map(event => `
        <div class="slider-item">
            <div class="card" style="cursor: pointer; padding:0; overflow:hidden; height: 100%;" onclick="navigate('event-detail', '${event.id}')">
                ${event.imageUrl ? `<img src="${event.imageUrl}" class="event-card-img" alt="Flyer">` : ''}
                <div style="padding: 1rem;">
                    <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">${event.title}</h3>
                    <div class="flex items-center gap-4 mb-3">
                        <p class="text-muted" style="display:flex; align-items:center; gap:0.25rem; font-size: 0.85rem; font-weight: 500; color: var(--pcg-blue);">
                            <i class="ph ph-calendar-blank"></i> ${event.month || ''} ${event.day || ''}
                        </p>
                        <p class="text-muted" style="display:flex; align-items:center; gap:0.25rem; font-size: 0.85rem;">
                            <i class="ph ph-clock"></i> ${event.time || ''}
                        </p>
                    </div>
                    ${event.description ? `<p class="text-muted" style="font-size: 0.9rem; line-height: 1.5; color: #4b5563;">${event.description.substring(0, 100)}${event.description.length > 100 ? '...' : ''}</p>` : ''}
                    <div class="flex justify-between items-center mt-4 pt-3" style="border-top: 1px solid var(--border-color);">
                        <span style="font-size: 0.75rem; color: var(--text-muted);"><i class="ph ph-map-pin"></i> ${event.location || ''}</span>
                        <span style="font-size: 0.75rem; color: var(--pcg-blue); font-weight: 600;">View Details <i class="ph ph-arrow-right"></i></span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    const displayName = userState.displayName || userState.email.split('@')[0];

    // Find Today's Almanac Entry
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const todayAlmanac = liveAlmanac.find(al => al.date === todayStr);

    mainContent.innerHTML = `
        <div class="mb-6 flex justify-between items-start">
            <div style="flex-grow:1;">
                <h2 style="font-size: 1.2rem; margin-bottom: 0.25rem; color: var(--pcg-blue);">Welcome back, ${displayName}!</h2>
                ${todayAlmanac ? `
                    <div style="background: rgba(0,64,128,0.05); border-left: 3px solid var(--accent); padding: 0.75rem; border-radius: 0 8px 8px 0; margin-top:0.5rem;">
                        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">TODAY'S ALMANAC • ${todayAlmanac.season || '2026'}</span>
                        <h3 style="font-size: 0.95rem; margin: 0.2rem 0; color: var(--text-main);">${todayAlmanac.theme}</h3>
                        <p style="font-size: 0.85rem; color: var(--accent); font-weight: 600; margin:0;">
                            <i class="ph ph-book-open"></i> ${todayAlmanac.reading}
                        </p>
                    </div>
                ` : `
                    <p class="text-muted" style="font-style: italic; font-size: 0.85rem; margin-top:0.5rem;">"The Lord is my shepherd, I lack nothing." - Psalm 23</p>
                `}
            </div>
            <div class="flex gap-2">
                <button class="icon-btn" onclick="requestNotificationPermission()" title="Notifications" style="color:${isNotificationsEnabled ? 'var(--accent)' : 'var(--text-muted)'}; font-size:1.2rem;">
                    <i class="ph${isNotificationsEnabled ? '-fill' : ''} ph-bell"></i>
                </button>
                <button class="icon-btn" onclick="logout()" title="Logout" style="color:red; font-size:1.2rem;"><i class="ph ph-sign-out"></i></button>
            </div>
        </div>
        
        <div class="mb-8" style="position: relative;">
             <div class="flex justify-between items-center mb-4">
                <h2 style="font-size: 1.1rem;">Upcoming Events</h2>
            </div>
            
            ${liveEvents.length > 1 ? `
                <button class="slider-nav-btn slider-nav-prev" onclick="scrollSlider(-1)">
                    <i class="ph ph-caret-left"></i>
                </button>
                <button class="slider-nav-btn slider-nav-next" onclick="scrollSlider(1)">
                    <i class="ph ph-caret-right"></i>
                </button>
            ` : ''}

            <div id="event-slider" class="slider-container">
                ${eventsHtml}
            </div>
        </div>

        <div class="card mb-6" style="background: linear-gradient(135deg, var(--pcg-blue), var(--pcg-blue-light)); color: white;">
            <div class="flex items-center justify-between">
                <div>
                    <h3 style="color:white; margin-bottom:0.25rem; font-size: 1rem;">Sunday Service Tithe</h3>
                    <p style="font-size:0.75rem; color:rgba(255,255,255,0.8);">Pay your tithe & offering securely</p>
                </div>
                <div style="background: rgba(255,255,255,0.2); padding: 0.5rem; border-radius: var(--radius-full);">
                    <i class="ph ph-wallet" style="font-size: 1.5rem;"></i>
                </div>
            </div>
            <button class="btn-primary mt-4 w-full" style="background: white; color: var(--pcg-blue);">Make a Donation</button>
        </div>

        <div class="flex flex-col gap-4 mb-8" style="display: flex; flex-flow: row wrap;">
            <div style="flex: 1.2; min-width: 250px;">
                <div class="card p-0" style="overflow: hidden; height: 100%;">
                    <div class="p-4" style="border-bottom: 1px solid var(--border-color); background: var(--bg-light);">
                        <h3 style="font-size: 1.1rem; color: var(--pcg-blue);">Weekly Schedule</h3>
                    </div>
                    ${liveActivities.map(a => `
                        <div class="flex items-center gap-3 p-3" style="border-bottom: 1px solid var(--border-color);">
                            <div style="background: var(--bg-light); color: var(--pcg-blue); font-weight: bold; width: 3rem; text-align: center; padding: 0.4rem; border-radius: 6px; font-size: 0.75rem; text-transform: uppercase;">
                                ${a.day ? a.day.substring(0,3) : ''}
                            </div>
                            <div style="flex-grow: 1;">
                                <h4 style="font-size: 0.85rem; margin-bottom: 0.1rem;">${a.title}</h4>
                                <span class="text-muted" style="font-size: 0.7rem;"><i class="ph ph-clock"></i> ${a.time}</span>
                            </div>
                        </div>
                    `).join('') || '<p class="p-4 text-center text-muted">No activities set.</p>'}
                </div>
            </div>

            <div style="flex: 1; min-width: 250px;">
                <div class="card mb-4" style="height: auto;">
                    <h3 class="mb-3" style="font-size: 1.1rem; color: var(--pcg-blue);">Stay Connected</h3>
                    <div class="flex gap-4 mb-2">
                        ${churchInfo.facebookUrl ? `<a href="${churchInfo.facebookUrl}" target="_blank" class="icon-btn" style="background: #1877F2; color:white; width:2.5rem; height:2.5rem; border-radius:10px;"><i class="ph ph-facebook-logo" style="font-size:1.2rem;"></i></a>` : ''}
                        ${churchInfo.youtubeUrl ? `<a href="${churchInfo.youtubeUrl}" target="_blank" class="icon-btn" style="background: #FF0000; color:white; width:2.5rem; height:2.5rem; border-radius:10px;"><i class="ph ph-youtube-logo" style="font-size:1.2rem;"></i></a>` : ''}
                        ${churchInfo.tiktokUrl ? `<a href="${churchInfo.tiktokUrl}" target="_blank" class="icon-btn" style="background: #000000; color:white; width:2.5rem; height:2.5rem; border-radius:10px;"><i class="ph ph-tiktok-logo" style="font-size:1.2rem;"></i></a>` : ''}
                    </div>
                </div>

                <div class="card" style="height: auto;">
                    <h3 class="mb-2" style="font-size: 1.1rem; color: var(--pcg-blue);"><i class="ph ph-map-pin"></i> Visit Us</h3>
                    <p style="font-size: 0.85rem; margin-bottom: 0.5rem; line-height:1.4;">${churchInfo.address}</p>
                    <p style="font-size: 0.85rem; color: var(--pcg-blue); font-weight: bold;"><i class="ph ph-phone"></i> ${churchInfo.tel}</p>
                </div>
            </div>
        </div>
    `;
}

// ---- Event Detailed View ----
function renderEventDetail(mainContent, eventId) {
    const event = liveEvents.find(e => e.id === eventId);
    if(!event) { navigate('home'); return; }

    mainContent.innerHTML = `
        <div class="mb-4 flex items-center gap-2">
            <button class="icon-btn" onclick="navigate('home')"><i class="ph ph-arrow-left"></i></button>
            <h2 style="flex-grow: 1; font-size: 1.25rem; color: var(--pcg-blue);">Event Details</h2>
        </div>
        
        <div class="card p-0" style="overflow: hidden; border-radius: var(--radius-lg);">
            ${event.imageUrl ? `<img src="${event.imageUrl}" class="event-hero-img" alt="Flyer">` : `
            <div style="background: var(--pcg-blue); color: white; padding: 2rem 1rem; text-align: center;">
                <i class="ph ph-calendar-star" style="font-size: 3rem; margin-bottom: 0.5rem; opacity: 0.8;"></i>
            </div>
            `}
            <div class="p-4">
                <h2 class="mb-2" style="color: var(--pcg-blue);">${event.title}</h2>
                <div class="flex gap-4 mb-4" style="border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
                    <div style="flex:1;">
                        <span class="text-muted" style="display:block; font-size:0.75rem; font-weight:bold; text-transform:uppercase;">When</span>
                        <strong>${event.month} ${event.day} @ ${event.time}</strong>
                    </div>
                    <div style="flex:1;">
                        <span class="text-muted" style="display:block; font-size:0.75rem; font-weight:bold; text-transform:uppercase;">Where</span>
                        <strong>${event.location}</strong>
                    </div>
                </div>
                
                <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom:0.5rem;">ABOUT THIS EVENT</h3>
                <p style="line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap;">${event.description || 'No detailed description available for this event.'}</p>
                
                <button class="btn-primary w-full mt-4" style="background: var(--accent);">Add to Calendar</button>
            </div>
        </div>
    `;
}


// ---- Sermons / Media View ----
function renderSermons(mainContent) {
    let sermonsHtml = liveSermons.map(sermon => `
        <div class="sermon-item flex justify-between items-center" onclick="playSermon('${sermon.audioUrl}', '${sermon.title}', '${sermon.speaker}', ${sermon.isLive})">
            <div>
                <h3 style="font-size: 1rem; color: var(--text-main); margin-bottom: 0.2rem;">
                    ${sermon.title} 
                    ${sermon.isLive ? '<span class="badge" style="background: red; font-size: 0.6rem;">LIVE</span>' : ''}
                </h3>
                <p class="text-muted" style="font-size: 0.8rem;">
                    <i class="ph ph-user"></i> ${sermon.speaker || ''}
                </p>
            </div>
            <button class="icon-btn" style="color: var(--pcg-blue);">
                <i class="ph-fill ph-play-circle" style="font-size: 2rem;"></i>
            </button>
        </div>
    `).join('');

    if(liveSermons.length === 0) sermonsHtml = `<p class="text-muted text-center" style="font-size:0.8rem; padding: 1rem;">No audio available.</p>`;

    mainContent.innerHTML = `
        <div class="mb-4">
            <h2 style="font-size: 1.25rem; color: var(--pcg-blue);">Preachings & Teachings</h2>
            <p class="text-muted" style="font-size: 0.85rem;">Listen to live streams and past sermons.</p>
        </div>
        <div class="card" style="padding: 0; overflow: hidden;">
            ${sermonsHtml}
        </div>
    `;
}

window.playSermon = function(url, title, speaker, isLive) {
    const playerContainer = document.getElementById('audio-player-container');
    const audioEl = document.getElementById('main-audio-element');
    const titleEl = document.getElementById('player-title');
    const speakerEl = document.getElementById('player-speaker');
    const liveBadge = document.getElementById('player-live-badge');

    titleEl.innerText = title;
    speakerEl.innerText = speaker;
    if(isLive) { liveBadge.classList.remove('hidden'); } else { liveBadge.classList.add('hidden'); }
    
    audioEl.src = url;
    audioEl.play();
    playerContainer.classList.remove('hidden');
}


// ---- Hymnal View (Live Cloud) ----
window.toggleHymnTab = function(tab) {
    currentHymnTab = tab;
    // Re-trigger listener for new language
    setupLiveListeners();
    renderApp();
}

window.openHymn = function(id) {
    const hymn = liveHymns.find(h => h.id === id);
    if (!hymn) return;
    
    document.getElementById('main-content').innerHTML = `
        <div class="mb-4 flex items-center gap-2">
            <button class="icon-btn" onclick="navigate('hymns')"><i class="ph ph-arrow-left"></i></button>
            <h2 style="flex-grow: 1; font-size: 1.25rem; color: var(--pcg-blue);">${currentHymnTab === 'twi' ? 'TW' : 'PHB'} ${hymn.number}</h2>
        </div>
        <div class="card p-4 mx-2">
            <h3 class="mb-4" style="color: var(--text-main); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
                ${hymn.title}
            </h3>
            <div class="hymn-content" style="white-space: pre-wrap; font-size: 1.1rem; line-height: 1.6;">${hymn.content}</div>
        </div>
    `;
    window.scrollTo({ top: 0});
}

function renderHymnal(mainContent) {
    const filteredHymns = liveHymns.filter(h => h.lang === currentHymnTab);
    
    let listHtml = filteredHymns.map(hymn => `
        <div class="hymn-list-item flex items-center justify-between" onclick="openHymn('${hymn.id}')" style="padding: 1rem; border-bottom: 1px solid var(--border-color); cursor:pointer;">
            <div style="flex-grow:1;">
                <strong style="color: var(--pcg-blue); margin-right: 0.5rem; font-size: 0.9rem;">${currentHymnTab === 'twi' ? 'TW' : 'PHB'} ${hymn.number}</strong>
                <span style="font-weight: 500; font-size: 0.95rem;">${hymn.title}</span>
            </div>
            <i class="ph ph-caret-right text-muted"></i>
        </div>
    `).join('');

    if(filteredHymns.length === 0) listHtml = `<p class="p-8 text-center text-muted">No ${currentHymnTab} hymns added yet.</p>`;

    mainContent.innerHTML = `
        <div class="flex-col">
            <div class="flex justify-between items-center mb-4">
                <h2 style="font-size: 1.25rem; color: var(--pcg-blue);">PCG Hymnal</h2>
                <div class="tabs flex" style="background: var(--bg-card); border-radius: 12px; padding: 0.25rem;">
                    <button class="tab-btn ${currentHymnTab === 'english' ? 'active' : ''}" onclick="toggleHymnTab('english')" style="padding: 0.5rem 1rem; border-radius: 10px; border:none; background:${currentHymnTab === 'english' ? 'var(--pcg-blue)' : 'transparent'}; color:${currentHymnTab === 'english' ? 'white' : 'var(--text-muted)'}; font-weight:bold; cursor:pointer;">ENG</button>
                    <button class="tab-btn ${currentHymnTab === 'twi' ? 'active' : ''}" onclick="toggleHymnTab('twi')" style="padding: 0.5rem 1rem; border-radius: 10px; border:none; background:${currentHymnTab === 'twi' ? 'var(--pcg-blue)' : 'transparent'}; color:${currentHymnTab === 'twi' ? 'white' : 'var(--text-muted)'}; font-weight:bold; cursor:pointer;">Twi</button>
                </div>
            </div>

            <div class="form-group mb-4">
                <div style="position:relative;">
                    <i class="ph ph-magnifying-glass" style="position:absolute; left:1rem; top:50%; transform:translateY(-50%); color:var(--text-muted);"></i>
                    <input type="text" id="hymn-search" class="form-control" placeholder="Search by Number or Title..." style="padding-left:3rem;" oninput="filterHymns()">
                </div>
            </div>

            <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 2rem;">
                ${listHtml}
            </div>
        </div>
    `;
}

// ---- Almanac Full View ----
function renderAlmanac(mainContent) {
    const listHtml = liveAlmanac.map(al => `
        <div class="card mb-4" style="border-left: 4px solid var(--accent);">
            <div class="flex justify-between mb-1">
                <span style="font-size: 0.75rem; font-weight: bold; color: var(--text-muted);">${new Date(al.date).toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})}</span>
                <span class="badge" style="background:#f1f5f9; color: var(--text-muted); font-size:0.6rem;">${al.season || 'Almanac'}</span>
            </div>
            <h3 style="font-size: 0.95rem; color: var(--pcg-blue); margin-bottom: 0.3rem;">${al.theme}</h3>
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="text-sm" style="color: var(--text-main);"><i class="ph ph-book-open"></i> ${al.reading}</span>
                <a href="https://www.biblegateway.com/passage/?search=${encodeURIComponent(al.reading)}&version=NIV" target="_blank" style="font-size: 0.75rem; color: var(--accent); font-weight: bold; text-decoration:none;">READ Bible</a>
            </div>
        </div>
    `).join('');

    mainContent.innerHTML = `
        <div class="mb-4">
            <h2 style="font-size: 1.25rem; color: var(--pcg-blue);">Almanac 2026</h2>
            <p class="text-muted" style="font-size: 0.85rem;">Official PCG Liturgical Calendar</p>
        </div>

        ${churchInfo.almanacPdfUrl ? `
        <div class="card mb-6" style="background: var(--bg-light); border: 2px dashed var(--accent); text-align:center;">
            <p class="mb-3" style="font-size:0.85rem; font-weight: 500;">Consult the complete physical booklet</p>
            <a href="${churchInfo.almanacPdfUrl}" target="_blank" class="btn-primary w-full block" style="text-decoration:none; display:flex; align-items:center; justify-content:center; gap:0.5rem;">
                <i class="ph ph-file-pdf"></i> View Official 2026 Almanac (PDF)
            </a>
        </div>
        ` : ''}

        <div class="flex-col">
            ${listHtml || '<p class="text-center p-8 text-muted">No almanac entries found for 2026.</p>'}
        </div>
    `;
}

// ---- Chat Dashboard (Hub) ----
function renderChat(mainContent) {
    if (activeRecipientId) {
        renderPrivateChatView(mainContent, activeRecipientId);
        return;
    }

    mainContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 style="font-size:1.25rem; color: var(--pcg-blue);">${currentChatType === 'public' ? 'Congregation Chat' : 'Individuals'}</h2>
            ${currentChatType === 'public' ? '<span class="badge" style="background: var(--accent); padding: 0.2rem 0.5rem;">Live</span>' : ''}
        </div>

        <div class="tabs flex mb-4" style="background: var(--bg-card); border-radius: 12px; padding: 0.25rem;">
            <button class="tab-btn flex-1 ${currentChatType === 'public' ? 'active' : ''}" onclick="toggleChatType('public')" style="padding: 0.5rem; border-radius: 10px; border:none; background:${currentChatType === 'public' ? 'var(--pcg-blue)' : 'transparent'}; color:${currentChatType === 'public' ? 'white' : 'var(--text-muted)'}; font-weight:bold; cursor:pointer;">Public</button>
            <button class="tab-btn flex-1 ${currentChatType === 'private' ? 'active' : ''}" onclick="toggleChatType('private')" style="padding: 0.5rem; border-radius: 10px; border:none; background:${currentChatType === 'private' ? 'var(--pcg-blue)' : 'transparent'}; color:${currentChatType === 'private' ? 'white' : 'var(--text-muted)'}; font-weight:bold; cursor:pointer; position:relative;">
                Private 
                ${hasNewPrivateMsg ? '<div style="position:absolute; top:6px; right:30%; width:6px; height:6px; background:red; border-radius:50%;"></div>' : ''}
            </button>
        </div>

        <div id="chat-tab-content">
            <!-- Content injected below -->
        </div>
    `;

    const tabContent = document.getElementById('chat-tab-content');
    if (currentChatType === 'public') {
        renderPublicChatRoom(tabContent);
    } else {
        renderPrivateChatList(tabContent);
    }
}

function renderPublicChatRoom(container) {
    container.innerHTML = `
        <div class="card chat-container" style="display: flex; flex-direction: column; height: calc(100vh - 250px);">
            <div class="chat-messages" id="chat-messages-container" style="flex-grow: 1; overflow-y: auto; padding: 1rem 0;">
                <p class="text-center text-muted text-sm">Loading messages...</p>
            </div>
            <div class="chat-input-area" style="border-top: 1px solid var(--border-color); display:flex; gap:0.5rem; padding-top:1rem;">
                <input type="text" id="chat-composer" class="form-control" placeholder="Type a message..." onkeypress="if(event.key === 'Enter') sendLiveMessage()">
                <button class="btn-primary" style="padding: 0.5rem 1rem;" onclick="sendLiveMessage()">
                    <i class="ph-fill ph-paper-plane-right" style="font-size: 1.25rem;"></i>
                </button>
            </div>
        </div>
    `;

    if (unsubscribeChat) unsubscribeChat();
    unsubscribeChat = db.collection('messages')
        .orderBy('timestamp', 'asc')
        .limit(50)
        .onSnapshot((snapshot) => {
            liveChatData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateChatUI('chat-messages-container', liveChatData, 'messages');
        });
}

function renderPrivateChatList(container) {
    // Unique participants from private messages
    const others = liveMembers.filter(m => m.id !== userState.uid);
    
    // In a real app, we'd filter by actual conversation history, but for simplicity let's show members to chat with
    container.innerHTML = `
        <div class="flex-col gap-2">
            ${others.map(m => `
                <div class="card flex items-center justify-between p-3" onclick="startPrivateChat('${m.id}')" style="cursor:pointer; ${m.email === ADMIN_EMAIL ? 'border-left: 4px solid red;' : ''}">
                    <div class="flex items-center gap-3">
                        <div class="avatar" style="width: 2.5rem; height: 2.5rem; background: var(--bg-light); color: var(--pcg-blue); border-radius: 999px;">
                            <strong>${m.initials || 'MB'}</strong>
                        </div>
                        <div>
                            <h4 style="margin:0; font-size:0.95rem;">${m.name}</h4>
                            <p class="text-muted" style="margin:0; font-size:0.75rem;">${m.role || 'Member'}</p>
                        </div>
                    </div>
                    <i class="ph ph-caret-right text-muted"></i>
                </div>
            `).join('') || '<p class="text-center p-8 text-muted">No members found.</p>'}
        </div>
    `;
}

function updateChatUI(containerId, messages, collectionName) {
    const container = document.getElementById(containerId);
    if(!container) return;

    if(messages.length === 0) {
        container.innerHTML = `<p class="text-center text-muted" style="font-size:0.8rem;">No messages yet.</p>`;
        return;
    }

    const myUid = userState.uid;
    const isAdmin = userState.email === ADMIN_EMAIL;

    container.innerHTML = messages.map(msg => {
        const isMe = msg.senderUid === myUid;
        let timeString = '';
        if (msg.timestamp) {
            const dateObj = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp);
            timeString = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        return `
            <div class="chat-message ${isMe ? 'tx' : 'rx'}" style="position:relative; padding: 0.75rem 1rem; border-radius: 1rem; margin-bottom: 0.5rem; max-width: 85%; ${isMe ? 'background: var(--pcg-blue); color:white; align-self: flex-end; margin-left: auto; border-bottom-right-radius:0;' : 'background: var(--bg-card); border: 1px solid var(--border-color); align-self: flex-start; border-bottom-left-radius:0;'}">
                ${isAdmin ? `
                    <button onclick="deleteDoc('${collectionName}', '${msg.id}')" style="position:absolute; top:-5px; right:${isMe ? 'unset' : '-5px'}; left:${isMe ? '-5px' : 'unset'}; background:red; color:white; border:none; border-radius:50%; width:1.5rem; height:1.5rem; cursor:pointer; font-size:0.8rem; display:flex; align-items:center; justify-content:center; padding:0; z-index:10;"><i class="ph ph-trash"></i></button>
                ` : ''}
                <div style="font-size: 0.7rem; font-weight:600; margin-bottom: 0.2rem; opacity: 0.8;">
                    ${isMe ? 'You' : (msg.name || 'Anonymous')}
                </div>
                <div style="font-size:0.95rem;">${msg.text}</div>
                <div style="font-size: 0.65rem; text-align: right; opacity: 0.7; margin-top: 0.3rem;">${timeString}</div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

window.toggleChatType = function(type) {
    currentChatType = type;
    renderApp();
}

window.startPrivateChat = function(uid) {
    activeRecipientId = uid;
    currentChatType = 'private';
    navigate('chat');
}

function renderPrivateChatView(container, targetUid) {
    const target = liveMembers.find(m => m.id === targetUid) || { name: "Elder / Admin", id: targetUid };
    
    container.innerHTML = `
        <div class="flex items-center gap-3 mb-4">
            <button class="icon-btn" onclick="activeRecipientId = null; renderApp();"><i class="ph ph-arrow-left"></i></button>
            <div class="avatar" style="width: 2rem; height: 2rem; background: var(--pcg-blue-light); color: white; border-radius: 999px;">
                <strong style="font-size:0.8rem;">${target.initials || target.name.substring(0,2).toUpperCase()}</strong>
            </div>
            <h2 style="font-size:1.1rem; color: var(--pcg-blue); flex-grow:1;">Chat with ${target.name}</h2>
        </div>

        <div class="card chat-container" style="display: flex; flex-direction: column; height: calc(100vh - 200px);">
            <div class="chat-messages" id="private-messages-container" style="flex-grow: 1; overflow-y: auto; padding: 1rem 0;">
                <p class="text-center text-muted text-sm">Loading private conversation...</p>
            </div>
            <div class="chat-input-area" style="border-top: 1px solid var(--border-color); display:flex; gap:0.5rem; padding-top:1rem;">
                <input type="text" id="private-composer" class="form-control" placeholder="Type a message..." onkeypress="if(event.key === 'Enter') sendPrivateMessage('${targetUid}')">
                <button class="btn-primary" style="padding: 0.5rem 1rem;" onclick="sendPrivateMessage('${targetUid}')">
                    <i class="ph-fill ph-paper-plane-right" style="font-size: 1.25rem;"></i>
                </button>
            </div>
        </div>
    `;

    // Mark messages as read when opening
    db.collection('private_messages')
        .where('senderUid', '==', targetUid)
        .where('receiverUid', '==', userState.uid)
        .where('read', '==', false)
        .get().then(snap => {
            snap.forEach(doc => doc.ref.update({ read: true }));
        });

    if (unsubscribePrivateMessages) unsubscribePrivateMessages();
    const convoId = [userState.uid, targetUid].sort().join('_');

    unsubscribePrivateMessages = db.collection('private_messages')
        .where('convoId', '==', convoId)
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            updateChatUI('private-messages-container', msgs, 'private_messages');
        });
}

window.sendLiveMessage = async function() {
    const input = document.getElementById('chat-composer');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    
    try {
        await db.collection('messages').add({
            text: text,
            name: userState.displayName || "Member",
            senderUid: userState.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) {}
}

window.sendPrivateMessage = async function(targetUid) {
    const input = document.getElementById('private-composer');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const convoId = [userState.uid, targetUid].sort().join('_');
    
    try {
        await db.collection('private_messages').add({
            text: text,
            name: userState.displayName || "Member",
            senderUid: userState.uid,
            receiverUid: targetUid,
            convoId: convoId,
            read: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { console.error(e); }
}

// ---- Directory View ----
function renderDirectory(mainContent) {
    let membersHtml = liveMembers.map(member => `
        <div class="flex items-center justify-between p-4" style="border-bottom: 1px solid var(--border-color);">
            <div class="flex items-center gap-4">
                <div class="avatar" style="width: 3rem; height: 3rem; background: var(--pcg-blue-light); color: white; border-radius: 999px;">
                    <strong style="font-size:1rem;">${member.initials || '?'}</strong>
                </div>
                <div>
                    <h3 style="font-size: 1rem; color:var(--text-main);">${member.name || 'Unknown'}</h3>
                    <p class="text-muted" style="font-size: 0.8rem;">${member.role || 'Member'}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button class="icon-btn" onclick="startPrivateChat('${member.email === ADMIN_EMAIL ? ADMIN_EMAIL : member.id}')" style="color: var(--accent); background: var(--bg-light); padding: 0.5rem; border-radius: 50%;">
                    <i class="ph-fill ph-chat-circle"></i>
                </button>
                <button class="icon-btn" style="color: var(--pcg-blue); background: var(--bg-light); padding: 0.5rem; border-radius: 50%;">
                    <i class="ph-fill ph-phone-call"></i>
                </button>
            </div>
        </div>
    `).join('');

    if(liveMembers.length === 0) membersHtml = `<p class="p-4 text-muted text-center">No directories found</p>`;

    mainContent.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 style="font-size: 1.25rem; color: var(--pcg-blue);">Members Directory</h2>
            <button class="icon-btn" style="color: var(--pcg-blue);"><i class="ph ph-magnifying-glass" style="font-size:1.5rem;"></i></button>
        </div>
        <div class="card" style="padding: 0; overflow:hidden;">
            ${membersHtml}
        </div>
    `;
}

// ---- Administrator Portal ----
function renderAdmin(mainContent) {
    if(!userState || userState.email !== ADMIN_EMAIL) {
        navigate('home');
        return;
    }

    // List Events
    const eventsList = liveEvents.map(e => `
        <div class="flex justify-between items-center p-2 mb-2" style="background:#f1f5f9; border-radius: 4px;">
            <div style="flex-grow:1;"><strong style="font-size:0.85rem;">${e.title}</strong><br><span style="font-size:0.7rem;">${e.month} ${e.day}</span></div>
            <div class="flex gap-2">
                <button onclick="startEditEvent('${e.id}')" style="background:none; border:none; color:var(--pcg-blue); cursor:pointer;"><i class="ph-fill ph-pencil-simple"></i></button>
                <button onclick="deleteDoc('events', '${e.id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="ph-fill ph-trash"></i></button>
            </div>
        </div>
    `).join('');

    // List Sermons
    const sermonsList = liveSermons.map(s => `
        <div class="flex justify-between items-center p-2 mb-2" style="background:#f1f5f9; border-radius: 4px;">
            <div style="flex-grow:1;"><strong style="font-size:0.85rem;">${s.title}</strong><br><span style="font-size:0.7rem;">${s.speaker}</span></div>
            <div class="flex gap-2">
                <button onclick="startEditSermon('${s.id}')" style="background:none; border:none; color:var(--pcg-blue); cursor:pointer;"><i class="ph-fill ph-pencil-simple"></i></button>
                <button onclick="deleteDoc('sermons', '${s.id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="ph-fill ph-trash"></i></button>
            </div>
        </div>
    `).join('');

    // List Members
    const membersList = liveMembers.map(m => `
        <div class="flex justify-between items-center p-2 mb-2" style="background:#f1f5f9; border-radius: 4px;">
            <div style="flex-grow:1;"><strong style="font-size:0.85rem;">${m.name}</strong><br><span style="font-size:0.7rem;">${m.email}</span></div>
            <button onclick="deleteDoc('members', '${m.id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="ph-fill ph-trash"></i></button>
        </div>
    `).join('');


    mainContent.innerHTML = `
        <div class="mb-4">
            <h2 style="font-size: 1.5rem; color: red;">Admin Portal</h2>
            <p class="text-muted" style="font-size: 0.85rem;">You have master access. Updates apply instantly.</p>
        </div>

        <div class="card mb-4" style="border-left: 4px solid var(--pcg-blue);">
            <h3 class="mb-2" style="font-size:1.1rem;">${editingEventId ? 'Edit Existing Event' : 'Create New Event'}</h3>
            <div class="form-group"><input type="text" id="add-ev-title" class="form-control" placeholder="Event Title"></div>
            <div class="flex gap-2">
                <div class="form-group" style="flex:1;"><input type="text" id="add-ev-month" class="form-control" placeholder="Month"></div>
                <div class="form-group" style="flex:1;"><input type="text" id="add-ev-day" class="form-control" placeholder="Day"></div>
            </div>
            <div class="flex gap-2">
                <div class="form-group" style="flex:1;"><input type="text" id="add-ev-time" class="form-control" placeholder="Time"></div>
                <div class="form-group" style="flex:1;"><input type="text" id="add-ev-loc" class="form-control" placeholder="Location"></div>
            </div>
            <div class="form-group">
                <textarea id="add-ev-desc" class="form-control" placeholder="Detailed Description..." rows="3"></textarea>
            </div>
            <div class="form-group">
                <label style="font-size:0.75rem; font-weight:bold; color:var(--pcg-blue);"><i class="ph ph-image"></i> Event Flyer (from Internet URL)</label>
                <input type="text" id="add-ev-img-url" class="form-control" placeholder="Paste flyer link here...">
            </div>
            <div class="form-group">
                <label style="font-size:0.75rem; font-weight:bold; color:var(--pcg-blue);"><i class="ph ph-upload-simple"></i> OR Select From Phone/PC</label>
                <input type="file" id="add-ev-file" class="form-control" accept="image/*" style="padding: 0.2rem;">
            </div>
            <div class="flex gap-2">
                <button class="btn-primary w-full" id="btn-publish-event" onclick="addEvent()">
                    ${editingEventId ? 'Update Event' : 'Publish Event'}
                </button>
                ${editingEventId ? `<button class="icon-btn" onclick="cancelEdit()" style="background:#ccc; border-radius:var(--radius-md);"><i class="ph ph-x"></i></button>` : ''}
            </div>
            
            <hr style="margin: 1rem 0; border:0; border-top:1px solid #ccc;">
            <h4 class="mb-2 text-muted" style="font-size:0.8rem; text-transform:uppercase;">Manage Existing Events</h4>
            ${eventsList || '<p class="text-sm">No events</p>'}
        </div>

        <div class="card mb-4" style="border-left: 4px solid var(--accent);">
            <h3 class="mb-2" style="font-size:1.1rem;">${editingSermonId ? 'Edit Existing Media' : 'Create Sermon/Media'}</h3>
            <div class="form-group"><input type="text" id="add-sm-title" class="form-control" placeholder="Title"></div>
            <div class="form-group"><input type="text" id="add-sm-speaker" class="form-control" placeholder="Speaker"></div>
            <div class="form-group"><input type="text" id="add-sm-url" class="form-control" placeholder="Audio URL (.mp3) or Stream Link"></div>
            <div class="form-group flex items-center gap-2">
                <input type="checkbox" id="add-sm-live"> <label>Is Live Stream?</label>
            </div>
            <div class="flex gap-2">
                <button class="btn-primary w-full" id="btn-publish-sermon" onclick="addSermon()">
                    ${editingSermonId ? 'Update Media' : 'Publish Media'}
                </button>
                ${editingSermonId ? `<button class="icon-btn" onclick="cancelEdit()" style="background:#ccc; border-radius:var(--radius-md);"><i class="ph ph-x"></i></button>` : ''}
            </div>

            <hr style="margin: 1rem 0; border:0; border-top:1px solid #ccc;">
            <h4 class="mb-2 text-muted" style="font-size:0.8rem; text-transform:uppercase;">Manage Media</h4>
            ${sermonsList || '<p class="text-sm">No sermons</p>'}
        </div>

        <div class="card mb-4" style="border-left: 4px solid var(--accent); border-radius: var(--radius-lg);">
            <div class="flex justify-between items-center mb-2">
                <h3 style="font-size:1.1rem;">Church Information</h3>
                <button onclick="scheduleTestNotification('Church Update', 'This is a test notification from the Admin Portal!')" style="font-size: 0.75rem; background: var(--pcg-blue); color:white; border:none; padding: 0.3rem 0.6rem; border-radius: 6px; cursor:pointer;">
                    <i class="ph ph-paper-plane-tilt"></i> Test Call
                </button>
            </div>
            <div class="form-group">
                <label style="font-size:0.7rem; font-weight:bold;">Church Premises Address</label>
                <input type="text" id="admin-church-address" class="form-control" value="${churchInfo.address}">
            </div>
            <div class="form-group">
                <label style="font-size:0.7rem; font-weight:bold;">Telephone / Contact</label>
                <input type="text" id="admin-church-tel" class="form-control" value="${churchInfo.tel}">
            </div>
            <div class="form-group">
                <label style="font-size:0.7rem; font-weight:bold;">Official Almanac PDF Link (Google Drive/Dropbox)</label>
                <input type="text" id="admin-church-pdf" class="form-control" value="${churchInfo.almanacPdfUrl || ''}" placeholder="Paste the share link here">
            </div>
            <div class="flex gap-2">
                <div class="form-group" style="flex:1;">
                    <label style="font-size:0.7rem; font-weight:bold;">Facebook URL</label>
                    <input type="text" id="admin-church-fb" class="form-control" value="${churchInfo.facebookUrl || ''}" placeholder="fb.com/ebenezergent">
                </div>
                <div class="form-group" style="flex:1;">
                    <label style="font-size:0.7rem; font-weight:bold;">YouTube URL</label>
                    <input type="text" id="admin-church-yt" class="form-control" value="${churchInfo.youtubeUrl || ''}" placeholder="youtube.com/@ebenezergent">
                </div>
            </div>
            <div class="form-group">
                <label style="font-size:0.7rem; font-weight:bold;">TikTok URL</label>
                <input type="text" id="admin-church-tk" class="form-control" value="${churchInfo.tiktokUrl || ''}" placeholder="tiktok.com/@ebenezergent">
            </div>
            <button class="btn-primary w-full" onclick="updateChurchInfo()">Update Identity</button>
        </div>

        <div class="card mb-4" style="border-left: 4px solid #6366f1;">
            <h3 class="mb-2" style="font-size:1.1rem;">${editingActivityId ? 'Edit Weekly Activity' : 'Add Weekly Activity'}</h3>
            <div class="flex gap-2">
                <div class="form-group" style="flex:1;">
                    <select id="act-day" class="form-control">
                        <option value="Sunday">Sunday</option>
                        <option value="Monday">Monday</option>
                        <option value="Tuesday">Tuesday</option>
                        <option value="Wednesday">Wednesday</option>
                        <option value="Thursday">Thursday</option>
                        <option value="Friday">Friday</option>
                        <option value="Saturday">Saturday</option>
                    </select>
                </div>
                <div class="form-group" style="flex:2;"><input type="text" id="act-title" class="form-control" placeholder="Title (e.g. Service)"></div>
            </div>
            <div class="form-group">
                <input type="text" id="act-time" class="form-control" placeholder="Time (e.g. 10am - 1pm)">
            </div>
            <div class="flex gap-2">
                <button class="btn-primary w-full" style="background:#6366f1;" onclick="addActivity()">
                    ${editingActivityId ? 'Update Activity' : 'Publish Activity'}
                </button>
                ${editingActivityId ? `<button class="icon-btn" onclick="cancelEdit()" style="background:#ccc;"><i class="ph ph-x"></i></button>` : ''}
            </div>
            <hr style="margin: 1rem 0; border:0; border-top:1px solid #ccc;">
            <h4 class="mb-2 text-muted" style="font-size:0.8rem; text-transform:uppercase;">Weekly Routine</h4>
            ${liveActivities.map(a => `
                <div class="flex justify-between items-center p-2 mb-2" style="background:#f1f5f9; border-radius: 4px;">
                    <div style="flex-grow:1;"><strong style="font-size:0.85rem;">${a.day}: ${a.title}</strong></div>
                    <div class="flex gap-2">
                        <button onclick="startEditActivity('${a.id}')" style="background:none; border:none; color:var(--pcg-blue); cursor:pointer;"><i class="ph-fill ph-pencil-simple"></i></button>
                        <button onclick="deleteDoc('activities', '${a.id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="ph-fill ph-trash"></i></button>
                    </div>
                </div>
            `).join('') || '<p class="text-sm">No activities</p>'}
        </div>

        <div class="card mb-4" style="border-left: 4px solid #10b981;">
            <h3 class="mb-2" style="font-size:1.1rem;">${editingHymnId ? 'Edit Existing Hymn' : 'Add PCG Hymn'}</h3>
            <div class="flex gap-2">
                <div class="form-group" style="flex:1;"><input type="number" id="hymn-num" class="form-control" placeholder="Hymn #"></div>
                <div class="form-group" style="flex:2;"><input type="text" id="hymn-title" class="form-control" placeholder="Hymn Title"></div>
            </div>
            <div class="form-group">
                <select id="hymn-lang" class="form-control">
                    <option value="english">English (PHB)</option>
                    <option value="twi">Twi (TW)</option>
                </select>
            </div>
            <div class="form-group">
                <textarea id="hymn-content" class="form-control" placeholder="Hymn Lyrics..." rows="6"></textarea>
            </div>
            <div class="flex gap-2">
                <button class="btn-primary w-full" style="background:#10b981;" onclick="addHymn()">
                    ${editingHymnId ? 'Update Hymn' : 'Publish Hymn'}
                </button>
                ${editingHymnId ? `<button class="icon-btn" onclick="cancelEdit()" style="background:#ccc;"><i class="ph ph-x"></i></button>` : ''}
            </div>
            <hr style="margin: 1rem 0; border:0; border-top:1px solid #ccc;">
            <h4 class="mb-2 text-muted" style="font-size:0.8rem; text-transform:uppercase;">Master Hymnal List (ENG & TWI)</h4>
            ${liveHymns.map(h => `
                <div class="flex justify-between items-center p-2 mb-2" style="background:#f1f5f9; border-radius: 4px;">
                    <div style="flex-grow:1;">
                        <span class="badge" style="background:${h.lang==='twi'?'#e0f2fe':'#fef3c7'}; color:${h.lang==='twi'?'#0369a1':'#92400e'}; font-size:0.55rem; padding:0.1rem 0.3rem;">${h.lang.toUpperCase()}</span>
                        <strong style="font-size:0.8rem; margin-left:0.3rem;">#${h.number} - ${h.title}</strong>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="startEditHymn('${h.id}')" style="background:none; border:none; color:var(--pcg-blue); cursor:pointer;"><i class="ph-fill ph-pencil-simple"></i></button>
                        <button onclick="deleteDoc('hymns', '${h.id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="ph-fill ph-trash"></i></button>
                    </div>
                </div>
            `).join('') || '<p class="text-sm">No hymns in database</p>'}
        </div>

        <div class="card mb-4" style="border-left: 4px solid var(--accent);">
            <h3 class="mb-2" style="font-size:1.1rem;">${editingAlmanacId ? 'Edit Almanac Entry' : 'Add Almanac Entry'}</h3>
            <div class="form-group">
                <input type="date" id="al-date" class="form-control">
            </div>
            <div class="form-group">
                <input type="text" id="al-theme" class="form-control" placeholder="Today's Theme">
            </div>
            <div class="form-group">
                <input type="text" id="al-reading" class="form-control" placeholder="Reading (e.g. John 3:16)">
            </div>
            <div class="form-group">
                <input type="text" id="al-season" class="form-control" placeholder="Season (e.g. Epiphany)">
            </div>
            <div class="flex gap-2">
                <button class="btn-primary w-full" style="background:var(--accent);" onclick="addAlmanac()">
                    ${editingAlmanacId ? 'Update Entry' : 'Publish Entry'}
                </button>
                ${editingAlmanacId ? `<button class="icon-btn" onclick="cancelEdit()" style="background:#ccc;"><i class="ph ph-x"></i></button>` : ''}
            </div>
            <hr style="margin: 1rem 0; border:0; border-top:1px solid #ccc;">
            <h4 class="mb-2 text-muted" style="font-size:0.8rem; text-transform:uppercase;">Planned Readings</h4>
            ${liveAlmanac.map(al => `
                <div class="flex justify-between items-center p-2 mb-2" style="background:#f1f5f9; border-radius: 4px;">
                    <div style="flex-grow:1;"><strong style="font-size:0.85rem;">${al.date}: ${al.theme}</strong></div>
                    <div class="flex gap-2">
                        <button onclick="startEditAlmanac('${al.id}')" style="background:none; border:none; color:var(--pcg-blue); cursor:pointer;"><i class="ph-fill ph-pencil-simple"></i></button>
                        <button onclick="deleteDoc('almanac', '${al.id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="ph-fill ph-trash"></i></button>
                    </div>
                </div>
            `).join('') || '<p class="text-sm">No almanac entries</p>'}
        </div>

        <div class="card mb-4" style="border-left: 4px solid #f59e0b;">
            <h3 class="mb-2" style="font-size:1.1rem; color:#d97706;"><i class="ph ph-shield-warning"></i> Social Moderation</h3>
            <p class="text-muted text-sm mb-4">Monitor all church communication to ensure it stays respectful and spiritual.</p>
            <div style="max-height: 200px; overflow-y: auto; background:#fff7ed; padding: 0.5rem; border-radius: 8px;">
                <h4 style="font-size:0.75rem; text-transform:uppercase; margin-bottom:0.5rem;">Global Feed (Most Recent)</h4>
                <div id="admin-mod-feed">
                    <p class="text-center p-4 text-muted text-sm">No recent communication.</p>
                </div>
            </div>
        </div>

        <div class="card mb-4" style="border-left: 4px solid red;">
            <h3 class="mb-2" style="font-size:1.1rem;">Manage Users</h3>
            <p class="text-muted" style="font-size: 0.75rem;">Delete users from the directory here. To revoke login access completely, use <a href="https://console.firebase.google.com" target="_blank" style="color:var(--pcg-blue);">Firebase Console</a>.</p>
            <hr style="margin: 1rem 0; border:0; border-top:1px solid #ccc;">
            ${membersList || '<p class="text-sm">No members</p>'}
        </div>
    `;
}

window.startEditEvent = function(id) {
    const ev = liveEvents.find(e => e.id === id);
    if (!ev) return;
    
    editingEventId = id;
    renderApp(); // Refresh to update button labels

    // Populate inputs
    document.getElementById('add-ev-title').value = ev.title || '';
    document.getElementById('add-ev-month').value = ev.month || '';
    document.getElementById('add-ev-day').value = ev.day || '';
    document.getElementById('add-ev-time').value = ev.time || '';
    document.getElementById('add-ev-loc').value = ev.location || '';
    document.getElementById('add-ev-desc').value = ev.description || '';
    document.getElementById('add-ev-img-url').value = (ev.imageUrl && !ev.imageUrl.startsWith('data:')) ? ev.imageUrl : '';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.startEditSermon = function(id) {
    const sm = liveSermons.find(s => s.id === id);
    if (!sm) return;
    
    editingSermonId = id;
    renderApp();

    document.getElementById('add-sm-title').value = sm.title || '';
    document.getElementById('add-sm-speaker').value = sm.speaker || '';
    document.getElementById('add-sm-url').value = sm.audioUrl || '';
    document.getElementById('add-sm-live').checked = !!sm.isLive;
    
    window.scrollTo({ top: 300, behavior: 'smooth' });
}

window.addEvent = async function() {
    const btn = document.getElementById('btn-publish-event');
    const fileInput = document.getElementById('add-ev-file');
    const urlInput = document.getElementById('add-ev-img-url');
    
    btn.innerText = editingEventId ? "Updating..." : "Publishing...";
    btn.disabled = true;

    let finalImageUrl = urlInput.value.trim();

    // If editing and no new URL/File provided, keep the old one
    if (editingEventId && !finalImageUrl && (!fileInput.files || !fileInput.files[0])) {
        const doc = await db.collection('events').doc(editingEventId).get();
        finalImageUrl = doc.data().imageUrl || '';
    }

    // If file is selected, compress and convert to Base64
    if(fileInput.files && fileInput.files[0]) {
        try {
            finalImageUrl = await compressImage(fileInput.files[0]);
        } catch(e) { console.error("Compression failed", e); }
    }

    const eventData = {
        title: document.getElementById('add-ev-title').value,
        month: document.getElementById('add-ev-month').value,
        day: document.getElementById('add-ev-day').value,
        time: document.getElementById('add-ev-time').value,
        location: document.getElementById('add-ev-loc').value,
        description: document.getElementById('add-ev-desc').value,
        imageUrl: finalImageUrl,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (editingEventId) {
            await db.collection('events').doc(editingEventId).update(eventData);
            alert('Event updated successfully!');
        } else {
            await db.collection('events').add(eventData);
            alert('Event added successfully!');
        }
        cancelEdit();
    } catch(e) { 
        alert("Error saving event"); 
    } finally {
        btn.disabled = false;
    }
}

async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
        };
        reader.onerror = error => reject(error);
    });
}

window.addSermon = async function() {
    const btn = document.getElementById('btn-publish-sermon');
    btn.innerText = editingSermonId ? "Updating..." : "Publishing...";
    
    const sermonData = {
        title: document.getElementById('add-sm-title').value,
        speaker: document.getElementById('add-sm-speaker').value,
        audioUrl: document.getElementById('add-sm-url').value,
        isLive: document.getElementById('add-sm-live').checked,
        date: new Date().toLocaleDateString()
    };

    try {
        if (editingSermonId) {
            await db.collection('sermons').doc(editingSermonId).update(sermonData);
            alert('Media updated successfully!');
        } else {
            await db.collection('sermons').add(sermonData);
            alert('Media added successfully!');
        }
        cancelEdit();
    } catch(e) { 
        alert("Error saving Media"); 
    }
}


window.deleteDoc = async function(collection, id) {
    if(confirm('Are you sure you want to delete this permanently?')) {
        try {
            await db.collection(collection).doc(id).delete();
        } catch(e) { alert("Error deleting"); }
    }
}

window.startEditHymn = function(id) {
    const h = liveHymns.find(h => h.id === id);
    if (!h) return;
    editingHymnId = id;
    renderApp();
    document.getElementById('hymn-num').value = h.number || '';
    document.getElementById('hymn-title').value = h.title || '';
    document.getElementById('hymn-lang').value = h.lang || 'english';
    document.getElementById('hymn-content').value = h.content || '';
    window.scrollTo({ top: 600, behavior: 'smooth' });
}

window.addHymn = async function() {
    const btn = document.querySelector('[onclick="addHymn()"]');
    if(btn) { btn.disabled = true; btn.innerText = "Saving..."; }

    const data = {
        number: parseInt(document.getElementById('hymn-num').value) || 0,
        title: document.getElementById('hymn-title').value,
        lang: document.getElementById('hymn-lang').value,
        content: document.getElementById('hymn-content').value,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        if (editingHymnId) {
            await db.collection('hymns').doc(editingHymnId).update(data);
            alert('Hymn updated!');
        } else {
            await db.collection('hymns').add(data);
            alert('Hymn added!');
        }
        window.cancelEdit();
    } catch(e) { alert("Error saving hymn"); }
    finally { if(btn) { btn.disabled = false; btn.innerText = editingHymnId ? 'Update Hymn' : 'Publish Hymn'; } }
}

window.parseAndImportHymns = async function() {
    const btn = document.getElementById('btn-bulk-import');
    const input = document.getElementById('bulk-hymn-input').value;
    const lang = document.getElementById('bulk-hymn-lang').value;
    
    if(!input.trim()) return alert("Please paste text from PowerPoint first.");
    
    btn.disabled = true;
    btn.innerText = "Parsing & Importing...";

    // Regex to detect "1. [TITLE]" or "1 [TITLE]" at start of line
    const segments = input.split(/^\s*(\d+)[\.\s]*([^\n]*)/m);
    // Splitting by ^\d+ will result in: [empty, num1, title1, content1, num2, title2, content2...]
    
    let count = 0;
    try {
        for (let i = 1; i < segments.length; i += 3) {
            const number = parseInt(segments[i]);
            const nextTitleMatch = segments[i+1] ? segments[i+1].trim() : "";
            const content = segments[i+2] ? segments[i+2].trim() : "";
            
            if (!isNaN(number)) {
                await db.collection('hymns').add({
                    number,
                    title: nextTitleMatch || `Hymn ${number}`,
                    lang,
                    content,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                count++;
            }
        }
        alert(`Successfully imported ${count} ${lang} hymns!`);
        document.getElementById('bulk-hymn-input').value = "";
    } catch(e) {
        console.error(e);
        alert("An error occurred during bulk import. Some hymns might not have been saved.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Start Bulk Import";
    }
}

window.startEditActivity = function(id) {
    const act = liveActivities.find(a => a.id === id);
    if (!act) return;
    editingActivityId = id;
    renderApp();
    document.getElementById('act-day').value = act.day || 'Sunday';
    document.getElementById('act-title').value = act.title || '';
    document.getElementById('act-time').value = act.time || '';
    window.scrollTo({ top: 300, behavior: 'smooth' });
}

window.addActivity = async function() {
    const data = {
        day: document.getElementById('act-day').value,
        title: document.getElementById('act-title').value,
        time: document.getElementById('act-time').value
    };

    try {
        if (editingActivityId) {
            await db.collection('activities').doc(editingActivityId).update(data);
            alert('Activity updated!');
        } else {
            await db.collection('activities').add(data);
            alert('Activity added!');
        }
        window.cancelEdit();
    } catch(e) { alert("Error saving activity"); }
}

window.updateChurchInfo = async function() {
    const data = {
        address: document.getElementById('admin-church-address').value,
        tel: document.getElementById('admin-church-tel').value,
        almanacPdfUrl: document.getElementById('admin-church-pdf').value,
        facebookUrl: document.getElementById('admin-church-fb').value,
        youtubeUrl: document.getElementById('admin-church-yt').value,
        tiktokUrl: document.getElementById('admin-church-tk').value
    };
    try {
        await db.collection('settings').doc('church_info').set(data);
        alert('Church Identity Updated!');
    } catch(e) { alert("Error updating info"); }
}

// ---- Notification System ----
window.requestNotificationPermission = async function() {
    if (!('Notification' in window)) {
        alert("This browser does not support notifications.");
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        isNotificationsEnabled = true;
        localStorage.setItem('pcg_notif_enabled', 'true');
        alert("Awesome! You'll now receive updates from Ebenezer Gent.");
        
        // Show immediate welcome notification
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification('Welcome to Ebenezer Gent!', {
                body: "You've successfully enabled church notifications.",
                icon: './icon-512.png',
                badge: './icon-512.png',
                vibrate: [200, 100, 200]
            });
        }
    } else {
        alert("Notifications were disabled. To enable them, please check your browser settings.");
    }
    renderApp();
}

window.scheduleTestNotification = async function(title, body) {
    if (!isNotificationsEnabled) return alert("Please enable notifications in your browser first.");
    
    if ('serviceWorker' in navigator) {
        try {
            const reg = await navigator.serviceWorker.ready;
            // Delay it by 3 seconds for testing
            setTimeout(() => {
                reg.showNotification(title, {
                    body,
                    icon: './icon-512.png',
                    badge: './icon-512.png',
                    vibrate: [200, 100, 200]
                });
            }, 3000);
            alert("A test notification will arrive in 3 seconds!");
        } catch(e) { console.error(e); }
    }
}

// --- Almanac Management ---
window.startEditAlmanac = function(id) {
    const al = liveAlmanac.find(a => a.id === id);
    if (!al) return;
    editingAlmanacId = id;
    renderApp();
    document.getElementById('al-date').value = al.date || '';
    document.getElementById('al-theme').value = al.theme || '';
    document.getElementById('al-reading').value = al.reading || '';
    document.getElementById('al-season').value = al.season || '';
    window.scrollTo({ top: 800, behavior: 'smooth' });
}

window.addAlmanac = async function() {
    const data = {
        date: document.getElementById('al-date').value,
        theme: document.getElementById('al-theme').value,
        reading: document.getElementById('al-reading').value,
        season: document.getElementById('al-season').value
    };

    try {
        if (editingAlmanacId) {
            await db.collection('almanac').doc(editingAlmanacId).update(data);
            alert('Almanac updated!');
        } else {
            await db.collection('almanac').add(data);
            alert('Almanac published!');
        }
        window.cancelEdit();
    } catch(e) { alert("Error saving almanac"); }
}

window.cancelEdit = function() {
    editingEventId = null;
    editingSermonId = null;
    editingHymnId = null;
    editingActivityId = null;
    editingAlmanacId = null;
    renderApp();
}

// Slider Navigation Logic
window.scrollSlider = function(direction) {
    const slider = document.getElementById('event-slider');
    if(!slider) return;
    
    // Each slide is exactly (100% - total padding) + 16px gap
    const slideWidth = slider.offsetWidth + 16;
    slider.scrollBy({
        left: direction * slideWidth,
        behavior: 'smooth'
    });
}



