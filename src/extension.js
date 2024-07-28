const vscode = require('vscode');
const watch = require('node-watch');
const fs = require('fs');
const SFTPS = require('sftps');
const RJSON = require('relaxed-json');
const utils = require('./utils');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "sync-sftp" is now active!');
	let rootPath = vscode.workspace.workspaceFolders[0].uri.path;
	let configText = fs.readFileSync(rootPath + '/.sync-sftp.json')
	let configLoad = false
	let configCorrect = false

	let errors = []

	const scanInterval = 1000;
	const sshOptions = {};

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

		const options = {
			host: host, // required
			username: username, // required
			port: port,
			autoConfirm: true,
		};
		if (password && password.length > 0) {
			options['password'] = password;
		}

		if (Object.keys(sshOptions).length > 0) {
			options['sshOptions'] = sshOptions;
		}
		// Create SFTP connection
		sftp = new SFTPS(options);
		// Create scan function that runs & empties the SFTP queue every second
		const scan = function () {
			if (sftp.cmds.length > 0) {
				sftp.exec(function (err, res) {
					if (err) {
						appendMessage({
							type: 'error',
							value: err
						})
					} else if (res.data) {
						const time = utils.timeString();
						const numberOfItems = res.data.split('\n').length - 1;

						appendMessage({
							type: 'info-success',
							value: time + ' Succesfully uploaded ' + numberOfItems + ' file(s)'
						})
					}
				});
			}
			setTimeout(scan, scanInterval);
		};
		setTimeout(scan, scanInterval);


		let filter = () => {
			return true
		}
		const syncFileWatcher = utils.syncFile({filter, rootPath, ignorePatterns, remotePath, appendMessage, sftp});
		// Initiate the watcher
		watch(
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
	const upload = vscode.commands.registerCommand('sync-sftp.upload', function (info) {
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
			let filter = (filename) => {
				return utils.match(filename, ignorePatterns)
			}
			const syncFileCommand = utils.syncFile({filter, rootPath, ignorePatterns, remotePath, appendMessage, sftp});
			let filename = info.path
			// Upload if it doesn't match the ignorePatterns
			syncFileCommand(filename)
		}
	});

	context.subscriptions.push(clear);
	context.subscriptions.push(upload);
}

// This method is called when your extension is deactivated
function deactivate() {}


module.exports = {
	activate,
	deactivate
}
