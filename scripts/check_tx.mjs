// check_tx.mjs
const API_URL = "https://api.explorer.provable.com/v1";
const NETWORK = "testnet";

async function main() {
  console.log("Checking token registry state for our tokens...\n");
  
  const tokens = ["7788001field", "7788002field"];
  
  for (const t of tokens) {
    try {
      const url = `${API_URL}/${NETWORK}/program/token_registry.aleo/mapping/registered_tokens/${t}`;
      console.log(`Checking ${t}...`);
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        console.log(`Result: ${text.slice(0, 100)}...`);
      } else {
        console.log(`Failed HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
}
main();
