window.addEventListener("load", onLoad);

async function onLoad() {
    // helper to access elements by id name
    var ui = {};
    for (let element of document.querySelectorAll("[id]")) {
        ui[element.id] = element;
    }

    ui.invite.onclick = async function() {
        window.close();
        var backgroundWindow  = await browser.runtime.getBackgroundPage();
        await backgroundWindow.showInvite();
        return true;
    };

    ui.settings.onclick = async function() {
        // browser.runtime.sendMessage("showConfig"); // example (received in background.js)
        window.close();
        var backgroundWindow  = await browser.runtime.getBackgroundPage();
        await backgroundWindow.showConfig();
        return true;
    };

    // add translation to elements with data-locale
    document.querySelectorAll('[data-locale]').forEach(elem => {
      elem.innerText = browser.i18n.getMessage(elem.dataset.locale)
    });
}

// example async call to some web URL!
// Important: Needs "<all_urls>" permission in manifest file!
// Call like this:
// var ret = await call("https://portal.regify.com/regify2.php");
async function call(url) {
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
      console.log(err)
    }
  }