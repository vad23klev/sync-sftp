"use strict";
const vscode = require('vscode');
const watch = require('node-watch');
const utils = require('./utils');
const Syncer = require('./Syncer');
const Messenger = require('./Messenger')
const Configurator = require('./Configurator')
const {NodeSSH} = require('node-ssh')

let watcher = null
let statusBarInterval = null
let syncer = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "sync-sftp" is now active!');
    let isPaused = false
    let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    let uploadSyncData = {}
    let reUploadSyncData = {}
    let watcherSyncData = {}
    let messenger = new Messenger();
    let configurator = new Configurator();
    myStatusBarItem.command = 'sync-sftp.reconnect';
    syncer = new Syncer(configurator, messenger);
    function runWatcher() {
        let onIgnore = () => {}
        watcherSyncData = {
            configurator,
            messenger,
            syncer,
            onIgnore
        }
        const syncFileWatcher = utils.syncFile(watcherSyncData);
        // Initiate the watcher
        watcher = watch(
            configurator.config.rootPath,
            {
                recursive: true,
                filter: function (filename) {
                    // Don't watch file if it matches 'ignore_regexes'
                    return !utils.match(filename, configurator.config.ignorePatterns)
                },
            },
            function (env, filename) {
                syncFileWatcher(filename)
            }
        );
    }
    const webviewProvider = utils.createWebViewProvider(context.extensionUri)
    utils.updateStatusBarItem(myStatusBarItem, syncer, webviewProvider)
    statusBarInterval = setInterval(() => utils.updateStatusBarItem(myStatusBarItem, syncer, webviewProvider), 1000)
    String.prototype.replaceAll = function (search, replacement) {
        const target = this;
        return target.replace(new RegExp(search, 'g'), replacement);
    };

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("sync-sftp.logView", webviewProvider)
    );
    messenger.setAppendMessage((message) => webviewProvider.postMessageToWebview(message))
    configurator.loadConfig(vscode.workspace.workspaceFolders[0].uri.path)
    if (configurator.config.errors.length) {
        for(let error of configurator.config.errors) {
            messenger.error(error)
        }
    } else {
        messenger.clear()
        messenger.infoSuccess('Watching directory: ' + configurator.config.rootPath)

        syncer.connect()
        runWatcher();
    }

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    const clear = vscode.commands.registerCommand('sync-sftp.clearLog', function () {
        messenger.clear()
        messenger.infoSuccess('Watching directory: ' + configurator.config.rootPath)
    });
    const upload = vscode.commands.registerCommand('sync-sftp.upload', function (info, allSelections) {
        if (info && info.scheme === 'file' && configurator.isConfigLoaded && configurator.isConfigCorrect) {
            let onIgnore = (filename) => {
                const time = utils.timeString();
                messenger.error(time + 'Trying to upload ignored file: ' + filename)
            }
            uploadSyncData = {
                configurator,
                messenger,
                syncer,
                onIgnore
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
        configurator.loadConfig(vscode.workspace.workspaceFolders[0].uri.path)
        if (configurator.config.errors.length) {
            for(let error of configurator.config.errors) {
                messenger.error(error)
            }
        } else {
            messenger.clear()
            messenger.infoSuccess('Watching directory: ' + configurator.config.rootPath)
            syncer.connect()
            if (!watcher) {
                runWatcher()
            }
        }
    });
    const reconnect = vscode.commands.registerCommand('sync-sftp.reconnect', function () {
        syncer.connect()
    });
    const reUpload = vscode.commands.registerCommand('sync-sftp.reupload', function () {
        if (syncer.uploadWithError.length === 0) {
            messenger.error('Nothing to upload!')
        }

        if (!syncer.isConnected()) {
            messenger.error('Can\'t connect to server')
            return
        }
        if (configurator.isConfigLoaded && configurator.isConfigCorrect && syncer.uploadWithError.length) {
            let onIgnore = (filename) => {
                const time = utils.timeString();
                messenger.error(time + 'Trying to upload ignored file: ' + filename)
            }
            reUploadSyncData = {
                configurator,
                messenger,
                syncer,
                onIgnore
            }
            const syncFileCommand = utils.syncFile(reUploadSyncData);
            for (const filename of syncer.uploadWithError) {
                syncFileCommand(filename)
            }
        }
    });

    const makeEqual = vscode.commands.registerCommand('sync-sftp.makeEqual', function () {

        if (!syncer.isConnected()) {
            messenger.error('Can\'t connect to server')
            return
        }
        if (configurator.isConfigLoaded && configurator.isConfigCorrect) {
            syncer.makeEqual()
        }
    });

    const detectDifferences = vscode.commands.registerCommand('sync-sftp.detectDifferences', function () {
        if (!syncer.isConnected()) {
            messenger.error('Can\'t connect to server')
            return
        }
        if (configurator.isConfigLoaded && configurator.isConfigCorrect) {
            syncer.notifyAboutChanges()
        }
    });
    const clearQuery = vscode.commands.registerCommand('sync-sftp.clearQuery', function () {
        if (syncer) {
            syncer.uploadFileFailed = [];
            messenger.infoSuccess('Query cleared')
        }
    });
    const toggleWatcher = vscode.commands.registerCommand('sync-sftp.toggleWatcher', function () {
        isPaused = !isPaused

        if (watcher && !watcher.isClosed()) {
            watcher.close()
        }
        if (syncer) {
            syncer.toggle()
        }
        if (!isPaused) {
            runWatcher()
        }

        messenger.infoSuccess(`Sync SFTP is ${isPaused ? 'paused' : 'active'}`)
    });
    // toggleWatcher

    context.subscriptions.push(clear);
    context.subscriptions.push(reload);
    context.subscriptions.push(reconnect);
    context.subscriptions.push(upload);
    context.subscriptions.push(reUpload);
    context.subscriptions.push(makeEqual);
    context.subscriptions.push(detectDifferences);
    context.subscriptions.push(clearQuery);
    context.subscriptions.push(toggleWatcher);
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
    if (syncer?.timeInterval) {
        clearInterval(syncer.timeInterval)
    }
}


module.exports = {
    activate,
    deactivate
}

