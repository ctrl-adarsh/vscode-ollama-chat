# VSCode Ollama Chat Extension

A powerful Visual Studio Code extension that integrates Ollama's AI capabilities directly into your development workflow. This extension provides an interactive chat interface within VSCode, allowing you to interact with various Ollama models for code assistance, analysis, and development support.

## Features

- 🤖 **Interactive Chat Interface**: Seamlessly chat with Ollama models directly within VSCode
- 🔄 **Multiple Model Support**: Easily switch between different Ollama models
- 📝 **Command Support**: Special commands for enhanced context and analysis
- 💡 **Context-Aware Responses**: Get relevant answers based on your workspace and code context
- 🎨 **Modern UI**: Clean and intuitive chat interface with markdown support

### Available Commands

- `@workspace: [query]` - Add workspace context and ask questions about your project
- `@read [file]: [query]` - Read a specific file and ask questions about its contents
- `@understand [file]` - Get a detailed analysis of a file's structure and purpose
- `@clear` - Clear the current chat history
- `@help` - Display available commands and their usage

## Prerequisites

- Visual Studio Code 1.85.0 or higher
- Node.js 16.x or higher
- Ollama installed and running locally (see [Ollama Installation](#ollama-installation))

## Installation

### 1. Install Ollama

First, ensure you have Ollama installed and running on your system:

#### macOS
```bash
curl https://ollama.ai/install.sh | sh
```

#### Linux
```bash
curl https://ollama.ai/install.sh | sh
```

#### Windows
Download the installer from [Ollama's official website](https://ollama.ai/download)

### 2. Install the Extension

#### From VSIX (Recommended)
1. Download the latest `.vsix` file from the releases
2. Open VS Code
3. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
4. Type "Install from VSIX"
5. Select the downloaded `.vsix` file

#### From Source
1. Clone the repository:
   ```bash
   git clone https://github.com/ctrl-adarsh/vscode-ollama-chat.git
   cd vscode-ollama-chat
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Package the extension:
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```

5. Install the generated VSIX file:
   ```bash
   code --install-extension vscode-ollama-chat-0.0.1.vsix
   ```

## Usage

1. Open VS Code
2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
3. Type "Start Ollama Chat" and select the command
4. The chat interface will open in a new panel
5. Start chatting with the AI!

### Example Commands

```markdown
# Ask about your workspace
@workspace: what files are in the src directory?

# Get help with a specific file
@read src/extension.ts: explain the main functionality

# Get a detailed analysis of a file
@understand src/ollamaService.ts

# Clear chat history
@clear

# Get help with commands
@help
```

## Configuration

The extension can be configured through VS Code settings:

- `ollamaChat.model`: Set the default Ollama model to use
- `ollamaChat.apiUrl`: Configure the Ollama API URL (default: http://localhost:11434)

## Development

### Project Structure

```
vscode-ollama-chat/
├── src/
│   ├── extension.ts      # Main extension entry point
│   └── ollamaService.ts  # Ollama API integration
├── out/                  # Compiled JavaScript files
├── package.json         # Extension manifest and dependencies
└── tsconfig.json        # TypeScript configuration
```

### Building from Source

1. Clone the repository
2. Install dependencies: `npm install`
3. Compile: `npm run compile`
4. Package: `vsce package`
5. Install: `code --install-extension vscode-ollama-chat-0.0.1.vsix`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
