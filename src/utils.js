"use strict";

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
            this.thisWebview.onDidChangeVisibility((event) => {
                if (this?.thisWebview?.webview && this?.thisWebview?.visible) {
                    for(let messageElement of this.messages) {
                        this.thisWebview.webview.postMessage(messageElement);
                    }
                    this.messages = [];
                }
            })
        },
        postMessageToWebview: function(message) {
            if (this?.thisWebview?.webview && this?.thisWebview?.visible) {
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
exports.updateStatusBarItem = function(myStatusBarItem, syncer, webviewProvider) {
    const isConnected = syncer.isConnected()
    let icon = isConnected
        ? '$(check)'
        : '$(circle-slash)';
    icon = syncer.isPaused ? '$(debug-pause)' : icon
    const color = !isConnected || syncer.isPaused
    ? new vscode.ThemeColor('errorForeground') : undefined;
    let hoverMessage = isConnected
    ? 'SyncSFTP is connected'
    : 'SyncSFTP is not connected';
    hoverMessage = syncer.isPaused ? 'SyncSFTP is paused' : hoverMessage
    myStatusBarItem.color = color;
    myStatusBarItem.tooltip = hoverMessage;
    myStatusBarItem.text = `${icon} SyncSFTP($(info) ${webviewProvider.messages.length} messages)`;
    myStatusBarItem.show();
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
/**
 * @typedef syncFileData
 * @param {Configurator} configurator
 * @param {Messenger} messenger
 * @param {Syncer} syncer
 * @param {Function} onIgnore
 */
/**
 *
 * @param {syncFileData} data
 * @returns
 */
exports.syncFile = function (data) {
    return async function(filename) {
        if (!match(filename, data.configurator.config.ignorePatterns)) {
            let time = timeString();
            data.messenger.info(time + ' Change detected: ' + filename.replace(data.configurator.config.rootPath, ''))
            let isDirectory = false;
            const exists = fs.existsSync('./' + filename);
            let destination = data.configurator.config.remotePath + '/' + filename.replace(data.configurator.config.rootPath, '.');
            destination = destination.replace(/\\/g, '/');
            destination = destination.replace(/\/\/+/g, '/');

            if (exists) {
                isDirectory = fs.lstatSync('./' + filename).isDirectory();
                data.messenger.info(time + ' Uploading to -> ' + destination)
                data.syncer.uploadFile(destination, filename, isDirectory)
            } else {
                data.messenger.info(time + ' Delete detected on ' + filename + '. Deleting server file -> ' + destination)
                data.syncer.deleteFile(destination)
            }
        } else {
            data.onIgnore(filename)
        }
    }
}
