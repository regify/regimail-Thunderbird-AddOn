const DEBUG_VERB = 1;
const DEBUG_WARN = 2;
const DEBUG_CRIT = 3;

// Connect "send regimail" button with functionality
browser.composeAction.onClicked.addListener(async (tab) => {
    await CreateRegimail(tab);
});

/*
browser.runtime.onMessage.addListener((sentMessage) => { 
    console.log('got the message: ', sentMessage);
    if (sentMessage === "showConfig") { showConfig(); }
    if (sentMessage === "showInvite") { showInvite(); }
});
*/

/**
 * Create a regimail from given compose window
 * @param {object} tab TB tab of compose window
 * @returns 
 */
async function CreateRegimail(tab) {
    let details = await browser.compose.getComposeDetails(tab.id);
    debug(DEBUG_VERB, "Message details:", details);

    if (details.bcc.length > 0) {
        browser.regiapi.alert(lg("noBCC"));
        return false;
    }

    if (details.subject == "") {
        browser.regiapi.alert(lg("noEmptySubject"));
        return false;
    }

    var recipients = details.to.concat(details.cc); // use both TO and CC together
    if (recipients.length < 1) {
        browser.regiapi.alert(lg("oneRecipient"));
        return false;
    }

    var client = await browser.regiapi.getRegifyExecutable();
    if (client == "") {
        browser.regiapi.alert(lg("noRegifyClient"));
        return false;
    }

    var home = await browser.regiapi.getRegifyHomeDirectory();
    if (!home) { 
        debug(DEBUG_CRIT, lg("noHome"));
        browser.regiapi.alert(lg("noHome"));
        return false; 
    }
    debug(DEBUG_VERB, "Home Dir: [" + home + "]");

    var tempFolder = await browser.regiapi.createTempFolder(true);
    if (!tempFolder) {
        debug(DEBUG_CRIT, lg("noTemp"));
        browser.regiapi.alert(lg("noTemp"));
        return false; 
    }
    debug(DEBUG_VERB, "Temp Folder: [" + tempFolder + "]");

    var files = [];
    var attachments = await browser.compose.listAttachments(tab.id);
    if (attachments) {
        for (let i=0; i<attachments.length; i++) {
            try {
                var f = await getFile(attachments[i]);
            } catch(e) {
                debug(DEBUG_WARN, "Attachment "+attachments[i].name+" can not get resolved! .getFile() failed.");
                debug(DEBUG_WARN, "Possibly a bug in TB WebExtensions Interface: "+
                "https://thunderbird.topicbox.com/groups/addons/Teac40c9048e3ebcb-M7b37d571438ae0d9a16c453e/issues-with-listattachments-and-getfile");
                browser.regiapi.alert(lg("failedToGetAttachment"));
                return false;
            }
            var tempFile = tempFolder + attachments[i].name;
            var blob = await f.arrayBuffer();
            var t = await browser.regiapi.writeFileBinary(tempFile, blob);
            if (t != f.size) {
                debug(DEBUG_WARN, "File sizes differ for attachment "+attachments[i].name+"! Failed to save!");
                browser.regiapi.alert(lg("failedAttachVerify", attachments[i].name));
            }
            files.push(tempFile);
        }
    }
    debug(DEBUG_VERB, "Files to attach:", files);

    // Parse body
    var bodyFile = tempFolder + "message_body";
    if (details.isPlainText) {
        // The message is being composed in plain text mode.
        bodyFile = bodyFile + ".txt";
        await browser.regiapi.writeFileText(bodyFile, details.body);
    } else {
        // The message is being composed in HTML mode. Parse the message into an HTML document.
        bodyFile = bodyFile + ".html";
        await browser.regiapi.writeFileText(bodyFile, details.body);
    }
    debug(DEBUG_VERB, "Body file: ["+bodyFile+"]");

    // Create regimail
    let senderName = extractName(details.from);
    let senderAddress = extractMail(details.from);

    var rgfFile = await SendRegimail(tempFolder, details.subject, recipients, bodyFile, files, senderAddress);
    if (!rgfFile) {
        browser.regiapi.alert(lg("creationFailed"));
        debug(DEBUG_VERB, "Cleanup [" + tempFolder + "]");
        await browser.regiapi.deleteFolder(tempFolder);
        return false;
    }

    // move regimail outside of temp folder (allowing the folder to become deleted)
    var rgfTempFolder = await browser.regiapi.createTempFolder(false);
    debug(DEBUG_VERB, "RGF temp folder: ["+rgfTempFolder+"]");
    var rgfNew = rgfTempFolder + getFilePart(rgfFile);
    debug(DEBUG_VERB, "Move RGF to ["+rgfNew+"]");
    try {
        await browser.regiapi.moveFile(rgfFile, rgfNew);
        rgfFile = rgfNew;
        debug(DEBUG_VERB, "Remember ["+rgfFile+"] for delete on exit");
        browser.regiapi.deleteFileOnExit(rgfFile);
    } catch(e) {
        debug(DEBUG_WARN, "Failed to move ["+rgfFile+"] to ["+rgfNew+"]");
    }

    // Remove attachments
    for (let i = attachments.length-1; i >= 0; i--) { 
        try {
            debug(DEBUG_VERB, "Removing attachment ["+attachments[i].name+"]...");
            let ret = await browser.compose.removeAttachment(tab.id, attachments[i].id);
        } catch(e) {
            debug(DEBUG_CRIT, "Failed to remove attachment. No sending!", e);
            return false;
        }
    }

    // Replace body now
    if (details.isPlainText) {
        // The message is being composed in plain text mode.
        debug(DEBUG_VERB, 
            "Adding plaintext body [" + home + "regify_default_message.txt]...");
        let txt = await browser.regiapi.readFileText(home + "regify_default_message.txt");
        txt = txt.replace("@SENDERNAME@", senderName);
        txt = txt.replace("@SENDERADDRESS@", senderAddress);
        browser.compose.setComposeDetails(tab.id, { plainTextBody: txt });
    } else {
        // The message is being composed in HTML mode. Parse the message into an HTML document.
        debug(DEBUG_VERB, 
            "Adding html body ["+home + "regify_default_message.htm]...");
        let txt = await browser.regiapi.readFileText(home + "regify_default_message.htm");
        txt = txt.replace("@SENDERNAME@", senderName);
        txt = txt.replace("@SENDERADDRESS@", senderAddress);
        browser.compose.setComposeDetails(tab.id, { body: txt });
    }

    // Attach regimail
    debug(DEBUG_VERB, "Attaching RGF file ["+rgfFile+"]...");
    /* The following does not work because TB WebExtensions ignore the type
    rgfContent = await browser.regiapi.readFileBinary(rgfFile);
    var attachment = new File([rgfContent], getFilePart(rgfFile), { type: "application/vnd.regify" });
    await browser.compose.addAttachment(tab.id, { file: attachment, name: getFilePart(rgfFile) });
    */

    /* Workaround with WebExperiments */
    browser.regiapi.addAttachment(tab.windowId, rgfFile);

    // Send it
    debug(DEBUG_VERB, "Now sending...");
    var success = await browser.compose.sendMessage(tab.id, { mode: "sendNow" }); // trigger sending!
    if (success) {
        // Finally, clean-up the temp folder and it's content
        debug(DEBUG_VERB, "Cleanup [" + tempFolder + "]");
        await browser.regiapi.deleteFolder(tempFolder);
    } else {
        debug(DEBUG_WARN, "sendMessage() returned no success!");
    }
}

/**
 * Open regify client with config window
 * @returns
 */
async function showConfig() {
    var client = await browser.regiapi.getRegifyExecutable();
    if (client == "") {
        browser.regiapi.alert(lg("noRegifyClient"));
        return false;
    }
    var Arguments = new Array("-C", "thunderbird", "-b");
    await browser.regiapi.execute(client, Arguments, false);
    return true;
}

/**
 * Open regify client to start an invitation
 * @returns 
 */
async function showInvite() {
    var client = await browser.regiapi.getRegifyExecutable();
    if (client == "") {
        browser.regiapi.alert(lg("noRegifyClient"));
        return false;
    }
    var Arguments = new Array("-I");
    await browser.regiapi.execute(client, Arguments, false);
    return true;
}

/**
 * Output for debug
 * @param {int} level debug level
 * @param  {...any} message one or more messages
 */
function debug(level, ...message) {
    message.forEach(msg => {
        switch (level) {
            case DEBUG_VERB:
                console.log(msg);
                break;
            case DEBUG_WARN:
                console.warn(msg);
                break;
            case DEBUG_CRIT:
                console.error(msg);
                break;
            default:
                break;
        } 
    });
}

// Backward-compatible drop-in replacement for the deprecated
// ComposeAttachment.getFile() function (<=TB91). Instead calling
// attachment.getFile(), call getFile(attachment).
// https://thunderbird.topicbox.com/groups/addons/T290381ad849307a1-Mda1465bd6388138d5a893ff8/request-to-deprecate-composeattachment-getfile
async function getFile(attachment) {
    var test = "getAttachmentFile" in browser.compose
    if (test) {
        return await messenger.compose.getAttachmentFile(attachment.id);
    }
    return await attachment.getFile();
}

/**
 * Returns the file part of a given file path
 * @param {string} path file path
 * @returns {string} filename
 */
function getFilePart(path) {
    return path.split('\\').pop().split('/').pop();
}

/**
 * This function will make sure that only a valid SMTP email
 * address is returned. Works with email in two kind of
 * display:
 * 1) "mirja@company.de"
 * 2) "Mirja Böse <mirja@company.de>"
 * Will return "mirja@company.de" in both cases.
 * Will return false in case of an invalid email address.
 * @param {string} mailaddress 
 * @returns {string} address
 */
function extractMail(mailaddress) {
    if (mailaddress.substr(-1,1) == ">") {
        // Extract mail part between <>
        let regex = /<(.*)>/g;
        let matches = regex.exec(mailaddress);
        mailaddress = matches[1];
    }
    // validate against anystring@anystring.anystring
    let re = /\S+@\S+\.\S+/;
    if (re.test(mailaddress)) {
        return mailaddress;
    }
    return false;
}

/**
 * Extract the name of a sender if given mailadress is 
 * in format "Mirja Böse <mirja@company.de>".
 * 
 * If no sender name is available, it returns the
 * given mailaddress as fallback.
 * 
 * @param {string} mailaddress 
 * @returns {string} name
 */
function extractName(mailaddress) {
    let regex = /^(.*)<.*>/g;
    let matches = regex.exec(mailaddress);
    try {
        let name = matches[1];
        if (name != "" || name !== undefined) {
            return name.trim();
        }
    } catch(e) {
        // fallback
        return mailaddress;
    }
}

function b64encode(str) {
    let encode = encodeURIComponent(str).replace(/%([a-f0-9]{2})/gi, (m, $1) => String.fromCharCode(parseInt($1, 16)))
    return btoa(encode)
}

async function SendRegimail(tempFolder, strSubject, arrRecipients, strBodyFile, arrAttachments, strSender) {
    // Join, clean and validate recipients
    strSender = strSender + "";
    var recipients = [];
    arrRecipients.forEach(rec => {
        rec = extractMail(rec);
        if (rec == false || rec == "") {
            browser.regiapi.alert(lg("failedRecipientParse"));
            return false;
        }
        recipients.push(rec);
    });
    strRecipients = recipients.join(",");
    strOutFile = tempFolder + "regify_TNR.rgf";
    strSender = extractMail(strSender);

    var Arguments = new Array("-M", "-b",
                              "-o", b64encode(strOutFile), 
                              "-i", b64encode(strBodyFile),
                              "-s", b64encode(strSubject), 
                              "-r", b64encode(strRecipients),
                              "-d", "5"
                             );
    if (strSender != "") {
        Arguments = Arguments.concat([ "-c", b64encode(strSender)]);
    }
    Arguments = Arguments.concat(arrAttachments);

    debug(DEBUG_VERB, "Call arguments:", Arguments);
    var client = await browser.regiapi.getRegifyExecutable();
    if (client == "") {
        debug(DEBUG_CRIT, "Missing regify client executable!");
        return false;
    }
    var ret = await browser.regiapi.execute(client, Arguments, true);
    if (!ret) {
        debug(DEBUG_CRIT, "Calling the regify executable failed!");
        return false;
    }

    var files = await browser.regiapi.readDirectory(tempFolder);
    var rgfFile;
    files.forEach(file => {
        if (file.substr(-4, 4) == ".rgf") {
            rgfFile = file;
        }
    });
    if (!rgfFile) {
        debug(DEBUG_CRIT, "Found no RGF file in temp directory!");
        return false;
    }
    debug(DEBUG_VERB, "Found RGf file ["+rgfFile+"]");
    return rgfFile;
}

function lg(identifier, ...replace) {
    var text = browser.i18n.getMessage(identifier);
    for (let i = 0; i < replace.length; i++) {
        text = text.replace("%"+(i+1), replace[i]);
    }
    return text;
}