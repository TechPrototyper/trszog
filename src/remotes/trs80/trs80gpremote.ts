import {Settings} from '../../settings/settings';
import {DzrpQueuedRemote} from '../dzrp/dzrpqueuedremote';
import {DzrpMachineType} from '../dzrp/dzrpremote';
import {Socket} from 'net';
import {PortManager} from './portmanager';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80Registers} from '../z80registers';
import {MemoryModelTrs80Model1, MemoryModelTrs80Model3} from '../MemoryModel/trs80memorymodels';
import * as fs from 'fs';

/**
 * Gets a timestamp string for logging.
 */
function getTimestamp(): string {
    const now = new Date();
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    return `${now.toTimeString().split(' ')[0]}.${ms}`;
}

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
    
    // Conversation log file handle for protocol debugging
    private conversationLogFile: number | undefined;
    private conversationLogPath: string | undefined;
    
    /**
     * Creates a clean, professional hex dump with proper formatting and ASCII representation.
     * Features:
     * - Fixed 80-character lines with ~26 hex bytes per line
     * - ASCII representation with escape sequences for control characters
               * - Clean output without ANSI escape sequences
     * - Error highlighting when errors occur in the data
     */
    public createHexDump(data: Buffer | string, prefix: string = '', hasError: boolean = false): string {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const lines: string[] = [];
        const bytesPerLine = 16; // Standard hex dump format
        
        for (let i = 0; i < buffer.length; i += bytesPerLine) {
            const slice = buffer.slice(i, i + bytesPerLine);
            
            // Create hex representation
            const hexBytes = Array.from(slice)
                .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
            
            // Pad hex bytes to consistent width (47 chars for 16 bytes)
            const paddedHex = hexBytes.padEnd(47, ' ');
            
            // Create ASCII representation with escape sequences for known control chars
            const asciiChars = Array.from(slice)
                .map(byte => {
                    if (byte >= 32 && byte <= 126) {
                        return String.fromCharCode(byte);
                    }
                    // Show common control characters as escape sequences
                    switch (byte) {
                        case 0x00: return '\\0';
                        case 0x07: return '\\a';
                        case 0x08: return '\\b';
                        case 0x09: return '\\t';
                        case 0x0A: return '\\n';
                        case 0x0B: return '\\v';
                        case 0x0C: return '\\f';
                        case 0x0D: return '\\r';
                        case 0x1B: return '\\e';
                        default: return '.';
                    }
                })
                .join('');
            
            // Create offset (address)
            const offset = i.toString(16).padStart(8, '0').toUpperCase();
            
            // Format line with consistent spacing
            const line = `${prefix}${offset}: ${paddedHex} |${asciiChars}|`;
            
            // Add error indicator if this dump contains error data
            if (hasError) {
                lines.push(`${line} << ERROR`);
            } else {
                lines.push(line);
            }
        }
        
        return lines.join('\n');
    }

    /**
     * Creates a clean summary of communication data for console output.
     * Shows just the essential information without cluttering the debug console.
     */
    public createDataSummary(data: Buffer | string, direction: 'SENT' | 'RECEIVED'): string {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const dataString = buffer.toString('utf8');
        
        // Clean up the string for display (remove excessive whitespace, newlines)
        const cleanString = dataString.replace(/\s+/g, ' ').trim();
        
        // Truncate if too long
        const maxLength = 200;
        const displayString = cleanString.length > maxLength 
            ? cleanString.substring(0, maxLength) + '...'
            : cleanString;
        
        return `${direction} (${buffer.length} bytes): ${displayString}`;
    }

    /**
     * Creates a compact hex dump for debug console output.
     * Shows 64 bytes per line with hex values and ASCII representation in 3-line format.
     * Format: 
     * Position: 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C 1D 1E 1F 20 21 22 23 24 25 26 27 28 29 2A 2B 2C 2D 2E 2F 30 31 32 33 34 35 36 37 38 39 3A 3B 3C 3D 3E 3F
     * Hex:      7B 22 6A 73 6F 6E 72 70 63 22 3A 22 32 2E 30 22 2C 22 6D 65 74 68 6F 64 22 3A 22 69 6E 69 74 69 61 6C 69 7A 65 22 2C 22 70 61 72 61 6D 73 22 3A 7B 22 63 6C 69 65 6E 74 4E 61 6D 65 22 3A 22
     * ASCII:    {  "  j  s  o  n  r  p  c  "  :  "  2  .  0  "  ,  "  m  e  t  h  o  d  "  :  "  i  n  i  t  i  a  l  i  z  e  "  ,  "  p  a  r  a  m  s  "  :  {  "  c  l  i  e  n  t  N  a  m  e  "  :  "
     */
    public createCompactHexDump(data: Buffer | string, direction: 'SENT' | 'RECV'): string {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        const lines: string[] = [];
        const bytesPerLine = 64; // 64 bytes per line as requested
        
        for (let i = 0; i < buffer.length; i += bytesPerLine) {
            const slice = buffer.slice(i, i + bytesPerLine);
            
            // Create position line (00 01 02 03 ...)
            const positions = Array.from(slice, (_, index) => 
                (i + index).toString(16).padStart(2, '0').toUpperCase()
            ).join(' ');
            
            // Create hex representation with spaces
            const hexBytes = Array.from(slice)
                .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
            
            // Create ASCII representation with escape sequences for control characters
            const asciiChars = Array.from(slice)
                .map(byte => {
                    if (byte >= 32 && byte <= 126) {
                        return String.fromCharCode(byte).padEnd(3, ' '); // Pad to 3 chars for alignment
                    }
                    // Show escape sequences for common control characters
                    switch (byte) {
                        case 0x07: return '\\a '; // bell
                        case 0x08: return '\\b '; // backspace
                        case 0x09: return '\\t '; // tab
                        case 0x0A: return '\\n '; // newline
                        case 0x0B: return '\\v '; // vertical tab
                        case 0x0C: return '\\f '; // form feed
                        case 0x0D: return '\\r '; // carriage return
                        case 0x1B: return '\\e '; // escape
                        default: return '   '; // 3 spaces for non-printable
                    }
                })
                .join('');
            
            // Add the three-line format with proper alignment
            lines.push(''); // Empty line to separate blocks
            lines.push(`${direction}: ${positions}`);
            lines.push(`      ${hexBytes}`);
            lines.push(`      ${asciiChars}`);
        }
        
        return lines.join('\n');
    }

    /**
     * Constructor.
     */
    constructor() {
        super();
        this.socket = new Socket();
        this.setupSocketHandlers();
        this.initConversationLog();
    }

    /**
     * Initialize the conversation log file for protocol debugging.
     * Creates a binary log file with timestamp that can be analyzed with hex dumpers.
     */
    private initConversationLog(): void {
        try {
            // Create log filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.conversationLogPath = `trs80gp-conversation-${timestamp}.log`;
            
            // Create the log file
            this.conversationLogFile = fs.openSync(this.conversationLogPath, 'w');
            
            // Write header with session information
            const header = `TRS-80 GP Protocol Conversation Log\nSession started: ${new Date().toISOString()}\n\n`;
            fs.writeSync(this.conversationLogFile, Buffer.from(header, 'utf8'));
            
            console.log(`[TRS80GP] Conversation log initialized: ${this.conversationLogPath}`);
        } catch (error) {
            console.warn(`[TRS80GP] Failed to initialize conversation log: ${error.message}`);
            this.conversationLogFile = undefined;
            this.conversationLogPath = undefined;
        }
    }

    /**
     * Log protocol data to the conversation log file.
     * Records raw data with timestamp and direction markers for analysis.
     */
    public logToConversationFile(data: Buffer, direction: 'SEND' | 'RECV'): void {
        if (!this.conversationLogFile) {
            return;
        }
        
        try {
            const timestamp = new Date().toISOString();
            const header = `\n=== ${direction} ${timestamp} (${data.length} bytes) ===\n`;
            
            // Write header
            fs.writeSync(this.conversationLogFile, Buffer.from(header, 'utf8'));
            
            // Write raw data
            fs.writeSync(this.conversationLogFile, data);
            
            // Write separator
            fs.writeSync(this.conversationLogFile, Buffer.from('\n', 'utf8'));
            
            // Ensure data is written to disk
            fs.fsyncSync(this.conversationLogFile);
        } catch (error) {
            console.warn(`[TRS80GP] Failed to write to conversation log: ${error.message}`);
        }
    }

    /**
     * Close the conversation log file.
     */
    private closeConversationLog(): void {
        if (this.conversationLogFile) {
            try {
                const footer = `\nSession ended: ${new Date().toISOString()}\n`;
                fs.writeSync(this.conversationLogFile, Buffer.from(footer, 'utf8'));
                fs.closeSync(this.conversationLogFile);
                console.log(`[TRS80GP] Conversation log closed: ${this.conversationLogPath}`);
            } catch (error) {
                console.warn(`[TRS80GP] Failed to close conversation log: ${error.message}`);
            } finally {
                this.conversationLogFile = undefined;
                this.conversationLogPath = undefined;
            }
        }
    }

    /**
     * Set up socket event handlers.
     */
    private setupSocketHandlers(): void {
        this.socket.on('connect', () => {
            const timestamp = getTimestamp();
            console.log(`[${timestamp}] [TRS80GP] Socket connected successfully`);
            this.emit('debug_console', `[${timestamp}] Connected to trs80gp emulator`);
        });

        this.socket.on('data', (data: Buffer) => {
            this.handleSocketData(data);
        });

        this.socket.on('error', (err: Error) => {
            const timestamp = getTimestamp();
            console.log(`[${timestamp}] [TRS80GP] Socket error: ${err.message}`);
            this.emit('debug_console', `[${timestamp}] Socket error: ${err.message}`);
            this.emit('warning', `[${timestamp}] trs80gp connection error: ${err.message}`);
        });

        this.socket.on('close', () => {
            const timestamp = getTimestamp();
            console.log(`[${timestamp}] [TRS80GP] Socket closed`);
            this.emit('debug_console', `[${timestamp}] Disconnected from trs80gp emulator`);
        });
    }

    /**
     * Handle incoming socket data and parse JSON-RPC messages.
     */
    private handleSocketData(data: Buffer): void {
        const timestamp = getTimestamp();
        const dataString = data.toString();
        
        // Log to conversation file for protocol debugging
        this.logToConversationFile(data, 'RECV');
        
        // Create compact hex dump for debug console
        const compactHexDump = this.createCompactHexDump(data, 'RECV');
        
        // Console output with full hex dump for development
        console.log(`[${timestamp}] [TRS80GP] RECEIVED (${data.length} bytes):`);
        console.log(this.createHexDump(data, '    '));
        
        // VS Code debug console output with compact hex dump
        this.emit('debug_console', `[${timestamp}] RECEIVED (${data.length} bytes):`);
        this.emit('debug_console', compactHexDump);
        
        this.dataBuffer += dataString;
        
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
                    console.log(`[${timestamp}] [TRS80GP] JSON PARSE ERROR: ${err.message}`);
                    console.log(`[${timestamp}] [TRS80GP] RAW MESSAGE: ${JSON.stringify(messageStr)}`);
                    this.emit('debug_console', `[${timestamp}] Failed to parse JSON-RPC message: ${messageStr}`);
                    this.emit('debug_console', `[${timestamp}] Parse error: ${err.message}`);
                    
                    // Create visual error display for JSON parse errors
                    const errorDisplay = this.createJsonParseErrorDisplay(messageStr, err);
                    console.log(errorDisplay);
                }
            }
        }
    }

    /**
     * Handle a parsed JSON-RPC message.
     */
    private handleJsonRpcMessage(message: JsonRpcMessage): void {
        const timestamp = getTimestamp();
        console.log(`[${timestamp}] [TRS80GP] PARSED JSON-RPC: ${JSON.stringify(message)}`);
        this.emit('debug_console', `[${timestamp}] PARSED JSON-RPC: ${message.method || 'response'} (id: ${message.id})`);
        
        if (message.id !== undefined) {
            // This is a response to a request we sent
            const pending = this.pendingRequests.get(message.id as number);
            if (pending) {
                console.log(`[${timestamp}] [TRS80GP] Found pending request for id: ${message.id}`);
                this.pendingRequests.delete(message.id as number);
                
                if (message.error) {
                    console.log(`[${timestamp}] [TRS80GP] Error response: ${JSON.stringify(message.error)}`);
                    this.emit('debug_console', `[${timestamp}] Error response: ${JSON.stringify(message.error)}`);
                    pending.reject(new Error(`JSON-RPC error ${message.error.code}: ${message.error.message}`));
                } else {
                    console.log(`[${timestamp}] [TRS80GP] Success response: ${JSON.stringify(message.result)}`);
                    this.emit('debug_console', `[${timestamp}] Success response: ${JSON.stringify(message.result)}`);
                    pending.resolve(message.result);
                }
            } else {
                console.log(`[${timestamp}] [TRS80GP] No pending request found for id: ${message.id}`);
                this.emit('debug_console', `[${timestamp}] No pending request found for id: ${message.id}`);
            }
        } else if (message.method) {
            // This is a notification/event from the emulator
            console.log(`[${timestamp}] [TRS80GP] Handling notification: ${message.method}`);
            this.emit('debug_console', `[${timestamp}] Handling notification: ${message.method}`);
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

            const messageStr = JSON.stringify(message) + '\n';
            const messageBuffer = Buffer.from(messageStr, 'utf8');
            
            const timestamp = getTimestamp();
            
            // Log to conversation file for protocol debugging
            this.logToConversationFile(messageBuffer, 'SEND');
            
            // Create clean hex dump for detailed console output
            const hexDump = this.createHexDump(messageBuffer, '    ');
            
            // Create compact hex dump for debug console
            const compactHexDump = this.createCompactHexDump(messageBuffer, 'SENT');
            
            // Console output with full hex dump for development
            console.log(`[${timestamp}] [TRS80GP] SENDING (${messageBuffer.length} bytes):`);
            console.log(hexDump);
            
            // VS Code debug console output with compact hex dump
            this.emit('debug_console', `[${timestamp}] SENDING (${messageBuffer.length} bytes):`);
            this.emit('debug_console', compactHexDump);
            
            this.pendingRequests.set(id, {resolve, reject});
            this.socket.write(messageBuffer);

            // Set a timeout for the request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    console.log(`[${timestamp}] [TRS80GP] Request timeout for method: ${method}, id: ${id}`);
                    this.emit('debug_console', `[${timestamp}] Request timeout for method: ${method}, id: ${id}`);
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
        const timestamp = getTimestamp();
        
        console.log(`[${timestamp}] [TRS80GP] Starting connection to ${hostname}`);
        
        // Use configured port if available, otherwise find an available port
        let port: number;
        const configuredPort = Settings.launch.trs80?.port;
        
        if (configuredPort) {
            // Check if the configured port is available
            const isAvailable = await PortManager.isPortAvailable(configuredPort);
            if (isAvailable) {
                port = configuredPort;
                console.log(`[${timestamp}] [TRS80GP] Using configured port: ${port}`);
                this.emit('debug_console', `[${timestamp}] Using configured port: ${port}`);
            } else {
                console.log(`[${timestamp}] [TRS80GP] Configured port ${configuredPort} is busy, searching for alternative...`);
                this.emit('warning', `[${timestamp}] Configured port ${configuredPort} is busy, searching for alternative...`);
                port = await PortManager.findAvailablePort(configuredPort);
                console.log(`[${timestamp}] [TRS80GP] Using alternative port: ${port}`);
                this.emit('debug_console', `[${timestamp}] Using alternative port: ${port}`);
            }
        } else {
            // Find an available port starting from the default
            port = await PortManager.findAvailablePort();
            console.log(`[${timestamp}] [TRS80GP] Auto-allocated port: ${port}`);
            this.emit('debug_console', `[${timestamp}] Auto-allocated port: ${port}`);
        }
        
        this.allocatedPort = port;

        return new Promise((resolve, reject) => {
            const connectTimestamp = getTimestamp();
            console.log(`[${connectTimestamp}] [TRS80GP] Attempting to connect to ${hostname}:${port}`);
            
            const timeout = setTimeout(() => {
                const timeoutTimestamp = getTimestamp();
                console.log(`[${timeoutTimestamp}] [TRS80GP] Connection timeout to ${hostname}:${port}`);
                reject(new Error(`Connection timeout to trs80gp at ${hostname}:${port}`));
            }, 5000);

            this.socket.connect(port, hostname, () => {
                clearTimeout(timeout);
                const successTimestamp = getTimestamp();
                console.log(`[${successTimestamp}] [TRS80GP] Successfully connected to ${hostname}:${port}`);
                resolve();
            });

            this.socket.on('error', (err) => {
                clearTimeout(timeout);
                const errorTimestamp = getTimestamp();
                console.log(`[${errorTimestamp}] [TRS80GP] Connection error: ${err.message}`);
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
        // Close conversation log file
        this.closeConversationLog();
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

    /**
     * Creates a visual error display for JSON parse errors with highlighted problematic characters.
     * Shows the error location with inverse/colored highlighting and expected content if possible.
     */
    private createJsonParseErrorDisplay(message: string, error: Error): string {
        const lines: string[] = [];
        
        // Extract position information from JavaScript JSON.parse error
        const errorMessage = error.message;
        let position = -1;
        let expectedInfo = '';
        
        // Try to extract position from error message
        const positionMatch = errorMessage.match(/position\s+(\d+)/i);
        if (positionMatch) {
            position = parseInt(positionMatch[1], 10);
        }
        
        // Extract expected information if available
        if (errorMessage.includes('Unexpected token')) {
            const tokenMatch = errorMessage.match(/Unexpected token (.+?) in JSON/);
            if (tokenMatch) {
                expectedInfo = `Unexpected token: ${tokenMatch[1]}`;
            }
        }
        
        lines.push(`JSON Parse Error: ${errorMessage}`);
        lines.push(`Message length: ${message.length} characters`);
        
        if (position >= 0 && position < message.length) {
            lines.push('');
            lines.push('Error location highlighted:');
            
            // Create hex dump with error highlighting
            const messageBuffer = Buffer.from(message, 'utf8');
            const hexErrorDisplay = this.createErrorHighlightedHexDump(messageBuffer, position);
            lines.push(hexErrorDisplay);
            
            // Create text display with error highlighting
            const textErrorDisplay = this.createErrorHighlightedText(message, position);
            lines.push('');
            lines.push('Text representation:');
            lines.push(textErrorDisplay);
            
            // Show context around the error
            const contextStart = Math.max(0, position - 20);
            const contextEnd = Math.min(message.length, position + 20);
            const context = message.substring(contextStart, contextEnd);
            const relativePos = position - contextStart;
            
            lines.push('');
            lines.push('Context (±20 chars):');
            lines.push(`"${context}"`);
            lines.push(' '.repeat(relativePos + 1) + '^-- Error here');
        }
        
        if (expectedInfo) {
            lines.push('');
            lines.push(`Expected: Valid JSON syntax`);
            lines.push(`Analysis: ${expectedInfo}`);
        }
        
        // Add suggestions based on common JSON errors
        lines.push('');
        lines.push('Common causes:');
        lines.push('• Missing quotes around string values');
        lines.push('• Trailing commas in objects/arrays');
        lines.push('• Unescaped characters in strings');
        lines.push('• Incomplete JSON message (fragmented transmission)');
        
        return lines.join('\n');
    }

    /**
     * Creates a hex dump with the error position highlighted using ANSI escape codes.
     */
    private createErrorHighlightedHexDump(buffer: Buffer, errorPosition: number): string {
        const lines: string[] = [];
        const bytesPerLine = 16;
        
        for (let i = 0; i < buffer.length; i += bytesPerLine) {
            const slice = buffer.slice(i, i + bytesPerLine);
            const lineStart = i;
            const lineEnd = i + slice.length - 1;
            
            // Check if error position is in this line
            const hasError = errorPosition >= lineStart && errorPosition <= lineEnd;
            const errorOffset = hasError ? errorPosition - lineStart : -1;
            
            // Create hex representation with highlighting
            const hexParts: string[] = [];
            for (let j = 0; j < slice.length; j++) {
                const byte = slice[j];
                const hexStr = byte.toString(16).padStart(2, '0').toUpperCase();
                
                if (j === errorOffset) {
                    // Highlight the error byte - use ANSI inverse video
                    hexParts.push(`\x1b[7m${hexStr}\x1b[0m`);
                } else {
                    hexParts.push(hexStr);
                }
            }
            
            // Pad hex representation
            const hexLine = hexParts.join(' ').padEnd(47, ' ');
            
            // Create ASCII representation with highlighting
            const asciiParts: string[] = [];
            for (let j = 0; j < slice.length; j++) {
                const byte = slice[j];
                let char: string;
                
                if (byte >= 32 && byte <= 126) {
                    char = String.fromCharCode(byte);
                } else {
                    char = '.';
                }
                
                if (j === errorOffset) {
                    // Highlight the error character
                    asciiParts.push(`\x1b[7m${char}\x1b[0m`);
                } else {
                    asciiParts.push(char);
                }
            }
            
            const asciiLine = asciiParts.join('');
            const offset = i.toString(16).padStart(8, '0').toUpperCase();
            
            lines.push(`    ${offset}: ${hexLine} |${asciiLine}|`);
        }
        
        return lines.join('\n');
    }

    /**
     * Creates a text representation with the error position highlighted.
     */
    private createErrorHighlightedText(text: string, errorPosition: number): string {
        if (errorPosition < 0 || errorPosition >= text.length) {
            return `"${text}"`;
        }
        
        const before = text.substring(0, errorPosition);
        const errorChar = text.charAt(errorPosition);
        const after = text.substring(errorPosition + 1);
        
        // Use ANSI inverse video for highlighting
        const highlightedChar = `\x1b[7m${errorChar === '' ? ' ' : errorChar}\x1b[0m`;
        
        return `"${before}${highlightedChar}${after}"`;
    }
}
