import {DebugProtocol} from '@vscode/debugprotocol';
import {Utility} from '../misc/utility';
import * as fs from 'fs';
import * as fglob from 'fast-glob';
import {UnifiedPath} from '../misc/unifiedpath';
import {CustomMemoryType} from './settingscustommemory';


///  The absolute minimum base for all assembler configurations.
export interface ListConfigBase {

	/// The path to the list file.
	path: string;
}


/// Base for all assembler configurations.
export interface AsmConfigBase extends ListConfigBase {

	/// If defined the files referenced in the list file will be used for stepping otherwise the list file itself will be used.
	/// The path(s) here are relative to the 'rootFolder'.
	/// It is also possible to add several paths. Files are checked one after the other: first sources path, second sources path, ... last sources path.
	srcDirs: Array<string>;

	// An array of glob patterns with filenames to exclude. The filenames (from the 'include' statement) that do match will not be associated with executed addresses. I.e. those source files are not shown during stepping.
	excludeFiles: Array<string>;
}


/// Reverse Engineering
export interface ReverseEngineeringConfig extends ListConfigBase {
	// If true the list files are re-loaded automatically if this file has been saved.
	reloadOnSave: boolean;
}



/// sjasmplus
export interface SjasmplusConfig extends AsmConfigBase {
	// Note: In sjasmplus the 'path' can be used either for a list file or for a sld file.
}


/// Z80Asm
export interface Z80asmConfig extends AsmConfigBase {
}


// Z88dk
export interface Z88dkConfig extends AsmConfigBase {
	/// Path to the main assembler source file that was used to produce the .list file.
	mainFile: string;

	/// The z88dk map file (option "-m").
	mapFile: string;
}


// Z88dk version 2.2. Option "-m" (map file) is required.
// Both .lis and .map file are required for parsing.
// Parsing does not required "-debug". In some cases (if there is code
// that is not starting with a label the line/file association will
// be missing for that portion).
export interface Z88dkConfigV2 extends AsmConfigBase {
	/// The z88dk map file (option "-m").
	mapFile: string;
}

// Zmac assembler
export interface ZmacConfig extends AsmConfigBase {
	// Note: In zmac the 'path' should point to the .bds file generated with -j option.
}


export interface Formatting {
	/// Format how the registers are displayed in the VARIABLES area.
	/// Is an array with 2 strings tuples. The first is an regex that checks the register.
	/// If fulfilled the 2nd is used to format the value.
	registerVar: Array<string>;

	/// Format how the registers are displayed when hovering with the mouse.
	/// Is an array with 2 strings tuples. The first is an regex that checks the register.
	/// If fulfilled the 2nd is used to format the value.
	registerHover: Array<string>;

	/// The general formatting for address labels bigger than 'smallValuesMaximum'.
	bigValues: string;

	/// The general formatting for small values like constants smaller/equal than 'smallValuesMaximum'.
	smallValues: string;

	/// The 'byte' formatting for labels in the WATCHES area.
	watchByte: string;

	/// The 'word' formatting for labels in the WATCHES area.
	watchWord: string;

	/// Format for the pushed values in the STACK area.
	stackVar: string;
}


/// Definitions for loading the object files.
export interface LoadObj {
	/// The path to one obj file.
	path: string;
	/// The memory address of that file. Can be a label.
	start: string;
}


/// Definitions for the 'zrcp' remote type.
export interface ZrcpType {
	/// The Zesarux ZRCP telnet host name/IP address
	hostname: string;

	/// The Zesarux ZRCP telnet port
	port: number;

	/// If enabled zesarux does not break on manual break in interrupts.
	skipInterrupt: boolean;

	// The delay before loading the Z80 program via smartload.
	loadDelay: number;

	/// Resets the cpu (on ZEsarUX) after starting the debugger.
	resetOnLaunch: boolean;

	/// The socket timeout in seconds.
	socketTimeout: number;
}


// Definitions for CSpect remote type.
export interface CSpectType {
	// The hostname/IP address of the CSpect socket.
	hostname: string;

	// The port of the CSpect socket.
	port: number;

	/// The socket timeout in seconds.
	socketTimeout: number;
}


// Definitions for the MAME remote type.
export interface MameType {
	// The hostname/IP address of the MAME gdbstub socket.
	hostname: string;

	// The port of the MAME gdbstub socket.
	port: number;

	/// The socket timeout in seconds.
	socketTimeout: number;
}


// Definitions for ZX Next remote type.
export interface ZxNextSerialType {
	// The serial usb device.
	serial: string;	// E.g. "/dev/cu.usbserial-AQ007PCD" on macOS
	/// The serial timeout in seconds.
	timeout: number;
}


// Definitions for TRS-80 remote type.
export interface Trs80Type {
	// The hostname/IP address of the TRS-80 remote.
	hostname: string;

	// The port of the TRS-80 remote.
	port: number;

	/// The socket timeout in seconds.
	socketTimeout: number;

	// When true, uses the internal mock server instead of connecting to a real trs80gp emulator.
	// This is useful for testing/development without requiring the actual emulator.
	useMock?: boolean;

	// Register format: 'hex' (default) or 'decimal'. 
	// Determines how register values are parsed from the trs80gp protocol.
	// The mock server always outputs hexadecimal format.
	registerFormat?: 'hex' | 'decimal';

	// trs80gp emulator launch configuration
	emulator?: Trs80EmulatorConfig;
}

// trs80gp emulator launch configuration
export interface Trs80EmulatorConfig {
	// Path to trs80gp executable
	path: string;

	// TRS-80 model to emulate (-m option)
	// 1 = Model I, 3 = Model III, 4 = Model 4
	model: 1 | 3 | 4;

	// Memory size in KB (-mem option)
	// Model I: 4, 16, 48
	// Model III: 16, 48  
	// Model 4: 64, 128
	memorySize?: number;

	// Disk images to mount (-d0, -d1 options)
	diskImages?: {
		drive0?: string;  // Path to disk image for drive 0
		drive1?: string;  // Path to disk image for drive 1
	};

	// Cassette tape image to load (-cas option)
	cassetteImage?: string;

	// Load symbols file (-ls option)
	symbolsFile?: string;

	// Enable serial/JSON-RPC interface (-serial option)
	enableSerial?: boolean;

	// Additional command line arguments
	additionalArgs?: string[];

	// Working directory for the emulator
	workingDirectory?: string;

	// Auto-start the emulator when debugging starts
	autoStart?: boolean;
}


// Subtype for the custom javascript code.
export interface CustomCodeType {
	// If true the zsim simulator view is put in debug mode which makes it easier to develop additional javascript code (see jsPath).
	debug: boolean;

	// A relative path to additional javascript code that is included into the Z80 simulator.
	jsPath: string;

	// A relative path to additional javascript code that is included into the Z80 simulator UI panel.
	uiPath: string;

	// You can set a time step (interval) to call the tick() function.
	timeStep: number;
}


/// TBBlue registers. Only a very limited set is supported.
export interface TBBlueType {
	/// If true the cpu speed selection is enabled.
	REG_TURBO_MODE: boolean;
}


// Custom joystick type to map one joystick to any port
// and any bit.
export interface JoyBitPort {
	// The bits of the port to ignore are 0.
	portMask: number;

	// The port address.
	port: number;

	// The bit to set (or reset) if the corresponding joystick button is pressed.
	bit: number;	// e.g. 0x10 for the 4th bit

	// True, if the bit should be low active.
	lowActive: boolean;	// Default=true
}


// Associates the bit to set (or reset) when the correspondin joystick button is pressed.
export interface CustomJoyType {
	fire: JoyBitPort;
	fire2: JoyBitPort;
	fire3: JoyBitPort;
	fire4: JoyBitPort;
	up: JoyBitPort;
	left: JoyBitPort;
	right: JoyBitPort;
	down: JoyBitPort;
}


// The ZX81 and ZX Spectrum screen area.
// Users can change it to their needs.
export interface ScreenAreaType {
	firstX: number;	// First x position to display
	lastX: number;	// Last x position to display (inclusive)
	firstY: number;	// First y position to display
	lastY: number;	// Last y position to display (inclusive)

}


// Chroma 81 interface
export interface Chroma81Type {
	available: boolean;	// Turn chroma81 support on/off (port in/out)
	enabled: boolean;	// Enable color mode
	mode: number;		// 0=Character code, 1=Attribute file
	borderColor: number;	// Bit 3: Brightness, Bit 2-0: GRB color
	colourizationFile: string;	// Path to the colourization file
}


// The type to define aline with color
export interface LineType {
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	color: string	// HTML coloe, e.g. "red" of "#FF0000"
}

// Options for the ZX81 ULA screen.
export interface UlaOptions {
	// For both, ZX81 and Spectrum:
	screenArea: ScreenAreaType;	// The screen area
	borderSize: number;	// The border size in pixels, alternative for screenArea
	showStandardLines: boolean; // Shows standard lines like HSYNC in the display
	lines: LineType[];	// Additional lines to draw

	// Only ZX81:
	hires: boolean;		// Use hires mode
	chroma81: Chroma81Type;	// Chroma 81 interface
	debug: boolean;		// Debug mode: show gray in collapsed dfile
}


/// Definitions for the 'zsim' remote type.
export interface ZSimType {
	// Defines a preset of settings to simulate a ZX Spectrum or ZX81.
	// I.e. for a Spectrum it defines zxKeyboard, zxInterface2Joy, visualMemory, 48K, ulaScreen, zxBeeper, cpuFrequency, defaultPortIn.
	// For a ZX81 it defines zxKeyboard, visualMemory, 16K, ulaScreen, cpuFrequency, defaultPortIn.
	// All settings can be overwritten if explicitly set.
	preset: 'spectrum' | 'zx81' | 'none';

	// If enabled the simulator shows a ZX Spectrum/ZX81 keyboard to simulate keypresses.
	zxKeyboard: 'spectrum' | 'zx81' | 'none';

	// If enabled the simulator shows a pad to simulate the joysticks for interface 2.
	zxInterface2Joy: boolean,

	// If enabled the simulator shows a pad to simulate the Kempston joystick at port 0x1F.
	kempstonJoy: boolean;

	// If enabled the simulator shows a pad to simulate a custom programmable joystick.
	// This way it is possible to map the joystick to any port
	// and any bit.
	customJoy: CustomJoyType;

	// If enabled the simulator shows the access to the memory (0-0xFFFF) visually while the program is running.
	visualMemory: boolean,

	// If enabled it shows the contents of the ZX Spectrum or ZX 81 screen.
	ulaScreen: 'spectrum' | 'zx81' | 'none',	// "spectrum" or "zx81"

	// Options for the zx81 screen.
	ulaOptions: UlaOptions;

	// Enables overriding the load (save) routine of the ZX81 ROM.
	// If enabled the load routine (at 0x0343) of the ZX81 is skipped and a file is loaded
	// directly into the memory. Afterwards execution is continued at 0x0207.
	zx81LoadOverlay: boolean;

	// Enables ZX Spectrum sound through it's beeper.
	zxBeeper: boolean,

	// The sample rate used for audio. Defaults to 22050 Hz.
	audioSampleRate: number,

	// Memory model: ZX16k, ZX48k, ZX128K or ZXNext.
	// - "RAM": One memory area of 64K RAM, no banks.
	// - "ZX16K": ROM and RAM as of the ZX Spectrum 16K.
	// - "ZX48K": ROM and RAM as of the ZX Spectrum 48K.
	// - "ZX128K": Banked memory as of the ZX Spectrum 48K (16k slots/banks).
	// - "ZXNEXT": Banked memory as of the ZX Next (8k slots/banks).
	// - "customMemory": The user can define an own memory model, see customMemory.
	memoryModel: string,

	/** A user defined memory.
	 * "customMemory": {
	 *	"numberOfBanks": 4,
	 *		"banks": {
	 *			"0": "ROM",
	 *			"1": "RAM"
	 *		}
	 *	},
	 */
	customMemory: CustomMemoryType,

	// The number of interrupts to calculate the average from. 0 to disable.
	cpuLoad: number,

	// The CPU frequency is only used for output. I.e. when the t-states are printed
	// there is also a printout of the correspondent time. This is calculated via the CPU frequency here.
	cpuFrequency: number,

	// If enabled the simulated CPU performance is throttled to fit the given CPU frequency.
	// Is enabled by default. If disabled the CPU will be simulated as fast as possible.
	limitSpeed: boolean;

	// The update frequency of the simulator view in Hz.
	updateFrequency: number,

	// Default value that is returned for the ports (if no "HW" is configured).
	// Usually 0xFF = Open Collector. Aöö in ports are ANDed.
	// 0x00 = All in ports are ORed.
	defaultPortIn: 0xFF | 0x00;

	// Settings to execute custom javascript code inside the zsim simulator.
	customCode: CustomCodeType;

	// If enabled the Z80N extended instructions are supported.
	Z80N: boolean,

	// Inside the tbblue registers available can be specified.
	// Please note: the MMU registers are enabled already by the memoryModel
	// "ZXNEXT" and do not appear here.
	// Experimental
	tbblue: TBBlueType,

	// The zxnDMA hardware simulation.
	zxnDMA: boolean;
}


/**
 * The settings for the disassembler in the VARIABLEs pane.
 */
export interface DisassemblerArgs {
	numberOfLines: number;	// Number of lines displayed in the (brute force) disassembly
}


/**
 * The settings for the smart disassembler (disasm.list).
 */
export interface SmartDisassemblerArgs {
	lowerCase: boolean;
}


/**
 * See also package.json.
 * The configuration parameters for the zesarux debugger.
 */
export interface SettingsParameters extends DebugProtocol.LaunchRequestArguments {
	/// The remote type: zesarux or zxnext.
	remoteType: 'zrcp' | 'cspect' | 'zxnext' | 'zsim' | 'mame' | 'trs80gp';

	// The special settings for zrcp (ZEsarux).
	zrcp: ZrcpType;

	// The special settings for CSpect.
	cspect: CSpectType;

	// The special settings for MAME.
	mame: MameType;

	// The special settings for TRS-80.
	trs80: Trs80Type;

	// The special settings for the internal Z80 simulator.
	zsim: ZSimType;

	// The special settings for the serial connection.
	zxnext: ZxNextSerialType;

	/// true if the configuration is for unit tests.
	unitTests: false;

	/// The path of the root folder. All other paths are relative to this. Usually = ${workspaceFolder}
	rootFolder: string;

	/// The paths to the .list files / assembler parameters.
	sjasmplus: Array<SjasmplusConfig>;
	z80asm: Array<Z80asmConfig>;
	z88dk: Array<Z88dkConfig>;
	z88dkv2: Array<Z88dkConfigV2>;
	zmac: Array<ZmacConfig>;
	revEng: Array<ReverseEngineeringConfig>;

	/// The paths to the .labels files.
	//labelsFiles: Array<string>;

	/// Interprets labels as address if value is bigger. Typically this is e.g. 512. So all numbers below are not treated as addresses if shown. So most constant values are covered with this as they are usually smaller than 512. Influences the formatting.
	smallValuesMaximum: number;

	/// These arguments are passed to the disassembler in the VARIABLEs pane.
	disassemblerArgs: DisassemblerArgs;

	/// These arguments are passed to the smart disassembler (disasm.list).
	smartDisassemblerArgs: SmartDisassemblerArgs;

	/// A directory for temporary files created by this debug adapter. E.g. ".tmp"
	tmpDir: string;

	/// label or address which is above the topmost entry on the stack. It is used to determine the end of the call stack.
	topOfStack: string;

	/// label or address to use as start address for program execution if no .sna
	/// file is loaded.
	execAddress: string;

	/// If defined the path to a snapshot (or tap) file to load at startup
	load: string;

	/// If defined, an array of paths to binary files together with start addresses to load at startup
	loadObjs: Array<LoadObj>;

	/// Start automatically after launch.
	startAutomatically: boolean;

	/// An array with commands that are executed after the program-to-debug is loaded.
	commandsAfterLaunch: Array<string>;

	/// If enabled code coverage information is analyzed and displayed.
	/// Useful especially for unit tests but can be enabled also in "normal" launch configurations.
	history: {
		reverseDebugInstructionCount: number;	// Sets the number of instructions for reverse debugging. If set to 0 then reverse debugging is turned off.
		spotCount: number;	// Sets the number of instructions to show in a spot. If you set this e.g. to 5 then the 5 previous and the 5 next instructions related to the current position are shown.
		spotShowRegisters: boolean;	// If true it shows additionally the changed registers. Default=true.
		codeCoverageEnabled: boolean;	// Enable/disable code coverage.
	}

	/// Holds the formatting vor all values.
	formatting: Formatting;

	/// Values for the memory viewer.
	memoryViewer: {
		addressColor: string;	// The text color of the address field.
		bytesColor: string;	// The color of the bytes (hex values).
		asciiColor: string;	// The text color of the ascii field.
		addressHoverFormat: string;	// Format for the address when hovering.
		valueHoverFormat: string;	// Format for the value when hovering.
		registerPointerColors: Array<string>;	// The register/colors to show as colors in the memory view.

		registersMemoryView: Array<string>;	// An array of register to show in the register memory view.
	}

	/// Tab size used in formatting.
	tabSize: number;

	/// The timeout for any unit test in seconds.
	unitTestTimeout: number;
}


/// Singleton:
/// A class through which the settings can be accessed.
/// I.e. the parameters in launch.json.
export class Settings {

	// Maximum number for history spot count.
	protected static MAX_HISTORY_SPOT_COUNT = 20;

	// Remembers the name of the launch.json config being used
	public static configName = 'undefined';

	/// The representation of the launch.json
	public static launch: SettingsParameters;


	/**
	 * Sets unset default values.
	 * E.g. in the launchRequest.
	 * Initializes all values (sets anything that is not set in the json).
	 * All relative paths are expanded with the 'rootFolder' path.
	 * @param launchCfg The configuration (launch.json).
	 * @param rootFolder Path to the root folder.
	 * @returns An "enhanced" launchCfg. E.g. default values are set.
	 */
	static Init(launchCfg: SettingsParameters): SettingsParameters {
		if (!launchCfg) {
			launchCfg = {
				remoteType: <any>undefined,
				zrcp: <any>undefined,
				cspect: <any>undefined,
				mame: <any>undefined,
				zsim: <any>undefined,
				zxnext: <any>undefined,
				trs80: <any>undefined,
				unitTests: <any>undefined,
				rootFolder: <any>undefined,
				sjasmplus: <any>undefined,
				z80asm: <any>undefined,
				z88dk: <any>undefined,
				z88dkv2: <any>undefined,
				zmac: <any>undefined,
				revEng: <any>undefined,
				smallValuesMaximum: <any>undefined,
				disassemblerArgs: <any>undefined,
				smartDisassemblerArgs: <any>undefined,
				tmpDir: <any>undefined,
				topOfStack: <any>undefined,
				execAddress: <any>undefined,
				load: <any>undefined,
				loadObjs: <any>undefined,
				startAutomatically: <any>undefined,
				commandsAfterLaunch: <any>undefined,
				history: <any>undefined,
				formatting: <any>undefined,
				memoryViewer: <any>undefined,
				tabSize: <any>undefined,
				unitTestTimeout: <any>undefined
			}
		}

		// Check rootFolder
		let rootFolder = launchCfg.rootFolder ?? '';	// Will be checked in the CheckSettings.
		// Change to a true-case-path (E.g. the user might have given "/volumes..." but the real path is "/Volumes...")
		try {
			const result = fs.realpathSync.native(rootFolder); // On windows this returns a capital drive letter
			// console.log("fs.realpathSync(" + rootFolder + ") = " + result);
			// If no exception occurs the path is valid:
			rootFolder = result;
		}
		catch {}
		// Also use for the launch config.
		rootFolder = UnifiedPath.getUnifiedPath(rootFolder);
		launchCfg.rootFolder = rootFolder;

		// Check for default values (for some reasons the default values from the package.json are not used)
		if (launchCfg.unitTests === undefined)
			launchCfg.unitTests = false;
		const unitTests = launchCfg.unitTests;

		// zrcp
		if (!launchCfg.zrcp)
			launchCfg.zrcp = {} as ZrcpType;
		if (launchCfg.zrcp.hostname === undefined)
			launchCfg.zrcp.hostname = 'localhost';
		if (launchCfg.zrcp.port === undefined)
			launchCfg.zrcp.port = 10000;
		if (launchCfg.zrcp.loadDelay === undefined) {
			const platform = process.platform;
			let delay = 0;
			if (platform === 'win32')
				delay = 100;
			launchCfg.zrcp.loadDelay = delay;	// ms
		}
		if (launchCfg.zrcp.resetOnLaunch === undefined)
			launchCfg.zrcp.resetOnLaunch = true;
		if (!launchCfg.zrcp.socketTimeout)
			launchCfg.zrcp.socketTimeout = 5;	// 5 secs

		// cspect
		if (!launchCfg.cspect)
			launchCfg.cspect = {} as CSpectType;
		if (launchCfg.cspect.hostname === undefined)
			launchCfg.cspect.hostname = 'localhost';
		if (launchCfg.cspect.port === undefined)
			launchCfg.cspect.port = 11000;
		if (!launchCfg.cspect.socketTimeout)
			launchCfg.cspect.socketTimeout = 5;	// 5 secs

		// mame
		if (!launchCfg.mame)
			launchCfg.mame = {} as MameType;
		if (launchCfg.mame.hostname === undefined)
			launchCfg.mame.hostname = 'localhost';
		if (launchCfg.mame.port === undefined)
			launchCfg.mame.port = 12000;
		if (!launchCfg.mame.socketTimeout)
			launchCfg.mame.socketTimeout = 5;	// 5 secs

		// trs80
		if (!launchCfg.trs80)
			launchCfg.trs80 = {} as Trs80Type;
		if (launchCfg.trs80.hostname === undefined)
			launchCfg.trs80.hostname = 'localhost';
		if (launchCfg.trs80.port === undefined)
			launchCfg.trs80.port = 49152;  // 49152 = 48K addressable memory (TRS-80 Model I/III), decrement for multiple emulators
		if (launchCfg.trs80.useMock === undefined)
			launchCfg.trs80.useMock = false;  // Default to using the real emulator if available
		if (launchCfg.trs80.registerFormat === undefined)
			launchCfg.trs80.registerFormat = 'hex';  // Default to hexadecimal format
		if (!launchCfg.trs80.socketTimeout)
			launchCfg.trs80.socketTimeout = 5;	// 5 secs

		// trs80 emulator config
		if (launchCfg.trs80.emulator) {
			// Convert relative paths to absolute paths
			if (launchCfg.trs80.emulator.path) {
				const path = UnifiedPath.getUnifiedPath(launchCfg.trs80.emulator.path);
				launchCfg.trs80.emulator.path = Utility.getAbsFilePath(path, rootFolder);
			}
			if (launchCfg.trs80.emulator.diskImages?.drive0) {
				const path = UnifiedPath.getUnifiedPath(launchCfg.trs80.emulator.diskImages.drive0);
				launchCfg.trs80.emulator.diskImages.drive0 = Utility.getAbsFilePath(path, rootFolder);
			}
			if (launchCfg.trs80.emulator.diskImages?.drive1) {
				const path = UnifiedPath.getUnifiedPath(launchCfg.trs80.emulator.diskImages.drive1);
				launchCfg.trs80.emulator.diskImages.drive1 = Utility.getAbsFilePath(path, rootFolder);
			}
			if (launchCfg.trs80.emulator.cassetteImage) {
				const path = UnifiedPath.getUnifiedPath(launchCfg.trs80.emulator.cassetteImage);
				launchCfg.trs80.emulator.cassetteImage = Utility.getAbsFilePath(path, rootFolder);
			}
			if (launchCfg.trs80.emulator.symbolsFile) {
				const path = UnifiedPath.getUnifiedPath(launchCfg.trs80.emulator.symbolsFile);
				launchCfg.trs80.emulator.symbolsFile = Utility.getAbsFilePath(path, rootFolder);
			}
			if (launchCfg.trs80.emulator.workingDirectory) {
				const path = UnifiedPath.getUnifiedPath(launchCfg.trs80.emulator.workingDirectory);
				launchCfg.trs80.emulator.workingDirectory = Utility.getAbsFilePath(path, rootFolder);
			}
			// Set default values
			if (launchCfg.trs80.emulator.model === undefined)
				launchCfg.trs80.emulator.model = 1;
			if (launchCfg.trs80.emulator.memorySize === undefined)
				launchCfg.trs80.emulator.memorySize = 48;  // 48KB default for Model I
			if (launchCfg.trs80.emulator.enableSerial === undefined)
				launchCfg.trs80.emulator.enableSerial = true;
			if (launchCfg.trs80.emulator.autoStart === undefined)
				launchCfg.trs80.emulator.autoStart = true;
			if (!launchCfg.trs80.emulator.additionalArgs)
				launchCfg.trs80.emulator.additionalArgs = [];
		}

		// zsim
		if (!launchCfg.zsim)
			launchCfg.zsim = {} as ZSimType;
		const preset = launchCfg.zsim.preset;
		if (preset === undefined) {
			launchCfg.zsim.preset = 'none';
		}
		else {
			// Spectrum
			if (preset === 'spectrum') {
				if (launchCfg.zsim.zxKeyboard === undefined)
					launchCfg.zsim.zxKeyboard = 'spectrum';
				if (launchCfg.zsim.zxInterface2Joy === undefined)
					launchCfg.zsim.zxInterface2Joy = true;
				if (launchCfg.zsim.memoryModel === undefined)
					launchCfg.zsim.memoryModel = "ZX48K";
				if(launchCfg.zsim.visualMemory === undefined)
					launchCfg.zsim.visualMemory = true;
				if(launchCfg.zsim.ulaScreen === undefined)
					launchCfg.zsim.ulaScreen = 'spectrum';
				if (launchCfg.zsim.zxBeeper === undefined)
					launchCfg.zsim.zxBeeper = true;
				if(launchCfg.zsim.cpuFrequency === undefined)
					launchCfg.zsim.cpuFrequency = 3500000.0;	// 3.5Mhz
				if(launchCfg.zsim.defaultPortIn === undefined)
					launchCfg.zsim.defaultPortIn = 0xFF;
			}
			// ZX81
			else if (preset === 'zx81') {
				if (launchCfg.zsim.zxKeyboard === undefined)
					launchCfg.zsim.zxKeyboard = 'zx81';
				if (launchCfg.zsim.memoryModel === undefined)
					launchCfg.zsim.memoryModel = "ZX81-56K";
				if (launchCfg.zsim.visualMemory === undefined)
					launchCfg.zsim.visualMemory = true;
				if (launchCfg.zsim.ulaScreen === undefined)
					launchCfg.zsim.ulaScreen = 'zx81';
				if (launchCfg.zsim.zx81LoadOverlay === undefined)
					launchCfg.zsim.zx81LoadOverlay = true;
				if (launchCfg.zsim.cpuFrequency === undefined)
					launchCfg.zsim.cpuFrequency = 3250000.0;	// 3.25Mhz
				if (launchCfg.zsim.defaultPortIn === undefined)
					launchCfg.zsim.defaultPortIn = 0xFF;
				if (launchCfg.zsim.ulaOptions === undefined) {
					launchCfg.zsim.ulaOptions = {} as UlaOptions;
				}
				if (launchCfg.zsim.ulaOptions.chroma81 === undefined) {
					launchCfg.zsim.ulaOptions.chroma81 = {} as Chroma81Type;
				}
			}
		}
		if (launchCfg.zsim.zxKeyboard === undefined)
			launchCfg.zsim.zxKeyboard = 'spectrum';
		if (launchCfg.zsim.zxInterface2Joy === undefined)
			launchCfg.zsim.zxInterface2Joy = false;
		if (launchCfg.zsim.kempstonJoy === undefined)
			launchCfg.zsim.kempstonJoy = false;
		if (launchCfg.zsim.customJoy !== undefined) {
			const customJoy = launchCfg.zsim.customJoy;
			// Loop over all defined properties
			for(const prop in customJoy) {
				const button = customJoy[prop];
				button.portMask = (button.portMask === undefined) ? 0xFFFF : parseInt(button.portMask);
				if (button.port !== undefined)
					button.port = parseInt(button.port);
				if (button.bit !== undefined)
					button.bit = parseInt(button.bit);
				if (button.lowActive === undefined)
					button.lowActive = true;
			}
		}
		if (launchCfg.zsim.ulaScreen === undefined || launchCfg.zsim.ulaScreen as any === false)
			launchCfg.zsim.ulaScreen = 'none';
		else if (launchCfg.zsim.ulaScreen as any === true) // Old config
			launchCfg.zsim.ulaScreen = 'spectrum';
		if (launchCfg.zsim.ulaOptions === undefined) {
			launchCfg.zsim.ulaOptions = {
			} as UlaOptions;
		}
		if (launchCfg.zsim.zx81LoadOverlay === undefined)
			launchCfg.zsim.zx81LoadOverlay = false;

		const ulaOptions = launchCfg.zsim.ulaOptions;
		if (ulaOptions.hires === undefined)
			ulaOptions.hires = true;

		// screenArea and borderSize, only one can be defined by the user.
		// Settings will turn borderSize into screenArea.
		// I.e. afterwards borderSize is removed.
		const ulaScreen = launchCfg.zsim.ulaScreen;
		let bSize = ulaOptions.borderSize;
		if (ulaOptions.borderSize !== undefined && ulaOptions.screenArea === undefined) {
			ulaOptions.borderSize = undefined as any;
		}
		if (ulaOptions.screenArea === undefined)
			ulaOptions.screenArea = {} as ScreenAreaType;
		const screenArea = ulaOptions.screenArea;
		if (ulaScreen === 'zx81') {
			if (screenArea.firstX === undefined)
				screenArea.firstX = 64;
			if (screenArea.lastX === undefined)
				screenArea.lastX = 320;
			if (screenArea.firstY === undefined)
				screenArea.firstY = 56;
			if (screenArea.lastY === undefined)
				screenArea.lastY = 248;
		}
		else if (ulaScreen === 'spectrum') {
			if (screenArea.firstX === undefined)
				screenArea.firstX = 48;
			if (screenArea.lastX === undefined)
				screenArea.lastX = 304;
			if (screenArea.firstY === undefined)
				screenArea.firstY = 56;
			if (screenArea.lastY === undefined)
				screenArea.lastY = 248;
		}

		// Subtract border
		if (bSize === undefined)
			bSize = 10;	// Default border
		screenArea.firstX -= bSize;
		screenArea.lastX += bSize;
		screenArea.firstY -= bSize;
		screenArea.lastY += bSize;

		// Check for min max screen area
		if (screenArea.firstX < 0)
			screenArea.firstX = 0;
		if (screenArea.lastX > 1000)
			screenArea.lastX = 1000;
		if (screenArea.firstY < 0)
			screenArea.firstY = 0;
		if (screenArea.lastY > 1000)
			screenArea.lastY = 1000;

		if (ulaOptions.showStandardLines === undefined)
			ulaOptions.showStandardLines = false;
		if (ulaOptions.lines === undefined)
			ulaOptions.lines = [];
		if (ulaOptions.chroma81 === undefined)
			ulaOptions.chroma81 = {
				available: false
			} as Chroma81Type;

		const chroma81 = ulaOptions.chroma81;
		if (chroma81.available === undefined)
			chroma81.available = true;
		if (chroma81.enabled === undefined)
			chroma81.enabled = false;
		if (chroma81.mode === undefined)
			chroma81.mode = 0;
		if (chroma81.borderColor === undefined)
			chroma81.borderColor = 0x0F;	// White
		if (chroma81.colourizationFile === undefined)
			chroma81.colourizationFile = '';

		if (launchCfg.zsim.zxBeeper === undefined)
			launchCfg.zsim.zxBeeper = false;
		if (launchCfg.zsim.audioSampleRate === undefined)
			launchCfg.zsim.audioSampleRate = 22050;
		if (launchCfg.zsim.cpuLoad === undefined)
			launchCfg.zsim.cpuLoad = 10;
		if (launchCfg.zsim.visualMemory === undefined)
			launchCfg.zsim.visualMemory = true;
		if (launchCfg.zsim.memoryModel === undefined)
			launchCfg.zsim.memoryModel = "RAM";
		launchCfg.zsim.memoryModel = launchCfg.zsim.memoryModel.toUpperCase();
		if (launchCfg.zsim.cpuFrequency === undefined)
			launchCfg.zsim.cpuFrequency = 3500000.0;	// 3500000.0 for 3.5MHz.
		if (launchCfg.zsim.limitSpeed === undefined)
			launchCfg.zsim.limitSpeed = true;
		if (launchCfg.zsim.updateFrequency === undefined)
			launchCfg.zsim.updateFrequency = 10.0;
		if (launchCfg.zsim.defaultPortIn === undefined)
			launchCfg.zsim.defaultPortIn = 0xFF;
		if (launchCfg.zsim.Z80N === undefined)
			launchCfg.zsim.Z80N = false;
		if (launchCfg.zsim.tbblue === undefined)
			launchCfg.zsim.tbblue = {REG_TURBO_MODE: false} as TBBlueType;

		// Check for DMA
		if (launchCfg.zsim.zxnDMA === undefined)
			launchCfg.zsim.zxnDMA = false;

		// Check update frequency ranges
		if (launchCfg.zsim.updateFrequency < 5.0)
			launchCfg.zsim.updateFrequency = 5.0;	// 5 Hz
		else if (launchCfg.zsim.updateFrequency > 100.0)
			launchCfg.zsim.updateFrequency = 100.0;	// 100 Hz


		// zsim custom code
		if (launchCfg.zsim.customCode === undefined) {
			launchCfg.zsim.customCode = {} as any;
		}
		if (launchCfg.zsim.customCode.debug === undefined)
			launchCfg.zsim.customCode.debug = false;
		if (launchCfg.zsim.customCode.jsPath !== undefined) {
			const path = UnifiedPath.getUnifiedPath(launchCfg.zsim.customCode.jsPath);
			launchCfg.zsim.customCode.jsPath = Utility.getAbsFilePath(path, rootFolder);
		}
		if (launchCfg.zsim.customCode.uiPath !== undefined) {
			const path = UnifiedPath.getUnifiedPath(launchCfg.zsim.customCode.uiPath);
			launchCfg.zsim.customCode.uiPath = Utility.getAbsFilePath(path, rootFolder);
		}
		if (launchCfg.zsim.customCode.timeStep === undefined) {
			// In fact: never call tick()
			launchCfg.zsim.customCode.timeStep = Number.MAX_SAFE_INTEGER;
		}

		// zsim custom memory
		const custMem = launchCfg.zsim.customMemory;
		if (custMem !== undefined) {
			// io MMU concatenate
			if (custMem.ioMmu !== undefined) {
				if (typeof custMem.ioMmu !== "string")
					custMem.ioMmu = custMem.ioMmu.join("\n");
			}
			// Slots
			for (const slotRange of custMem.slots) {
				// Convert slot ranges from hex-string to number
				const len = slotRange.range.length;
				for (let i = 0; i < len; i++) {
					// Convert hex into number
					slotRange.range[i] = Utility.convertHexNumber(slotRange.range[i])!;
				}
				// Banks
				for (const bank of slotRange.banks) {
					// Create abs paths
					if (bank.rom !== undefined) {
						if (typeof bank.rom === 'string') {
							const path = UnifiedPath.getUnifiedPath(bank.rom);
							bank.rom = Utility.getAbsFilePath(path, rootFolder);
						}
					}
					// Convert rom offset from hex-string to number
					bank.romOffset = Utility.convertHexNumber(bank.romOffset);
				}
			}
		}

		// zxnext
		if (!launchCfg.zxnext) {
			launchCfg.zxnext = {} as ZxNextSerialType;
			// Note: if 'serial' is undefined and type is 'zxnext', this will create an error
		}
		if (launchCfg.zxnext.timeout === undefined) {
			launchCfg.zxnext.timeout = 5;	// Seconds
		}

		// sjasmplus
		if (launchCfg.sjasmplus) {
			launchCfg.sjasmplus = launchCfg.sjasmplus.map(fp => {
				// ListFile structure
				const fpPath = UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs = UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpExclFiles = UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const file = {
					path: undefined as any,
					srcDirs: fpSrcDirs ?? [""],
					excludeFiles: fpExclFiles ?? []
				};
				if (fpPath) {
					// Note: path is a glob path
					const unifiedRootFolder = UnifiedPath.getUnifiedPath(rootFolder);
					const escapedRootFolder = Utility.escapePathForGlob(unifiedRootFolder);
					const unifiedFpPath = UnifiedPath.getUnifiedPath(fpPath);
					file.path = Utility.getAbsFilePathWoUnify(unifiedFpPath, escapedRootFolder)
				}
				return file;
			});
		}

		// z80asm
		if (launchCfg.z80asm) {
			launchCfg.z80asm = launchCfg.z80asm.map(fp => {
				// ListFile structure
				const fpPath = UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs = UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpExclFiles = UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const file = {
					path: undefined as any,
					srcDirs: fpSrcDirs ?? [""],
					excludeFiles: fpExclFiles ?? []
				};
				if (fpPath) {
					// Note: path is a glob path
					const unifiedRootFolder = UnifiedPath.getUnifiedPath(rootFolder);
					const escapedRootFolder = Utility.escapePathForGlob(unifiedRootFolder);
					const unifiedFpPath = UnifiedPath.getUnifiedPath(fpPath);
					file.path = Utility.getAbsFilePathWoUnify(unifiedFpPath, escapedRootFolder)
				}
				return file;
			});
		}

		// z88dk
		if (launchCfg.z88dk) {
			launchCfg.z88dk = launchCfg.z88dk.map(fp => {
				// ListFile structure
				const fpPath = UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs = UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpMapFile = UnifiedPath.getUnifiedPath(fp.mapFile);
				const fpExclFiles = UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const fpMainFile = UnifiedPath.getUnifiedPath(fp.mainFile);
				const file = {
					path: undefined as any,
					srcDirs: fpSrcDirs ?? [""],
					excludeFiles: fpExclFiles ?? [],
					mainFile: fpMainFile ?? "",
					mapFile: undefined as any
				};
				if (fpPath) {
					// Note: path is a glob path
					const unifiedRootFolder = UnifiedPath.getUnifiedPath(rootFolder);
					const escapedRootFolder = Utility.escapePathForGlob(unifiedRootFolder);
					const unifiedFpPath = UnifiedPath.getUnifiedPath(fpPath);
					file.path = Utility.getAbsFilePathWoUnify(unifiedFpPath, escapedRootFolder)
				}
				if (fpMapFile)
					file.mapFile = Utility.getAbsFilePath(fpMapFile, rootFolder);
				return file;
			});
		}

		// z88dkv2
		if (launchCfg.z88dkv2) {
			launchCfg.z88dkv2 = launchCfg.z88dkv2.map(fp => {
				// ListFile structure
				const fpPath = UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs = UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpMapFile = UnifiedPath.getUnifiedPath(fp.mapFile);
				const fpExclFiles = UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const file = {
					path: undefined as any,
					srcDirs: fpSrcDirs ?? [""],
					excludeFiles: fpExclFiles ?? [],
					mapFile: undefined as any,
				};
				if (fpPath) {
					// Note: path is a glob path
					const unifiedRootFolder = UnifiedPath.getUnifiedPath(rootFolder);
					const escapedRootFolder = Utility.escapePathForGlob(unifiedRootFolder);
					const unifiedFpPath = UnifiedPath.getUnifiedPath(fpPath);
					file.path = Utility.getAbsFilePathWoUnify(unifiedFpPath, escapedRootFolder)
				}
				if (fpMapFile)
					file.mapFile = Utility.getAbsFilePath(fpMapFile, rootFolder);
				return file;
			});
		}

		// zmac
		if (launchCfg.zmac) {
			launchCfg.zmac = launchCfg.zmac.map(fp => {
				// ListFile structure
				const fpPath = UnifiedPath.getUnifiedPath(fp.path);
				const fpSrcDirs = UnifiedPath.getUnifiedPathArray(fp.srcDirs);
				const fpExclFiles = UnifiedPath.getUnifiedPathArray(fp.excludeFiles);
				const file = {
					path: undefined as any,
					srcDirs: fpSrcDirs ?? [""],
					excludeFiles: fpExclFiles ?? []
				};
				if (fpPath) {
					// Note: path is a glob path
					const unifiedRootFolder = UnifiedPath.getUnifiedPath(rootFolder);
					const escapedRootFolder = Utility.escapePathForGlob(unifiedRootFolder);
					const unifiedFpPath = UnifiedPath.getUnifiedPath(fpPath);
					file.path = Utility.getAbsFilePathWoUnify(unifiedFpPath, escapedRootFolder)
				}
				return file;
			});
		}

		// revEng
		if (launchCfg.revEng) {
			launchCfg.revEng = launchCfg.revEng.map(fp => {
				// ListFile structure
				const fpPath = UnifiedPath.getUnifiedPath(fp.path);
				const file: ReverseEngineeringConfig = {
					path: undefined as any,
					reloadOnSave: fp.reloadOnSave
				};
				if (file.reloadOnSave === undefined)
					file.reloadOnSave = false;
				if (fpPath) {
					// Note: path is a glob path
					const unifiedRootFolder = UnifiedPath.getUnifiedPath(rootFolder);
					const escapedRootFolder = Utility.escapePathForGlob(unifiedRootFolder);
					const unifiedFpPath = UnifiedPath.getUnifiedPath(fpPath);
					file.path = Utility.getAbsFilePathWoUnify(unifiedFpPath, escapedRootFolder)
				}
				return file;
			});
		}

		if (unitTests) {
			// Note: If topOfStack is undefined it will be set on 'initialized'
			launchCfg.topOfStack = 'UNITTEST_STACK';
		}

		if (launchCfg.load) {
			const uload = UnifiedPath.getUnifiedPath(launchCfg.load)
			launchCfg.load = Utility.getAbsFilePath(uload, rootFolder);
		}
		else
			launchCfg.load = '';

		if (!launchCfg.loadObjs)
			launchCfg.loadObjs = [];
		for (let loadObj of launchCfg.loadObjs) {
			if (loadObj.path) {
				const loadObjPath = UnifiedPath.getUnifiedPath(loadObj.path)
				loadObj.path = Utility.getAbsFilePath(loadObjPath, rootFolder);
			}
			else
				loadObj.path = '';
		}

		if (launchCfg.tmpDir === undefined)
			launchCfg.tmpDir = '.tmp';
		launchCfg.tmpDir = UnifiedPath.getUnifiedPath(launchCfg.tmpDir);
		launchCfg.tmpDir = Utility.getAbsFilePath
			(launchCfg.tmpDir, rootFolder);
		if (isNaN(launchCfg.smallValuesMaximum))
			launchCfg.smallValuesMaximum = 255;
		if (launchCfg.disassemblerArgs === undefined) {
			launchCfg.disassemblerArgs = {
				numberOfLines: 10
			};
		}
		if (!launchCfg.disassemblerArgs.hasOwnProperty("numberOfLines"))
			launchCfg.disassemblerArgs.numberOfLines = 10;
		if (launchCfg.disassemblerArgs.numberOfLines > 100)
			launchCfg.disassemblerArgs.numberOfLines = 100;
		if (launchCfg.disassemblerArgs.numberOfLines < 1)
			launchCfg.disassemblerArgs.numberOfLines = 1;
		if (launchCfg.startAutomatically === undefined)
			launchCfg.startAutomatically = false;
		if (launchCfg.commandsAfterLaunch === undefined)
			launchCfg.commandsAfterLaunch = [];
		if (launchCfg.zrcp.skipInterrupt === undefined)
			launchCfg.zrcp.skipInterrupt = false;

		// Smart disassembly
		if (launchCfg.smartDisassemblerArgs === undefined) {
			launchCfg.smartDisassemblerArgs = {
				lowerCase: true
			}
		}
		if (launchCfg.smartDisassemblerArgs.lowerCase === undefined)
			launchCfg.smartDisassemblerArgs.lowerCase = false;

		// Reverse debugging
		if (launchCfg.history === undefined)
			launchCfg.history = {} as any;
		if (launchCfg.history.reverseDebugInstructionCount === undefined)
			launchCfg.history.reverseDebugInstructionCount = 10000;

		// Short history
		if (launchCfg.history.spotCount === undefined)
			launchCfg.history.spotCount = 10;
		if (launchCfg.history.spotCount > Settings.MAX_HISTORY_SPOT_COUNT)
			launchCfg.history.spotCount = Settings.MAX_HISTORY_SPOT_COUNT;
		if (launchCfg.history.spotCount > launchCfg.history.reverseDebugInstructionCount)
			launchCfg.history.spotCount = launchCfg.history.reverseDebugInstructionCount;
		if (launchCfg.history.spotCount < 0)
			launchCfg.history.spotCount = 0;
		if (launchCfg.history.spotShowRegisters === undefined)
			launchCfg.history.spotShowRegisters = true;

		// Code coverage
		if (launchCfg.history.codeCoverageEnabled === undefined) {
			if (launchCfg.remoteType === 'cspect' || launchCfg.remoteType === 'mame') {
				// not supported by cspect and mame
				launchCfg.history.codeCoverageEnabled = false;
			}
			else {
				// Otherwise allow, both for normal and unit tests
				launchCfg.history.codeCoverageEnabled = true;
			}
		}

		if (!launchCfg.formatting)
			launchCfg.formatting = {
				registerVar: <any>undefined,
				registerHover: <any>undefined,
				bigValues: <any>undefined,
				smallValues: <any>undefined,
				watchByte: <any>undefined,
				watchWord: <any>undefined,
				stackVar: <any>undefined,
			};
		if (!launchCfg.formatting.registerVar)
			launchCfg.formatting.registerVar = [
				"AF", "AF: ${hex}h, F: ${flags}",
				"AF'", "AF': ${hex}h, F': ${flags}",
				"PC", "${hex}h, ${unsigned}u${, :labelsplus|, }",
				"SP", "${hex}h, ${unsigned}u${, :labelsplus|, }",
				"IM", "${unsigned}u",
				"..", "${hex}h, ${unsigned}u, ${signed}i${, :labelsplus|, }",
				"F", "${flags}",
				"R", "${unsigned}u",
				"I", "${hex}h",
				".", "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}b"
			];
		if (!launchCfg.formatting.registerHover)
			launchCfg.formatting.registerHover = [
				"AF", "AF: ${hex}h, F: ${flags}",
				"AF'", "AF': ${hex}h, F': ${flags}",
				"PC", "PC: ${hex}h${\n:labelsplus|\n}",
				"SP", "SP: ${hex}h${\n:labelsplus|\n}",
				"IM", "IM: ${unsigned}u",
				"..", "${name}: ${hex}h, ${unsigned}u, ${signed}i${\n:labelsplus|\n}\n(${hex}h)b=${b@:hex}h, (${hex}h)w=${w@:hex}h",
				"R", "R: ${unsigned}u",
				"I", "I: ${hex}h",
				".", "${name}: ${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}b"
			];
		if (!launchCfg.formatting.bigValues)
			launchCfg.formatting.bigValues = "(${hex}h)=${b@:unsigned}/${b@:hex}h/'${b@:char}' or ${w@:hex}h/${w@:unsigned}";
		if (!launchCfg.formatting.smallValues)
			launchCfg.formatting.smallValues = "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}";
		if (!launchCfg.formatting.watchByte)
			launchCfg.formatting.watchByte = "${hex}h,\t${unsigned}u,\t${signed}i,\t'${char}',\t${bits}b";
		if (!launchCfg.formatting.watchWord)
			launchCfg.formatting.watchWord = "${hex}h,\t${unsigned}u,\t${signed}i";
		if (!launchCfg.formatting.stackVar)
			launchCfg.formatting.stackVar = "${hex}h\t${unsigned}u\t${signed}i\t${{:labels|, |}}";
		if (!launchCfg.tabSize)
			launchCfg.tabSize = 6;

		// Memory viewer
		if (!launchCfg.memoryViewer) {
			launchCfg.memoryViewer = {} as any;
		}
		if (!launchCfg.memoryViewer.addressColor)
			launchCfg.memoryViewer.addressColor = "CornflowerBlue";
		if (!launchCfg.memoryViewer.bytesColor)
			launchCfg.memoryViewer.bytesColor = "var(--vscode-editor-foreground)";	// Different dependent on dark or light theme.
		if (!launchCfg.memoryViewer.asciiColor)
			launchCfg.memoryViewer.asciiColor = "OliveDrab";
		if (!launchCfg.memoryViewer.addressHoverFormat)
			launchCfg.memoryViewer.addressHoverFormat = "${hex}h${\n:labelsplus|\n}";
		if (!launchCfg.memoryViewer.valueHoverFormat)
			launchCfg.memoryViewer.valueHoverFormat = "${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}";
		if (!launchCfg.memoryViewer.registerPointerColors)
			launchCfg.memoryViewer.registerPointerColors = [
				"HL", "darkgreen",
				"DE", "darkcyan",
				"BC", "dimgray",
				"SP", "goldenrod",
				"IX", "darkorange",
				"IY", "darkviolet"
			];
		if (!launchCfg.memoryViewer.registersMemoryView)
			launchCfg.memoryViewer.registersMemoryView = ["HL", "DE", "BC", "SP", "IX", "IY"];


		// Unit test timeout
		if (!launchCfg.unitTestTimeout)
			launchCfg.unitTestTimeout = 1;	///< 1000 ms

		return launchCfg;
	}


	/**
	 * Returns all xxxListFiles parameters in an array.
	 * This is used to start the file watcher.
	 * @param configuration The launch configuration, e.g. Settings.launch.
	 * @returns An array of list file parameters.
	 */
	public static GetAllAssemblerListFiles(configuration: any): Array<AsmConfigBase> {
		const listFiles = new Array<AsmConfigBase>();
		if (configuration.sjasmplus)
			listFiles.push(...configuration.sjasmplus);
		if (configuration.z80asm)
			listFiles.push(...configuration.z80asm);
		if (configuration.z88dk)
			listFiles.push(...configuration.z88dk);
		if (configuration.z88dkv2)
			listFiles.push(...configuration.z88dkv2);
		if (configuration.zmac)
			listFiles.push(...configuration.zmac);

		return listFiles;
	}


	/**
	 * Checks the settings and throws an exception if something is wrong.
	 * E.g. it checks for the existence of file paths.
	 * Note: file paths are already expanded to absolute paths.
	 */
	public static CheckSettings() {
		// Check root folder
		const rootFolder = Settings.launch.rootFolder;
		if (!rootFolder)
			throw Error("'rootFolder' is empty");
		if (!fs.existsSync(rootFolder))
			throw Error("'rootFolder' path(" + rootFolder + ") does not exist.");

		// Check remote type
		const rType = Settings.launch.remoteType;
		const allowedTypes = ['zrcp', 'cspect', 'zxnext', 'zsim', 'mame', 'trs80gp'];
		const found = (allowedTypes.indexOf(rType) >= 0);
		if (!found) {
			throw Error("'remoteType': Remote type '" + rType + "' does not exist. Allowed are " + allowedTypes.join(', ') + ".");
		}

		// Check 'serial' if 'zxnext' was selected
		if (rType === 'zxnext') {
			if (Settings.launch.zxnext.serial === undefined) {
				throw Error("For remoteType 'zxnext' you need to set the 'zxnext.serial' property for the serial interface.");
			}
			// Check that the old properties are not used
			const oldZxnext = Settings.launch.zxnext as any;
			if (oldZxnext.port !== undefined || oldZxnext.hostname !== undefined || oldZxnext.socketTimeout !== undefined) {
				throw Error("For 'zxnext' the properties 'port', 'hostname' and 'socketTimeout' are not used anymore. Use 'serial' instead.");
			}
		}

		// List files (=Assembler configurations)
		const listFiles = this.GetAllAssemblerListFiles(Settings.launch);
		for (let listFile of listFiles) {
			const path = listFile.path;
			if (path === undefined)
				throw Error("'path': You need to define a path to your file.");
			// Check that file exists
			const paths = fglob.sync(path);
			if (paths.length === 0)
				throw Error("'path': File '" + path + "' does not exist.");
		}

		// Custom memory model: The checks are too complex.
		// I.e. they are done when the SimulatedMemory is constructed.

		// Check if customMemory is defined if it was chosen.
		if (Settings.launch.zsim.memoryModel === 'CUSTOM') {
			const customMemory = Settings.launch.zsim.customMemory;
			if (customMemory === undefined)
				throw Error("If 'memoryModel' is set to 'CUSTOM', you need to define 'customMemory'.");
		}

		// Any special check
		if (Settings.launch.z88dk) {
			// Check for z88dk map file
			const listFiles = Settings.launch.z88dk;
			for (const listFile of listFiles) {
				const mapFile = listFile.mapFile;
				if (mapFile === undefined)
					throw Error("'z88dk.mapFile': For z88dk you have to define a map file.");
				// Check that file exists
				if (!fs.existsSync(mapFile))
					throw Error("'z88dk.mapFile': '" + mapFile + "' does not exist.");
			}
		}

		// sna or .P files (ZX81)
		if (Settings.launch.load) {
			// Check that file exists
			if (!fs.existsSync(Settings.launch.load))
				throw Error("'load': File '" + Settings.launch.load + "' does not exist.");
			// If a file is given for "load" no need to set an exec address
			if (Settings.launch.execAddress)
				throw Error("'execAddress': You load a file via \"load\" you must not specify an \"execAddress\".");
		}

		// Object files
		for (let loadObj of Settings.launch.loadObjs) {
			// Check that file exists
			const path = loadObj.path;
			if (!fs.existsSync(path))
				throw Error("'loadObj.path': File '" + path + "' does not exist.");
			// Check that start address is given
			if (loadObj.start === undefined)
				throw Error("'loadObj.start': You must specify a 'start' address for '" + path + "'.");
		}

		// Rev-Eng: Check that glob pattern at least finds one file.
		if(Settings.launch.revEng) {
			// Check that file exists
			for (const config of Settings.launch.revEng) {
				const paths = fglob.sync([config.path]);
				if (paths.length === 0)
					throw Error("'revEng.path': '" + config.path + "' does not match any file.");
			}
		}

		// Check mandatory settings for the custom joystick
		const customJoy = Settings.launch.zsim?.customJoy;
		if (customJoy) {
			// Loop over all defined properties
			for (const prop in customJoy) {
				const button = customJoy[prop];
				if (button.port === undefined)
					throw Error("'customJoy." + prop + "': 'port' is not defined.");
				if (button.bit === undefined)
					throw Error("'customJoy." + prop + "': 'bit' is not defined.");
			}
		}

		// Check defaultPortIn
		if (Settings.launch.zsim.defaultPortIn !== 0xFF
			&& Settings.launch.zsim.defaultPortIn !== 0x00) {
			throw Error("'defaultPortIn': Allowed values are only 255 or 0.");
		}

		// Check preset
		const preset = Settings.launch.zsim.preset;
		if (preset !== 'spectrum' && preset !== 'zx81' && preset !== 'none') {
			throw Error("'preset': Allowed values are 'spectrum', 'zx81' or 'none'.");
		}

		// Check ula screen
		const ulaScreen = Settings.launch.zsim.ulaScreen;
		if (ulaScreen !== 'spectrum' && ulaScreen !== 'zx81' && ulaScreen !== 'none') {
			throw Error("'ulaScreen': Allowed values are 'spectrum' or 'zx81'.");
		}
		const ulaOptions = Settings.launch.zsim.ulaOptions;
		const screenArea = ulaOptions.screenArea;
		const borderSize = ulaOptions.borderSize;
		if (screenArea !== undefined && borderSize !== undefined) {
			throw Error("You can only define one, 'screenArea' or 'borderSize'. You must not define both.");
		}
		if (screenArea.lastY < screenArea.firstY) {
			throw Error("'ulaOptions': lastY < firstY.");
		}
		if (screenArea.lastX < screenArea.firstX) {
			throw Error("'ulaOptions': lastX < firstX.");
		}
	}
}
