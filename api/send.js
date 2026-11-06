// Sends a fully signed transaction to Solana mainnet and returns the signature.
// Uses HELIUS_API_KEY (Vercel env var) when set, otherwise the public mainnet RPC.
const RPC = () => process.env.HELIUS_API_KEY
  ? "https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY
  : "https://api.mainnet-beta.solana.com";
async function rpc(method, params) {
  const r = await fetch(RPC(), { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return r.json();
}
module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const sig = String(req.query.sig || "");
      if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) return res.status(400).json({ error: "bad sig" });
      const j = await rpc("getSignatureStatuses", [[sig], { searchTransactionHistory: true }]);
      const s = j.result && j.result.value && j.result.value[0];
      return res.status(200).json({ status: s ? (s.err ? "failed" : s.confirmationStatus) : "pending", err: s && s.err || null });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "GET or POST" });
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (Array.isArray(b.alts)) {
      // Lookup-table accounts for a transaction the browser needs to decompile.
      const keys = b.alts.filter(k => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(k)).slice(0, 8);
      const r = await rpc("getMultipleAccounts", [keys, { encoding: "base64", commitment: "confirmed" }]);
      if (r.error) return res.status(502).json({ error: r.error.message || "rpc error" });
      const accounts = (r.result && r.result.value || []).map((a, i) => ({ key: keys[i], data: a ? a.data[0] : null }));
      if (accounts.some(a => !a.data)) return res.status(502).json({ error: "lookup table not found" });
      return res.status(200).json({ accounts });
    }
    if (!b.tx) return res.status(400).json({ error: "tx required" });
    const j = await rpc("sendTransaction", [b.tx, { encoding: "base64", skipPreflight: false, maxRetries: 5, preflightCommitment: "confirmed" }]);
    if (j.error) return res.status(400).json({ error: j.error.message || "send failed", logs: j.error.data && j.error.data.logs ? j.error.data.logs.slice(-6) : null });
    res.status(200).json({ signature: j.result });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
