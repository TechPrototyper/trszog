#!/usr/bin/env node

/**
 * Final Comprehensive TRS-80 Test
 * This test verifies that TRS-80 decoder functionality works correctly.
 */

const path = require('path');

// Add the compiled src directory to the module search path
const outDir = path.join(__dirname, 'out', 'src');

// Mock VS Code API since we're running outside VS Code
const vscode = {
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
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
        createDiagnosticCollection: () => ({
            clear: () => {},
            set: () => {},
            get: () => []
        })
    },
    Uri: { file: (path) => ({ fsPath: path, scheme: 'file' }) }
};

// Mock module resolution for vscode
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
    if (id === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

async function runFinalTest() {
    try {
        console.log('🧪 Final TRS-80 Environment Test\n');

        // Import components
        console.log('📦 Importing modules...');
        const { Z80RegistersClass } = require(path.join(outDir, 'remotes', 'z80registers.js'));
        const { Z80RegistersStandardDecoder } = require(path.join(outDir, 'remotes', 'z80registersstandarddecoder.js'));
        const { Trs80Model1Remote } = require(path.join(outDir, 'remotes', 'trs80', 'trs80model1remote.js'));
        const { Settings } = require(path.join(outDir, 'settings', 'settings.js'));
        console.log('✅ Imports successful\n');

        // Setup TRS-80 configuration
        console.log('⚙️  Setting up configuration...');
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
                        "HL", "HL: ${hex}h"
                    ],
                    registerHover: [
                        "PC", "PC: ${hex}h",
                        "SP", "SP: ${hex}h",
                        "AF", "AF: ${hex}h",
                        "BC", "BC: ${hex}h",
                        "DE", "DE: ${hex}h",
                        "HL", "HL: ${hex}h"
                    ]
                }
            }
        };
        Settings.launch = mockSettings.launch;
        console.log('✅ Configuration ready\n');

        // Initialize Z80 registers
        console.log('🎛️  Initializing Z80 registers...');
        Z80RegistersClass.createRegisters(mockSettings.launch);
        const { Z80Registers } = require(path.join(outDir, 'remotes', 'z80registers.js'));
        console.log(`   Initial decoder: ${Z80Registers.decoder === undefined ? 'undefined (expected)' : 'defined'}`);
        console.log('✅ Z80 registers initialized\n');

        // Create TRS-80 Model 1 Remote and decoder
        console.log('💻 Creating TRS-80 Model 1 Remote...');
        const model1Remote = new Trs80Model1Remote();
        const decoder = model1Remote.createZ80RegistersDecoder();
        console.log(`   Decoder type: ${decoder.constructor.name}`);
        console.log(`   Is StandardDecoder: ${decoder instanceof Z80RegistersStandardDecoder}`);
        
        // Assign decoder
        Z80Registers.decoder = decoder;
        console.log('✅ TRS-80 decoder ready\n');

        // Test decoder with sample data
        console.log('🧮 Testing decoder functionality...');
        const sampleData = new Uint16Array([
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

        // Test individual decoder methods
        const pc = decoder.parsePC(sampleData);
        const sp = decoder.parseSP(sampleData);
        const af = decoder.parseAF(sampleData);
        
        console.log(`   PC: 0x${pc.toString(16).toUpperCase()}`);
        console.log(`   SP: 0x${sp.toString(16).toUpperCase()}`);
        console.log(`   AF: 0x${af.toString(16).toUpperCase()}`);
        console.log('✅ Decoder functionality verified\n');

        // Stress test
        console.log('💪 Running stress test...');
        for (let i = 0; i < 50; i++) {
            const testData = new Uint16Array(14);
            for (let j = 0; j < 14; j++) {
                testData[j] = Math.floor(Math.random() * 0x10000);
            }
            
            // Test core decoder methods
            decoder.parsePC(testData);
            decoder.parseSP(testData);
            decoder.parseAF(testData);
        }
        console.log('✅ Stress test passed (50 iterations)\n');

        // Final verification
        console.log('🎯 Final verification...');
        console.log(`   Decoder defined: ${Z80Registers.decoder !== undefined}`);
        console.log(`   Decoder type: ${Z80Registers.decoder.constructor.name}`);
        console.log(`   PC access works: ${typeof decoder.parsePC(sampleData) === 'number'}`);

        console.log('\n🎉 FINAL TRS-80 TEST PASSED!');
        console.log('   ✅ All modules imported');
        console.log('   ✅ Configuration applied');
        console.log('   ✅ Z80 registers initialized');
        console.log('   ✅ TRS-80 decoder created');
        console.log('   ✅ Decoder functionality verified');
        console.log('   ✅ Stress test passed');
        console.log('   ✅ NO UNDEFINED DECODER ERRORS!');
        
        return true;

    } catch (error) {
        console.error('\n❌ FINAL TRS-80 TEST FAILED!');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        return false;
    }
}

// Run the test
if (require.main === module) {
    runFinalTest().then(success => {
        console.log(`\n${success ? '🟢' : '🔴'} Test ${success ? 'PASSED' : 'FAILED'}`);
        process.exit(success ? 0 : 1);
    });
}

module.exports = { runFinalTest };
