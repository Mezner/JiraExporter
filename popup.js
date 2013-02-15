/*
 * Handles direct interactions with Evernote
 */
var EvernoteRepository = function () {
    var authToken;
    var noteStore;
    var sourceApplication = "JiraExporter";

    init = function () {
        $(function () {
            authToken = Eventnote.Auth.get_auth_token();
            var notesTransport = new Thrift.Transport(Eventnote.Auth.oauth.getParameter(Eventnote.Auth.note_store_url_param));
            var notesProtocol = new Thrift.Protocol(notesTransport);
            noteStore = new NoteStoreClient(notesProtocol, notesProtocol);
            if (!noteStore) {
                console.log("connection failure during getting note store");
            }
        });
    };

    getNotebooks = function () {
        return noteStore.listNotebooks(authToken);
    };

    getTags = function () {
        return noteStore.listTags(authToken);
    };

    createTag = function (tag) {
        return noteStore.createTag(authToken, tag);
    };

    createNote = function(key, title, description, notebookGuid, tagGuids) {
        var notebook = noteStore.getDefaultNotebook(authToken, note);
        var note = new Note();
        note.title = title;
        var content = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            + "<!DOCTYPE en-note SYSTEM \"http://xml.evernote.com/pub/enml2.dtd\"><en-note>";
        content += description;
        content += "</en-note>";
        note.content = content;
        note.tagGuids = tagGuids;
        note.notebookGuid = notebookGuid;
        noteAttributes = new NoteAttributes();
        noteAttributes.sourceApplication = sourceApplication;
        noteAttributes.applicationData = new LazyMap();
        noteAttributes.applicationData.fullMap = {};
        noteAttributes.applicationData.fullMap[key] = key;
        note.attributes = noteAttributes;
        localStorage["jiraNotebook"] = notebookGuid;
        var response = noteStore.createNote(authToken, note);
    }

    return {
        init: init,
        createNote: createNote,
        getTags: getTags,
        getNotebooks: getNotebooks,
        createTag: createTag
    }
};

/*
 * Handles all logic within the popup.
 */
var Popup = function(selectors, repository) {
    var ticket = null;
    var tags = null;
    var ticketTagNames = [];

    /*
     * Sanitize options used when cleaning the description.
     */
    var cleanOptions = {
        allowedTags: [
            'a', 'abbr', 'acronym', 'address', 'area', 'b', 'bdo',
            'big', 'blockquote', 'br', 'caption', 'center', 'cite',
            'code', 'col', 'colgroup', 'dd', 'del', 'dfn', 'div', 'dl',
            'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'hr', 'i', 'img', 'ins', 'kbd', 'li', 'map', 'ol', 'p',
            'pre', 'q', 's', 'samp', 'small', 'span', 'strike',
            'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
            'th', 'thead', 'title', 'tr', 'tt', 'u', 'ul', 'var', 'xmp'
        ],
        allowedAttributes: [
        ],
        format: true
    };

    /*
     * Initializes the popup. This will begin the process of processing
     * a Jira ticket and listening for incoming events from the page
     * parser.
     */
    init = function() {
        $(function () {
            console.log("popup init");
            addTicketEventListener();
            addCreateNoteEventListener();
            addCancelNoteEventListener();
            addReadyScriptExecution();
            loadNotebooks();
            loadTags();
        });
    };

    /*
     * Adds onTicketEvent to the extension request listeners list.
     */
    addTicketEventListener = function () {
        chrome.extension.onRequest.addListener(onTicketEvent);
    };

    /*
     * Adds click event listener to the createNote button.
     */
    addCreateNoteEventListener = function() {
        $(selectors.createNote).click(createNoteClicked);
    };

    /*
     * Adds click event listener to the cancelNote button.
     */
    addCancelNoteEventListener = function() {
        $(selectors.cancelNote).click(cancelNoteClicked);
    };

    loadNotebooks = function() {
        notebooks = repository.getNotebooks();
        notebookGuid = localStorage["jiraNotebook"];
        $.each(notebooks, function() {
            notebookOption = $("<option />").val(this.guid).text(this.name);
            if (this.guid == notebookGuid) {
                notebookOption.attr('selected', 'selected');
            }
            $(selectors.notebook).append(notebookOption);
        });
    };

    /*
     * Loads tags from the user's Evernote account.
     */
    loadTags = function() {
        tags = repository.getTags();
    };

    /*
     * Binds executePageScript to jQuery document ready.
     */
    addReadyScriptExecution = function() {
        $(executePageScript);
    };

    cancelNoteClicked = function() {
        window.close();
    };

    createNoteClicked = function() {
        console.log("create note clicked");
        $(selectors.createNote).unbind();
        $(selectors.createNote).attr("disabled, disabled");
        noteTitle = ticket.key + " - " + ticket.title;
        descriptionHeader = '<h1><a href="' + ticket.href + '">'
            + ticket.key + '</a> - ' + ticket.title + '</h1>';
        cleanedDescription = formatDescription(ticket);
        cleanedDescription = descriptionHeader + cleanedDescription + "<hr />";
        tagGuids = getTagGuids();
        notebookGuid = $(selectors.notebook).val();
        repository.createNote(ticket.key, noteTitle, cleanedDescription, notebookGuid, tagGuids);
        window.close();
    };

    getTagGuids = function() {
        console.log("get note guids");
        tagGuids = [];
        $.each(ticketTagNames, function() {
            tagName = this;
            tagExists = false;
            $.each(tags, function() {
                if (this.name.toLowerCase() == tagName.toLowerCase()) {
                    tagGuids.push(this.guid);
                    tagExists = true;
                    return false;
                }
            });
            if (!tagExists) {
                console.log("creating tag: " + tagName);
                newTag = new Tag();
                newTag.name = tagName;
                newTag = repository.createTag(newTag);
                tagGuids.push(newTag.guid);
            }
        });
        return tagGuids;
    };

    /*
     * Processes the parsed ticket.
     */
    onTicketEvent = function(parsedTicket) {
        console.log("ticket event");
        ticket = parsedTicket;
        noteTitle = ticket.key + " - " + ticket.title;
        getTagNames(ticket);
        $(selectors.key).val(ticket.key);
        $(selectors.title).val(noteTitle);
        $(selectors.tags).val(ticketTagNames.join(', '));
    };

    getTagNames = function(ticket) {
        addToTagNames(ticket.type);
        addArrayToTagNames(ticket.fixfor);
        addArrayToTagNames(ticket.versions);
    };

    addArrayToTagNames = function(tagNames) {
        $.each(tagNames, function () {
            addToTagNames(this);
        });
    };

    addToTagNames = function(tagName) {
        console.log("tag:" + tagName);
        console.log(ticketTagNames.join());
        if ($.inArray(tagName, ticketTagNames) == -1)
        {
            ticketTagNames.push(tagName);
        }
    };

    formatDescription = function(ticket) {
        description = formatRelativeLinks(ticket);
        return cleanDescription(description);
    };

    /*
     * Formats relative links in description to be absolute.
     */
    formatRelativeLinks = function(ticket) {
        description = $("<div>" + ticket.description + "</div>");
        $("a", description).attr("href", function(){
            var existingLink = $(this).attr("href");
            // terribly naive implementation
            if (existingLink && existingLink.substring(0, 4) != "http") {
                return ticket.origin + existingLink;
            }
            return existingLink;
        });
        return description.html();
    };

    cleanDescription = function(description) {
        cleanedDescription = $.htmlClean(description, cleanOptions);
        return cleanedDescription;
    };


    /*
     * Executes the page script responsible for parsing ticket details.
     */
    executePageScript = function() {
        console.log("execute page script");
        chrome.windows.getCurrent(function (currentWindow) {
            chrome.tabs.query({active: true, windowId: currentWindow.id},
                function(activeTabs) {
                    chrome.tabs.executeScript(
                        activeTabs[0].id, {
                            file: 'lib/jquery-1.9.0.js',
                            allFrames: false
                        }
                    );
                    chrome.tabs.executeScript(
                        activeTabs[0].id, {
                            file: 'page.js',
                            allFrames: false
                        }
                    );
                }
            );
        });
    };

    return {
        init : init
    }
};

popupSelectors = {
    key: "#key",
    title: "#title",
    tags: "#tags",
    notebook: "#notebook",
    createNote: "#createNote",
    cancelNote: "#cancelNote"
};
var evernoteRepository = new EvernoteRepository();
evernoteRepository.init();
var popup = new Popup(popupSelectors, evernoteRepository);
popup.init();
