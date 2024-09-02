const vscode = acquireVsCodeApi();
// Check if we have an old state to restore from
const previousState = vscode.getState();
let sftpMessages = previousState ? previousState.sftpMessages : [];
function appendMessage(message) {
    const div = document.createElement("div");
    div.setAttribute("class", `sync-sftp-message ${message.type}`)
    div.append(message.value)
    document.querySelector('#root').append(div)
    document.querySelector('.sync-sftp-message:last-of-type').scrollIntoView()
}
for(const message of sftpMessages) {
    appendMessage(message)
}
window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type !== 'clear') {
        appendMessage(message)
        sftpMessages.push(message)
        vscode.setState({ sftpMessages });
    } else {
        sftpMessages = [];
        vscode.setState({ sftpMessages });
        let highlightedItems = document.querySelectorAll("#root div");
        highlightedItems.forEach((userItem) => {
            userItem.remove()
        });
    }
});