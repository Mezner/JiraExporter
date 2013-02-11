var TicketParser = function(selectors) {
    /*
     * Parses the ticket summary from the page.
     */
    parse = function() {
        console.log("parsing ticket summary");
        return {
            href: location.href,
            origin: location.origin,
            title: parseAndTrimSelector(selectors.summary),
            type: parseAndTrimSelector(selectors.type),
            key: parseAndTrimSelector(selectors.key),
            fixfor: parseAndTrimSelectorArray(selectors.fixFor),
            versions: parseAndTrimSelectorArray(selectors.versions),
            description: $(selectors.description).html()
        };
    };

    /*
     * Sends the ticket back to the plugin for processing.
     */
    sendSummary = function(ticketSummary) {
        console.log("sending document to popup");
        chrome.extension.sendRequest(ticketSummary);
    };

    parseAndTrimSelector = function(selector) {
        return $.trim($(selector).text());
    };

    parseAndTrimSelectorArray = function(selector) {
        arr = []
        var selection = $(selector);
        $.each(selection, function () {
            arr.push(parseAndTrimSelector(this));
        });
        return arr;
    };

    return {
        parse: parse,
        sendSummary: sendSummary
    };
};

pageSelectors = {
    summary: "#summary-val",
    key: "#key-val",
    description: "#description-val",
    type: "#type-val",
    fixFor: "#fixfor-val a",
    versions: "#versions-val a"
};

parser = new TicketParser(pageSelectors);
ticketSummary = parser.parse();
parser.sendSummary(ticketSummary);
