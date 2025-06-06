import * as net from 'net';
import * as fs from 'fs';

/**
 * Interface for parsed BDS file data
 */
interface BdsData {
    files: Map<number, string>;           // File ID -> File path
    labels: Map<string, number>;          // Label name -> Address
    binaryData: Map<number, Uint8Array>;  // Address -> Binary data
    usage: Map<string, number[]>;         // Label -> Usage addresses
}

/**
 * JSON-RPC message interface
 */
interface JsonRpcMessage {
    jsonrpc: string;
    method?: string;
    params?: any;
    id?: number | string;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Mock CPU state for Z80
 */
interface CpuState {
    A: number;
    F: number;
    B: number;
    C: number;
    D: number;
    E: number;
    H: number;
    L: number;
    IX: number;
    IY: number;
    SP: number;
    PC: number;
    AF_: number;
    BC_: number;
    DE_: number;
    HL_: number;
    I: number;
    R: number;
}

/**
 * Mock TRS-80GP emulator server that provides intelligent responses
 * based on BDS file data for testing zmac integration.
 */
export class MockTrs80GpServer {
    private server: net.Server;
    private port: number;
    private bdsData: BdsData | null = null;
    private memory: Uint8Array;
    private cpuState: CpuState;
    private breakpoints: number[] = [];
    private isRunning = false;

    constructor(port: number = 49152) {
        this.port = port;
        this.memory = new Uint8Array(65536); // 64K memory
        this.cpuState = this.createInitialCpuState();
        this.server = net.createServer(this.handleConnection.bind(this));
    }

    /**
     * Create initial CPU state
     */
    private createInitialCpuState(): CpuState {
        return {
            A: 0, F: 0, B: 0, C: 0, D: 0, E: 0, H: 0, L: 0,
            IX: 0, IY: 0, SP: 0xFFFF, PC: 0x0000,
            AF_: 0, BC_: 0, DE_: 0, HL_: 0, I: 0, R: 0
        };
    }

    /**
     * Load and parse a BDS file for intelligent mock responses
     */
    public loadBdsFile(bdsFilePath: string): void {
        try {
            if (!fs.existsSync(bdsFilePath)) {
                console.warn(`BDS file not found: ${bdsFilePath}`);
                return;
            }

            const content = fs.readFileSync(bdsFilePath, 'utf-8');
            this.bdsData = this.parseBdsFile(content);
            console.log(`Loaded BDS file: ${bdsFilePath}`);
            console.log(`- ${this.bdsData.files.size} files`);
            console.log(`- ${this.bdsData.labels.size} labels`);
            console.log(`- ${this.bdsData.binaryData.size} binary data entries`);

            // Set PC to the first label address if available
            if (this.bdsData.labels.size > 0) {
                const firstLabel = Array.from(this.bdsData.labels.values())[0];
                this.cpuState.PC = firstLabel;
                console.log(`Set initial PC to: 0x${firstLabel.toString(16)}`);
            }

            // Load binary data into memory
            for (const [address, data] of this.bdsData.binaryData) {
                if (address + data.length <= this.memory.length) {
                    this.memory.set(data, address);
                }
            }
        } catch (error) {
            console.error(`Failed to load BDS file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Parse BDS file content (correct zmac BDS format)
     */
    private parseBdsFile(content: string): BdsData {
        const data: BdsData = {
            files: new Map(),
            labels: new Map(),
            binaryData: new Map(),
            usage: new Map()
        };

        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Parse file references (format: "0000 0000 f hello.asm")
            const fileMatch = trimmedLine.match(/^[0-9a-f]+ [0-9a-f]+ f (.+)$/i);
            if (fileMatch) {
                const fileName = fileMatch[1];
                data.files.set(data.files.size, fileName);
                continue;
            }

            // Parse binary data lines (format: "6000 6000 d cdc901")
            const dataMatch = trimmedLine.match(/^([0-9a-f]+) [0-9a-f]+ d ([0-9a-f]+)$/i);
            if (dataMatch) {
                const address = parseInt(dataMatch[1], 16);
                const hexData = dataMatch[2];
                const binaryData = this.hexStringToUint8Array(hexData);
                data.binaryData.set(address, binaryData);
                continue;
            }

            // Parse labels (format: "6000 a main" or "600c a hello_msg")
            const labelMatch = trimmedLine.match(/^([0-9a-f]+) a (.+)$/i);
            if (labelMatch) {
                const address = parseInt(labelMatch[1], 16);
                const label = labelMatch[2];
                data.labels.set(label, address);
                continue;
            }

            // Skip other line types (s, u, e) for now as they're not essential for basic debugging
        }

        return data;
    }

    /**
     * Convert hex string to Uint8Array
     */
    private hexStringToUint8Array(hexString: string): Uint8Array {
        const cleanHex = hexString.replace(/\s/g, '');
        const bytes = new Uint8Array(cleanHex.length / 2);
        for (let i = 0; i < cleanHex.length; i += 2) {
            bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
        }
        return bytes;
    }

    /**
     * Handle incoming socket connections
     */
    private handleConnection(socket: net.Socket): void {
        console.log(`Client connected from ${socket.remoteAddress}:${socket.remotePort}`);
        
        let dataBuffer = '';

        socket.on('data', (data: Buffer) => {
            dataBuffer += data.toString();
            
            // Process complete JSON-RPC messages (newline-delimited)
            let newlineIndex;
            while ((newlineIndex = dataBuffer.indexOf('\n')) !== -1) {
                const messageStr = dataBuffer.substring(0, newlineIndex).trim();
                dataBuffer = dataBuffer.substring(newlineIndex + 1);
                
                if (messageStr.length > 0) {
                    try {
                        const message: JsonRpcMessage = JSON.parse(messageStr);
                        this.handleJsonRpcMessage(socket, message);
                    } catch (err) {
                        console.error(`Failed to parse JSON-RPC message: ${messageStr}`);
                        this.sendError(socket, null, -32700, 'Parse error');
                    }
                }
            }
        });

        socket.on('close', () => {
            console.log('Client disconnected');
        });

        socket.on('error', (err) => {
            console.error(`Socket error: ${err.message}`);
        });
    }

    /**
     * Handle JSON-RPC messages
     */
    private handleJsonRpcMessage(socket: net.Socket, message: JsonRpcMessage): void {
        console.log(`Received: ${message.method} (id: ${message.id})`);

        if (!message.method) {
            this.sendError(socket, message.id, -32600, 'Invalid Request');
            return;
        }

        try {
            switch (message.method) {
                case 'initialize':
                    this.handleInitialize(socket, message);
                    break;
                case 'launch':
                    this.handleLaunch(socket, message);
                    break;
                case 'getRegisters':
                    this.handleGetRegisters(socket, message);
                    break;
                case 'setRegister':
                    this.handleSetRegister(socket, message);
                    break;
                case 'readMemory':
                    this.handleReadMemory(socket, message);
                    break;
                case 'writeMemory':
                    this.handleWriteMemory(socket, message);
                    break;
                case 'setBreakpoints':
                    this.handleSetBreakpoints(socket, message);
                    break;
                case 'continue':
                    this.handleContinue(socket, message);
                    break;
                case 'pause':
                    this.handlePause(socket, message);
                    break;
                case 'stepInto':
                    this.handleStepInto(socket, message);
                    break;
                case 'stepOver':
                    this.handleStepOver(socket, message);
                    break;
                case 'loadObj':
                    this.handleLoadObj(socket, message);
                    break;
                case 'saveObj':
                    this.handleSaveObj(socket, message);
                    break;
                default:
                    this.sendError(socket, message.id, -32601, `Method not found: ${message.method}`);
            }
        } catch (error) {
            this.sendError(socket, message.id, -32603, `Internal error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle initialize request
     */
    private handleInitialize(socket: net.Socket, message: JsonRpcMessage): void {
        const result = {
            supportsReadMemoryRequest: true,
            supportsWriteMemoryRequest: true,
            programName: 'Mock TRS-80GP',
            version: '1.0.0',
            machineType: 'TRS-80 Model I',
            capabilities: ['debugging', 'memory', 'breakpoints']
        };
        this.sendResponse(socket, message.id, result);
    }

    /**
     * Handle launch request - MVP protocol
     */
    private handleLaunch(socket: net.Socket, message: JsonRpcMessage): void {
        const params = message.params || {};
        const program = params.program || 'default.cmd';
        const startAddress = params.startAddress || 0x4F00;
        
        console.log(`Launch: program=${program}, startAddress=0x${startAddress.toString(16)}`);
        
        // Set PC to start address
        if (typeof startAddress === 'number') {
            this.cpuState.PC = startAddress;
        } else if (typeof startAddress === 'string') {
            // Handle hex string format
            this.cpuState.PC = parseInt(startAddress.replace('0x', ''), 16);
        }
        
        const result = {
            status: 'launched',
            program: program,
            startAddress: this.cpuState.PC
        };
        this.sendResponse(socket, message.id, result);
    }

    /**
     * Update dynamic register values to simulate a running program
     */
    private updateDynamicRegisters(): void {
        // HL points to a RAM address, starting at 0x3C00 (video RAM) and moving around
        const hlBase = 0x3C00;
        const hlOffset = Math.floor(Math.random() * 0xC400); // Random offset up to end of RAM
        const hlValue = (hlBase + hlOffset) & 0xFFFF;
        this.cpuState.H = (hlValue >> 8) & 0xFF;
        this.cpuState.L = hlValue & 0xFF;
        
        // BC represents a counter, random number less than 0x1000
        const bcValue = Math.floor(Math.random() * 0x1000);
        this.cpuState.B = (bcValue >> 8) & 0xFF;
        this.cpuState.C = bcValue & 0xFF;
        
        // DE and AF are random 16-bit hex values
        const deValue = Math.floor(Math.random() * 0x10000);
        this.cpuState.D = (deValue >> 8) & 0xFF;
        this.cpuState.E = deValue & 0xFF;
        
        const afValue = Math.floor(Math.random() * 0x10000);
        this.cpuState.A = (afValue >> 8) & 0xFF;
        this.cpuState.F = afValue & 0xFF;
        
        // PC should be a realistic address - if we have BDS data, use a random label address
        if (this.bdsData && this.bdsData.labels.size > 0) {
            const labelAddresses = Array.from(this.bdsData.labels.values());
            this.cpuState.PC = labelAddresses[Math.floor(Math.random() * labelAddresses.length)];
        } else {
            // Otherwise use a random address in the program area (0x4000-0x8000)
            this.cpuState.PC = 0x4000 + Math.floor(Math.random() * 0x4000);
        }
        
        // Update R register to simulate instruction execution
        this.cpuState.R = (this.cpuState.R + Math.floor(Math.random() * 10)) & 0x7F;
    }

    /**
     * Handle get registers request
     */
    private handleGetRegisters(socket: net.Socket, message: JsonRpcMessage): void {
        // Update registers to show dynamic values
        this.updateDynamicRegisters();
        this.sendResponse(socket, message.id, this.cpuState);
    }

    /**
     * Handle set register request
     */
    private handleSetRegister(socket: net.Socket, message: JsonRpcMessage): void {
        const { register, value } = message.params || {};
        if (register && typeof value === 'number') {
            if (register in this.cpuState) {
                (this.cpuState as any)[register] = value & 0xFFFF;
                console.log(`Set register ${register} = 0x${value.toString(16)}`);
            }
        }
        this.sendResponse(socket, message.id, { success: true });
    }

    /**
     * Handle read memory request
     */
    private handleReadMemory(socket: net.Socket, message: JsonRpcMessage): void {
        const { address, size } = message.params || {};
        if (typeof address === 'number' && typeof size === 'number') {
            const start = Math.max(0, address);
            const end = Math.min(this.memory.length, start + size);
            const data = this.memory.slice(start, end);
            
            const result = {
                address: start,
                size: end - start,
                data: Buffer.from(data).toString('hex')
            };
            
            console.log(`Read memory: 0x${start.toString(16)}-0x${end.toString(16)} (${end - start} bytes)`);
            this.sendResponse(socket, message.id, result);
        } else {
            this.sendError(socket, message.id, -32602, 'Invalid params: address and size required');
        }
    }

    /**
     * Handle write memory request
     */
    private handleWriteMemory(socket: net.Socket, message: JsonRpcMessage): void {
        const { address, data } = message.params || {};
        if (typeof address === 'number' && typeof data === 'string') {
            const bytes = Buffer.from(data, 'hex');
            const start = Math.max(0, address);
            const end = Math.min(this.memory.length, start + bytes.length);
            
            this.memory.set(bytes.slice(0, end - start), start);
            console.log(`Write memory: 0x${start.toString(16)} (${bytes.length} bytes)`);
            this.sendResponse(socket, message.id, { success: true });
        } else {
            this.sendError(socket, message.id, -32602, 'Invalid params: address and data required');
        }
    }

    /**
     * Handle set breakpoints request
     */
    private handleSetBreakpoints(socket: net.Socket, message: JsonRpcMessage): void {
        const { breakpoints } = message.params || {};
        if (Array.isArray(breakpoints)) {
            this.breakpoints = breakpoints.map((bp: any) => bp.address).filter((addr: any) => typeof addr === 'number');
            console.log(`Set breakpoints: ${this.breakpoints.map(addr => '0x' + addr.toString(16)).join(', ')}`);
            this.sendResponse(socket, message.id, { success: true, count: this.breakpoints.length });
        } else {
            this.sendError(socket, message.id, -32602, 'Invalid params: breakpoints array required');
        }
    }

    /**
     * Handle continue execution request
     */
    private handleContinue(socket: net.Socket, message: JsonRpcMessage): void {
        this.isRunning = true;
        console.log('Continue execution');
        this.sendResponse(socket, message.id, { success: true });
        
        // Simulate hitting a breakpoint after a short delay
        setTimeout(() => {
            if (this.isRunning && this.breakpoints.length > 0) {
                const hitBp = this.breakpoints[0];
                this.cpuState.PC = hitBp;
                this.isRunning = false;
                console.log(`Breakpoint hit at 0x${hitBp.toString(16)}`);
                this.sendNotification(socket, 'breakpoint', { address: hitBp, registers: this.cpuState });
            }
        }, 1000);
    }

    /**
     * Handle pause execution request
     */
    private handlePause(socket: net.Socket, message: JsonRpcMessage): void {
        this.isRunning = false;
        console.log('Pause execution');
        this.sendResponse(socket, message.id, { success: true });
        this.sendNotification(socket, 'paused', { registers: this.cpuState });
    }

    /**
     * Handle step into request
     */
    private handleStepInto(socket: net.Socket, message: JsonRpcMessage): void {
        this.cpuState.PC = (this.cpuState.PC + 1) & 0xFFFF;
        console.log(`Step into: PC = 0x${this.cpuState.PC.toString(16)}`);
        this.sendResponse(socket, message.id, { success: true });
        this.sendNotification(socket, 'stepped', { registers: this.cpuState });
    }

    /**
     * Handle step over request
     */
    private handleStepOver(socket: net.Socket, message: JsonRpcMessage): void {
        this.cpuState.PC = (this.cpuState.PC + 2) & 0xFFFF; // Assume 2-byte instruction
        console.log(`Step over: PC = 0x${this.cpuState.PC.toString(16)}`);
        this.sendResponse(socket, message.id, { success: true });
        this.sendNotification(socket, 'stepped', { registers: this.cpuState });
    }

    /**
     * Handle load object file request
     */
    private handleLoadObj(socket: net.Socket, message: JsonRpcMessage): void {
        const { filePath } = message.params || {};
        console.log(`Load object file: ${filePath}`);
        
        // In a real implementation, this would load the file into memory
        // For the mock, we'll just acknowledge the request
        this.sendResponse(socket, message.id, { success: true, filePath });
    }

    /**
     * Handle save object file request
     */
    private handleSaveObj(socket: net.Socket, message: JsonRpcMessage): void {
        const { startAddress, endAddress, filePath } = message.params || {};
        console.log(`Save object file: ${filePath} (0x${startAddress?.toString(16)}-0x${endAddress?.toString(16)})`);
        
        // In a real implementation, this would save memory to file
        // For the mock, we'll just acknowledge the request
        this.sendResponse(socket, message.id, { success: true, filePath });
    }

    /**
     * Send JSON-RPC response
     */
    private sendResponse(socket: net.Socket, id: any, result: any): void {
        const response: JsonRpcMessage = {
            jsonrpc: '2.0',
            id: id,
            result: result
        };
        socket.write(JSON.stringify(response) + '\n');
    }

    /**
     * Send JSON-RPC error
     */
    private sendError(socket: net.Socket, id: any, code: number, message: string, data?: any): void {
        const response: JsonRpcMessage = {
            jsonrpc: '2.0',
            id: id,
            error: { code, message, data }
        };
        socket.write(JSON.stringify(response) + '\n');
    }

    /**
     * Send JSON-RPC notification
     */
    private sendNotification(socket: net.Socket, method: string, params?: any): void {
        const notification: JsonRpcMessage = {
            jsonrpc: '2.0',
            method: method,
            params: params
        };
        socket.write(JSON.stringify(notification) + '\n');
    }

    /**
     * Start the mock server
     */
    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, () => {
                console.log(`Mock TRS-80GP server listening on port ${this.port}`);
                resolve();
            });

            this.server.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Stop the mock server
     */
    public stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log('Mock TRS-80GP server stopped');
                resolve();
            });
        });
    }

    /**
     * Get information about loaded BDS data
     */
    public getBdsInfo(): string {
        if (!this.bdsData) {
            return 'No BDS file loaded';
        }

        const lines = [
            'BDS File Information:',
            `- Files: ${this.bdsData.files.size}`,
            `- Labels: ${this.bdsData.labels.size}`,
            `- Binary data entries: ${this.bdsData.binaryData.size}`,
            `- Usage entries: ${this.bdsData.usage.size}`,
            ''
        ];

        if (this.bdsData.labels.size > 0) {
            lines.push('Labels:');
            for (const [label, address] of this.bdsData.labels) {
                lines.push(`  ${label}: 0x${address.toString(16)}`);
            }
        }

        return lines.join('\n');
    }
}

// CLI interface for running the mock server
if (require.main === module) {
    const server = new MockTrs80GpServer();
    
    // Check for BDS file argument
    const bdsFile = process.argv[2];
    if (bdsFile) {
        server.loadBdsFile(bdsFile);
    }

    // Start server
    server.start().then(() => {
        console.log('Mock TRS-80GP server started successfully');
        if (bdsFile) {
            console.log(server.getBdsInfo());
        }
    }).catch((err) => {
        console.error(`Failed to start server: ${err.message}`);
        process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down mock server...');
        await server.stop();
        process.exit(0);
    });
}
