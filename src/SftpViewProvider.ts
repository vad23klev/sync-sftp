import * as vscode from 'vscode';

export type Message = {
	type: string,
	value: string
}

export class SftpViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'sync-sftp.logView';

	private _view?: vscode.WebviewView;
	public messages: Message[];

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) {
		this.messages = [];
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			console.log("SyncSFTP: postMessageToWebview " + webviewView.webview , webviewView.visible);
			if (webviewView.webview && webviewView.visible) {
				for(let messageElement of this.messages) {
					webviewView.webview.postMessage(messageElement);
				}
				this.messages = [];
			}
		});
	}
	public postMessageToWebview(message: Message) {
		console.log("SyncSFTP: postMessageToWebview " + this._view?.webview , this._view?.visible);
		if (this._view?.webview && this._view?.visible) {
			console.log("SyncSFTP:" + this._view.webview.postMessage);
			for(let messageElement of this.messages) {
				this._view.webview.postMessage(messageElement);
			}
			this.messages = [];
			this._view.webview.postMessage(message);
		} else {
			this.messages.push(message)
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

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
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}