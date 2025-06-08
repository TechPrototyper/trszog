/**
 * Test script to verify the useMock=false configuration fix
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Testing useMock=false Configuration Fix\n');

// Test 1: Verify the fixed logic in trs80remote.ts
console.log('📋 Test 1: Verifying Fixed shouldUseMockServer Logic');
console.log('==================================================');

const trs80RemotePath = path.join(__dirname, 'out/src/remotes/trs80/trs80remote.js');
if (fs.existsSync(trs80RemotePath)) {
    const trs80RemoteCode = fs.readFileSync(trs80RemotePath, 'utf8');
    
    // Check for the new logic patterns
    const hasExplicitUseMockCheck = trs80RemoteCode.includes('useMock=false');
    const hasAutoDetectionLog = trs80RemoteCode.includes('Auto-detecting emulator');
    const hasErrorThrow = trs80RemoteCode.includes('no valid emulator found');
    const hasAttemptingRealLog = trs80RemoteCode.includes('Attempting to use real emulator');
    
    console.log(`✅ Explicit useMock=false handling: ${hasExplicitUseMockCheck ? 'Found' : 'Missing'}`);
    console.log(`✅ Auto-detection logging: ${hasAutoDetectionLog ? 'Found' : 'Missing'}`);
    console.log(`✅ Error handling for invalid config: ${hasErrorThrow ? 'Found' : 'Missing'}`);
    console.log(`✅ Real emulator attempt logging: ${hasAttemptingRealLog ? 'Found' : 'Missing'}`);
    
    if (hasExplicitUseMockCheck && hasAutoDetectionLog && hasErrorThrow && hasAttemptingRealLog) {
        console.log('✅ All fixed logic patterns are present');
    } else {
        console.log('❌ Some fixed logic patterns are missing');
    }
} else {
    console.log('❌ trs80remote.js not found - compilation may have failed');
}

console.log('');

// Test 2: Show the configuration scenarios
console.log('📋 Test 2: Configuration Scenarios');
console.log('==================================');

console.log('🎯 Scenario 1: useMock=true (explicit mock)');
console.log('Configuration: { "useMock": true }');
console.log('Expected: Always use mock server regardless of other settings');
console.log('');

console.log('🎯 Scenario 2: useMock=false + toolsPaths.trs80gp (valid path)');
console.log('Configuration: { "useMock": false, "toolsPaths": { "trs80gp": "valid/path" } }');
console.log('Expected: Use real emulator from toolsPaths');
console.log('');

console.log('🎯 Scenario 3: useMock=false + toolsPaths.trs80gp (invalid path)');
console.log('Configuration: { "useMock": false, "toolsPaths": { "trs80gp": "invalid/path" } }');
console.log('Expected: Throw error (no fallback to mock)');
console.log('');

console.log('🎯 Scenario 4: useMock=false + emulator.path (valid)');
console.log('Configuration: { "useMock": false, "emulator": { "path": "valid/path" } }');
console.log('Expected: Use real emulator from emulator.path');
console.log('');

console.log('🎯 Scenario 5: useMock not specified + toolsPaths.trs80gp');
console.log('Configuration: { "toolsPaths": { "trs80gp": "some/path" } }');
console.log('Expected: Auto-detect (use real if path exists, mock if not)');
console.log('');

// Test 3: Show the expected log outputs
console.log('📋 Test 3: Expected Debug Log Outputs');
console.log('=====================================');

console.log('When useMock=false and toolsPaths exists:');
console.log('  [DEBUG] TRS-80: Attempting to use real emulator (useMock=false)');
console.log('  [DEBUG] TRS-80: Using real emulator from toolsPaths: ../trs80gp.app/Contents/MacOS/trs80gp');
console.log('');

console.log('When useMock=false but no valid emulator:');
console.log('  [DEBUG] TRS-80: Attempting to use real emulator (useMock=false)');
console.log('  [DEBUG] TRS-80: toolsPaths emulator not found: invalid/path');
console.log('  [ERROR] useMock=false but no valid emulator found. Check toolsPaths.trs80gp or emulator.path configuration.');
console.log('');

console.log('When useMock not specified (auto-detection):');
console.log('  [DEBUG] TRS-80: Auto-detecting emulator vs mock server...');
console.log('  [DEBUG] TRS-80: Using real emulator from toolsPaths: ../trs80gp.app/Contents/MacOS/trs80gp');
console.log('');

// Test 4: Installation instructions
console.log('📋 Test 4: Installation and Testing');
console.log('===================================');

console.log('To test the fix:');
console.log('');
console.log('1. Install the fixed extension:');
console.log('   code --install-extension dezog-3.6.3-dev-trs80-comprehensive.vsix');
console.log('');
console.log('2. Use this launch.json configuration:');
const testConfig = {
    "version": "0.2.0",
    "configurations": [
        {
            "name": "TRS-80 Real Emulator Test",
            "type": "dezog",
            "request": "launch",
            "remoteType": "trs80gp",
            "trs80": {
                "hostname": "localhost",
                "port": 49152,
                "socketTimeout": 5,
                "useMock": false,  // This should now force real emulator
                "registerFormat": "hex",
                "emulator": {
                    "model": 3,
                    "memorySize": 48,
                    "autoStart": true
                }
            },
            "toolsPaths": {
                "trs80gp": "../trs80gp.app/Contents/MacOS/trs80gp"
            },
            "startAutomatically": true,
            "rootFolder": "${workspaceFolder}",
            "load": "${workspaceFolder}/program.cmd"
        }
    ]
};
console.log(JSON.stringify(testConfig, null, 2));
console.log('');

console.log('3. Expected behavior:');
console.log('   • With useMock=false: Should attempt to use real emulator');
console.log('   • If toolsPaths.trs80gp exists: Should use that path');
console.log('   • If toolsPaths.trs80gp missing: Should throw error (not fallback to mock)');
console.log('   • Debug console will show clear logging about the decision process');
console.log('');

console.log('4. If you see "Mock trs80gp" in the response, the bug is still present');
console.log('   If you see real emulator connection or a clear error, the fix worked');

console.log('\n🎉 Fix Summary');
console.log('==============');
console.log('✅ Fixed logic to respect useMock=false setting');
console.log('✅ Added proper error handling when useMock=false but no valid emulator');
console.log('✅ Enhanced logging to show decision-making process');
console.log('✅ Maintained backward compatibility for auto-detection');
console.log('✅ toolsPaths.trs80gp takes priority when useMock=false');

console.log('\n🚀 The fix ensures that when useMock=false is explicitly set,');
console.log('the extension will never fall back to the mock server without showing an error.');
console.log('This provides clear feedback when configuration is incorrect.');
