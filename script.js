// ==========================================
// KARYA APP - MAIN LOGIC (Hybrid Architecture)
// Personal Data: Local Storage
// Group Data: Firebase Firestore
// ==========================================

// --- Firebase Imports (Using CDN for browser compatibility) ---
// --- Firebase Imports (Using CDN for browser compatibility) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, arrayUnion } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-analytics.js";

// --- YOUR FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDiQXL2BzooiQ1VHqfcg6deGvgO0-tBnTE",
  authDomain: "karya-app-470d6.firebaseapp.com",
  projectId: "karya-app-470d6",
  storageBucket: "karya-app-470d6.firebasestorage.app",
  messagingSenderId: "702895611244",
  appId: "1:702895611244:web:a79153c48121c60f292749",
  measurementId: "G-N1QKRK71RY"
};

// --- Firebase Initialization ---
let app, db, auth, analytics;
let isFirebaseReady = false;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    analytics = getAnalytics(app);
    isFirebaseReady = true;
    console.log("✅ Firebase initialized successfully.");
    
    // Listen for auth state changes to update UI automatically
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            currentUserEmail = user.email;
            if(userIdDisplay) userIdDisplay.textContent = user.displayName || user.email.split('@')[0];
            
            // If user logs in while on Auth Screen, move them to the App
            if (currentScreen === 'authScreen') {
                 renderScreen('todoListScreen');
            }
        } else {
            currentUserId = null;
            if(userIdDisplay) userIdDisplay.textContent = 'Guest';
        }
    });

} catch (e) {
    console.error("Error initializing Firebase:", e);
    // Fallback so the app doesn't crash completely
    alert("Firebase Error: " + e.message);
}

// --- Global App State ---
let currentScreen = 'splash'; 
let editingTaskId = null; 
let convertingIdeaId = null; 
let currentUserId = null; 
let currentUserEmail = null;

// Group State
let currentGroup = null; 
let groupUnsubscribe = null; // To stop listening when leaving group

// Navigation History
let screenHistory = [];
let headerRotationInterval;

// Data containers
let mockTasks = []; 
let mockIdeas = []; 
let nextIdeaId = 1; 

// Lock In Mode variables
let focusTimerInterval = null;
let focusTimeRemaining = 25 * 60; 
let currentFocusTask = null; 

// Streak Tracking 
let dailyCompletionRecords = []; 
let currentStreak = 0;
let notifiedOverdueTasks = new Set();


// --- DOM Elements ---
const splashScreen = document.getElementById('splashScreen'); 
const authScreen = document.getElementById('authScreen');
const todoListScreen = document.getElementById('todoListScreen');
const groupTasksScreen = document.getElementById('groupTasksScreen'); 
const settingsScreen = document.getElementById('settingsScreen');
const historyScreen = document.getElementById('historyScreen'); 
const focusModeScreen = document.getElementById('focusModeScreen');
const weeklyReportScreen = document.getElementById('weeklyReportScreen');

// Auth Button
const googleSignInBtn = document.getElementById('googleSignInBtn');

const menuBtn = document.getElementById('menuBtn');
const sidebarMenu = document.getElementById('sidebarMenu');
const menuOverlay = document.getElementById('menuOverlay');
const homeMenuItem = document.getElementById('homeMenuItem');
const settingsMenuItem = document.getElementById('settingsMenuItem');
const historyMenuItem = document.getElementById('historyMenuItem'); 
const focusModeMenuItem = document.getElementById('focusModeMenuItem');
const groupTasksMenuItem = document.getElementById('groupTasksMenuItem');
const weeklyReportMenuItem = document.getElementById('weeklyReportMenuItem');
const signOutMenuItem = document.getElementById('signOutMenuItem');

// Task Inputs
const newTaskInput = document.getElementById('newTaskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const taskList = document.getElementById('taskList');
const noTasksMessage = document.getElementById('noTasksMessage');
const userIdDisplay = document.getElementById('userIdDisplay');

// Modal Elements
const addTaskModal = document.getElementById('addTaskModal');
const modalTaskNameInput = document.getElementById('modalTaskNameInput');
const modalPriorityInput = document.getElementById('modalPriorityInput');
const modalEstTimeInput = document.getElementById('modalEstTimeInput');
const modalTaskDateInput = document.getElementById('modalTaskDateInput');
const modalTaskTimeInput = document.getElementById('modalTaskTimeInput');
const modalBeginningDateTimeInput = document.getElementById('modalBeginningDateTimeInput');
const modalEndingDateTimeInput = document.getElementById('modalEndingDateTimeInput');
const modalSubstepsInput = document.getElementById('modalSubstepsInput');
const saveTaskBtn = document.getElementById('saveTaskBtn');
const cancelAddTaskBtn = document.getElementById('cancelAddTaskBtn');

// Date Radio Buttons
const dueDateTypeSingle = document.getElementById('dueDateTypeSingle');
const dueDateTypeInterval = document.getElementById('dueDateTypeInterval');
const dueDateToday = document.getElementById('dueDateToday');
const dueDateTomorrow = document.getElementById('dueDateTomorrow');
const dueDateOther = document.getElementById('dueDateOther');
const singleDateOptions = document.getElementById('singleDateOptions');
const intervalOptions = document.getElementById('intervalOptions');

// Screens Specific Elements
const previousTaskList = document.getElementById('previousTaskList');
const noPreviousTasksMessage = document.getElementById('noPreviousTasksMessage');
const streakHistoryList = document.getElementById('streakHistoryList');
const noStreakHistoryMessage = document.getElementById('noStreakHistoryMessage');
const currentStreakCount = document.getElementById('currentStreakCount');

const weeklyTotalCount = document.getElementById('weeklyTotalCount');
const weeklyReportList = document.getElementById('weeklyReportList');
const noWeeklyDataMessage = document.getElementById('noWeeklyDataMessage');

const newIdeaInputHome = document.getElementById('newIdeaInputHome');
const addIdeaBtnHome = document.getElementById('addIdeaBtnHome');
const ideaListHome = document.getElementById('ideaListHome');
const noIdeasMessageHome = document.getElementById('noIdeasMessageHome');
const toggleIdeaListBtn = document.getElementById('toggleIdeaListBtn');

// Lock In Mode Elements
const timerDisplay = document.getElementById('timerDisplay');
const startFocusBtnActive = document.getElementById('startFocusBtnActive');
const pauseFocusBtnActive = document.getElementById('pauseFocusBtnActive');
const resetFocusBtnActive = document.getElementById('resetFocusBtnActive');
const focusTaskDisplay = document.getElementById('focusTaskDisplay');
const focusSetupCard = document.getElementById('focusSetupCard');
const activeFocusSessionCard = document.getElementById('activeFocusSession');
const studyLengthRadios = document.querySelectorAll('input[name="studyLength"]');
const customStudyLengthInput = document.getElementById('customStudyLengthInput');
const focusTaskSelect = document.getElementById('focusTaskSelect');
const setFocusBtn = document.getElementById('setFocusBtn');

// Group Elements
const groupSetupSection = document.getElementById('groupSetupSection');
const currentGroupSection = document.getElementById('currentGroupSection');
const newGroupNameInput = document.getElementById('newGroupNameInput');
const createGroupBtn = document.getElementById('createGroupBtn');
const joinGroupCodeInput = document.getElementById('joinGroupCodeInput');
const joinGroupBtn = document.getElementById('joinGroupBtn');
const currentGroupName = document.getElementById('currentGroupName');
const currentGroupCode = document.getElementById('currentGroupCode');
const currentGroupHost = document.getElementById('currentGroupHost');
const groupMembersList = document.getElementById('groupMembersList');
const hostPermissionsToggle = document.getElementById('hostPermissionsToggle');
const newGroupTaskInput = document.getElementById('newGroupTaskInput');
const addGroupTaskBtn = document.getElementById('addGroupTaskBtn');
const groupTaskList = document.getElementById('groupTaskList');
const noGroupTasksMessage = document.getElementById('noGroupTasksMessage');
const leaveGroupBtn = document.getElementById('leaveGroupBtn');

const saveNotificationTimeBtn = document.getElementById('saveNotificationTimeBtn');

// Custom Modal
const customModal = document.getElementById('customModal');
const modalMessage = document.getElementById('modalMessage');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCancelBtn = document.getElementById('modalCancelBtn');

const headerTaskNameDisplay = document.getElementById('headerTaskName');
const backBtnTodoList = document.getElementById('backBtnTodoList');
const backBtnSettings = document.getElementById('backBtnSettings');
const backBtnHistory = document.getElementById('backBtnHistory');
const backBtnFocusMode = document.getElementById('backBtnFocusMode');
const backBtnGroupTasks = document.getElementById('backBtnGroupTasks');
const backBtnWeeklyReport = document.getElementById('backBtnWeeklyReport');


// --- Local Storage Helpers (Personal Data) ---

function loadLocalData() {
    // Load Personal Tasks
    const tasksJSON = localStorage.getItem('karya_tasks');
    if (tasksJSON) {
        mockTasks = JSON.parse(tasksJSON);
    } else {
        // Starter Task
        mockTasks = [
            { 
                id: '1', 
                text: 'Welcome to Karya!', 
                priority: 'medium',
                estimatedTime: 15,
                completed: false, 
                date: getFormattedDate(new Date()), 
                time: '10:00', 
                type: 'single', 
                substeps: [] 
            }
        ];
        saveTasksLocally();
    }

    // Load Ideas
    const ideasJSON = localStorage.getItem('karya_ideas');
    if (ideasJSON) {
        mockIdeas = JSON.parse(ideasJSON);
        const maxId = mockIdeas.reduce((max, idea) => Math.max(max, parseInt(idea.id.replace('idea', '')) || 0), 0);
        nextIdeaId = maxId + 1;
    }

    // Load Streak Records
    const streakJSON = localStorage.getItem('karya_streaks');
    if (streakJSON) {
        dailyCompletionRecords = JSON.parse(streakJSON);
    }
}

function saveTasksLocally() {
    localStorage.setItem('karya_tasks', JSON.stringify(mockTasks));
}

function saveIdeasLocally() {
    localStorage.setItem('karya_ideas', JSON.stringify(mockIdeas));
}

function saveStreakLocally() {
    localStorage.setItem('karya_streaks', JSON.stringify(dailyCompletionRecords));
}

// --- Auth Functions (Firebase) ---

async function handleGoogleSignIn() {
    if (!isFirebaseReady) {
        showModal("Firebase is not initialized. Check console for errors.");
        return;
    }

    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged handles the rest
    } catch (error) {
        console.error("Login Failed:", error);
        showModal("Login failed: " + error.message);
    }
}

async function handleSignOut() {
    const confirmed = await showModal("Sign out? This will clear the current session.", true, true, "Sign Out", "Cancel");
    if(confirmed) {
        if (isFirebaseReady) {
            await signOut(auth);
        }
        
        // Clear session state
        clearInterval(headerRotationInterval); 
        currentUserId = null; 
        userIdDisplay.textContent = 'Guest';
        screenHistory = []; 
        notifiedOverdueTasks.clear(); 
        currentGroup = null; 
        
        // Detach Firestore listener if active
        if (groupUnsubscribe) {
            groupUnsubscribe(); 
            groupUnsubscribe = null;
        }
        
        renderScreen('authScreen'); 
    }
}

// --- Main App Logic ---

function showModal(msg, showConfirm = false, showCancel = false, confirmText = 'OK', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        customModal.classList.add('hidden'); 
        modalMessage.textContent = msg; 
        customModal.classList.remove('hidden');

        modalConfirmBtn.textContent = confirmText;
        modalCancelBtn.textContent = cancelText;

        modalConfirmBtn.classList.toggle('bg-blue-600', confirmText === 'OK'); 
        modalConfirmBtn.classList.toggle('bg-green-600', confirmText !== 'OK' && confirmText !== 'Mark Completed'); 
        modalConfirmBtn.classList.toggle('bg-[#1554de]', confirmText === 'Mark Completed'); 

        modalCancelBtn.classList.toggle('hidden', !showCancel);

        modalConfirmBtn.onclick = null;
        modalCancelBtn.onclick = null;

        modalConfirmBtn.onclick = () => {
            customModal.classList.add('hidden');
            resolve(true);
        };

        if (showCancel) {
            modalCancelBtn.onclick = () => {
                customModal.classList.add('hidden');
                resolve(false);
            };
        }
    });
}

function openAddTaskModal(taskId = null, ideaIdToConvert = null) {
    editingTaskId = taskId; 
    convertingIdeaId = ideaIdToConvert; 

    addTaskModal.classList.add('open');
    
    if (convertingIdeaId) {
        const ideaToConvert = mockIdeas.find(idea => idea.id === convertingIdeaId);
        if (ideaToConvert) {
            modalTaskNameInput.value = ideaToConvert.text;
        }
    } else {
        modalTaskNameInput.value = newTaskInput.value.trim(); 
    }
    newTaskInput.value = ''; 

    // Reset fields
    modalTaskTimeInput.value = ''; 
    modalBeginningDateTimeInput.value = '';
    modalEndingDateTimeInput.value = '';
    modalSubstepsInput.value = ''; 
    modalPriorityInput.value = 'medium'; 
    modalEstTimeInput.value = ''; 

    dueDateTypeSingle.checked = true; 
    dueDateToday.checked = true; 
    
    handleDueDateTypeChange(); 
    handleDueDateOptionChange(); 
}

function openEditTaskModal(taskId) {
    editingTaskId = taskId; 
    convertingIdeaId = null; 

    const taskToEdit = mockTasks.find(task => task.id === taskId);
    if (!taskToEdit) {
        showModal("Task not found for editing.");
        return;
    }

    addTaskModal.classList.add('open');
    modalTaskNameInput.value = taskToEdit.text;
    modalPriorityInput.value = taskToEdit.priority || 'medium';
    modalEstTimeInput.value = taskToEdit.estimatedTime || '';

    modalSubstepsInput.value = taskToEdit.substeps.map(s => {
        let line = s.text;
        if (s.timeRequired) {
            line += ` (${s.timeRequired})`;
        }
        return line;
    }).join('\n');

    if (taskToEdit.type === 'single') {
        dueDateTypeSingle.checked = true;
        modalTaskDateInput.value = taskToEdit.date || '';
        modalTaskTimeInput.value = taskToEdit.time || '';

        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        const taskDateObj = taskToEdit.date ? new Date(taskToEdit.date) : null;

        if (taskDateObj && taskDateObj.toDateString() === today.toDateString()) {
            dueDateToday.checked = true;
        } else if (taskDateObj && taskDateObj.toDateString() === tomorrow.toDateString()) {
            dueDateTomorrow.checked = true;
        } else {
            dueDateOther.checked = true;
        }
    } else if (taskToEdit.type === 'time_period') {
        dueDateTypeInterval.checked = true;
        modalBeginningDateTimeInput.value = taskToEdit.beginningDateTime || '';
        modalEndingDateTimeInput.value = taskToEdit.endingDateTime || '';
    }
    handleDueDateTypeChange(); 
    handleDueDateOptionChange(); 
}

function closeAddTaskModal() {
    addTaskModal.classList.remove('open');
    editingTaskId = null; 
    convertingIdeaId = null; 
}

function getFormattedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function handleDueDateTypeChange() {
    if (dueDateTypeSingle.checked) {
        singleDateOptions.classList.remove('hidden');
        intervalOptions.classList.add('hidden');
        modalBeginningDateTimeInput.value = '';
        modalEndingDateTimeInput.value = '';
        handleDueDateOptionChange(); 
    } else { 
        singleDateOptions.classList.add('hidden');
        intervalOptions.classList.remove('hidden');
        modalTaskDateInput.classList.add('hidden'); 
        modalTaskDateInput.value = '';
        modalTaskTimeInput.value = '';
    }
}

function handleDueDateOptionChange() {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const dueDateOption = document.querySelector('input[name="taskDueDate"]:checked').value;
    
    if (dueDateOption === 'today') {
        modalTaskDateInput.value = getFormattedDate(today);
        modalTaskDateInput.classList.add('hidden'); 
    } else if (dueDateOption === 'tomorrow') {
        modalTaskDateInput.value = getFormattedDate(tomorrow);
        modalTaskDateInput.classList.add('hidden'); 
    } else if (dueDateOption === 'other') {
        modalTaskDateInput.classList.remove('hidden'); 
        if (!modalTaskDateInput.value) { 
            modalTaskDateInput.value = getFormattedDate(today); 
        }
    }
}

function renderScreen(screenId, isBackNavigation = false) {
    const allScreens = document.querySelectorAll('.screen');
    const currentActiveScreen = document.querySelector('.screen.active');

    if (currentScreen === 'todoListScreen' && screenId !== 'todoListScreen') {
        clearInterval(headerRotationInterval);
        headerTaskNameDisplay.textContent = 'List'; 
    }

    if (!isBackNavigation && currentActiveScreen && currentActiveScreen.id !== 'splashScreen' && currentActiveScreen.id !== 'authScreen') {
        screenHistory.push(currentActiveScreen.id);
    }

    allScreens.forEach(screen => {
        if (screen.id !== screenId) { 
            screen.classList.remove('active'); 
            screen.style.pointerEvents = 'none'; 
            screen.classList.remove('visible'); 
        }
    });

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('visible'); 
        targetScreen.offsetWidth; 
        targetScreen.classList.add('active'); 
        targetScreen.style.pointerEvents = 'auto'; 

        currentScreen = screenId; 
        closeSidebar(); 
        updateBackButtons(); 

        if (screenId === 'todoListScreen') {
            startHeaderRotation();
            updateStreakDisplay(); 
            displayIdeasHome(); 
        } else if (screenId === 'historyScreen') { 
            displayPreviousTasks();
            displayStreakHistory();
        } else if (screenId === 'weeklyReportScreen') {
            generateWeeklyReport();
        } else if (screenId === 'focusModeScreen') {
            populateFocusTaskSelect(); 
            // Resume timer if active
            if (currentFocusTask && focusTimerInterval) { 
                focusSetupCard.classList.add('hidden');
                activeFocusSessionCard.classList.remove('hidden');
                updateFocusTimerDisplay(); 
                startFocusBtnActive.classList.add('hidden');
                pauseFocusBtnActive.classList.remove('hidden');
            } else if (currentFocusTask && !focusTimerInterval) { 
                focusSetupCard.classList.add('hidden');
                activeFocusSessionCard.classList.remove('hidden');
                updateFocusTimerDisplay(); 
                startFocusBtnActive.classList.remove('hidden');
                pauseFocusBtnActive.classList.add('hidden');
            } else { 
                focusSetupCard.classList.remove('hidden');
                activeFocusSessionCard.classList.add('hidden');
                resetFocusTimer(false); 
                if(currentFocusTask){
                    focusTaskDisplay.textContent = `Locked in on: ${currentFocusTask.text}`;
                } else {
                    focusTaskDisplay.textContent = 'No task selected';
                }
            }
        } else if (screenId === 'groupTasksScreen') {
            if (!currentGroup) {
                showGroupSetupSection();
            } else {
                showCurrentGroupSection();
            }
        }
    }
}

function goBack() {
    if (screenHistory.length > 0) {
        const prevScreenId = screenHistory.pop(); 
        renderScreen(prevScreenId, true); 
    } else {
        if (currentScreen !== 'authScreen' && currentScreen !== 'splashScreen') {
            showModal("No more history to go back."); 
            renderScreen('authScreen'); 
        }
    }
}

function updateBackButtons() {
    document.querySelectorAll('[id^="backBtn"]').forEach(btn => btn.classList.add('hidden'));
    if (screenHistory.length > 0) {
        if (currentScreen === 'todoListScreen') backBtnTodoList.classList.remove('hidden');
        else if (currentScreen === 'groupTasksScreen') backBtnGroupTasks.classList.remove('hidden');
        else if (currentScreen === 'settingsScreen') backBtnSettings.classList.remove('hidden');
        else if (currentScreen === 'historyScreen') backBtnHistory.classList.remove('hidden');
        else if (currentScreen === 'focusModeScreen') backBtnFocusMode.classList.remove('hidden');
        else if (currentScreen === 'weeklyReportScreen') backBtnWeeklyReport.classList.remove('hidden');
    }
}

function toggleSidebar() {
    sidebarMenu.classList.toggle('open');
    menuOverlay.classList.toggle('hidden');
}

function closeSidebar() {
    sidebarMenu.classList.remove('open');
    menuOverlay.classList.add('hidden');
}

// --- Task Display Logic ---

function displayTasks(tasks) {
    taskList.innerHTML = '';
    const activeTasks = tasks.filter(t => !t.completed);
    
    // Sort tasks: Urgent > High > Medium > Low
    const priorityWeight = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
    activeTasks.sort((a, b) => {
        const weightA = priorityWeight[a.priority] || 2;
        const weightB = priorityWeight[b.priority] || 2;
        return weightB - weightA;
    });

    if (activeTasks.length === 0) {
        noTasksMessage.classList.remove('hidden');
        taskList.appendChild(noTasksMessage);
    } else {
        noTasksMessage.classList.add('hidden');
        activeTasks.forEach(task => {
            const taskElement = document.createElement('div');
            const taskItemClass = 'task-item-container';
            
            // Priority Borders
            let borderColorClass = 'border-[#1554de]'; 
            if (task.priority === 'high') borderColorClass = 'border-[#FDC056]'; 
            if (task.priority === 'urgent') borderColorClass = 'border-red-600'; 
            
            taskElement.className = `flex flex-col p-3 rounded-lg border-2 ${borderColorClass} ${taskItemClass}`;
            
            const completedSubsteps = task.substeps ? task.substeps.filter(s => s.completed).length : 0;
            const totalSubsteps = task.substeps ? task.substeps.length : 0;
            const substepProgress = totalSubsteps > 0 ? `<span class="text-xs opacity-70 ml-2">(${completedSubsteps}/${totalSubsteps} steps)</span>` : '';

            let dateTimeDisplay = '';
            if (task.type === 'single') {
                const taskDate = new Date(task.date);
                const time = task.time ? new Date(`2000-01-01T${task.time}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                dateTimeDisplay = `${taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} @ ${time}`;
            } else if (task.type === 'time_period') {
                dateTimeDisplay = 'Time Period';
            }
            
            const priorityLabel = task.priority && task.priority !== 'medium' ? `<span class="text-xs font-bold uppercase ml-2 ${task.priority === 'urgent' ? 'text-red-600' : 'text-orange-500'}">${task.priority}</span>` : '';
            const estimateDisplay = task.estimatedTime ? `<span class="text-xs ml-2 opacity-75"><i class="fas fa-clock"></i> ${task.estimatedTime}m</span>` : '';

            taskElement.innerHTML = `
                <div class="flex items-center justify-between w-full">
                    <div class="flex items-center flex-grow">
                        <button class="task-checkbox ${task.completed ? 'completed' : ''}" data-id="${task.id}" data-completed="${task.completed}">
                            ${task.completed ? '<i class="fas fa-check check-icon"></i>' : ''}
                        </button>
                        <span class="text-lg ml-3 ${task.completed ? 'line-through opacity-60' : ''}">${task.text}</span>
                        ${priorityLabel}
                        ${estimateDisplay}
                        ${substepProgress}
                    </div>
                    <div class="flex items-center space-x-2">
                        <button class="p-1 rounded-full focus-session-btn" data-id="${task.id}" title="Start Lock In Session">
                            <i class="fas fa-lock"></i>
                        </button>
                        <button class="p-1 rounded-full edit-task-btn" data-id="${task.id}" title="Edit Task">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="p-1 rounded-full delete-task-btn" data-id="${task.id}" title="Delete Task">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="text-sm opacity-80 w-full mt-2 pl-9">
                    ${dateTimeDisplay}
                </div>
                ${totalSubsteps > 0 ? `
                    <div class="substeps-container w-full mt-3 pl-9">
                        ${task.substeps.map((sub, index) => `
                            <div class="flex items-center mt-1">
                                <button class="substep-checkbox ${sub.completed ? 'completed' : ''}" data-task-id="${task.id}" data-substep-index="${index}">
                                    ${sub.completed ? '<i class="fas fa-check check-icon"></i>' : ''}
                                </button>
                                <span class="ml-2 text-sm ${sub.completed ? 'line-through opacity-60' : ''}">${sub.text} ${sub.timeRequired ? `(${sub.timeRequired})` : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            `;
            taskList.appendChild(taskElement);
        });

        // Listeners
        document.querySelectorAll('.task-checkbox').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const completed = btn.dataset.completed === 'true';
                handleToggleComplete(id, completed);
            };
        });
        document.querySelectorAll('.delete-task-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                handleDeleteTask(id);
            };
        });
        document.querySelectorAll('.edit-task-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                openEditTaskModal(id); 
            };
        });
        document.querySelectorAll('.focus-session-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const task = mockTasks.find(t => t.id === id);
                if (task) {
                    currentFocusTask = task;
                    renderScreen('focusModeScreen');
                }
            };
        });
        document.querySelectorAll('.substep-checkbox').forEach(btn => {
            btn.onclick = async () => {
                const taskId = btn.dataset.taskId;
                const substepIndex = parseInt(btn.dataset.substepIndex);
                handleToggleSubstepComplete(taskId, substepIndex);
            };
        });
    }
}

function displayPreviousTasks() {
    previousTaskList.innerHTML = '';
    const completedTasks = mockTasks.filter(task => task.completed);

    if (completedTasks.length === 0) {
        noPreviousTasksMessage.classList.remove('hidden');
        previousTaskList.appendChild(noPreviousTasksMessage);
    } else {
        noPreviousTasksMessage.classList.add('hidden');
        completedTasks.forEach(task => {
            const taskElement = document.createElement('div');
            const taskItemClass = 'task-item-container completed-task'; 
            taskElement.className = `flex flex-col p-3 rounded-lg border-2 ${taskItemClass}`;
            
            taskElement.innerHTML = `
                <div class="flex items-center justify-between w-full">
                    <div class="flex items-center flex-grow">
                        <span class="text-lg line-through opacity-60">${task.text}</span>
                    </div>
                    <button class="p-1 rounded-full delete-task-btn" data-id="${task.id}" title="Delete Permanently">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="text-sm mt-1 w-full pl-0">
                    Completed on: ${new Date(task.completedAt || Date.now()).toLocaleDateString('en-US')}
                </div>
            `;
            previousTaskList.appendChild(taskElement);
        });

        document.querySelectorAll('#previousTaskList .delete-task-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const confirmed = await showModal("Permanently delete this task?", true, true, 'Delete', 'Cancel');
                if (confirmed) {
                    mockTasks = mockTasks.filter(task => task.id !== id);
                    saveTasksLocally();
                    displayPreviousTasks(); 
                    showModal("Task permanently deleted.");
                }
            };
        });
    }
}

async function saveTask() {
    const taskText = modalTaskNameInput.value.trim();
    const priority = modalPriorityInput.value;
    const estTime = parseInt(modalEstTimeInput.value) || 0; 
    const substepsText = modalSubstepsInput.value.trim();
    const dueDateType = document.querySelector('input[name="dueDateType"]:checked').value;
    
    let taskDate = null;
    let taskTime = null;
    let taskBeginningDateTime = null;
    let taskEndingDateTime = null;

    if (!taskText) {
        showModal("Task name cannot be empty.");
        return;
    }

    const substeps = substepsText.split('\n').filter(s => s.trim() !== '').map(s => {
        const match = s.match(/\(((\d+)\s*(min|hour)s?)\)/i); 
        let timeRequired = null;
        let cleanedText = s.trim();
        if (match) {
            timeRequired = match[1]; 
            cleanedText = s.replace(match[0], '').trim(); 
        }
        return { text: cleanedText, completed: false, timeRequired: timeRequired };
    });

    if (dueDateType === 'single') {
        const dueDateOption = document.querySelector('input[name="taskDueDate"]:checked').value;
        taskDate = modalTaskDateInput.value;
        taskTime = modalTaskTimeInput.value || null; 

        if (dueDateOption === 'other' && !taskDate) {
            showModal("Please select a date.");
            return;
        }
        if (!taskDate) { 
            const today = new Date();
            const tomorrow = new Date();
            tomorrow.setDate(today.getDate() + 1);
            if (dueDateOption === 'today') taskDate = getFormattedDate(today);
            if (dueDateOption === 'tomorrow') taskDate = getFormattedDate(tomorrow);
        }

    } else if (dueDateType === 'time_period') {
        taskBeginningDateTime = modalBeginningDateTimeInput.value;
        taskEndingDateTime = modalEndingDateTimeInput.value;

        if (!taskBeginningDateTime || !taskEndingDateTime) { 
            showModal("Please enter start and end times.");
            return;
        }
    }

    if (editingTaskId) {
        mockTasks = mockTasks.map(task => 
            task.id === editingTaskId ? { 
                ...task, 
                text: taskText, 
                priority: priority,
                estimatedTime: estTime,
                date: taskDate, 
                time: taskTime,
                beginningDateTime: taskBeginningDateTime,
                endingDateTime: taskEndingDateTime,
                type: dueDateType,
                substeps: substeps 
            } : task
        );
        showModal("Task updated successfully!");
    } else {
        const newId = String(Date.now());
        mockTasks.push({ 
            id: newId, 
            text: taskText, 
            priority: priority,
            estimatedTime: estTime,
            completed: false,
            date: taskDate, 
            time: taskTime,
            beginningDateTime: taskBeginningDateTime,
            endingDateTime: taskEndingDateTime,
            type: dueDateType,
            substeps: substeps 
        });
        showModal("Task added successfully!");

        if (convertingIdeaId) {
            mockIdeas = mockIdeas.filter(idea => idea.id !== convertingIdeaId);
            displayIdeasHome(); 
            saveIdeasLocally(); 
        }
    }
    
    saveTasksLocally();
    displayTasks(mockTasks); 
    closeAddTaskModal(); 
    
    const activeTasks = mockTasks.filter(t => !t.completed);
    headerTaskNameDisplay.textContent = activeTasks.length > 0 ? activeTasks[activeTasks.length - 1].text : 'List';
    startHeaderRotation(); 
}

async function handleDeleteTask(id) {
    const confirmed = await showModal("Delete this task?", true, true, 'Delete', 'Cancel');
    if (!confirmed) return; 

    mockTasks = mockTasks.filter(task => task.id !== id);
    saveTasksLocally();
    displayTasks(mockTasks);
    startHeaderRotation(); 
    showModal("Task deleted.");
}

async function handleToggleComplete(id, completed) {
    mockTasks = mockTasks.map(task => {
        if (task.id === id) {
            const newCompletedStatus = !completed;
            if (newCompletedStatus && task.substeps) {
                task.substeps.forEach(sub => sub.completed = true);
            }
            const completedAt = newCompletedStatus ? new Date().toISOString() : null;
            return { ...task, completed: newCompletedStatus, completedAt: completedAt };
        }
        return task;
    });
    
    const task = mockTasks.find(t => t.id === id);
    if (task && task.completed) {
        updateDailyCompletion(new Date());
    }
    
    saveTasksLocally();
    displayTasks(mockTasks); 
    checkStreak(); 
}

function handleToggleSubstepComplete(taskId, substepIndex) {
    mockTasks = mockTasks.map(task => {
        if (task.id === taskId && task.substeps && task.substeps[substepIndex]) {
            task.substeps[substepIndex].completed = !task.substeps[substepIndex].completed;
            const allSubstepsCompleted = task.substeps.every(sub => sub.completed);
            if (allSubstepsCompleted && !task.completed) {
                task.completed = true;
                task.completedAt = new Date().toISOString();
                updateDailyCompletion(new Date());
            } else if (!allSubstepsCompleted && task.completed) {
                task.completed = false;
                task.completedAt = null;
            }
        }
        return task;
    });
    saveTasksLocally();
    displayTasks(mockTasks);
    checkStreak(); 
}

// --- Header Rotation Logic ---
let currentTaskIndex = 0;
const rotationDuration = 4000; 
const fadeDuration = 3000; 

function startHeaderRotation() {
    clearInterval(headerRotationInterval); 
    const activeTasks = mockTasks.filter(t => !t.completed);
    
    if (activeTasks.length === 0) {
        headerTaskNameDisplay.textContent = 'List';
        return;
    }

    headerTaskNameDisplay.textContent = activeTasks[0].text;
    currentTaskIndex = 0;

    headerRotationInterval = setInterval(() => {
        headerTaskNameDisplay.classList.add('fade-out-text');

        setTimeout(() => {
            currentTaskIndex = (currentTaskIndex + 1) % (activeTasks.length + 1); 
            let newText;
            if (currentTaskIndex === activeTasks.length) {
                newText = 'List';
            } else {
                newText = activeTasks[currentTaskIndex].text;
            }
            headerTaskNameDisplay.textContent = newText;
            headerTaskNameDisplay.classList.remove('fade-out-text');

        }, fadeDuration); 

    }, rotationDuration); 
}

// --- Idea Inbox ---
function displayIdeasHome() {
    ideaListHome.innerHTML = '';
    if (mockIdeas.length === 0) {
        noIdeasMessageHome.classList.remove('hidden');
        ideaListHome.appendChild(noIdeasMessageHome);
    } else {
        noIdeasMessageHome.classList.add('hidden');
        mockIdeas.forEach(idea => {
            const ideaElement = document.createElement('div');
            ideaElement.className = 'flex items-center justify-between p-2 rounded-lg border border-gray-300 bg-white text-[#1554de] mb-1 text-sm';
            ideaElement.innerHTML = `
                <span class="flex-grow">${idea.text}</span>
                <div class="flex items-center space-x-1">
                    <button class="p-1 rounded-full text-[#1554de] hover:bg-gray-200 convert-to-task-btn" data-id="${idea.id}" title="Convert to Task">
                        <i class="fas fa-plus text-xs"></i>
                    </button>
                    <button class="p-1 rounded-full text-red-600 hover:bg-gray-200 delete-idea-btn" data-id="${idea.id}" title="Delete Idea">
                        <i class="fas fa-times text-xs"></i>
                    </button>
                </div>
            `;
            ideaListHome.appendChild(ideaElement);
        });

        document.querySelectorAll('#ideaListHome .convert-to-task-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                openAddTaskModal(null, id); 
            };
        });

        document.querySelectorAll('#ideaListHome .delete-idea-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                const confirmed = await showModal("Delete this idea?", true, true, 'Delete', 'Cancel');
                if (confirmed) {
                    mockIdeas = mockIdeas.filter(idea => idea.id !== id);
                    saveIdeasLocally();
                    displayIdeasHome(); 
                }
            };
        });
    }
}

async function addIdeaHome() {
    const ideaText = newIdeaInputHome.value.trim();
    if (!ideaText) {
        showModal("Idea cannot be empty.");
        return;
    }
    mockIdeas.push({ id: `idea${nextIdeaId++}`, text: ideaText });
    newIdeaInputHome.value = '';
    saveIdeasLocally();
    displayIdeasHome();
    showModal("Idea added to inbox!");
}

// --- Streak Tracking ---
function getTodayDateString() {
    return getFormattedDate(new Date());
}

function checkStreak() {
    const todayStr = getTodayDateString();
    let tempStreak = 0;
    let prevDate = null;

    dailyCompletionRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    for (let i = 0; i < dailyCompletionRecords.length; i++) {
        const recordDate = new Date(dailyCompletionRecords[i].date);
        if (i === 0) {
            tempStreak = 1;
        } else {
            const dayBefore = new Date(prevDate);
            dayBefore.setDate(dayBefore.getDate() + 1); 
            if (recordDate.toDateString() === dayBefore.toDateString()) {
                tempStreak++;
            } else if (recordDate.toDateString() !== prevDate.toDateString()) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                if (!(recordDate.toDateString() === todayStr && prevDate.toDateString() === yesterday.toDateString())) {
                    tempStreak = 1;
                }
            }
        }
        prevDate = recordDate;
    }
    currentStreak = tempStreak;
    updateStreakDisplay();
}

function updateDailyCompletion(date) {
    const dateStr = getFormattedDate(date);
    const existingRecordIndex = dailyCompletionRecords.findIndex(record => record.date === dateStr);
    const completedTasksToday = mockTasks.filter(task => 
        task.completed && getFormattedDate(new Date(task.completedAt)) === dateStr
    ).length;

    if (existingRecordIndex !== -1) {
        dailyCompletionRecords[existingRecordIndex].tasksCompleted = completedTasksToday;
    } else if (completedTasksToday > 0) {
        dailyCompletionRecords.push({ date: dateStr, tasksCompleted: completedTasksToday });
    }
    saveStreakLocally();
    checkStreak(); 
}

function updateStreakDisplay() {
    if(currentStreakCount) currentStreakCount.textContent = currentStreak;
}

function displayStreakHistory() {
    streakHistoryList.innerHTML = '';
    if (dailyCompletionRecords.length === 0) {
        noStreakHistoryMessage.classList.remove('hidden');
        streakHistoryList.appendChild(noStreakHistoryMessage);
    } else {
        noStreakHistoryMessage.classList.add('hidden');
        const sortedRecords = [...dailyCompletionRecords].sort((a, b) => new Date(b.date) - new Date(a.date));
        sortedRecords.forEach(record => {
            const recordElement = document.createElement('div');
            recordElement.className = 'flex items-center justify-between p-3 rounded-lg border-2 border-[#1554de] bg-white mb-2 text-[#1554de]';
            recordElement.innerHTML = `
                <span class="text-lg">${record.date}</span>
                <span class="text-lg font-bold">${record.tasksCompleted} tasks</span>
            `;
            streakHistoryList.appendChild(recordElement);
        });
    }
}

// --- Weekly Report ---
function generateWeeklyReport() {
    weeklyReportList.innerHTML = '';
    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);
    
    const weeklyTasks = mockTasks.filter(task => {
        if (!task.completed || !task.completedAt) return false;
        const completionDate = new Date(task.completedAt);
        return completionDate >= oneWeekAgo && completionDate <= now;
    });

    weeklyTotalCount.textContent = weeklyTasks.length;

    if (weeklyTasks.length === 0) {
        noWeeklyDataMessage.classList.remove('hidden');
        weeklyReportList.appendChild(noWeeklyDataMessage);
        return;
    }

    noWeeklyDataMessage.classList.add('hidden');

    const tasksByDay = {};
    weeklyTasks.forEach(task => {
        const dateObj = new Date(task.completedAt);
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        if (!tasksByDay[dateStr]) tasksByDay[dateStr] = [];
        tasksByDay[dateStr].push(task);
    });

    const sortedDays = Object.keys(tasksByDay).sort((a, b) => new Date(b) - new Date(a));

    sortedDays.forEach(day => {
        const dayHeader = document.createElement('h3');
        dayHeader.className = 'text-lg font-bold text-[#1554de] mt-4 border-b border-[#1554de] pb-1';
        dayHeader.textContent = day;
        weeklyReportList.appendChild(dayHeader);

        tasksByDay[day].forEach(task => {
            const taskRow = document.createElement('div');
            taskRow.className = 'flex items-center justify-between py-2 pl-2';
            
            const completedSubsteps = task.substeps ? task.substeps.filter(s => s.completed).length : 0;
            const totalSubsteps = task.substeps ? task.substeps.length : 0;
            const subStr = totalSubsteps > 0 ? ` <span class="text-xs opacity-70">(${completedSubsteps}/${totalSubsteps})</span>` : '';

            taskRow.innerHTML = `
                <span class="text-[#1554de] text-md">• ${task.text}${subStr}</span>
                <i class="fas fa-check-circle text-green-500"></i>
            `;
            weeklyReportList.appendChild(taskRow);
        });
    });
}

// --- Lock In Mode ---
function populateFocusTaskSelect() {
    focusTaskSelect.innerHTML = '<option value="">Optional: Select a Task</option>'; 
    const activeTasks = mockTasks.filter(task => !task.completed);
    activeTasks.forEach(task => {
        const option = document.createElement('option');
        option.value = task.id;
        option.textContent = task.text;
        focusTaskSelect.appendChild(option);
    });

    if (currentFocusTask && activeTasks.some(task => task.id === currentFocusTask.id)) {
        focusTaskSelect.value = currentFocusTask.id;
    } else {
        focusTaskSelect.value = ''; 
    }
}

async function setFocus() {
    const selectedLength = document.querySelector('input[name="studyLength"]:checked').value;
    let durationInMinutes;

    if (selectedLength === 'custom') {
        durationInMinutes = parseInt(customStudyLengthInput.value);
        if (isNaN(durationInMinutes) || durationInMinutes <= 0) {
            showModal("Please enter a valid duration.");
            return;
        }
    } else {
        durationInMinutes = parseInt(selectedLength);
    }

    const selectedTaskId = focusTaskSelect.value;
    if (selectedTaskId) {
        currentFocusTask = mockTasks.find(task => task.id === selectedTaskId);
    } else {
        currentFocusTask = null; 
    }

    focusTimeRemaining = durationInMinutes * 60;
    updateFocusTimerDisplay(); 

    focusSetupCard.classList.add('hidden');
    activeFocusSessionCard.classList.remove('hidden');
    
    startFocusTimer();
}

function updateFocusTimerDisplay() {
    const minutes = Math.floor(focusTimeRemaining / 60);
    const seconds = focusTimeRemaining % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    if (currentFocusTask) {
        focusTaskDisplay.textContent = `Locked in on: ${currentFocusTask.text}`;
    } else {
        focusTaskDisplay.textContent = `No task selected`;
    }
}

function startFocusTimer() {
    if (focusTimerInterval) return; 

    startFocusBtnActive.classList.add('hidden');
    pauseFocusBtnActive.classList.remove('hidden');

    focusTimerInterval = setInterval(() => {
        if (focusTimeRemaining > 0) {
            focusTimeRemaining--;
            updateFocusTimerDisplay();
        } else {
            clearInterval(focusTimerInterval);
            focusTimerInterval = null;
            
            if (currentFocusTask) {
                showModal(`Lock In session completed! Did you finish "${currentFocusTask.text}"?`, true, true, 'Yes, mark complete', 'Not yet').then(complete => {
                   if(complete) {
                       handleToggleComplete(currentFocusTask.id, false);
                       currentFocusTask = null;
                   }
                   resetFocusUI();
                });
            } else {
                showModal("Lock In session completed!");
                resetFocusUI();
            }
        }
    }, 1000);
}

function pauseFocusTimer() {
    clearInterval(focusTimerInterval);
    focusTimerInterval = null;
    startFocusBtnActive.classList.remove('hidden');
    pauseFocusBtnActive.classList.add('hidden');
}

function resetFocusTimer(showMsg = true) {
    clearInterval(focusTimerInterval);
    focusTimerInterval = null;
    focusTimeRemaining = 25 * 60; 
    resetFocusUI();
}

function resetFocusUI() {
    timerDisplay.textContent = '25:00'; 
    startFocusBtnActive.classList.remove('hidden');
    pauseFocusBtnActive.classList.add('hidden');
    currentFocusTask = null; 
    focusTaskDisplay.textContent = 'No task selected'; 
    
    focusSetupCard.classList.remove('hidden');
    activeFocusSessionCard.classList.add('hidden');
    
    document.getElementById('studyLength25').checked = true;
    customStudyLengthInput.classList.add('hidden');
    customStudyLengthInput.value = '';
    focusTaskSelect.value = ''; 
}

// --- FIREBASE GROUP FUNCTIONS (Synced) ---

function showGroupSetupSection() {
    groupSetupSection.classList.remove('hidden');
    currentGroupSection.classList.add('hidden');
    newGroupNameInput.value = '';
    joinGroupCodeInput.value = '';
}

function showCurrentGroupSection() {
    groupSetupSection.classList.add('hidden');
    currentGroupSection.classList.remove('hidden');
}

async function createGroup() {
    if (!isFirebaseReady) { showModal("Syncing not enabled. Add Firebase config."); return; }
    
    const groupName = newGroupNameInput.value.trim();
    if (!groupName) {
        showModal("Please enter a group name.");
        return;
    }

    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newGroupId = 'group-' + Date.now();
    
    try {
        await setDoc(doc(db, "groups", newGroupId), {
            name: groupName,
            joinCode: joinCode,
            hostId: currentUserId || 'anon',
            members: [currentUserId || 'anon'],
            tasks: []
        });
        
        showModal(`Group "${groupName}" created! Code: ${joinCode}`);
        joinGroupWithCode(joinCode); 
    } catch (e) {
        console.error("Error creating group: ", e);
        showModal("Error creating group.");
    }
}

function joinGroup() {
    if (!isFirebaseReady) { showModal("Syncing not enabled. Add Firebase config."); return; }

    const code = joinGroupCodeInput.value.trim().toUpperCase();
    if (!code) {
        showModal("Enter a code.");
        return;
    }
    joinGroupWithCode(code);
}

async function joinGroupWithCode(code) {
    const q = query(collection(db, "groups"), where("joinCode", "==", code));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        showModal("Group not found.");
        return;
    }

    const groupDoc = querySnapshot.docs[0];
    const groupId = groupDoc.id;

    if (groupUnsubscribe) groupUnsubscribe();

    groupUnsubscribe = onSnapshot(doc(db, "groups", groupId), (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentGroup = { id: docSnapshot.id, ...docSnapshot.data() };
            updateCurrentGroupDisplay(currentGroup);
            renderGroupTasks(currentGroup.tasks || []);
        } else {
            showModal("Group was deleted.");
            leaveGroup();
        }
    });

    showCurrentGroupSection();
}

function leaveGroup() {
    showModal("Leave this group?", true, true).then(confirm => {
        if (confirm) {
            if (groupUnsubscribe) groupUnsubscribe(); 
            currentGroup = null;
            showGroupSetupSection();
        }
    });
}

function updateCurrentGroupDisplay(group) {
    currentGroupName.textContent = group.name;
    currentGroupCode.textContent = group.joinCode;
    currentGroupHost.textContent = "Synced Group"; 
    
    groupMembersList.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = `Active Members: ${group.members ? group.members.length : 1}`;
    groupMembersList.appendChild(li);

    hostPermissionsToggle.classList.remove('hidden'); 
}

async function addGroupTask() {
    if (!currentGroup) return;
    const text = newGroupTaskInput.value.trim();
    if (!text) return;

    const newTask = {
        id: 'gt-' + Date.now(),
        text: text,
        completed: false
    };

    try {
        const groupRef = doc(db, "groups", currentGroup.id);
        await updateDoc(groupRef, {
            tasks: arrayUnion(newTask)
        });
        newGroupTaskInput.value = '';
    } catch (e) {
        console.error("Error adding task: ", e);
        showModal("Failed to add task.");
    }
}

function renderGroupTasks(tasks) {
    groupTaskList.innerHTML = '';
    if (!tasks || tasks.length === 0) {
        noGroupTasksMessage.classList.remove('hidden');
        groupTaskList.appendChild(noGroupTasksMessage);
    } else {
        noGroupTasksMessage.classList.add('hidden');
        tasks.forEach(task => {
            const el = document.createElement('div');
            const isCompleted = task.completed;
            el.className = `flex items-center justify-between p-3 rounded-lg border-2 mb-2 ${isCompleted ? 'completed-task' : 'border-[#1554de] bg-white'}`;
            el.innerHTML = `
                <div class="flex items-center flex-grow">
                    <button class="task-checkbox ${isCompleted ? 'completed' : ''}" data-id="${task.id}">
                         ${isCompleted ? '<i class="fas fa-check check-icon"></i>' : ''}
                    </button>
                    <span class="text-lg ml-3 ${isCompleted ? 'line-through opacity-60' : ''}" style="color: ${isCompleted ? '#FDC056' : '#1554de'};">${task.text}</span>
                </div>
                <button class="delete-group-task-btn" data-id="${task.id}"><i class="fas fa-times" style="color: ${isCompleted ? 'white' : '#1554de'};"></i></button>
            `;
            groupTaskList.appendChild(el);
        });

        groupTaskList.querySelectorAll('.task-checkbox').forEach(btn => {
            btn.onclick = () => toggleGroupTask(btn.dataset.id);
        });
        groupTaskList.querySelectorAll('.delete-group-task-btn').forEach(btn => {
            btn.onclick = () => deleteGroupTask(btn.dataset.id);
        });
    }
}

async function toggleGroupTask(taskId) {
    if (!currentGroup) return;
    const updatedTasks = currentGroup.tasks.map(t => {
        if (t.id === taskId) return { ...t, completed: !t.completed };
        return t;
    });

    try {
        await updateDoc(doc(db, "groups", currentGroup.id), { tasks: updatedTasks });
    } catch (e) {
        console.error("Error toggling task:", e);
    }
}

async function deleteGroupTask(taskId) {
    if (!currentGroup) return;
    const updatedTasks = currentGroup.tasks.filter(t => t.id !== taskId);
    
    try {
        await updateDoc(doc(db, "groups", currentGroup.id), { tasks: updatedTasks });
    } catch (e) {
        console.error("Error deleting task:", e);
    }
}

// --- Kayra AI Voice Assistant Logic ---
const startVoiceBtn = document.getElementById('startVoiceBtn');
const voiceOverlay = document.getElementById('voiceOverlay');
const closeVoiceBtn = document.getElementById('closeVoiceBtn');
const voiceStatus = document.getElementById('voiceStatus');
const voiceUserText = document.getElementById('voiceUserText');
const voiceResponseText = document.getElementById('voiceResponseText');

const apiKeyModal = document.getElementById('apiKeyModal');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const cancelApiKeyBtn = document.getElementById('cancelApiKeyBtn');
const openApiKeyModalBtn = document.getElementById('openApiKeyModalBtn');

let recognition;
let synth = window.speechSynthesis;
let isListening = false;

// Setup Speech Recognition
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false; 
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;
        voiceStatus.textContent = "Kayra is listening...";
        voiceUserText.textContent = "";
        voiceResponseText.textContent = "";
    };

    recognition.onend = () => {
        isListening = false;
    };

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        voiceUserText.textContent = `You: "${transcript}"`;
        voiceStatus.textContent = "Thinking...";
        
        if (transcript.toLowerCase() === "exit" || transcript.toLowerCase() === "stop") {
            closeVoiceOverlay();
            return;
        }

        const reply = await askGemini(transcript);
        voiceResponseText.textContent = reply;
        voiceStatus.textContent = "Speaking...";
        speakText(reply);
    };

    recognition.onerror = (event) => {
        voiceStatus.textContent = "Error: " + event.error;
        isListening = false;
    };
} else {
    console.error("Browser does not support Web Speech API");
}

// Open/Close Logic
if (startVoiceBtn) {
    startVoiceBtn.addEventListener('click', () => {
        const key = localStorage.getItem('gemini_api_key');
        if (!key) {
            apiKeyModal.classList.remove('hidden');
        } else {
            voiceOverlay.classList.remove('hidden');
            try { recognition.start(); } catch(e) {}
        }
    });
}

if (closeVoiceBtn) {
    closeVoiceBtn.addEventListener('click', closeVoiceOverlay);
}

function closeVoiceOverlay() {
    voiceOverlay.classList.add('hidden');
    recognition.stop();
    synth.cancel();
}

// API Key Management
if (openApiKeyModalBtn) openApiKeyModalBtn.addEventListener('click', () => apiKeyModal.classList.remove('hidden'));
if (cancelApiKeyBtn) cancelApiKeyBtn.addEventListener('click', () => apiKeyModal.classList.add('hidden'));

if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            apiKeyModal.classList.add('hidden');
            apiKeyInput.value = '';
            showModal("API Key saved! You can now use Kayra.");
        }
    });
}

// Gemini API Call
async function askGemini(prompt) {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) return "Please set your API key in settings.";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Build context with Priorities and Estimates
    const activeTasks = mockTasks.filter(t => !t.completed);
    const taskContext = activeTasks.map(t => 
        `- ${t.text} (Priority: ${t.priority || 'Medium'}, Est: ${t.estimatedTime || '?'} min)`
    ).join('\n');

    // Calculate Velocity
    const totalDays = dailyCompletionRecords.length || 1;
    const totalCompleted = dailyCompletionRecords.reduce((acc, curr) => acc + curr.tasksCompleted, 0);
    const velocity = Math.round(totalCompleted / totalDays) || 0;

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // System Prompt with Slogan
    const systemPrompt = `You are Kayra, a productivity AI. Slogan: "A smarter way to do your day." Today is ${today}.
    
    USER STATS:
    - Average Velocity: ${velocity} tasks/day.
    
    CURRENT TASKS:
    ${taskContext}

    RULES:
    1. Respond briefly (under 2 sentences) for speech synthesis.
    2. If the user asks to "Plan my day", prioritize 'Urgent' and 'High' tasks first.
    3. Warn the user if they have too many tasks compared to their velocity.
    4. Do NOT answer questions about sports, trivia, or non-productivity topics. Politely refuse.
    
    User Query: ${prompt}`;

    const data = {
        contents: [{
            parts: [{ text: systemPrompt }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const json = await response.json();
        if (json.candidates && json.candidates[0].content) {
            return json.candidates[0].content.parts[0].text;
        } else {
            return "Sorry, I couldn't understand that.";
        }
    } catch (error) {
        console.error("Gemini API Error:", error);
        return "Error connecting to AI.";
    }
}

// Text to Speech
function speakText(text) {
    if (synth.speaking) {
        console.error('speechSynthesis.speaking');
        return;
    }
    if (text !== '') {
        const utterThis = new SpeechSynthesisUtterance(text);
        
        const voices = synth.getVoices();
        const preferredVoice = voices.find(voice => 
            voice.name.includes('Google US English') || 
            voice.name.includes('Zira') || 
            voice.name.includes('Samantha')
        );
        if (preferredVoice) utterThis.voice = preferredVoice;

        utterThis.onend = function (event) {
            voiceStatus.textContent = "Kayra is listening...";
            try { recognition.start(); } catch(e) {} 
        };
        synth.speak(utterThis);
    }
}


// --- Initialization ---

window.onload = function() {
    renderScreen('splashScreen');

    setTimeout(() => {
        splashScreen.classList.remove('active'); 
        splashScreen.addEventListener('transitionend', function handler(event) {
            if (event.propertyName === 'opacity') {
                splashScreen.classList.remove('visible'); 
                splashScreen.removeEventListener('transitionend', handler); 
                renderScreen('authScreen');
                setTimeout(() => {
                    document.querySelector('#authScreen .fade-in-element').classList.add('active');
                }, 500); 
            }
        }, { once: true });
    }, 2000);

    // Initial load
    loadLocalData();

    // Listeners
    googleSignInBtn.addEventListener('click', handleGoogleSignIn);

    menuBtn.addEventListener('click', toggleSidebar);
    menuOverlay.addEventListener('click', closeSidebar);
    addTaskBtn.addEventListener('click', () => openAddTaskModal());
    newTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { openAddTaskModal(); e.preventDefault(); } });
    saveTaskBtn.addEventListener('click', saveTask);
    cancelAddTaskBtn.addEventListener('click', closeAddTaskModal);
    dueDateTypeSingle.addEventListener('change', handleDueDateTypeChange);
    dueDateTypeInterval.addEventListener('change', handleDueDateTypeChange);
    dueDateToday.addEventListener('change', handleDueDateOptionChange);
    dueDateTomorrow.addEventListener('change', handleDueDateOptionChange);
    dueDateOther.addEventListener('change', handleDueDateOptionChange);

    backBtnTodoList.addEventListener('click', goBack);
    homeMenuItem.addEventListener('click', () => renderScreen('todoListScreen'));
    settingsMenuItem.addEventListener('click', () => renderScreen('settingsScreen'));
    historyMenuItem.addEventListener('click', () => renderScreen('historyScreen'));
    focusModeMenuItem.addEventListener('click', () => renderScreen('focusModeScreen'));
    groupTasksMenuItem.addEventListener('click', () => renderScreen('groupTasksScreen'));
    weeklyReportMenuItem.addEventListener('click', () => renderScreen('weeklyReportScreen'));
    signOutMenuItem.addEventListener('click', handleSignOut);

    backBtnGroupTasks.addEventListener('click', goBack);
    backBtnSettings.addEventListener('click', goBack);
    backBtnHistory.addEventListener('click', goBack);
    backBtnFocusMode.addEventListener('click', goBack);
    backBtnWeeklyReport.addEventListener('click', goBack);

    createGroupBtn.addEventListener('click', createGroup);
    joinGroupBtn.addEventListener('click', joinGroup);
    leaveGroupBtn.addEventListener('click', leaveGroup);
    addGroupTaskBtn.addEventListener('click', addGroupTask);
    newGroupTaskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { addGroupTask(); e.preventDefault(); }});

    setFocusBtn.addEventListener('click', setFocus);
    startFocusBtnActive.addEventListener('click', startFocusTimer);
    pauseFocusBtnActive.addEventListener('click', pauseFocusTimer);
    resetFocusBtnActive.addEventListener('click', () => resetFocusTimer());
    
    studyLengthRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (document.getElementById('studyLengthCustom').checked) {
                customStudyLengthInput.classList.remove('hidden');
                customStudyLengthInput.focus();
            } else {
                customStudyLengthInput.classList.add('hidden');
                customStudyLengthInput.value = '';
            }
        });
    });

    addIdeaBtnHome.addEventListener('click', addIdeaHome);
    newIdeaInputHome.addEventListener('keypress', (e) => { if (e.key === 'Enter') { addIdeaHome(); e.preventDefault(); }});
    toggleIdeaListBtn.addEventListener('click', () => {
        ideaListHome.classList.toggle('hidden');
        displayIdeasHome();
    });

    initializeCustomRadios(settingsScreen);
    saveNotificationTimeBtn.addEventListener('click', () => {
        const lockScreenSetting = settingsScreen.querySelector('input[name="lockScreenSetting"]:checked');
        const notificationTime = settingsScreen.querySelector('input[name="notificationTime"]:checked');
        
        const lockScreenValue = lockScreenSetting ? lockScreenSetting.value : 'Not selected';
        const notificationTimeValue = notificationTime ? notificationTime.value.replace('_', ' ') : 'Not selected';

        showModal(`Settings saved! Lock Screen: ${lockScreenValue}, Notification Time: ${notificationTimeValue}.`);
    });
};