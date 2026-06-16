const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function fetchRecipe(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const ld = extractRecipeJsonLd(html);
  if (!ld) throw new Error('No Recipe JSON-LD found on page');
  return normalizeRecipe(ld, url);
}

function extractRecipeJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const recipe = findRecipeNode(data);
    if (recipe) return recipe;
  }
  return null;
}

function findRecipeNode(node) {
  if (!node || typeof node !== 'object') return null;
  if ([].concat(node['@type'] || []).includes('Recipe')) return node;
  if (Array.isArray(node['@graph'])) {
    for (const n of node['@graph']) {
      const r = findRecipeNode(n);
      if (r) return r;
    }
  }
  return null;
}

function normalizeRecipe(ld, url) {
  return {
    url,
    name: ld.name || '',
    description: ld.description || '',
    recipeIngredient: [].concat(ld.recipeIngredient || []),
    recipeInstructions: extractSteps(ld.recipeInstructions),
    prepTime: parseDuration(ld.prepTime),
    cookTime: parseDuration(ld.cookTime),
    totalTime: parseDuration(ld.totalTime),
    recipeYield: [].concat(ld.recipeYield || []).join(' '),
    image: extractImage(ld.image),
    author: extractAuthor(ld.author),
  };
}

function extractSteps(instructions) {
  if (!instructions) return [];
  const items = Array.isArray(instructions) ? instructions : [instructions];
  const steps = [];
  for (const item of items) {
    if (typeof item === 'string') {
      steps.push(item.trim());
    } else if (item?.['@type'] === 'HowToStep') {
      const text = (item.text || item.name || '').trim();
      if (text) steps.push(text);
    } else if (item?.['@type'] === 'HowToSection') {
      for (const sub of [].concat(item.itemListElement || [])) {
        const text = (sub.text || sub.name || '').trim();
        if (text) steps.push(text);
      }
    }
  }
  return steps.filter(Boolean);
}

function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const h = parseInt(m[1] || 0);
  const min = parseInt(m[2] || 0);
  if (h && min) return `${h}h ${min}m`;
  if (h) return `${h}h`;
  return min ? `${min} min` : null;
}

function extractImage(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return extractImage(img[0]);
  return img.url || null;
}

function extractAuthor(author) {
  if (!author) return null;
  if (typeof author === 'string') return author;
  if (Array.isArray(author)) return extractAuthor(author[0]);
  return author.name || null;
}

export async function analyzeWithAI(recipe) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const ingredients = recipe.recipeIngredient.join('\n');
  const steps = recipe.recipeInstructions.join('\n');

  const prompt = `Recipe: ${recipe.name}

Ingredients:
${ingredients}

Steps:
${steps}

Respond with only valid JSON (no markdown fences):
{
  "cliffNotes": "one sentence describing the core technique or approach — skip all marketing language, focus on what makes this dish work",
  "keyTips": ["specific actionable tip that most affects whether this comes out well — 3 to 4 tips total"]
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Unexpected AI response: ${text.slice(0, 100)}`);
  return JSON.parse(match[0]);
}
