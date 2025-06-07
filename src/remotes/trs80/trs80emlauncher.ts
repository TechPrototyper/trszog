import {spawn, ChildProcess} from 'child_process';
import {Settings} from '../../settings/settings';
import {Utility} from '../../misc/utility';
import {LogTransport} from '../../log';
import * as path from 'path';
import * as fs from 'fs';

/**
 * trs80gp Emulator Launcher
 * Handles launching the real trs80gp emulator with various command-line options
 * including model selection, memory size, disk images, cassette tapes, and 
 * serial interface configuration.
 */
export class Trs80EmulatorLauncher {
    // The spawned emulator process
    private emulatorProcess: ChildProcess | undefined;

    // Flag to track if the emulator was launched by DeZog
    private wasLaunchedByDeZog = false;
    
    /**
     * Constructor
     */
    constructor() {
        // No initialization required
    }

    /**
     * Launch the trs80gp emulator with configured options.
     * @returns Promise that resolves when the emulator is ready for connection
     */
    public async launchEmulator(): Promise<void> {
        const emulatorConfig = Settings.launch.trs80?.emulator;
        
        // Check for auto-start disabled
        if (!emulatorConfig || !emulatorConfig.autoStart) {
            LogTransport.log('trs80gp emulator auto-start disabled');
            return;
        }

        return this.launchRealEmulator();
    }
    
    /**
     * Launch the real trs80gp emulator
     */
    private async launchRealEmulator(): Promise<void> {
        const emulatorConfig = Settings.launch.trs80?.emulator;
        
        if (!emulatorConfig || !emulatorConfig.path) {
            throw new Error('trs80gp emulator path not configured');
        }

        // Check if emulator executable exists
        if (!fs.existsSync(emulatorConfig.path)) {
            throw new Error(`trs80gp emulator not found at: ${emulatorConfig.path}`);
        }

        LogTransport.log('Launching trs80gp emulator...');

        // Build command line arguments
        const args = this.buildCommandLineArgs(emulatorConfig);
        
        // Set working directory
        const workingDir = emulatorConfig.workingDirectory || path.dirname(emulatorConfig.path);

        LogTransport.log(`Starting: ${emulatorConfig.path} ${args.join(' ')}`);
        LogTransport.log(`Working directory: ${workingDir}`);

        try {
            // Spawn the emulator process
            this.emulatorProcess = spawn(emulatorConfig.path, args, {
                cwd: workingDir,
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.wasLaunchedByDeZog = true;

            // Set up process event handlers
            this.setupProcessHandlers();

            // Wait for the emulator to start and be ready for connections
            await this.waitForEmulatorReady();

            LogTransport.log('trs80gp emulator launched successfully');

        } catch (error) {
            throw new Error(`Failed to launch trs80gp emulator: ${error.message}`);
        }
    }

    /**
     * Build command line arguments for the trs80gp emulator.
     * @param config The emulator configuration
     * @returns Array of command line arguments
     */
    private buildCommandLineArgs(config: any): string[] {
        const args: string[] = [];

        // Model selection (-m1, -m3, -m4)
        if (config.model) {
            args.push(`-m${config.model}`);
        }

        // Memory size configuration
        if (config.memorySize) {
            args.push('-mem', config.memorySize.toString());
        }

        // Disk image mounting
        if (config.drive0) {
            // Resolve relative paths
            const drive0Path = path.isAbsolute(config.drive0) ? 
                config.drive0 : 
                path.resolve(Utility.getRootPath(), config.drive0);
            
            if (fs.existsSync(drive0Path)) {
                args.push('-disk0', drive0Path);
            } else {
                LogTransport.log(`Warning: Drive 0 disk image not found: ${drive0Path}`);
            }
        }

        if (config.drive1) {
            const drive1Path = path.isAbsolute(config.drive1) ? 
                config.drive1 : 
                path.resolve(Utility.getRootPath(), config.drive1);
            
            if (fs.existsSync(drive1Path)) {
                args.push('-disk1', drive1Path);
            } else {
                LogTransport.log(`Warning: Drive 1 disk image not found: ${drive1Path}`);
            }
        }

        // Cassette tape loading
        if (config.cassette) {
            const cassettePath = path.isAbsolute(config.cassette) ? 
                config.cassette : 
                path.resolve(Utility.getRootPath(), config.cassette);
            
            if (fs.existsSync(cassettePath)) {
                args.push('-cassette', cassettePath);
            } else {
                LogTransport.log(`Warning: Cassette tape file not found: ${cassettePath}`);
            }
        }

        // Symbols file loading
        if (config.symbolsFile) {
            const symbolsPath = path.isAbsolute(config.symbolsFile) ? 
                config.symbolsFile : 
                path.resolve(Utility.getRootPath(), config.symbolsFile);
            
            if (fs.existsSync(symbolsPath)) {
                args.push('-symbols', symbolsPath);
            } else {
                LogTransport.log(`Warning: Symbols file not found: ${symbolsPath}`);
            }
        }

        // Enable serial/JSON-RPC interface for debugging
        if (config.enableSerial) {
            args.push('-serial');
            
            // Add port if specified in TRS-80 configuration
            const port = Settings.launch.trs80?.port;
            if (port) {
                args.push('-port', port.toString());
            }
        }

        // Additional command line arguments
        if (config.additionalArgs && Array.isArray(config.additionalArgs)) {
            args.push(...config.additionalArgs);
        }

        return args;
    }

    /**
     * Set up event handlers for the emulator process.
     */
    private setupProcessHandlers(): void {
        if (!this.emulatorProcess) return;

        this.emulatorProcess.on('error', (error) => {
            LogTransport.log(`trs80gp emulator process error: ${error.message}`);
        });

        this.emulatorProcess.on('exit', (code, signal) => {
            if (code !== null) {
                LogTransport.log(`trs80gp emulator exited with code: ${code}`);
            } else if (signal) {
                LogTransport.log(`trs80gp emulator terminated by signal: ${signal}`);
            }
            this.emulatorProcess = undefined;
        });

        // Log stdout output
        if (this.emulatorProcess.stdout) {
            this.emulatorProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    LogTransport.log(`trs80gp stdout: ${output}`);
                }
            });
        }

        // Log stderr output
        if (this.emulatorProcess.stderr) {
            this.emulatorProcess.stderr.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    LogTransport.log(`trs80gp stderr: ${output}`);
                }
            });
        }
    }

    /**
     * Wait for the emulator to be ready for connections.
     * This implements a simple delay-based approach.
     * In a real implementation, you might want to check for specific output
     * or try to connect to the serial port.
     */
    private async waitForEmulatorReady(): Promise<void> {
        // Wait a bit for the emulator to start up
        const startupDelay = 3000; // 3 seconds
        await new Promise(resolve => setTimeout(resolve, startupDelay));

        // Verify the process is still running
        if (!this.emulatorProcess || this.emulatorProcess.exitCode !== null) {
            throw new Error('trs80gp emulator process terminated unexpectedly');
        }
    }

    /**
     * Terminate the emulator process if launched by DeZog.
     */
    public async terminateEmulator(): Promise<void> {
        if (!this.emulatorProcess || !this.wasLaunchedByDeZog) {
            return;
        }

        LogTransport.log('Terminating trs80gp emulator...');

        return new Promise<void>((resolve) => {
            if (!this.emulatorProcess) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                // Force kill if graceful termination fails
                if (this.emulatorProcess && !this.emulatorProcess.killed) {
                    LogTransport.log('Force killing trs80gp emulator...');
                    this.emulatorProcess.kill('SIGKILL');
                }
                resolve();
            }, 5000);

            this.emulatorProcess.once('exit', () => {
                clearTimeout(timeout);
                LogTransport.log('trs80gp emulator terminated');
                this.emulatorProcess = undefined;
                this.wasLaunchedByDeZog = false;
                resolve();
            });

            // Try graceful termination first
            this.emulatorProcess.kill('SIGTERM');
        });
    }

    /**
     * Check if the emulator process is running.
     */
    public isEmulatorRunning(): boolean {
        return this.emulatorProcess !== undefined && 
            this.emulatorProcess.exitCode === null;
    }

    /**
     * Get the process ID of the running emulator.
     */
    public getEmulatorPid(): number | undefined {
        return this.emulatorProcess?.pid;
    }

    /**
     * Validate the emulator configuration.
     * @param config The emulator configuration to validate
     * @throws Error if configuration is invalid
     */
    public static validateConfiguration(config: any): void {
        if (!config) return;

        // Validate model selection
        if (config.model && ![1, 3, 4].includes(config.model)) {
            throw new Error('Invalid TRS-80 model. Must be 1, 3, or 4.');
        }

        // Validate memory size
        if (config.memorySize && (config.memorySize < 16 || config.memorySize > 512)) {
            throw new Error('Invalid memory size. Must be between 16 and 512 KB.');
        }

        // Validate file paths if specified
        const filePaths = [
            { path: config.drive0, name: 'drive0' },
            { path: config.drive1, name: 'drive1' },
            { path: config.cassette, name: 'cassette' },
            { path: config.symbolsFile, name: 'symbolsFile' }
        ];

        for (const file of filePaths) {
            if (file.path) {
                const fullPath = path.isAbsolute(file.path) ? 
                    file.path : 
                    path.resolve(Utility.getRootPath(), file.path);
                
                if (!fs.existsSync(fullPath)) {
                    LogTransport.log(`Warning: ${file.name} file not found: ${fullPath}`);
                }
            }
        }
    }
}
