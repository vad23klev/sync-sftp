const vscode = require('vscode');
const fs = require('fs');

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}


function createWebviewHTML(webview, extensionUri) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.js'));
    const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'main.css'));

    const nonce = getNonce();
    return (
        `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>"Sync SFTP</title>
                <link href="${styleMainUri}" rel="stylesheet">
            </head>
            <body>
                <div id="root" class="sync-sftp-messages"></div>
            </body>
            <script nonce=${nonce} src="${scriptUri}"></script>
            </html>
        `
    );
}

exports.createWebViewProvider = function(extensionUri) {
    return {
        thisWebview:null,
        extensionUri,
        messages: [],
        resolveWebviewView:function(thisWebview){
            this.thisWebview = thisWebview
            thisWebview.webview.options={enableScripts:true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri]}
            thisWebview.webview.html= createWebviewHTML(thisWebview.webview, this.extensionUri);
        },
        postMessageToWebview: function(message) {
            if (this.thisWebview && this.thisWebview.webview) {
                for(let messageElement of this.messages) {
                    this.thisWebview.webview.postMessage(messageElement);
                }
                this.messages = [];
                this.thisWebview.webview.postMessage(message);
            } else {
                this.messages.push(message)
            }
        },
    };
}
const match = exports.match  = function (item, ignorePatterns) {
    let matches = false;
    for (const element of ignorePatterns) {
        const res = item.match(element);
        if (res) {
            matches = true;
            break;
        }
    }
    return matches
}

const timeString = exports.timeString = function () {
    const now = new Date();
    const minutes = '0' + now.getMinutes();
    return now.getHours() + ':' + minutes.slice(-2);
}


const syncDirectory = function (localFilename, destination, filter, sftp, appendMessage) {
    let filename = '';
    let isDirectory = false;

    destination = destination.replace(/\\/g, '/');
    destination = destination.replace(/\/\/+/g, '/');

    sftp.raw('mkdir ' + destination);
    const dirList = fs.readdirSync('./' + localFilename);

    for (const element of dirList) {
        filename = element;
        if (filter(filename)) {
            isDirectory = fs.lstatSync(localFilename + '/' + filename).isDirectory();
            if (isDirectory) {
                syncDirectory(localFilename + '/' + filename, destination, filter, sftp, appendMessage);
            } else {
                appendMessage({
                    type: 'info',
                    value: 'Uploading to -> ' + destination
                })
                sftp.put(localFilename + '/' + filename, destination);
            }
        }
    }
};

exports.syncFile = function ({filter, rootPath, ignorePatterns, remotePath, appendMessage, sftp}) {
    return function(filename) {
        if (!match(filename, ignorePatterns)) {
            const time = timeString();

            appendMessage({
                type: 'info',
                value: time + ' Change detected: ' + filename
            })

            let isDirectory = false;
            const exists = fs.existsSync('./' + filename);
            let destination = remotePath + '/' + filename.replace(rootPath, '');
            destination = destination.replace(/\\/g, '/');
            destination = destination.replace(/\/\/+/g, '/');

            if (exists) {
                appendMessage({
                    type: 'info',
                    value: time + ' Uploading to -> ' + destination
                })

                isDirectory = fs.lstatSync('./' + filename).isDirectory();
                if (isDirectory) {
                    syncDirectory(filename, destination, filter, sftp, appendMessage);
                } else {
                    sftp.put('./' + filename, destination);
                }
            } else {
                appendMessage({
                    type: 'info',
                    value: time + ' Delete detected on ' + filename + '. Deleting server file -> ' + destination
                })
                sftp.rm(destination);
                sftp.raw('rm ' + destination + '/*');
                sftp.raw('rmdir ' + destination);
            }

        }
    }
}