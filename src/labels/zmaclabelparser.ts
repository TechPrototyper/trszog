import {LabelParserBase} from './labelparserbase';
import {AsmConfigBase} from '../settings/settings';
import * as fs from 'fs';

/**
 * Parser for Zmac assembler .bds (Binary Debuggable Source) files.
 * 
 * The .bds format contains debug information for Z80 assembly programs
 * compiled with the zmac assembler. It includes:
 * - Source file mapping  
 * - Label definitions
 * - Binary data locations
 * - Usage information for addresses
 * 
 * Format specification:
 * - Line 1: "binary-debuggable-source"
 * - Lines with format: <hex_addr> <hex_addr> <type> <data>
 * 
 * Types:
 * - 'f': Source file reference
 * - 's': Source line or label
 * - 'd': Binary data bytes  
 * - 'u': Usage information
 */
export class ZmacLabelParser extends LabelParserBase {
	// Overwrite parser name (for errors).
	protected parserName = "zmac";

	/// Regex to match .bds file lines
	private static readonly BDS_LINE_REGEX = /^([0-9a-fA-F]{4})\s+([0-9a-fA-F]{4})\s+([fsdu])\s+(.*)$/;

	/// Map of source file IDs to file paths
	private sourceFiles: Map<string, string> = new Map();

	/**
	 * Reads the given .bds file and extracts all labels, addresses, and source file references.
	 * @param config The assembler configuration.
	 */
	public loadAsmListFile(config: AsmConfigBase) {
		try {
			this.config = config;
			
			// Init (in case of several files)
			this.excludedFileStackIndex = -1;
			this.includeFileStack = new Array<{fileName: string, includeFileName: string, lineNr: number}>();
			this.listFile = new Array<any>();
			this.modulePrefixStack = new Array<string>();
			this.modulePrefix = undefined as any;
			this.lastLabel = undefined as any;

			// Check conversion to target memory model
			this.checkMappingToTargetMemoryModel();

			// Read and parse the .bds file
			const bdsPath = config.path;
			this.parseBdsFile(bdsPath);

			// Check if Listfile-Mode (always true for .bds files since they don't contain source line mappings)
			if (config.srcDirs === undefined || config.srcDirs.length === 0) {
				// Listfile-Mode
				this.listFileModeFinish();
				return;
			}

			// Phase 2: Parse for source files
			this.parseAllFilesAndLineNumbers();

			// Finish: Create fileLineNrs, lineArrays and labelLocations  
			this.sourcesModeFinish();
		}
		catch (e) {
			this.throwError(e.message);
		}
	}

	/**
	 * Parses the .bds file.
	 * @param filePath Path to the .bds file.
	 */
	private parseBdsFile(filePath: string): void {
		const bdsContent = fs.readFileSync(filePath, 'utf8');
		const lines = bdsContent.split('\n');
		
		// Check header
		if (lines.length === 0 || !lines[0].includes('binary-debuggable-source')) {
			throw new Error(`Invalid .bds file format: missing header in ${filePath}`);
		}

		// Parse each line
		for (let i = 1; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.length === 0) continue;

			try {
				this.parseBdsLine(line, i + 1);
			} catch (error) {
				// Log error but continue parsing
				console.warn(`Warning: Error parsing .bds line ${i + 1} in ${filePath}: ${error.message}`);
			}
		}
	}

	/**
	 * Parse a single line from the .bds file.
	 * @param line The line to parse.
	 * @param lineNumber Line number for error reporting.
	 */
	private parseBdsLine(line: string, lineNumber: number): void {
		const match = ZmacLabelParser.BDS_LINE_REGEX.exec(line);
		if (!match) {
			// Log but don't throw - some lines might be malformed but we want to continue
			console.warn(`Warning: Malformed .bds line ${lineNumber}: ${line}`);
			return;
		}

		const [, addr1Str, addr2Str, type, data] = match;
		const addr1 = parseInt(addr1Str, 16);
		const addr2 = parseInt(addr2Str, 16);

		// Validate addresses
		if (isNaN(addr1) || isNaN(addr2)) {
			console.warn(`Warning: Invalid address in .bds line ${lineNumber}: ${line}`);
			return;
		}

		// Parse based on entry type
		try {
			switch (type) {
				case 'f':
					this.parseFileReference(addr1, data);
					break;
				case 's':
					this.parseSourceOrLabel(addr1, data);
					break;
				case 'd':
					this.parseBinaryData(addr1, data);
					break;
				case 'u':
					this.parseUsageInfo(addr1, data);
					break;
				default:
					console.warn(`Warning: Unknown .bds entry type '${type}' in line ${lineNumber}: ${line}`);
					break;
			}
		} catch (error) {
			console.warn(`Warning: Error parsing .bds line ${lineNumber}: ${error.message}`);
		}
	}

	/**
	 * Parse a file reference line.
	 * Format: "AAAA AAAA f filename"
	 * This maps address ranges to source files for proper debugging.
	 * @param addr The address where this file mapping begins.
	 * @param data The filename.
	 */
	private parseFileReference(addr: number, data: string): void {
		const filename = data.trim();
		
		if (filename.length === 0) {
			return; // Skip empty filenames
		}
		
		// Store the file mapping for this address
		this.sourceFiles.set(addr.toString(16), filename);
		
		// Also create a list entry to track file boundaries
		const longAddr = this.createLongAddress(addr, 0);
		this.currentFileEntry = {
			fileName: filename,
			lineNr: 0,
			longAddr,
			size: 0, // File references don't consume address space
			line: `; File: ${filename}`,
			modulePrefix: this.modulePrefix,
			lastLabel: this.lastLabel
		};
		this.listFile.push(this.currentFileEntry);
	}

	/**
	 * Parse a source line or label definition.
	 * Format: "AAAA AAAA s text" where text can be:
	 * - "; comment" (source line comment)
	 * - "LABEL:" (label definition) 
	 * - "LABEL: ; comment" (label with comment)
	 * - "LD A,5" (instruction)
	 * - "ORG 8000H" (directive)
	 * - "DB 1,2,3" (data definition)
	 * @param addr The address.
	 * @param data The source text.
	 */
	private parseSourceOrLabel(addr: number, data: string): void {
		const text = data.trim();
		
		// Skip empty lines
		if (text.length === 0) {
			return;
		}
		
		// Create long address for all source content
		const longAddr = this.createLongAddress(addr, 0);
		const fileName = this.findSourceFileForAddress(addr) || "";
		
		// Check if this is a label definition
		const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(text);
		if (labelMatch) {
			const labelName = labelMatch[1];
			
			// Add the label to the symbol table
			this.addLabelForNumber(longAddr, labelName);
			
			// Create list file entry for this label
			this.currentFileEntry = {
				fileName,
				lineNr: 0,
				longAddr,
				size: 1, // Labels take up 1 address unit
				line: text,
				modulePrefix: this.modulePrefix,
				lastLabel: this.lastLabel
			};
			this.listFile.push(this.currentFileEntry);
			
			// Update last label for subsequent entries
			this.lastLabel = labelName;
		} else if (text.startsWith(';')) {
			// This is a source line comment - no machine code generated
			this.currentFileEntry = {
				fileName,
				lineNr: 0,
				longAddr,
				size: 0, // Comments don't generate machine code
				line: text,
				modulePrefix: this.modulePrefix,
				lastLabel: this.lastLabel
			};
			this.listFile.push(this.currentFileEntry);
		} else {
			// This is an instruction, directive, or data definition
			// We need to estimate the size based on the content type
			let size = this.estimateInstructionSize(text);
			
			this.currentFileEntry = {
				fileName,
				lineNr: 0,
				longAddr,
				size: size,
				line: text,
				modulePrefix: this.modulePrefix,
				lastLabel: this.lastLabel
			};
			this.listFile.push(this.currentFileEntry);
		}
	}
	
	/**
	 * Estimate the size of an instruction or directive.
	 * This is needed for proper address tracking in the debugger.
	 * @param text The source line text.
	 * @returns Estimated size in bytes.
	 */
	private estimateInstructionSize(text: string): number {
		const upperText = text.toUpperCase().trim();
		
		// Remove label prefix if present (e.g., "LOOP: LD A,5" -> "LD A,5")
		const colonIndex = upperText.indexOf(':');
		const instruction = colonIndex >= 0 ? upperText.substring(colonIndex + 1).trim() : upperText;
		
		// Handle common directives that don't generate code
		if (instruction.startsWith('ORG ') || 
			instruction.startsWith('EQU ') ||
			instruction.startsWith('TITLE ') ||
			instruction.startsWith('INCLUDE ') ||
			instruction.startsWith('IF ') ||
			instruction.startsWith('ENDIF') ||
			instruction.startsWith('MACRO ') ||
			instruction.startsWith('ENDM')) {
			return 0;
		}
		
		// Handle data definition directives
		if (instruction.startsWith('DB ') || instruction.startsWith('DEFB ')) {
			// Count the data items separated by commas
			const dataStr = instruction.substring(instruction.indexOf(' ') + 1);
			const items = dataStr.split(',');
			return items.length;
		}
		
		if (instruction.startsWith('DW ') || instruction.startsWith('DEFW ')) {
			// Count the word items separated by commas, each takes 2 bytes
			const dataStr = instruction.substring(instruction.indexOf(' ') + 1);
			const items = dataStr.split(',');
			return items.length * 2;
		}
		
		if (instruction.startsWith('DS ') || instruction.startsWith('DEFS ')) {
			// Reserve space directive - try to parse the number
			const sizeStr = instruction.substring(instruction.indexOf(' ') + 1).trim();
			const match = /^(\d+)/.exec(sizeStr);
			if (match) {
				return parseInt(match[1], 10);
			}
			return 1; // Default if we can't parse
		}
		
		// For Z80 instructions, estimate size based on instruction type
		// Most Z80 instructions are 1-4 bytes
		if (instruction.startsWith('LD ') ||
			instruction.startsWith('ADD ') ||
			instruction.startsWith('SUB ') ||
			instruction.startsWith('AND ') ||
			instruction.startsWith('OR ') ||
			instruction.startsWith('XOR ') ||
			instruction.startsWith('CP ') ||
			instruction.startsWith('INC ') ||
			instruction.startsWith('DEC ')) {
			// These can be 1-3 bytes depending on operands
			if (instruction.includes('(') || instruction.includes('IX') || instruction.includes('IY')) {
				return 3; // Extended addressing or index registers
			} else if (instruction.includes(',')) {
				return 2; // Register to register or immediate
			}
			return 1; // Simple register operations
		}
		
		if (instruction.startsWith('JP ') ||
			instruction.startsWith('JR ') ||
			instruction.startsWith('CALL ')) {
			return 3; // Jump/call instructions are typically 3 bytes
		}
		
		if (instruction.startsWith('RET') ||
			instruction.startsWith('NOP') ||
			instruction.startsWith('HALT') ||
			instruction.startsWith('DI') ||
			instruction.startsWith('EI')) {
			return 1; // Single byte instructions
		}
		
		// Default estimate for unknown instructions
		return 1;
	}

	/**
	 * Parse binary data information.
	 * Format: "AAAA AAAA d XX XX XX ..." where XX are hex bytes
	 * This provides the actual machine code bytes that correspond to source instructions.
	 * @param addr The address.
	 * @param data The hex byte data.
	 */
	private parseBinaryData(addr: number, data: string): void {
		// Split the hex bytes and filter out empty strings
		const hexBytes = data.trim().split(/\s+/).filter(byte => byte.length > 0);
		
		// Validate hex bytes
		const validBytes = hexBytes.filter(byte => /^[0-9a-fA-F]{2}$/.test(byte));
		
		if (validBytes.length === 0) {
			// No valid bytes, skip this entry
			return;
		}
		
		// Create long address
		const longAddr = this.createLongAddress(addr, 0);
		const fileName = this.findSourceFileForAddress(addr) || "";
		
		// Create list file entry for binary data
		// This represents the actual machine code bytes at this address
		this.currentFileEntry = {
			fileName,
			lineNr: 0,
			longAddr,
			size: validBytes.length,
			line: `; Binary: ${validBytes.join(' ')}`,
			modulePrefix: this.modulePrefix,
			lastLabel: this.lastLabel
		};
		this.listFile.push(this.currentFileEntry);
		
		// Also create entries for each individual byte for better address coverage
		for (let i = 1; i < validBytes.length; i++) {
			const byteAddr = this.createLongAddress(addr + i, 0);
			this.currentFileEntry = {
				fileName,
				lineNr: 0,
				longAddr: byteAddr,
				size: 1,
				line: `; Byte: ${validBytes[i]}`,
				modulePrefix: this.modulePrefix,
				lastLabel: this.lastLabel
			};
			this.listFile.push(this.currentFileEntry);
		}
	}

	/**
	 * Parse usage information.
	 * Format: "AAAA AAAA u type info"
	 * This provides additional metadata about how addresses are used.
	 * @param addr The address.
	 * @param data The usage data.
	 */
	private parseUsageInfo(addr: number, data: string): void {
		const trimmedData = data.trim();
		
		// Skip empty usage info
		if (trimmedData.length === 0) {
			return;
		}
		
		// Create long address
		const longAddr = this.createLongAddress(addr, 0);
		const fileName = this.findSourceFileForAddress(addr) || "";
		
		// Create a usage annotation entry
		this.currentFileEntry = {
			fileName,
			lineNr: 0,
			longAddr,
			size: 0, // Usage info doesn't take up address space
			line: `; Usage: ${trimmedData}`,
			modulePrefix: this.modulePrefix,
			lastLabel: this.lastLabel
		};
		this.listFile.push(this.currentFileEntry);
	}

	/**
	 * Find the source file information for a given address.
	 * This is crucial for mapping addresses back to source files in the debugger.
	 * @param addr The address to look up.
	 * @returns Source filename or undefined.
	 */
	private findSourceFileForAddress(addr: number): string | undefined {
		// Look for the nearest file reference at or before this address
		let bestAddr = -1;
		let bestFile = '';
		
		// Use forEach to avoid iterator issues with older TypeScript targets
		this.sourceFiles.forEach((filename, addrStr) => {
			const fileAddr = parseInt(addrStr, 16);
			if (fileAddr <= addr && fileAddr > bestAddr) {
				bestAddr = fileAddr;
				bestFile = filename;
			}
		});
		
		// Return the filename if found, otherwise undefined
		return bestAddr >= 0 ? bestFile : undefined;
	}

	/**
	 * Override parseLabelAndAddress since .bds files are handled differently.
	 */
	protected parseLabelAndAddress(line: string) {
		// This method is not used for .bds files since we parse them differently
		// The parsing is done in parseBdsFile instead
	}

	/**
	 * Override parseFileAndLineNumber since .bds files don't have traditional source line info.
	 */
	protected parseFileAndLineNumber(line: string) {
		// This method is not used for .bds files since source line mapping
		// is handled differently via the file reference entries
	}
	
	/**
	 * Override parseAllFilesAndLineNumbers for BDS files.
	 * BDS files already contain file mapping information from the 'f' entries,
	 * so we just need to assign line numbers to the list file entries.
	 */
	protected parseAllFilesAndLineNumbers() {
		// For BDS files, we assign sequential line numbers within each file
		// based on the addresses and file mappings we already parsed
		
		let currentLineNr = 0;
		let lastFileName = '';
		
		for (const entry of this.listFile) {
			if (entry.fileName !== lastFileName) {
				// New file, reset line number
				currentLineNr = 0;
				lastFileName = entry.fileName;
			}
			
			// Only increment line number for entries that represent actual source content
			if (entry.size > 0 || entry.line.includes('LABEL') || entry.line.includes(';')) {
				entry.lineNr = currentLineNr;
				currentLineNr++;
			} else {
				// For file references and usage info, use the current line number
				entry.lineNr = currentLineNr;
			}
		}
	}
}
