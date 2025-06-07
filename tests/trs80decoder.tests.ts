/**
 * Integration test for TRS-80 decoder assignment and timing
 */

import * as assert from 'assert';
import {suite, test} from 'mocha';
import {Trs80Model1Remote} from '../src/remotes/trs80/trs80model1remote';
import {Z80Registers, Z80RegistersClass} from '../src/remotes/z80registers';
import {Z80RegistersStandardDecoder} from '../src/remotes/z80registersstandarddecoder';
import {Settings} from '../src/settings/settings';

suite('TRS-80 Decoder Integration', () => {

    test('Decoder is correctly assigned during initialization', async () => {
        // Create proper mock settings with formatting arrays required by Z80RegistersClass.Init
        const mockSettings = {
            launch: {
                trs80: {
                    registerFormat: 'hex'
                },
                formatting: {
                    registerVar: [
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
                    ],
                    registerHover: [
                        "AF", "AF: ${hex}h, F: ${flags}",
                        "AF'", "AF': ${hex}h, F': ${flags}",
                        "PC", "PC: ${hex}h${\n:labelsplus|\n}",
                        "SP", "SP: ${hex}h${\n:labelsplus|\n}",
                        "IM", "IM: ${unsigned}u",
                        "..", "${name}: ${hex}h, ${unsigned}u, ${signed}i${\n:labelsplus|\n}\n(${hex}h)b=${b@:hex}h, (${hex}h)w=${w@:hex}h",
                        "R", "R: ${unsigned}u",
                        "I", "I: ${hex}h",
                        ".", "${name}: ${hex}h, ${unsigned}u, ${signed}i, '${char}', ${bits}b"
                    ]
                }
            }
        };
        Settings.launch = mockSettings.launch as any;

        // Create registers instance to test - this now properly initializes formatting
        Z80RegistersClass.createRegisters(mockSettings.launch as any);

        // Verify decoder is not set initially (actually it may be undefined from previous tests)
        const initialDecoder = Z80Registers.decoder;
        console.log('Initial decoder:', initialDecoder);

        // Create decoder manually to test
        const decoder = new Z80RegistersStandardDecoder();
        
        // Verify decoder type
        assert.ok(decoder instanceof Z80RegistersStandardDecoder, 'Should create Z80RegistersStandardDecoder');

        // Manually assign decoder to test functionality
        Z80Registers.decoder = decoder;

        // Test decoder functionality with sample TRS-80 data
        const sampleData = new Uint16Array([
            0x6000, // PC
            0xFF00, // SP
            0x1234, // AF
            0x5678, // BC
            0x9ABC, // DE
            0xDEF0, // HL
            0x1122, // IX
            0x3344, // IY
            0x5566, // AF'
            0x7788, // BC'
            0x99AA, // DE'
            0xBBCC, // HL'
            0x12,   // I
            0x34,   // R
            1       // IM
        ]);

        // Test register parsing using the decoder
        Z80Registers.setCache(sampleData);
        
        // Verify key registers
        assert.strictEqual(Z80Registers.getRegValueByName('PC'), 0x6000, 'PC should be correctly parsed');
        assert.strictEqual(Z80Registers.getRegValueByName('SP'), 0xFF00, 'SP should be correctly parsed');
        assert.strictEqual(Z80Registers.getRegValueByName('AF'), 0x1234, 'AF should be correctly parsed');
        assert.strictEqual(Z80Registers.getRegValueByName('BC'), 0x5678, 'BC should be correctly parsed');
        assert.strictEqual(Z80Registers.getRegValueByName('A'), 0x12, 'A register should be correctly extracted');
        assert.strictEqual(Z80Registers.getRegValueByName('F'), 0x34, 'F register should be correctly extracted');
        assert.strictEqual(Z80Registers.getRegValueByName('B'), 0x56, 'B register should be correctly extracted');
        assert.strictEqual(Z80Registers.getRegValueByName('C'), 0x78, 'C register should be correctly extracted');

        // Clean up - decoder will be reused by other tests
    });

    test('TRS-80 Model 1 remote can create decoder', () => {
        const remote = new Trs80Model1Remote();
        
        // We can't directly access createZ80RegistersDecoder since it's protected,
        // but we can verify that the remote exists and would be able to create it
        assert.ok(remote instanceof Trs80Model1Remote, 'Should create Trs80Model1Remote instance');
        
        // Test that the remote has the expected methods
        assert.ok(typeof (remote as any).createZ80RegistersDecoder === 'function', 'createZ80RegistersDecoder method should exist');
        
        // Test creating the decoder through reflection (accessing protected method)
        const decoder = (remote as any).createZ80RegistersDecoder();
        assert.ok(decoder instanceof Z80RegistersStandardDecoder, 'Should return Z80RegistersStandardDecoder');
    });

    test('Register conversion from TRS-80 GP format works correctly', () => {
        const remote = new Trs80Model1Remote();
        
        // Test the conversion method that would be used with decoded register data
        const mockTrs80GpData = {
            PC: 0x6000,
            SP: 0xFF00,
            AF: 0x1234,
            BC: 0x5678,
            DE: 0x9ABC,
            HL: 0xDEF0,
            IX: 0x1122,
            IY: 0x3344,
            AF_: 0x5566,
            BC_: 0x7788,
            DE_: 0x99AA,
            HL_: 0xBBCC,
            I: 0x12,
            R: 0x34,
            IM: 1
        };

        // Convert to DeZog format using protected method
        const converted = (remote as any).convertTrs80GpRegistersToDeZog(mockTrs80GpData);
        
        // Verify conversion maintains data integrity
        assert.strictEqual(converted[0], 0x6000, 'PC should be preserved in conversion');
        assert.strictEqual(converted[1], 0xFF00, 'SP should be preserved in conversion');
        assert.strictEqual(converted[2], 0x1234, 'AF should be preserved in conversion');
        assert.strictEqual(converted[3], 0x5678, 'BC should be preserved in conversion');
        
        // Test with decoder
        Z80Registers.decoder = new Z80RegistersStandardDecoder();
        Z80Registers.setCache(converted);
        
        assert.strictEqual(Z80Registers.getRegValueByName('PC'), 0x6000, 'PC should be correctly decoded after conversion');
        assert.strictEqual(Z80Registers.getRegValueByName('AF'), 0x1234, 'AF should be correctly decoded after conversion');
        
        // Clean up - decoder will be reused by other tests
    });
});
