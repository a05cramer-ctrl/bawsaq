// Uploads coin metadata + image to pump.fun's IPFS endpoint (browser can't call it directly: CORS).
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { name, symbol, description, website, twitter, telegram, image } = b;
    if (!name || !symbol || !image) return res.status(400).json({ error: "name, symbol and image are required" });
    const m = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(image);
    if (!m) return res.status(400).json({ error: "image must be a png/jpeg/gif/webp data URL" });
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 4_000_000) return res.status(400).json({ error: "image too large (max 4 MB)" });
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: m[1] }), "image." + (m[2] === "jpeg" ? "jpg" : m[2]));
    fd.append("name", String(name).slice(0, 32));
    fd.append("symbol", String(symbol).slice(0, 10));
    fd.append("description", String(description || "").slice(0, 500));
    if (website) fd.append("website", String(website));
    if (twitter) fd.append("twitter", String(twitter));
    if (telegram) fd.append("telegram", String(telegram));
    fd.append("showName", "true");
    const r = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: fd });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { return res.status(502).json({ error: "pump.fun IPFS returned " + r.status, detail: text.slice(0, 200) }); }
    if (!r.ok || !j.metadataUri) return res.status(502).json({ error: "pump.fun IPFS upload failed", detail: j });
    res.status(200).json({ metadataUri: j.metadataUri, metadata: j.metadata || null });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
