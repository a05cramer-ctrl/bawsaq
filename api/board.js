// BAWSAQ board: only coins launched through bawsaq are listed.
// Every site launch adds a 0-lamport transfer to REGISTRY plus a memo "BAWSAQ|<Company>|<mint>"
// in the same transaction that creates the coin on pump.fun. This function reads the registry's
// history, keeps valid launches (tx succeeded, pump.fun program called, mint signed the tx),
// takes the earliest per company, then adds market data from DexScreener.
const REGISTRY = process.env.BAWSAQ_REGISTRY || "5TdhNZbewnS1q46pica2j2UvERavTjpd1mi87waJTRKS";
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const COMPANIES = ["Sprunk","eCola","Pisswasser","Cluckin' Bell","Burger Shot","Up-n-Atom","Bean Machine","Ammu-Nation","Lifeinvader","Weazel News","Vapid","Maze Bank","Fleeca","FlyUS","Redwood","Merryweather"];
const RPC = () => process.env.HELIUS_API_KEY
  ? "https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY
  : "https://api.mainnet-beta.solana.com";
const cache = globalThis.__bawsaqTx || (globalThis.__bawsaqTx = new Map()); // sig -> parsed launch|null (immutable once final)

async function rpc(method, params) {
  const r = await fetch(RPC(), { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(method + ": " + (j.error.message || "rpc error"));
  return j.result;
}

function parseLaunch(tx, sig) {
  if (!tx || !tx.meta || tx.meta.err) return null;
  const msg = tx.transaction.message;
  const keys = msg.accountKeys.map(k => ({ pk: k.pubkey || k, signer: !!k.signer }));
  const memoIx = msg.instructions.find(i => (i.program === "spl-memo") && typeof i.parsed === "string" && i.parsed.startsWith("BAWSAQ|"));
  if (!memoIx) return null;
  const [, company, mint] = memoIx.parsed.split("|");
  if (!COMPANIES.includes(company)) return null;
  if (!msg.instructions.some(i => i.programId === PUMP)) return null;
  if (!keys.some(k => k.pk === mint && k.signer)) return null;
  const creator = keys[0] && keys[0].pk;
  return { company, mint, creator, sig, slot: tx.slot, time: (tx.blockTime || 0) * 1000 };
}

module.exports = async (req, res) => {
  try {
    // 1. registry history (newest first, up to 1000 launches)
    const sigs = await rpc("getSignaturesForAddress", [REGISTRY, { limit: 1000, commitment: "confirmed" }]);
    const launches = [];
    const todo = sigs.filter(s => !s.err && !cache.has(s.signature));
    for (let i = 0; i < todo.length; i += 8) {
      await Promise.all(todo.slice(i, i + 8).map(async s => {
        try {
          const tx = await rpc("getTransaction", [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
          cache.set(s.signature, parseLaunch(tx, s.signature));
        } catch (_) { /* retry next request */ }
      }));
    }
    for (const s of sigs) { const l = cache.get(s.signature); if (l) launches.push(l); }
    // 2. earliest valid launch per company owns it
    const owner = {};
    for (const l of launches.sort((a, b) => a.slot - b.slot)) if (!owner[l.company]) owner[l.company] = l;
    const listed = Object.values(owner);
    // 3. market data
    const market = {};
    for (let i = 0; i < listed.length; i += 30) {
      const ids = listed.slice(i, i + 30).map(l => l.mint).join(",");
      try {
        const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + ids);
        const pairs = await r.json();
        for (const p of Array.isArray(pairs) ? pairs : []) {
          const a = p.baseToken && p.baseToken.address; if (!a) continue;
          const mc = p.marketCap || p.fdv || 0; const cur = market[a];
          if (!cur || mc > cur.mc) market[a] = { mc, ch: p.priceChange && p.priceChange.h24 != null ? p.priceChange.h24 : null,
            v: (p.volume && p.volume.h24) || 0, sym: (p.baseToken.symbol || "").trim(), img: (p.info && p.info.imageUrl) || "" };
        }
      } catch (_) {}
    }
    const out = listed.map(l => ({ ...l, ...(market[l.mint] || {}) }));
    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");
    res.status(200).json({ registry: REGISTRY, at: Date.now(), launches: launches.length, listings: out });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
