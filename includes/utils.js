/**
 * This module provides utility functions.
 * 
 * 2025 regify GmbH
 * https://www.regify.com
 * @author Volker Schmid
 */

// oxlint-disable no-unused-vars

const DEBUG_VERB = 1;
const DEBUG_WARN = 2;
const DEBUG_CRIT = 3;

/**
 * Save some settings value
 * 
 * @param {string} key key
 * @param {*} value value
 * @returns {Promise} success
 */
async function saveSetting(key, value) {
    const settings = {};
    settings[key] = value;
    return browser.storage.local.set(settings);
}

/**
 * Retrieve some settings value.
 * Return default if not existing.
 * 
 * @param {string} key key
 * @param {*} defaultValue default value
 * @returns {Promise} value
 */
async function getSetting(key, defaultValue = null) {
    var defKey = { [key]: defaultValue }; // set default
    return browser.storage.local.get(defKey).then((result) => {
        return result[key] !== undefined ? result[key] : defaultValue;
    });
}

/**
 * Retriev all available settings and return them as object.
 * 
 * @returns {Promise} all settings as object
 */
async function getSettingAll() {
    return browser.storage.local.get();
}

/**
 * Deletes a setting previously created
 * 
 * @param {string} key key
 * @returns {Promise} success
 */
async function deleteSetting(key) {
    return browser.storage.local.remove(key);
}

/**
 * Output for debug
 * @param {int} level debug level
 * @param  {...any} message one or more messages
 */
async function debug(level, ...message) {
    let debug = await getSetting("debug", "");
    if (debug !== "true" && level != DEBUG_CRIT) {
        // debug mode not enabled, do not output
        // anything except of CRIT
        return;
    }
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
                console.log(msg);
                break;
        } 
    });
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
 * example async call to some web URL!
 * Important: Needs "<all_urls>" permission in manifest file!
 * Call like this:
 * @example var ret = await callRest("https://some-provider.com/regify2.php");
 * @param {string} url Website URL to call
 * @returns {string} json
 */
async function callRest(url) {
    try {
      const myHeader = new Headers()
      myHeader.append('Content-Type', 'application/json')

      const myRequest = new Request(url, {
        method: 'GET',
        headers: myHeader,
        credentials: 'include',
        cache: 'no-store'
      })

      const response = await fetch(myRequest)
      const json = await response.json()
      return json;
    } catch (err) {
      debug(DEBUG_CRIT, err)
    }
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
    const m = parseMail(mailaddress);
    if (m === null) { return "?"; }
    return m.email;
}

/**
 * Parsing an email address "Name <email> or just "email".
 * If no name is contained or empty, it will return email as name, too!
 * Therefore, both name and email always contain something!
 * 
 * @param {string} eMail EMail entry like "Name <email> or just "email"
 * @returns {object} Object with name and email properties or null
 */
function parseMail(eMail) {
    const simplePattern = /([^\s@]+@[^\s@]+\.[^\s@]+)/; // just "mail"
    const fullNamePattern = /([^<]+)<([^\s@]+@[^\s@]+\.[^\s@]+)>/; // "name <mail>"
    let match;
    
    // Try to match the full format first
    if ((match = eMail.match(fullNamePattern)) !== null) {
        return {
            name: match[1].trim(),
            email: match[2]
        };
    }
    
    // If not found, try the simple format
    if ((match = eMail.match(simplePattern)) !== null) {
        return {
            name: match[1],
            email: match[1]
        };
    }
    return null;
}

/**
 * Displays a generic thunderbird message notification in regimail style.
 * 
 * @param {string} message Message to display
 * @param {boolean} [isError=true] If true, the message will be displayed as an error
 */
function notify(message, isError = false) {
    browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("images/ico_regimail_32x32.png"),
        title: lg("extensionName"),
        message: message
    });
}

/**
 * Get translated string from identifier.
 * 
 * @param {string} identifier Text identifier
 * @param  {...any} replace Replacing tags %1, %2, ... with this content
 * @returns {string} Translated string
 */
function lg(identifier, ...replace) {
    var text = browser.i18n.getMessage(identifier);
    for (let i = 0; i < replace.length; i++) {
        text = text.replace("%" + (i + 1), replace[i]);
    }
    return text;
}