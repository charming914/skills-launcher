/**
 * Generator: cover SVG placeholder.
 * Always deterministic — never calls LLM.
 */

/**
 * Build a simple colored card SVG using the skill's slug/name.
 * @param {object} ctx  { meta: skill.json object }
 * @returns {{ content: string, method: 'placeholder' }}
 */
function generate(ctx) {
  const { meta = {} } = ctx;
  const label = (meta.name || meta.slug || "SKILL").slice(0, 12).toUpperCase();
  const firstChar = label.charAt(0) || "S";

  // Pick a hue from the slug hash for variety
  let hue = 200;
  const slug = meta.slug || "";
  for (let i = 0; i < slug.length; i++) {
    hue = (hue + slug.charCodeAt(i) * 37) % 360;
  }
  const bg = `hsl(${hue}, 60%, 22%)`;
  const accent = `hsl(${hue}, 80%, 60%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <rect width="400" height="200" fill="${bg}" rx="12"/>
  <circle cx="200" cy="85" r="42" fill="${accent}" opacity="0.18"/>
  <text x="200" y="97" text-anchor="middle" font-family="monospace" font-size="52" font-weight="bold" fill="${accent}">${firstChar}</text>
  <text x="200" y="135" text-anchor="middle" font-family="monospace" font-size="13" fill="${accent}" opacity="0.7" letter-spacing="3">${label}</text>
  <text x="200" y="172" text-anchor="middle" font-family="sans-serif" font-size="10" fill="white" opacity="0.3">AI SKILL STORE</text>
</svg>`;

  return { content: svg, method: "placeholder" };
}

module.exports = { generate };
