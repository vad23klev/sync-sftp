const vscode = require('vscode');
const watch = require('node-watch');
const utils = require('./utils');
const {NodeSSH} = require('node-ssh')
const ping = require('ping');

let watcher = null
let statusBarInterval = null

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "sync-sftp" is now active!');

    let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    let configLoad = false
    let configCorrect = false
    let config = {}
    let sftp = null;
    let uploadSyncData = {}
    let reUploadSyncData = {}
    let watcherSyncData = {}
    let uploadWithError = []

    function updateStatusBarItem() {
        const isConnected = configLoad && configCorrect && sftp && sftp.isConnected()
        const icon = isConnected
            ? '$(check)'
            : '$(circle-slash)';
        const color = isConnected
        ? undefined
        : new vscode.ThemeColor('errorForeground');
        const hoverMessage = isConnected
        ? 'SyncSFTP is connected'
        : 'SyncSFTP is not connected';
        myStatusBarItem.color = color;
        myStatusBarItem.tooltip = hoverMessage;
        myStatusBarItem.text = `${icon} SyncSFTP`;
        myStatusBarItem.show();
    }
    function runWatcher() {
        let onIgnore = () => {}
        watcherSyncData = {
            rootPath: config.rootPath,
            ignorePatterns: config.ignorePatterns,
            remotePath: config.remotePath,
            appendMessage,
            sftp,
            onIgnore
        }
        const syncFileWatcher = utils.syncFile(watcherSyncData);
        // Initiate the watcher
        watcher = watch(
            config.rootPath,
            {
                recursive: true,
                filter: function (filename) {
                    // Don't watch file if it matches 'ignore_regexes'
                    return !utils.match(filename, config.ignorePatterns)
                },
            },
            function (env, filename) {
                if (!sftp.isConnected()) {
                    appendMessage({
                        type: 'error',
                        value: 'Can\'t connect to server'
                    })
                    uploadWithError.push(filename)
                    return
                }
                syncFileWatcher(filename)
            }
        );
    }
    updateStatusBarItem()
    statusBarInterval = setInterval(updateStatusBarItem, 1000)
    String.prototype.replaceAll = function (search, replacement) {
        const target = this;
        return target.replace(new RegExp(search, 'g'), replacement);
    };

    const webviewProvider = utils.createWebViewProvider(context.extensionUri)
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("sync-sftp.logView", webviewProvider)
    );
    const appendMessage = (message) => webviewProvider.postMessageToWebview(message)

    utils.loadConfig(vscode.workspace.workspaceFolders[0].uri.path).then((data) => {
        config = data
        if (config.errors.length) {
            for(let error of config.errors) {
                appendMessage({
                    type: 'error',
                    value: error
                })
            }
        } else {
            appendMessage({
                type: 'clear'
            })
            appendMessage({
                type: 'info-success',
                value: 'Watching directory: ' + config.rootPath
            })
            configLoad = true
            configCorrect = true
            ping.promise.probe(config.sftpOptions.host, {timeout: 2}).then((result) => {
                if (!result.alive) {
                    appendMessage({
                        type: 'error',
                        value: 'Can\'t connect to server'
                    })
                } else {
                    sftp = new NodeSSH();
                    sftp.connect(config.sftpOptions).then(() => {
                        appendMessage({
                            type: 'info-success',
                            value: 'Config load success: ' + config.rootPath
                        })
                        runWatcher();
                    }, (error)=> {
                        console.log("Something's wrong")
                        console.log(JSON.stringify(error))
                    })
                }
            })
        }
    })

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    const clear = vscode.commands.registerCommand('sync-sftp.clearLog', function () {
        appendMessage({
            type: 'clear'
        })
        appendMessage({
            type: 'info-success',
            value: 'Watching directory: ' + config.rootPath
        })
    });
    const upload = vscode.commands.registerCommand('sync-sftp.upload', function (info, allSelections) {
        if (!configLoad) {
            appendMessage({
                type: 'error',
                value: 'Config not loaded yet, please wait!'
            })
        }
        if (!configCorrect) {
            appendMessage({
                type: 'error',
                value: 'Config incorrect, please fix it!'
            })
        }
        if (info && info.scheme === 'file' && configLoad && configCorrect) {
            let onIgnore = (filename) => {
                const time = utils.timeString();
                appendMessage({
                    type: 'error',
                    value: time + 'Trying to upload ignored file: ' + filename
                })
            }
            uploadSyncData = {
                rootPath: config.rootPath,
                ignorePatterns: config.ignorePatterns,
                remotePath: config.remotePath,
                appendMessage,
                sftp,
                onIgnore
            }
            if (!sftp || !sftp.isConnected()) {
                appendMessage({
                    type: 'error',
                    value: 'Can\'t connect to server'
                })
                for (let file of allSelections) {
                    let filename = file.path
                    uploadWithError.push(filename)
                }
                return
            }
            const syncFileCommand = utils.syncFile(uploadSyncData);
            for (let file of allSelections) {
                let filename = file.path
                // Upload if it doesn't match the ignorePatterns
                syncFileCommand(filename)
            }
        }
    });
    const reload = vscode.commands.registerCommand('sync-sftp.reloadConfig', function () {
        configLoad = false
        configCorrect = false
        utils.loadConfig(vscode.workspace.workspaceFolders[0].uri.path).then((data) => {
            config = data
            if (config.errors.length) {
                for(let error of config.errors) {
                    appendMessage({
                        type: 'error',
                        value: error
                    })
                }
            } else {
                appendMessage({
                    type: 'clear'
                })
                configLoad = true
                configCorrect = true
                appendMessage({
                    type: 'info-success',
                    value: 'Watching directory: ' + config.rootPath
                })
                ping.promise.probe(config.sftpOptions.host, {timeout: 2}).then((result) => {
                    if (!result.alive) {
                        appendMessage({
                            type: 'error',
                            value: 'Can\'t connect to server'
                        })
                    } else {
                        if (!sftp) {
                            sftp = new NodeSSH()
                        }
                        sftp.connect(config.sftpOptions).then(() => {

                            watcherSyncData.rootPath = config.rootPath
                            watcherSyncData.ignorePatterns = config.ignorePatterns
                            watcherSyncData.remotePath = config.remotePath
                            watcherSyncData.sftp = sftp
                            uploadSyncData.rootPath = config.rootPath
                            uploadSyncData.ignorePatterns = config.ignorePatterns
                            uploadSyncData.remotePath = config.remotePath
                            uploadSyncData.sftp = sftp
                            reUploadSyncData.rootPath = config.rootPath
                            reUploadSyncData.ignorePatterns = config.ignorePatterns
                            reUploadSyncData.remotePath = config.remotePath
                            reUploadSyncData.sftp = sftp
                            if (!watcher) {
                                runWatcher()
                            }
                            appendMessage({
                                type: 'info-success',
                                value: 'Config reload success: ' + config.rootPath
                            })
                        },
                        (error)=> {
                            console.log("Something's wrong")
                            console.log(JSON.stringify(error))
                        })
                    }
                })
            }
        })
    });
    const reconnect = vscode.commands.registerCommand('sync-sftp.reconnect', function () {
        if (!configLoad) {
            appendMessage({
                type: 'error',
                value: 'Config not loaded yet, please wait!'
            })
        }
        if (!configCorrect) {
            appendMessage({
                type: 'error',
                value: 'Config incorrect, please fix it!'
            })
        }
        if (configLoad && configCorrect) {
            ping.promise.probe(config.sftpOptions.host, {timeout: 2}).then((result) => {
                if (!result.alive) {
                    appendMessage({
                        type: 'error',
                        value: 'Can\'t connect to server'
                    })
                } else {
                    if (!sftp) {
                        sftp = new NodeSSH()
                    }
                    sftp.connect(config.sftpOptions).then(() => {
                        watcherSyncData.sftp = sftp
                        uploadSyncData.sftp = sftp
                        reUploadSyncData.sftp = sftp
                        if (!watcher) {
                            runWatcher()
                        }
                        appendMessage({
                            type: 'info-success',
                            value: 'Reconnect successful: ' + config.rootPath
                        })
                    },
                    (error)=> {
                        console.log("Something's wrong")
                        console.log(JSON.stringify(error))
                    })
                }
            })
        }
    });
    const reUpload = vscode.commands.registerCommand('sync-sftp.reupload', function () {
        if (!configLoad) {
            appendMessage({
                type: 'error',
                value: 'Config not loaded yet, please wait!'
            })
        }
        if (!configCorrect) {
            appendMessage({
                type: 'error',
                value: 'Config incorrect, please fix it!'
            })
        }
        if (uploadWithError.length === 0) {
            appendMessage({
                type: 'error',
                value: 'Nothing to upload!'
            })
        }

        if (!sftp || !sftp.isConnected()) {
            appendMessage({
                type: 'error',
                value: 'Can\'t connect to server'
            })
            return
        }
        if (configLoad && configCorrect && uploadWithError.length) {
            let onIgnore = (filename) => {
                const time = utils.timeString();
                appendMessage({
                    type: 'error',
                    value: time + 'Trying to upload ignored file: ' + filename
                })
            }
            reUploadSyncData = {
                rootPath: config.rootPath,
                ignorePatterns: config.ignorePatterns,
                remotePath: config.remotePath,
                appendMessage,
                sftp,
                onIgnore
            }
            const syncFileCommand = utils.syncFile(reUploadSyncData);
            for (const filename of uploadWithError) {
                syncFileCommand(filename)
            }
        }
    });

    context.subscriptions.push(clear);
    context.subscriptions.push(reload);
    context.subscriptions.push(reconnect);
    context.subscriptions.push(upload);
    context.subscriptions.push(reUpload);
    context.subscriptions.push(myStatusBarItem);
}

// This method is called when your extension is deactivated
function deactivate() {
    if (watcher && !watcher.isClosed()) {
        watcher.close()
    }
    if (statusBarInterval) {
        clearInterval(statusBarInterval)
    }
}


module.exports = {
    activate,
    deactivate
}
