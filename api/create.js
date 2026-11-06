// Builds an unsigned pump.fun create (+ optional dev buy) transaction via PumpPortal's local-transaction API.
// The user's wallet and the browser-generated mint keypair sign it client-side; no keys touch this server.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { publicKey, mint, name, symbol, uri, amount } = b;
    const b58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!b58.test(publicKey || "") || !b58.test(mint || "")) return res.status(400).json({ error: "bad publicKey or mint" });
    if (!name || !symbol || !uri) return res.status(400).json({ error: "name, symbol and uri are required" });
    const sol = Math.max(0, Math.min(10, Number(amount) || 0));
    const r = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey, action: "create",
        tokenMetadata: { name: String(name).slice(0, 32), symbol: String(symbol).slice(0, 10), uri },
        mint, denominatedInSol: "true", amount: sol, slippage: 10, priorityFee: 0.0005, pool: "pump"
      })
    });
    if (r.status !== 200) {
      const t = await r.text();
      return res.status(502).json({ error: "PumpPortal returned " + r.status, detail: t.slice(0, 300) });
    }
    const tx = Buffer.from(await r.arrayBuffer()).toString("base64");
    res.status(200).json({ tx });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
