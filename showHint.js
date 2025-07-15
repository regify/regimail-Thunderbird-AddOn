async function showHint() {
    try {
        let body = document.body.innerHTML;

        // Check for typical regimail message template header.
        // Not reliable at all, but I found no other reliable source.
        // It is impossible to access the mail object.
        // The callback to the main window failed?
        // Accessing the DOM does not work for the attachments.
        // (07/2025 VS)
        if (body.search("regimail - confidential") < 0 &&
            body.search("regimail - vertrauliche") < 0 &&
            body.search("regimail - message") < 0 &&
            body.search("regify<sup>®</sup> -") < 0 &&
            body.search("regify® -") < 0
            ) {
            return;
        }

        // Thunderbird browser or messenger object not available.
        // So I need to use standard stuff...
        const systemLanguage = navigator.language.substring(0,2).toLowerCase();
        var hint = `This is probably a regimail. To open it, select the message and click on the <b>regimail</b> button in the menu bar.`;
        if (systemLanguage == "de") {
            hint = `Dies ist vermutlich eine regimail. Zum öffnen klicken Sie bei ausgewählter Nachricht in der Menüleiste den <b>regimail</b>-Knopf.`;
        }
        if (systemLanguage == "fr") {
            hint = `Probablement un regimail. Pour l'ouvrir, sélectionnez le message dans la barre de menu et cliquez sur le bouton <b>regimail</b>.`;
        }
        if (systemLanguage == "zh") {
            hint = `这很可能是regimail邮件。要打开它，请选择该邮件并点击菜单栏中的<b>regimail</b>按钮。`;
        }

        // add hint!
        body = `<div class="rgfHint">${hint}</div>\n` + body;

        document.body.innerHTML = body;
    } catch (e) {
        console.error(e);
    }
}

showHint();