enum messageTypes {
    error= 'error',
    info= 'info',
    clear= 'clear',
    infoSuccess= 'info-success',
}

export class Messenger {
    appendMessage?: Function

    message(type: string, message: string) {
        if (this.appendMessage)
        this.appendMessage({type, value: message})
    }
    error(message: string) {
        this.message('error', message)
    }
    info(message: string) {
        this.message('info', message)
    }
    infoSuccess(message: string) {
        this.message('info-success', message)
    }
    clear() {
        this.message('clear', '')
    }

    setAppendMessage(appendMessage: Function) {
        this.appendMessage = appendMessage
    }
}