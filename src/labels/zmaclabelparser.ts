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
			return; // Skip malformed lines
		}

		const [, addr1Str, , type, data] = match;
		const addr1 = parseInt(addr1Str, 16);

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
		}
	}

	/**
	 * Parse a file reference line.
	 * Format: "AAAA AAAA f filename"
	 * @param addr The address.
	 * @param data The filename.
	 */
	private parseFileReference(addr: number, data: string): void {
		const filename = data.trim();
		this.sourceFiles.set(addr.toString(16), filename);
	}

	/**
	 * Parse a source line or label definition.
	 * Format: "AAAA AAAA s text" where text can be:
	 * - "; comment" (source line comment)
	 * - "LABEL:" (label definition) 
	 * - "LABEL: ; comment" (label with comment)
	 * @param addr The address.
	 * @param data The source text.
	 */
	private parseSourceOrLabel(addr: number, data: string): void {
		const text = data.trim();
		
		// Check if this is a label definition
		const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(text);
		if (labelMatch) {
			const labelName = labelMatch[1];
			
			// Create long address
			const longAddr = this.createLongAddress(addr, 0);
			
			// Add the label
			this.addLabelForNumber(longAddr, labelName);
			
			// Create list file entry for this label
			const fileName = this.findSourceFileForAddress(addr) || "";
			this.currentFileEntry = {
				fileName,
				lineNr: 0,
				longAddr,
				size: 1,
				line: text,
				modulePrefix: this.modulePrefix,
				lastLabel: this.lastLabel
			};
			this.listFile.push(this.currentFileEntry);
			
			// Update last label
			this.lastLabel = labelName;
		} else if (text.startsWith(';')) {
			// This is a source line comment
			const longAddr = this.createLongAddress(addr, 0);
			const fileName = this.findSourceFileForAddress(addr) || "";
			
			this.currentFileEntry = {
				fileName,
				lineNr: 0,
				longAddr,
				size: 0,
				line: text,
				modulePrefix: this.modulePrefix,
				lastLabel: this.lastLabel
			};
			this.listFile.push(this.currentFileEntry);
		}
	}

	/**
	 * Parse binary data information.
	 * Format: "AAAA AAAA d XX XX XX ..." where XX are hex bytes
	 * @param addr The address.
	 * @param data The hex byte data.
	 */
	private parseBinaryData(addr: number, data: string): void {
		// Split the hex bytes
		const hexBytes = data.trim().split(/\s+/);
		
		// Create long address
		const longAddr = this.createLongAddress(addr, 0);
		const fileName = this.findSourceFileForAddress(addr) || "";
		
		// Create list file entry for binary data
		this.currentFileEntry = {
			fileName,
			lineNr: 0,
			longAddr,
			size: hexBytes.length,
			line: `; DATA: ${data}`,
			modulePrefix: this.modulePrefix,
			lastLabel: this.lastLabel
		};
		this.listFile.push(this.currentFileEntry);
	}

	/**
	 * Parse usage information.
	 * Format: "AAAA AAAA u type info"
	 * @param addr The address.
	 * @param data The usage data.
	 */
	private parseUsageInfo(addr: number, data: string): void {
		// Usage information - just create a comment entry for now
		const longAddr = this.createLongAddress(addr, 0);
		const fileName = this.findSourceFileForAddress(addr) || "";
		
		this.currentFileEntry = {
			fileName,
			lineNr: 0,
			longAddr,
			size: 0,
			line: `; USAGE: ${data}`,
			modulePrefix: this.modulePrefix,
			lastLabel: this.lastLabel
		};
		this.listFile.push(this.currentFileEntry);
	}

	/**
	 * Find the source file information for a given address.
	 * @param addr The address to look up.
	 * @returns Source filename or undefined.
	 */
	private findSourceFileForAddress(addr: number): string | undefined {
		// Look for the nearest file reference at or before this address
		let bestAddr = -1;
		let bestFile = '';
		
		for (const [addrStr, filename] of this.sourceFiles) {
			const fileAddr = parseInt(addrStr, 16);
			if (fileAddr <= addr && fileAddr > bestAddr) {
				bestAddr = fileAddr;
				bestFile = filename;
			}
		}
		
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
}
