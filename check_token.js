async function check() {
    try {
        console.log("Checking token_registry.aleo for token ID 123456789field...");
        const res = await fetch("https://api.explorer.provable.com/v1/testnet/program/token_registry.aleo/mapping/registered_tokens/123456789field");
        
        if (res.status === 200) {
            const data = await res.json();
            console.log("\n==================================");
            console.log("✅ SUCCESS! Token 123456789field is officially registered on Aleo Testnet!");
            console.log("==================================");
            console.log("On-Chain Data:");
            console.log(JSON.stringify(data, null, 2));
        } else if (res.status === 404 || res.status === 400 || res.status === 500) {
            console.log("\n⏳ Not found yet. The transaction is likely still confirming (or failed).");
            console.log("If you just clicked approve, it takes ~2-3 minutes for the network to include the block.");
        } else {
            console.log("\n⚠️ Unexpected response from Aleo API:", res.status);
            console.log(await res.text());
        }
    } catch (e) {
        console.error("Failed to check:", e);
    }
}
check();
