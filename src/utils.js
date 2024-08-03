const vscode = require('vscode');
const fs = require('fs');
const path = require('path')
const RJSON = require('relaxed-json');

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

exports.syncFile = function (data) {
    return async function(filename) {
        if (!match(filename, data.ignorePatterns)) {
            let time = timeString();
            console.log(filename);
            data.appendMessage({
                type: 'info',
                value: time + ' Change detected: ' + filename.replace(data.rootPath, '')
            })

            let isDirectory = false;
            const exists = fs.existsSync('./' + filename);
            let destination = data.remotePath + '/' + filename.replace(data.rootPath, '.');
            destination = destination.replace(/\\/g, '/');
            destination = destination.replace(/\/\/+/g, '/');

            if (exists) {
                data.appendMessage({
                    type: 'info',
                    value: time + ' Uploading to -> ' + destination
                })

                isDirectory = fs.lstatSync('./' + filename).isDirectory();
                if (isDirectory) {
                    const failed = []
                    const successful = []
                    await data.sftp.putDirectory(
                        './' + filename,
                        destination,
                        {
                            recursive: true,
                            concurrency: 5,
                            validate: function(itemPath) {
                                const baseName = path.basename(itemPath)
                                return !match(baseName, data.ignorePatterns) // do not allow node_modules
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
                        data.appendMessage({
                            type: 'info',
                            value: time + ' Uploading to -> ' + success
                        })
                    }
                    for (const fail of failed) {
                        data.appendMessage({
                            type: 'error',
                            value: time + ' Uploading to -> ' + fail
                        })
                    }
                    data.appendMessage({
                        type: 'info-success',
                        value: time + ' Succesfully uploaded ' + successful.length + ' file(s)'
                    })
                } else {
                    await data.sftp.putFile('./' + filename, destination);
                }
            } else {
                data.appendMessage({
                    type: 'info',
                    value: time + ' Delete detected on ' + filename + '. Deleting server file -> ' + destination
                })
                data.sftp.execCommand('rm ' + destination,{ cwd:'/var/www' });
                data.sftp.execCommand('rm ' + destination + '/*',{ cwd:'/var/www' });
                data.sftp.execCommand('rmdir ' + destination, { cwd:'/var/www' });
            }
        } else {
            data.onIgnore(filename)
        }
    }
}

exports.loadConfig = async function(rootPath) {
    let configText = fs.readFileSync(rootPath + '/.sync-sftp.json')
    let ignorePatterns = [];
    let host = '';
    let username = '';
    let password = '';
    let port = 22;
    let remotePath = '';
    let errors = []
    let options = {}
    try {
        let options = Buffer.from(configText).toString('utf8')
        const config = RJSON.parse(options);
        host = config.host;
        username = config.user;

        ignorePatterns = config.ignore_regexes;
        remotePath = config.remote_path;

        // If port is set in config file (Like in Sublime) then use that, default is 22
        if (config.port) {
            port = config.port;
        }

        // If password is set in config file (Like in Sublime) then use that
        if (config.password) {
            password = config.password;
        } else {
            errors.push('Error: Unable to retrieve password from sftp-config.json or keychain!')
        }
    } catch (e) {
        errors.push('Error: Unable to parse sftp-config.json!')
    }

    if (errors.length === 0) {
        options = {
            host: host, // required
            username: username, // required
            port: port,
            autoConfirm: true,
        };
        if (password && password.length > 0) {
            options['password'] = password;
        }
    }
    return {
        sftpOptions: options,
        ignorePatterns,
        remotePath,
        errors,
        rootPath
    }
}