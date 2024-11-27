import {LogEval} from "./misc/logeval";

/**
 * Represents a watchpoint used by the DebugAdapter in a very generic form,
 * i.e. not machine specific.
 * Watchpoints are NOT identified by an ID but instead by the address and size.
 *
 */
export interface GenericWatchpoint {
	longOr64kAddress: number; ///< The start address
	size: number;	///< The length of the area to watch
	access: string;	///< The way of access, e.g. read='r', write='w', readwrite='rw'
	condition: string;	///< The additional condition. undefined or '' if no condition set.
}


/**
 * Represents a breakpoint used by DebugAdapter in a very generic form,
 * i.e. not machine specific.
 */
export interface GenericBreakpoint {
	bpId?: number,	///< An optional number bigger than 0. E.g. not used by ZEsarUX but by DZRP.
	longAddress: number, ///< The PC (long) address to break on
	condition?: string,	///< The additional conditions. '' if no condition set.
	log?: LogEval,	///< If set the log will be printed instead of stopping execution.
	error?: string	///< An informative error text. E.g. used for additional info if a breakpoint could not be set.
}

