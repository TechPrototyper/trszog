import {Settings} from '../../settings/settings';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {DzrpMachineType} from '../dzrp/dzrpremote';
import {Socket} from 'net';
import {PortManager} from './portmanager';

/**
 * JSON-RPC message interface for communication with trs80gp emulator.
 */
interface JsonRpcMessage {
    jsonrpc: string;  // Always "2.0"
    method?: string;  // For requests
    params?: any;     // Parameters for requests
    id?: number | string;  // Request ID
    result?: any;     // For responses
    error?: {         // For error responses
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Base TRS-80GP Remote class that handles communication with trs80gp emulator via JSON-RPC over TCP.
 * This class contains the common functionality for all TRS-80 models supported by the trs80gp emulator.
 * 
 * Model-specific implementations should extend this class and override methods as needed
 * for model-specific features like memory mapping, screen sizes, etc.
 */
export abstract class Trs80GpRemote extends DzrpQueuedRemote {
    
    // Socket connection to trs80gp emulator
    protected socket: Socket;
    
    // Allocated port for this emulator instance
    protected allocatedPort: number | undefined;
    
    // Request ID counter for JSON-RPC
    private requestId = 1;
    
    // Pending requests waiting for responses
    private pendingRequests = new Map<number, {resolve: Function, reject: Function}>();
    
    // Buffer for accumulating incoming data
    private dataBuffer = '';
    
    /**
     * Constructor.
     */
    constructor() {
        super();
        this.socket = new Socket();
        this.setupSocketHandlers();
    }

    /**
     * Set up socket event handlers.
     */
    private setupSocketHandlers(): void {
        this.socket.on('connect', () => {
            this.emit('debug_console', 'Connected to trs80gp emulator');
        });

        this.socket.on('data', (data: Buffer) => {
            this.handleSocketData(data);
        });

        this.socket.on('error', (err: Error) => {
            this.emit('debug_console', `Socket error: ${err.message}`);
            this.emit('warning', `TRS-80GP connection error: ${err.message}`);
        });

        this.socket.on('close', () => {
            this.emit('debug_console', 'Disconnected from trs80gp emulator');
        });
    }

    /**
     * Handle incoming socket data and parse JSON-RPC messages.
     */
    private handleSocketData(data: Buffer): void {
        this.dataBuffer += data.toString();
        
        // Process complete JSON-RPC messages (newline-delimited)
        let newlineIndex;
        while ((newlineIndex = this.dataBuffer.indexOf('\n')) !== -1) {
            const messageStr = this.dataBuffer.substring(0, newlineIndex).trim();
            this.dataBuffer = this.dataBuffer.substring(newlineIndex + 1);
            
            if (messageStr.length > 0) {
                try {
                    const message: JsonRpcMessage = JSON.parse(messageStr);
                    this.handleJsonRpcMessage(message);
                } catch (err) {
                    this.emit('debug_console', `Failed to parse JSON-RPC message: ${messageStr}`);
                }
            }
        }
    }

    /**
     * Handle a parsed JSON-RPC message.
     */
    private handleJsonRpcMessage(message: JsonRpcMessage): void {
        if (message.id !== undefined) {
            // This is a response to a request we sent
            const pending = this.pendingRequests.get(message.id as number);
            if (pending) {
                this.pendingRequests.delete(message.id as number);
                
                if (message.error) {
                    pending.reject(new Error(`JSON-RPC error ${message.error.code}: ${message.error.message}`));
                } else {
                    pending.resolve(message.result);
                }
            }
        } else if (message.method) {
            // This is a notification/event from the emulator
            this.handleTrs80GpNotification(message.method, message.params);
        }
    }

    /**
     * Handle notifications from the trs80gp emulator.
     * Subclasses can override this method to handle model-specific notifications.
     */
    protected handleTrs80GpNotification(method: string, params: any): void {
        switch (method) {
            case 'paused':
                this.emit('debug_console', 'TRS-80GP emulator paused');
                // Handle pause event
                break;
            case 'breakpoint':
                this.emit('debug_console', `TRS-80GP breakpoint hit at ${params?.address}`);
                // Handle breakpoint
                break;
            default:
                this.emit('debug_console', `Unknown TRS-80GP notification: ${method}`);
        }
    }

    /**
     * Send a JSON-RPC request to trs80gp and return a promise for the response.
     */
    protected sendTrs80GpJsonRpcRequest(method: string, params?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            const message: JsonRpcMessage = {
                jsonrpc: '2.0',
                method,
                params,
                id
            };

            this.pendingRequests.set(id, {resolve, reject});
            
            const messageStr = JSON.stringify(message) + '\n';
            this.socket.write(messageStr);

            // Set a timeout for the request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`TRS-80GP JSON-RPC request timeout for method: ${method}`));
                }
            }, 5000); // 5 second timeout
        });
    }

    /**
     * Connect to trs80gp emulator with intelligent port allocation.
     */
    public async connectSocket(): Promise<void> {
        const hostname = Settings.launch.trs80.hostname || 'localhost';
        
        // Use configured port if available, otherwise find an available port
        let port: number;
        const configuredPort = Settings.launch.trs80.port;
        
        if (configuredPort) {
            // Check if the configured port is available
            const isAvailable = await PortManager.isPortAvailable(configuredPort);
            if (isAvailable) {
                port = configuredPort;
                this.emit('debug_console', `Using configured port: ${port}`);
            } else {
                this.emit('warning', `Configured port ${configuredPort} is busy, searching for alternative...`);
                port = await PortManager.findAvailablePort(configuredPort);
                this.emit('debug_console', `Using alternative port: ${port}`);
            }
        } else {
            // Find an available port starting from the default
            port = await PortManager.findAvailablePort();
            this.emit('debug_console', `Auto-allocated port: ${port}`);
        }
        
        this.allocatedPort = port;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Connection timeout to trs80gp at ${hostname}:${port}`));
            }, 5000);

            this.socket.connect(port, hostname, () => {
                clearTimeout(timeout);
                resolve();
            });

            this.socket.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    /**
     * Override.
     * Initializes the machine.
     * When ready it emits this.emit('initialized') or this.emit('error', Error(...));
     * The successful emit takes place in 'onConnect' which should be called
     * by 'doInitialization' after a successful connect.
     */
    public async doInitialization(): Promise<void> {
        try {
            // Connect to TRS-80GP emulator
            await this.connectSocket();
            
            // Call onConnect to complete the initialization
            await this.onConnect();
        } catch (error) {
            this.emit('error', error);
        }
    }

    /**
     * Disconnect from trs80gp emulator.
     */
    public async disconnect(): Promise<void> {
        if (this.socket) {
            this.socket.destroy();
        }
    }

    /**
     * Initialize the connection to trs80gp.
     * Subclasses should override this to provide model-specific machine type.
     */
    public async sendDzrpCmdInit(): Promise<{error: string | undefined; programName: string; dzrpVersion: string; machineType: DzrpMachineType}> {
        try {
            const result = await this.sendTrs80GpJsonRpcRequest('initialize', {
                clientName: 'DeZog',
                version: '1.0.0'
            });
            
            return {
                error: undefined,
                programName: result?.programName || 'trs80gp',
                dzrpVersion: result?.version || '1.0.0',
                machineType: this.getTrs80GpMachineType()
            };
        } catch (err) {
            return {
                error: `Failed to initialize trs80gp connection: ${err.message}`,
                programName: 'trs80gp',
                dzrpVersion: '1.0.0',
                machineType: this.getTrs80GpMachineType()
            };
        }
    }

    /**
     * Get the DZRP machine type for this TRS-80 model.
     * Must be implemented by subclasses.
     */
    protected abstract getTrs80GpMachineType(): DzrpMachineType;

    /**
     * Get all CPU registers (common Z80 functionality).
     */
    public async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
        try {
            const result = await this.sendTrs80GpJsonRpcRequest('getRegisters');
            
            if (result) {
                const regData = this.convertTrs80GpRegistersToDeZog(result);
                this.emitTrs80GpRegisterData(result);
                return regData;
            }
            return new Uint16Array(20);
        } catch (err) {
            throw new Error(`Failed to get registers from trs80gp: ${err.message}`);
        }
    }

    /**
     * Convert trs80gp register format to DeZog format.
     * Subclasses can override this for model-specific register handling.
     */
    protected convertTrs80GpRegistersToDeZog(registers: any): Uint16Array {
        // This is a simplified conversion - in a real implementation
        // you would properly convert the TRS-80 register format
        const regData = new Uint16Array(20); // Adjust size as needed
        // TODO: Fill regData with actual register values from registers
        return regData;
    }

    /**
     * Emit register data for DeZog.
     * Subclasses can override this for model-specific handling.
     */
    protected emitTrs80GpRegisterData(registers: any): void {
        this.emit('received-register-data', registers);
    }

    /**
     * Set a CPU register (common Z80 functionality).
     */
    public async sendDzrpCmdSetRegister(regIndex: number, value: number): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('setRegister', {
                register: this.getTrs80GpRegisterName(regIndex),
                value: value
            });
        } catch (err) {
            throw new Error(`Failed to set register in trs80gp: ${err.message}`);
        }
    }

    /**
     * Map DeZog register index to TRS-80 register name (common Z80 functionality).
     * Subclasses can override this if they have model-specific register mappings.
     */
    protected getTrs80GpRegisterName(regIndex: number): string {
        const registerMap: {[key: number]: string} = {
            0: 'A',
            1: 'F',
            2: 'B',
            3: 'C',
            4: 'D',
            5: 'E',
            6: 'H',
            7: 'L',
            8: 'IX',
            9: 'IY',
            10: 'SP',
            11: 'PC'
        };
        
        return registerMap[regIndex] || 'A';
    }

    /**
     * Continue execution (common Z80 functionality).
     */
    public async sendDzrpCmdContinue(): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('continue');
        } catch (err) {
            throw new Error(`Failed to continue execution in trs80gp: ${err.message}`);
        }
    }

    /**
     * Pause execution (common Z80 functionality).
     */
    public async sendDzrpCmdPause(): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('pause');
        } catch (err) {
            throw new Error(`Failed to pause execution in trs80gp: ${err.message}`);
        }
    }

    /**
     * Step into (single step) (common Z80 functionality).
     */
    public async sendDzrpCmdStepInto(): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('stepInto');
        } catch (err) {
            throw new Error(`Failed to step into in trs80gp: ${err.message}`);
        }
    }

    /**
     * Step over (common Z80 functionality).
     */
    public async sendDzrpCmdStepOver(): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('stepOver');
        } catch (err) {
            throw new Error(`Failed to step over in trs80gp: ${err.message}`);
        }
    }

    /**
     * Read memory block.
     * Subclasses can override this for model-specific memory mapping.
     */
    public async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
        try {
            const result = await this.sendTrs80GpJsonRpcRequest('readMemory', {
                address: address,
                size: size
            });
            
            if (result && result.data) {
                // Convert hex string to Uint8Array
                const data = new Uint8Array(Buffer.from(result.data, 'hex'));
                this.emitTrs80GpMemoryData(address, data);
                return data;
            }
            return new Uint8Array(size);
        } catch (err) {
            throw new Error(`Failed to read memory from trs80gp: ${err.message}`);
        }
    }

    /**
     * Emit memory data for DeZog.
     * Subclasses can override this for model-specific handling.
     */
    protected emitTrs80GpMemoryData(address: number, data: Uint8Array): void {
        this.emit('received-memory-data', address, data);
    }

    /**
     * Write memory block.
     * Subclasses can override this for model-specific memory mapping.
     */
    public async sendDzrpCmdWriteMem(address: number, data: Uint8Array): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('writeMemory', {
                address: address,
                data: Buffer.from(data).toString('hex')
            });
        } catch (err) {
            throw new Error(`Failed to write memory to trs80gp: ${err.message}`);
        }
    }

    /**
     * Set breakpoints (common Z80 functionality).
     */
    public async sendDzrpCmdSetBreakpoints(bpAddresses: number[]): Promise<number[]> {
        try {
            const breakpoints = bpAddresses.map(address => ({ address }));
            await this.sendTrs80GpJsonRpcRequest('setBreakpoints', {
                breakpoints: breakpoints
            });
            // Return the same addresses as confirmation
            return bpAddresses;
        } catch (err) {
            throw new Error(`Failed to set breakpoints in trs80gp: ${err.message}`);
        }
    }

    /**
     * Load object file.
     */
    public async sendDzrpCmdLoadObj(filePath: string): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('loadObj', {
                filePath: filePath
            });
        } catch (err) {
            throw new Error(`Failed to load object file in trs80gp: ${err.message}`);
        }
    }

    /**
     * Save object file.
     */
    public async sendDzrpCmdSaveObj(startAddress: number, endAddress: number, filePath: string, execAddress?: number): Promise<void> {
        try {
            await this.sendTrs80GpJsonRpcRequest('saveObj', {
                startAddress: startAddress,
                endAddress: endAddress,
                filePath: filePath,
                execAddress: execAddress
            });
        } catch (err) {
            throw new Error(`Failed to save object file in trs80gp: ${err.message}`);
        }
    }

    //---- Methods that will typically be model-specific ----

    /**
     * Get slots - will vary by model (flat memory vs banked memory).
     * Default implementation for flat memory models.
     */
    public async sendDzrpCmdGetSlots(): Promise<void> {
        // Default: flat memory, no slots
        this.emit('received-slots-data', []);
    }

    /**
     * Write memory bank - will vary by model.
     * Default implementation for flat memory models.
     */
    public async sendDzrpCmdWriteBank(bank: number, dataArray: Uint8Array): Promise<void> {
        // Default: treat as regular memory write at bank address
        const address = bank * 0x2000; // 8k banks
        await this.sendDzrpCmdWriteMem(address, dataArray);
    }

    //---- Methods not applicable to TRS-80 models ----

    public async sendDzrpCmdGetTbblueRegister(register: number): Promise<void> {
        throw new Error('TBBlue registers not supported on TRS-80 models');
    }

    public async sendDzrpCmdSetTbblueRegister(register: number, value: number): Promise<void> {
        throw new Error('TBBlue registers not supported on TRS-80 models');
    }

    public async sendDzrpCmdGetSprites(index: number, count: number): Promise<Uint8Array[]> {
        throw new Error('Sprites not supported on TRS-80 models');
    }

    public async sendDzrpCmdGetSpritePatterns(index: number, count: number): Promise<number[][]> {
        throw new Error('Sprite patterns not supported on TRS-80 models');
    }

    public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
        throw new Error('Border color not supported on TRS-80 models');
    }

    /**
     * Get the currently allocated port for this remote instance.
     * This is the port that the TRS-80GP emulator is listening on.
     * 
     * @returns The allocated port number, or 0 if no port is allocated
     */
    public getAllocatedPort(): number {
        // Return the port from the socket if connected, otherwise return 0
        if (this.socket && !this.socket.destroyed) {
            return this.socket.remotePort || 0;
        }
        return 0;
    }

    /**
     * Check if the default TRS-80GP port (49152) is available.
     * This is useful before attempting to connect to determine if the emulator 
     * is likely running on the default port.
     * 
     * @returns Promise that resolves to true if the default port is available
     */
    public async isDefaultPortAvailable(): Promise<boolean> {
        return PortManager.isDefaultPortAvailable();
    }

    /**
     * Find an available port for TRS-80GP emulator connection.
     * Searches from the preferred port (or default 49152) downward to find 
     * the first available port in the valid range.
     * 
     * @param preferredPort Optional preferred port to start checking from
     * @returns Promise that resolves to an available port number
     * @throws Error if no free port is found in the valid range
     */
    public async findAvailablePort(preferredPort?: number): Promise<number> {
        return PortManager.findAvailablePort(preferredPort);
    }

    /**
     * Validate that a port number is suitable for TRS-80GP emulator connections.
     * 
     * @param port Port number to validate
     * @returns True if the port is in the valid range for TRS-80GP
     */
    public static isValidTrs80GpPort(port: number): boolean {
        return PortManager.isValidTrs80GpPort(port);
    }

    /**
     * Get the default port number for TRS-80GP emulator (49152).
     * 
     * @returns The default port number
     */
    public static getDefaultPort(): number {
        return PortManager.getDefaultPort();
    }
}
