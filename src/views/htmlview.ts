import * as vscode from 'vscode';
import {PackageInfo} from '../whatsnew/packageinfo';
import {TextView} from './textview';



/**
 * A Webview that just shows some html.
 * E.g. used for the flow charts and call graphs.
 */
export class HtmlView extends TextView {
	/**
	 * Sets the html code to display the text.
	 * @param body The html body code to display.
	 * @param additionalHead An optional string added to the head-section.
	 * E.g. a style or script.
	 * E.g. 'a { text-decoration: none; }'
	 */
	protected setHtml(body: string, additionalHead: string) {
		// Get local path extension to set as root (to allow accessing other files)
		const extPath = PackageInfo.extension.extensionPath;
		const resourcePath = vscode.Uri.file(extPath);
		const vscodeResPath = this.vscodePanel.webview.asWebviewUri(resourcePath).toString();

		//		<base href="${vscodeResPath}/" >
		// Create html
		const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<base href="${vscodeResPath}/">
    ${additionalHead}
</head>

<script>
	const vscode = acquireVsCodeApi();

	document.addEventListener('click', event => {
		let node = event && event.target;
		while (node) {
			if (node.href) {
				let data = node.href;
				// Check if SVG link
				if(data.baseVal)
					data = data.baseVal;
				// Handle click here by posting data back to VS Code
				vscode.postMessage({
					command: 'click',
					data
				});
				event.preventDefault();
				return;
			}
			node = node.parentNode;
		}
	}, true);

    //# sourceURL=HtmlView.js
</script>

<body>
${body}
</body>
</html>
`;

		// Add html body
		this.vscodePanel.webview.html = html;
	}


	/**
	 * The received events send to the callback.
	 * @param message The message. message.command contains the command as a string. message.data contains additional data (dependent on the command)
	 * The only command created by the HtlmView is 'clicked' if a node with a 'href' attribute
	 * has been clicked.
	 * 'message.data' contains the contents of the 'href'.
	 */
	protected async webViewMessageReceived(message: any) {
		const command = message.command;
		this.emit(command, message);
	}
}
