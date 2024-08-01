const vscode = require('vscode');
const watch = require('node-watch');
const fs = require('fs');
const RJSON = require('relaxed-json');
const utils = require('./utils');
const {NodeSSH} = require('node-ssh')
let watcher = null

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	console.log('Congratulations, your extension "sync-sftp" is now active!');
	let rootPath = vscode.workspace.workspaceFolders[0].uri.path;
	let configText = fs.readFileSync(rootPath + '/.sync-sftp.json')
	let configLoad = false
	let configCorrect = false

	let errors = []
	let options = {}

	let ignorePatterns = '';
	let host = '';
	let username = '';
	let password = '';
	let port = 22;
	let remotePath = '';
	let sftp = null;

	String.prototype.replaceAll = function (search, replacement) {
		const target = this;
		return target.replace(new RegExp(search, 'g'), replacement);
	};

	const webviewProvider = utils.createWebViewProvider(context.extensionUri)
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("sync-sftp.logView", webviewProvider)
    );
	const appendMessage = (message) => webviewProvider.postMessageToWebview(message)


	try {
		let options = Buffer.from(configText).toString('utf8')
		const config = RJSON.parse(options);
		host = config.host;
		username = config.user;

		if (config.password) {
			password = config.password;
		}

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
		configLoad = true
	} catch (e) {
		errors.push('Error: Unable to parse sftp-config.json!')
	}

	if (errors.length > 0) {
		for(let error of errors) {
			appendMessage({
				type: 'error',
				value: error
			})
		}
	} else {
		configCorrect = true
		appendMessage({
			type: 'info-success',
			value: 'Watching directory: ' + rootPath
		})

		options = {
			host: host, // required
			username: username, // required
			port: port,
			autoConfirm: true,
		};
		if (password && password.length > 0) {
			options['password'] = password;
		}
		// Create SFTP connection
		sftp = new NodeSSH();
		await sftp.connect(options)
		appendMessage({
			type: 'info-success',
			value: 'Config load success: ' + rootPath
		})
		let onIgnore = () => {}
		const syncFileWatcher = utils.syncFile({rootPath, ignorePatterns, remotePath, appendMessage, sftp, onIgnore});
		// Initiate the watcher
		watcher = watch(
			rootPath,
			{
				recursive: true,
				filter: function (filename) {
					// Don't watch file if it matches 'ignore_regexes'
					return !utils.match(filename, ignorePatterns)
				},
			},
			function (env, filename) {
				// Upload if it doesn't match the ignorePatterns
				syncFileWatcher(filename)
			}
		);

	}
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const clear = vscode.commands.registerCommand('sync-sftp.clearLog', function () {
		appendMessage({
			type: 'clear'
		})
		appendMessage({
			type: 'info-success',
			value: 'Watching directory: ' + rootPath
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
			const syncFileCommand = utils.syncFile({rootPath, ignorePatterns, remotePath, appendMessage, sftp, onIgnore});
			for (let file of allSelections) {
				let filename = file.path
				// Upload if it doesn't match the ignorePatterns
				syncFileCommand(filename)
			}
		}
	});
	const reload = vscode.commands.registerCommand('sync-sftp.reloadConfig', async function () {
		appendMessage({
			type: 'clear'
		})
		rootPath = vscode.workspace.workspaceFolders[0].uri.path;
		configText = fs.readFileSync(rootPath + '/.sync-sftp.json')
		configLoad = false
		configCorrect = false

		try {
			let options = Buffer.from(configText).toString('utf8')
			const config = RJSON.parse(options);
			host = config.host;
			username = config.user;

			if (config.password) {
				password = config.password;
			}

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
			configLoad = true
		} catch (e) {
			errors.push('Error: Unable to parse sftp-config.json!')
		}

		if (errors.length > 0) {
			for(let error of errors) {
				appendMessage({
					type: 'error',
					value: error
				})
			}
		} else {
			configCorrect = true
			appendMessage({
				type: 'info-success',
				value: 'Watching directory: ' + rootPath
			})

			options = {
				host: host, // required
				username: username, // required
				port: port,
				autoConfirm: true,
			};

			if (password && password.length > 0) {
				options['password'] = password;
			}
			// Create SFTP connection
			sftp = new NodeSSH();
			await sftp.connect(options)
			appendMessage({
				type: 'info-success',
				value: 'Config reload success: ' + rootPath
			})
		}
	});

	context.subscriptions.push(clear);
	context.subscriptions.push(reload);
	context.subscriptions.push(upload);
}

// This method is called when your extension is deactivated
function deactivate() {
	if (watcher && !watcher.isClosed()) {
		watcher.close()
	}
}


module.exports = {
	activate,
	deactivate
}
