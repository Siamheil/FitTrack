var DB = { users: {}, session: null };

// ══════════════════════════════════════════════════════════════
//  CALORIE CALCULATOR — MET-based formula
//  Calories = MET × weight(kg) × duration(hours)
//  MET values from the Compendium of Physical Activities
//  This runs client-side as fallback; PHP API is called when available.
// ══════════════════════════════════════════════════════════════

var MET_TABLE = {
  // Cardio
  'running': [7.0, 9.8, 12.0], 'jogging': [6.0, 7.0, 8.5],
  'walking': [2.8, 3.5, 5.0],  'cycling': [5.0, 8.0, 12.0],
  'swimming': [5.0, 7.0, 10.0],'rowing': [4.5, 7.0, 8.5],
  'jump rope': [8.0, 10.0, 12.0], 'elliptical': [5.0, 6.5, 8.0],
  'stair climbing': [4.0, 8.0, 10.0], 'dance': [3.0, 5.5, 8.0],
  'aerobics': [5.0, 7.0, 9.0],
  // Strength
  'weight lifting': [3.0, 5.0, 6.0], 'bench press': [3.5, 5.0, 6.0],
  'squats': [4.0, 5.5, 7.0], 'deadlift': [4.5, 6.0, 7.5],
  'pull ups': [4.0, 6.0, 8.0], 'push ups': [3.5, 5.0, 6.5],
  'kettlebell': [6.0, 8.0, 10.0], 'crossfit': [6.0, 9.0, 12.0],
  'circuit training': [5.0, 7.5, 9.0], 'dumbbell': [3.0, 4.5, 6.0],
  // HIIT
  'hiit': [7.0, 10.0, 14.0], 'tabata': [7.5, 11.0, 14.0],
  'burpees': [7.0, 10.0, 12.0], 'sprint': [8.0, 12.0, 15.0],
  'mountain climbers': [6.5, 9.5, 12.0],
  // Flexibility / Yoga
  'yoga': [2.5, 3.0, 4.0], 'hot yoga': [3.0, 4.5, 6.0],
  'pilates': [3.0, 4.0, 5.5], 'stretching': [2.3, 2.8, 3.5],
  'tai chi': [2.5, 3.0, 4.0],
  // Sports
  'basketball': [5.5, 8.0, 10.0], 'football': [6.0, 9.0, 12.0],
  'soccer': [6.0, 9.0, 12.0], 'tennis': [5.0, 7.5, 10.0],
  'boxing': [7.0, 10.0, 13.0], 'martial arts': [6.0, 9.0, 12.0],
  'hiking': [4.5, 6.0, 8.0], 'cricket': [4.0, 6.0, 8.0],
  'badminton': [4.5, 6.5, 8.5]
};

var CATEGORY_MET = {
  strength: [3.0, 5.0, 6.5],
  cardio:   [5.0, 7.5, 10.0],
  hiit:     [7.0, 10.0, 14.0],
  flexibility: [2.3, 2.8, 3.5],
  yoga:     [2.5, 3.0, 4.0]
};

/**
 * calculateCalories(workoutName, category, durationMin, weightKg, intensity)
 * Returns estimated calories as a number.
 * intensity: 'low' | 'moderate' | 'high'
 */
function calculateCalories(workoutName, category, durationMin, weightKg, intensity) {
  weightKg  = weightKg  || 70;
  intensity = intensity || 'moderate';
  var idx = {low:0, moderate:1, high:2}[intensity] || 1;

  var name = (workoutName || '').toLowerCase().trim();
  var met  = null;

  // 1. Exact match
  if (MET_TABLE[name]) { met = MET_TABLE[name][idx]; }

  // 2. Partial match
  if (!met) {
    for (var key in MET_TABLE) {
      if (name.indexOf(key) !== -1 || key.indexOf(name) !== -1) {
        met = MET_TABLE[key][idx]; break;
      }
    }
  }

  // 3. Category fallback
  if (!met) {
    var cat = CATEGORY_MET[category] || CATEGORY_MET['cardio'];
    met = cat[idx];
  }

  var durationHrs = durationMin / 60;
  return Math.round(met * weightKg * durationHrs);
}

/**
 * autoFillCalories()
 * Called when workout type or duration changes in the Log form.
 * Tries the PHP API first; falls back to JS calculation.
 */
function autoFillCalories() {
  var name     = (document.getElementById('wName').value  || '').trim().toLowerCase();
  var type     = document.getElementById('wType').value;
  var dur      = parseInt(document.getElementById('wDur').value) || 0;
  var intensity= document.getElementById('wIntensity') ? document.getElementById('wIntensity').value : 'moderate';
  var calsInput= document.getElementById('wCals');
  var calsHint = document.getElementById('calsHint');

  if (dur < 1) { if (calsHint) calsHint.textContent = ''; return; }

  var u = getUser();
  var weight = u && u.weight ? u.weight : 70;

  // Try PHP API (works when served via a PHP server like XAMPP/WAMP/Laragon)
  var apiUrl = 'calorie_calc.php?name=' + encodeURIComponent(name || type) +
               '&category=' + encodeURIComponent(getWorkoutCategory(type)) +
               '&duration=' + dur +
               '&weight='   + weight +
               '&intensity='+ intensity;

  // Always use JS formula directly — reliable, no async race condition
  // (PHP API can be used as enhancement but not for the primary value)
  var cals = calculateCalories(name, getWorkoutCategory(type), dur, weight, intensity);
  var lo   = calculateCalories(name, getWorkoutCategory(type), dur, weight, 'low');
  var hi   = calculateCalories(name, getWorkoutCategory(type), dur, weight, 'high');

  // Always write to the input so Log It reads the correct value
  calsInput.value = cals;

  if (calsHint) {
    calsHint.innerHTML =
      '🔥 <b>' + cals + ' kcal</b> estimated · Low: ' + lo + ' · High: ' + hi +
      ' &nbsp;<span style="opacity:0.55;font-size:10px">MET formula</span>';
  }

  // Also try PHP for more precise result (updates field if server responds)
  fetch(apiUrl)
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if (data.success && data.calories > 0) {
        calsInput.value = data.calories;
        if (calsHint) {
          calsHint.innerHTML =
            '🔥 <b>' + data.calories + ' kcal</b> estimated · ' +
            'Low: ' + data.range.low + ' · Mid: ' + data.range.moderate + ' · High: ' + data.range.high +
            ' &nbsp;<span style="opacity:0.55;font-size:10px">MET formula via PHP</span>';
        }
      }
    })
    .catch(function() { /* JS result already applied above */ });
}



// ──────────────────────────────────────────────────────────────
//  WORKOUT TYPE → ANALYTICS CATEGORY MAP
// ──────────────────────────────────────────────────────────────
var WORKOUT_CATEGORY_MAP = {
  cardio:"cardio", running:"cardio", jogging:"cardio", walking:"cardio",
  cycling:"cardio", swimming:"cardio", rowing:"cardio", "jump rope":"cardio",
  elliptical:"cardio", "stair climbing":"cardio", aerobics:"cardio", dance:"cardio",
  strength:"strength", "bench press":"strength", squats:"strength", deadlift:"strength",
  "pull ups":"strength", "push ups":"strength", dumbbell:"strength", barbell:"strength",
  kettlebell:"strength", "resistance bands":"strength", "circuit training":"strength",
  "functional training":"strength", crossfit:"strength",
  hiit:"hiit", tabata:"hiit", burpees:"hiit", "box jumps":"hiit",
  "mountain climbers":"hiit", "sprint intervals":"hiit",
  flexibility:"flexibility", pilates:"flexibility", stretching:"flexibility", "tai chi":"flexibility",
  yoga:"yoga", "hot yoga":"yoga",
  basketball:"cardio", football:"cardio", cricket:"cardio", tennis:"cardio",
  badminton:"cardio", volleyball:"cardio", boxing:"hiit", "martial arts":"hiit",
  wrestling:"hiit", "rock climbing":"strength", hiking:"cardio"
};

function getWorkoutCategory(type) {
  return WORKOUT_CATEGORY_MAP[type] || type;
}

// Maps each exercise name → the correct wType value
var EXERCISE_TYPE_MAP = {
  'Running':'running','Jogging':'jogging','Walking':'walking','Cycling':'cycling',
  'Swimming':'swimming','Rowing':'rowing','Jump Rope':'jump rope','Elliptical':'elliptical',
  'Stair Climbing':'stair climbing','Aerobics':'aerobics','Dance':'dance',
  'Treadmill':'running','Speed Walking':'walking',
  'Bench Press':'bench press','Squats':'squats','Deadlift':'deadlift',
  'Pull Ups':'pull ups','Push Ups':'push ups','Shoulder Press':'strength',
  'Bicep Curls':'strength','Tricep Dips':'strength','Lat Pulldown':'strength',
  'Leg Press':'squats','Lunges':'squats','Plank':'strength',
  'Dumbbell Training':'dumbbell','Barbell Training':'barbell','Kettlebell':'kettlebell',
  'Resistance Bands':'resistance bands','Circuit Training':'circuit training',
  'CrossFit':'crossfit','Functional Training':'functional training',
  'Cable Machine':'strength','Crunches':'strength',
  'HIIT':'hiit','Tabata':'tabata','Burpees':'burpees','Box Jumps':'box jumps',
  'Mountain Climbers':'mountain climbers','Sprint Intervals':'sprint intervals',
  'Jump Squats':'hiit','High Knees':'hiit','Battle Ropes':'hiit',
  'Yoga':'yoga','Hot Yoga':'hot yoga','Pilates':'pilates','Stretching':'stretching',
  'Tai Chi':'tai chi','Foam Rolling':'flexibility','Meditation':'flexibility',
  'Basketball':'basketball','Football':'football','Cricket':'cricket','Tennis':'tennis',
  'Badminton':'badminton','Volleyball':'volleyball','Table Tennis':'badminton',
  'Kabaddi':'cardio','Hockey':'cardio',
  'Boxing':'boxing','Martial Arts':'martial arts','Wrestling':'wrestling',
  'Kickboxing':'boxing','Judo':'martial arts','Karate':'martial arts',
  'Hiking':'hiking','Rock Climbing':'rock climbing','Trekking':'hiking',
  'Cycling Outdoor':'cycling','Trail Running':'running'
};

function onExerciseNameChange() {
  var nameVal = document.getElementById('wName').value;
  if (!nameVal) return;
  var mappedType = EXERCISE_TYPE_MAP[nameVal];
  if (mappedType) {
    var typeEl = document.getElementById('wType');
    for (var i = 0; i < typeEl.options.length; i++) {
      if (typeEl.options[i].value === mappedType) { typeEl.selectedIndex = i; break; }
    }
  }
  autoFillCalories();
}

function onWorkoutTypeChange() { autoFillCalories(); }

function saveDB() {
  try { sessionStorage.setItem('ft_db', JSON.stringify(DB)); } catch(e) {}
}
function loadDB() {
  try {
    var raw = sessionStorage.getItem('ft_db');
    if (raw) DB = JSON.parse(raw);
  } catch(e) {}
}
loadDB();

function getUser() { return DB.session ? DB.users[DB.session] : null; }

function showLanding() {
  document.getElementById('landingPage').classList.remove('hidden');
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('signupPage').classList.add('hidden');
  document.getElementById('appPage').style.display = 'none';
  document.getElementById('mainNav').style.display = 'flex';
}
function showAuth(type) {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('mainNav').style.display = 'flex';
  document.getElementById('appPage').style.display = 'none';
  if (type === 'login') {
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('signupPage').classList.add('hidden');
    clearAlert('loginAlert');
  } else {
    document.getElementById('signupPage').classList.remove('hidden');
    document.getElementById('loginPage').classList.add('hidden');
    clearAlert('signupAlert');
    document.getElementById('signupSuccess').classList.add('hidden');
  }
}
function showApp() {
  document.getElementById('landingPage').classList.add('hidden');
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('signupPage').classList.add('hidden');
  document.getElementById('appPage').style.display = 'block';
  document.getElementById('mainNav').style.display = 'none';
  initAppUI();
}

function scrollToTop() { window.scrollTo({top:0,behavior:'smooth'}); }
function scrollTo(id) {
  var el = document.getElementById(id);
  if (el) el.scrollIntoView({behavior:'smooth',block:'start'});
}

function showAlert(id, msg, type) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert ' + (type === 'success' ? 'alert-success' : 'alert-error');
  el.classList.remove('hidden');
}
function clearAlert(id) {
  var el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); el.textContent = ''; }
}

function handleSignup() {
  var first  = (document.getElementById('sigFirst').value || '').trim();
  var last   = (document.getElementById('sigLast').value  || '').trim();
  var email  = (document.getElementById('sigEmail').value || '').trim().toLowerCase();
  var pwd    = (document.getElementById('sigPwd').value   || '');
  var weight = parseFloat(document.getElementById('sigWeight').value) || 0;
  var height = parseFloat(document.getElementById('sigHeight').value) || 0;
  var goal   = document.getElementById('sigGoal').value;

  clearAlert('signupAlert');

  if (!first || !last)            return showAlert('signupAlert', '⚠ Please enter your full name.');
  if (!email || !email.includes('@')) return showAlert('signupAlert', '⚠ Please enter a valid email address.');
  if (pwd.length < 6)             return showAlert('signupAlert', '⚠ Password must be at least 6 characters.');
  if (DB.users[email])            return showAlert('signupAlert', '⚠ An account with this email already exists.');

  DB.users[email] = {
    first: first, last: last, email: email,
    pwd: btoa(unescape(encodeURIComponent(pwd))),
    weight: weight, height: height, goal: goal,
    workouts: [], created: new Date().toISOString()
  };
  DB.session = email;
  saveDB();

  document.getElementById('signupSuccess').textContent = '✓ Account created! Taking you to your dashboard...';
  document.getElementById('signupSuccess').classList.remove('hidden');

  setTimeout(function() { showApp(); }, 1200);
}

function handleLogin() {
  var email = (document.getElementById('loginEmail').value || '').trim().toLowerCase();
  var pwd   = (document.getElementById('loginPwd').value  || '');
  clearAlert('loginAlert');

  if (!email || !pwd) return showAlert('loginAlert', '⚠ Please enter both email and password.');
  var u = DB.users[email];
  if (!u) return showAlert('loginAlert', '⚠ No account found with this email. Please sign up first.');

  var encoded = '';
  try { encoded = btoa(unescape(encodeURIComponent(pwd))); } catch(e) { encoded = btoa(pwd); }
  if (u.pwd !== encoded) return showAlert('loginAlert', '⚠ Incorrect password. Please try again.');

  DB.session = email;
  saveDB();
  showApp();
}

function handleLogout() {
  DB.session = null;
  saveDB();
  showLanding();
}

function initAppUI() {
  var u = getUser();
  if (!u) return showLanding();

  var h = new Date().getHours();
  var greet = h < 12 ? 'GOOD MORNING' : h < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  document.getElementById('dashGreeting').textContent = greet + ', ' + u.first.toUpperCase() + '!';
  document.getElementById('dashSub').textContent = "Welcome back — here's your fitness overview";
  document.getElementById('sideAvi').textContent = u.first.charAt(0).toUpperCase();
  document.getElementById('sideName').textContent = u.first + ' ' + u.last;
  document.getElementById('sideEmail').textContent = u.email;

  var goalMap = {weight_loss:'Weight Loss',muscle_gain:'Muscle Gain',endurance:'Endurance',flexibility:'Flexibility & Mobility',general:'General Fitness'};
  var gl = document.getElementById('userGoalLabel');
  if (gl) gl.textContent = goalMap[u.goal] || 'General Fitness';

  if (u.weight) document.getElementById('dashBmiW').value = u.weight;
  if (u.height) document.getElementById('dashBmiH').value = u.height;

  setDashPage('dashboard', document.getElementById('nb-dashboard'));
}

function setDashPage(page, btn) {
  document.querySelectorAll('.dash-page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('dp-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
  if (page === 'dashboard') renderDashboard();
  if (page === 'workouts')  renderAllWorkouts();
  if (page === 'analytics') renderAnalytics();
  if (page === 'goals')     renderGoals();
}

var wFilter = 'all';

function addWorkout() {
  var name      = (document.getElementById('wName').value || '').trim();
  var type      = document.getElementById('wType').value;
  var dur       = parseInt(document.getElementById('wDur').value)  || 0;
  var cals      = parseInt(document.getElementById('wCals').value) || 0;
  var sets      = parseInt(document.getElementById('wSets').value) || null;
  var reps      = parseInt(document.getElementById('wReps').value) || null;
  var notes     = (document.getElementById('wNotes').value || '').trim();
  var intensityEl = document.getElementById('wIntensity');
  var intensity = intensityEl ? intensityEl.value : 'moderate';

  if (!name) return toast('Please enter an exercise name', '⚠️');
  if (dur < 1) return toast('Please enter a valid duration', '⚠️');

  var u = getUser(); if (!u) return;

  // Read calories from the auto-filled input; if still 0, calculate now
  // Use lowercase name so it matches MET table keys (e.g. "bench press" not "Bench Press")
  var nameLower = name.toLowerCase();
  if (!cals) {
    cals = calculateCalories(nameLower, getWorkoutCategory(type), dur, u.weight || 70, intensity);
  }

  var w = { id: Date.now(), name:name, type:type, duration:dur, calories:cals, sets:sets, reps:reps, notes:notes, intensity:intensity, date: new Date().toISOString() };
  u.workouts.unshift(w);
  saveDB();

  ['wName','wDur','wCals','wSets','wReps','wNotes'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  var hint = document.getElementById('calsHint');
  if (hint) hint.innerHTML = '';

  toast(name + ' logged! 💪', '✅');
  renderAllWorkouts();
  renderDashboard();
}

function deleteWorkout(id) {
  var u = getUser(); if (!u) return;
  u.workouts = u.workouts.filter(function(w){ return w.id != id; });
  saveDB();
  renderAllWorkouts();
  renderDashboard();
  toast('Workout removed', '🗑️');
}

function filterW(type, btn) {
  wFilter = type;
  document.querySelectorAll('.ftab').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderAllWorkouts();
}

function badgeClass(t) {
  var m = {strength:'badge-strength',cardio:'badge-cardio',flexibility:'badge-flexibility',hiit:'badge-hiit',yoga:'badge-yoga'};
  return m[t] || 'badge-strength';
}

function wHTML(w, showDel) {
  var d = new Date(w.date);
  var ds = d.toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'});
  var meta = ds + ' · ' + w.duration + ' min';
  if (w.sets) meta += ' · ' + w.sets + ' sets';
  if (w.reps) meta += ' × ' + w.reps + ' reps';
  if (w.notes) meta += ' · ' + w.notes;
  var del = showDel ? '<button class="del-btn" onclick="deleteWorkout(' + w.id + ')">✕</button>' : '';
  var cals = w.calories ? '<div class="wrow-cals">' + w.calories + '</div>' : '';
  return '<div class="workout-row">' +
    '<div><div class="wrow-name">' + w.name + '</div><div class="wrow-meta">' + meta + '</div></div>' +
    '<div class="wrow-right">' +
      '<span class="badge ' + badgeClass(w.type) + '">' + w.type + '</span>' +
      cals + del +
    '</div></div>';
}

function renderAllWorkouts() {
  var u = getUser(); if (!u) return;
  var el = document.getElementById('allWorkouts'); if (!el) return;
  var ws = wFilter === 'all' ? u.workouts : u.workouts.filter(function(w){ return w.type === wFilter; });
  el.innerHTML = ws.length
    ? ws.map(function(w){ return wHTML(w, true); }).join('')
    : '<div style="text-align:center;padding:32px;color:var(--txt3);font-size:14px">No ' + (wFilter !== 'all' ? wFilter + ' ' : '') + 'workouts yet</div>';
}

function renderDashboard() {
  var u = getUser(); if (!u) return;
  var ws = u.workouts || [];

  var totalCals = ws.reduce(function(s,w){ return s + w.calories; }, 0);
  var totalMins = ws.reduce(function(s,w){ return s + w.duration; }, 0);


  var now = new Date(); now.setHours(0,0,0,0);
  var dow = now.getDay(); // 0=Sun
  var weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  var weekWs = ws.filter(function(w){ return new Date(w.date) >= weekStart; });
  var weekMins = weekWs.reduce(function(s,w){ return s + w.duration; }, 0);

  var streak = 0;
  if (ws.length) {
    var dates = ws.map(function(w){ var d=new Date(w.date); d.setHours(0,0,0,0); return d.getTime(); });
    var unique = Array.from(new Set(dates)).sort(function(a,b){ return b-a; });
    var cur = now.getTime();
    for (var i = 0; i < unique.length; i++) {
      if (unique[i] === cur) { streak++; cur -= 86400000; }
      else break;
    }
  }

  document.getElementById('dsCals').textContent   = totalCals.toLocaleString();
  document.getElementById('dsMins').textContent   = weekMins;
  document.getElementById('dsCount').textContent  = ws.length;
  document.getElementById('dsStreak').textContent = streak;

  var dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var dayData = dayNames.map(function(_, i) {
    var d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
    var dT = d.getTime();
    return ws.filter(function(w){ var wd=new Date(w.date); wd.setHours(0,0,0,0); return wd.getTime()===dT; })
             .reduce(function(s,w){ return s+w.calories; }, 0);
  });
  var maxD = Math.max.apply(null, dayData.concat([1]));
  var todayIdx = dow === 0 ? 6 : dow - 1;
  var wc = document.getElementById('weekChart');
  if (wc) {
    wc.innerHTML = dayData.map(function(v, i) {
      var pct = Math.max(4, Math.round(v/maxD*100));
      return '<div class="bc-wrap">' +
        (v ? '<div style="font-size:9px;color:var(--txt3)">' + v + '</div>' : '<div style="font-size:9px"></div>') +
        '<div class="bc-bar' + (i===todayIdx?' lit':'') + '" style="height:' + pct + '%;flex:1"></div>' +
        '<div class="bc-lbl">' + dayNames[i] + '</div>' +
        '</div>';
    }).join('');
  }

  var types = {strength:0,cardio:0,flexibility:0,hiit:0,yoga:0};
  ws.forEach(function(w){ var cat=getWorkoutCategory(w.type); if(types[cat]!==undefined) types[cat]++; });
  var total = ws.length || 1;
  var circ = 264;
  document.getElementById('rStr').style.strokeDashoffset  = circ - circ*(types.strength/total);
  document.getElementById('rCar').style.strokeDashoffset  = circ - circ*(types.cardio/total);
  document.getElementById('rFlex').style.strokeDashoffset = circ - circ*(types.flexibility/total);
  document.getElementById('rHiit').style.strokeDashoffset = circ - circ*(types.hiit/total);
  document.getElementById('ringTotal').textContent = ws.length;
  document.getElementById('legStr').textContent  = 'Strength — ' + types.strength;
  document.getElementById('legCar').textContent  = 'Cardio — ' + types.cardio;
  document.getElementById('legFlex').textContent = 'Flexibility — ' + types.flexibility;
  document.getElementById('legHiit').textContent = 'HIIT — ' + types.hiit;
  document.getElementById('legYoga').textContent = 'Yoga — ' + types.yoga;

  var rl = document.getElementById('recentList');
  if (rl) {
    var rec = ws.slice(0, 6);
    rl.innerHTML = rec.length
      ? rec.map(function(w){ return wHTML(w, false); }).join('')
      : '<div style="text-align:center;padding:32px;color:var(--txt3);font-size:14px">No workouts yet — head to the Workouts tab to log your first one 💪</div>';
  }
}

function renderAnalytics() {
  var u = getUser(); if (!u) return;
  var ws = u.workouts || [];
  var totalCals = ws.reduce(function(s,w){ return s+w.calories; }, 0);
  var totalMins = ws.reduce(function(s,w){ return s+w.duration; }, 0);
  var best = ws.length ? Math.max.apply(null, ws.map(function(w){ return w.calories; })) : 0;
  document.getElementById('aTotalCals').textContent = totalCals.toLocaleString();
  document.getElementById('aTotalHrs').textContent  = (totalMins/60).toFixed(1);
  document.getElementById('aAvgCals').textContent   = ws.length ? Math.round(totalCals/ws.length) : 0;
  document.getElementById('aBest').textContent      = best;

  var ab = document.getElementById('analyticsBars'); if (!ab) return;
  var last = ws.slice(0,10).reverse();
  if (!last.length) { ab.innerHTML = '<div style="color:var(--txt3);padding:32px;width:100%;text-align:center;font-size:14px">Log workouts to see your chart</div>'; }
  else {
    var maxC = Math.max.apply(null, last.map(function(w){ return w.calories; }).concat([1]));
    ab.innerHTML = last.map(function(w) {
      var pct = Math.max(4, Math.round(w.calories/maxC*100));
      var d = new Date(w.date).toLocaleDateString('en-IN',{month:'short',day:'numeric'});
      return '<div class="bc-wrap">' +
        '<div style="font-size:9px;color:var(--txt2)">' + (w.calories||'') + '</div>' +
        '<div class="bc-bar" style="height:'+pct+'%;flex:1;background:rgba(249,115,22,0.4)"></div>' +
        '<div class="bc-lbl" style="font-size:9px">' + d + '</div>' +
        '</div>';
    }).join('');
  }

  var freq = {};
  ws.forEach(function(w){ freq[w.name] = (freq[w.name]||0)+1; });
  var top = Object.entries(freq).sort(function(a,b){ return b[1]-a[1]; })[0];
  document.getElementById('topWName').textContent = top ? top[0] : '—';
  document.getElementById('topWSub').textContent  = top ? 'Done ' + top[1] + ' time' + (top[1]>1?'s':'') : 'Log more workouts for insights';

  var types = {strength:0,cardio:0,flexibility:0,hiit:0,yoga:0};
  ws.forEach(function(w){ var cat=getWorkoutCategory(w.type); if(types[cat]!==undefined) types[cat]++; });
  var tot = ws.length || 1;
  var colors = {strength:'#f97316',cardio:'#60a5fa',flexibility:'#c084fc',hiit:'#f87171',yoga:'#4ade80'};
  var sb = document.getElementById('splitBars'); if (!sb) return;
  sb.innerHTML = Object.entries(types).map(function(entry) {
    var t=entry[0], n=entry[1], pct=Math.round(n/tot*100);
    return '<div style="margin-bottom:10px">' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">' +
        '<span style="text-transform:capitalize">' + t + '</span>' +
        '<span style="font-weight:700;color:' + colors[t] + '">' + pct + '%</span>' +
      '</div>' +
      '<div class="prog-bar" style="margin:0"><div style="height:100%;width:' + pct + '%;background:' + colors[t] + ';border-radius:20px;transition:width 0.5s"></div></div>' +
    '</div>';
  }).join('');
}

function renderGoals() {
  var u = getUser(); if (!u) return;
  var ws = u.workouts || [];

  var now = new Date(); now.setHours(0,0,0,0);
  var dow = now.getDay();
  var weekStart = new Date(now); weekStart.setDate(now.getDate() - (dow===0?6:dow-1));
  var ww = ws.filter(function(w){ return new Date(w.date) >= weekStart; });

  var wCnt  = ww.length;
  var wCals = ww.reduce(function(s,w){ return s+w.calories; }, 0);
  var wMins = ww.reduce(function(s,w){ return s+w.duration; }, 0);

  function pct(v, max) { return Math.min(100, Math.round(v/max*100)); }

  document.getElementById('gWPct').textContent  = pct(wCnt,5)+'%';
  document.getElementById('gWCur').textContent  = wCnt;
  document.getElementById('gWFill').style.width = pct(wCnt,5)+'%';

  document.getElementById('gCPct').textContent  = pct(wCals,2500)+'%';
  document.getElementById('gCCur').textContent  = wCals;
  document.getElementById('gCFill').style.width = pct(wCals,2500)+'%';

  document.getElementById('gMPct').textContent  = pct(wMins,150)+'%';
  document.getElementById('gMCur').textContent  = wMins;
  document.getElementById('gMFill').style.width = pct(wMins,150)+'%';

  var total = ws.length;
  var msList = [
    {label:'First Workout',  req:1,  icon:'🥉'},
    {label:'5 Workouts',     req:5,  icon:'🥈'},
    {label:'10 Workouts',    req:10, icon:'🥇'},
    {label:'25 Workouts',    req:25, icon:'🏆'},
    {label:'50 Workouts',    req:50, icon:'👑'},
  ];
  var mb = document.getElementById('milestonesBox');
  if (mb) mb.innerHTML = msList.map(function(m) {
    var done = total >= m.req;
    return '<div class="milestone-row" style="opacity:' + (done?1:0.45) + '">' +
      '<span class="ms-icon">' + m.icon + '</span>' +
      '<div><div class="ms-name">' + m.label + '</div><div class="ms-req">' + m.req + ' session' + (m.req>1?'s':'') + '</div></div>' +
      '<div class="ms-status ' + (done?'ms-done':'ms-locked') + '">' + (done?'Earned ✓':'Locked') + '</div>' +
    '</div>';
  }).join('');

  var adviceMap = {
    weight_loss:   'Focus on HIIT and cardio 4–5x per week. Aim for a 300–500 calorie daily deficit. Combine with strength training 2x per week to preserve muscle mass and boost metabolism long term.',
    muscle_gain:   'Prioritise strength training 4–5x per week with progressive overload. Eat in a caloric surplus with 1.6–2.2g of protein per kg of bodyweight. Rest 48–72 hours between muscle groups.',
    endurance:     'Build your aerobic base with long steady-state cardio 3–4x per week. Increase duration by no more than 10% each week. Add one long session on weekends and include interval training once a week.',
    flexibility:   'Dedicate 20–30 minutes daily to stretching major muscle groups. Yoga and Pilates are excellent additions. Always stretch when muscles are warm and hold positions for 30–60 seconds.',
    general:       'Mix strength, cardio and flexibility training throughout the week. Aim for 150 minutes of moderate activity per week. Focus on consistency over intensity — sustainable habits beat short-term bursts.'
  };
  var ga = document.getElementById('goalAdvice');
  if (ga) ga.textContent = adviceMap[u.goal] || adviceMap['general'];
}

function calcBMI(weight, height) {
  if (!weight || !height || height < 50) return null;
  return weight / ((height/100) * (height/100));
}

function bmiStatus(bmi) {
  if (bmi < 18.5) return { label:'Underweight', color:'#3b82f6' };
  if (bmi < 25)   return { label:'Normal Weight', color:'#22c55e' };
  if (bmi < 30)   return { label:'Overweight', color:'#f59e0b' };
  return { label:'Obese', color:'#ef4444' };
}

function bmiPointerPos(bmi) {
  return Math.min(96, Math.max(2, ((bmi - 15) / 25) * 100));
}

function calcLandBMI() {
  var w = parseFloat(document.getElementById('landBmiW').value);
  var h = parseFloat(document.getElementById('landBmiH').value);
  var bmi = calcBMI(w, h);
  var el = document.getElementById('landBmiResult');
  if (!bmi) { el.innerHTML = '<div style="color:var(--danger);padding:16px;text-align:center">Please enter valid weight and height</div>'; return; }
  var s = bmiStatus(bmi);
  el.innerHTML = bmiResultHTML(bmi, s);
}

function calcDashBMI() {
  var w = parseFloat(document.getElementById('dashBmiW').value);
  var h = parseFloat(document.getElementById('dashBmiH').value);
  var bmi = calcBMI(w, h);
  var el = document.getElementById('dashBmiResults');
  if (!bmi) { el.innerHTML = '<div class="card-title">📊 Results</div><div style="color:var(--danger);padding:16px;text-align:center">Please enter valid measurements</div>'; return; }
  var s = bmiStatus(bmi);
  el.innerHTML = '<div class="card-title">📊 Results</div>' + bmiResultHTML(bmi, s);
}

function bmiResultHTML(bmi, s) {
  var ptr = bmiPointerPos(bmi);
  return '<div style="text-align:center">' +
    '<div style="font-size:13px;color:var(--txt2);margin-bottom:4px">Your BMI</div>' +
    '<div class="bmi-result-big" style="color:' + s.color + '">' + bmi.toFixed(1) + '</div>' +
    '<div style="font-size:16px;font-weight:700;color:' + s.color + ';margin-bottom:16px">' + s.label + '</div>' +
    '<div class="bmi-meter"><div class="bmi-ptr" style="left:' + ptr + '%"></div></div>' +
    '<div class="bmi-scale-lbls"><span>Underweight</span><span>Normal</span><span>Overweight</span><span>Obese</span></div>' +
    '</div>' +
    '<div style="margin-top:20px;background:var(--bg3);border-radius:10px;padding:14px;text-align:left">' +
      '<div style="font-size:12px;color:var(--txt3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">BMI Reference</div>' +
      ['<18.5 — Underweight','18.5–24.9 — Normal','25–29.9 — Overweight','≥30 — Obese'].map(function(r) {
        return '<div style="font-size:13px;color:var(--txt2);padding:3px 0">' + r + '</div>';
      }).join('') +
    '</div>';
}

var toastTimer = null;
function toast(msg, icon) {
  var t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  document.getElementById('toastIcon').textContent = icon || '✅';
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2800);
}

// ══════════════ AUTO-LOGIN ══════════════
window.addEventListener('load', function() {
  if (DB.session && DB.users[DB.session]) {
    showApp();
  }
});