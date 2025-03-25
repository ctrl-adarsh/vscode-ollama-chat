import fetch from 'node-fetch';
import * as vscode from 'vscode';

export interface OllamaResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
}

export interface OllamaModel {
    name: string;
    size: string;
    modified_at: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export class OllamaService {
    private apiUrl: string;
    private model: string;
    private messageHistory: ChatMessage[] = [];
    private readonly availableCommands = [
        { command: '@workspace', description: 'Show the workspace structure' },
        { command: '@read', description: 'Read contents of a file (usage: @read <filepath>)' },
        { command: '@analyze', description: 'Analyze code for issues (usage: @analyze <filepath>)' },
        { command: '@search', description: 'Search for code across files (usage: @search <query>)' },
        { command: '@edit', description: 'Edit a file (usage: @edit <filepath> <line> <content>)' },
        { command: '@explain', description: 'Explain code in a file (usage: @explain <filepath>)' },
        { command: '@refactor', description: 'Suggest code refactoring (usage: @refactor <filepath>)' },
        { command: '@deps', description: 'Show dependency analysis (usage: @deps <filepath>)' },
        { command: '@understand', description: 'Get detailed code understanding (usage: @understand <filepath>)' },
        { command: '@help', description: 'Show all available commands' }
    ];

    constructor(apiUrl: string, model: string) {
        this.apiUrl = apiUrl;
        this.model = model;
    }

    async sendMessage(message: string): Promise<string> {
        try {
            // Check for command suggestions
            if (message.trim() === '@') {
                return this.getCommandSuggestions();
            }

            // Add context to the message if available
            let contextMessage = message;
            if (this.workspaceContext) {
                contextMessage = `Workspace Context:\n${this.workspaceContext}\n\nUser Question: ${message}`;
            }
            if (this.currentFileContext) {
                contextMessage = `Current File Context (${this.currentFileContext.path}):\n${this.currentFileContext.content}\n\nUser Question: ${message}`;
            }

            // Add user message to history
            this.messageHistory.push({
                role: 'user',
                content: contextMessage,
                timestamp: new Date().toISOString()
            });

            const response = await fetch(`${this.apiUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: this.messageHistory.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    stream: false,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as OllamaResponse;
            
            // Add assistant response to history
            this.messageHistory.push({
                role: 'assistant',
                content: data.message.content,
                timestamp: new Date().toISOString()
            });

            return data.message.content;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    async listModels(): Promise<OllamaModel[]> {
        try {
            const response = await fetch(`${this.apiUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.models.map((model: any) => ({
                name: model.name,
                size: model.size,
                modified_at: model.modified_at
            }));
        } catch (error) {
            console.error('Error listing Ollama models:', error);
            throw error;
        }
    }

    setModel(model: string) {
        this.model = model;
    }

    getModel(): string {
        return this.model;
    }

    getMessageHistory(): ChatMessage[] {
        return this.messageHistory;
    }

    clearHistory() {
        this.messageHistory = [];
    }

    async scanWorkspace(): Promise<string> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return "No workspace folder is open.";
            }

            const rootPath = workspaceFolders[0].uri.fsPath;
            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
            
            let output = "Workspace Structure:\n\n";
            const fileTree = this.buildFileTree(files, rootPath);
            output += this.formatFileTree(fileTree);
            
            return output;
        } catch (error) {
            console.error('Error scanning workspace:', error);
            return "Error scanning workspace: " + error;
        }
    }

    private buildFileTree(files: vscode.Uri[], rootPath: string): any {
        const tree: any = {};
        
        files.forEach(file => {
            const relativePath = vscode.workspace.asRelativePath(file);
            const parts = relativePath.split('/');
            let current = tree;
            
            parts.forEach((part, index) => {
                if (index === parts.length - 1) {
                    current[part] = null; // File
                } else {
                    if (!current[part]) {
                        current[part] = {};
                    }
                    current = current[part];
                }
            });
        });
        
        return tree;
    }

    private formatFileTree(tree: any, level: number = 0): string {
        let output = '';
        const indent = '  '.repeat(level);
        
        Object.entries(tree).forEach(([name, value]) => {
            if (value === null) {
                output += `${indent}📄 ${name}\n`;
            } else {
                output += `${indent}📁 ${name}/\n`;
                output += this.formatFileTree(value, level + 1);
            }
        });
        
        return output;
    }

    async readFile(filePath: string): Promise<string> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error("No workspace folder is open.");
            }

            const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
            const document = await vscode.workspace.openTextDocument(fullPath);
            return document.getText();
        } catch (error) {
            console.error('Error reading file:', error);
            throw new Error(`Failed to read file ${filePath}: ${error}`);
        }
    }

    async analyzeCode(filePath: string): Promise<string> {
        try {
            const content = await this.readFile(filePath);
            const diagnostics = await this.getDiagnostics(filePath);
            
            let analysis = `Code Analysis for ${filePath}:\n\n`;
            
            // Add file statistics
            const lines = content.split('\n');
            analysis += `📊 File Statistics:\n`;
            analysis += `- Total lines: ${lines.length}\n`;
            analysis += `- Non-empty lines: ${lines.filter(line => line.trim().length > 0).length}\n`;
            
            // Add diagnostics if any
            if (diagnostics.length > 0) {
                analysis += `\n⚠️ Issues Found:\n`;
                diagnostics.forEach(diagnostic => {
                    analysis += `- Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}\n`;
                    if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
                        analysis += `  Error: ${diagnostic.message}\n`;
                    } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
                        analysis += `  Warning: ${diagnostic.message}\n`;
                    }
                });
            } else {
                analysis += `\n✅ No issues found in the code.\n`;
            }

            return analysis;
        } catch (error) {
            console.error('Error analyzing code:', error);
            throw new Error(`Failed to analyze code in ${filePath}: ${error}`);
        }
    }

    private async getDiagnostics(filePath: string): Promise<vscode.Diagnostic[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return [];
        }

        const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
        const document = await vscode.workspace.openTextDocument(fullPath);
        
        // Get diagnostics from the language server
        const diagnostics = vscode.languages.getDiagnostics(fullPath);
        return diagnostics;
    }

    private getCommandSuggestions(): string {
        let suggestions = "Available Commands:\n\n";
        this.availableCommands.forEach(cmd => {
            suggestions += `${cmd.command}\n`;
        });
        suggestions += "\nType @help for detailed information about each command.";
        return suggestions;
    }

    private getCommandHelp(): string {
        let help = "📚 Command Help\n\n";
        this.availableCommands.forEach(cmd => {
            help += `${cmd.command}\n${cmd.description}\n\n`;
        });
        return help;
    }

    async searchCode(query: string): Promise<string> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error("No workspace folder is open.");
            }

            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**');
            let results = "🔍 Search Results:\n\n";
            let matchCount = 0;

            for (const file of files) {
                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();
                const lines = text.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                        const relativePath = vscode.workspace.asRelativePath(file);
                        results += `📄 ${relativePath}:${i + 1}\n${lines[i].trim()}\n\n`;
                        matchCount++;
                    }
                }
            }

            if (matchCount === 0) {
                results = "No matches found for your search query.";
            } else {
                results += `Found ${matchCount} matches.`;
            }

            return results;
        } catch (error) {
            console.error('Error searching code:', error);
            throw new Error(`Failed to search code: ${error}`);
        }
    }

    async editFile(filePath: string, line: number, content: string): Promise<string> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error("No workspace folder is open.");
            }

            const fullPath = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
            const document = await vscode.workspace.openTextDocument(fullPath);
            
            const edit = new vscode.WorkspaceEdit();
            const lineRange = new vscode.Range(line - 1, 0, line - 1, document.lineAt(line - 1).text.length);
            edit.replace(document.uri, lineRange, content);
            
            await vscode.workspace.applyEdit(edit);
            return `✅ Successfully edited line ${line} in ${filePath}`;
        } catch (error) {
            console.error('Error editing file:', error);
            throw new Error(`Failed to edit file: ${error}`);
        }
    }

    async explainCode(filePath: string): Promise<string> {
        try {
            const content = await this.readFile(filePath);
            const diagnostics = await this.getDiagnostics(filePath);
            
            let explanation = `📝 Code Explanation for ${filePath}:\n\n`;
            
            // Add file overview
            const lines = content.split('\n');
            explanation += `📊 File Overview:\n`;
            explanation += `- Total lines: ${lines.length}\n`;
            explanation += `- Non-empty lines: ${lines.filter(line => line.trim().length > 0).length}\n`;
            
            // Add code structure analysis
            const imports = lines.filter(line => line.trim().startsWith('import'));
            const functions = lines.filter(line => line.trim().startsWith('function') || line.trim().startsWith('async function'));
            const classes = lines.filter(line => line.trim().startsWith('class'));
            
            explanation += `\n🔍 Code Structure:\n`;
            explanation += `- Imports: ${imports.length}\n`;
            explanation += `- Functions: ${functions.length}\n`;
            explanation += `- Classes: ${classes.length}\n`;
            
            // Add diagnostics if any
            if (diagnostics.length > 0) {
                explanation += `\n⚠️ Issues Found:\n`;
                diagnostics.forEach(diagnostic => {
                    explanation += `- Line ${diagnostic.range.start.line + 1}: ${diagnostic.message}\n`;
                });
            }

            // Add code complexity analysis
            const complexity = this.calculateCodeComplexity(content);
            explanation += `\n📈 Code Complexity:\n`;
            explanation += `- Cyclomatic complexity: ${complexity}\n`;
            explanation += complexity > 10 ? `  ⚠️ High complexity detected\n` : `  ✅ Good complexity level\n`;

            return explanation;
        } catch (error) {
            console.error('Error explaining code:', error);
            throw new Error(`Failed to explain code: ${error}`);
        }
    }

    private calculateCodeComplexity(content: string): number {
        let complexity = 1; // Base complexity
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('if') || 
                trimmed.includes('else') || 
                trimmed.includes('for') || 
                trimmed.includes('while') || 
                trimmed.includes('switch') || 
                trimmed.includes('catch') ||
                trimmed.includes('&&') ||
                trimmed.includes('||')) {
                complexity++;
            }
        }
        
        return complexity;
    }

    async suggestRefactoring(filePath: string): Promise<string> {
        try {
            const content = await this.readFile(filePath);
            const diagnostics = await this.getDiagnostics(filePath);
            
            let suggestions = `🔄 Refactoring Suggestions for ${filePath}:\n\n`;
            
            // Analyze code structure
            const lines = content.split('\n');
            const functions = this.extractFunctions(content);
            const classes = this.extractClasses(content);
            
            // Check for long functions
            const longFunctions = functions.filter(f => f.lines > 20);
            if (longFunctions.length > 0) {
                suggestions += `⚠️ Long Functions Found:\n`;
                longFunctions.forEach(f => {
                    suggestions += `- ${f.name} (${f.lines} lines)\n`;
                    suggestions += `  Consider breaking this function into smaller, more focused functions.\n`;
                });
                suggestions += '\n';
            }

            // Check for complex functions
            const complexFunctions = functions.filter(f => this.calculateFunctionComplexity(f.content) > 5);
            if (complexFunctions.length > 0) {
                suggestions += `⚠️ Complex Functions Found:\n`;
                complexFunctions.forEach(f => {
                    suggestions += `- ${f.name} (complexity: ${this.calculateFunctionComplexity(f.content)})\n`;
                    suggestions += `  Consider simplifying the logic or extracting complex conditions.\n`;
                });
                suggestions += '\n';
            }

            // Check for code duplication
            const duplicates = this.findCodeDuplicates(content);
            if (duplicates.length > 0) {
                suggestions += `⚠️ Potential Code Duplication:\n`;
                duplicates.forEach(d => {
                    suggestions += `- Similar code found in lines ${d.startLine}-${d.endLine}\n`;
                    suggestions += `  Consider extracting this into a reusable function.\n`;
                });
                suggestions += '\n';
            }

            // Check for naming issues
            const namingIssues = this.checkNamingConventions(content);
            if (namingIssues.length > 0) {
                suggestions += `⚠️ Naming Convention Issues:\n`;
                namingIssues.forEach(issue => {
                    suggestions += `- ${issue}\n`;
                });
                suggestions += '\n';
            }

            if (suggestions === `🔄 Refactoring Suggestions for ${filePath}:\n\n`) {
                suggestions += `✅ No major refactoring suggestions found. The code looks well-structured.\n`;
            }

            return suggestions;
        } catch (error) {
            console.error('Error suggesting refactoring:', error);
            throw new Error(`Failed to suggest refactoring: ${error}`);
        }
    }

    async analyzeDependencies(filePath: string): Promise<string> {
        try {
            const content = await this.readFile(filePath);
            const imports = this.extractImports(content);
            
            let analysis = `📦 Dependency Analysis for ${filePath}:\n\n`;
            
            // Analyze imports
            analysis += `🔍 Imports:\n`;
            imports.forEach(imp => {
                analysis += `- ${imp}\n`;
            });
            analysis += '\n';

            // Check for unused imports
            const unusedImports = this.findUnusedImports(content, imports);
            if (unusedImports.length > 0) {
                analysis += `⚠️ Unused Imports:\n`;
                unusedImports.forEach(imp => {
                    analysis += `- ${imp}\n`;
                });
                analysis += '\n';
            }

            // Analyze dependencies
            const dependencies = await this.getPackageDependencies();
            if (dependencies) {
                analysis += `📦 Package Dependencies:\n`;
                dependencies.forEach(dep => {
                    analysis += `- ${dep.name}: ${dep.version}\n`;
                });
            }

            return analysis;
        } catch (error) {
            console.error('Error analyzing dependencies:', error);
            throw new Error(`Failed to analyze dependencies: ${error}`);
        }
    }

    async understandCode(filePath: string): Promise<string> {
        try {
            const content = await this.readFile(filePath);
            
            let understanding = `🧠 Code Understanding for ${filePath}:\n\n`;
            
            // File purpose
            understanding += `🎯 File Purpose:\n`;
            understanding += this.analyzeFilePurpose(content);
            understanding += '\n';

            // Key components
            understanding += `🔑 Key Components:\n`;
            const components = this.analyzeKeyComponents(content);
            components.forEach(comp => {
                understanding += `- ${comp.name} (${comp.type})\n`;
                understanding += `  ${comp.description}\n`;
            });
            understanding += '\n';

            // Code flow
            understanding += `🔄 Code Flow:\n`;
            understanding += this.analyzeCodeFlow(content);
            understanding += '\n';

            // Dependencies and relationships
            understanding += `🔗 Dependencies and Relationships:\n`;
            understanding += this.analyzeRelationships(content);
            understanding += '\n';

            // Potential issues
            understanding += `⚠️ Potential Issues:\n`;
            const issues = this.analyzePotentialIssues(content);
            issues.forEach(issue => {
                understanding += `- ${issue}\n`;
            });

            return understanding;
        } catch (error) {
            console.error('Error understanding code:', error);
            throw new Error(`Failed to understand code: ${error}`);
        }
    }

    private extractFunctions(content: string): Array<{ name: string, content: string, lines: number }> {
        const functions: Array<{ name: string, content: string, lines: number }> = [];
        const lines = content.split('\n');
        let currentFunction: { name: string, content: string, lines: number } | null = null;
        let functionContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().match(/^(async\s+)?function\s+\w+/) || line.trim().match(/^(async\s+)?\w+\s*=\s*function/)) {
                if (currentFunction) {
                    functions.push(currentFunction);
                }
                currentFunction = {
                    name: line.match(/\w+/)?.[0] || 'anonymous',
                    content: line,
                    lines: 1
                };
                functionContent = [line];
            } else if (currentFunction) {
                functionContent.push(line);
                currentFunction.content = functionContent.join('\n');
                currentFunction.lines = functionContent.length;
            }
        }

        if (currentFunction) {
            functions.push(currentFunction);
        }

        return functions;
    }

    private extractClasses(content: string): Array<{ name: string, content: string }> {
        const classes: Array<{ name: string, content: string }> = [];
        const lines = content.split('\n');
        let currentClass: { name: string, content: string } | null = null;
        let classContent: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().match(/^class\s+\w+/)) {
                if (currentClass) {
                    classes.push(currentClass);
                }
                currentClass = {
                    name: line.match(/\w+/)?.[0] || 'anonymous',
                    content: line
                };
                classContent = [line];
            } else if (currentClass) {
                classContent.push(line);
                currentClass.content = classContent.join('\n');
            }
        }

        if (currentClass) {
            classes.push(currentClass);
        }

        return classes;
    }

    private calculateFunctionComplexity(content: string): number {
        let complexity = 1;
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('if') || 
                trimmed.includes('else') || 
                trimmed.includes('for') || 
                trimmed.includes('while') || 
                trimmed.includes('switch') || 
                trimmed.includes('catch') ||
                trimmed.includes('&&') ||
                trimmed.includes('||')) {
                complexity++;
            }
        }
        
        return complexity;
    }

    private findCodeDuplicates(content: string): Array<{ startLine: number, endLine: number }> {
        const duplicates: Array<{ startLine: number, endLine: number }> = [];
        const lines = content.split('\n');
        const windowSize = 5; // Look for 5-line duplicates

        for (let i = 0; i < lines.length - windowSize; i++) {
            const window = lines.slice(i, i + windowSize).join('\n');
            for (let j = i + windowSize; j < lines.length - windowSize; j++) {
                const compareWindow = lines.slice(j, j + windowSize).join('\n');
                if (window === compareWindow) {
                    duplicates.push({
                        startLine: i + 1,
                        endLine: i + windowSize
                    });
                }
            }
        }

        return duplicates;
    }

    private checkNamingConventions(content: string): string[] {
        const issues: string[] = [];
        const lines = content.split('\n');

        // Check for camelCase in variables and functions
        const camelCaseRegex = /^[a-z][a-zA-Z0-9]*$/;
        const pascalCaseRegex = /^[A-Z][a-zA-Z0-9]*$/;

        lines.forEach((line, index) => {
            // Check variable declarations
            const varMatch = line.match(/^(const|let|var)\s+(\w+)/);
            if (varMatch && !camelCaseRegex.test(varMatch[2])) {
                issues.push(`Line ${index + 1}: Variable '${varMatch[2]}' should use camelCase`);
            }

            // Check function declarations
            const funcMatch = line.match(/^(async\s+)?function\s+(\w+)/);
            if (funcMatch && !camelCaseRegex.test(funcMatch[2])) {
                issues.push(`Line ${index + 1}: Function '${funcMatch[2]}' should use camelCase`);
            }

            // Check class declarations
            const classMatch = line.match(/^class\s+(\w+)/);
            if (classMatch && !pascalCaseRegex.test(classMatch[1])) {
                issues.push(`Line ${index + 1}: Class '${classMatch[1]}' should use PascalCase`);
            }
        });

        return issues;
    }

    private extractImports(content: string): string[] {
        const imports: string[] = [];
        const lines = content.split('\n');
        
        lines.forEach(line => {
            if (line.trim().startsWith('import')) {
                imports.push(line.trim());
            }
        });
        
        return imports;
    }

    private findUnusedImports(content: string, imports: string[]): string[] {
        const unused: string[] = [];
        
        imports.forEach(imp => {
            const importName = imp.match(/from\s+['"]([^'"]+)['"]/)?.[1] || 
                             imp.match(/import\s+(\w+)/)?.[1];
            if (importName && !content.includes(importName)) {
                unused.push(imp);
            }
        });
        
        return unused;
    }

    private async getPackageDependencies(): Promise<Array<{ name: string, version: string }>> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            const packageJsonPath = vscode.Uri.joinPath(workspaceFolders[0].uri, 'package.json');
            const document = await vscode.workspace.openTextDocument(packageJsonPath);
            const packageJson = JSON.parse(document.getText());

            const dependencies = [
                ...Object.entries(packageJson.dependencies || {}).map(([name, version]) => ({ name, version: version as string })),
                ...Object.entries(packageJson.devDependencies || {}).map(([name, version]) => ({ name, version: version as string }))
            ];

            return dependencies;
        } catch (error) {
            console.error('Error reading package.json:', error);
            return [];
        }
    }

    private analyzeFilePurpose(content: string): string {
        const lines = content.split('\n');
        const firstLine = lines[0].trim();
        
        if (firstLine.startsWith('//') || firstLine.startsWith('/*')) {
            return firstLine.replace(/^\/\/\s*|\/\*\s*|\s*\*\/$/, '');
        }
        
        return "This file appears to be a source code file. Purpose could not be determined from comments.";
    }

    private analyzeKeyComponents(content: string): Array<{ name: string, type: string, description: string }> {
        const components: Array<{ name: string, type: string, description: string }> = [];
        
        // Analyze classes
        const classes = this.extractClasses(content);
        classes.forEach(cls => {
            components.push({
                name: cls.name,
                type: 'Class',
                description: `A class with ${cls.content.split('\n').length} lines of code`
            });
        });
        
        // Analyze functions
        const functions = this.extractFunctions(content);
        functions.forEach(func => {
            components.push({
                name: func.name,
                type: 'Function',
                description: `A function with ${func.lines} lines of code`
            });
        });
        
        return components;
    }

    private analyzeCodeFlow(content: string): string {
        const lines = content.split('\n');
        let flow = '';
        
        // Analyze main execution flow
        const mainFlow = lines.filter(line => 
            line.trim().startsWith('if') || 
            line.trim().startsWith('for') || 
            line.trim().startsWith('while') || 
            line.trim().startsWith('switch')
        );
        
        if (mainFlow.length > 0) {
            flow += 'Main execution flow includes:\n';
            mainFlow.forEach(line => {
                flow += `- ${line.trim()}\n`;
            });
        } else {
            flow += 'Linear execution flow with no conditional branches\n';
        }
        
        return flow;
    }

    private analyzeRelationships(content: string): string {
        const relationships: string[] = [];
        
        // Analyze imports
        const imports = this.extractImports(content);
        if (imports.length > 0) {
            relationships.push('Imports:');
            imports.forEach(imp => {
                relationships.push(`- ${imp}`);
            });
        }
        
        // Analyze class inheritance
        const classLines = content.split('\n').filter(line => line.trim().startsWith('class'));
        if (classLines.length > 0) {
            relationships.push('\nClass Relationships:');
            classLines.forEach(line => {
                const extendsMatch = line.match(/extends\s+(\w+)/);
                if (extendsMatch) {
                    relationships.push(`- Extends ${extendsMatch[1]}`);
                }
            });
        }
        
        return relationships.join('\n');
    }

    private analyzePotentialIssues(content: string): string[] {
        const issues: string[] = [];
        
        // Check for long functions
        const functions = this.extractFunctions(content);
        functions.forEach(func => {
            if (func.lines > 20) {
                issues.push(`Long function '${func.name}' (${func.lines} lines)`);
            }
        });
        
        // Check for complex functions
        functions.forEach(func => {
            if (this.calculateFunctionComplexity(func.content) > 5) {
                issues.push(`Complex function '${func.name}' (complexity: ${this.calculateFunctionComplexity(func.content)})`);
            }
        });
        
        // Check for code duplication
        const duplicates = this.findCodeDuplicates(content);
        if (duplicates.length > 0) {
            issues.push(`${duplicates.length} potential code duplications found`);
        }
        
        return issues;
    }

    async handleCommand(command: string): Promise<string> {
        const cmd = command.trim().toLowerCase();
        
        try {
            // Add the command to history first
            this.messageHistory.push({
                role: 'user',
                content: command,
                timestamp: new Date().toISOString()
            });

            // Split command and query
            const [cmdPart, ...queryParts] = cmd.split(':');
            const query = queryParts.join(':').trim();
            const baseCmd = cmdPart.trim();

            switch (baseCmd) {
                case '@help':
                    return `Available commands:
@help - Show this help message
@list - List available models
@clear - Clear chat history
@model <n> - Change the current model
@info - Show current model information
@workspace: <query> - Use workspace as context and answer the query
@read <file>: <query> - Use file as context and answer the query
@analyze <file> - Analyze code in a file
@search <query> - Search code in workspace
@edit <file> <line> <content> - Edit a file
@explain <file> - Explain code in a file
@refactor <file> - Suggest refactoring
@deps <file> - Analyze dependencies
@understand <file> - Get detailed code understanding with context`;
                
                case '@list':
                    const models = await this.listModels();
                    return `Available models:\n${models.map(m => `- ${m.name} (${m.size})`).join('\n')}`;
                
                case '@clear':
                    this.clearHistory();
                    return 'Chat history cleared';
                
                case '@info':
                    return `Current model: ${this.model}`;
                
                case '@workspace':
                    if (!query) {
                        return 'Please provide a query after @workspace:';
                    }
                    const workspaceFiles = await this.scanWorkspace();
                    // Create a prompt with workspace context and query
                    const workspacePrompt = `Workspace Context:\n${workspaceFiles}\n\nUser Query: ${query}`;
                    
                    // Send to Ollama with workspace context
                    const workspaceResponse = await fetch(`${this.apiUrl}/api/chat`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            model: this.model,
                            messages: [
                                {
                                    role: 'user',
                                    content: workspacePrompt
                                }
                            ],
                            stream: false,
                        }),
                    });

                    if (!workspaceResponse.ok) {
                        throw new Error(`HTTP error! status: ${workspaceResponse.status}`);
                    }

                    const workspaceData = await workspaceResponse.json() as OllamaResponse;
                    return workspaceData.message.content;
                
                default:
                    if (baseCmd.startsWith('@model ')) {
                        const modelName = baseCmd.slice(7).trim();
                        const models = await this.listModels();
                        if (models.some(m => m.name === modelName)) {
                            this.setModel(modelName);
                            this.clearHistory();
                            return `Model changed to: ${modelName}`;
                        } else {
                            return `Error: Model "${modelName}" not found`;
                        }
                    } else if (baseCmd.startsWith('@read ')) {
                        const filePath = baseCmd.slice(6).trim();
                        if (!query) {
                            return 'Please provide a query after the file path:';
                        }
                        const fileContent = await this.readFile(filePath);
                        
                        // Create a prompt with file context and query
                        const filePrompt = `File Context (${filePath}):\n${fileContent}\n\nUser Query: ${query}`;
                        
                        // Send to Ollama with file context
                        const fileResponse = await fetch(`${this.apiUrl}/api/chat`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                model: this.model,
                                messages: [
                                    {
                                        role: 'user',
                                        content: filePrompt
                                    }
                                ],
                                stream: false,
                            }),
                        });

                        if (!fileResponse.ok) {
                            throw new Error(`HTTP error! status: ${fileResponse.status}`);
                        }

                        const fileData = await fileResponse.json() as OllamaResponse;
                        return fileData.message.content;
                    } else if (baseCmd.startsWith('@understand ')) {
                        const filePath = baseCmd.slice(12).trim();
                        const fileContent = await this.readFile(filePath);
                        
                        // Create a prompt for the model to understand the file
                        const prompt = `Please analyze and explain this code file in detail:
File path: ${filePath}
Content:
${fileContent}

Please provide:
1. A high-level overview of what this file does
2. Key functions and their purposes
3. Important data structures or patterns used
4. Any notable dependencies or relationships with other files
5. Potential areas for improvement or optimization`;

                        // Send to Ollama with the file context
                        const response = await fetch(`${this.apiUrl}/api/chat`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                model: this.model,
                                messages: [
                                    {
                                        role: 'user',
                                        content: prompt
                                    }
                                ],
                                stream: false,
                            }),
                        });

                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        const data = await response.json() as OllamaResponse;
                        return data.message.content;
                    } else if (baseCmd.startsWith('@analyze ')) {
                        const filePath = baseCmd.slice(9).trim();
                        return await this.analyzeCode(filePath);
                    } else if (baseCmd.startsWith('@search ')) {
                        const searchQuery = baseCmd.slice(8).trim();
                        return await this.searchCode(searchQuery);
                    } else if (baseCmd.startsWith('@edit ')) {
                        const [_, filePath, line, content] = baseCmd.match(/@edit\s+(\S+)\s+(\d+)\s+(.+)/i) || [];
                        if (filePath && line && content) {
                            return await this.editFile(filePath, parseInt(line), content);
                        }
                        return 'Error: Invalid edit command format. Use @edit <file> <line> <content>';
                    } else if (baseCmd.startsWith('@explain ')) {
                        const filePath = baseCmd.slice(9).trim();
                        return await this.explainCode(filePath);
                    } else if (baseCmd.startsWith('@refactor ')) {
                        const filePath = baseCmd.slice(10).trim();
                        return await this.suggestRefactoring(filePath);
                    } else if (baseCmd.startsWith('@deps ')) {
                        const filePath = baseCmd.slice(6).trim();
                        return await this.analyzeDependencies(filePath);
                    }
                    return `Unknown command: ${baseCmd}\nType @help to see available commands`;
            }
        } catch (error) {
            console.error('Error handling command:', error);
            return `Error executing command: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    addToHistory(message: ChatMessage) {
        this.messageHistory.push(message);
    }

    // Add new properties for context
    private workspaceContext: string = '';
    private currentFileContext: { path: string; content: string } | null = null;
} 