import { Account, ProgramManager, AleoNetworkClient } from '@aleohq/sdk';

async function register() {
    try {
        console.log("Starting Token Registration...");
        
        // Setup Account from private key
        const privateKey = "APrivateKey1zkpBNfBdXXqjKoGq66PhJANkwbmtX5Pm19BqnwLnVMiFuJX";
        const account = new Account({ privateKey });
        console.log("Wallet address:", account.address().to_string());

        // Setup Network connection
        const networkClient = new AleoNetworkClient("https://api.explorer.provable.com/v1");
        // Testnet version of provable is actually handled by the SDK natively when set, but we can also use testnet3 endpoints
        
        // Setup Program Manager
        const programManager = new ProgramManager("https://api.explorer.provable.com/v1", "testnet", networkClient);
        programManager.setAccount(account);
        
        // Inputs for register_token transition
        const inputs = [
            "123456789field",
            "366469202808u128", 
            "366469202776u128", 
            "6u8", 
            "10000000000000000u128", 
            "false", 
            account.address().to_string()
        ];
        
        console.log("Executing token_registry.aleo/register_token...");
        console.log("Inputs:", inputs);
        
        // Execute the transaction
        const txId = await programManager.execute({
            programName: "token_registry.aleo",
            functionName: "register_token",
            fee: 0.5, // 0.5 Aleo fee
            inputs: inputs,
            privateFee: true
        });
        
        console.log("========================================");
        console.log("Transaction successfully broadcasted!");
        console.log("Transaction ID:", txId);
        console.log("You can check the status at: https://testnet.explorer.provable.com/transaction/" + txId);
        console.log("Once confirmed, put NEXT_PUBLIC_USDCX_TOKEN_ID=123456789field in your .env.local");
        console.log("========================================");
        
    } catch (error) {
        console.error("Error executing transaction:");
        console.error(error);
    }
}

register();
