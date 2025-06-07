import {Settings} from '../../settings/settings';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {DzrpMachineType} from '../dzrp/dzrpremote';
import {Socket} from 'net';
import {PortManager} from './portmanager';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80Registers} from '../z80registers';
import {MemoryModelTrs80Model1, MemoryModelTrs80Model3} from '../MemoryModel/trs80memorymodels';

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
 * Base trs80gp Remote class that handles communication with trs80gp emulator via JSON-RPC over TCP.
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
            this.emit('warning', `trs80gp connection error: ${err.message}`);
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
        console.log(`[TRS80GP] Received JSON-RPC message: ${JSON.stringify(message)}`);
        this.emit('debug_console', `Received JSON-RPC: ${message.method || 'response'}`);
        
        if (message.id !== undefined) {
            // This is a response to a request we sent
            const pending = this.pendingRequests.get(message.id as number);
            if (pending) {
                console.log(`[TRS80GP] Found pending request for id: ${message.id}`);
                this.pendingRequests.delete(message.id as number);
                
                if (message.error) {
                    console.log(`[TRS80GP] Error response: ${JSON.stringify(message.error)}`);
                    pending.reject(new Error(`JSON-RPC error ${message.error.code}: ${message.error.message}`));
                } else {
                    console.log(`[TRS80GP] Success response: ${JSON.stringify(message.result)}`);
                    pending.resolve(message.result);
                }
            } else {
                console.log(`[TRS80GP] No pending request found for id: ${message.id}`);
            }
        } else if (message.method) {
            // This is a notification/event from the emulator
            console.log(`[TRS80GP] Handling notification: ${message.method}`);
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
                this.emit('debug_console', 'trs80gp emulator paused');
                // Handle pause event
                break;
            case 'breakpoint':
                this.emit('debug_console', `trs80gp breakpoint hit at ${params?.address}`);
                // Handle breakpoint
                break;
            default:
                this.emit('debug_console', `Unknown trs80gp notification: ${method}`);
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

            console.log(`[TRS80GP] Sending JSON-RPC request: ${JSON.stringify(message)}`);
            this.emit('debug_console', `Sending JSON-RPC request: ${method} with id ${id}`);
            
            this.pendingRequests.set(id, {resolve, reject});
            
            const messageStr = JSON.stringify(message) + '\n';
            this.socket.write(messageStr);

            // Set a timeout for the request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    console.log(`[TRS80GP] Request timeout for method: ${method}, id: ${id}`);
                    this.emit('debug_console', `Request timeout for method: ${method}, id: ${id}`);
                    reject(new Error(`trs80gp JSON-RPC request timeout for method: ${method}`));
                }
            }, 5000); // 5 second timeout
        });
    }

    /**
     * Connect to trs80gp emulator with intelligent port allocation.
     */
    public async connectSocket(): Promise<void> {
        const hostname = Settings.launch.trs80?.hostname || 'localhost';
        
        // Use configured port if available, otherwise find an available port
        let port: number;
        const configuredPort = Settings.launch.trs80?.port;
        
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
        console.log('[TRS80GP] Starting Trs80GpRemote.doInitialization()');
        this.emit('debug_console', 'Starting trs80gp remote initialization');
        
        try {
            // Connect to trs80gp
            console.log('[TRS80GP] Attempting to connect socket...');
            this.emit('debug_console', 'Connecting to trs80gp emulator...');
            await this.connectSocket();
            
            console.log('[TRS80GP] Socket connected, calling onConnect()');
            this.emit('debug_console', 'Socket connected, initializing protocol...');
            
            // Initialize the remote (sends init command and emits 'initialized' on success)
            await this.onConnect();
            
            console.log('[TRS80GP] Trs80GpRemote.doInitialization() completed successfully');
            this.emit('debug_console', 'trs80gp remote initialization completed');
        } catch (err) {
            console.log(`[TRS80GP] doInitialization() failed: ${err.message}`);
            this.emit('debug_console', `trs80gp initialization failed: ${err.message}`);
            this.emit('error', err);
        }
    }

    //---- DZRP Protocol Implementation ----

    /**
     * Call this from 'doInitialization' when a successful connection
     * has been opened to the Remote.
     * @emits this.emit('initialized') or this.emit('error', Error(...))
     */
    protected async onConnect(): Promise<void> {
        console.log('[TRS80GP] Starting onConnect() - sending init command');
        this.emit('debug_console', 'Sending initialization command to trs80gp...');
        
        try {
            // Send the init command using the JSON-RPC protocol
            const result = await this.sendDzrpCmdInit();
            
            console.log('[TRS80GP] Init command result:', JSON.stringify(result));
            this.emit('debug_console', `Init command result: ${JSON.stringify(result)}`);
            
            if (result.error) {
                console.log('[TRS80GP] Init failed with error:', result.error);
                throw new Error(result.error);
            }

            // Initialize the Z80 registers decoder for TRS-80
            console.log('[TRS80GP] Initializing Z80 registers decoder');
            Z80Registers.decoder = this.createZ80RegistersDecoder();
            this.emit('debug_console', 'Z80 registers decoder initialized for TRS-80');

            // Initialize the memory model based on machine type
            console.log('[TRS80GP] Initializing memory model for machine type:', result.machineType);
            this.createAndInitializeMemoryModel(result.machineType);
            this.emit('debug_console', 'Memory model initialized for TRS-80');

            // Emit 'initialized' event which the system is waiting for
            const message = `${result.programName} initialized`;
            console.log(`[TRS80GP] Emitting 'initialized' event with message: ${message}`);
            this.emit('debug_console', `Emitting initialized event: ${message}`);
            this.emit('initialized', message);
            
        } catch (err) {
            console.log(`[TRS80GP] onConnect() failed: ${err.message}`);
            this.emit('debug_console', `Connection initialization failed: ${err.message}`);
            this.emit('error', err);
        }
    }

    /**
     * Override to create the appropriate Z80 registers decoder for TRS-80.
     */
    protected createZ80RegistersDecoder(): any {
        // Return the standard decoder for TRS-80
        return new Z80RegistersStandardDecoder();
    }

    /**
     * Create and initialize the appropriate memory model based on machine type.
     */
    protected createAndInitializeMemoryModel(machineType: DzrpMachineType): void {
        console.log(`[TRS80GP] Creating memory model for machine type: ${machineType}`);
        
        // Create the appropriate memory model based on machine type
        switch (machineType) {
            case DzrpMachineType.TRS80_MODEL1:
                this.memoryModel = new MemoryModelTrs80Model1();
                console.log('[TRS80GP] Created MemoryModelTrs80Model1');
                break;
            case DzrpMachineType.TRS80_MODEL3:
                this.memoryModel = new MemoryModelTrs80Model3();
                console.log('[TRS80GP] Created MemoryModelTrs80Model3');
                break;
            default:
                // Default to Model 1 for unknown types
                console.log(`[TRS80GP] Unknown machine type ${machineType}, defaulting to Model 1`);
                this.memoryModel = new MemoryModelTrs80Model1();
                break;
        }
        
        // Initialize the memory model - this sets up funcCreateLongAddress and funcGetSlotFromAddress
        console.log('[TRS80GP] Calling memoryModel.init()');
        this.memoryModel.init();
        console.log('[TRS80GP] Memory model initialization completed');
    }

    // Add DzrpMachineType reference for convenience
    protected get DzrpMachineType() {
        return DzrpMachineType;
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
            console.log('TRS-80 GP: sendDzrpCmdGetRegisters() calling sendTrs80GpJsonRpcRequest');
            const result = await this.sendTrs80GpJsonRpcRequest('getRegisters');
            console.log('TRS-80 GP: Got raw result from getRegisters:', JSON.stringify(result));
            
            if (result) {
                console.log('TRS-80 GP: Converting registers to DeZog format...');
                const regData = this.convertTrs80GpRegistersToDeZog(result);
                console.log('TRS-80 GP: Converted regData:', regData);
                console.log('TRS-80 GP: regData type:', typeof regData, 'length:', regData?.length);
                
                this.emitTrs80GpRegisterData(result);
                return regData;
            }
            console.log('TRS-80 GP: No result, returning empty Uint16Array');
            return new Uint16Array(20);
        } catch (err) {
            console.error('TRS-80 GP: sendDzrpCmdGetRegisters() error:', err);
            throw new Error(`Failed to get registers from trs80gp: ${err.message}`);
        }
    }

    /**
     * Convert trs80gp register format to DeZog format.
     * Subclasses can override this for model-specific register handling.
     * 
     * This method handles both scenarios:
     * 1. When 16-bit registers are present in the emulator response
     * 2. When only 8-bit registers are present, constructing 16-bit values from 8-bit components
     */
    protected convertTrs80GpRegistersToDeZog(registers: any): Uint16Array {
        const regData = new Uint16Array(16); // Z80_REG.IM(13) + 1 + slotCount(1) + slots(1) = 16
        
        if (!registers) {
            // Even with no register data, set up slot information for TRS-80
            regData[14] = 1;  // Slot count
            regData[15] = 0;  // Single slot with bank 0
            return regData;
        }

        // Get the register format from configuration
        const registerFormat = Settings.launch.trs80?.registerFormat || 'hex';
        
        // Parse register values based on the configured format
        const parseRegisterValue = (value: any): number => {
            if (typeof value === 'number') {
                return value;
            }
            
            if (typeof value === 'string') {
                if (registerFormat === 'hex') {
                    // Parse as hexadecimal (supports "0x" prefix or plain hex)
                    return parseInt(value.replace(/^0x/i, ''), 16) || 0;
                } else {
                    // Parse as decimal
                    return parseInt(value, 10) || 0;
                }
            }
            
            return 0;
        };

        // Helper function to build 16-bit register from 8-bit components if needed
        const get16BitRegister = (reg16Name: string, highReg: string, lowReg: string, altName?: string): number => {
            // First try to get the 16-bit register directly
            if (registers[reg16Name] !== undefined) {
                return parseRegisterValue(registers[reg16Name]);
            }
            
            // Try alternative name (e.g., AF_ instead of AF2)
            if (altName && registers[altName] !== undefined) {
                return parseRegisterValue(registers[altName]);
            }
            
            // If 16-bit register not available, construct from 8-bit components
            const high = parseRegisterValue(registers[highReg]);
            const low = parseRegisterValue(registers[lowReg]);
            
            // Only build if both components are available
            if (registers[highReg] !== undefined && registers[lowReg] !== undefined) {
                return (high << 8) | low;
            }
            
            return 0;
        };

        // Standard Z80 register mapping according to Z80_REG enum
        // PC=0, SP=1, AF=2, BC=3, DE=4, HL=5, IX=6, IY=7, AF2=8, BC2=9, DE2=10, HL2=11, IR=12, IM=13
        regData[0] = parseRegisterValue(registers.PC);      // PC
        regData[1] = parseRegisterValue(registers.SP);      // SP
        
        // Handle composite 16-bit registers - try 16-bit first, fall back to 8-bit construction
        regData[2] = get16BitRegister('AF', 'A', 'F');      // AF
        regData[3] = get16BitRegister('BC', 'B', 'C');      // BC  
        regData[4] = get16BitRegister('DE', 'D', 'E');      // DE
        regData[5] = get16BitRegister('HL', 'H', 'L');      // HL
        regData[6] = parseRegisterValue(registers.IX);      // IX
        regData[7] = parseRegisterValue(registers.IY);      // IY
        
        // Handle alternate registers - try different naming conventions
        regData[8] = get16BitRegister('AF2', 'A2', 'F2', 'AF_');  // AF'
        regData[9] = get16BitRegister('BC2', 'B2', 'C2', 'BC_');  // BC'
        regData[10] = get16BitRegister('DE2', 'D2', 'E2', 'DE_'); // DE'
        regData[11] = get16BitRegister('HL2', 'H2', 'L2', 'HL_'); // HL'
        
        // Handle I and R registers - they might be separate or combined
        const iValue = parseRegisterValue(registers.I);
        const rValue = parseRegisterValue(registers.R);
        regData[12] = (iValue << 8) | rValue;  // IR combined
        
        // IM register
        regData[13] = parseRegisterValue(registers.IM);
        
        // Add slots data for TRS-80 (simple non-banking system)
        // TRS-80 systems don't use memory banking, so we use a single slot covering full 64K
        regData[14] = 1;  // Slot count
        regData[15] = 0;  // Single slot with bank 0
        
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
     * This is the port that the trs80gp emulator is listening on.
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
     * Check if the default trs80gp port (49152) is available.
     * This is useful before attempting to connect to determine if the emulator 
     * is likely running on the default port.
     * 
     * @returns Promise that resolves to true if the default port is available
     */
    public async isDefaultPortAvailable(): Promise<boolean> {
        return PortManager.isDefaultPortAvailable();
    }

    /**
     * Find an available port for trs80gp emulator connection.
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
     * Validate that a port number is suitable for trs80gp emulator connections.
     * 
     * @param port Port number to validate
     * @returns True if the port is in the valid range for trs80gp
     */
    public static isValidTrs80GpPort(port: number): boolean {
        return PortManager.isValidTrs80GpPort(port);
    }

    /**
     * Get the default port number for trs80gp emulator (49152).
     * 
     * @returns The default port number
     */
    public static getDefaultPort(): number {
        return PortManager.getDefaultPort();
    }
}
