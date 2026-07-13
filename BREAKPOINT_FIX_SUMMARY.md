# TRS-80 Breakpoint Verification Fix

## Problem
Breakpoints in TRS-80 debugging were showing as "unverified" because of a path normalization mismatch in the ZmacLabelParser class.

## Root Cause
The `ZmacLabelParser.sourcesModeFinish()` method was using raw `entry.fileName` as keys for the `lineArrays` mapping, but the `Labels.getAddrForFileAndLine()` method was calling `Utility.getRelFilePath(fileName)` to normalize paths before lookup, causing a mismatch.

## Solution
1. **Added Utility import** to `src/labels/zmaclabelparser.ts`
2. **Modified sourcesModeFinish() method** to normalize file paths using `Utility.getRelFilePath()` before using them as keys in `lineArrays`

## Changes Made
- **File**: `src/labels/zmaclabelparser.ts`
- **Import added**: `import {Utility} from '../misc/utility';`
- **Path normalization**: Used `Utility.getRelFilePath(entry.fileName)` instead of raw `entry.fileName` as the key for `lineArrays`

## Result
- Extension successfully compiled and packaged as `dezog-3.6.3-dev-trs80-final.vsix`
- Breakpoint verification should now work correctly for TRS-80 debugging
- The fix ensures that file path lookups use consistent normalized paths throughout the system

## Testing
The fix addresses the specific issue where breakpoints on lines 7 and 8 of `hello.asm` were showing as unverified. After installing the updated extension, these breakpoints should now be properly verified during TRS-80 debugging sessions.
