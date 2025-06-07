/**
 * Test TRS-80 register handling - both 16-bit composite and 8-bit individual register scenarios
 */

import * as assert from 'assert';
import {suite, test} from 'mocha';
import {Trs80Model1Remote} from '../src/remotes/trs80/trs80model1remote';
import {Settings} from '../src/settings/settings';

suite('TRS-80 Register Handling', () => {

    // Mock settings for testing
    const mockSettings = {
        launch: {
            trs80: {
                registerFormat: 'hex'
            }
        }
    };

    // Sample register data from TRS-80 emulator
    const mock16BitRegisters = {
        PC: '0x6000',
        SP: '0xFF00',
        AF: '0x1234',
        BC: '0x5678',
        DE: '0x9ABC',
        HL: '0xDEF0',
        IX: '0x1122',
        IY: '0x3344',
        AF_: '0x5566',
        BC_: '0x7788',
        DE_: '0x99AA',
        HL_: '0xBBCC',
        I: '0x12',
        R: '0x34',
        IM: 1
    };

    const mock8BitRegisters = {
        PC: '0x6000',
        SP: '0xFF00',
        A: '0x12',
        F: '0x34',
        B: '0x56',
        C: '0x78',
        D: '0x9A',
        E: '0xBC',
        H: '0xDE',
        L: '0xF0',
        IX: '0x1122',
        IY: '0x3344',
        A2: '0x55',
        F2: '0x66',
        B2: '0x77',
        C2: '0x88',
        D2: '0x99',
        E2: '0xAA',
        H2: '0xBB',
        L2: '0xCC',
        I: '0x12',
        R: '0x34',
        IM: 1
    };

    test('Parse 16-bit composite registers', () => {
        // Mock Settings for test
        (Settings as any).launch = mockSettings.launch;
        
        const remote = new Trs80Model1Remote();
        const regData = (remote as any).convertTrs80GpRegistersToDeZog(mock16BitRegisters);
        
        // Verify standard registers
        assert.equal(regData[0], 0x6000); // PC
        assert.equal(regData[1], 0xFF00); // SP
        assert.equal(regData[2], 0x1234); // AF
        assert.equal(regData[3], 0x5678); // BC
        assert.equal(regData[4], 0x9ABC); // DE
        assert.equal(regData[5], 0xDEF0); // HL
        assert.equal(regData[6], 0x1122); // IX
        assert.equal(regData[7], 0x3344); // IY
        
        // Verify alternate registers
        assert.equal(regData[8], 0x5566);  // AF'
        assert.equal(regData[9], 0x7788);  // BC'
        assert.equal(regData[10], 0x99AA); // DE'
        assert.equal(regData[11], 0xBBCC); // HL'
        
        // Verify combined I/R register
        assert.equal(regData[12], (0x12 << 8) | 0x34); // IR
        
        // Verify IM register
        assert.equal(regData[13], 1); // IM
        
        // Verify slot data
        assert.equal(regData[14], 1); // Slot count
        assert.equal(regData[15], 0); // Single slot with bank 0
    });

    test('Parse 8-bit individual registers and construct 16-bit values', () => {
        // Mock Settings for test
        (Settings as any).launch = mockSettings.launch;
        
        const remote = new Trs80Model1Remote();
        const regData = (remote as any).convertTrs80GpRegistersToDeZog(mock8BitRegisters);
        
        // Verify standard registers
        assert.equal(regData[0], 0x6000); // PC
        assert.equal(regData[1], 0xFF00); // SP
        
        // Verify constructed 16-bit registers from 8-bit components
        assert.equal(regData[2], (0x12 << 8) | 0x34); // AF = A:F
        assert.equal(regData[3], (0x56 << 8) | 0x78); // BC = B:C
        assert.equal(regData[4], (0x9A << 8) | 0xBC); // DE = D:E
        assert.equal(regData[5], (0xDE << 8) | 0xF0); // HL = H:L
        
        // Verify 16-bit registers that don't decompose
        assert.equal(regData[6], 0x1122); // IX
        assert.equal(regData[7], 0x3344); // IY
        
        // Verify constructed alternate registers
        assert.equal(regData[8], (0x55 << 8) | 0x66);  // AF' = A2:F2
        assert.equal(regData[9], (0x77 << 8) | 0x88);  // BC' = B2:C2
        assert.equal(regData[10], (0x99 << 8) | 0xAA); // DE' = D2:E2
        assert.equal(regData[11], (0xBB << 8) | 0xCC); // HL' = H2:L2
        
        // Verify combined I/R register
        assert.equal(regData[12], (0x12 << 8) | 0x34); // IR
        
        // Verify IM register
        assert.equal(regData[13], 1); // IM
        
        // Verify slot data
        assert.equal(regData[14], 1); // Slot count
        assert.equal(regData[15], 0); // Single slot with bank 0
    });

    test('Handle mixed register formats gracefully', () => {
        // Mock Settings for test
        (Settings as any).launch = mockSettings.launch;
        
        // Test case where some 16-bit registers are available but others aren't
        const mixedRegisters = {
            PC: '0x6000',
            SP: '0xFF00',
            AF: '0x1234',  // 16-bit available
            // BC not available as 16-bit, only 8-bit
            B: '0x56',
            C: '0x78',
            DE: '0x9ABC',  // 16-bit available
            // HL not available as 16-bit, only 8-bit
            H: '0xDE',
            L: '0xF0',
            IX: '0x1122',
            IY: '0x3344',
            I: '0x12',
            R: '0x34',
            IM: 1
        };
        
        const remote = new Trs80Model1Remote();
        const regData = (remote as any).convertTrs80GpRegistersToDeZog(mixedRegisters);
        
        // Verify standard registers
        assert.equal(regData[0], 0x6000); // PC
        assert.equal(regData[1], 0xFF00); // SP
        assert.equal(regData[2], 0x1234); // AF (from 16-bit)
        assert.equal(regData[3], (0x56 << 8) | 0x78); // BC (constructed from 8-bit)
        assert.equal(regData[4], 0x9ABC); // DE (from 16-bit)
        assert.equal(regData[5], (0xDE << 8) | 0xF0); // HL (constructed from 8-bit)
        assert.equal(regData[6], 0x1122); // IX
        assert.equal(regData[7], 0x3344); // IY
        
        // Verify combined I/R register
        assert.equal(regData[12], (0x12 << 8) | 0x34); // IR
        
        // Verify IM register
        assert.equal(regData[13], 1); // IM
    });

    test('Handle missing registers gracefully', () => {
        // Mock Settings for test
        (Settings as any).launch = mockSettings.launch;
        
        // Test case where some registers are completely missing
        const partialRegisters = {
            PC: '0x6000',
            SP: '0xFF00',
            A: '0x12',
            // F missing - should result in AF = 0x1200
            B: '0x56',
            C: '0x78',
            // D, E missing - should result in DE = 0x0000
            IX: '0x1122',
            IY: '0x3344',
            I: '0x12',
            R: '0x34',
            IM: 1
        };
        
        const remote = new Trs80Model1Remote();
        const regData = (remote as any).convertTrs80GpRegistersToDeZog(partialRegisters);
        
        // Verify standard registers
        assert.equal(regData[0], 0x6000); // PC
        assert.equal(regData[1], 0xFF00); // SP
        assert.equal(regData[2], 0x0000); // AF (A available but F missing, both needed)
        assert.equal(regData[3], (0x56 << 8) | 0x78); // BC (both available)
        assert.equal(regData[4], 0x0000); // DE (both missing)
        assert.equal(regData[5], 0x0000); // HL (both missing)
        assert.equal(regData[6], 0x1122); // IX
        assert.equal(regData[7], 0x3344); // IY
        
        // Verify combined I/R register
        assert.equal(regData[12], (0x12 << 8) | 0x34); // IR
        
        // Verify IM register
        assert.equal(regData[13], 1); // IM
    });

    test('Handle empty register data', () => {
        // Mock Settings for test
        (Settings as any).launch = mockSettings.launch;
        
        const remote = new Trs80Model1Remote();
        const regData = (remote as any).convertTrs80GpRegistersToDeZog(null);
        
        // Should return array filled with zeros
        for (let i = 0; i < 14; i++) {
            assert.equal(regData[i], 0);
        }
        
        // Verify slot data is still correct
        assert.equal(regData[14], 1); // Slot count
        assert.equal(regData[15], 0); // Single slot with bank 0
    });
});
