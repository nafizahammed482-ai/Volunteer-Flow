// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
    apiKey: "AIzaSyBkbx3T_QrtgHWCfAv_6Tltc_W5YxrFH-Q",
    authDomain: "bbds-blood-network.firebaseapp.com",
    databaseURL: "https://bbds-blood-network-default-rtdb.firebaseio.com",
    projectId: "bbds-blood-network",
    storageBucket: "bbds-blood-network.firebasestorage.app",
    messagingSenderId: "865903022296",
    appId: "1:865903022296:web:5322b0370c68e049fc87ad"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const database = firebase.database();
const auth = firebase.auth();
const db = firebase.firestore();

// ==================== GLOBAL VARIABLES ====================
let currentUserId = null;
let currentUserData = null;
let allRequestsListener = null;
let globalStatsListener = null;
let userDataListener = null;
let activitiesListener = null;
let statusListenerRef = null;  // ব্যান/ডিলিট মনিটরের জন্য

// ==================== BAN/DELETE STATUS LISTENER ====================
function setupBanDeleteListener(userId) {
    // আগের লিসেনার থাকলে রিমুভ
    if (statusListenerRef) {
        database.ref('users/' + statusListenerRef).off();
    }
    
    statusListenerRef = userId;
    const userRef = database.ref('users/' + userId);
    
    userRef.on('value', (snapshot) => {
        const userData = snapshot.val();
        
        // ইউজার ডিলিট হয়ে গেছে
        if (!userData) {
            showAlertAndForceLogout('আপনার অ্যাকাউন্ট ডিলিট করা হয়েছে। প্রশাসকের সাথে যোগাযোগ করুন।');
            return;
        }
        
        // ইউজার ব্যান করা হয়েছে
        if (userData.status === 'banned') {
            showAlertAndForceLogout('আপনার অ্যাকাউন্ট ব্যান করা হয়েছে। বিস্তারিত জানতে প্রশাসকের সাথে যোগাযোগ করুন।');
            return;
        }
    });
}

function showAlertAndForceLogout(message) {
    const snackbar = document.createElement('div');
    snackbar.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--card, #fff);
        color: var(--fg, #1a2e1a);
        padding: 14px 24px;
        border-radius: 30px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        transition: transform 0.3s ease-out;
        font-size: 14px;
        font-weight: 500;
        text-align: center;
        max-width: 90%;
        border-left: 4px solid var(--danger, #ef4444);
    `;
    snackbar.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 8px;"></i> ${message}`;
    document.body.appendChild(snackbar);
    setTimeout(() => snackbar.style.transform = 'translateX(-50%) translateY(0)', 100);
    
    setTimeout(async () => {
        try {
            if (currentUserId) {
                await database.ref('users/' + currentUserId).update({
                    online: false,
                    lastSeen: Date.now()
                });
            }
            await auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Logout error:", error);
            window.location.href = 'login.html';
        }
    }, 2500);
}

// ==================== AUTH CHECK & USER DATA (ব্যান/ডিলিট চেক সহ) ====================
async function checkAuthAndLoadData() {
    return new Promise((resolve) => {
        const userId = localStorage.getItem('userId');
        const userName = localStorage.getItem('userName');
        const userRole = localStorage.getItem('userRole');
        
        if (userId && userName && (userRole === 'volunteer' || userRole === 'admin')) {
            currentUserId = userId;
            document.getElementById('volunteerName').textContent = userName;
            
            // ব্যান/ডিলিট চেক
            checkUserStatusAndProceed(userId).then(isValid => {
                if (isValid) {
                    loadUserData();
                    loadAllData();
                    setupBanDeleteListener(userId);
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
        } else {
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    const snapshot = await database.ref('users/' + user.uid).once('value');
                    const userData = snapshot.val();
                    
                    // ব্যান/ডিলিট চেক
                    if (!userData) {
                        await forceLogout('আপনার অ্যাকাউন্ট ডিলিট করা হয়েছে।');
                        resolve(false);
                        return;
                    }
                    
                    if (userData.status === 'banned') {
                        await forceLogout('আপনার অ্যাকাউন্ট ব্যান করা হয়েছে।');
                        resolve(false);
                        return;
                    }
                    
                    if (userData && (userData.role === 'volunteer' || userData.role === 'admin')) {
                        currentUserId = user.uid;
                        currentUserData = userData;
                        localStorage.setItem('userId', user.uid);
                        localStorage.setItem('userName', userData.name || user.email.split('@')[0]);
                        localStorage.setItem('userRole', userData.role);
                        document.getElementById('volunteerName').textContent = userData.name || user.email.split('@')[0];
                        loadUserData();
                        loadAllData();
                        setupBanDeleteListener(user.uid);
                        resolve(true);
                    } else {
                        window.location.href = 'login.html';
                        resolve(false);
                    }
                } else {
                    window.location.href = 'login.html';
                    resolve(false);
                }
            });
        }
    });
}

async function checkUserStatusAndProceed(userId) {
    try {
        const snapshot = await database.ref('users/' + userId).once('value');
        const userData = snapshot.val();
        
        if (!userData) {
            await forceLogout('আপনার অ্যাকাউন্ট ডিলিট করা হয়েছে।');
            return false;
        }
        
        if (userData.status === 'banned') {
            await forceLogout('আপনার অ্যাকাউন্ট ব্যান করা হয়েছে।');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error("Status check error:", error);
        return false;
    }
}

async function forceLogout(message) {
    const snackbar = document.createElement('div');
    snackbar.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%) translateY(100px);
        background: var(--card, #fff);
        color: var(--fg, #1a2e1a);
        padding: 14px 24px;
        border-radius: 30px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        transition: transform 0.3s ease-out;
        font-size: 14px;
        font-weight: 500;
        text-align: center;
        max-width: 90%;
        border-left: 4px solid #ef4444;
    `;
    snackbar.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 8px;"></i> ${message}`;
    document.body.appendChild(snackbar);
    setTimeout(() => snackbar.style.transform = 'translateX(-50%) translateY(0)', 100);
    
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 2000);
}

// ==================== ADD RECENT ACTIVITY FUNCTION ====================
async function addRecentActivity(activityType, details) {
    if (!currentUserId) return;
    
    const activity = {
        userId: currentUserId,
        userName: localStorage.getItem('userName') || 'ভলান্টিয়ার',
        type: activityType,
        details: details,
        timestamp: Date.now(),
        read: false
    };
    
    try {
        await database.ref('recentActivities').push(activity);
        console.log("Activity added:", activityType);
    } catch (error) {
        console.error("Error adding activity:", error);
    }
}

// ==================== LOAD RECENT ACTIVITIES FROM FIREBASE ====================
async function loadRecentActivitiesFromFirebase() {
    try {
        const snapshot = await database.ref('recentActivities')
            .orderByChild('timestamp')
            .limitToLast(4)
            .once('value');
        
        const activities = [];
        snapshot.forEach(child => {
            activities.push({ id: child.key, ...child.val() });
        });
        
        activities.sort((a, b) => b.timestamp - a.timestamp);
        displayRecentActivities(activities);
        
    } catch (error) {
        console.error("Error loading activities:", error);
    }
}

// ==================== DISPLAY RECENT ACTIVITIES ====================
function displayRecentActivities(activities) {
    const container = document.getElementById('activityList');
    
    if (!container) return;
    
    if (activities.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">কোন কার্যকলাপ নেই</div>';
        return;
    }
    
    container.innerHTML = activities.map(activity => {
        let iconHtml = '';
        let statusClass = '';
        let message = '';
        
        switch (activity.type) {
            case 'donor_added':
                iconHtml = '<i class="fas fa-user-plus"></i>';
                statusClass = 'success';
                message = `<strong>${escapeHtml(activity.userName)}</strong> একটি নতুন ডোনার এড করেছেন: <strong>${escapeHtml(activity.details.donorName || '')}</strong> (${escapeHtml(activity.details.bloodGroup || '')})`;
                break;
            case 'donation_updated':
                iconHtml = '<i class="fas fa-calendar-alt"></i>';
                statusClass = 'info';
                message = `<strong>${escapeHtml(activity.userName)}</strong> একটি ডোনারের শেষ রক্তদানের তারিখ আপডেট করেছেন: <strong>${escapeHtml(activity.details.donorName || '')}</strong>`;
                break;
            case 'request_accepted':
                iconHtml = '<i class="fas fa-check-circle"></i>';
                statusClass = 'success';
                message = `<strong>${escapeHtml(activity.userName)}</strong> একটি রিকোয়েস্ট একসেপ্ট করেছেন: <strong>${escapeHtml(activity.details.patientName || '')}</strong> (${escapeHtml(activity.details.bloodGroup || '')})`;
                break;
            case 'request_completed':
                iconHtml = '<i class="fas fa-check-double"></i>';
                statusClass = 'completed';
                message = `<strong>${escapeHtml(activity.userName)}</strong> একটি রিকোয়েস্ট কমপ্লিট করেছেন: <strong>${escapeHtml(activity.details.patientName || '')}</strong>`;
                break;
            case 'fb_post':
                iconHtml = '<i class="fab fa-facebook"></i>';
                statusClass = 'facebook';
                message = `<strong>${escapeHtml(activity.userName)}</strong> একটি ${activity.details.postType === 'public' ? 'পাবলিক' : 'পার্সোনাল'} ফেসবুক পোস্ট শেয়ার করেছেন`;
                break;
            default:
                iconHtml = '<i class="fas fa-bell</i>';
                statusClass = 'blood';
                message = `<strong>${escapeHtml(activity.userName)}</strong> ${activity.details.message || 'একটি কার্যকলাপ করেছেন'}`;
        }
        
        return `
            <div class="activity-item hover-slide">
                <div class="activity-avatar"><i class="fas fa-user-circle"></i></div>
                <div class="activity-content">
                    <p>${message}</p>
                    <span class="activity-time">${getTimeAgo(activity.timestamp)}</span>
                </div>
                <div class="activity-icon ${statusClass}">${iconHtml}</div>
            </div>
        `;
    }).join('');
}

// ==================== REAL-TIME ACTIVITIES LISTENER ====================
function listenToRecentActivities() {
    if (activitiesListener) {
        database.ref('recentActivities').off('value', activitiesListener);
    }
    
    activitiesListener = database.ref('recentActivities')
        .orderByChild('timestamp')
        .limitToLast(4)
        .on('value', (snapshot) => {
            const activities = [];
            snapshot.forEach(child => {
                activities.push({ id: child.key, ...child.val() });
            });
            activities.sort((a, b) => b.timestamp - a.timestamp);
            displayRecentActivities(activities);
        });
}

// ==================== PAGE TRANSITION LOADING EFFECT ====================
let isLoading = false;

function showPageLoading() {
    if (isLoading) return;
    isLoading = true;
    
    let loadingDiv = document.getElementById('pageLoadingOverlay');
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'pageLoadingOverlay';
        loadingDiv.innerHTML = `
            <div class="page-loading-spinner"></div>
            <div class="page-loading-text">লোড হচ্ছে...</div>
        `;
        document.body.appendChild(loadingDiv);
    }
    
    loadingDiv.classList.add('active');
    
    setTimeout(() => {
        hidePageLoading();
    }, 1000);
}

function hidePageLoading() {
    const loadingDiv = document.getElementById('pageLoadingOverlay');
    if (loadingDiv) {
        loadingDiv.classList.remove('active');
    }
    setTimeout(() => {
        isLoading = false;
    }, 200);
}

window.navigateWithLoading = function(url) {
    showPageLoading();
    setTimeout(() => {
        window.location.href = url;
    }, 150);
};

// ==================== REAL-TIME USER DATA LISTENER ====================
function listenToUserDataChanges() {
    if (!currentUserId) return;
    
    if (userDataListener) {
        database.ref('users/' + currentUserId).off('value', userDataListener);
    }
    
    userDataListener = database.ref('users/' + currentUserId).on('value', (snapshot) => {
        const userData = snapshot.val();
        if (userData) {
            const volunteerNameElement = document.getElementById('volunteerName');
            if (volunteerNameElement && userData.name) {
                volunteerNameElement.textContent = userData.name;
                localStorage.setItem('userName', userData.name);
            }
            
            const pointsElement = document.getElementById('totalPointsDisplay');
            if (pointsElement) {
                pointsElement.textContent = (userData.points || 0).toLocaleString();
            }
            
            const activeDaysEl = document.getElementById('activeDays');
            if (activeDaysEl) {
                activeDaysEl.textContent = userData.streak || 0;
            }
            
            const points = userData.points || 0;
            const badgeElement = document.getElementById('userBadge');
            if (badgeElement) {
                if (points >= 2000) badgeElement.innerHTML = '<i class="fas fa-crown"></i> "রয়্যাল" ব্যাজ';
                else if (points >= 1000) badgeElement.innerHTML = '<i class="fas fa-star"></i> "প্লাটিনাম" ব্যাজ';
                else if (points >= 500) badgeElement.innerHTML = '<i class="fas fa-medal"></i> "গোল্ড" ব্যাজ';
                else if (points >= 200) badgeElement.innerHTML = '<i class="fas fa-award"></i> "সিলভার" ব্যাজ';
                else badgeElement.innerHTML = '<i class="fas fa-seedling"></i> "নতুন" ব্যাজ';
            }
        }
    });
}

async function loadUserData() {
    if (!currentUserId) return;
    
    try {
        const snapshot = await database.ref('users/' + currentUserId).once('value');
        currentUserData = snapshot.val();
        
        if (currentUserData) {
            const points = currentUserData.points || 0;
            document.getElementById('totalPointsDisplay').textContent = points.toLocaleString();
            document.getElementById('activeDays').textContent = currentUserData.streak || 0;
            
            const badgeElement = document.getElementById('userBadge');
            if (points >= 2000) badgeElement.innerHTML = '<i class="fas fa-crown"></i> "রয়্যাল" ব্যাজ';
            else if (points >= 1000) badgeElement.innerHTML = '<i class="fas fa-star"></i> "প্লাটিনাম" ব্যাজ';
            else if (points >= 500) badgeElement.innerHTML = '<i class="fas fa-medal"></i> "গোল্ড" ব্যাজ';
            else if (points >= 200) badgeElement.innerHTML = '<i class="fas fa-award"></i> "সিলভার" ব্যাজ';
            else badgeElement.innerHTML = '<i class="fas fa-seedling"></i> "নতুন" ব্যাজ';
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

// ==================== UPDATE GREETING BASED ON TIME ====================
function updateGreeting() {
    const hour = new Date().getHours();
    const greetingElement = document.getElementById('greetingWord');
    let greeting = '';
    
    if (hour < 12) greeting = 'শুভ সকাল';
    else if (hour < 18) greeting = 'শুভ বিকাল';
    else greeting = 'শুভ সন্ধ্যা';
    
    if (greetingElement) greetingElement.textContent = greeting;
}

// ==================== UPDATE TIME LEFT ====================
function updateTimeLeft() {
    const timeLeftElement = document.getElementById('challengeTimeLeft');
    if (!timeLeftElement) return;
    
    const now = new Date();
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);
    
    const diffMs = endOfWeek - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    timeLeftElement.textContent = diffDays > 0 ? `${diffDays} দিন বাকি!` : 'সময় শেষ!';
}

// ==================== TREND HELPER FUNCTIONS (রিয়েল সাপ্তাহিক ট্রেন্ড ক্যালকুলেশন) ====================
function parseTimestampValue(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return val;
    const t = new Date(val).getTime();
    return isNaN(t) ? null : t;
}

function computeWeeklyTrend(timestamps) {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeekStart = now - oneWeekMs;
    const lastWeekStart = now - (2 * oneWeekMs);
    let thisWeekCount = 0;
    let lastWeekCount = 0;
    
    timestamps.forEach(t => {
        if (t === null || isNaN(t)) return;
        if (t >= thisWeekStart) thisWeekCount++;
        else if (t >= lastWeekStart && t < thisWeekStart) lastWeekCount++;
    });
    
    let percent, up;
    if (lastWeekCount === 0) {
        percent = thisWeekCount > 0 ? 100 : 0;
        up = thisWeekCount > 0;
    } else {
        const change = ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100;
        percent = Math.round(Math.abs(change));
        up = change >= 0;
    }
    return { percent, up };
}

function setTrendUI(elementId, trend) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = `<i class="fas fa-arrow-${trend.up ? 'up' : 'down'}"></i> ${trend.percent}%`;
    el.className = 'stat-trend ' + (trend.up ? 'positive' : 'negative');
}

// ==================== LOAD REQUESTS STATS (রিয়েল ট্রেন্ড পার্সেন্টেজ সহ) ====================
async function loadRequestsStats() {
    try {
        const snapshot = await database.ref('bloodRequests').once('value');
        const requests = [];
        snapshot.forEach(child => {
            requests.push({ id: child.key, ...child.val() });
        });
        
        const total = requests.length;
        const pendingList = requests.filter(r => r.status === 'pending');
        const pending = pendingList.length;
        const urgent = requests.filter(r => r.urgency === 'urgent' && r.status === 'pending').length;
        
        document.getElementById('totalRequests').textContent = total;
        document.getElementById('pendingRequests').textContent = pending;
        document.getElementById('urgentCount').textContent = `${urgent}টি অপেক্ষমান`;
        
        // ==================== রিয়েল ট্রেন্ড পার্সেন্টেজ (এই সপ্তাহ vs গত সপ্তাহ) ====================
        const totalRequestsTimestamps = requests.map(r => parseTimestampValue(r.createdAt));
        setTrendUI('totalRequestsTrend', computeWeeklyTrend(totalRequestsTimestamps));
        
        const pendingRequestsTimestamps = pendingList.map(r => parseTimestampValue(r.createdAt));
        setTrendUI('pendingRequestsTrend', computeWeeklyTrend(pendingRequestsTimestamps));
        
        document.getElementById('requestBadge').textContent = pending;
        document.getElementById('requestBadge').style.display = pending > 0 ? 'inline-flex' : 'none';
        
        loadUrgentRequests(requests);
        
    } catch (error) {
        console.error("Error loading requests stats:", error);
    }
}

function loadUrgentRequests(requests) {
    const urgentRequests = requests.filter(r => r.urgency === 'urgent' && r.status === 'pending').slice(0, 3);
    const container = document.getElementById('urgentRequestsList');
    
    if (urgentRequests.length === 0) {
        container.innerHTML = '<div class="empty-placeholder">কোন জরুরি রিকোয়েস্ট নেই</div>';
        return;
    }
    
    container.innerHTML = urgentRequests.map(req => `
        <div class="urgent-item hover-slide" onclick="navigateWithLoading('request.html')">
            <div class="blood-badge ${getBloodClass(req.bloodGroup)}">${req.bloodGroup || 'O+'}</div>
            <div class="urgent-info">
                <div class="patient-name">${escapeHtml(req.patientName || 'রোগী')}</div>
                <div class="hospital-name">${escapeHtml(req.hospitalName || 'হাসপাতাল')}</div>
            </div>
            <div class="urgent-time">${getTimeAgo(req.createdAt)}</div>
        </div>
    `).join('');
}

async function loadDonorsCount() {
    try {
        const snapshot = await db.collection('donors').get();
        const totalDonors = snapshot.size;
        document.getElementById('totalDonors').textContent = totalDonors;
        
        // ==================== রিয়েল ট্রেন্ড পার্সেন্টেজ (ডোনার যোগ হওয়ার তারিখ অনুযায়ী) ====================
        const donorTimestamps = [];
        snapshot.forEach(doc => {
            const donor = doc.data();
            donorTimestamps.push(parseTimestampValue(donor.timestamp));
        });
        setTrendUI('totalDonorsTrend', computeWeeklyTrend(donorTimestamps));
        
    } catch (error) {
        console.error("Error loading donors count:", error);
        document.getElementById('totalDonors').textContent = '০';
    }
}

async function loadLeaderboardPreview() {
    try {
        const snapshot = await database.ref('users').once('value');
        const users = [];
        snapshot.forEach(child => {
            const user = child.val();
            if (user.role === 'volunteer' || user.role === 'admin') {
                users.push({
                    uid: child.key,
                    name: user.name || 'ভলান্টিয়ার',
                    points: user.points || 0
                });
            }
        });
        
        users.sort((a, b) => b.points - a.points);
        const top3 = users.slice(0, 3);
        const container = document.getElementById('leaderboardPreview');
        
        if (top3.length === 0) {
            container.innerHTML = '<div class="empty-placeholder">কোন ভলান্টিয়ার নেই</div>';
            return;
        }
        
        const medals = ['🥇', '🥈', '🥉'];
        container.innerHTML = top3.map((user, index) => `
            <div class="leaderboard-item rank-${index + 1} hover-scale">
                <span class="rank">${medals[index]}</span>
                <span class="name">${escapeHtml(user.name)}</span>
                <span class="points">${user.points.toLocaleString()} পয়েন্ট</span>
            </div>
        `).join('');
        
        const userIndex = users.findIndex(u => u.uid === currentUserId);
        const userRankContainer = document.getElementById('userRankDisplay');
        
        if (userIndex !== -1) {
            const rank = userIndex + 1;
            const nextPointsNeeded = userIndex > 0 ? users[userIndex - 1].points - users[userIndex].points : 0;
            userRankContainer.innerHTML = `
                <i class="fas fa-user-circle"></i>
                <span>আপনার র‍্যাঙ্ক: <strong>${rank}${getRankSuffix(rank)}</strong></span>
                ${nextPointsNeeded > 0 ? `<span class="next-rank">আরও ${nextPointsNeeded} পয়েন্ট দরকার ${rank - 1}${getRankSuffix(rank - 1)} হতে!</span>` : ''}
            `;
        } else {
            userRankContainer.innerHTML = `
                <i class="fas fa-user-circle"></i>
                <span>আপনার র‍্যাঙ্ক: <strong>লোড হচ্ছে...</strong></span>
            `;
        }
        
    } catch (error) {
        console.error("Error loading leaderboard:", error);
    }
}

async function loadGlobalChallengeStats() {
    try {
        const snapshot = await database.ref('users').once('value');
        let totalDonorsAdded = 0;
        let totalRequestsAccepted = 0;
        let totalEventsParticipated = 0;
        let totalDonationUpdates = 0;      // ==================== সফল ডোনেশন (ডোনেশন ডেট আপডেট সংখ্যা) ====================
        let personalDonorTargetSum = 0;    // ==================== সকল ভলান্টিয়ারের পার্সোনাল চ্যালেঞ্জ টার্গেট যোগফল ====================
        
        snapshot.forEach(child => {
            const user = child.val();
            if (user.role === 'volunteer' || user.role === 'admin') {
                const stats = user.stats || {};
                totalDonorsAdded += stats.donorsAdded || 0;
                totalRequestsAccepted += stats.requestsAccepted || 0;
                totalEventsParticipated += stats.eventsParticipated || 0;
                totalDonationUpdates += stats.donationUpdates || 0;
                
                const personalTarget = user.personalChallenge?.tasks?.[0]?.target;
                personalDonorTargetSum += (typeof personalTarget === 'number' && personalTarget > 0) ? personalTarget : 10;
            }
        });
        
        // ==================== সফল ডোনেশন কাউন্ট: ডোনেশন ডেইট থেকে যতগুলা ডেট আপডেট হয়েছে তার সংখ্যা ====================
        const completedDonationsEl = document.getElementById('completedDonations');
        if (completedDonationsEl) completedDonationsEl.textContent = totalDonationUpdates;
        
        const targets = { donation: 150, event: 60 };
        
        // ==================== "মোট ডোনার এড" টার্গেট = সকল ভলান্টিয়ারের পার্সোনালি সেট করা চ্যালেঞ্জ টার্গেটের সর্বমোট ====================
        updateChallengeProgress('globalDonorFill', 'globalDonorTask', totalDonorsAdded, personalDonorTargetSum);
        updateChallengeProgress('globalDonationFill', 'globalDonationTask', totalRequestsAccepted, targets.donation);
        updateChallengeProgress('globalEventFill', 'globalEventTask', totalEventsParticipated, targets.event);
        
        loadCompletedDonationsTrend();
        
    } catch (error) {
        console.error("Error loading global challenge:", error);
    }
}

// ==================== সফল ডোনেশন এর রিয়েল ট্রেন্ড (recentActivities এর donation_updated লগ থেকে) ====================
async function loadCompletedDonationsTrend() {
    try {
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const snapshot = await database.ref('recentActivities')
            .orderByChild('timestamp')
            .startAt(twoWeeksAgo)
            .once('value');
        
        const timestamps = [];
        snapshot.forEach(child => {
            const activity = child.val();
            if (activity.type === 'donation_updated') {
                timestamps.push(activity.timestamp);
            }
        });
        
        setTrendUI('completedDonationsTrend', computeWeeklyTrend(timestamps));
    } catch (error) {
        console.error("Error loading completed donations trend:", error);
    }
}

function updateChallengeProgress(fillId, textId, current, target) {
    const safeTarget = target > 0 ? target : 1;
    const percent = Math.min(100, (current / safeTarget) * 100);
    const fillElement = document.getElementById(fillId);
    const textElement = document.getElementById(textId);
    
    if (fillElement) fillElement.style.width = `${percent}%`;
    if (textElement) textElement.textContent = `${current}/${target}`;
}

async function loadUnreadMessagesCount() {
    if (!currentUserId) return;
    
    try {
        const snapshot = await database.ref('chatRooms').once('value');
        let unreadCount = 0;
        
        snapshot.forEach(child => {
            const room = child.val();
            if (room.participants && room.participants[currentUserId]) {
                unreadCount += room.unreadCount?.[currentUserId] || 0;
            }
        });
        
        const chatBadge = document.getElementById('chatBadge');
        if (chatBadge) {
            chatBadge.textContent = unreadCount;
            chatBadge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
        }
    } catch (error) {
        console.error("Error loading unread messages:", error);
    }
}

// ==================== HELPER FUNCTIONS ====================
function getBloodClass(bloodGroup) {
    const blood = bloodGroup || 'O+';
    if (blood === 'O+') return 'O-positive';
    if (blood === 'B-') return 'B-negative';
    if (blood === 'A+') return 'A-positive';
    return 'O-positive';
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'এখন';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'এখনই';
    if (diffMins < 60) return `${diffMins} মিনিট আগে`;
    if (diffHours < 24) return `${diffHours} ঘন্টা আগে`;
    return `${diffDays} দিন আগে`;
}

function getRankSuffix(rank) {
    if (rank === 1) return 'st';
    if (rank === 2) return 'nd';
    if (rank === 3) return 'rd';
    return 'th';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== LOGOUT FUNCTION ====================
async function logout() {
    showPageLoading();
    try {
        if (currentUserId) {
            await database.ref('users/' + currentUserId).update({
                online: false,
                lastSeen: Date.now()
            });
        }
        await auth.signOut();
        localStorage.clear();
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 200);
    } catch (error) {
        console.error("Logout error:", error);
        localStorage.clear();
        window.location.href = 'login.html';
    }
}

// ==================== LOAD ALL DATA ====================
async function loadAllData() {
    await Promise.all([
        loadRequestsStats(),
        loadDonorsCount(),
        loadLeaderboardPreview(),
        loadGlobalChallengeStats(),
        loadUnreadMessagesCount(),
        loadRecentActivitiesFromFirebase()
    ]);
}

// ==================== MAKE addRecentActivity GLOBAL ====================
window.addRecentActivity = addRecentActivity;

// ==================== INITIALIZE ====================
function init() {
    updateGreeting();
    updateTimeLeft();
    listenToUserDataChanges();
    listenToRecentActivities();
    
    setInterval(updateTimeLeft, 3600000);
    setInterval(updateGreeting, 60000);
    setInterval(loadUnreadMessagesCount, 30000);
    setInterval(loadRequestsStats, 30000); // প্রতি 30 সেকেন্ডে রিফ্রেশ
    setInterval(loadDonorsCount, 30000);
    
    if (allRequestsListener) allRequestsListener.off();
    allRequestsListener = database.ref('bloodRequests').on('value', () => {
        loadRequestsStats();
    });
    
    if (globalStatsListener) globalStatsListener.off();
    globalStatsListener = database.ref('users').on('value', () => {
        loadGlobalChallengeStats();
        loadLeaderboardPreview();
    });
}

// ==================== SIDEBAR & THEME ====================
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const themeToggleSidebar = document.getElementById('themeToggleSidebar');
const logoutBtn = document.getElementById('logoutBtn');

function toggleSidebar() {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

if (menuBtn) menuBtn.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);
if (themeToggleSidebar) themeToggleSidebar.addEventListener('click', toggleTheme);
if (logoutBtn) logoutBtn.addEventListener('click', logout);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar?.classList.contains('open')) {
        toggleSidebar();
    }
});

initTheme();

// ==================== START APP ====================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthAndLoadData();
    init();
});