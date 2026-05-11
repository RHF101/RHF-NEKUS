// ============================================================
//  NEXUS — Multi-AI Orchestrator  |  app.js
//  Koordinasi semua AI: routing, cross-check, auto-repair
// ============================================================

// ── AI DEFINITIONS ──────────────────────────────────────────
const AI_PROVIDERS = [
  {
    id: 'claude',
    name: 'Claude',
    label: 'CERE',       // display prefix from screenshot
    color: '#d4a843',
    badge: 'SONNET',
    vision: true,
    coding: 10,
    chat: 9,
    endpoint: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    label: 'OPEN',
    color: '#10a37f',
    badge: 'GPT-4o',
    vision: true,
    coding: 10,
    chat: 9,
    endpoint: 'openai',
    model: 'gpt-4o',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    label: 'GEMI',
    color: '#4285f4',
    badge: '1.5PRO',
    vision: true,
    coding: 9,
    chat: 9,
    endpoint: 'gemini',
    model: 'gemini-1.5-pro',
  },
  {
    id: 'groq',
    name: 'Groq',
    label: 'GROQ',
    color: '#f55036',
    badge: 'LLAMA3',
    vision: false,
    coding: 8,
    chat: 9,
    endpoint: 'groq',
    model: 'llama3-70b-8192',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    label: 'DEEP',
    color: '#5b8dee',
    badge: 'V3',
    vision: false,
    coding: 10,
    chat: 8,
    endpoint: 'openai_compat',
    base_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    label: 'MIST',
    color: '#ff7000',
    badge: 'LARGE',
    vision: false,
    coding: 8,
    chat: 8,
    endpoint: 'openai_compat',
    base_url: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
  },
  {
    id: 'together',
    name: 'Together',
    label: 'TOGE',
    color: '#7c3aed',
    badge: 'MIX8X22',
    vision: false,
    coding: 8,
    chat: 8,
    endpoint: 'openai_compat',
    base_url: 'https://api.together.xyz/v1',
    model: 'mistralai/Mixtral-8x22B-Instruct-v0.1',
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    label: 'FIRE',
    color: '#ff4d4d',
    badge: 'LLAMA3',
    vision: false,
    coding: 8,
    chat: 8,
    endpoint: 'openai_compat',
    base_url: 'https://api.fireworks.ai/inference/v1',
    model: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    label: 'NVID',
    color: '#76b900',
    badge: 'NIM',
    vision: false,
    coding: 8,
    chat: 7,
    endpoint: 'openai_compat',
    base_url: 'https://integrate.api.nvidia.com/v1',
    model: 'meta/llama-3.1-70b-instruct',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    label: 'CERE',
    color: '#00bcd4',
    badge: 'CS3',
    vision: false,
    coding: 8,
    chat: 8,
    endpoint: 'openai_compat',
    base_url: 'https://api.cerebras.ai/v1',
    model: 'llama3.1-70b',
  },
];

// ── STATE ────────────────────────────────────────────────────
let state = {
  mode: 'auto',           // auto | code | chat | vision
  messages: [],           // full conversation history
  sessions: [],           // saved sessions
  currentSession: null,
  uploadedImages: [],     // {name, base64, mimeType}
  apiKeys: {},            // {providerId: 'sk-...'}
  isGenerating: false,
  previewCode: '',
};

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  renderAIStack();
  renderApiKeyInputs();
  updateActiveAIDisplay();
  updateFooterAI();
  createToast();
});

function loadFromStorage() {
  try {
    const keys = localStorage.getItem('nexus_api_keys');
    if (keys) state.apiKeys = JSON.parse(keys);
    const sessions = localStorage.getItem('nexus_sessions');
    if (sessions) state.sessions = JSON.parse(sessions);
    renderSessionHistory();
  } catch (e) { /* ignore */ }
}

function saveToStorage() {
  try {
    localStorage.setItem('nexus_api_keys', JSON.stringify(state.apiKeys));
    localStorage.setItem('nexus_sessions', JSON.stringify(state.sessions.slice(-30)));
  } catch (e) { /* ignore */ }
}

// ── RENDER AI STACK ──────────────────────────────────────────
function renderAIStack() {
  const el = document.getElementById('ai-stack-list');
  el.innerHTML = '';
  AI_PROVIDERS.forEach(ai => {
    const hasKey = !!state.apiKeys[ai.id];
    const div = document.createElement('div');
    div.className = `ai-item ${hasKey ? '' : 'offline'}`;
    div.id = `ai-item-${ai.id}`;
    div.innerHTML = `
      <span class="ai-dot ${hasKey ? 'online' : 'offline'}"></span>
      <span class="ai-name">${ai.name}</span>
      <span class="ai-badge">${ai.badge}</span>
    `;
    el.appendChild(div);
  });
}

// ── MODE ─────────────────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  const labels = { auto: '⚡ Auto Mode', code: '</> Code Mode', chat: '💬 Chat Mode', vision: '👁 Vision Mode' };
  document.getElementById('mode-label').textContent = labels[mode] || '⚡ Auto Mode';
  updateFooterAI();
}

// ── DETECT MODE FROM PROMPT ──────────────────────────────────
function detectMode(text) {
  if (state.mode !== 'auto') return state.mode;
  if (state.uploadedImages.length > 0) return 'vision';
  const codeKw = /\b(code|kode|buat|tulis|write|create|function|class|api|script|html|css|js|javascript|python|php|golang|rust|react|vue|backend|frontend|database|sql|query|loop|array|object|fix|debug|error|bug|refactor|implement|algoritma|program|aplikasi|website|web)\b/i;
  const chatKw = /\b(apa|siapa|kenapa|mengapa|bagaimana|kapan|dimana|jelaskan|explain|cerita|what|who|why|how|when|where|tell|describe)\b/i;
  if (codeKw.test(text)) return 'code';
  if (chatKw.test(text)) return 'chat';
  return text.length > 120 ? 'code' : 'chat';
}

// ── SELECT BEST AI FOR TASK ──────────────────────────────────
function pickBestAI(mode, requireVision = false) {
  const available = AI_PROVIDERS.filter(ai => {
    if (!state.apiKeys[ai.id]) return false;
    if (requireVision && !ai.vision) return false;
    return true;
  });
  if (available.length === 0) return null;
  if (mode === 'code') return available.sort((a, b) => b.coding - a.coding)[0];
  if (mode === 'vision') return available.filter(a => a.vision).sort((a, b) => b.coding - a.coding)[0] || available[0];
  return available.sort((a, b) => b.chat - a.chat)[0];
}

function pickSecondaryAI(primaryId, mode) {
  const available = AI_PROVIDERS.filter(ai => ai.id !== primaryId && !!state.apiKeys[ai.id]);
  if (available.length === 0) return null;
  if (mode === 'code') return available.sort((a, b) => b.coding - a.coding)[0];
  return available.sort((a, b) => b.chat - a.chat)[0];
}

function getAvailableCount() {
  return AI_PROVIDERS.filter(ai => !!state.apiKeys[ai.id]).length;
}

// ── SEND MESSAGE ─────────────────────────────────────────────
async function sendMessage() {
  if (state.isGenerating) return;
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text && state.uploadedImages.length === 0) return;

  const effectiveMode = detectMode(text);
  const primary = pickBestAI(effectiveMode, state.uploadedImages.length > 0);

  if (!primary) {
    showToast('⚠ Tambahkan API key dulu di Settings!');
    openSettings();
    return;
  }

  const userMsg = {
    role: 'user',
    text,
    images: [...state.uploadedImages],
    time: Date.now(),
  };
  state.messages.push(userMsg);

  appendUserMessage(userMsg);
  clearImages();
  input.value = '';
  autoResize(input);
  hideWelcome();

  state.isGenerating = true;
  setSendBtn(true);

  const thinkId = appendThinking(primary);
  const crossCheck = document.getElementById('toggle-crosscheck')?.checked;
  const autoRepair = document.getElementById('toggle-repair')?.checked;
  const multiAI    = document.getElementById('toggle-multi')?.checked;

  try {
    // ── STEP 1: Primary AI call ─────────────────────────────
    let primaryResult = await callAI(primary, buildMessages(), effectiveMode);

    // ── STEP 2: Truncation check + repair ──────────────────
    if (autoRepair && isTruncated(primaryResult)) {
      updateThinking(thinkId, `🔧 ${primary.name} terpotong, memperbaiki...`);
      primaryResult = await repairTruncated(primary, primaryResult, buildMessages(), effectiveMode);
    }

    // ── STEP 3: Cross-check with secondary AI ──────────────
    let finalResult = primaryResult;
    let crossCheckNote = null;
    if (crossCheck && multiAI && effectiveMode === 'code') {
      const secondary = pickSecondaryAI(primary.id, effectiveMode);
      if (secondary) {
        updateThinking(thinkId, `🔍 ${secondary.name} mengecek hasil ${primary.name}...`);
        const review = await crossCheckCode(secondary, primaryResult, buildMessages());
        if (review && review.hasIssues) {
          updateThinking(thinkId, `🔧 ${secondary.name} memperbaiki...`);
          finalResult = review.fixed || primaryResult;
          crossCheckNote = `✅ Dicek & diperbaiki oleh ${secondary.name}`;
        } else {
          crossCheckNote = `✅ Diverifikasi oleh ${secondary.name}`;
        }
      }
    }

    removeThinking(thinkId);

    const assistantMsg = {
      role: 'assistant',
      text: finalResult,
      ai: primary.name,
      aiId: primary.id,
      mode: effectiveMode,
      crossCheck: crossCheckNote,
      time: Date.now(),
    };
    state.messages.push(assistantMsg);
    appendAssistantMessage(assistantMsg);

    // save session
    autosaveSession(text);

  } catch (err) {
    removeThinking(thinkId);
    appendError(err.message || 'Gagal memanggil AI. Cek API key di Settings.');
  }

  state.isGenerating = false;
  setSendBtn(false);
}

// ── BUILD MESSAGES FOR API ───────────────────────────────────
function buildMessages() {
  // last 30 turns to stay within context
  const recent = state.messages.slice(-30);
  return recent.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.text || '',
    images: m.images || [],
  }));
}

// ── CALL AI ──────────────────────────────────────────────────
async function callAI(ai, messages, mode, extraInstruction = '') {
  const key = state.apiKeys[ai.id];
  if (!key) throw new Error(`API key ${ai.name} tidak ditemukan.`);

  const systemPrompt = buildSystemPrompt(mode, extraInstruction);

  switch (ai.endpoint) {
    case 'anthropic': return await callAnthropic(ai, key, messages, systemPrompt);
    case 'openai':    return await callOpenAI(ai, key, messages, systemPrompt);
    case 'gemini':    return await callGemini(ai, key, messages, systemPrompt);
    case 'groq':      return await callGroq(ai, key, messages, systemPrompt);
    case 'openai_compat': return await callOpenAICompat(ai, key, messages, systemPrompt);
    default: throw new Error(`Endpoint tidak dikenal: ${ai.endpoint}`);
  }
}

// ── SYSTEM PROMPTS ───────────────────────────────────────────
function buildSystemPrompt(mode, extra = '') {
  const base = `Kamu adalah NEXUS, AI super canggih hasil orkestrasi multi-AI.
Kamu SANGAT pandai coding, debugging, dan menjelaskan teknis.
Selalu tulis kode yang lengkap, rapi, berindentasi benar, tidak terpotong.
Jika menulis kode panjang, pastikan SELURUH kode selesai hingga akhir tanpa memotong.`;

  const codeExtra = `
MODE: CODE — Prioritas adalah kode yang bersih, lengkap, dan berfungsi.
- Tulis kode LENGKAP dari awal hingga akhir, tidak boleh dipotong.
- Gunakan komentar yang jelas dan singkat.
- Jika kode panjang, tetap tulis semua tanpa menyingkat.
- Format: gunakan markdown code block dengan bahasa yang benar.`;

  const chatExtra = `
MODE: CHAT — Jawab singkat, padat, natural seperti manusia.
- Jangan terlalu panjang jika pertanyaannya sederhana.
- Bahasa santai tapi tetap akurat.
- Tidak perlu heading atau bullet yang berlebihan.`;

  if (mode === 'code') return base + codeExtra + (extra ? '\n' + extra : '');
  if (mode === 'chat') return base + chatExtra + (extra ? '\n' + extra : '');
  return base + (extra ? '\n' + extra : '');
}

// ── ANTHROPIC ────────────────────────────────────────────────
async function callAnthropic(ai, key, messages, system) {
  const formatted = messages.map(m => {
    if (m.role === 'user' && m.images && m.images.length > 0) {
      const content = [];
      m.images.forEach(img => {
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType, data: img.base64 } });
      });
      content.push({ type: 'text', text: m.content || '' });
      return { role: 'user', content };
    }
    return { role: m.role, content: m.content };
  });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ai.model,
      max_tokens: 8000,
      system,
      messages: formatted,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic error ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

// ── OPENAI ───────────────────────────────────────────────────
async function callOpenAI(ai, key, messages, system) {
  const formatted = [{ role: 'system', content: system }];
  messages.forEach(m => {
    if (m.role === 'user' && m.images && m.images.length > 0) {
      const content = [];
      m.images.forEach(img => {
        content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
      });
      content.push({ type: 'text', text: m.content || '' });
      formatted.push({ role: 'user', content });
    } else {
      formatted.push({ role: m.role, content: m.content });
    }
  });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: ai.model, messages: formatted, max_tokens: 8000 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI error ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── GEMINI ───────────────────────────────────────────────────
async function callGemini(ai, key, messages, system) {
  const contents = [];
  messages.forEach(m => {
    const parts = [];
    if (m.images && m.images.length > 0) {
      m.images.forEach(img => {
        parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
      });
    }
    parts.push({ text: m.content || '' });
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
  });

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: 8192 },
  };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ai.model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini error ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── GROQ ─────────────────────────────────────────────────────
async function callGroq(ai, key, messages, system) {
  const formatted = [
    { role: 'system', content: system },
    ...messages.map(m => ({ role: m.role, content: m.content || '' })),
  ];
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: ai.model, messages: formatted, max_tokens: 8000 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Groq error ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── OPENAI-COMPATIBLE (DeepSeek, Mistral, Together, Fireworks, NVIDIA, Cerebras) ──
async function callOpenAICompat(ai, key, messages, system) {
  const formatted = [
    { role: 'system', content: system },
    ...messages.map(m => ({ role: m.role, content: m.content || '' })),
  ];
  const res = await fetch(`${ai.base_url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: ai.model, messages: formatted, max_tokens: 8000 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${ai.name} error ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── TRUNCATION DETECTION ─────────────────────────────────────
function isTruncated(text) {
  if (!text || text.length < 100) return false;
  const trimmed = text.trimEnd();
  // Incomplete code block
  const openBlocks = (text.match(/```/g) || []).length;
  if (openBlocks % 2 !== 0) return true;
  // Ends mid-sentence without punctuation
  const lastChar = trimmed[trimmed.length - 1];
  if (!/[.!?`})\]"'`]/.test(lastChar)) return true;
  return false;
}

// ── AUTO-REPAIR TRUNCATED RESPONSE ──────────────────────────
async function repairTruncated(ai, partial, messages, mode) {
  const repairMessages = [
    ...messages,
    { role: 'assistant', content: partial },
    { role: 'user', content: 'Lanjutkan dan selesaikan respons di atas yang terpotong. Tulis hanya bagian lanjutannya saja tanpa mengulang bagian yang sudah ada.' },
  ];
  try {
    const continuation = await callAI(ai, repairMessages, mode);
    return partial + '\n' + continuation;
  } catch {
    return partial;
  }
}

// ── CROSS-CHECK CODE ─────────────────────────────────────────
async function crossCheckCode(secondaryAI, code, messages) {
  const checkMessages = [
    ...messages,
    { role: 'assistant', content: code },
    {
      role: 'user',
      content: `Review kode di atas. Cari bug, typo, syntax error, atau bagian yang tidak lengkap.
Jika ada masalah: tulis kode yang sudah diperbaiki secara LENGKAP.
Jika tidak ada masalah: balas hanya dengan kata "OK".
Format respons hanya kode atau "OK", tanpa penjelasan tambahan.`,
    },
  ];
  try {
    const result = await callAI(secondaryAI, checkMessages, 'code',
      'Kamu adalah code reviewer yang sangat teliti. Cari bug dan perbaiki. Jika tidak ada bug, balas OK.');
    const hasIssues = result.trim() !== 'OK' && result.trim().length > 10;
    return { hasIssues, fixed: hasIssues ? result : null };
  } catch {
    return { hasIssues: false, fixed: null };
  }
}

// ── RENDER MESSAGES ──────────────────────────────────────────
function appendUserMessage(msg) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg user';
  const imagesHTML = msg.images && msg.images.length > 0
    ? `<div class="uploaded-images-preview">${msg.images.map(i =>
        `<img class="uploaded-img-thumb" src="data:${i.mimeType};base64,${i.base64}" alt="${i.name}">`
      ).join('')}</div>`
    : '';
  div.innerHTML = `
    <div class="msg-avatar">U</div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name">You</span>
        <span class="msg-time">${formatTime(msg.time)}</span>
      </div>
      <div class="msg-content">${escapeHtml(msg.text)}${imagesHTML}</div>
    </div>
  `;
  container.appendChild(div);
  container.classList.add('visible');
  scrollToBottom();
}

function appendAssistantMessage(msg) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  const ai = AI_PROVIDERS.find(a => a.id === msg.aiId);
  const aiColor = ai ? ai.color : '#6c63ff';

  const orchBar = msg.crossCheck
    ? `<div class="orchestration-bar">
        <span class="orch-step done">✓ Generated</span>
        <span class="orch-sep">→</span>
        <span class="orch-step done">✓ Cross-Checked</span>
        <span class="repair-badge">${msg.crossCheck}</span>
      </div>`
    : '';

  div.innerHTML = `
    <div class="msg-avatar" style="font-size:18px">🤖</div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name" style="color:${aiColor}">${msg.ai}</span>
        <span class="msg-ai-tag">${msg.mode?.toUpperCase() || 'AUTO'}</span>
        <span class="msg-time">${formatTime(msg.time)}</span>
      </div>
      ${orchBar}
      <div class="msg-content">${renderMarkdown(msg.text)}</div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

function appendThinking(ai) {
  const id = 'think-' + Date.now();
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant thinking-msg';
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar" style="font-size:18px">🤖</div>
    <div class="msg-body">
      <div class="msg-meta">
        <span class="msg-name" style="color:${AI_PROVIDERS.find(a=>a.id===ai.id)?.color||'#6c63ff'}">${ai.name}</span>
      </div>
      <div class="msg-content">
        <div class="thinking-dots"><span></span><span></span><span></span></div>
        <span id="${id}-text">Sedang memproses...</span>
      </div>
    </div>
  `;
  container.appendChild(div);
  container.classList.add('visible');
  scrollToBottom();
  return id;
}

function updateThinking(id, text) {
  const el = document.getElementById(`${id}-text`);
  if (el) el.textContent = text;
}

function removeThinking(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendError(msg) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.innerHTML = `
    <div class="msg-avatar">⚠</div>
    <div class="msg-body">
      <div class="msg-meta"><span class="msg-name" style="color:#ff6b6b">Error</span></div>
      <div class="msg-content" style="color:#ff6b6b;font-family:var(--font-mono);font-size:13px">${escapeHtml(msg)}</div>
    </div>
  `;
  container.appendChild(div);
  scrollToBottom();
}

// ── MARKDOWN RENDERER ────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // fenced code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = 'code-' + Math.random().toString(36).slice(2, 8);
    const rawCode = unescapeHtml(code);
    state._codeBlocks = state._codeBlocks || {};
    state._codeBlocks[id] = rawCode;
    return `<pre>
      <div class="code-header">
        <span class="code-lang">${lang || 'code'}</span>
        <div class="code-actions">
          <button class="code-btn" onclick="copyCode('${id}')">📋 Copy</button>
          <button class="code-btn" onclick="downloadCode('${id}','${lang||'txt'}')">⬇ Download</button>
          ${lang === 'html' || lang === 'javascript' || lang === 'js' ? `<button class="code-btn" onclick="previewCode('${id}')">👁 Preview</button>` : ''}
        </div>
      </div><code>${code.trimEnd()}</code></pre>`;
  });

  // inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // heading
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // hr
  html = html.replace(/^---$/gm, '<hr>');
  // unordered list
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`);
  // ordered list
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p>\s*(<(?:pre|ul|ol|h[123]|hr|blockquote))/g, '$1');
  html = html.replace(/(<\/(?:pre|ul|ol|h[123]|hr|blockquote)>)\s*<\/p>/g, '$1');
  html = html.replace(/\n/g, '<br>');

  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

// ── CODE ACTIONS ─────────────────────────────────────────────
function copyCode(id) {
  const code = state._codeBlocks?.[id];
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => showToast('✅ Code disalin!')).catch(() => showToast('❌ Gagal menyalin'));
}

function downloadCode(id, lang) {
  const code = state._codeBlocks?.[id];
  if (!code) return;
  const extMap = { js: 'js', javascript: 'js', html: 'html', css: 'css', python: 'py', py: 'py', ts: 'ts', typescript: 'ts', php: 'php', go: 'go', rust: 'rs', java: 'java', cpp: 'cpp', c: 'c', sql: 'sql', json: 'json', yaml: 'yaml', sh: 'sh', bash: 'sh' };
  const ext = extMap[lang.toLowerCase()] || 'txt';
  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `nexus-code.${ext}`;
  a.click(); URL.revokeObjectURL(url);
  showToast('⬇ File didownload!');
}

function previewCode(id) {
  const code = state._codeBlocks?.[id];
  if (!code) return;
  state.previewCode = code;
  document.getElementById('preview-iframe').srcdoc = code;
  document.getElementById('preview-code-text').textContent = code;
  document.getElementById('preview-modal').style.display = '';
  switchPreviewTab('preview');
}

function closePreview() { document.getElementById('preview-modal').style.display = 'none'; }

function switchPreviewTab(tab) {
  document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(tab)));
  document.getElementById('preview-content').style.display = tab === 'preview' ? '' : 'none';
  document.getElementById('preview-code-view').style.display = tab === 'code' ? '' : 'none';
}

// ── IMAGE UPLOAD ─────────────────────────────────────────────
function handleImageUpload(e) {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => {
      const base64 = ev.target.result.split(',')[1];
      state.uploadedImages.push({ name: file.name, base64, mimeType: file.type });
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function renderImagePreviews() {
  const bar = document.getElementById('image-preview-bar');
  const list = document.getElementById('image-preview-list');
  if (state.uploadedImages.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  list.innerHTML = state.uploadedImages.map((img, i) =>
    `<div class="preview-img-chip">📎 ${img.name} <span style="cursor:pointer;color:var(--accent2)" onclick="removeImage(${i})">✕</span></div>`
  ).join('');
}

function removeImage(i) { state.uploadedImages.splice(i, 1); renderImagePreviews(); }
function clearImages() { state.uploadedImages = []; renderImagePreviews(); }

// ── SESSION / HISTORY ────────────────────────────────────────
function autosaveSession(firstLine) {
  if (!state.currentSession) {
    state.currentSession = { id: Date.now(), title: firstLine.slice(0, 50), messages: [] };
    state.sessions.unshift(state.currentSession);
  }
  state.currentSession.messages = [...state.messages];
  saveToStorage();
  renderSessionHistory();
}

function renderSessionHistory() {
  const el = document.getElementById('chat-history-list');
  if (state.sessions.length === 0) {
    el.innerHTML = '<div class="history-empty">No sessions yet</div>';
    return;
  }
  el.innerHTML = state.sessions.slice(0, 20).map(s =>
    `<div class="history-item" onclick="loadSession('${s.id}')" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</div>`
  ).join('');
}

function loadSession(id) {
  const session = state.sessions.find(s => s.id == id);
  if (!session) return;
  state.currentSession = session;
  state.messages = [...session.messages];
  const msgs = document.getElementById('messages');
  msgs.innerHTML = '';
  msgs.classList.remove('visible');
  hideWelcome();
  state.messages.forEach(m => {
    if (m.role === 'user') appendUserMessage(m);
    else appendAssistantMessage(m);
  });
  if (window.innerWidth < 641) toggleSidebar();
}

function newChat() {
  state.currentSession = null;
  state.messages = [];
  state.uploadedImages = [];
  const msgs = document.getElementById('messages');
  msgs.innerHTML = '';
  msgs.classList.remove('visible');
  document.getElementById('welcome-screen').style.display = '';
  clearImages();
  showToast('✨ Sesi baru dimulai');
}

function clearChat() {
  state.messages = [];
  const msgs = document.getElementById('messages');
  msgs.innerHTML = '';
  msgs.classList.remove('visible');
  document.getElementById('welcome-screen').style.display = '';
}

function exportChat() {
  if (state.messages.length === 0) { showToast('Tidak ada pesan untuk diekspor'); return; }
  const text = state.messages.map(m => `[${m.role.toUpperCase()}${m.ai ? ' / ' + m.ai : ''}]\n${m.text}\n`).join('\n---\n\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'nexus-chat.txt';
  a.click(); URL.revokeObjectURL(url);
  showToast('⬇ Chat diekspor!');
}

// ── SETTINGS ─────────────────────────────────────────────────
function renderApiKeyInputs() {
  const container = document.getElementById('api-key-inputs');
  container.innerHTML = AI_PROVIDERS.map(ai => `
    <div class="api-key-row">
      <div class="api-key-label">
        <span class="ai-color-dot" style="background:${ai.color}"></span>
        ${ai.name} <span style="color:var(--text-faint);font-size:9px;margin-left:4px">(${ai.badge})</span>
      </div>
      <div class="api-key-input-wrap">
        <input
          type="password"
          class="api-key-input ${state.apiKeys[ai.id] ? 'has-key' : ''}"
          id="key-${ai.id}"
          placeholder="Enter ${ai.name} API key..."
          value="${state.apiKeys[ai.id] || ''}"
        >
        <button class="api-key-toggle" onclick="toggleKeyVisibility('key-${ai.id}')">👁</button>
      </div>
    </div>
  `).join('');
}

function toggleKeyVisibility(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function saveSettings() {
  AI_PROVIDERS.forEach(ai => {
    const el = document.getElementById(`key-${ai.id}`);
    if (el) {
      const val = el.value.trim();
      if (val) state.apiKeys[ai.id] = val;
      else delete state.apiKeys[ai.id];
    }
  });
  saveToStorage();
  renderAIStack();
  updateActiveAIDisplay();
  updateFooterAI();
  closeSettings();
  showToast(`✅ ${Object.keys(state.apiKeys).length} API key disimpan!`);
}

function clearAllKeys() {
  if (!confirm('Hapus semua API key?')) return;
  state.apiKeys = {};
  saveToStorage();
  renderApiKeyInputs();
  renderAIStack();
  updateFooterAI();
  showToast('🗑 Semua API key dihapus');
}

function openSettings() {
  renderApiKeyInputs();
  document.getElementById('settings-modal').style.display = '';
}

function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }

// ── UI HELPERS ───────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function hideWelcome() {
  document.getElementById('welcome-screen').style.display = 'none';
}

function scrollToBottom() {
  const area = document.getElementById('chat-area');
  area.scrollTop = area.scrollHeight;
}

function setSendBtn(disabled) {
  const btn = document.getElementById('send-btn');
  const icon = document.getElementById('send-icon');
  btn.disabled = disabled;
  icon.textContent = disabled ? '⏳' : '▶';
}

function updateActiveAIDisplay() {
  const el = document.getElementById('active-ais-display');
  const available = AI_PROVIDERS.filter(ai => state.apiKeys[ai.id]);
  el.innerHTML = available.slice(0, 5).map(ai =>
    `<span class="active-ai-chip" style="border-color:${ai.color}40;color:${ai.color}">${ai.name}</span>`
  ).join('');
}

function updateFooterAI() {
  const mode = state.mode === 'auto' ? 'code' : state.mode;
  const primary = pickBestAI(mode, false);
  const el = document.getElementById('current-ai-display');
  if (primary) {
    const ai = AI_PROVIDERS.find(a => a.id === primary.id);
    el.textContent = `⚡ ${primary.name} (${getAvailableCount()} AI aktif)`;
    el.style.color = ai?.color || 'var(--accent)';
  } else {
    el.textContent = 'No AI — Tambah API key!';
    el.style.color = 'var(--accent2)';
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  // count rough tokens
  const tokens = Math.round(el.value.length / 4);
  document.getElementById('token-count').textContent = `~${tokens} tokens`;
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function quickPrompt(text) {
  document.getElementById('user-input').value = text;
  autoResize(document.getElementById('user-input'));
  sendMessage();
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// ── TOAST ─────────────────────────────────────────────────────
function createToast() {
  if (!document.getElementById('toast')) {
    const t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
}

let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettings(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newChat(); }
  if (e.key === 'Escape') { closeSettings(); closePreview(); }
});
