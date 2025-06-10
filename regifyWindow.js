/// <reference path="background.js" />
/// <reference path="includes/utils.js" />
/// <reference path="includes/iframeHelper.js" />

window.addEventListener("load", onLoad);

/**
 * Initialize this regify AddOn window:
 * - Enable window size remembering
 * - Initialize iframe communication
 * - Load regify application
 * -- URL based on availability of a div with id "divSend" or "divRead"
 */
async function onLoad() {
    setInterval(() => {
        // Save the window position and size every 2 seconds
        saveSetting("width", window.innerWidth);
        saveSetting("height", window.innerHeight);
        saveSetting("top", window.screenTop);
        saveSetting("left", window.screenLeft);
    }, 2000);

    initComm_parent(); // init iframe communication

    var backgroundWindow = await browser.runtime.getBackgroundPage();
    if (!backgroundWindow) {
        console.error("No background window found");
        return;
    }

    const send = document.getElementById("divSend");
    const regifyFrame = document.getElementById("regifyFrame");
    const regifyUrl = await backgroundWindow.getRegifyUrl();
    if (regifyUrl === null) {
        console.error("No working regify URL found");
        regifyFrame.srcdoc = `<html>
        <body>
            <h1>Unable to reach the regify application servers.</h1>
            <p>Please make sure your internet connection is enabled and you're
            not blocking any internet traffic for this application.</p>
            <p>It also might be because of some maintenance. If you are sure
            that the internet connection is fine, try it again later.</p>
        </body>
        </html>`;
        return;
    }
    if (send) {
        regifyFrame.setAttribute("src",
            regifyUrl + "compose_thunderbird.html");
    } else {
        regifyFrame.setAttribute("src",
            regifyUrl + "read_thunderbird.html");
    }
}

/**
 * Process any requests comming from the iframe (regimail app).
 * 
 * NOTE: 
 * The "mode" value of the payload is important (defaults ro "read"):
 * - If it is "read", we are in the message view mode using browser.messages object. 
 * - If it is "compose", we are in the compose mode browser.compose.
 * 
 * Unfortunatelly, the two objects do not share the same API, so we sometimes
 * need to check the mode to call the right function. Check the functions.
 * 
 * @param {object} payload Received payload from iframe
 * @returns  {Promise} Promise that resolves with the function result
 */
// eslint-disable-next-line no-unused-vars
async function processParentResponse(payload) {
    console.debug("processParentResponse", payload); // TODO: Maybe remove?
    var contextObj = null;
    var contextId = null;

    var backgroundWindow = await browser.runtime.getBackgroundPage();
    if (!backgroundWindow) {
        console.error("No background window found");
        return Promise.reject(new Error("No background window found"));
    }

    // FUNCTIONS WHICH DONT NEED A CONTEXT OBJECT

    if (payload.op === "close") {
        backgroundWindow.closeRegifyWindow();
        return true;
    }

    if (payload.op === "showNotifier") {
        notify(payload.message, payload.isError);
        return true;
    }

    if (payload.op === "reply") {
        await browser.compose.beginNew(null, {
            to: payload.recipients,
            subject: payload.subject,
            body: payload.body.replaceAll('\n', "<br>")
        });
        return true;
    }

    if (payload.op === "setSetting") {
        if (payload.value === null) {
            deleteSetting(payload.key);
            return true;
        }
        saveSetting(payload.key, payload.value);
        return true;
    }

    if (payload.op === "getSetting") {
        return getSetting(payload.key);
    }

    if (payload.op === "getAll") {
        return getSettingAll();
    }

    if (payload.op === "getHostInfo") {
        var developer = await getSetting("developer", "");
        var beta = await getSetting("beta", "");
        var myMode = "release";
        if (beta == "true") { myMode = "beta"; }
        if (developer != "") { myMode = "developer"; }

        var machineId = await getSetting("machineId");
        if (!machineId) {
            machineId = crypto.randomUUID();
            await saveSetting('machineId', machineId);
        }
        const plat = await browser.runtime.getPlatformInfo();
        var os = plat.os;
        if (os === "win") { os = "windows"; }

        const version = await browser.runtime.getManifest().version;

        var hostInfo = {
            "os": os,
            "version": version,
            "mode": myMode,
            "deviceName": "thunderbird AddOn",
            "deviceID": machineId,
            "proxy": ""
        };
        return hostInfo;
    }

    // NOW FUNCTIONS WHO NEED A CONTEXT OBJECT

    const mode = payload.mode || "read"; // alternative "compose"
    if (mode === "read") {
        contextObj = browser.messages;
        contextId = backgroundWindow.globalSelectedMessageId;
    } else {
        contextObj = browser.compose;
        contextId = backgroundWindow.globalCurrentTabId;
    }
    if (contextId === null || contextId === undefined) {
        console.error("No composeTab/messageId selected");
        return Promise.reject(new Error("No composeTab/messageId selected"));
    }

    try {
        if (payload.op === "getAttachmentFilename") {
            const id = payload.id;
            const attachments = await contextObj.listAttachments(contextId);
            if (attachments.length < id) {
                return "";
            }
            return attachments[id - 1].name;
        }

        if (payload.op === "getAttachmentBinary") {
            const id = payload.id;
            var file = null;
            const attachments = await contextObj.listAttachments(contextId);
            if (attachments.length < id) {
                return "";
            }
            if (mode === "read") {
                file = await contextObj.getAttachmentFile(contextId, attachments[id - 1].partName);
            } else {
                file = await contextObj.getAttachmentFile(attachments[id - 1].id);
            }
            if (!file) {
                console.error(`File [${attachments[id - 1].partName}] not found`);
                return null;
            }
            return new Uint8Array(await file.arrayBuffer());
        }

        if (payload.op === "getSubject") {
            if (mode === "read") {
                const msg = await contextObj.get(contextId);
                return msg.subject;
            }
            const msg = await contextObj.getComposeDetails(contextId);
            return msg.subject;
        }

        if (payload.op === "getRecipients") {
            if (mode === "read") {
                const msg = await contextObj.get(contextId);
                var recipients = msg.recipients.concat(msg.ccList); // use both TO and CC together
                recipients.forEach((email, index) => {
                    recipients[index] = extractMail(email);
                });
                return recipients; // use both TO and CC together
            }
            const msg = await contextObj.getComposeDetails(contextId);
            var recipients = msg.to.concat(msg.cc); // use both TO and CC together
            recipients.forEach((email, index) => {
                recipients[index] = extractMail(email);
            });
            return recipients; // use both TO and CC together
        }

        if (payload.op === "getSender") {
            if (mode === "read") {
                const msg = await contextObj.get(contextId);
                const sender = browser.messengerUtilities.parseMailboxString(msg.author);
                return extractMail(sender.email);
            }
            const msg = await contextObj.getComposeDetails(contextId);
            return extractMail(msg.from);
        }

        if (mode === "compose" && payload.op === "getBodyHTML") {
            const msg = await contextObj.getComposeDetails(contextId);
            if (msg.isPlainText) {
                // The message is being composed in plain text mode. Make it HTML.
                return "\n<html>\n<head><meta charset=\"utf-8\"></head>\n<body>\n" + msg.body + "\n</body>\n</html>\n";
            }
            return msg.body;
        }

        if (mode === "compose" && payload.op === "getBodyPlain") {
            const msg = await contextObj.getComposeDetails(contextId);
            return msg.plainTextBody;
        }

        if (mode === "compose" && payload.op === "setAttachment") {
            // First remove all attachments
            const attachments = await contextObj.listAttachments(contextId);
            for (let i = attachments.length - 1; i >= 0; i--) {
                try {
                    console.debug("Removing attachment [" + attachments[i].name + "]...");
                    await browser.compose.removeAttachment(contextId, attachments[i].id);
                } catch (e) {
                    console.debug("Failed to remove attachment. No sending!", e);
                    return false;
                }
            }

            // attach new RGF attachment
            const blob = new Blob([new Uint8Array(payload.attachment)], { type: 'application/vnd.regify' });
            const file = new File([blob], getFilePart(payload.filename), { type: 'application/vnd.regify' });
            await contextObj.addAttachment(contextId, { file: file, name: getFilePart(payload.filename) });
            return true;
        }

        if (mode === "compose" && payload.op === "setBodyHTML") {
            const msg = await contextObj.getComposeDetails(contextId);
            if (msg.isPlainText) {
                const pBody = await browser.messengerUtilities.convertToPlainText(payload.body, { flowed: true });
                await contextObj.setComposeDetails(contextId, { plainTextBody: pBody });
            } else {
                await contextObj.setComposeDetails(contextId, { body: payload.body });
            }
            return true;
        }

        console.warn(`Unsupported processParentResponse() function with mode [${mode}]. Ignoring it.`, payload);

        return null; // or promise!
    } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
}