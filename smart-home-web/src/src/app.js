/**
 *          Description:        Contains Automated Smart Home webapp's functionalities
 *                              Contains firebase authentication, communication with
 *                              RTDB, device control interface handlers, RTDB status
 *                              updates.
 * 
 *          Author:             Eddie Kwak
 *          Last Modified:      11/14/2025
 */

// ============================================================================
//                                  IMPORTS
// ============================================================================
import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    onAuthStateChanged,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getDatabase,
    ref,
    set,
    get,
    onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ============================================================================
//                              CONFIGURATION
// ============================================================================
// These configs won't be pushed. Just text me for them if you need to test.

// const firebaseConfig = {
//     apiKey: "...",
//     authDomain: "...",
//     projectId: "...",
//     storageBucket: "...",
//     messagingSenderId: "...",
//     appId: "..."
// }

// Initialize Firebase services
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);

// ============================================================================
//                                  GLOBALS
// ============================================================================
// const ESP32_IP_KEY = "esp32_ip_address";
let messageTimeout;

// DOM selector helper functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

// ============================================================================
//                                  INITS
// ============================================================================
// Initialize all page functionality when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initAuthForms();
    initGoogleAuth();
    initSignOut();
    initDashboardNavigation();
    initDashboardControls();
});

// ============================================================================
//                      AUTHENTICATION STATE MONITORING
// ============================================================================
// Monitor Firebase authentication state and show/hide UI elements
// Redirects to login page if user is not authenticated
onAuthStateChanged(auth, (user) => {
    const authCard = document.getElementById("authCard");
    const appSection = document.getElementById("appSection");
    const signOutBtn = document.getElementById("signOutBtn");
    const userEmail = document.getElementById("userEmail");
    const isDashboard = Boolean(document.getElementById("dashboardPage"));

    if (user) {
        authCard?.classList.add("hidden");
        appSection?.classList.remove("hidden");
        if (signOutBtn) signOutBtn.hidden = false;
        if (userEmail) userEmail.textContent = user.email ?? "User";
    } 
    else {
        authCard?.classList.remove("hidden");
        appSection?.classList.add("hidden");
        if (signOutBtn) signOutBtn.hidden = true;
        if (userEmail) userEmail.textContent = "";
        if (isDashboard) {
            window.location.href = "./index.html";
        }
    }
});

// ============================================================================
//                                  UI INITS
// ============================================================================
function initTabs() {
    const tabs = $$(".tab");
    if (!tabs.length) return;

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            const target = tab.getAttribute("data-tab");
            const panels = $$(".panel");
            panels.forEach((panel) => {
                const isTarget = panel.getAttribute("data-panel") === target;
                panel.classList.toggle("hidden", !isTarget);
                panel.setAttribute("aria-hidden", String(!isTarget));
            });
        });
    });
}

function initAuthForms() {
    // Login form handler
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = /** @type {HTMLInputElement} */ (
                document.getElementById("loginEmail")
            ).value.trim();
            const password = /** @type {HTMLInputElement} */ (
                document.getElementById("loginPassword")
            ).value;
            const messageEl = document.getElementById("loginMessage");
            clearFormMessage(messageEl);

            if (!email || !password) {
                setFormMessage(messageEl, "Please enter email and password.");
                return;
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);
                setFormMessage(messageEl, "Logged in successfully.", "success");
                window.location.href = "./dashboard.html";
            } 
            catch (error) {
                console.error("Login error:", error);
                setFormMessage(messageEl, parseAuthError(error));
            }
        });
    }

    // Sign up form handler
    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = /** @type {HTMLInputElement} */ (
                document.getElementById("signupEmail")
            ).value.trim();
            const password = /** @type {HTMLInputElement} */ (
                document.getElementById("signupPassword")
            ).value;
            const messageEl = document.getElementById("signupMessage");
            clearFormMessage(messageEl);

            if (!email || !password || password.length < 6) {
                setFormMessage(
                    messageEl,
                    "Use a valid email and 6+ character password pls"
                );
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );
                console.log("Account created:", userCredential.user.uid);
                setFormMessage(messageEl, "Account created. You are now signed in.", "success");
                window.location.href = "./dashboard.html";
            } 
            catch (error) {
                console.error("Signup error:", error);
                setFormMessage(messageEl, parseAuthError(error));
            }
        });
    }
}

// Initialize Google login button
function initGoogleAuth() {
    const googleLoginBtn = document.getElementById("googleLoginBtn");
    if (!googleLoginBtn) return;

    googleLoginBtn.addEventListener("click", async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            window.location.href = "./dashboard.html";
        } 
        catch (error) {
            console.error("Google login error:", error);
            const messageEl = document.getElementById("loginMessage");
            setFormMessage(messageEl, parseAuthError(error));
        }
    });
}

// Sign out button handler
function initSignOut() {
    const signOutBtn = document.getElementById("signOutBtn");
    if (!signOutBtn) return;

    signOutBtn.addEventListener("click", async () => {
        try {
            await signOut(auth);
            if (!location.pathname.endsWith("index.html")) {
                window.location.href = "./index.html";
            }
        } 
        catch (error) {
            console.error("Sign out error:", error);
        }
    });
}

// Go to dashboard button
function initDashboardNavigation() {
    const goDashboard = document.getElementById("goDashboard");
    if (!goDashboard) return;

    goDashboard.addEventListener("click", (event) => {
        event.preventDefault();
        window.location.href = "./dashboard.html";
    });
}

// ============================================================================
//                              DEVICE CONTROL
// ============================================================================
// Initialize dashboard device controls and listeners for RTDB
// If you're planning on adding a new peripheral, 
// add firebase reference and onValue() listener here
function initDashboardControls() {
    const ipInput = document.getElementById("esp32-ip");
    if (ipInput) {
        ipInput.style.display = "none";
        const ipLabel = ipInput.previousElementSibling;
        if (ipLabel && ipLabel.tagName === "LABEL") {
            ipLabel.style.display = "none";
        }
    }
    refreshStatus();
    
    // ========================================================================
    //                              LISTENERS
    // ========================================================================
    // Listener for temperature sensor state changes
    const temperatureSensorRef = ref(database, "temperature_sensor/state");
    onValue(temperatureSensorRef, (snapshot) => {
        const state = snapshot.exists() ? (snapshot.val() === 1 ? "on" : "off") : "unknown";
        updateDeviceStatus("temperature_sensor", state);
    });

    // Listener for heating pad state changes
    const heatingPadRef = ref(database, "heating_pad/state");
    onValue(heatingPadRef, (snapshot) => {
        // Convert Firebase value (0 or 1) to string ("off" or "on")
        const state = snapshot.exists() ? (snapshot.val() === 1 ? "on" : "off") : "unknown";
        updateDeviceStatus("heating_pad", state);
    });

    // ========================================================================
    //                         CAMERA ORIENTATION
    // ========================================================================
    // const cameraLeftBtn = document.getElementById("camera-left-btn");
    // const cameraRightBtn = document.getElementById("camera-right-btn");
    // const cameraUpBtn = document.getElementById("camera-up-btn");
    // const cameraDownBtn = document.getElementById("camera-down-btn");

    // if (cameraLeftBtn) {
    //     addServoPressHandlers(cameraLeftBtn, "left");
    // }
    // if (cameraRightBtn) {
    //     addServoPressHandlers(cameraRightBtn, "right");
    // }
    // if (cameraUpBtn) {
    //     addServoPressHandlers(cameraUpBtn, "up");
    // }
    // if (cameraDownBtn) {
    //     addServoPressHandlers(cameraDownBtn, "down");
    // }

    // Initialize camera orientation buttons
    initCameraButtons();

    // Initialize laser pointer joystick
    initLaserJoystick();
}

// ============================================================================
//                          DEVICE CONTROL FUNCTIONS
// ============================================================================

/**
 * Control a device by writing state to Firebase
 * 
 * 
 * @param {string} device : Device identifier (ex: "heating_pad", temperature_sensor", etc.)
 * @param {string} action : Action to perform (ex: "on" or "off", "increase" or "decrease", etc.)
 * 
 * 
 * If you want to add a new peripheral, you're going to ahve to add device mapping
 * in the firebasePath assignment.
 */
async function controlDevice(device, action) {
    try {
        // Device to firebase path mapping 
        const firebasePath = device === "heating_pad" 
            ? "heating_pad/state" 
            : device === "temperature_sensor"
            ? "temperature_sensor/state"
            : null;
        
        if (!firebasePath) {
            showMessage("Unknown device: " + device, "error");
            return;
        }
        
        const state = action === "on" ? 1 : 0;
        
        const stateRef = ref(database, firebasePath);
        await set(stateRef, state);

        showMessage(`${formatDeviceName(device)} turned ${action}`, "success");
        updateDeviceStatus(device, action);
    } 
    catch (error) {
        console.error("Device control error:", error);
        showMessage(`Error: ${error.message}`, "error");
    }
}

// Refresh device status. When adding peripherals, add the device reading logic here
async function refreshStatus() {
    try {
        const heatingPadRef = ref(database, "heating_pad/state");
        const temperatureSensorRef = ref(database, "temperature_sensor/state");
        
        const heatingPadSnapshot = await get(heatingPadRef);
        const temperatureSensorSnapshot = await get(temperatureSensorRef);
        
        const heatingPadState = heatingPadSnapshot.exists() 
            ? (heatingPadSnapshot.val() === 1 ? "on" : "off") 
            : "unknown";
        const temperatureSensorState = temperatureSensorSnapshot.exists() 
            ? (temperatureSensorSnapshot.val() === 1 ? "on" : "off") 
            : "unknown";
        
        updateDeviceStatus("heating_pad", heatingPadState);
        updateDeviceStatus("temperature_sensor", temperatureSensorState);

        showMessage("Status updated", "success");
    } 
    catch (error) {
        console.error("Status refresh error:", error);
        showMessage(`Error: ${error.message}`, "error");
    }
}

/**
 * Update device status indicator in the UI
 * 
 * @param {string} device : Device identifier (ex: "heating_pad")
 * @param {string} state  : Device state (ex: "on", "off", or "unknown")
 * 
 * 
 * When adding a peripheral, add device ID mapping in the deviceId assignment
 */
function updateDeviceStatus(device, state) {
    const deviceId = device === "heating_pad" 
        ? "heating-pad" 
        : device === "temperature_sensor"
        ? "temperature-sensor"
        : null;
    
    if (!deviceId) {
        console.error("Unknown device for status update:", device);
        return;
    }
    
    const indicator = document.getElementById(`${deviceId}-indicator`);
    const statusText = document.getElementById(`${deviceId}-status`);

    if (!indicator || !statusText) {
        console.error(`Status elements not found for device: ${deviceId}`);
        return;
    }

    const normalizedState = typeof state === "string" ? state.toLowerCase() : "unknown";
    indicator.className = `status-indicator ${normalizedState}`;
    statusText.textContent = `Status: ${normalizedState.toUpperCase()}`;
}

// ========================================================================
//              VIRTUAL JOYSTICK CONTROL FOR CAMERA + LASER
// ========================================================================

function createJoystick(areaId, handleId, xPath, yPath) {
    const area = document.getElementById(areaId);
    const handle = document.getElementById(handleId);

    if (!area || !handle) return;

    const xRef = ref(database, xPath);
    const yRef = ref(database, yPath);

    let isActive = false;

    // Adding Throttle. Will test to see if this actually works with tower.
    const SEND_INTERVAL_MS = 50;
    let lastSendTime = 0;
    let lastSentX = 90;
    let lastSentY = 90;

    function updateFromClientCoords(clientX, clientY) {
        const now = Date.now();
        if (now - lastSendTime < SEND_INTERVAL_MS) {
            return;
        }
        lastSendTime = now;

        const rect = area.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = (clientX - centerX) / (rect.width / 2);
        let dy = (clientY - centerY) / (rect.height / 2);
        dx = Math.max(-1, Math.min(1, dx));
        dy = Math.max(-1, Math.min(1, dy));

        const maxOffset = rect.width * 0.3;
        const offsetX = dx * maxOffset;
        const offsetY = dy * maxOffset;
        handle.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;

        const xAngle = Math.round((dx + 1) * 90);
        const yAngle = Math.round((1 - dy) * 90);

        if (xAngle == lastSentX && yAngle == lastSentY) {
            return;
        }
        lastSentX = xAngle;
        lastSentY = yAngle;

        set(xRef, xAngle).catch((error) => {
            console.error(`Error writing x angle to ${xPath}:`, error);
        });
        set(yRef, yAngle).catch((error) => {
            console.error(`Error writing y angle to ${yPath}:`, error);
        });
    }

    function handlePointerDown(event) {
        isActive = true;
        if (event.type === "mousedown") {
            updateFromClientCoords(event.clientX, event.clientY);
        }
        else if (event.type === "touchstart" && event.touches[0]) {
            event.preventDefault();
            const t = event.touches[0];
            updateFromClientCoords(t.clientX, t.clientY);
        }
    }

    function handlePointerMove(event) {
        if (!isActive) return;

        if (event.type === "mousemove") {
            updateFromClientCoords(event.clientX, event.clientY);
        }
        else if (event.type === "touchmove" && event.touches[0]) {
            event.preventDefault();
            const t = event.touches[0];
            updateFromClientCoords(t.clientX, t.clientY);
        }
    }

    function handlePointerUp() {
        isActive = false;
        handle.style.transform = "translate(-50%, -50%)";

        set(xRef, 90).catch((error) => {
            console.error(`Error resetting x angle to ${xPath}:`, error);
        });
        set(yRef, 90).catch((error) => {
            console.error(`Error resetting y angle to ${yPath}:`, error);
        });

        lastSentX = 90;
        lastSentY = 90;
    }

    area.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    area.addEventListener("touchstart", handlePointerDown, {passive: false});
    window.addEventListener("touchmove", handlePointerMove, {passive: false});
    window.addEventListener("touchend", handlePointerUp);
    window.addEventListener("touchcancel", handlePointerUp);
}

// KEEP THIS CODE.
// Currently testing a throttled version of the joystick to reduce writes to firebase.
// function createJoystick(areaId, handleId, xPath, yPath) {
//     const area = document.getElementById(areaId);
//     const handle = document.getElementById(handleId);

//     if (!area || !handle) return;

//     // Pre-create refs for this joystick
//     const xRef = ref(database, xPath);
//     const yRef = ref(database, yPath);

//     let isActive = false;

//     function updateFromClientCoords(clientX, clientY) {
//         const rect = area.getBoundingClientRect();
//         const centerX = rect.left + rect.width / 2;
//         const centerY = rect.top + rect.height / 2;

//         // Normalize to -1..1
//         let dx = (clientX - centerX) / (rect.width / 2);
//         let dy = (clientY - centerY) / (rect.height / 2);
//         dx = Math.max(-1, Math.min(1, dx));
//         dy = Math.max(-1, Math.min(1, dy));

//         // Move handle visually around geometric center
//         const maxOffset = rect.width * 0.3;
//         const offsetX = dx * maxOffset;
//         const offsetY = dy * maxOffset;
//         handle.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;

//         // Map -1..1 to 0..180 (servo angles)
//         const xAngle = Math.round((dx + 1) * 90);   // -1..1 -> 0..180
//         const yAngle = Math.round((1 - dy) * 90);   // invert Y

//         set(xRef, xAngle).catch((error) => {
//             console.error(`Error writing x angle to ${xPath}:`, error);
//         });
//         set(yRef, yAngle).catch((error) => {
//             console.error(`Error writing y angle to ${yPath}:`, error);
//         });
//     }

//     function handlePointerDown(event) {
//         isActive = true;
//         if (event.type === "mousedown") {
//             updateFromClientCoords(event.clientX, event.clientY);
//         } else if (event.type === "touchstart" && event.touches[0]) {
//             event.preventDefault();
//             const t = event.touches[0];
//             updateFromClientCoords(t.clientX, t.clientY);
//         }
//     }

//     function handlePointerMove(event) {
//         if (!isActive) return;

//         if (event.type === "mousemove") {
//             updateFromClientCoords(event.clientX, event.clientY);
//         } else if (event.type === "touchmove" && event.touches[0]) {
//             event.preventDefault();
//             const t = event.touches[0];
//             updateFromClientCoords(t.clientX, t.clientY);
//         }
//     }

//     function handlePointerUp() {
//         isActive = false;

//         // Visually snap back to center
//         handle.style.transform = "translate(-50%, -50%)";

//         // ALSO send center position (90, 90) to this joystick's servo paths
//         set(xRef, 90).catch((error) => {
//             console.error(`Error resetting x angle to ${xPath}:`, error);
//         });
//         set(yRef, 90).catch((error) => {
//             console.error(`Error resetting y angle to ${yPath}:`, error);
//         });
//     }

//     // Start drag inside this joystick
//     area.addEventListener("mousedown", handlePointerDown);
//     window.addEventListener("mousemove", handlePointerMove);
//     window.addEventListener("mouseup", handlePointerUp);

//     // Touch events
//     area.addEventListener("touchstart", handlePointerDown, { passive: false });
//     window.addEventListener("touchmove", handlePointerMove, { passive: false });
//     window.addEventListener("touchend", handlePointerUp);
//     window.addEventListener("touchcancel", handlePointerUp);
// }

function initLaserJoystick() {
    // Uses laser DOM ids + laser RTDB paths
    createJoystick(
        "laser-joystick",
        "laser-joystick-handle",
        "laser_servo/x_angle",
        "laser_servo/y_angle"
    );
}

function initCameraButtons() {
    const upBtn = document.getElementById("camera-up-btn");
    const downBtn = document.getElementById("camera-down-btn");
    const leftBtn = document.getElementById("camera-left-btn");
    const rightBtn = document.getElementById("camera-right-btn");

    if (!upBtn || !downBtn || !leftBtn || !rightBtn) return;

    const xRef = ref(database, "camera_servo/x_angle");
    const yRef = ref(database, "camera_servo/y_angle");

    let x = 90;
    let y = 90;

    const STEP = 30;

    // Keep local values updated
    onValue(xRef, (s) => x = s.exists() ? s.val() : 90);
    onValue(yRef, (s) => y = s.exists() ? s.val() : 90);

    leftBtn.addEventListener("click", () => {
        set(xRef, Math.max(0, x - STEP));
    });

    rightBtn.addEventListener("click", () => {
        set(xRef, Math.min(180, x + STEP));
    });

    upBtn.addEventListener("click", () => {
        set(yRef, Math.min(180, y + STEP));
    });

    downBtn.addEventListener("click", () => {
        set(yRef, Math.max(0, y - STEP));
    });
}





// ============================================================================
//                              UTILITY FUNCTIONS
// ============================================================================
/**
 * Get ESP32 IP address from input field.
 * 
 * Note: I used this function for initial prototyping. This
 *       function is now depreciated since wireless connection
 *       over different networks works now.
 */
// Get ESP32 IP address from input field
// function getESP32IP() {
//     const ipInput = document.getElementById("esp32-ip");
//     if (!ipInput) return null;

//     const ip = ipInput.value.trim();
//     if (!ip) {
//         showMessage("Please enter ESP32 IP address", "error");
//         return null;
//     }
//     return ip;
// }

// Show temporary status message (used for debugging)
function showMessage(text, type) {
    const messageEl = document.getElementById("message");
    if (!messageEl) return;

    clearTimeout(messageTimeout);
    messageEl.textContent = text;
    messageEl.className = `status-message ${type}`;

    messageTimeout = window.setTimeout(() => {
        messageEl.textContent = "";
        messageEl.className = "status-message";
    }, 3000);
}

// Clear form message
function clearFormMessage(element) {
    if (!element) return;
    element.textContent = "";
    element.className = "form-message";
}

// Set form message with text and type
function setFormMessage(element, text, type = "error") {
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${type}`;
}

// Parse firebase authentication errors
function parseAuthError(error) {
    console.error("Full Firebase error:", error);
    if (!error || !error.code) {
        return "Unknown error occurred. Please check console for details.";
    }

    const code = String(error.code);
    const message = error.message || "";

    const errorMap = {
        "invalid-email": "Please enter a valid email address.",
        "invalid-credential": "Invalid email or password.",
        "user-disabled": "This account has been disabled.",
        "user-not-found": "No account found with this email.",
        "wrong-password": "Incorrect password.",
        "email-already-in-use": "An account with this email already exists.",
        "weak-password": "Password should be at least 6 characters.",
        "too-many-requests": "Too many failed attempts. Please try again later.",
        "operation-not-allowed": "This sign-in method is not enabled. Please contact support.",
        "network-request-failed": "Network error. Please check your internet connection.",
        "invalid-api-key": "Configuration error. Please contact support.",
        "app-not-authorized": "App not authorized. Please contact support.",
        "quota-exceeded": "Service temporarily unavailable. Please try again later.",
        "credential-already-in-use": "This credential is already associated with a different account.",
        "account-exists-with-different-credential": "An account already exists with a different sign-in method.",
        "invalid-argument": "Invalid input. Please check your email and password.",
        "missing-email": "Please enter an email address.",
        "missing-password": "Please enter a password.",
    };

    for (const [key, value] of Object.entries(errorMap)) {
        if (code.includes(key) || message.toLowerCase().includes(key)) {
            return value;
        }
    }

    return `Error: ${code}. ${message || "Please check console for details."}`;
}

// Format device name for UI display. 
function formatDeviceName(device) {
    switch (device) {
        case "heating_pad":
            return "Heating pad";
        case "temperature_sensor":
            return "Temperature sensor";
        // TO ADD A NEW PERIPHERAL: Add case here
        // case "water_pump":
        //     return "Water pump";
        default:
            return device;
    }
}

// ============================================================================
//                          GLOBAL ONCLICK FUNCTIONS
// ============================================================================
window.controlDevice = controlDevice;
window.refreshStatus = refreshStatus;
