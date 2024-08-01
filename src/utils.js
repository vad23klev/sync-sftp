const vscode = require('vscode');
const fs = require('fs');
const path = require('path')

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
    return '[' + now.getHours() + ':' + minutes.slice(-2) + ']: ';
}

exports.syncFile = function ({rootPath, ignorePatterns, remotePath, appendMessage, sftp, onIgnore}) {
    return async function(filename) {
        if (!match(filename, ignorePatterns)) {
            let time = timeString();
            console.log(filename);
            appendMessage({
                type: 'info',
                value: time + ' Change detected: ' + filename.replace(rootPath, '')
            })

            let isDirectory = false;
            const exists = fs.existsSync('./' + filename);
            let destination = remotePath + '/' + filename.replace(rootPath, '.');
            destination = destination.replace(/\\/g, '/');
            destination = destination.replace(/\/\/+/g, '/');

            if (exists) {
                appendMessage({
                    type: 'info',
                    value: time + ' Uploading to -> ' + destination
                })

                isDirectory = fs.lstatSync('./' + filename).isDirectory();
                if (isDirectory) {
                    const failed = []
                    const successful = []
                    await sftp.putDirectory(
                        './' + filename,
                        destination,
                        {
                            recursive: true,
                            concurrency: 5,
                            validate: function(itemPath) {
                                const baseName = path.basename(itemPath)
                                return !match(baseName, ignorePatterns) // do not allow node_modules
                            },
                            tick: function(localPath, remotePath, error) {
                                if (error) {
                                    failed.push(remotePath)
                                } else {
                                    successful.push(remotePath)
                                }
                            }
                        }
                    )
                    time = timeString();
                    for (const success of successful) {
                        appendMessage({
                            type: 'info',
                            value: time + ' Uploading to -> ' + success
                        })
                    }
                    for (const fail of failed) {
                        appendMessage({
                            type: 'error',
                            value: time + ' Uploading to -> ' + fail
                        })
                    }
                    appendMessage({
                        type: 'info-success',
                        value: time + ' Succesfully uploaded ' + successful.length + ' file(s)'
                    })
                } else {
                    await sftp.putFile('./' + filename, destination);
                }
            } else {
                appendMessage({
                    type: 'info',
                    value: time + ' Delete detected on ' + filename + '. Deleting server file -> ' + destination
                })
                sftp.execCommand('rm ' + destination,{ cwd:'/var/www' });
                sftp.execCommand('rm ' + destination + '/*',{ cwd:'/var/www' });
                sftp.execCommand('rmdir ' + destination, { cwd:'/var/www' });
            }
        } else {
            onIgnore(filename)
        }
    }
}