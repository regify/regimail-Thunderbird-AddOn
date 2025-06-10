/// <reference path="includes/utils.js" />

// eslint-disable-next-line no-unused-vars
var globalCurrentTabId = null;
var globalRegifyWin = null;
var globalSelectedMessageId = null;

// ---------------------- EVENT HANDLERS ------------------------

// Connect "send regimail" button with functionality
browser.composeAction.onClicked.addListener(async (tab) => {
    await CreateRegimail(tab);
});

// Connect "regimail" button with functionality
browser.browserAction.onClicked.addListener(async (tab) => {
    await readRegimail(tab);
});

messenger.browserAction.disable();

// Watch any selection change and store the last selected messageId
browser.mailTabs.onSelectedMessagesChanged.addListener(async (tab, selectedMessages) => {
    try {
        globalSelectedMessageId = selectedMessages["messages"][0].id;
        if (await getRGFAttachment(globalSelectedMessageId) === null) {
            globalSelectedMessageId = null;
            console.log(`Selected message ID: none`);
            await messenger.browserAction.disable();
            return;
        }
        console.log(`Selected message ID: ${globalSelectedMessageId}`);
        await messenger.browserAction.enable();
    } catch (e) {
        globalSelectedMessageId = null;
        console.log(`Selected message ID: none (after error!)`);
        await messenger.browserAction.disable();
    }
});

// ----------------- REGULAR CODE -------------------

/**
 * Opens a window with given url
 * @param {string} url url to open
 */
async function showRegifyWin(url) {
    if (await isRegifyWinOpen()) {
        // close the previous window
        console.log("Closing existing regify window");
        await closeRegifyWindow();
    }
    globalRegifyWin = await browser.windows.create({
        url: url,
        type: "popup",
        width: await getSetting("width", 600),
        height: await getSetting("height", 600),
        top: await getSetting("top", null),
        left: await getSetting("left", null)
    });
    // console.log("Opened Window", globalRegifyWin, url);
}

/**
 * Check if regify window is already open
 * @returns {bool} if regify win is open
 */
async function isRegifyWinOpen() {
    if (globalRegifyWin == null) {
        return false;
    }
    try {
        await browser.windows.get(globalRegifyWin.id);
    } catch (e) {
        globalRegifyWin = null;
        return false;
    }
    return true;
}

/**
 * Close regify window if open
 */
async function closeRegifyWindow() {
    if (await isRegifyWinOpen() == false) {
        return;
    }
    try {
        await browser.windows.remove(globalRegifyWin.id);
    } catch (e) {
        // ignore
    }
    globalRegifyWin = null;
}

/**
 * Determines the base URL based on app settings. 
 * Production and Beta URLs are tested against fallback numbers 
 * (apps1 to apps3.regify.com).
 * 
 * @returns {Promise} regify base URL including last slash
 */
async function getRegifyUrl() {
    let developer = await getSetting("developer", ""); // "subdomain:port" or ""
    if (developer !== "") {
        // developer mode
        var domain = "";
        var port = -1;
        try {
            const parts = developer.split(':');
            if (parts.length !== 2) {
                notify(`Invalid developer mode format. Use "subdomain:port"`, true);
                throw new Error('Invalid developer mode format. Use "subdomain:port"');
            }
            domain = parts[0];
            port = parseInt(parts[1], 10);
            if (isNaN(port) || port < 0 || port > 65535) {
                notify(`Port number must be a valid integer between 0 and 65535`, true);
                throw new Error('Port number must be a valid integer between 0 and 65535');
            }

            let response = await fetch(`https://${domain}.regify.com:${port}/check.html`);
            if (response.ok) {
                return `https://${domain}.regify.com:${port}/`;
            }
        } catch (e) {
            console.error(e);
        }
        notify(`Unable to connect to https://${domain}.regify.com:${port}/check.html. 
            Therefore I continue without developer domain…`,
            true);
    }

    let defaultUrlPart = "client";
    let beta = await getSetting("beta", "");
    if (beta == "true") {
        // beta mode (apps1 only)
        defaultUrlPart = "client-beta";
    }

    // Try up to 3 urls
    for (let i = 1; i <= 3; i++) {
        let url = `https://apps${i}.regify.com/${defaultUrlPart}/`;
        try {
            let response = await fetch(url + "check.html");
            if (response.ok) {
                return url;
            }
        } catch (e) {
            console.warn(e);
        }
    }
    // nothing found :-(
    console.error("No accessible regify server found");
    return null;
}

/**
 * Checks if given message contains a regify file (.rgf or .rgp).
 * Returns the attachment object or null.
 * 
 * @param {string} messageId MessageId
 * @returns {object} attachment object or null
 */
async function getRGFAttachment(messageId) {
    if (messageId === null) { return null; }

    let attachments = await browser.messages.listAttachments(messageId);
    for (let att of attachments) {
        if (att.name.endsWith(".rgf") || att.name.endsWith(".rgp")) {
            return att;
        }
    }
    return null;
}

/**
 * Uses the global selected message to check for a regify attachment
 * and then shows the regify window to open and display it.
 * 
 * @returns {Promise} void
 */
async function readRegimail() {
    if (globalSelectedMessageId === null) {
        console.log("No message selected")
        return;
    }

    var rgfFile = await getRGFAttachment(globalSelectedMessageId)
    if (rgfFile === null) {
        // not a regimail
        notify(lg("noRegimail"));
        return;
    }

    showRegifyWin("regifyReadWindow.html");
}

/**
 * Create a regimail from given compose window tab.
 * 
 * @param {object} tab tab object of compose window to create regimail from.
 * @returns 
 */
async function CreateRegimail(tab) {
    globalCurrentTabId = tab.id;
    let details = await browser.compose.getComposeDetails(tab.id);
    // debug(DEBUG_VERB, "Message details:", details);
    // debug(DEBUG_VERB, "Tab ID: " + globalCurrentTabId);

    if (details.bcc.length > 0) {
        notify(lg("noBCC"), true);
        return false;
    }

    if (details.subject == "") {
        notify(lg("noEmptySubject"), true);
        return false;
    }

    var recipients = details.to.concat(details.cc); // use both TO and CC together
    if (recipients.length < 1) {
        notify(lg("oneRecipient"), true);
        return false;
    }

    showRegifyWin("regifySendWindow.html");
}