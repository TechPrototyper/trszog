import {spawn, ChildProcess} from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {Utility} from '../../misc/utility';

/**
 * TRS-80GP Mock Server Launcher
 * Handles launching and managing the mock TRS-80GP server for development and testing.
 */
export class Trs80MockServerLauncher {
    private mockServerProcess: ChildProcess | undefined;
    private mockServerPort: number;
    private mockServerPath: string;

    constructor(port: number = 49152) {
        this.mockServerPort = port;
        
        // Get the path to the mock server
        // First try finding the path relative to the current execution context (for tests)
        const basePath = process.cwd();
        const devPath = path.join(basePath, 'src', 'remotes', 'trs80', 'mock-server');
        const outPath = path.join(basePath, 'out', 'src', 'remotes', 'trs80', 'mock-server');
        
        if (fs.existsSync(devPath)) {
            this.mockServerPath = devPath;
        } else if (fs.existsSync(outPath)) {
            this.mockServerPath = outPath;
        } else {
            // Fall back to extension path as a last resort
            const extensionPath = Utility.getExtensionPath();
            if (extensionPath) {
                // First try the out directory (for compiled source)
                const extensionOutPath = path.join(extensionPath, 'out', 'src', 'remotes', 'trs80', 'mock-server');
                // Then try the src directory (for packaged source)
                const extensionSrcPath = path.join(extensionPath, 'src', 'remotes', 'trs80', 'mock-server');
                
                if (fs.existsSync(extensionOutPath)) {
                    this.mockServerPath = extensionOutPath;
                } else if (fs.existsSync(extensionSrcPath)) {
                    this.mockServerPath = extensionSrcPath;
                } else {
                    this.mockServerPath = extensionOutPath; // Default fallback
                }
            } else {
                // For testing without extension context, use source directory
                this.mockServerPath = path.join(basePath, 'src', 'remotes', 'trs80', 'mock-server');
            }
        }
    }

    /**
     * Start the TRS-80GP mock server.
     * @returns Promise that resolves when the server is ready
     */
    public async start(): Promise<void> {
        // Check if mock server files exist - try both dist/ and direct locations
        let serverScriptPath = path.join(this.mockServerPath, 'dist', 'server.js');
        if (!fs.existsSync(serverScriptPath)) {
            serverScriptPath = path.join(this.mockServerPath, 'server.js');
        }
        const packageJsonPath = path.join(this.mockServerPath, 'package.json');

        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`TRS-80GP mock server not found at: ${this.mockServerPath}`);
        }

        // Build the mock server if needed
        if (!fs.existsSync(serverScriptPath)) {
            await this.buildMockServer();
        }

        // Start the mock server process
        return new Promise((resolve, reject) => {
            console.log(`Starting mock server from: ${serverScriptPath}`);
            this.mockServerProcess = spawn('node', [serverScriptPath, this.mockServerPort.toString()], {
                cwd: this.mockServerPath,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let serverReady = false;

            // Handle stdout
            this.mockServerProcess.stdout?.on('data', (data: Buffer) => {
                const output = data.toString();
                console.log(`[TRS-80GP Mock] ${output.trim()}`);
                
                // Check if server is ready - look for the listening message
                if (output.includes('listening on port') && !serverReady) {
                    serverReady = true;
                    console.log('[TRS-80GP Mock] Server startup detected, resolving...');
                    resolve();
                }
            });

            // Handle stderr
            this.mockServerProcess.stderr?.on('data', (data: Buffer) => {
                const error = data.toString();
                console.error(`[TRS-80GP Mock] ${error.trim()}`);
            });

            // Handle process exit
            this.mockServerProcess.on('exit', (code: number | null) => {
                if (!serverReady) {
                    console.error(`[TRS-80GP Mock] Process exited before server was ready (exit code: ${code})`);
                    reject(new Error(`TRS-80GP mock server failed to start (exit code: ${code})`));
                } else {
                    console.log(`[TRS-80GP Mock] Server stopped (exit code: ${code})`);
                }
                this.mockServerProcess = undefined;
            });

            // Handle process errors
            this.mockServerProcess.on('error', (error: Error) => {
                if (!serverReady) {
                    reject(new Error(`Failed to start TRS-80GP mock server: ${error.message}`));
                } else {
                    console.error(`[TRS-80GP Mock] Process error: ${error.message}`);
                }
            });

            // Set a timeout for server startup
            setTimeout(() => {
                if (!serverReady) {
                    console.error('[TRS-80GP Mock] Server startup timeout');
                    this.stop();
                    reject(new Error('TRS-80GP mock server startup timeout'));
                }
            }, 15000); // Increased to 15 second timeout
        });
    }

    /**
     * Stop the TRS-80GP mock server.
     */
    public stop(): void {
        if (this.mockServerProcess) {
            this.mockServerProcess.kill('SIGTERM');
            this.mockServerProcess = undefined;
        }
    }

    /**
     * Check if the mock server is currently running.
     */
    public isRunning(): boolean {
        return this.mockServerProcess !== undefined && !this.mockServerProcess.killed;
    }

    /**
     * Get the port the mock server is listening on.
     */
    public getPort(): number {
        return this.mockServerPort;
    }

    /**
     * Build the mock server TypeScript code.
     */
    private async buildMockServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`Building mock server at: ${this.mockServerPath}`);
            const buildProcess = spawn('npm', ['run', 'build'], {
                cwd: this.mockServerPath,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let buildOutput = '';
            let buildError = '';

            buildProcess.stdout?.on('data', (data: Buffer) => {
                buildOutput += data.toString();
            });

            buildProcess.stderr?.on('data', (data: Buffer) => {
                buildError += data.toString();
            });

            buildProcess.on('exit', (code: number | null) => {
                if (code === 0) {
                    console.log('[TRS-80GP Mock] Build completed successfully');
                    resolve();
                } else {
                    console.error('[TRS-80GP Mock] Build failed:');
                    console.error(buildOutput);
                    console.error(buildError);
                    reject(new Error(`Mock server build failed with exit code: ${code}`));
                }
            });

            buildProcess.on('error', (error: Error) => {
                reject(new Error(`Failed to build mock server: ${error.message}`));
            });
        });
    }
}
