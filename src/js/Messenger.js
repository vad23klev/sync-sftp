"use strict";
class Messenger {
    appendMessage = null
    message(type, message) {
        if (this.appendMessage)
        this.appendMessage({type, value: message})
    }
    error(message) {
        this.message('error', message)
    }
    info(message) {
        this.message('info', message)
    }
    infoSuccess(message) {
        this.message('info-success', message)
    }
    clear() {
        this.message('clear')
    }

    setAppendMessage(appendMessage) {
        this.appendMessage = appendMessage
    }
}

module.exports = Messenger;