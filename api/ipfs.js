// Uploads the coin image + metadata JSON to IPFS through Filebase (FILEBASE_IPFS_TOKEN, Vercel env var)
// and returns the metadata URI pump.fun's create instruction needs.
// pump.fun's own /api/ipfs sits behind a Cloudflare challenge and refuses server and cross-site calls.
const ADD = "https://rpc.filebase.io/api/v0/add?cid-version=1";
const GW = "https://ipfs.io/ipfs/";

async function add(token, blob, filename) {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const r = await fetch(ADD, { method: "POST", headers: { Authorization: "Bearer " + token }, body: fd });
  const t = await r.text();
  if (!r.ok) throw new Error("Filebase " + r.status + ": " + t.slice(0, 160));
  const line = t.trim().split("\n").pop();
  const j = JSON.parse(line);
  if (!j.Hash) throw new Error("Filebase returned no CID");
  return j.Hash;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const token = process.env.FILEBASE_IPFS_TOKEN;
  if (!token) return res.status(503).json({ error: "Image upload isn't set up yet: add FILEBASE_IPFS_TOKEN in the Vercel project settings." });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { name, symbol, description, website, twitter, telegram, image } = b;
    if (!name || !symbol || !image) return res.status(400).json({ error: "name, symbol and image are required" });
    const m = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(image);
    if (!m) return res.status(400).json({ error: "image must be a png/jpeg/gif/webp data URL" });
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 4_000_000) return res.status(400).json({ error: "image too large (max 4 MB)" });

    const imgCid = await add(token, new Blob([buf], { type: m[1] }), "image." + (m[2] === "jpeg" ? "jpg" : m[2]));
    const meta = {
      name: String(name).slice(0, 32),
      symbol: String(symbol).slice(0, 10),
      description: String(description || "").slice(0, 500),
      image: GW + imgCid,
      showName: true,
      createdOn: "https://pump.fun"
    };
    if (website) meta.website = String(website);
    if (twitter) meta.twitter = String(twitter);
    if (telegram) meta.telegram = String(telegram);
    const metaCid = await add(token, new Blob([JSON.stringify(meta)], { type: "application/json" }), "metadata.json");
    res.status(200).json({ metadataUri: GW + metaCid, image: GW + imgCid });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
};
