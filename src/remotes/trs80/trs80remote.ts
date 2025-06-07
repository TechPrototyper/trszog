import {Trs80Model1Remote} from './trs80model1remote';
import {Trs80Model3Remote} from './trs80model3remote';
import {Trs80EmulatorLauncher} from './trs80emlauncher';
import {Trs80MockServerLauncher} from './trs80mockserverlauncher';
import {Settings} from '../../settings/settings';
import {LogTransport} from '../../log';
import {RemoteBase} from '../remotebase';
import * as fs from 'fs';

/**
 * Main TRS-80 Remote implementation that selects the appropriate
 * model-specific remote based on configuration and handles emulator launching.
 */
export class Trs80Remote extends RemoteBase {
    
    private modelRemote: Trs80Model1Remote | Trs80Model3Remote;
    private emulatorLauncher?: Trs80EmulatorLauncher;
    private mockServerLauncher?: Trs80MockServerLauncher;
    private useMockServer: boolean;

    /**
     * Constructor for TRS-80 Remote.
     * Selects the appropriate model implementation based on configuration.
     */
    constructor() {
        super();
        
        // Determine which model implementation to use based on configuration
        const model = Settings.launch.trs80.emulator?.model || 1;
        
        switch (model) {
            case 1:
                this.modelRemote = new Trs80Model1Remote();
                LogTransport.log('TRS-80: Using Model 1 implementation');
                break;
            case 3:
                this.modelRemote = new Trs80Model3Remote();
                LogTransport.log('TRS-80: Using Model 3 implementation');
                break;
            default:
                // Default to Model 1 for unsupported models
                this.modelRemote = new Trs80Model1Remote();
                LogTransport.log(`TRS-80: Model ${model} not fully supported, defaulting to Model 1`);
                break;
        }
        
        // Forward events from the model remote
        this.modelRemote.on('debug_console', (text) => this.emit('debug_console', text));
        this.modelRemote.on('coverage', (coverage) => this.emit('coverage', coverage));
        this.modelRemote.on('revDbgData', (data) => this.emit('revDbgData', data));
        this.modelRemote.on('warning', (message) => this.emit('warning', message));
        this.modelRemote.on('received-slots-data', (data) => this.emit('received-slots-data', data));
        
        // Determine whether to use mock server or real emulator
        this.useMockServer = this.shouldUseMockServer();
        
        // Set up the appropriate launcher
        if (this.useMockServer) {
            this.mockServerLauncher = new Trs80MockServerLauncher(Settings.launch.trs80.port);
        } else {
            this.emulatorLauncher = new Trs80EmulatorLauncher();
        }
    }

    /**
     * Determine if we should use the mock server based on configuration
     */
    private shouldUseMockServer(): boolean {
        // Use mock if explicitly configured in settings
        if (Settings.launch.trs80.useMock === true) {
            LogTransport.log('TRS-80: Using mock server (explicitly configured)');
            return true;
        }
        
        // If no emulator path provided or it doesn't exist, use mock
        const emulatorConfig = Settings.launch.trs80.emulator;
        if (!emulatorConfig || !emulatorConfig.path) {
            LogTransport.log('TRS-80: Using mock server (no emulator path provided)');
            return true;
        }
        
        if (!fs.existsSync(emulatorConfig.path)) {
            LogTransport.log(`TRS-80: Using mock server (emulator path not found: ${emulatorConfig.path})`);
            return true;
        }
        
        // Use real emulator
        return false;
    }

    /**
     * Initialize the TRS-80 remote connection.
     * Launches emulator or mock server if configured, then initializes the connection.
     */
    public async init(): Promise<void> {
        console.log('Trs80Remote.init() - Starting TRS-80 remote initialization');
        LogTransport.log('TRS-80: Starting remote initialization');
        
        try {
            // Launch real emulator if configured
            if (!this.useMockServer && this.emulatorLauncher) {
                console.log('Trs80Remote.init() - Launching real emulator');
                LogTransport.log('TRS-80: Launching emulator...');
                await this.emulatorLauncher.launchEmulator();
                console.log('Trs80Remote.init() - Emulator launched successfully');
                LogTransport.log('TRS-80: Emulator launched successfully');
            }
            // Or launch mock server if configured
            else if (this.useMockServer && this.mockServerLauncher) {
                console.log('Trs80Remote.init() - Starting mock server');
                LogTransport.log('TRS-80: Starting mock server...');
                await this.mockServerLauncher.start();
                console.log(`Trs80Remote.init() - Mock server started on port ${this.mockServerLauncher.getPort()}`);
                LogTransport.log(`TRS-80: Mock server started on port ${this.mockServerLauncher.getPort()}`);
            }
            
            // Wait a moment for the server/emulator to be ready
            console.log('Trs80Remote.init() - Waiting 2 seconds for server/emulator to be ready');
            LogTransport.log('TRS-80: Waiting for server/emulator to be ready...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Initialize the model-specific remote
            console.log('Trs80Remote.init() - Initializing model-specific remote');
            LogTransport.log('TRS-80: Initializing model-specific remote');
            await this.modelRemote.init();
            
            console.log('Trs80Remote.init() - TRS-80 remote initialization completed successfully');
            LogTransport.log('TRS-80: Remote initialization completed successfully');
        } catch (error) {
            console.log(`Trs80Remote.init() - Failed to initialize: ${error.message}`);
            LogTransport.log(`TRS-80: Failed to initialize - ${error.message}`);
            throw error;
        }
    }

    /**
     * Disconnect and cleanup.
     */
    public async disconnect(): Promise<void> {
        try {
            await this.modelRemote.disconnect();
        } finally {
            // Terminate emulator if we launched it
            if (!this.useMockServer && this.emulatorLauncher) {
                await this.emulatorLauncher.terminateEmulator();
            }
            
            // Stop mock server if we launched it
            if (this.useMockServer && this.mockServerLauncher) {
                this.mockServerLauncher.stop();
            }
        }
    }

    // Delegate all DZRP methods to the model-specific remote
    public async sendDzrpCmdInit() { return this.modelRemote.sendDzrpCmdInit(); }
    public async sendDzrpCmdGetRegisters() { return this.modelRemote.sendDzrpCmdGetRegisters(); }
    public async sendDzrpCmdSetRegister(regIndex: number, value: number) { return this.modelRemote.sendDzrpCmdSetRegister(regIndex, value); }
    public async sendDzrpCmdWriteMem(address: number, data: Uint8Array) { return this.modelRemote.sendDzrpCmdWriteMem(address, data); }
    public async sendDzrpCmdReadMem(address: number, size: number) { return this.modelRemote.sendDzrpCmdReadMem(address, size); }
    public async sendDzrpCmdContinue() { return this.modelRemote.sendDzrpCmdContinue(); }
    public async sendDzrpCmdPause() { return this.modelRemote.sendDzrpCmdPause(); }
    public async sendDzrpCmdStepOver() { return this.modelRemote.sendDzrpCmdStepOver(); }
    public async sendDzrpCmdStepInto() { return this.modelRemote.sendDzrpCmdStepInto(); }
    public async sendDzrpCmdLoadObj(filePath: string) { return this.modelRemote.sendDzrpCmdLoadObj(filePath); }
    public async sendDzrpCmdSaveObj(startAddress: number, endAddress: number, filePath: string, execAddress?: number) { return this.modelRemote.sendDzrpCmdSaveObj(startAddress, endAddress, filePath, execAddress); }
    public async sendDzrpCmdGetSlots() { return this.modelRemote.sendDzrpCmdGetSlots(); }
    public sendDzrpCmdSetSlot(slot: number, bank: number) { return this.modelRemote.sendDzrpCmdSetSlot(slot, bank); }
    public async sendDzrpCmdGetTbblueReg(register: number) { return this.modelRemote.sendDzrpCmdGetTbblueReg(register); }
}
