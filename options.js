async function saveOptions() {
    let val = document.querySelector("#enableBeta").checked;
    if (val) {
        await saveSetting("beta", "true");
    } else {
        await deleteSetting("beta");
    }
}
  
async function restoreOptions() {
    let beta = await getSetting("beta", "");
    if (beta == "true") {
        document.querySelector("#enableBeta").checked = true;
    } else {
        document.querySelector("#enableBeta").checked = false;
    }
}

// restore already saved options
document.addEventListener("DOMContentLoaded", restoreOptions);

// catch changes and save settings
document.querySelector("#enableBeta").addEventListener("click", saveOptions);