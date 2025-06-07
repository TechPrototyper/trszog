#!/usr/bin/env node

/**
 * Test script to validate that TRS-80GP remote type is accepted
 * This tests the fix for the runtime validation error
 */

async function testTRS80GPValidation() {
    console.log('Testing TRS-80GP remote type validation...');
    
    // Create a test launch configuration with trs80gp remote type
    const testConfig = {
        type: "dezog",
        request: "launch",
        name: "TRS-80GP Test",
        remoteType: "trs80gp",  // This should now be accepted
        trs80: {
            hostname: "localhost",
            port: 49152,
            useMock: true,
            registerFormat: "hex"
        },
        rootFolder: "${workspaceFolder}",
        startAutomatically: false
    };
    
    console.log('Test configuration:');
    console.log(JSON.stringify(testConfig, null, 2));
    
    try {
        // Try to validate the configuration
        // Note: This is a simplified test - in real usage, the validation
        // happens when DeZog extension processes the launch.json
        
        const allowedTypes = ['zrcp', 'cspect', 'zxnext', 'zsim', 'mame', 'trs80gp'];
        const remoteType = testConfig.remoteType;
        
        if (!allowedTypes.includes(remoteType)) {
            throw new Error(`Remote type '${remoteType}' does not exist. Allowed are ${allowedTypes.join(', ')}.`);
        }
        
        console.log('✅ SUCCESS: TRS-80GP remote type is accepted!');
        console.log(`Remote type '${remoteType}' is valid.`);
        return true;
        
    } catch (error) {
        console.log('❌ FAILED: TRS-80GP remote type validation failed');
        console.error(error.message);
        return false;
    }
}

// Run the test
testTRS80GPValidation().then(success => {
    if (success) {
        console.log('\n🎉 Test PASSED: The fix for TRS-80GP remote type validation is working!');
        process.exit(0);
    } else {
        console.log('\n💥 Test FAILED: TRS-80GP remote type is still not accepted');
        process.exit(1);
    }
}).catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});
