// Token metadata for coins launched through BAWSAQ. pump.fun's create instruction stores this URL as the
// coin's metadata URI, so it must stay stable forever: everything is derived from the query string, no storage.
// GET /api/meta?c=<company-slug>&s=<TICKER>[&x=<x handle>]
const COMPANIES = {
  "sprunk": "Sprunk", "ecola": "eCola", "pisswasser": "Pisswasser", "cluckin-bell": "Cluckin' Bell",
  "burger-shot": "Burger Shot", "up-n-atom": "Up-n-Atom", "bean-machine": "Bean Machine", "ammu-nation": "Ammu-Nation",
  "lifeinvader": "Lifeinvader", "weazel-news": "Weazel News", "vapid": "Vapid", "maze-bank": "Maze Bank",
  "fleeca": "Fleeca", "flyus": "FlyUS", "redwood": "Redwood", "merryweather": "Merryweather"
};
const SITE = "https://bawsaq.vercel.app";

module.exports = (req, res) => {
  const c = String(req.query.c || "");
  const name = COMPANIES[c];
  const symbol = String(req.query.s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const x = String(req.query.x || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
  if (!name || !symbol) return res.status(404).json({ error: "unknown company or ticker" });
  const meta = {
    name,
    symbol,
    description: name + " on BAWSAQ, GTA VI's stock market. Launched through bawsaq.vercel.app; the first BAWSAQ launch of " + name + " owns the listing.",
    image: SITE + "/items/" + c + ".png",
    showName: true,
    createdOn: "https://pump.fun",
    website: SITE
  };
  if (x) meta.twitter = "https://x.com/" + x;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  res.status(200).json(meta);
};
