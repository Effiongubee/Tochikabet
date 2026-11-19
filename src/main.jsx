import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ethers } from "ethers";
import {
  Wallet,
  ArrowUpRight,
  ShieldCheck,
  Clock3,
  Coins,
  Menu,
  X,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import "./style.css";
const CHAIN = Number(import.meta.env.VITE_CHAIN_ID || 56),
  TEST = CHAIN === 97;
const chain = TEST
  ? {
      chainId: "0x61",
      chainName: "BNB Smart Chain Testnet",
      nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
      rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
      blockExplorerUrls: ["https://testnet.bscscan.com"],
    }
  : {
      chainId: "0x38",
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: ["https://bsc-dataseed.binance.org"],
      blockExplorerUrls: ["https://bscscan.com"],
    };
const addresses = {
  token: import.meta.env.VITE_TOKEN_ADDRESS || "",
  sale: import.meta.env.VITE_SALE_ADDRESS || "",
  stake: import.meta.env.VITE_STAKING_ADDRESS || "",
};
const tokenConfigured = ethers.isAddress(addresses.token);
const saleConfigured = tokenConfigured && ethers.isAddress(addresses.sale);
const stakeConfigured = tokenConfigured && ethers.isAddress(addresses.stake);
const configured = stakeConfigured;
const tokenABI = [
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function totalSupply() view returns(uint256)",
];
const saleABI = [
  "function buy() payable",
  "function tokensPerBNB() view returns(uint256)",
  "function paused() view returns(bool)",
];
const stakeABI = [
  "function stake(uint256,uint256)",
  "function withdraw(uint256)",
  "function getUserStakeIds(address) view returns(uint256[])",
  "function stakes(uint256) view returns(address staker,uint256 amount,uint256 reward,uint256 startTime,uint256 unlockTime,uint256 planId,bool withdrawn)",
  "function plans(uint256) view returns(uint256 duration,uint256 rewardBps,bool active)",
];
const PAYMENT_API_BASE = (import.meta.env.VITE_PAYMENT_API_URL || "https://tochika-payment-api.onrender.com").replace(
  /\/$/,
  "",
);
const apiUrl = (path) => `${PAYMENT_API_BASE}${path}`;
const short = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");
const fmt = (v) =>
  Number(ethers.formatUnits(v, 18)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
const recordTxHash = (r) => r.txHash || r.tx_hash || r.transactionHash || r.transaction_hash || "";
const recordTka = (r) => Number(r.tka ?? r.tokenAmount ?? r.token_amount ?? r.token_allocation ?? r.allocation ?? 0);
const recordBnb = (r) => Number(r.bnb ?? r.bnbAmount ?? r.bnb_amount ?? 0);
const recordCreatedAt = (r) => r.createdAt || r.created_at || r.timestamp || r.blockTimestamp || null;
// Resolve the active injected EVM wallet. Some mobile wallet browsers expose
// multiple providers through window.ethereum.providers rather than directly.
function getInjectedWallet() {
  if (typeof window === "undefined") return null;
  const ethereum = window.ethereum;
  if (!ethereum) return null;
  const providers = Array.isArray(ethereum.providers)
    ? ethereum.providers
    : [ethereum];
  return providers.find((wallet) => wallet?.isMetaMask) ||
    providers.find((wallet) => wallet?.request) ||
    null;
}

function isMobileBrowser() {
  return typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function openMetaMaskApp() {
  if (typeof window === "undefined") return;
  const currentDapp = `${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.href = `https://metamask.app.link/dapp/${currentDapp}`;
}

function App() {
  const [page, setPage] = useState("Home"),
    [mobile, setMobile] = useState(false),
    [account, setAccount] = useState(""),
    [provider, setProvider] = useState(null),
    [balance, setBalance] = useState("—"),
    [bnb, setBnb] = useState(""),
    [qty, setQty] = useState(""),
    [rate, setRate] = useState(null),
    [plans, setPlans] = useState([]),
    [positions, setPositions] = useState([]),
    [plan, setPlan] = useState(0),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [presaleUsd, setPresaleUsd] = useState("20");
  const [bnbUsd, setBnbUsd] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [paymentRecordsLoading, setPaymentRecordsLoading] = useState(false);
  const [paymentRecordsError, setPaymentRecordsError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const TREASURY = "0x77b384DB595801bc57B62b71607e1DE6d341acB8";
  const TOKEN_PRICE_USD = 0.0009;
  const MAINNET_CHAIN = {
    chainId: "0x38",
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.binance.org"],
    blockExplorerUrls: ["https://bscscan.com"],
  };
  async function refreshPaymentQuote() {
    try {
      const response = await fetch(apiUrl("/api/quote"), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to load the live BNB quote.");
      if (Number(data.chainId) !== 56) throw Error("Payment API is not configured for BNB Smart Chain Mainnet.");
      if (data.treasury && data.treasury.toLowerCase() !== TREASURY.toLowerCase())
        throw Error("Payment API treasury does not match the official Tochika receiving wallet.");
      if (!Number.isFinite(Number(data.bnbUsd)) || Number(data.bnbUsd) <= 0)
        throw Error("The payment API returned an invalid BNB price.");
      setBnbUsd(Number(data.bnbUsd));
      setQuoteError("");
    } catch (e) {
      setQuoteError(e.message || "Live BNB quote unavailable.");
    }
  }
  async function refreshPaymentRecords(wallet = account) {
    if (!wallet) {
      setPaymentRecords([]);
      setPaymentRecordsError("");
      return [];
    }
    setPaymentRecordsLoading(true);
    setPaymentRecordsError("");
    try {
      const response = await fetch(apiUrl(`/api/purchases/${wallet}`), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not load verified purchases.");
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data.purchases)
          ? data.purchases
          : Array.isArray(data.records)
            ? data.records
            : [];
      setPaymentRecords(rows);
      return rows;
    } catch (e) {
      setPaymentRecordsError(e.message || "Could not load verified purchases.");
      setPaymentRecords([]);
      return [];
    } finally {
      setPaymentRecordsLoading(false);
    }
  }
  useEffect(() => {
    refreshPaymentQuote();
    const timer = window.setInterval(refreshPaymentQuote, 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    refreshPaymentRecords(account);
  }, [account]);
  const purchasedTkaTotal = paymentRecords.reduce((sum, row) => sum + recordTka(row), 0);
  const estimatedBnb =
    bnbUsd && Number(presaleUsd) > 0 ? Number(presaleUsd) / bnbUsd : 0;
  const estimatedTka =
    Number(presaleUsd) > 0 ? Number(presaleUsd) / TOKEN_PRICE_USD : 0;
  async function buyTkaWithBnb() {
    setPaymentMessage("");
    try {
      if (!PAYMENT_API_BASE) throw Error("Payment API URL is missing. Set VITE_PAYMENT_API_URL in Vercel and redeploy.");
      const wallet = getInjectedWallet();
      if (!wallet) {
        if (isMobileBrowser()) {
          setPaymentMessage("Opening MetaMask. If prompted, open this site in MetaMask and tap Connect Wallet again.");
          openMetaMaskApp();
          return;
        }
        throw Error("No EVM wallet detected. Install MetaMask or open this site in a wallet browser.");
      }
      if (!bnbUsd) throw Error(quoteError || "The live BNB/USD quote is unavailable. Please try again shortly.");
      const usd = Number(presaleUsd);
      if (!Number.isFinite(usd) || usd < 5 || usd > 18000)
        throw Error("Enter an amount between $5 and $18,000.");
      const bnbAmount = usd / bnbUsd;
      if (!Number.isFinite(bnbAmount) || bnbAmount <= 0) throw Error("Invalid BNB amount.");
      setPaymentBusy(true);
      await wallet.request({ method: "eth_requestAccounts" });
      try {
        await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
      } catch (e) {
        if (e.code === 4902) {
          await wallet.request({ method: "wallet_addEthereumChain", params: [MAINNET_CHAIN] });
        } else throw e;
      }
      const payProvider = new ethers.BrowserProvider(wallet);
      const signer = await payProvider.getSigner();
      const buyer = await signer.getAddress();
      const amount = ethers.parseEther(bnbAmount.toFixed(8));
      const walletBalance = await payProvider.getBalance(buyer);
      const feeData = await payProvider.getFeeData();
      // A native BNB transfer to the treasury wallet (an externally owned account)
      // uses the standard 21,000 gas limit. Avoid estimateGas here because some
      // wallet/RPC combinations return "missing revert data" for this simple transfer.
      const gasLimit = 21000n;
      const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
      if (!gasPrice) {
        throw Error("Could not read the current BNB Smart Chain network fee. Please try again.");
      }
      // Add a 20% buffer to the balance check in case the network fee changes slightly.
      const estimatedGasCost = (gasLimit * gasPrice * 120n) / 100n;
      if (walletBalance < amount + estimatedGasCost)
        throw Error("Insufficient BNB for this purchase plus the network gas fee. Please add a little BNB for gas and try again.");
      setPaymentMessage("Confirm the BNB payment in your wallet. Only send through this page.");
      const tx = await signer.sendTransaction({ to: TREASURY, value: amount, gasLimit });
      setPaymentMessage(`Transaction sent: ${tx.hash}. Waiting for 3 BNB Smart Chain confirmations…`);
      const receipt = await tx.wait(3);
      if (!receipt || receipt.status !== 1) throw Error("The BNB transaction was not successful.");
      setPaymentMessage("Three confirmations received. Asking the Tochika server to verify your payment…");
      let response;
      let result;
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch(apiUrl("/api/verify-payment"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: tx.hash, buyer }),
        });
        result = await response.json();
        if (response.ok) break;
        const waitingForChain = response.status === 409 && /confirm|waiting|not yet visible/i.test(result.error || "");
        if (waitingForChain && attempt < 3) {
          setPaymentMessage("The payment is on-chain. Waiting briefly for the payment server to catch up with BNB Smart Chain…");
          await new Promise((resolve) => window.setTimeout(resolve, 3500));
          continue;
        }
        if (response.status === 409 && /already.*recorded/i.test(result.error || "")) {
          const rows = await refreshPaymentRecords(buyer);
          const existing = rows.find((row) => recordTxHash(row).toLowerCase() === tx.hash.toLowerCase());
          if (existing) {
            setPaymentMessage(`This payment was already verified. ${recordTka(existing).toLocaleString()} TKA allocation is recorded.`);
            return;
          }
        }
        throw Error(result.error || "Payment verification failed. Keep your transaction hash and contact support.");
      }
      if (!response?.ok) throw Error(result?.error || "Payment verification is still pending. Refresh your purchase history in a moment.");
      const allocation = Number(result.tka ?? result.tokenAmount ?? result.token_amount ?? 0);
      setPaymentMessage(`Payment verified! ${allocation.toLocaleString()} TKA allocation recorded. Transaction: ${tx.hash}`);
      await refreshPaymentRecords(buyer);
      setPresaleUsd("20");
    } catch (e) {
      setPaymentMessage(e.shortMessage || e.message || "Payment could not be completed.");
    } finally {
      setPaymentBusy(false);
    }
  }
  const alert = (m) => setNotice(m);
  async function connect() {
    try {
      const wallet = getInjectedWallet();
      if (!wallet) {
        if (isMobileBrowser()) {
          alert("Opening MetaMask. If it asks, choose to open this site in MetaMask, then tap Connect Wallet again.");
          openMetaMaskApp();
          return;
        }
        throw Error("No EVM wallet detected. Install a wallet extension or open this site in a wallet browser.");
      }
      await wallet.request({ method: "eth_requestAccounts" });
      await switchNetwork(wallet);
      const p = new ethers.BrowserProvider(wallet);
      const s = await p.getSigner();
      setProvider(p);
      setAccount(await s.getAddress());
      alert("Wallet connected.");
    } catch (e) {
      alert(e.shortMessage || e.message);
    }
  }
  async function switchNetwork(wallet = getInjectedWallet()) {
    if (!wallet) throw Error("No injected EVM wallet detected.");
    try {
      await wallet.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chain.chainId }],
      });
    } catch (e) {
      if (e.code === 4902)
        await wallet.request({
          method: "wallet_addEthereumChain",
          params: [chain],
        });
      else throw e;
    }
  }
  async function refresh(p = provider, a = account) {
    if (!p || !a) return;
    try {
      const net = await p.getNetwork();
      if (Number(net.chainId) !== CHAIN) {
        alert("Switch your wallet to " + chain.chainName);
        return;
      }
      setBnb(fmt(await p.getBalance(a)));
      if (!ethers.isAddress(addresses.token)) return;

      const token = new ethers.Contract(addresses.token, tokenABI, p);

      setBalance(fmt(await token.balanceOf(a)));

      if (saleConfigured) {
        const s = new ethers.Contract(addresses.sale, saleABI, p);
        setRate(await s.tokensPerBNB());
      }
      if (!stakeConfigured) {
        setPlans([]);
        setPositions([]);
        return;
      }
      const st = new ethers.Contract(addresses.stake, stakeABI, p);
      let pp = [];
      for (let i = 1; i <= 3; i++) {
        const v = await st.plans(i);
        pp.push({
          planId: i,
          duration: Number(v.duration),
          bps: Number(v.rewardBps),
          active: v.active,
        });
      }
      setPlans(pp);
      const ids = await st.getUserStakeIds(a);
      let rows = [];
      for (const stakeId of ids) {
        const v = await st.stakes(stakeId);
        rows.push({
          id: Number(stakeId),
          amount: fmt(v.amount),
          reward: fmt(v.reward),
          unlock: Number(v.unlockTime),
          withdrawn: v.withdrawn,
        });
      }
      setPositions(rows.reverse());
    } catch (e) {
      alert("Unable to read contracts: " + (e.shortMessage || e.message));
    }
  }
  useEffect(() => {
    const wallet = getInjectedWallet();
    if (!wallet) return;
    const init = async () => {
      try {
        const accounts = await wallet.request({ method: "eth_accounts" });
        if (accounts.length) {
          setProvider(new ethers.BrowserProvider(wallet));
          setAccount(accounts[0]);
        }
      } catch {}
    };
    init();
    const changed = () => window.location.reload();
    wallet.on?.("accountsChanged", changed);
    wallet.on?.("chainChanged", changed);
    return () => {
      wallet.removeListener?.("accountsChanged", changed);
      wallet.removeListener?.("chainChanged", changed);
    };
  }, []);
  useEffect(() => {
    refresh();
  }, [provider, account]);
  async function transact(fn, requirement = "stake") {
    if (!account) return alert("Connect your wallet first.");
    if (requirement === "sale" && !saleConfigured)
      return alert("Token sale contract is not configured.");
    if (requirement === "stake" && !stakeConfigured)
      return alert("Staking contract is not configured.");
    setBusy(true);
    try {
      const wallet = getInjectedWallet();
      if (!wallet) throw Error("Reconnect your wallet to continue.");
      await switchNetwork(wallet);
      const p = new ethers.BrowserProvider(wallet),
        signer = await p.getSigner();
      await fn(signer);
      await refresh(p, await signer.getAddress());
    } catch (e) {
      alert(e.reason || e.shortMessage || e.message);
    } finally {
      setBusy(false);
    }
  }
  const buy = () =>
    transact(async (signer) => {
      if (!qty || Number(qty) <= 0) throw Error("Enter a valid BNB amount.");
      const s = new ethers.Contract(addresses.sale, saleABI, signer);
      let tx = await s.buy({ value: ethers.parseEther(qty) });
      alert("Transaction submitted: " + tx.hash);
      await tx.wait();
      alert("Purchase confirmed.");
      setQty("");
    }, "sale");
  const doStake = () =>
    transact(async (signer) => {
      if (!qty || Number(qty) <= 0) throw Error("Enter a valid TKA amount.");
      const amount = ethers.parseUnits(qty, 18);
      const t = new ethers.Contract(addresses.token, tokenABI, signer),
        st = new ethers.Contract(addresses.stake, stakeABI, signer);
      const owner = await signer.getAddress();
      if ((await t.allowance(owner, addresses.stake)) < amount) {
        let tx = await t.approve(addresses.stake, amount);
        alert("Waiting for token approval…");
        await tx.wait();
      }
      let tx = await st.stake(plan + 1, amount);
      alert("Staking submitted: " + tx.hash);
      await tx.wait();
      alert("Stake confirmed.");
      setQty("");
    });
  const withdraw = (id) =>
    transact(async (signer) => {
      let tx = await new ethers.Contract(
        addresses.stake,
        stakeABI,
        signer,
      ).withdraw(id);
      alert("Withdrawal submitted: " + tx.hash);
      await tx.wait();
      alert("Withdrawal confirmed.");
    });
  const [picks, setPicks] = useState({});
  const [fixtures, setFixtures] = useState([]);
  const [fixtureStatus, setFixtureStatus] = useState({
    loading: false,
    error: "",
    source: "OpenLigaDB",
  });
  const [bettingTickets, setBettingTickets] = useState([]);
  const [bettingMessage, setBettingMessage] = useState("");
  const bettingKey = `tochikabet_predictions_${(account || "guest").toLowerCase()}`;
  useEffect(() => {
    try {
      setBettingTickets(JSON.parse(localStorage.getItem(bettingKey) || "[]"));
    } catch {
      setBettingTickets([]);
    }
    setPicks({});
  }, [bettingKey]);
  useEffect(() => {
    let active = true;
    const loadFixtures = async () => {
      setFixtureStatus({ loading: true, error: "", source: "OpenLigaDB" });
      const leagues = [
        { code: "bl1", name: "Bundesliga" },
        { code: "pl", name: "Premier League" },
        { code: "sa", name: "Serie A" },
        { code: "pd", name: "La Liga" },
        { code: "fl1", name: "Ligue 1" },
      ];
      const year = new Date().getFullYear();
      const results = await Promise.allSettled(
        leagues.map(async (league) => {
          const response = await fetch(
            `https://api.openligadb.de/getmatchdata/${league.code}/${year}`,
            { headers: { Accept: "application/json" } },
          );
          if (!response.ok)
            throw Error(`${league.name}: HTTP ${response.status}`);
          return { league, matches: await response.json() };
        }),
      );
      const rows = [];
      for (const result of results) {
        if (
          result.status !== "fulfilled" ||
          !Array.isArray(result.value.matches)
        )
          continue;
        const { league, matches } = result.value;
        for (const m of matches) {
          if (!m?.matchDateTime || !m?.team1?.teamName || !m?.team2?.teamName)
            continue;
          const date = new Date(m.matchDateTime);
          if (Number.isNaN(date.getTime())) continue;
          const finished = Boolean(m.matchIsFinished);
          const finalResult =
            (m.matchResults || []).find((r) =>
              /end|final/i.test(r.resultName || ""),
            ) || (finished ? (m.matchResults || []).at(-1) : null);
          const now = new Date(),
            tomorrow = new Date(now);
          tomorrow.setDate(now.getDate() + 1);
          const same = (a, b) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
          const day = same(date, now)
            ? "Today"
            : same(date, tomorrow)
              ? "Tomorrow"
              : "Weekend";
          rows.push({
            id: String(m.matchID),
            home: m.team1.teamName,
            away: m.team2.teamName,
            league: league.name,
            leagueCode: league.code,
            day,
            time: date.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            date,
            icon: "⚽",
            finished,
            homeScore: finalResult?.pointsTeam1 ?? null,
            awayScore: finalResult?.pointsTeam2 ?? null,
          });
        }
      }
      rows.sort((a, b) => a.date - b.date);
      if (!active) return;
      setFixtures(rows);
      setFixtureStatus({
        loading: false,
        error: rows.length
          ? ""
          : "No fixtures returned by the selected competition feeds. Try refreshing later.",
        source: "OpenLigaDB",
      });
    };
    loadFixtures();
    return () => {
      active = false;
    };
  }, []);
  const [sportsFilter, setSportsFilter] = useState("All matches");
  const [sportsSearch, setSportsSearch] = useState("");
  const [visibleFixtureCount, setVisibleFixtureCount] = useState(5);
  useEffect(() => {
    setVisibleFixtureCount(5);
  }, [sportsFilter, sportsSearch]);
  function choosePick(id, choice) {
    setPicks((old) => ({
      ...old,
      [id]: old[id] === choice ? undefined : choice,
    }));
  }
  const chosenFixtures = fixtures.filter(
    (f) => picks[f.id] && !f.finished && f.date > Date.now(),
  );
  function savePredictions() {
    if (!account) {
      setBettingMessage("Connect your wallet before submitting predictions.");
      return;
    }
    if (!chosenFixtures.length) {
      setBettingMessage("Choose at least one upcoming match.");
      return;
    }
    const existing = new Set(bettingTickets.map((t) => String(t.matchId)));
    const fresh = chosenFixtures.filter((f) => !existing.has(f.id));
    if (!fresh.length) {
      setBettingMessage(
        "You have already submitted a prediction for each selected match.",
      );
      return;
    }
    const additions = fresh.map((f) => ({
      id: `${account.toLowerCase()}-${f.id}`,
      matchId: f.id,
      home: f.home,
      away: f.away,
      league: f.league,
      leagueCode: f.leagueCode,
      kickoff: f.date.toISOString(),
      choice: picks[f.id],
      createdAt: new Date().toISOString(),
      status: "Pending",
      reward: 0,
    }));
    const next = [...additions, ...bettingTickets];
    setBettingTickets(next);
    localStorage.setItem(bettingKey, JSON.stringify(next));
    setPicks({});
    setBettingMessage(
      `${additions.length} free prediction${additions.length === 1 ? "" : "s"} submitted. Each correct result earns 300 TKA in your separate betting balance.`,
    );
  }
  useEffect(() => {
    if (!fixtures.length || !bettingTickets.length) return;
    const byId = new Map(fixtures.map((f) => [f.id, f]));
    const next = bettingTickets.map((t) => {
      const f = byId.get(String(t.matchId));
      if (
        !f?.finished ||
        f.homeScore === null ||
        f.awayScore === null ||
        t.status !== "Pending"
      )
        return t;
      const outcome =
        Number(f.homeScore) > Number(f.awayScore)
          ? "home"
          : Number(f.homeScore) < Number(f.awayScore)
            ? "away"
            : "draw";
      const won = t.choice === outcome;
      return {
        ...t,
        status: won ? "Correct" : "Incorrect",
        reward: won ? 300 : 0,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        settledAt: new Date().toISOString(),
      };
    });
    if (JSON.stringify(next) !== JSON.stringify(bettingTickets)) {
      setBettingTickets(next);
      localStorage.setItem(bettingKey, JSON.stringify(next));
    }
  }, [fixtures]);
  const bettingBalance = bettingTickets.reduce(
    (sum, t) => sum + (t.status === "Correct" ? 300 : 0),
    0,
  );
  const correctPredictions = bettingTickets.filter(
    (t) => t.status === "Correct",
  ).length;
  const pendingPredictions = bettingTickets.filter(
    (t) => t.status === "Pending",
  ).length;
  const [savedTickets, setSavedTickets] = useState(bettingTickets);
  useEffect(() => setSavedTickets(bettingTickets), [bettingTickets]);
  const shownFixtures = fixtures.filter(
    (f) =>
      (sportsFilter === "All matches" || f.day === sportsFilter) &&
      `${f.home} ${f.away} ${f.league}`
        .toLowerCase()
        .includes(sportsSearch.toLowerCase()),
  );
  const upcomingFixtures = shownFixtures.filter(
    (f) => !f.finished && f.date > Date.now(),
  );
  const visibleFixtures = upcomingFixtures.slice(0, visibleFixtureCount);
  const go = (p) => {
    setPage(p);
    setMobile(false);
    setQty("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nav = [
    "Home",
    "About TKA",
    "Dashboard",
    "Buy TKA",
    "Staking",
    "Sports Betting",
    "Tokenomics",
    "Roadmap",
  ];
  return (
    <>
      <header>
        <div className="wrap nav">
          <button className="brand" onClick={() => go("Home")}>
            <img src="logo.png" alt="TOCHIKA Logo" className="header-logo" />
          </button>
          <nav
            id="mobile-navigation"
            aria-label="Main navigation"
            className={mobile ? "open" : ""}
          >
            {nav.map((n) => (
              <button
                key={n}
                className={page === n ? "active" : ""}
                onClick={() => go(n)}
              >
                {n}
              </button>
            ))}
          </nav>
          <div className="nav-actions">
            <button className="wallet" onClick={connect}>
              <Wallet size={16} />
              {account ? short(account) : "Connect Wallet"}
            </button>
            <button
              className="hamb"
              aria-label={mobile ? "Close navigation" : "Open navigation"}
              aria-expanded={mobile}
              aria-controls="mobile-navigation"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main className="wrap">
        {page === "Home" && (
          <>
            <section className="hero">
              <div>
                <div className="eyebrow">
                  <span className="dot" /> BUILT ON BNB SMART CHAIN
                </div>
                <h1>
                  Football passion meets <em>onchain possibility.</em>
                </h1>
                <p>
                  TOCHIKABET is the sports-prediction vision within the TOCHIKA
                  ($TKA) ecosystem. We are building toward a transparent,
                  wallet-connected experience for football fans, with token
                  tools and fixed-term staking available in our Project.
                </p>
                <div className="row">
                  <button className="primary" onClick={() => go("Buy TKA")}>
                    Explore $TKA <ArrowUpRight size={18} />
                  </button>
                  <button className="secondary" onClick={() => go("Staking")}>
                    Explore staking
                  </button>
                </div>
                <div className="mini">
                  <span>
                    100,000,000 <small>Fixed TKA supply</small>
                  </span>
                  <span>
                    BNB Chain <small>EVM ecosystem</small>
                  </span>
                  <span>
                    Instant Pay <small>Sport Predict</small>
                  </span>
                  <span>
                    Fixed-term <small>Staking design</small>
                  </span>
                </div>
              </div>
              <div className="hero-art">
                <img src="/landing.png" alt="TOCHIKA logo" />
                <div className="art-foot">BUILD · STAKE · GROW</div>
              </div>
            </section>
            <section className="trust-strip grid three">
              <article className="card">
                <span className="pill">01 / TOKEN</span>
                <h3>Clear token fundamentals</h3>
                <p>
                  TKA is the ecosystem token, with a fixed maximum supply of 100
                  million tokens. Check the Tokenomics page for the current
                  onchain details.
                </p>
              </article>
              <article className="card">
                <span className="pill">02 / STAKING</span>
                <h3>Defined lock periods</h3>
                <p>
                  The staking features offers fixed-term plans. Review the
                  duration, reward rate and contract status before interacting.
                </p>
              </article>
              <article className="card">
                <span className="pill">03 / FOOTBALL</span>
                <h3>Made for match-day fans</h3>
                <p>
                  TOCHIKABET is the football-prediction experience. To generate
                  more TKA token for our community, TKA token balance in the
                  prediction will be convert to real TKA token after TGE.
                  Predict Safe.
                </p>
              </article>
            </section>
            <section className="section">
              <div className="eyebrow">THE ECOSYSTEM</div>
              <h2>One token. Clear onchain tools.</h2>
              <div className="grid three">
                {[
                  [
                    Coins,
                    "TKA token",
                    "A fixed-supply BEP-20 compatible token on BNB Smart Chain.",
                  ],
                  [
                    Wallet,
                    "BNB purchases",
                    "Purchase TKA with BNB once the sale contract is funded and enabled.",
                  ],
                  [
                    Clock3,
                    "Term staking",
                    "Choose a published staking plan, lock tokens and withdraw at maturity.",
                  ],
                ].map(([Icon, title, desc]) => (
                  <article className="card" key={title}>
                    <Icon className="blue" size={29} />
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="banner">
              <div>
                <h2>Explore the TOCHIKA ecosystem</h2>
                <p>
                  Connect a compatible wallet to view onchain balances and
                  available contracts.
                </p>
              </div>
              <button className="primary" onClick={connect}>
                Connect wallet <ArrowUpRight size={18} />
              </button>
            </section>
          </>
        )}
        {page === "About TKA" && (
          <section className="section page">
            <div className="eyebrow">ABOUT THE PROJECT</div>
            <h1>The TOCHIKA vision.</h1>
            <p className="lead">
              TOCHIKA is the token ecosystem behind TOCHIKABET, our great
              football-prediction experience. Our goal is to make the product
              understandable and transparent clear token information,
              wallet-controlled transactions, defined staking terms and a
              carefully developed sports-prediction experience.
            </p>
            <div className="grid three">
              {[
                [
                  "Transparency",
                  "Contract addresses and staking terms should be published before launch.",
                ],
                [
                  "User control",
                  "Transactions require approval in your own connected wallet.",
                ],
                [
                  "Responsible launch",
                  "Smart contracts require testing, security review and funded reward reserves before public use.",
                ],
              ].map(([a, b]) => (
                <div className="card" key={a}>
                  <ShieldCheck className="blue" />
                  <h3>{a}</h3>
                  <p>{b}</p>
                </div>
              ))}
            </div>
            <div className="card spaced">
              <div className="eyebrow">THE SPORTS VISION</div>
              <h2>Introducing TOCHIKABET</h2>
              <p>
                TOCHIKABET is being developed as a football-prediction
                experience for fans who want to engage with matches in a more
                interactive way. The coverage includes major European
                competitions such as the Premier League, La Liga, Serie A,
                Bundesliga and UEFA Champions League.
              </p>
              <p>
                To generate more TKA token for our community sport prediction
                must be accurate and all TKA token balance in the prediction
                will be convert to real TKA token after TGE. Predict Safe.
              </p>
            </div>
          </section>
        )}
        {page === "Tokenomics" && (
          <section className="section page">
            <div className="eyebrow">TOKEN OVERVIEW</div>
            <h1>Designed with a fixed supply.</h1>
            <div className="grid three">
              {[
                ["Token name", "TOCHIKA"],
                ["Ticker", "TKA"],
                ["Maximum supply", "100,000,000 TKA"],
                ["Network", "BNB Smart Chain"],
                ["Standard", "BEP-20 compatible"],
                ["Decimals", "18"],
              ].map(([k, v]) => (
                <div className="card stat" key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <div className="card spaced">
              <h3>Allocation to be finalized</h3>
              <p>
                Team, community, liquidity, sale and staking reward allocations
                have not yet been specified. Do not interpret the full supply as
                circulating supply.
              </p>
              <p className="muted">
                Token address: {addresses.token || "Not deployed"}
              </p>
            </div>
          </section>
        )}
        {page === "Buy TKA" && (
          <section className="section page">
            <div className="eyebrow">TOCHIKA · BNB PURCHASE</div>
            <h1>Buy TKA with BNB.</h1>
            <p className="lead">
              Pay directly to the official Tochika treasury wallet. After the
              BNB transaction confirms, the server verifies it and records your
              TKA allocation at $0.0009 per token.
            </p>
            <div className="presale-banner">
              <span>BNB SMART CHAIN MAINNET ·</span>
              <strong>20,000,000 TKA</strong>
              <small>Presale allocation target · $0.0009 per TKA</small>
              <div className="presale-track">
                <i />
              </div>
              <small>Mainnet chain ID 56</small>
            </div>
            <div className="grid two">
              <div className="card form">
                <div className="row between">
                  <h3>Purchase TKA</h3>
                  <span className="presale-pill">$0.0009 / TKA</span>
                </div>
                <label>Purchase amount (USD)</label>
                <div className="inputrow">
                  <input
                    type="number"
                    min="5"
                    max="18000"
                    step="any"
                    placeholder="e.g. 20"
                    value={presaleUsd}
                    onChange={(e) => setPresaleUsd(e.target.value)}
                  />
                  <b>USD</b>
                </div>
                <div className="presale-quick">
                  {[10, 20, 50, 100].map((v) => (
                    <button
                      key={v}
                      className="secondary"
                      onClick={() => setPresaleUsd(String(v))}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                <div className="divider" />
                <div className="info">
                  <span>Live BNB/USD quote</span>
                  <strong>
                    {bnbUsd
                      ? `$${bnbUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                      : "Loading quote…"}
                  </strong>
                </div>
                <div className="info">
                  <span>Estimated BNB payment</span>
                  <strong>
                    {estimatedBnb ? estimatedBnb.toFixed(8) + " BNB" : "—"}
                  </strong>
                </div>
                <div className="info">
                  <span>Estimated TKA allocation</span>
                  <strong>
                    {estimatedTka
                      ? estimatedTka.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        }) + " TKA"
                      : "—"}
                  </strong>
                </div>
                <p className="muted tiny">
                  The final BNB amount is calculated from the live quote when you submit. Network gas is paid separately by the buyer. The server independently verifies the transaction and calculates the final TKA allocation.
                </p>
                {quoteError && <p className="muted tiny" role="alert">{quoteError}</p>}
                <button
                  className="primary full"
                  disabled={!account || paymentBusy || !bnbUsd || !estimatedBnb}
                  onClick={buyTkaWithBnb}
                >
                  {paymentBusy
                    ? "Processing payment…"
                    : "Connect wallet & Pay BNB"}{" "}
                  <ArrowUpRight size={18} />
                </button>
                {!account && (
                  <p className="muted tiny">
                    Connect your wallet first. Payment will switch the wallet to
                    BNB Smart Chain Mainnet.
                  </p>
                )}
                {paymentMessage && (
                  <p className="muted tiny" role="status">
                    {paymentMessage}
                  </p>
                )}
              </div>
              <div className="card">
                <h3>Payment details</h3>
                <div className="info">
                  <span>Network</span>
                  <strong>BNB Smart Chain Mainnet</strong>
                </div>
                <div className="info">
                  <span>Receiving wallet</span>
                  <strong>{short(TREASURY)}</strong>
                </div>
                <div className="info">
                  <span>Token price</span>
                  <strong>$0.0009</strong>
                </div>
                <div className="info">
                  <span>Distribution</span>
                  <strong>Recorded now · distributed separately</strong>
                </div>
                <div className="info">
                  <span>Your verified allocation</span>
                  <strong>{purchasedTkaTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} TKA</strong>
                </div>
                <p className="muted tiny">
                  This payment sends native BNB directly to the treasury wallet.
                  TKA is not transferred immediately.
                </p>
                <h3>My verified purchases</h3>
                {paymentRecords.length ? (
                  paymentRecords.map((r) => {
                    const hash = recordTxHash(r);
                    const created = recordCreatedAt(r);
                    return (
                      <div className="info" key={hash || `${recordBnb(r)}-${created}`}>
                        <span>{recordBnb(r).toFixed(6)} BNB{created ? ` · ${new Date(created).toLocaleString()}` : ""}</span>
                        <strong>
                          {recordTka(r).toLocaleString(undefined, { maximumFractionDigits: 2 })} TKA
                          {hash && <> · <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">View tx</a></>}
                        </strong>
                      </div>
                    );
                  })
                ) : (
                  <p className="muted tiny">
                    {paymentRecordsLoading ? "Loading your verified purchases…" : paymentRecordsError || "No verified purchases recorded for this wallet yet."}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
        {page === "Staking" && (
          <section className="section page">
            <div className="eyebrow">FIXED-DURATION STAKING</div>
            <h1>Stake on your terms.</h1>
            <p className="lead">
              Choose a published term and review the exact reward before locking
              tokens. Tokens cannot be withdrawn early in this starter contract.
            </p>
            <div className="grid two">
              <div className="card form">
                <label>Select a plan</label>
                <div className="planrow">
                  {(plans.length
                    ? plans
                    : [
                        {
                          planId: 1,
                          duration: 30 * 86400,
                          bps: 300,
                          active: false,
                        },
                        {
                          planId: 2,
                          duration: 60 * 86400,
                          bps: 700,
                          active: false,
                        },
                        {
                          planId: 3,
                          duration: 90 * 86400,
                          bps: 1200,
                          active: false,
                        },
                      ]
                  ).map((p, i) => (
                    <button
                      className={"plan " + (plan === i ? "selected" : "")}
                      onClick={() => setPlan(i)}
                      key={i}
                      disabled={!p.active && configured}
                    >
                      <strong>{Math.round(p.duration / 86400)} days</strong>
                      <small>
                        {p.active ? `${p.bps / 100}% term reward` : "Pending"}
                      </small>
                    </button>
                  ))}
                </div>
                <label>Amount to stake</label>
                <div className="inputrow">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0.00"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                  <b>TKA</b>
                </div>
                <small>Available balance: {balance} TKA</small>
                <button
                  disabled={busy || !configured || !plans[plan]?.active}
                  className="primary full"
                  onClick={doStake}
                >
                  {busy ? "Processing…" : "Approve & stake"}{" "}
                  <ArrowUpRight size={18} />
                </button>
              </div>
              <div className="card">
                <Clock3 className="blue" size={32} />
                <h3>How it works</h3>
                <p>
                  Approve the staking contract to transfer your chosen amount,
                  then confirm the staking transaction. At maturity, withdraw
                  your principal and contractual reward together.
                </p>
                <p>
                  Rewards must be prefunded in the staking contract. No staking
                  plan is active until the deployer configures it.
                </p>
                <p className="muted tiny">
                  Staking involves smart contract and token risks. Displayed
                  term rewards are not guaranteed investment returns.
                </p>
              </div>
            </div>
          </section>
        )}
        {page === "Dashboard" && (
          <section className="section page">
            <div className="eyebrow">YOUR WALLET</div>
            <h1>Your TOCHIKA dashboard.</h1>
            {!account ? (
              <div className="card">
                <p>
                  Connect your wallet to view your verified purchased TKA allocation, on-chain token balance, BNB balance and separate TochikaBet rewards.
                </p>
                <button className="primary" onClick={connect}>
                  Connect wallet
                </button>
              </div>
            ) : (
              <>
                <div className="grid two">
                  <div className="card stat">
                    <small>Connected wallet</small>
                    <strong>{short(account)}</strong>
                  </div>
                  <div className="card stat">
                    <small>Purchased TKA allocation</small>
                    <strong>{purchasedTkaTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="card stat">
                    <small>On-chain TKA balance</small>
                    <strong>{balance}</strong>
                  </div>
                  <div className="card stat">
                    <small>BNB Mainnet balance</small>
                    <strong>{bnb || "—"}</strong>
                  </div>
                </div>
                <div className="card presale-dashboard">
                  <div className="row between">
                    <h3>My verified TKA purchases</h3>
                    <button className="secondary" disabled={paymentRecordsLoading} onClick={() => refreshPaymentRecords()}>
                      {paymentRecordsLoading ? "Refreshing…" : "Refresh purchases"}
                    </button>
                  </div>
                  <div className="presale-number">
                    {purchasedTkaTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} TKA
                  </div>
                  <p className="muted tiny">
                    This is your verified purchased allocation, not your current on-chain token balance. BNB payments are recorded by the payment server; TKA distribution happens separately after the official distribution process.
                  </p>
                  {paymentRecordsError && <p className="muted tiny" role="alert">{paymentRecordsError}</p>}
                  {paymentRecords.length ? paymentRecords.map((row) => {
                    const hash = recordTxHash(row);
                    const created = recordCreatedAt(row);
                    return (
                      <div className="info" key={hash || `${recordBnb(row)}-${created}`}>
                        <span>{recordBnb(row).toFixed(6)} BNB{created ? ` · ${new Date(created).toLocaleString()}` : ""}</span>
                        <strong>
                          {recordTka(row).toLocaleString(undefined, { maximumFractionDigits: 2 })} TKA
                          {hash && <> · <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">View tx</a></>}
                        </strong>
                      </div>
                    );
                  }) : <p className="muted tiny">No verified purchases recorded for this wallet yet.</p>}
                  <button className="secondary" onClick={() => setPage("Buy TKA")}>Buy more TKA</button>
                </div>
                <div className="card presale-dashboard">
                  <div className="row between">
                    <h3>TochikaBet prediction rewards</h3>
                    <span className="presale-pill">BETTING ONLY</span>
                  </div>
                  <div className="grid three">
                    <div>
                      <small>Betting rewards balance</small>
                      <div className="presale-number">
                        {bettingBalance.toLocaleString()} TKA
                      </div>
                    </div>
                    <div>
                      <small>Correct predictions</small>
                      <div className="presale-number">{correctPredictions}</div>
                    </div>
                    <div>
                      <small>Pending predictions</small>
                      <div className="presale-number">{pendingPredictions}</div>
                    </div>
                  </div>

                  <button
                    className="secondary"
                    onClick={() => setPage("Sports Betting")}
                  >
                    Open TochikaBet predictions
                  </button>
                </div>
                <div className="card spaced">
                  <div className="row between">
                    <h3>My staking positions</h3>
                    <button className="textbtn" onClick={() => refresh()}>
                      Refresh
                    </button>
                  </div>
                  {positions.length ? (
                    positions.map((p) => (
                      <div className="position" key={p.id}>
                        <div>
                          <strong>Position #{p.id}</strong>
                          <small>
                            {p.amount} TKA · Reward {p.reward} TKA
                          </small>
                          <small>
                            Unlock: {new Date(p.unlock * 1000).toLocaleString()}
                          </small>
                        </div>
                        <button
                          className="secondary"
                          disabled={
                            busy || p.withdrawn || Date.now() < p.unlock * 1000
                          }
                          onClick={() => withdraw(p.id)}
                        >
                          {p.withdrawn
                            ? "Withdrawn"
                            : Date.now() < p.unlock * 1000
                              ? "Locked"
                              : "Withdraw"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      No positions found, or contracts are not yet configured.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        )}
        {page === "Sports Betting" && (
          <section className="section page sports-page">
            <div className="sports-hero">
              <div>
                <div className="eyebrow">
                  ⚡ TOCHIKABET · FREE FOOTBALL PREDICTIONS
                </div>
                <h1>Every match. Your call.</h1>
                <p>
                  Predict football results for free. Every correct match
                  prediction earns 300 TKA in your separate TochikaBet rewards
                  balance.
                </p>
                <span className="sports-tag">
                  ● FREE TO PLAY · 300 TKA PER CORRECT PREDICTION
                </span>
              </div>
              <div className="sports-hero-art">
                <span>⚽</span>
                <strong>
                  GAME
                  <br />
                  ON<span className="blue">.</span>
                </strong>
              </div>
            </div>
            <div className="sports-disclaimer">
              <strong>NO ENTRY FEES · NO BNB BETTING</strong> · Predictions are
              free. Betting rewards are tracked separately from purchased TKA
              and remain pending distribution until the token launch
            </div>
            <div className="sports-metrics">
              <div>
                <small>BETTING REWARDS BALANCE</small>
                <strong>{bettingBalance.toLocaleString()} TKA</strong>
              </div>
              <div>
                <small>CORRECT PREDICTIONS</small>
                <strong>{correctPredictions}</strong>
              </div>
              <div>
                <small>PENDING PREDICTIONS</small>
                <strong>{pendingPredictions}</strong>
              </div>
            </div>
            <div className="sports-layout">
              <div className="sports-main">
                <div className="sports-toolbar">
                  <div>
                    <div className="eyebrow">THE MATCH CENTRE</div>
                    <h2>Football fixtures</h2>
                  </div>
                  <input
                    aria-label="Search fixtures"
                    value={sportsSearch}
                    onChange={(e) => setSportsSearch(e.target.value)}
                    placeholder="⌕ Search teams or leagues"
                  />
                </div>
                <div className="sports-tabs">
                  {["All matches", "Today", "Tomorrow", "Weekend"].map((t) => (
                    <button
                      key={t}
                      className={sportsFilter === t ? "current" : ""}
                      onClick={() => setSportsFilter(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="sports-api-status">
                  {fixtureStatus.loading
                    ? "Loading fixtures from OpenLigaDB…"
                    : fixtureStatus.error
                      ? fixtureStatus.error
                      : `Fixture source: ${fixtureStatus.source}. Results are checked against the provider's completed match data.`}
                </div>
                <div className="sports-fixtures">
                  {upcomingFixtures.length ? (
                    visibleFixtures.map((f) => (
                      <article className="sports-fixture" key={f.id}>
                        <div className="fixture-top">
                          <span>⚽ {f.league}</span>
                          <span>
                            {f.date.toLocaleDateString()} · {f.time}
                          </span>
                        </div>
                        <div className="fixture-body">
                          <div className="fixture-teams">
                            <strong>{f.home}</strong>
                            <span>VS</span>
                            <strong>{f.away}</strong>
                          </div>
                          <div className="fixture-market">
                            <small>
                              CHOOSE YOUR OUTCOME · FREE · REWARD 300 TKA IF
                              CORRECT
                            </small>
                            <div className="fixture-options">
                              {[
                                ["home", "1", f.home],
                                ["draw", "X", "Draw"],
                                ["away", "2", f.away],
                              ].map(([v, symbol, label]) => (
                                <button
                                  aria-pressed={picks[f.id] === v}
                                  key={v}
                                  className={picks[f.id] === v ? "picked" : ""}
                                  onClick={() => choosePick(f.id, v)}
                                >
                                  <b>{symbol}</b>
                                  <span>{label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="sports-empty">
                      {fixtureStatus.loading
                        ? "Fetching matches…"
                        : "No upcoming fixtures match this filter. Check back or choose All matches."}
                    </div>
                  )}
                </div>
                {upcomingFixtures.length > 5 && (
                  <div className="sports-fixture-pagination">
                    <span>
                      Showing {visibleFixtures.length} of{" "}
                      {upcomingFixtures.length} matches
                    </span>
                    <div>
                      {visibleFixtureCount < upcomingFixtures.length && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() =>
                            setVisibleFixtureCount((count) =>
                              Math.min(count + 5, upcomingFixtures.length),
                            )
                          }
                        >
                          See more games ↓
                        </button>
                      )}
                      {visibleFixtureCount > 5 && (
                        <button
                          type="button"
                          className="slip-clear"
                          onClick={() => setVisibleFixtureCount(5)}
                        >
                          Show fewer ↑
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <aside className="sports-aside">
                <div className="sports-slip">
                  <div className="slip-title">
                    <h3>🎯 My predictions</h3>
                    <span>{chosenFixtures.length} selected</span>
                  </div>
                  <p className="muted tiny">
                    Free entry · 300 TKA for every correct prediction. One
                    prediction per match.
                  </p>
                  {chosenFixtures.length ? (
                    <div className="slip-list">
                      {chosenFixtures.map((f) => (
                        <div className="slip-item" key={f.id}>
                          <button
                            aria-label={`Remove ${f.home} vs ${f.away}`}
                            onClick={() => choosePick(f.id, picks[f.id])}
                          >
                            ×
                          </button>
                          <div>
                            <small>
                              {f.home} vs {f.away}
                            </small>
                            <strong>
                              {picks[f.id] === "home"
                                ? f.home
                                : picks[f.id] === "away"
                                  ? f.away
                                  : "Draw"}
                            </strong>
                          </div>
                          <span>+300 TKA</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="slip-empty">
                      <div>🎯</div>
                      <strong>Your predictions start here</strong>
                      <p>Select an outcome for an upcoming match.</p>
                    </div>
                  )}
                  <button
                    className="slip-submit"
                    disabled={!chosenFixtures.length}
                    onClick={savePredictions}
                  >
                    Submit free predictions →
                  </button>
                  {bettingMessage && (
                    <p className="sports-api-status" role="status">
                      {bettingMessage}
                    </p>
                  )}
                  {!account && (
                    <p className="muted tiny">
                      Connect your wallet to save predictions to its browser
                      profile.
                    </p>
                  )}
                  <button
                    className="slip-clear"
                    disabled={!chosenFixtures.length}
                    onClick={() => setPicks({})}
                  >
                    Clear selections
                  </button>
                </div>
                <div className="sports-history">
                  <h3>My prediction history</h3>
                  {bettingTickets.length ? (
                    bettingTickets.slice(0, 10).map((t) => (
                      <div className="history-item" key={t.id}>
                        <strong>
                          {t.home} vs {t.away}
                        </strong>
                        <small>
                          {new Date(t.kickoff).toLocaleString()} · {t.status}
                        </small>
                        <span>
                          Your pick:{" "}
                          {t.choice === "home"
                            ? t.home
                            : t.choice === "away"
                              ? t.away
                              : "Draw"}{" "}
                          ·{" "}
                          {t.status === "Correct"
                            ? "+300 TKA"
                            : t.status === "Incorrect"
                              ? "0 TKA"
                              : "Reward pending"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted tiny">
                      Your submitted predictions will appear here.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}
        {page === "Roadmap" && (
          <section className="section page">
            <div className="eyebrow">PROJECT ROADMAP</div>
            <h1>Building TOCHIKA & TOCHIKABET.</h1>
            <div className="timeline">
              {[
                [
                  "01 · Foundation",
                  "Brand identity, website and contract prototypes.",
                ],
                [
                  "02 · Testnet",
                  "Deploy TKA, token sale and staking to BSC Testnet; verify and test.",
                ],
                [
                  "03 · Review",
                  "Independent security review, token allocation and legal/compliance assessment.",
                ],
                [
                  "04 · Launch decision",
                  "Publish verified contracts and official launch information after prerequisites are met.",
                ],
              ].map(([a, b]) => (
                <div className="card" key={a}>
                  <h3>{a}</h3>
                  <p>{b}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer>
        <div className="wrap foot">
          <div>
            <strong>
              TOCHIKA <span className="blue">$TKA</span>
            </strong>
            <p>Build · Stake · Grow</p>
          </div>
          <p>© {new Date().getFullYear()} TOCHIKA Ecosystem.</p>
          <span>{chain.chainName}</span>
        </div>
      </footer>
      {notice && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
