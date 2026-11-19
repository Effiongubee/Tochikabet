# Tochika direct-BNB TKA payment gateway (implementation stage)

## Flow
- The Buy TKA page switches the buyer's injected wallet to BNB Smart Chain Mainnet (chain ID 56).
- It sends native BNB directly to treasury `0x77b384DB595801bc57B62b71607e1DE6d341acB8`.
- The API independently reads the transaction from BSC, checks chain, successful receipt, sender, recipient and value, rejects duplicate hashes, calculates the TKA allocation at USD 0.0009/TKA using a live BNB/USD quote, and records the purchase in `data/purchases.json`.
- Dashboard purchase history is loaded from the API for the connected wallet.

## Run locally
1. `npm install`
2. Terminal 1: `npm run api`
3. Terminal 2: `npm run dev`
4. Open the Vite URL and test only with a wallet you control. The wallet must have BNB for the payment and gas.

Vite proxies `/api` to `http://localhost:8787` in development. In production, host `server.js` as a persistent Node service and configure your web host/reverse proxy so `/api/*` is routed to that service. Keep the JSON data directory on persistent storage and back it up. Do not run multiple API instances against the same JSON file.

## Important launch gates
- This is a direct-transfer, off-chain allocation recorder, not a trustless sale contract. The BNB arrives directly at the treasury, but purchase entitlements exist in the API database; buyers cannot independently read an on-chain allocation. Protect the database and back it up.
- Do not advertise the payment page or accept public funds until the API is deployed over HTTPS, its RPC/quote sources and persistent storage are tested, transaction confirmation/reconciliation and operational support are in place, and the sale terms are published.
- The allocation is calculated using the BNB/USD quote fetched by the API when the payment is verified. Since direct transfers do not encode a quote, the final allocation may differ slightly from the on-page estimate if BNB price changes between quote and verification. For exact locked quotes, add a signed quote/expiry mechanism before launch.
- The current 20,000,000 TKA cap is checked against the API's local database. For production, add database-level atomic reservation/locking and robust concurrency controls.
- Token delivery is not automated by this gateway. The recorded TKA allocation is an off-chain entitlement pending the project's published distribution process. Do not describe it as an on-chain token balance or guaranteed claim until distribution arrangements are finalized.
- The API uses Binance BNB/USDT as its indicative quote source. Configure a reliable production quote provider and monitor availability before launch.
- The app's other legacy token/staking configuration remains separate and still contains Testnet settings. This payment page alone uses Mainnet; do not assume staking/token contract features have been migrated.
- No private key, seed phrase or wallet signing secret is required by the API. Treasury receives payments directly; the API never controls the treasury wallet.

## Connecting the deployed frontend to the Render API
Set this frontend build environment variable in the website host:
`VITE_PAYMENT_API_URL=https://tochika-payment-api.onrender.com`
Then rebuild and redeploy the frontend. The Buy TKA page uses this base URL for
`/api/quote`, `/api/purchases/:wallet`, and `/api/verify-payment`. For local
work, leave it unset and use the Vite proxy with the local API process.

On the Render API service, set `ALLOWED_ORIGINS` to the exact public frontend
origin (scheme + hostname only, no path), for example `https://your-domain.com`.
If the frontend has both a custom domain and a hosting-provider domain, configure
both origins only if the API implementation supports a comma-separated list;
otherwise use the exact origin currently serving the site.
