import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.API_PORT || 8787);
const RPC_URL = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
const TREASURY = '0x77b384DB595801bc57B62b71607e1DE6d341acB8';
const PRICE_USD = 0.0009;
const SALE_CAP_TKA = 20_000_000;
const DB = path.join(__dirname, 'data', 'purchases.json');
const provider = new ethers.JsonRpcProvider(RPC_URL, 56);

async function readDb(){ try{return JSON.parse(await readFile(DB,'utf8'));}catch{return [];} }
async function writeDb(rows){await mkdir(path.dirname(DB),{recursive:true});await writeFile(DB,JSON.stringify(rows,null,2));}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':process.env.ALLOWED_ORIGIN||'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let s='';for await(const c of req)s+=c;if(s.length>10000)throw Error('Request too large');return JSON.parse(s||'{}');}
async function getQuote(){const r=await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');if(!r.ok)throw Error('Live BNB quote provider unavailable');const j=await r.json();const n=Number(j.price);if(!Number.isFinite(n)||n<=0)throw Error('Invalid BNB quote');return n;}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS')return send(res,204,{});
 try{
  if(req.method==='GET'&&req.url==='/api/health')return send(res,200,{ok:true,chainId:56,treasury:TREASURY,priceUsd:PRICE_USD});
  if(req.method==='GET'&&req.url==='/api/quote'){const bnbUsd=await getQuote();return send(res,200,{bnbUsd,tokenPriceUsd:PRICE_USD,chainId:56,asOf:new Date().toISOString()});}
  if(req.method==='GET'&&req.url.startsWith('/api/purchases/')){const wallet=req.url.split('/').pop();if(!ethers.isAddress(wallet))return send(res,400,{error:'Invalid wallet address'});const rows=(await readDb()).filter(x=>x.buyer.toLowerCase()===wallet.toLowerCase());return send(res,200,rows);}
  if(req.method==='POST'&&req.url==='/api/verify-payment'){
   const {txHash,buyer}=await body(req);
   if(!/^0x[0-9a-fA-F]{64}$/.test(txHash||'')||!ethers.isAddress(buyer))return send(res,400,{error:'Valid transaction hash and buyer wallet are required'});
   const rows=await readDb();if(rows.some(x=>x.txHash.toLowerCase()===txHash.toLowerCase()))return send(res,409,{error:'This transaction has already been recorded'});
   const receipt=await provider.getTransactionReceipt(txHash);if(!receipt)return send(res,409,{error:'Transaction not yet visible on BNB Smart Chain. Try again shortly.'});
   if(receipt.status!==1)return send(res,400,{error:'Transaction failed on-chain'});
   const tx=await provider.getTransaction(txHash);if(!tx)return send(res,404,{error:'Transaction not found'});
   if(Number(tx.chainId)!==56)return send(res,400,{error:'Transaction is not on BNB Smart Chain Mainnet'});
   if(tx.to?.toLowerCase()!==TREASURY.toLowerCase())return send(res,400,{error:'Transaction recipient does not match the official Tochika treasury'});
   if(tx.from.toLowerCase()!==buyer.toLowerCase())return send(res,400,{error:'Connected buyer does not match transaction sender'});
   if(tx.value<=0n)return send(res,400,{error:'Transaction contains no BNB payment'});
   const confirmations=await provider.getBlockNumber()-receipt.blockNumber+1;if(confirmations<1)return send(res,409,{error:'Waiting for confirmation'});
   const bnb=Number(ethers.formatEther(tx.value));const quote=await getQuote();const usd=bnb*quote;const tka=usd/PRICE_USD;
   if(!Number.isFinite(tka)||tka<=0)return send(res,400,{error:'Unable to calculate token allocation'});
   const sold=rows.reduce((a,x)=>a+Number(x.tka),0);if(sold+tka>SALE_CAP_TKA)return send(res,409,{error:'This payment would exceed the configured 20 million TKA allocation. Contact support before making another payment.'});
   const block=await provider.getBlock(receipt.blockNumber);
   const row={txHash,buyer:ethers.getAddress(buyer),bnb:bnb.toString(),bnbUsd:quote,usdValue:usd,tka,blockNumber:receipt.blockNumber,blockTimestamp:block?.timestamp||null,confirmations,createdAt:new Date().toISOString(),status:'verified'};
   rows.push(row);await writeDb(rows);return send(res,201,row);
  }
  return send(res,404,{error:'Not found'});
 }catch(e){console.error(e);return send(res,500,{error:e.message||'Internal server error'});}
});
server.listen(PORT,()=>console.log(`Tochika payment verification API listening on :${PORT}`));
