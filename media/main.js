const vscode = acquireVsCodeApi();

// Получаем предыдущее состояние
const previousState = vscode.getState();
// Получаем сообщения для логов
let sftpMessages = previousState ? previousState.sftpMessages : [];
// Уменьшаем количество сообщений до 100
sftpMessages = sftpMessages.slice(-100);
// Сохраняем состояние
vscode.setState({ sftpMessages });

/**
 * Добавляет сообщение в лог расширения
 *
 * @param {Object} message объект-сообщение с типом и текстом
 */
function appendMessage(message) {
    const div = document.createElement("div");
    div.setAttribute("class", `sync-sftp-message ${message.type}`)
    let value = message.value.split('<br>')
    for (const element of value) {
        let br = document.createElement("br");
        div.append(element)
        div.append(br)
    }
    document.querySelector('#root').append(div)
    document.querySelector('.sync-sftp-message:last-of-type').scrollIntoView()
}
/**
 * Очищает лог от старых сообщений, если количество указано очищаем указаное количество сообщений сверху, иначе все что есть
 * @param {number} count количество удаляемых сообщений
 */
function clearDom(count = 0) {
    let highlightedItems = document.querySelectorAll("#root div");
    let countElementsToRemove = count;
    if (count === 0 ) {
        countElementsToRemove = highlightedItems.length;
    }
    let i = 0;
    highlightedItems.forEach((userItem) => {
        if (i < countElementsToRemove) {
            userItem.remove()
        }
        i++;
    });
}
// Добавляем в лог старые сообщения
for(const message of sftpMessages) {
    appendMessage(message)
}

// Добавляем слушателя для новых сообщений
window.addEventListener("message", (event) => {
    const message = event.data;
    console.log('SYNC-SFTP:' ,message);

    if (message.type !== 'clear') {
        // Добавления сообщения
        appendMessage(message)
        sftpMessages.push(message)
        if (sftpMessages.length > 100) {
            let countElementsToRemove = sftpMessages.length - 100;
            clearDom(countElementsToRemove)
        }
        sftpMessages = sftpMessages.slice(-100);
        vscode.setState({ sftpMessages });
    } else {
        // Очистка лога
        sftpMessages = [];
        vscode.setState({ sftpMessages });
        clearDom()
    }
});