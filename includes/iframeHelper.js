/**
 * This module provides functions to facilitate communication between
 * a parent window and an iframe using the postMessage API 
 * ("parent" and "iframe").
 * 
 * @usage 
 * Initialize the communication by calling `initComm_parent()` 
 * in the parent window and `initComm_iframe()` in iframe site.
 * Then implement worker functionality in processParentResponse()
 * and processIframeResponse() functions based on the below templates.
 * 
 * Call the functions like the commented example functions below
 * in this file
 * 
 * 2025 regify GmbH
 * https://www.regify.com
 * @author Volker Schmid
 */

/**
 * Helper function to create listener in parent
 */
function initComm_parent() {
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'from_iframe') {
            const response = await processParentResponse(event.data.payload);
            event.ports[0]?.postMessage({
                type: 'parent_response',
                payload: response
            });
        }
    });
    
}

/**
 * Helper function to create listener in iframe
 */
function initComm_iframe() {
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'from_parent') {
            const response = await processIframeResponse(event.data.payload);
            event.ports[0]?.postMessage({
                type: 'iframe_response',
                payload: response
            });
        }
    });
}

/**
 * Parent-side function to communicate with iframe
 * 
 * @param {string} iframeId id of the iframe element
 * @param {object} message message to send (eg object or string)
 * @param {number=} timeoutMs timeout in milliseconds
 * @returns {promise} promise that resolves with the response from the iframe
 * @throws {Error} if the iframe is not found or if the response is an error or timeout
 */
async function askIframe(iframeId, message, timeoutMs = 5000) {
    const iframe = document.getElementById(iframeId);
    if (!iframe?.contentWindow) {
        throw new Error('iframe element not found');
    }

    const channel = new MessageChannel();
    let responsePromise;

    // Setup temporary listener for awaiting response
    const handleMessage = async ({ data }) => {
        if (data.type === 'iframe_response') {
            window.removeEventListener('message', handleMessage);
            channel.port1.close();
            
            if (data.payload instanceof Error) {
                throw data.payload;
            }
            return data.payload;
        }
    };

    window.addEventListener('message', handleMessage);

    try {
        iframe.contentWindow.postMessage({
            type: 'from_parent',
            payload: message
        }, '*', [channel.port2]);

        responsePromise = new Promise((resolve, reject) => {
            channel.port1.onmessage = async ({ data }) => {
                resolve(data.payload);
            };
        });

        return await Promise.race([
            responsePromise,
            new Promise((_, reject) => 
                setTimeout(() => 
                    reject(new Error('Timeout waiting for iframe response')), timeoutMs)
            )
        ]);
    } finally {
        window.removeEventListener('message', handleMessage);
    }
}

/**
 * Iframe-side function to communicate with parent
 * 
 * @param {object} message message to send (eg object or string)
 * @param {number=} timeoutMs timeout in milliseconds
 * @returns {promise} promise that resolves with the response from the parent
 * @throws {Error} if the parent is not responding or there is an error or timeout
 */
async function askParent(message, timeoutMs = 5000) {
    const channel = new MessageChannel();
    let responsePromise;

    // Setup temporary listener for awaiting response
    const handleMessage = async ({ data }) => {
        if (data.type === 'parent_response') {
            window.removeEventListener('message', handleMessage);
            channel.port1.close();
            
            if (data.payload instanceof Error) {
                throw data.payload;
            }
            return data.payload;
        }
    };

    window.addEventListener('message', handleMessage);

    try {
        window.parent.postMessage({
            type: 'from_iframe',
            payload: message
        }, '*', [channel.port2]);

        responsePromise = new Promise((resolve, reject) => {
            channel.port1.onmessage = async ({ data }) => {
                resolve(data.payload);
            };
        });

        return await Promise.race([
            responsePromise,
            new Promise((_, reject) => 
                setTimeout(() => 
                    reject(new Error('Timeout waiting for parent response')), timeoutMs))
        ]);
    } finally {
        window.removeEventListener('message', handleMessage);
    }
}

// Helper function template for processing responses in parent window
async function template_processParentResponse(payload) {
    try {
        // check payload.action and do something like
        // fetching data from an API
        const response = await fetch('https://api.example.com/process', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        return result; // or promise!
    } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
}

// Helper function template for processing responses in iframe site/code
async function template_processIframeResponse(payload) {
    try {
        // check payload.action and do something like
        // reading from IndexedDB
        const db = await openDB('myDB', 1);
        const tx = db.transaction('data', 'readwrite');
        const store = tx.objectStore('data');
        
        await store.put(payload);
        return true; // or promise!
    } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
    }
}


// EXAMPLE USAGE
/*
// In parent page
// -------------------------------------------------

initComm_parent(); // needed once to set up parent listener

try {
    const result = await askIframe('myIframe', { action: 'getData' });
    console.log(result);
} catch (error) {
    console.error('Communication failed:', error.message);
}

// In iframe
// -------------------------------------------------

initComm_iframe(); // needed once to set up iframe listener

try {
    const result = await askParent({ action: 'processData', data: 'hello' });
    console.log(result);
} catch (error) {
    console.error('Communication failed:', error.message);
}
*/