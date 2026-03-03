import * as vscode from 'vscode';
import * as fs from 'fs';
import {Watcher} from 'node-watch';
import watch from 'node-watch';
import {Syncer} from './Syncer'
import {Messenger} from './Messenger'
import {Configurator} from './Configurator'
import {match, timeString} from './utils';
import {SftpViewProvider, Message} from  './SftpViewProvider'

type SyncFileData = {
    configurator: Configurator,
    messenger: Messenger,
    syncer: Syncer,
    onIgnore: Function
}

function updateStatusBarItem(myStatusBarItem: vscode.StatusBarItem, syncer: Syncer, webviewProvider: SftpViewProvider) {
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

export function syncFile (data: SyncFileData) {
    return async function(filename: string) {
        if (!match(filename, data.configurator.config?.ignorePatterns ?? [])) {
            let time = timeString();
            data.messenger.info(time + ' Change detected: ' + filename.replace(data.configurator.config?.rootPath ?? '', ''))
            let isDirectory = false;
            const exists = fs.existsSync(filename);
            let destination = data.configurator.config?.remotePath + '/' + filename.replace(data.configurator.config?.rootPath ?? '', '.');
            destination = destination.replace(/\\/g, '/');
            destination = destination.replace(/\/\/+/g, '/');

            if (exists) {
                isDirectory = fs.lstatSync(filename).isDirectory();
                data.syncer.uploadFile(destination, filename, isDirectory)
            } else {
                data.syncer.deleteFile(destination)
            }
        } else {
            data.onIgnore(filename)
        }
    }
}
let watcher: Watcher
let statusBarInterval: NodeJS.Timeout
let syncer:Syncer
let logger:vscode.LogOutputChannel

export function activate(context : vscode.ExtensionContext) {
    logger = vscode.window.createOutputChannel('SyncSFTP', { log: true });
    logger.clear();
    logger.info('Congratulations, your extension "sync-sftp" is now active!');
    let isPaused = false
    let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    let uploadSyncData:SyncFileData
    let watcherSyncData: SyncFileData
    let messenger = new Messenger();
    let configurator = new Configurator();
    myStatusBarItem.command = 'sync-sftp.reconnect';
    syncer = new Syncer(configurator, messenger, logger);
    function runWatcher() {
        let onIgnore = () => {}
        watcherSyncData = {
            configurator,
            messenger,
            syncer,
            onIgnore
        }
        const syncFileWatcher = syncFile(watcherSyncData);
        // Initiate the watcher
        watcher = watch(
            configurator.config?.rootPath ?? '',
            {
                recursive: true,
                filter: function (filename) {
                    // Don't watch file if it matches 'ignore_regexes'
                    return !match(filename, configurator.config?.ignorePatterns ?? [])
                }
            },
            function (env, filename) {
                syncFileWatcher(filename)
            }
        );
    }
    const webviewProvider = new SftpViewProvider(context.extensionUri);
    updateStatusBarItem(myStatusBarItem, syncer, webviewProvider)
    statusBarInterval = setInterval(() => updateStatusBarItem(myStatusBarItem, syncer, webviewProvider), 1000)

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("sync-sftp.logView", webviewProvider)
    );
    messenger.setAppendMessage((message: Message) => webviewProvider.postMessageToWebview(message))
    let configPath = vscode.workspace?.workspaceFolders && vscode.workspace?.workspaceFolders[0] ? vscode.workspace?.workspaceFolders[0].uri.fsPath : ''
    configurator.loadConfig(configPath)
    if (configurator.config?.errors.length) {
        for(let error of configurator.config?.errors) {
            messenger.error(error)
        }
    } else {
        messenger.clear()
        messenger.infoSuccess('Watching directory: ' + configurator.config?.rootPath)
        syncer.startTimers()
        syncer.connect()
        runWatcher();
    }

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    const clear = vscode.commands.registerCommand('sync-sftp.clearLog', function () {
        messenger.clear()
        messenger.infoSuccess('Watching directory: ' + configurator.config?.rootPath)
    });
    const upload = vscode.commands.registerCommand('sync-sftp.upload', function (info, allSelections) {
        if (info && info.scheme === 'file' && configurator.isConfigLoaded && configurator.isConfigCorrect) {
            let onIgnore = (filename: string) => {
                const time = timeString();
                messenger.error(time + 'Trying to upload ignored file: ' + filename)
            }
            uploadSyncData = {
                configurator,
                messenger,
                syncer,
                onIgnore
            }
            const syncFileCommand = syncFile(uploadSyncData);
            for (let file of allSelections) {
                let filename = file.path
                // Upload if it doesn't match the ignorePatterns
                syncFileCommand(filename)
            }
        }
    });
    const reload = vscode.commands.registerCommand('sync-sftp.reloadConfig', function () {
        let configPath = vscode.workspace?.workspaceFolders && vscode.workspace?.workspaceFolders[0] ? vscode.workspace?.workspaceFolders[0].uri.fsPath : ''
        configurator.loadConfig(configPath)
        if (configurator.config?.errors.length) {
            for(let error of configurator.config?.errors) {
                messenger.error(error)
            }
        } else {
            messenger.clear()
            messenger.infoSuccess('Watching directory: ' + configurator.config?.rootPath)
            syncer.startTimers()
            syncer.connect()
            if (!watcher) {
                runWatcher()
            }
        }
    });
    const reconnect = vscode.commands.registerCommand('sync-sftp.reconnect', function () {
        syncer.startTimers()
        syncer.connect()
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
    context.subscriptions.push(makeEqual);
    context.subscriptions.push(detectDifferences);
    context.subscriptions.push(clearQuery);
    context.subscriptions.push(toggleWatcher);
    context.subscriptions.push(myStatusBarItem);
}

// This method is called when your extension is deactivated
export function deactivate() {
    if (watcher && !watcher.isClosed()) {
        watcher.close()
    }
    if (statusBarInterval) {
        clearInterval(statusBarInterval)
    }
    syncer?.clearTimers()
    if (logger) {
        logger.dispose()
    }
}
