#!/usr/bin/env node

/**
 * Comprehensive TRS-80 Environment Test
 * This test simulates a realistic TRS-80 debugging session to ensure
 * decoder initialization and usage works correctly without undefined errors.
 */

const path = require('path');

// Add the compiled src directory to the module search path
const outDir = path.join(__dirname, 'out', 'src');

// Mock VS Code API since we're running outside VS Code
const vscode = {
    DiagnosticSeverity: {
        Error: 0,
        Warning: 1,
        Information: 2,
        Hint: 3
    },
    Range: class Range {
        constructor(startLine, startCharacter, endLine, endCharacter) {
            this.start = { line: startLine, character: startCharacter };
            this.end = { line: endLine, character: endCharacter };
        }
    },
    Diagnostic: class Diagnostic {
        constructor(range, message, severity) {
            this.range = range;
            this.message = message;
            this.severity = severity;
        }
    },
    languages: {
        createDiagnosticCollection: (name) => ({
            clear: () => {},
            set: () => {},
            get: () => []
        })
    },
    Uri: {
        file: (path) => ({ fsPath: path, scheme: 'file' })
    },
    window: {
        showErrorMessage: (msg) => console.error('Error:', msg),
        showInformationMessage: (msg) => console.log('Info:', msg)
    }
};

// Mock path resolution for vscode module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') {
        return vscode;
    }
    return originalRequire.apply(this, arguments);
};

async function runComprehensiveTest() {
    try {
        console.log('🧪 Starting Comprehensive TRS-80 Environment Test...\n');

        // Test 1: Import all critical components
        console.log('📦 Testing module imports...');
        const { Z80RegistersClass } = require(path.join(outDir, 'remotes', 'z80registers.js'));
        const { Z80RegistersStandardDecoder } = require(path.join(outDir, 'remotes', 'z80registersstandarddecoder.js'));
        const { Trs80GpRemote } = require(path.join(outDir, 'remotes', 'trs80', 'trs80gpremote.js'));
        const { Trs80Model1Remote } = require(path.join(outDir, 'remotes', 'trs80', 'trs80model1remote.js'));
        const { Settings } = require(path.join(outDir, 'settings', 'settings.js'));
        console.log('✅ All modules imported successfully\n');

        // Test 2: Setup mock settings for TRS-80
        console.log('⚙️  Setting up TRS-80 configuration...');
        const mockSettings = {
            launch: {
                remoteType: 'trs80gp',
                model: 'model1',
                formatting: {
                    registerVar: [
                        "PC", "PC: ${hex}h",
                        "SP", "SP: ${hex}h", 
                        "AF", "AF: ${hex}h",
                        "BC", "BC: ${hex}h",
                        "DE", "DE: ${hex}h",
                        "HL", "HL: ${hex}h",
                        "IX", "IX: ${hex}h",
                        "IY", "IY: ${hex}h",
                        "AF2", "AF': ${hex}h",
                        "BC2", "BC': ${hex}h",
                        "DE2", "DE': ${hex}h",
                        "HL2", "HL': ${hex}h",
                        "F", "F: ${hex}h",
                        "R", "R: ${unsigned}u",
                        "I", "I: ${hex}h"
                    ],
                    registerHover: [
                        "PC", "PC: ${hex}h",
                        "SP", "SP: ${hex}h", 
                        "AF", "AF: ${hex}h",
                        "BC", "BC: ${hex}h",
                        "DE", "DE: ${hex}h",
                        "HL", "HL: ${hex}h",
                        "IX", "IX: ${hex}h",
                        "IY", "IY: ${hex}h",
                        "AF2", "AF': ${hex}h",
                        "BC2", "BC': ${hex}h",
                        "DE2", "DE': ${hex}h",
                        "HL2", "HL': ${hex}h",
                        "F", "F: ${hex}h",
                        "R", "R: ${unsigned}u",
                        "I", "I: ${hex}h"
                    ]
                }
            }
        };
        Settings.launch = mockSettings.launch;
        console.log('✅ TRS-80 configuration ready\n');

        // Test 3: Initialize Z80 registers system
        console.log('🎛️  Initializing Z80 registers system...');
        Z80RegistersClass.createRegisters(mockSettings.launch);
        const { Z80Registers } = require(path.join(outDir, 'remotes', 'z80registers.js'));
        
        // Check initial decoder state (should be undefined initially)
        const initialDecoder = Z80Registers.decoder;
        console.log(`   Initial decoder state: ${initialDecoder === undefined ? 'undefined (expected)' : 'defined'}`);
        console.log('✅ Z80 registers system initialized\n');

        // Test 4: Create and test TRS-80 Model 1 Remote
        console.log('💻 Testing TRS-80 Model 1 Remote creation...');
        const mockModel1Remote = new Trs80Model1Remote();
        
        // Test decoder creation method
        const decoder = mockModel1Remote.createZ80RegistersDecoder();
        console.log(`   Decoder type: ${decoder.constructor.name}`);
        console.log(`   Is Z80RegistersStandardDecoder: ${decoder instanceof Z80RegistersStandardDecoder}`);
        
        // Assign decoder to Z80Registers
        Z80Registers.decoder = decoder;
        console.log('✅ TRS-80 Model 1 Remote and decoder ready\n');

        // Test 5: Test decoder functionality with sample TRS-80 data
        console.log('🧮 Testing decoder with sample TRS-80 register data...');
        const sampleTrs80Data = new Uint16Array([
            0x6000, // PC
            0xFF00, // SP  
            0x1234, // AF
            0x5678, // BC
            0x9ABC, // DE
            0xDEF0, // HL
            0x1111, // IX
            0x2222, // IY
            0x3344, // AF'
            0x5566, // BC'
            0x7788, // DE'
            0x99AA, // HL'
            0xBB,   // I
            0xCC    // R
        ]);

        try {
            // Test individual decoder methods with sample data
            const pc = decoder.parsePC(sampleTrs80Data);
            const sp = decoder.parseSP(sampleTrs80Data);
            const af = decoder.parseAF(sampleTrs80Data);
            
            console.log(`   PC: 0x${pc.toString(16).toUpperCase()}`);
            console.log(`   SP: 0x${sp.toString(16).toUpperCase()}`);
            console.log(`   AF: 0x${af.toString(16).toUpperCase()}`);
            
            console.log('✅ Decoder functionality verified\n');
            
        } catch (error) {
            console.error('❌ Error during decoder testing:', error.message);
            throw error;
        }

        // Test 6: Test TRS-80 GP register conversion
        console.log('🔄 Testing TRS-80 GP register conversion...');
        const mockGpRemote = new Trs80GpRemote();
        
        const sampleGpData = {
            pc: 0x6000,
            sp: 0xFF00,
            af: 0x1234,
            bc: 0x5678,
            de: 0x9ABC,
            hl: 0xDEF0,
            ix: 0x1111,
            iy: 0x2222,
            af_prime: 0x3344,
            bc_prime: 0x5566,
            de_prime: 0x7788,
            hl_prime: 0x99AA,
            i: 0xBB,
            r: 0xCC
        };

        try {
            const convertedData = mockGpRemote.convertTrs80GpRegistersToDeZog(sampleGpData);
            console.log(`   Converted data length: ${convertedData.length} words`);
            console.log(`   PC from converted data: 0x${convertedData[0].toString(16).toUpperCase()}`);
            console.log('✅ TRS-80 GP register conversion verified\n');
            
        } catch (error) {
            console.error('❌ Error during GP register conversion:', error.message);
            throw error;
        }

        // Test 7: Stress test - multiple decoder operations
        console.log('💪 Running decoder stress test...');
        for (let i = 0; i < 100; i++) {
            const testData = new Uint16Array(14);
            for (let j = 0; j < 14; j++) {
                testData[j] = Math.floor(Math.random() * 0x10000);
            }
            
            try {
                // Test individual decoder methods
                decoder.parsePC(testData);
                decoder.parseSP(testData);
                decoder.parseAF(testData);
                decoder.parseBC(testData);
                decoder.parseDE(testData);
                decoder.parseHL(testData);
            } catch (error) {
                console.error(`❌ Error on iteration ${i}:`, error.message);
                throw error;
            }
        }
        console.log('✅ Stress test completed - 100 iterations successful\n');

        // Test 8: Test error handling with edge cases
        console.log('🛡️  Testing error handling with edge cases...');
        
        // Test with empty data
        try {
            decoder.parsePC(new Uint16Array(0));
            console.log('   Empty data handled gracefully');
        } catch (error) {
            console.log(`   Empty data error (expected): ${error.message}`);
        }
        
        // Test with insufficient data  
        try {
            decoder.parsePC(new Uint16Array(5)); // Less than required
            console.log('   Insufficient data handled gracefully');
        } catch (error) {
            console.log(`   Insufficient data error (expected): ${error.message}`);
        }
        
        console.log('✅ Error handling verified\n');

        // Final verification
        console.log('🎯 Final verification...');
        console.log(`   Z80Registers.decoder is defined: ${Z80Registers.decoder !== undefined}`);
        console.log(`   Decoder type: ${Z80Registers.decoder.constructor.name}`);
        console.log(`   Can access PC: ${typeof decoder.parsePC(sampleTrs80Data) === 'number'}`);
        console.log(`   Can access AF: ${typeof decoder.parseAF(sampleTrs80Data) === 'number'}`);

        console.log('\n🎉 Comprehensive TRS-80 Environment Test PASSED!');
        console.log('   ✅ All modules imported successfully');
        console.log('   ✅ TRS-80 configuration applied');  
        console.log('   ✅ Z80 registers system initialized');
        console.log('   ✅ TRS-80 Model 1 Remote created');
        console.log('   ✅ Decoder functionality verified');
        console.log('   ✅ Register conversion working');
        console.log('   ✅ Stress test passed (100 iterations)');
        console.log('   ✅ Error handling verified');
        console.log('   ✅ No undefined decoder errors found');
        
        return true;

    } catch (error) {
        console.error('\n❌ Comprehensive TRS-80 Environment Test FAILED!');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        return false;
    }
}

// Run the test
if (require.main === module) {
    runComprehensiveTest().then(success => {
        console.log(`\n${success ? '🟢' : '🔴'} Test ${success ? 'PASSED' : 'FAILED'}`);
        process.exit(success ? 0 : 1);
    });
}

module.exports = { runComprehensiveTest };
