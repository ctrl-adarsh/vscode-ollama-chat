import * as vscode from 'vscode';
import { OllamaService, OllamaModel, ChatMessage } from './ollamaService';

export function activate(context: vscode.ExtensionContext) {
    let currentPanel: vscode.WebviewPanel | undefined = undefined;
    let ollamaService: OllamaService | undefined = undefined;
    let savedState: { history: ChatMessage[], model: string } | undefined = undefined;

    let disposable = vscode.commands.registerCommand('vscode-ollama-chat.startChat', async () => {
        const config = vscode.workspace.getConfiguration('ollamaChat');
        const endpoint = config.get<string>('endpoint') || 'http://localhost:11434';

        // If we already have a panel, show it
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Create and show panel
        currentPanel = vscode.window.createWebviewPanel(
            'ollamaChat',
            'Ollama Chat',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                enableFindWidget: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
            }
        );

        ollamaService = new OllamaService(endpoint, savedState?.model || 'llama2-uncensored');
        let models: OllamaModel[] = [];

        try {
            models = await ollamaService.listModels();
        } catch (error) {
            vscode.window.showErrorMessage('Error fetching models: ' + error);
            return;
        }

        // Set the HTML content
        currentPanel.webview.html = getWebviewContent(models);

        // Handle messages from the webview
        currentPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'sendMessage':
                        try {
                            const text = message.text.trim();
                            
                            // Check if the message is a command
                            if (text.startsWith('@')) {
                                const response = await ollamaService?.handleCommand(text);
                                if (response) {
                                    // Add command response to history
                                    ollamaService?.addToHistory({
                                        role: 'assistant',
                                        content: response,
                                        timestamp: new Date().toISOString()
                                    });
                                    
                                    // Send response back to webview
                                    currentPanel?.webview.postMessage({
                                        command: 'response',
                                        text: response,
                                        history: ollamaService?.getMessageHistory()
                                    });
                                }
                            } else {
                                // Send thinking indicator for non-command messages
                                currentPanel?.webview.postMessage({
                                    command: 'thinking',
                                    text: 'Thinking...'
                                });
                                
                                const response = await ollamaService?.sendMessage(text);
                                currentPanel?.webview.postMessage({
                                    command: 'response',
                                    text: response,
                                    history: ollamaService?.getMessageHistory()
                                });
                            }
                        } catch (error) {
                            vscode.window.showErrorMessage('Error: ' + error);
                            currentPanel?.webview.postMessage({
                                command: 'error',
                                text: 'Error: ' + error
                            });
                        }
                        break;
                    case 'changeModel':
                        ollamaService?.setModel(message.model);
                        ollamaService?.clearHistory();
                        currentPanel?.webview.postMessage({
                            command: 'modelChanged',
                            model: message.model
                        });
                        break;
                    case 'clearHistory':
                        ollamaService?.clearHistory();
                        savedState = undefined;
                        currentPanel?.webview.postMessage({
                            command: 'historyCleared'
                        });
                        break;
                    case 'saveState':
                        savedState = message.state;
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        // Handle panel state changes
        currentPanel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    // Panel is visible again, ensure it's properly initialized
                    currentPanel?.webview.postMessage({
                        command: 'panelVisible',
                        history: savedState?.history || ollamaService?.getMessageHistory(),
                        model: savedState?.model || ollamaService?.getModel()
                    });
                }
            },
            null,
            context.subscriptions
        );

        // Reset when the panel is closed
        currentPanel.onDidDispose(
            () => {
                currentPanel = undefined;
                ollamaService = undefined;
            },
            null,
            context.subscriptions
        );

        // Show the panel
        currentPanel.reveal(vscode.ViewColumn.One);
    });

    // Add command to focus the chat panel
    let focusCommand = vscode.commands.registerCommand('vscode-ollama-chat.focus', () => {
        if (currentPanel) {
            currentPanel.reveal(vscode.ViewColumn.One);
        }
    });

    context.subscriptions.push(disposable, focusCommand);
}

function getWebviewContent(models: OllamaModel[]) {
    const modelOptions = models.map(model => 
        `<option value="${model.name}">${model.name} (${model.size})</option>`
    ).join('');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ollama Chat</title>
        <style>
            body {
                padding: 20px;
                font-family: var(--vscode-font-family);
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            #chat-container {
                height: calc(100vh - 200px);
                overflow-y: auto;
                margin-bottom: 20px;
                padding: 10px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
            }
            .message {
                margin-bottom: 15px;
                padding: 12px;
                border-radius: 6px;
                position: relative;
            }
            .message-header {
                font-size: 0.8em;
                margin-bottom: 5px;
                color: var(--vscode-descriptionForeground);
            }
            .message-content {
                white-space: pre-wrap;
                word-wrap: break-word;
            }
            .user-message {
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                margin-left: 20%;
            }
            .bot-message {
                background-color: var(--vscode-editor-selectionBackground);
                margin-right: 20%;
            }
            .thinking-message {
                background-color: var(--vscode-editor-selectionBackground);
                margin-right: 20%;
                opacity: 0.7;
            }
            #input-container {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
                position: relative;
            }
            #message-input {
                flex-grow: 1;
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
            }
            #command-suggestions {
                position: absolute;
                bottom: 100%;
                left: 0;
                right: 0;
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                margin-bottom: 5px;
                max-height: 200px;
                overflow-y: auto;
                display: none;
                z-index: 1000;
            }
            .command-suggestion {
                padding: 8px;
                cursor: pointer;
            }
            .command-suggestion:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            button {
                padding: 8px 16px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            #model-select {
                padding: 8px;
                border: 1px solid var(--vscode-input-border);
                border-radius: 4px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                margin-bottom: 10px;
            }
            .model-info {
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 10px;
            }
            .controls {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
            }
            .thinking-indicator {
                display: inline-block;
                margin-left: 5px;
                animation: thinking 1s infinite;
            }
            @keyframes thinking {
                0% { opacity: 0.3; }
                50% { opacity: 1; }
                100% { opacity: 0.3; }
            }
        </style>
    </head>
    <body>
        <div class="controls">
            <select id="model-select">
                ${modelOptions}
            </select>
            <button onclick="clearHistory()">Clear History</button>
        </div>
        <div class="model-info" id="model-info"></div>
        <div id="chat-container"></div>
        <div id="input-container">
            <input type="text" id="message-input" placeholder="Type your message...">
            <div id="command-suggestions"></div>
            <button onclick="sendMessage()">Send</button>
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            const chatContainer = document.getElementById('chat-container');
            const messageInput = document.getElementById('message-input');
            const modelSelect = document.getElementById('model-select');
            const modelInfo = document.getElementById('model-info');
            const commandSuggestions = document.getElementById('command-suggestions');
            let messageHistory = [];

            function formatTimestamp(timestamp) {
                return new Date(timestamp).toLocaleTimeString();
            }

            function addMessage(message) {
                // Check if this message is already in the history
                const isDuplicate = messageHistory.some(m => 
                    m.role === message.role && 
                    m.content === message.content && 
                    m.timestamp === message.timestamp
                );

                if (isDuplicate) {
                    return; // Skip duplicate messages
                }

                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (message.role === 'user' ? 'user-message' : 'bot-message');
                
                const header = document.createElement('div');
                header.className = 'message-header';
                header.textContent = \`\${message.role === 'user' ? 'You' : 'Assistant'} • \${formatTimestamp(message.timestamp)}\`;
                
                const content = document.createElement('div');
                content.className = 'message-content';
                
                // Special handling for user messages that are @ commands
                if (message.role === 'user' && message.content.trim().startsWith('@')) {
                    content.textContent = message.content;
                } else {
                    content.textContent = message.content;
                }
                
                messageDiv.appendChild(header);
                messageDiv.appendChild(content);
                chatContainer.appendChild(messageDiv);
                chatContainer.scrollTop = chatContainer.scrollHeight;

                // Add to history
                messageHistory.push(message);
            }

            function showCommandSuggestions(suggestions) {
                commandSuggestions.innerHTML = '';
                suggestions.forEach(cmd => {
                    const div = document.createElement('div');
                    div.className = 'command-suggestion';
                    div.textContent = cmd;
                    div.onclick = () => {
                        messageInput.value = cmd;
                        commandSuggestions.style.display = 'none';
                        messageInput.focus();
                    };
                    commandSuggestions.appendChild(div);
                });
                commandSuggestions.style.display = suggestions.length > 0 ? 'block' : 'none';
            }

            function sendMessage() {
                const text = messageInput.value.trim();
                if (text) {
                    // Add user message immediately
                    addMessage({
                        role: 'user',
                        content: text,
                        timestamp: new Date().toISOString()
                    });
                    messageInput.value = '';
                    commandSuggestions.style.display = 'none';
                    
                    // Send to extension
                    vscode.postMessage({
                        command: 'sendMessage',
                        text: text
                    });
                }
            }

            function clearHistory() {
                chatContainer.innerHTML = '';
                messageHistory = [];
                vscode.postMessage({
                    command: 'clearHistory'
                });
            }

            function updateModelInfo(model) {
                modelInfo.textContent = \`Current model: \${model}\`;
            }

            modelSelect.addEventListener('change', (e) => {
                const model = e.target.value;
                vscode.postMessage({
                    command: 'changeModel',
                    model: model
                });
                updateModelInfo(model);
            });

            // Handle input changes for command suggestions
            messageInput.addEventListener('input', (e) => {
                const text = e.target.value.trim();
                if (text === '@') {
                    // Show all available commands
                    const suggestions = [
                        '@help',
                        '@list',
                        '@clear',
                        '@model',
                        '@info',
                        '@workspace',
                        '@read',
                        '@analyze',
                        '@search',
                        '@edit',
                        '@explain',
                        '@refactor',
                        '@deps',
                        '@understand'
                    ];
                    showCommandSuggestions(suggestions);
                } else if (text.startsWith('@')) {
                    // Filter suggestions based on input
                    const suggestions = [
                        '@help',
                        '@list',
                        '@clear',
                        '@model',
                        '@info',
                        '@workspace',
                        '@read',
                        '@analyze',
                        '@search',
                        '@edit',
                        '@explain',
                        '@refactor',
                        '@deps',
                        '@understand'
                    ].filter(cmd => cmd.startsWith(text));
                    showCommandSuggestions(suggestions);
                } else {
                    commandSuggestions.style.display = 'none';
                }
            });

            // Handle Enter key
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });

            // Close suggestions when clicking outside
            document.addEventListener('click', (e) => {
                if (!messageInput.contains(e.target) && !commandSuggestions.contains(e.target)) {
                    commandSuggestions.style.display = 'none';
                }
            });

            // Handle messages from the extension
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'thinking':
                        // Remove any existing thinking indicator
                        const existingIndicator = document.getElementById('thinking-indicator');
                        if (existingIndicator) {
                            existingIndicator.remove();
                        }

                        // Add new thinking indicator
                        const thinkingDiv = document.createElement('div');
                        thinkingDiv.className = 'message thinking-message';
                        thinkingDiv.id = 'thinking-indicator';
                        
                        const header = document.createElement('div');
                        header.className = 'message-header';
                        header.textContent = 'Assistant';
                        
                        const content = document.createElement('div');
                        content.className = 'message-content';
                        content.textContent = 'Thinking...';
                        
                        thinkingDiv.appendChild(header);
                        thinkingDiv.appendChild(content);
                        chatContainer.appendChild(thinkingDiv);
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                        break;
                    case 'response':
                        // Remove thinking indicator if it exists
                        const thinkingIndicator = document.getElementById('thinking-indicator');
                        if (thinkingIndicator) {
                            thinkingIndicator.remove();
                        }
                        
                        if (message.history) {
                            // Clear existing messages
                            chatContainer.innerHTML = '';
                            messageHistory = [];
                            
                            // Add all messages from history
                            message.history.forEach(msg => {
                                addMessage(msg);
                            });
                        }
                        break;
                    case 'error':
                        // Remove thinking indicator if it exists
                        const errorIndicator = document.getElementById('thinking-indicator');
                        if (errorIndicator) {
                            errorIndicator.remove();
                        }
                        
                        addMessage({
                            role: 'assistant',
                            content: \`Error: \${message.text}\`,
                            timestamp: new Date().toISOString()
                        });
                        break;
                    case 'modelChanged':
                        modelInfo.textContent = \`Model changed to: \${message.model}\`;
                        break;
                    case 'historyCleared':
                        messageHistory = [];
                        chatContainer.innerHTML = '';
                        modelInfo.textContent = 'Chat history cleared';
                        break;
                }
            });

            // Initialize model info
            updateModelInfo(modelSelect.value);

            // Store state when the webview is hidden
            window.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    vscode.postMessage({
                        command: 'saveState',
                        state: {
                            history: messageHistory,
                            model: modelSelect.value
                        }
                    });
                }
            });
        </script>
    </body>
    </html>`;
}

export function deactivate() {}