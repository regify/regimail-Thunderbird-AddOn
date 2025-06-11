async function saveOptions() {
    let val = document.querySelector("#enableBeta").checked;
    if (val) {
        await saveSetting("beta", "true");
    } else {
        await deleteSetting("beta");
    }
    val = document.querySelector("#enableDebug").checked;
    if (val) {
        await saveSetting("debug", "true");
    } else {
        await deleteSetting("debug");
    }
}
  
async function restoreOptions() {
    let beta = await getSetting("beta", "");
    if (beta == "true") {
        document.querySelector("#enableBeta").checked = true;
    } else {
        document.querySelector("#enableBeta").checked = false;
    }
    let debug = await getSetting("debug", "");
    if (debug == "true") {
        document.querySelector("#enableDebug").checked = true;
    } else {
        document.querySelector("#enableDebug").checked = false;
    }
}

// restore already saved options
document.addEventListener("DOMContentLoaded", restoreOptions);

// catch changes and save settings
document.querySelector("#enableBeta").addEventListener("click", saveOptions);
document.querySelector("#enableDebug").addEventListener("click", saveOptions);