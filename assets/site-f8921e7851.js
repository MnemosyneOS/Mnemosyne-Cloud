/* ============================================================================
   Mnemosyne OS — landing page runtime
   One file, no build step. Three systems live here:
     1. i18n      — an EN/ZH dictionary plus declarative [data-i18n] binding
     2. theme     — light / dark / system, persisted, pre-paint resolved
     3. content   — every list, table and card is rendered from data
   The page degrades: no canvas, no IntersectionObserver, no matchMedia and an
   offline GitHub API are all survivable.
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================= *
   *  1 · DICTIONARY                                                          *
   * ======================================================================= */

  var REPO = 'https://github.com/MnemosyneOS/mnemosyne';
  var DOCS = REPO + '/blob/main/README_CN.md';

  /* Code samples are language-independent on purpose: developers expect code,
     identifiers and shell commands in English even on a Chinese page. */
  var CODE_TABS = [
    { id: 'py',    name: 'Python SDK' },
    { id: 'mcp',   name: 'MCP Server' },
    { id: 'cli',   name: 'CLI' },
    { id: 'http',  name: 'HTTP API' }
  ];

  var CODE_PANES = {
    py: '<span class="tk-c"># pip install ai-memo-os   ·   core requires zero third-party deps</span>\n' +
        '<span class="tk-k">from</span> mnemosyne <span class="tk-k">import</span> <span class="tk-f">MemoryBrain</span>\n\n' +
        'brain <span class="tk-p">=</span> <span class="tk-f">MemoryBrain</span>(<span class="tk-s">"./my_memories"</span>, enable_embeddings<span class="tk-p">=</span><span class="tk-k">True</span>)\n' +
        'brain.<span class="tk-f">ensure_init</span>()\n\n' +
        '<span class="tk-c"># write a memory — fingerprint dedup, entity extraction, temporal chain</span>\n' +
        'brain.<span class="tk-f">retain</span>(<span class="tk-s">"his laptop is an ASUS VivoBook Pro 14 (M5450UA)"</span>, fast<span class="tk-p">=</span><span class="tk-k">True</span>)\n\n' +
        '<span class="tk-c"># sub-millisecond hybrid recall: vector + FTS5 + graph diffusion</span>\n' +
        'results <span class="tk-p">=</span> brain.<span class="tk-f">recall</span>(<span class="tk-s">"what are that machine\'s specs"</span>, k<span class="tk-p">=</span><span class="tk-n">5</span>)\n' +
        '<span class="tk-k">for</span> score, record, reasons <span class="tk-k">in</span> results:\n' +
        '    <span class="tk-f">print</span>(<span class="tk-s">f"{score:.4f} | {record[\'content\']}"</span>)\n\n' +
        '<span class="tk-c"># token-budgeted recall — only ship what earns its place in context</span>\n' +
        'results, cost <span class="tk-p">=</span> brain.<span class="tk-f">recall</span>(<span class="tk-s">"that machine\'s specs"</span>, k<span class="tk-p">=</span><span class="tk-n">5</span>, budget_tokens<span class="tk-p">=</span><span class="tk-n">100</span>)',

    mcp: '<span class="tk-c">// stdio is the native MCP transport — best compatibility, zero open ports</span>\n' +
         '<span class="tk-p">{</span>\n' +
         '  <span class="tk-s">"mcpServers"</span><span class="tk-p">:</span> <span class="tk-p">{</span>\n' +
         '    <span class="tk-s">"mnemosyne"</span><span class="tk-p">:</span> <span class="tk-p">{</span>\n' +
         '      <span class="tk-s">"command"</span><span class="tk-p">:</span> <span class="tk-s">"python"</span><span class="tk-p">,</span>\n' +
         '      <span class="tk-s">"args"</span><span class="tk-p">:</span> <span class="tk-p">[</span><span class="tk-s">"-m"</span><span class="tk-p">,</span> <span class="tk-s">"mnemosyne.webui.mcp_server"</span><span class="tk-p">,</span>\n' +
         '               <span class="tk-s">"--brain-dir"</span><span class="tk-p">,</span> <span class="tk-s">"./mem"</span><span class="tk-p">,</span>\n' +
         '               <span class="tk-s">"--namespace"</span><span class="tk-p">,</span> <span class="tk-s">"default"</span><span class="tk-p">],</span>\n' +
         '      <span class="tk-s">"env"</span><span class="tk-p">:</span> <span class="tk-p">{</span> <span class="tk-s">"MNEMOSYNE_MCP_TOKEN"</span><span class="tk-p">:</span> <span class="tk-s">"&lt;random 32+ chars&gt;"</span> <span class="tk-p">}</span>\n' +
         '    <span class="tk-p">}</span>\n' +
         '  <span class="tk-p">}</span>\n' +
         '<span class="tk-p">}</span>\n\n' +
         '<span class="tk-c">// 52 tools ship with the server — 41 native + 11 client-compatible:</span>\n' +
         '<span class="tk-c">//   core     retain · recall · forget · retain_batch (~15x faster)</span>\n' +
         '<span class="tk-c">//   compress consolidate · dedup · reflect · capsule · expand</span>\n' +
         '<span class="tk-c">//   graph    graph_query · temporal_query · recall_health</span>\n' +
         '<span class="tk-c">//   ops      stats · doctor · audit · confidence_history · list_projects</span>\n' +
         '<span class="tk-c">//   xfer     memory/export-v1 · memory/import-v1 · memory/claim</span>',

    cli: '<span class="tk-c"># pip install registers two console scripts: mnemosyne, mnemosyne-web</span>\n' +
         '<span class="tk-c"># (from a source checkout, `python mnemosyne.py` behaves identically)</span>\n' +
         'mnemosyne --dir ./mem init\n\n' +
         '<span class="tk-c"># write and recall</span>\n' +
         'mnemosyne --dir ./mem retain --content <span class="tk-s">"Apple Inc. was founded in 1976"</span>\n' +
         'mnemosyne --dir ./mem recall <span class="tk-s">"Apple"</span> --k 5\n\n' +
         '<span class="tk-c"># compression engine — merge near-duplicates (dry-run by default)</span>\n' +
         'mnemosyne --dir ./mem consolidate --dry-run\n\n' +
         '<span class="tk-c"># temporal knowledge graph traversal</span>\n' +
         'mnemosyne --dir ./mem graph-query <span class="tk-s">"Steve Jobs"</span> --depth 2 --json\n\n' +
         '<span class="tk-c"># ledger integrity — detect tampering and locate the exact record</span>\n' +
         'mnemosyne --dir ./mem verify-integrity --json\n\n' +
         '<span class="tk-c"># the local console: 16 pages, memory browser through ledger verify</span>\n' +
         'mnemosyne-web --port 9090   <span class="tk-c"># first run: admin / mnemosyne</span>',

    http: '<span class="tk-c"># one public port, token-authenticated. Qdrant and the embedding</span>\n' +
          '<span class="tk-c"># upstream stay bound to loopback and are unreachable from outside.</span>\n' +
          'cd 1-云端 &amp;&amp; cp .env.example .env &amp;&amp; bash setup-cloud.sh\n\n' +
          '<span class="tk-c"># free HTTPS via a Cloudflare quick tunnel — no domain, no signup</span>\n' +
          'cloudflared tunnel --url http://localhost:8788 --no-autoupdate\n' +
          '<span class="tk-c"># → https://xxxx-xxxx.trycloudflare.com/mcp</span>\n\n' +
          '<span class="tk-c"># self-test: 31 tool names back means the gateway is live</span>\n' +
          'curl -X POST https://your-domain/mcp \\\n' +
          '  -H <span class="tk-s">"Authorization: Bearer &lt;token&gt;"</span> \\\n' +
          '  -H <span class="tk-s">"Content-Type: application/json"</span> \\\n' +
          '  -d <span class="tk-s">\'{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\'</span>\n\n' +
          '<span class="tk-c"># tokens map to tenants: one token, one physically isolated room</span>\n' +
          '<span class="tk-c"># MNEMOSYNE_TENANT_MAP=tok_a1b2...=user_a,tok_d4e5...=user_b</span>'
  };

  /* product panels shown beside the proof tabs — code output, so kept in English */
  var PANELS = {
    latency:
      '<span class="tk-c">$ python quickstart.py</span>\n' +
      '<span class="tk-k">recall</span>(<span class="tk-s">"what are that machine\'s specs"</span>, k=5)\n\n' +
      '<span class="tk-c">  0.9421  high    his laptop is an ASUS VivoBook Pro 14 (M5450UA)</span>\n' +
      '<span class="tk-c">  0.6890  medium  the memory stack runs on a cloud instance</span>\n' +
      '<span class="tk-c">  0.4102  low     every conclusion must cite its source</span>\n\n' +
      '<span class="tk-p">↳ vector(24) + fts5(11) + graph(3) → fused 3 in 0.71 ms</span>',
    compression:
      '<span class="tk-c">$ mnemosyne capsule 08b4e1b3</span>\n\n' +
      'before   <span class="tk-k">1,284</span> chars\n' +
      'after      <span class="tk-k">40</span> chars   <span class="tk-p">→ 32x</span>\n\n' +
      '<span class="tk-c">pointer + structured facts + atomic values</span>\n' +
      '<span class="tk-p">sha256 verified on expand</span>\n' +
      '<span class="tk-p">numbers 12/12 · dates 4/4 · urls 2/2 preserved</span>',
    sovereignty:
      '<span class="tk-c">$ ls ./my_memories</span>\n' +
      'index.sqlite3     <span class="tk-k">41 MB</span>\n' +
      'ledger.log        <span class="tk-p">79 entries · sha256 chained</span>\n\n' +
      '<span class="tk-c">$ mnemosyne verify-integrity --json</span>\n' +
      '<span class="tk-p">{"ok": true, "records": 79, "broken": 0}</span>\n\n' +
      '<span class="tk-c"># copy the directory to migrate. delete it to be forgotten.</span>'
  };

  /* ------------------------------------------------------------------- EN */
  var EN = {
    meta: { title: 'Mnemosyne OS — Zero-Cloud Memory Layer for AI Agents' },

    'a11y.skip': 'Skip to content',
    'nav.star': 'GitHub',
    'nav.pip': 'pip',
    'nav.starShort': 'Star on GitHub',
    'nav.try': 'Try Mnemosyne OS',
    'gate.t': 'Sign in to open the console',
    'gate.d': 'Your memories, quota and plan live under your account. Sign in to view them.',
    'gate.signin': 'Sign in',
    'gate.signup': 'Sign up',
    'theme.cap': 'Appearance',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.system': 'System',
    'lang.cap': 'Language',
    'code.copy': 'Copy',
    'code.copied': 'Copied',

    'ann.tag': '8.1.0',
    'ann.txt': 'Mnemosyne OS 8.1.0 已上线：新增记忆形成层——会话摘要、冲突消解、任务与经验记忆、代码演进记忆、敏感度治理。MCP 工具 31 → 52，旧工具与旧数据完全兼容。',
    'ann.cta': 'Read the changelog',

    'hero.badge': 'Mnemosyne OS 8.1.0',
    'hero.badge2': 'Zero-cloud memory layer',
    'hero.l1': 'From remembering conversations',
    'hero.l2': 'to maintaining an evolving world model',
    'hero.lede': 'The <b>unified memory infrastructure</b> built for multi-agent systems and cross-session context. Eight memory classes carry facts and experience, consolidation paths distill repeated episodes into semantic knowledge, and a decay policy lets stale state retire on its own. <b>Pinpoint recall in milliseconds</b>, with your data <b>under your own control</b>.',
    'hero.start': 'Get started',
    'hero.setup': 'Agent setup',
    'hero.seg1': 'SDK',
    'hero.seg2': 'Agent harness',
    'hero.seg3': 'Plugins',
    'hero.gh': 'View on GitHub',
    'hero.mounts': 'Mounts into',
    'hero.seeAll': 'see all →',

    'proof.eyebrow': 'Product',
    'proof.h2': 'Built for developers who trust measured data — not empty promises.',
    'proof.sub': 'Mnemosyne OS gives multi-agent systems one persistent memory, with zero intrusion into your existing pipeline. It strips redundant context, cuts token cost sharply, and returns verifiable millisecond-scale recall — so your AI stops hallucinating for good.',
    'proof.try': 'Try it now',

    'how.eyebrow': 'How it works',
    'how.h2': 'Retain anything. Mnemosyne OS learns.',
    'how.sub': 'Three stages run on every write and every read. No configuration, no boilerplate, no pipeline to rewire.',

    'arch.eyebrow': 'Architecture',
    'arch.h2': 'BEAM — bi-layer episodic + associative memory',
    'arch.sub': 'Things that happened in time and things that relate to each other are structurally different. BEAM stores them differently, then assembles a single injection under a token budget.',
    'arch.lgWrite': 'write path',
    'arch.lgRead': 'recall path',
    'arch.lgChain': 'temporal chain',
    'arch.wireNote': 'Pure wireframe — every line and packet is drawn in-browser with SVG. No library, no canvas, no colour noise.',

    'uc.eyebrow': 'Use cases',
    'uc.h2': 'Memory that adapts to your domain',
    'uc.sub': 'Mnemosyne OS helps AI remember what matters.',

    'int.eyebrow': 'Integrations',
    'int.h2': 'Anything that speaks MCP already works.',
    'int.sub': 'Mnemosyne OS exposes its 52 tools over the standard Model Context Protocol, so it mounts without a bespoke adapter. Every transport below has a runnable or a config in the repository.',
    'int.note': 'Every entry above rides the public MCP surface — stdio or Streamable HTTP. No forked client, no vendor plugin, no private SDK.',

    'bench.tag': 'New algorithm',
    'bench.eyebrow': 'Research',
    'bench.h2': 'Benchmarking Mnemosyne OS',
    'bench.sub': 'Single-pass hierarchical distillation. Multi-signal retrieval. Benchmarked across LoCoMo, LongMemEval and BEAM — the three benchmarks the memory field is actually judged on.',
    'bench.cta': 'View Research',
    'bench.ours': 'Mnemosyne OS 8.1.0',
    'bench.theirs': 'Mem0',
    'bench.note': 'LoCoMo, LongMemEval and BEAM are scored out of 100, higher is better. Mem0 figures are the scores Mem0 publishes on mem0.ai/research. Harnesses for reproducing our own numbers ship in the repository under scripts/.',

    'ent.eyebrow': 'Enterprise',
    'ent.h2': 'Built for enterprise. Designed for control.',
    'ent.sub': 'Memory at scale is infrastructure. Mnemosyne OS gives teams governance, portability and full observability so engineers spend time building, not recovering lost context.',
    'ent.compliance': 'Compliance intent is documented rather than asserted: the project targets HIPAA, 等保, GDPR and PIPL, and ships a SHA-256 hash-chain ledger (storage/ledger.py) so tampering becomes detectable rather than deniable.',

    'price.eyebrow': 'Pricing',
    'price.h2': 'The open-source tier is free forever, and not crippled.',
    'price.sub': 'The engine is MIT. You pay for multi-tenancy, cloud coordination and compliance delivery — never to unlock a feature.',
    'price.note': 'Final pricing subject to commercial confirmation. A complete free-tier cloud deployment package (managed free VM + free embedding API + free HTTPS tunnel) ships inside the repository.',

    'res.eyebrow': 'Resources',
    'res.h2': 'Latest from the repository',

    'cta.h2': 'Give your agent a memory it actually owns.',
    'cta.sub': 'No account, no credit card, no network. One pip command and your machine has a memory engine that will not forget you.',
    'cta.read': 'Read the source',
    'cta.meta': 'python 3.8+ · windows / macOS / linux · offline capable · no telemetry',

    'foot.copy': '© 2026 Guangdong Xinshiming Industrial Co., Ltd. · Mnemosyne OS · MIT License · Built by 胡景堃 (Jingkun Hu)',
    'foot.tag': 'local-first since day one',

    nav: [
      /* The paid product sits first — a visitor should see the console exists
         before anything else. Always visible (no auth flag); clicking it hits
         the login gate when signed out. Admin surfaces stay owner-only. */
      { label: 'Console', href: '#/dashboard/overview', console: 1 },
      { label: 'Developers', items: [
        { t: 'Documentation', d: 'Integrate Mnemosyne OS into your product', href: '#/docs' },
        { t: 'API Reference', d: 'The API for integrating memory', href: '#/api' },
        { t: 'MCP Integration', d: 'Connect Mnemosyne OS to Claude Code, Cursor and more', href: '#/mcp' },
        { t: 'Memory formation', d: 'Summaries, conflict resolution, task and code memory', href: '#/docs/memory-formation' },
        { t: 'CLI', d: 'Manage memory from the terminal', href: '#/cli' },
        { t: 'Trust Center', d: 'Security, compliance and certification', href: '#/trust' },
        { t: 'Status', d: 'Runtime health and event history', href: '#/status' }
      ] },
      { label: 'Resources', mega: [
        { t: 'Research', href: '#/research' },
        { t: 'Blog', href: '#/blog' },
        { t: 'Integrations', href: '#/integrations' },
        { t: 'Changelog', href: '#/changelog' },
        { t: 'GitHub', href: REPO, ext: 1 }
      ], feat: {
        t: 'A memory layer that runs on the standard library',
        d: 'Storage-layer writes land in 0.3 ms per record; the full write path — notary, ledger, audit and index — completes in roughly 1 ms, and 100,000 memories stay resident in 298 MB.',
        href: '#/research',
        tiles: [['0.3ms', 'write / record'], ['~1ms', 'full path'], ['298MB', 'at 100k records'], ['15x', 'batch write']]
      } },
      { label: 'Pricing', href: '#/pricing' },
      { label: 'Use cases', items: [
        { t: 'Customer support', href: '#/use-cases/customer-support' },
        { t: 'Healthcare', href: '#/use-cases/healthcare' },
        { t: 'Education', href: '#/use-cases/education' },
        { t: 'Sales & CRM', href: '#/use-cases/sales-crm' },
        { t: 'E-commerce', href: '#/use-cases/ecommerce' }
      ] },
      { label: 'Company', items: [
        { t: 'About us', href: '#/about' },
        { t: 'Contact us', href: '#/contact' },
        { t: 'Careers', href: '#/careers' },
        { t: 'Startup program', href: '#/startup' }
      ] }
    ],

    stats: [
      { value: '37', label: 'GitHub stars', note: 'fetched live from the GitHub API', live: 1 },
      { value: '0.3', label: 'ms per stored record', note: 'storage layer, measured at 100k records' },
      { value: '52', label: 'MCP tools', note: '41 native + 11 client-compatible' },
      { value: '0', label: 'third-party dependencies', note: 'install_requires is an empty list' }
    ],

    community: {
      goal: 100,
      ms: [
        { at: 25,  t: 'Core engine MIT open-sourced' },
        { at: 100, t: 'Full LongMemEval dataset + one-command reproduction' },
        { at: 500, t: 'Contributor program & community spotlight' }
      ],
      note: 'Milestones are public commitments: when a star count is reached, the unlock ships in the next release — no waitlist, no gate. Reached milestones stay checked.'
    },
    'comm.eyebrow': 'Community',
    'comm.h2': 'Building in the open, one star at a time',
    'comm.sub': 'Stars are how a local-first project like this one gets discovered. Each milestone below is a public commitment — when we reach it, the unlock ships to everyone in the same release.',
    'comm.label': 'stars to our next milestone',
    'comm.cta': 'Star on GitHub',

    proof: [
      { name: 'Latency', icon: 'gauge', tag: '<0.88 ms reads',
        title: 'Sub-millisecond recall, millisecond writes',
        body: 'Five recall channels run in parallel — BM25 keyword, vector similarity, knowledge-graph edges, temporal decay and confidence weighting — and then converge into a top-k. On the write side the notary check, the SHA-256 ledger entry, the audit record and the index update all land inside about a millisecond.',
        stats: [['Storage write', '0.3 ms / record'], ['Full write path', '≈1 ms'], ['Footprint', '298 MB @ 100k']] },
      { name: 'Compression', icon: 'layers', tag: 'budget-first',
        title: 'Token budget instead of brute force',
        body: 'A greedy budget pass picks the highest marginal value per token and down-weights candidates that overlap what is already selected — so the context never fills with three memories that say the same thing. The Adaptive Information Capsule reduces a long memory to a stable pointer plus its atomic values, and expand() restores the original with hash verification.',
        stats: [['Capsule', 'capsule / expand'], ['Budget recall', 'greedy, bigram-aware'], ['Compaction', 'consolidate / dedup / reflect']] },
      { name: 'Sovereignty', icon: 'shield-check', tag: '0 dependencies',
        title: 'Zero-cloud by construction',
        body: 'install_requires is empty: the core imports nothing outside the Python standard library. Everything lives under ~/.mnemosyne — one SQLite file per namespace, a hash-chain ledger, and gzip archives for the cold tier. The web console stores passwords with PBKDF2-HMAC-SHA256 at 120,000 iterations and locks an account for 60 seconds after five failed attempts.',
        stats: [['Third-party deps', '0'], ['Data home', '~/.mnemosyne'], ['Ledger', 'SHA-256 hash chain']] }
    ],

    how: [
      { num: '01', title: 'Retain', meta: 'retain(content, mtype=..., project=...)',
        body: 'One call builds a record with the eight memory classes from the design guide, runs the notary check for prompt injection and credentials, writes to SQLite plus FTS5 plus the inverted index, appends a hash-chain ledger entry, and parks the memory in the hot tier.' },
      { num: '02', title: 'Learn', meta: 'demote_cycle · consolidate · dedup',
        body: 'A demote cycle scores every memory — importance×2 + accesses×0.05 + confidence×3 + recency×2 + hit-rate — then pushes the lowest 20 % down a tier. Hot to warm is a flag change; warm to cold becomes a gzip archive plus a Bloom-filter index. Demote is not delete, and every migration is booked in the ledger.' },
      { num: '03', title: 'Retrieve', meta: 'recall(query, k=5, budget_tokens=100)',
        body: 'Five channels fuse into one ranking, a no-LLM cognitive resolver normalises time, entities and preferences, and a budget pass ships only what earns its tokens. Every recalled memory records a touch, which raises its value — so what you actually use is what survives.' }
    ],

    archLayers: [
      { idx: '01', title: 'Working Memory', tag: 'HOT',
        body: 'New memories land in the hot tier — the SQLite main table, read directly, with an in-memory LRU cache in front. Recall order is confidence × recency inside the token budget, and when the budget runs out low-confidence items are demoted rather than truncated.',
        meta: 'build_context_prompt() · budget_tokens · confidence_history' },
      { idx: '02', title: 'Episodic Memory', tag: 'WARM / COLD',
        body: 'Interactions are cut into episodes: user turns are kept whole, assistant turns are summarised. The demote cycle then walks low-value memories down — warm is only a tier flag, cold becomes a gzip archive plus a Bloom-filter index under data/cold/. Demotion is never deletion, and every move is booked.',
        meta: 'demote_cycle() · consolidate · dedup' },
      { idx: '03', title: 'TripleStore', tag: 'TEMPORAL KG',
        body: 'Subject–predicate–object edges are built automatically from the entities extracted at write time. Nothing is overwritten: a new version soft-deletes the old record and chains it through parent_id, so “where does he live now” and “where did he live last year” stay separately answerable. Entity overlap is itself one of the five recall channels.',
        meta: 'graph_query(depth=n) · temporal_query · parent_id version chain' }
    ],
    archCloud: {
      title: 'Cloud deployment, when you need it',
      body: 'The same source runs unchanged on a server: multilingual embeddings come from Tencent\u2019s Hunyuan Hy-Memory-30B-A3B — the agent-memory model open-sourced on 16 October 2026, 30B total parameters with 3B active, built specifically for chat, work and code memory and ranked first among open-source frameworks on four memory benchmarks. Qdrant serves as the vector tier and an MCP over Streamable HTTP gateway is the single public port. Tokens map to tenants — each tenant gets its own SQLite file and vector collection, which is physical isolation rather than permission filtering. Optional numpy / transformers extras and the Qdrant plugin add true semantic embeddings when you want them, and a 100,000-record corpus stays around 298 MB resident.',
      stats: [['52', 'MCP tools'], ['1', 'Public port'], ['0', 'GPUs required']]
    },

    uc: [
      { name: 'Coding agents', cards: [
        { title: 'Decisions that survive a refactor', body: 'Why a library was chosen, what was rejected and for what reason — recalled by intent rather than by filename.' },
        { title: 'Preferences carried between sessions', body: 'Style rules, conventions and review notes stay attached to the project instead of to a chat window.' },
        { title: 'No re-explaining the codebase', body: 'The agent opens with the architecture already in context, so the first hour is spent building, not briefing.' }
      ] },
      { name: 'Customer support', cards: [
        { title: 'Continuity across tickets and channels', body: 'A customer who wrote last month is recognised this month, without being asked to repeat themselves.' },
        { title: 'Escalation notes that travel', body: 'Consolidated episode summaries hand over cleanly — between agents, and between agents and humans.' },
        { title: 'Contradictions surfaced, not buried', body: 'Fact-conflict detection flags the cases where two remembered claims cannot both be true.' }
      ] },
      { name: 'Personal assistant', cards: [
        { title: 'Preferences, not settings', body: 'Dietary rules, hardware, timezone and tone are remembered once and applied everywhere.' },
        { title: 'Time-aware recall', body: 'Where they lived last year and where they live now are two separately answerable questions, not one overwritten record.' },
        { title: 'Yours, on your disk', body: 'The whole memory is a file you own. Moving machines means copying one directory.' }
      ] },
      { name: 'Research & analysis', cards: [
        { title: 'Source-linked findings', body: 'Every claim keeps its provenance, so a conclusion can be traced back to the note that produced it.' },
        { title: 'Confidence that changes over time', body: 'confidence_history records how sure the system was, and how that certainty moved as evidence arrived.' },
        { title: 'Offline and air-gapped', body: 'Falls back to local FTS5 indexing when the network is gone. Nothing leaves the machine in the first place.' }
      ] },
      { name: 'Team brain', cards: [
        { title: 'One node, many brains', body: 'Token-mapped tenant namespaces give every teammate a physically separate SQLite file and vector collection.' },
        { title: 'Shared knowledge, private context', body: 'Team facts live in a shared namespace while personal context stays in a private one.' },
        { title: 'A ledger per tenant', body: 'Each namespace keeps its own hash-chained audit trail, ready for review.' }
      ] }
    ],

    benchMetrics: {
      rows: [
        { name: 'LongMemEval', ours: 96.2, theirs: 94.4 },
        { name: 'LoCoMo',      ours: 94.8, theirs: 92.5 },
        { name: 'BEAM (1M)',   ours: 68.5, theirs: 64.1 },
        { name: 'BEAM (10M)',  ours: 53.9, theirs: 48.6 }
      ],
      note: 'Higher is better, out of 100. Mem0 scores are the figures it publishes on mem0.ai/research.'
    },
    specHead: ['Dimension', 'Mnemosyne OS 8.1.0', 'Mem0 Cloud', 'Pinecone + RAG'],
    specRows: [
      ['Deployment', 'Local / self-hosted / cloud — same code', 'Managed SaaS only', 'Managed vector DB + custom layer'],
      ['Core dependencies', '0 (Python standard library)', 'Hosted service + SDK', 'Vector DB + embedding model + orchestration'],
      ['LongMemEval', '96.2', '94.4', 'Not published'],
      ['LoCoMo', '94.8', '92.5', 'Not published'],
      ['BEAM (1M / 10M)', '68.5 / 53.9', '64.1 / 48.6', 'Not published'],
      ['Vector compression', '32x (AIC capsule)', 'No native compression', 'Scalar quantization, ~4x'],
      ['Data residency', 'SQLite file on your disk', 'Third-party cloud', 'Vectors in third-party cloud'],
      ['Offline operation', 'Yes (FTS5 fallback)', 'No', 'No'],
      ['Tamper-evident audit', 'SHA-256 hash-chain ledger', 'None', 'None'],
      ['Temporal knowledge graph', 'Native TripleStore version chain', 'Limited', 'Assembled by hand'],
      ['Agent integration', '52 MCP tools, out of the box', 'REST API', 'Custom tool layer required'],
      ['License & cost', 'MIT · self-hosted $0', 'Usage-based', 'Vectors + seats']
    ],

    ent: [
      { icon: 'shield-check', title: 'Sovereignty', body: 'Zero-trust by construction: no cloud dependency in the core, no telemetry, no third-party SDK in the write path. Your data stays yours because it never moves.' },
      { icon: 'server', title: 'Portability', body: 'A laptop, a private VM, Kubernetes or an air-gapped rack — the same code, the same API, the same SQLite file format everywhere.' },
      { icon: 'scroll-text', title: 'Auditability', body: 'Every read and write is logged in a SHA-256 hash chain. verify_chain() names the exact record that was altered, so tampering becomes detectable rather than deniable.' }
    ],
    entBadges: ['MIT', 'HIPAA mapping', '等保 mapping', 'GDPR mapping', 'PIPL mapping', 'SHA-256 ledger'],

    plans: [
      { name: 'Free', badge: 'FREE', desc: 'Every MCP tool, no card required. See what persistent memory does for your agent.',
        price: '$0', unit: '/ month', cta: 'Start free', href: '#/login',
        feats: [
          ['All 55 MCP tools', 0],
          ['30-day cold memory window', 0],
          ['1 namespace', 0],
          ['7-day audit window', 0],
          ['Cross-namespace recall', 1],
          ['Your data is never deleted', 1]
        ] },
      { name: 'Pro', badge: 'POPULAR', desc: 'Permanent memory for individual developers who use AI every day.',
        price: '$6.9', unit: '/ month', cta: 'Start Pro', href: '#/dashboard/billing', rec: 1,
        footnote: '$69/year — 12 months for the price of 10. Cancel anytime in PayPal.',
        feats: [
          ['Everything in Free, plus:', 1],
          ['Permanent cold memory — no 30-day window', 0],
          ['Cross-namespace recall', 0],
          ['Unlimited audit history', 0],
          ['Full export', 0],
          ['Billed through PayPal Subscriptions', 0]
        ] },
      { name: 'Team', badge: 'TEAM', desc: 'Per seat. For small teams and compliance-sensitive deployments.',
        price: '$19.9', unit: '/ seat / month', cta: 'Start Team', href: '#/dashboard/billing',
        footnote: '$199/year per seat — 12 months for the price of 10.',
        feats: [
          ['Everything in Pro, plus:', 1],
          ['Multi-user namespace management', 0],
          ['Team memory policies', 0],
          ['Audit report export', 0],
          ['Per-seat billing', 0]
        ] },
      { name: 'Compliance Add-on', badge: 'ADD-ON', desc: 'Optional pack on top of Pro or Team. Not a standalone tier.',
        price: '$9.9', unit: '/ month', cta: 'Add to Pro or Team', href: '#/dashboard/billing',
        footnote: 'Requires an active Pro or Team subscription. Monthly only.',
        feats: [
          ['Scheduled verify_integrity reports', 0],
          ['Deletion proof export (memory_cascade_delete)', 0],
          ['Data residency configuration', 0],
          ['Requires Pro or Team', 1]
        ] }
    ],

    resources: [
      { title: 'CHANGELOG.md', desc: 'Version history, breaking changes and dated release notes for every 7.x build.', go: 'read →', href: REPO + '/blob/main/CHANGELOG.md' },
      { title: 'docs/RECALL_STRATEGY.md', desc: 'How recall is assembled, and how per-turn memory injection is assessed against the token budget.', go: 'read →', href: REPO + '/blob/main/docs/RECALL_STRATEGY.md' },
      { title: 'scripts/verify_recall_quality.py', desc: 'The harness behind the recall-quality numbers on this page. Runnable against your own corpus.', go: 'run →', href: REPO + '/blob/main/scripts/verify_recall_quality.py' }
    ],

    footCols: [
      /* 🔴 2026-10-24：链接从 `#/docs` 改成 `/docs/`（真实静态路径）。
         原因：hash 路由的 fragment 永远不发给服务器，Google 爬首页时
         走不到任何子页 —— GSC 里 15 个页面全部「网址尚未收录到 Google」，
         且显示「无引荐站点地图 / 未检测到引荐来源网页」。
         现在每个内容页都有预渲染的 /<slug>/index.html，用绝对路径链接
         既能被 Google 爬取，用户点击也能正常打开（静态页里有「进入交互版」）。 */
      { title: 'Developers', links: [
        ['Documentation', '/docs/'], ['API Reference', '/api-reference/'], ['MCP Integration', '/mcp/'],
        ['CLI', '/cli/'], ['Trust Center', '/trust/'], ['Status', '/status/']] },
      { title: 'Resources', links: [
        ['Research', '/research/'], ['Blog', '/blog/'], ['Integrations', '/integrations/'],
        ['Release notes', '/changelog/'], ['GitHub', REPO]] },
      { title: 'Product', links: [
        ['Pricing', '/pricing/'], ['Core capabilities', '#product'], ['How it works', '#how'],
        ['Architecture (BEAM)', '#architecture'], ['Benchmarks', '#benchmarks']] },
      { title: 'Use cases', links: [
        ['Customer support', '#/use-cases/customer-support'], ['Healthcare', '#/use-cases/healthcare'],
        ['Education', '#/use-cases/education'], ['Sales & CRM', '#/use-cases/sales-crm'],
        ['E-commerce', '#/use-cases/ecommerce']] },
      { title: 'Company', links: [
        ['About us', '/about/'], ['Contact us', '/contact/'], ['Careers', '/careers/'],
        ['Startup program', '/startup/'], ['Known defects', REPO + '/blob/main/docs/KNOWN_DEFECTS.md'],
        ['PyPI package', 'https://pypi.org/project/ai-memo-os/']] }
    ],

    'foot.blurb': 'A zero-dependency, local-first memory layer for AI agents. Recall in 0.21 ms, on a store you own.',
    'foot.privacy': 'Privacy',
    'foot.terms': 'Terms',
    'foot.releases': 'Release notes'
  };

  /* ------------------------------------------------------------------- ZH */
  var ZH = {
    meta: { title: 'Mnemosyne OS — 为 AI 智能体而生的零云端记忆层' },

    'a11y.skip': '跳到主要内容',
    'nav.star': 'GitHub',
    'nav.pip': 'pip',
    'nav.starShort': '在 GitHub 上 Star',
    'nav.try': '免费开始',
    'gate.t': '登录后查看 Mnemosyne OS SaaS',
    'gate.d': '控制台里的记忆、配额与套餐都绑定在你的账号上。登录后即可查看。',
    'gate.signin': '登录',
    'gate.signup': '注册',
    'theme.cap': '外观',
    'theme.light': '浅色',
    'theme.dark': '深色',
    'theme.system': '跟随系统',
    'lang.cap': '语言',
    'code.copy': '复制',
    'code.copied': '已复制',

    'ann.tag': '8.1.0',
    'ann.txt': 'Mnemosyne OS 8.1.0 已上线：新增记忆形成层——会话摘要、冲突消解、任务与经验记忆、代码演进记忆、敏感度治理。MCP 工具 31 → 52，旧工具与旧数据完全兼容。',
    'ann.cta': '查看更新记录',

    'hero.badge': 'Mnemosyne OS 8.1.0',
    'hero.badge2': '零云端记忆层',
    /* 定位从「工具」上移到「世界模型」：记住对话只是手段，
       维护一个随使用持续演化、可回溯、可遗忘的世界模型才是目的。
       这跟 MINT/BM25 类"更好的检索框"划清界限，也解释了为什么需要
       八类记忆、巩固路径、遗忘机制这一整套东西。 */
    'hero.l1': '从「记住对话」到',
    'hero.l2': '维护一个会演化的世界模型',
    'hero.lede': '<b>专为多 Agent 与跨会话打造的统一记忆基础设施</b>：八类记忆分层承载事实与经验，巩固路径把重复出现的情景提炼为语义，遗忘机制让过期状态自然退场。<b>短上下文毫秒级精准召回</b>，让数据隐私<b>重归你的掌控</b>。',
    'hero.start': '开始使用',
    'hero.setup': '代理设置',
    'hero.seg1': 'SDK 集成',
    'hero.seg2': '代理线束',
    'hero.seg3': '插件',
    'hero.gh': '在 GitHub 查看',
    'hero.mounts': '可挂载于',
    'hero.seeAll': '查看全部 →',

    'proof.eyebrow': '产品',
    'proof.h2': '专为信仰实测数据，而非空头承诺的开发者打造。',
    'proof.sub': 'Mnemosyne OS 为多智能体赋予统一的持久记忆，零侵入现有管线。精准剔除冗余上下文，断崖式降低 Token 成本，以可验证的毫秒级速度，让 AI 彻底告别幻觉。',
    'proof.try': '立即试用',

    'how.eyebrow': '工作原理',
    'how.h2': '记住任何东西。Mnemosyne OS 学会它。',
    'how.sub': '三个阶段贯穿每一次写入与每一次读取。无需配置、无需样板代码、无需重接管线。',

    'arch.eyebrow': '架构',
    'arch.h2': 'BEAM —— 情景 × 联想双层记忆',
    'arch.sub': '「按时间发生的事」与「按关系相连的事」在结构上本就不同。BEAM 分别用各自合适的方式存储，再在 token 预算内合成一次注入。',
    'arch.lgWrite': '写入路径',
    'arch.lgRead': '召回路径',
    'arch.lgChain': '时间版本链',
    'arch.wireNote': '纯线框构图 —— 每一条线与每一个数据包都由浏览器内的 SVG 绘制。无库、无 canvas、无色彩噪声。',

    'uc.eyebrow': '应用场景',
    'uc.h2': '为你的领域而自适应的记忆',
    'uc.sub': 'Mnemosyne OS 帮 AI 记住真正重要的东西。',

    'int.eyebrow': '集成',
    'int.h2': '凡是会说 MCP 的，接上就能用。',
    'int.sub': 'Mnemosyne OS 通过标准 Model Context Protocol 暴露全部 52 个工具，因此无需为每个宿主写专属适配层。下表中每一条通路，仓库里都有可运行示例或配置。',
    'int.note': '以上所有条目都走公开的 MCP 接口 —— stdio 或 Streamable HTTP。没有 fork 的客户端、没有厂商插件、没有私有 SDK。',

    'bench.tag': '新算法',
    'bench.eyebrow': '研究',
    'bench.h2': '基准测试 Mnemosyne OS',
    'bench.sub': '单遍分层蒸馏，多信号检索。已通过 LoCoMo、LongMemEval 与 BEAM 三大国际记忆基准测试。',
    'bench.cta': '查看研究',
    'bench.ours': 'Mnemosyne OS 8.1.0',
    'bench.theirs': 'Mem0',
    'bench.note': 'LoCoMo、LongMemEval 与 BEAM 均为百分制，越高越好。Mem0 分数取自其官方研究页 mem0.ai/research 公开数据。复现本站数字的脚本随仓库发布在 scripts/ 目录下。',

    'ent.eyebrow': '企业版',
    'ent.h2': '为企业而建，为掌控而设计。',
    'ent.sub': '规模化的记忆是基础设施。Mnemosyne OS 给团队治理能力、可迁移性与完整可观测性，让工程师把时间花在构建上，而不是在恢复丢失的上下文。',
    'ent.compliance': '合规是文档化的，不是口头声称的：项目以 HIPAA、等保、GDPR 与 PIPL 为目标，并内置 SHA-256 哈希链账本（storage/ledger.py）—— 篡改因此是可被发现的，而不是可被否认的。',

    'price.eyebrow': '定价',
    'price.h2': '开源那一档永久免费，且不做任何阉割。',
    'price.sub': '引擎为 MIT 许可。你付费买的是多租户、云端协同与合规交付 —— 而不是解锁某个功能。',
    'price.note': '最终价格以商务确认为准。完整的免费额度云端部署包（免费云主机 + 免费嵌入 API + 免费 HTTPS 隧道）随仓库一同提供。',

    'res.eyebrow': '资源',
    'res.h2': '来自仓库的最新内容',

    'cta.h2': '给你的智能体一个真正属于它的记忆。',
    'cta.sub': '不需要账号、不需要信用卡、不需要联网。一条 pip 命令，你的机器上就多了一个不会忘记你的记忆引擎。',
    'cta.read': '阅读源码',
    'cta.meta': 'python 3.8+ · Windows / macOS / Linux · 可离线运行 · 无遥测',

    'foot.copy': '© 2026 广东鑫室铭实业有限公司 · Mnemosyne OS · MIT 许可 · 作者 胡景堃 (Jingkun Hu)',
    'foot.tag': 'local-first since day one',

    nav: [
      /* 「Mnemosyne OS SaaS」放在**第一位**：它是我们的付费产品，访客进站第一眼
         就该知道有这个服务。它常显（不带 auth:1，否则未登录看不见），
         但带 console:1 —— 点击时由登录门控分流：未登录弹登录框，已登录才进控制台。
         管理界面另有铁律：只有站长本人（OWNER_ID = gh:MnemosyneOS）可见。 */
      { label: 'Mnemosyne OS SaaS', href: '#/dashboard/overview', console: 1 },
      { label: '开发人员', items: [
        { t: '文档', d: '将 Mnemosyne OS 集成到您的产品中', href: '#/docs' },
        { t: 'API 参考', d: '用于集成内存的 API', href: '#/api' },
        { t: 'MCP 集成', d: '将 Mnemosyne OS 连接到 Claude Code、Cursor 等', href: '#/mcp' },
        { t: '命令行界面', d: '通过终端管理内存', href: '#/cli' },
        { t: '信任中心', d: '安全、合规与认证', href: '#/trust' },
        { t: '状态', d: '运行时健康与事件历史', href: '#/status' }
      ] },
      { label: '资源', mega: [
        { t: '研究', href: '#/research' },
        { t: '博客', href: '#/blog' },
        { t: '集成', href: '#/integrations' },
        { t: '发行说明', href: '#/changelog' },
        { t: 'GitHub', href: REPO, ext: 1 }
      ], feat: {
        t: '一套只跑标准库的记忆层',
        d: '存储层写入 0.3 ms / 条；完整写入路径（安全公证 + 哈希链账本 + 审计 + 索引）约 1 ms 完成，10 万条记忆常驻内存 298 MB。',
        href: '#/research',
        tiles: [['0.3ms', '每条写入'], ['~1ms', '完整路径'], ['298MB', '10 万条'], ['15x', '批量写入']]
      } },
      { label: '定价', href: '#/pricing' },
      { label: '用例', items: [
        { t: '客户支持', href: '#/use-cases/customer-support' },
        { t: '卫生保健', href: '#/use-cases/healthcare' },
        { t: '教育', href: '#/use-cases/education' },
        { t: '销售与客户关系管理', href: '#/use-cases/sales-crm' },
        { t: '电子商务', href: '#/use-cases/ecommerce' }
      ] },
      { label: '公司', items: [
        { t: '关于我们', href: '#/about' },
        { t: '联系我们', href: '#/contact' },
        { t: '职业生涯', href: '#/careers' },
        { t: '创业计划', href: '#/startup' }
      ] }
    ],

    stats: [
      { value: '37', label: 'GitHub 星标', note: '实时取自 GitHub API', live: 1 },
      { value: '0.3', label: 'ms / 每条写入', note: '存储层耗时，10 万条语料下测得' },
      { value: '52', label: 'MCP 工具', note: '41 原生 + 11 客户端兼容' },
      { value: '0', label: '第三方依赖', note: 'install_requires 是空列表' }
    ],

    community: {
      goal: 100,
      ms: [
        { at: 25,  t: '核心引擎 MIT 开源' },
        { at: 100, t: 'LongMemEval 完整数据集 + 一键复现脚本开源' },
        { at: 500, t: '贡献者计划 & 社区专题展示' }
      ],
      note: '里程碑是公开承诺：达到星数后，对应公开物随下一次发版交付——无需排队、不设门槛。已达成的里程碑会保持勾选。'
    },
    'comm.eyebrow': '社区',
    'comm.h2': '公开共建，一星一程',
    'comm.sub': '星数是本地优先项目被看见的方式。下面每一个里程碑都是公开承诺——达到后，对应的公开物随同一次发版交付给所有人。',
    'comm.label': '距下一个里程碑的星数',
    'comm.cta': '在 GitHub 点亮星标',

    proof: [
      { name: '延迟', icon: 'gauge', tag: '读取 <0.88 ms',
        title: '读取亚毫秒，写入毫秒级',
        body: '五路召回通道并行运行 —— BM25 关键词、向量相似、知识图谱边、时间衰减、置信度加权 —— 再合并为 top-k。写入一侧，公证检查、SHA-256 账本记账、审计记录与索引更新全部在内，仍控制在约 1 毫秒。',
        stats: [['存储层写入', '0.3 ms / 条'], ['完整写入路径', '≈1 ms'], ['内存占用', '298 MB @ 10 万条']] },
      { name: '压缩', icon: 'layers', tag: '预算优先',
        title: '靠 token 预算，而不是靠堆',
        body: '预算召回用贪心算法逐条挑选「每 token 边际价值最高」的记忆，并对与已选内容重叠的候选降权 —— 上下文里不会出现三条说同一件事的记忆。AIC 记忆胶囊把长记忆压成「稳定指针 + 关键原子」，expand() 展开时带哈希校验。',
        stats: [['胶囊', 'capsule / expand'], ['预算召回', '贪心 + bigram 去冗'], ['三级压缩', 'consolidate / dedup / reflect']] },
      { name: '主权', icon: 'shield-check', tag: '0 依赖',
        title: '从根上就没有云端',
        body: 'install_requires 是空列表：核心不 import 任何 Python 标准库之外的东西。数据全部落在 ~/.mnemosyne —— 每个命名空间一个 SQLite 文件、一本哈希链账本、冷层是 gzip 归档。Web 控制台用 PBKDF2-HMAC-SHA256 做 12 万轮迭代存密码，连错 5 次锁定 60 秒。',
        stats: [['第三方依赖', '0'], ['数据目录', '~/.mnemosyne'], ['账本', 'SHA-256 哈希链']] }
    ],

    how: [
      { num: '01', title: '写入 Retain', meta: 'retain(content, mtype=..., project=...)',
        body: '一次调用即建好记录（支持指南定义的八类记忆），跑完公证检查（提示词注入 / 凭据检测），写入 SQLite + FTS5 + 倒排索引，往哈希链账本追加一笔，最后把记忆放进热层。' },
      { num: '02', title: '学习 Learn', meta: 'demote_cycle · consolidate · dedup',
        body: '降级周期给每条记忆打分 —— 重要性×2 + 访问次数×0.05 + 置信度×3 + 近因×2 + 命中率 —— 把最低的 20% 往下迁一层。热→温只改标志位；温→冷变成 gzip 归档 + 布隆过滤器索引。降级不是删除，每次迁移都记进账本。' },
      { num: '03', title: '召回 Retrieve', meta: 'recall(query, k=5, budget_tokens=100)',
        body: '五路分数融合成一个排序，认知解析器（无大模型、不花 token）把时间、实体与偏好归一，预算通道只送配得上 token 的那几条。每次被召回都会「触碰」记忆、抬高它的价值 —— 你真正用到的，才会留下来。' }
    ],

    archLayers: [
      { idx: '01', title: 'Working Memory 工作记忆', tag: 'HOT',
        body: '新记忆落在热层 —— SQLite 主表，直接可读，前面还有一层内存 LRU 缓存。召回按「置信度 × 时效性」在 token 预算内排序；预算耗尽时，低置信项是被降级，而不是被截断。',
        meta: 'build_context_prompt() · budget_tokens · confidence_history' },
      { idx: '02', title: 'Episodic Memory 情景记忆', tag: 'WARM / COLD',
        body: '交互被切成「剧集」：用户轮次整段保留，助手轮次只存摘要。随后降级周期把低价值记忆往下走 —— 温层只是改标志位，冷层变成 data/cold/ 下的 gzip 归档 + 布隆过滤器索引。降级永不等于删除，每一步都记账。',
        meta: 'demote_cycle() · consolidate · dedup' },
      { idx: '03', title: 'TripleStore 时序知识图谱', tag: 'TEMPORAL KG',
        body: '「主体 — 谓词 — 客体」的边由写入时抽取的实体自动构建。旧记录不会被覆盖：新版本把旧版软删除，并用 parent_id 串成版本链 —— 于是「他现在住哪」和「他去年住哪」始终可以分别回答。实体重叠本身就是五路召回中的一路。',
        meta: 'graph_query(depth=n) · temporal_query · parent_id 版本链' }
    ],
    archCloud: {
      title: '需要时，再上云',
      body: '同一份源码可原样跑在服务器上：多语言嵌入由腾讯混元 Hy-Memory-30B-A3B 提供 —— 混元团队 2026 年 10 月 16 日开源的智能体记忆专用模型，30B 总参数、3B 激活，专为聊天、工作、代码三类记忆设计，在 4 个记忆基准上拿到开源框架第一。Qdrant 承载向量层，MCP over Streamable HTTP 网关是唯一对外端口。令牌决定租户 —— 每个租户一个独立 SQLite 与向量集合，这是物理隔离，而不是权限过滤。可选的 numpy / transformers 扩展与 Qdrant 插件能补上真正的语义嵌入；10 万条记忆常驻内存约 298 MB。',
      stats: [['52', 'MCP 工具'], ['1', '对外端口'], ['0', '无需 GPU']]
    },

    uc: [
      { name: '编程智能体', cards: [
        { title: '重构也冲不掉的决策', body: '当初为什么选这个库、否掉了哪个方案、理由是什么 —— 按意图召回，而不是按文件名。' },
        { title: '跨会话保留的偏好', body: '风格规则、项目约定与评审意见牢牢挂在项目上，而不是挂在某个聊天窗口里。' },
        { title: '不用重新讲一遍代码库', body: '智能体一上来就带着架构上下文，第一个小时用来写代码，而不是听人介绍。' }
      ] },
      { name: '客服支持', cards: [
        { title: '跨工单、跨渠道的连贯性', body: '上个月写过信的用户，这个月能被认出来，不必请他再重复一遍。' },
        { title: '能交接的升级备注', body: '归并后的情景摘要可以在智能体之间、以及智能体与人之间干净地交接。' },
        { title: '矛盾被摆出来，而不是被埋掉', body: '事实冲突检测会标记出「两条记忆不可能同时为真」的情况。' }
      ] },
      { name: '个人助理', cards: [
        { title: '记住偏好，而不是设置项', body: '饮食禁忌、设备型号、时区与语气偏好记住一次，处处生效。' },
        { title: '带时间维度的召回', body: '去年住哪、现在住哪是两个可分别回答的问题，而不是一条被覆盖的记录。' },
        { title: '你的数据，在你的盘上', body: '全部记忆就是一个属于你的文件。换电脑 = 拷一个目录。' }
      ] },
      { name: '研究分析', cards: [
        { title: '可回溯到来源的结论', body: '每个论断都保留出处，结论能被一路追回到产生它的那条笔记。' },
        { title: '会随时间变化的置信度', body: 'confidence_history 记录系统当时有多确定，以及随着证据到位，这份确定如何变化。' },
        { title: '离线与气隙环境', body: '断网时自动退回本地 FTS5 索引。本来就没有东西离开这台机器。' }
      ] },
      { name: '团队大脑', cards: [
        { title: '一台机器，多个大脑', body: '令牌映射的租户命名空间，让每位成员拥有物理独立的 SQLite 与向量集合。' },
        { title: '共享知识，私有上下文', body: '团队事实放在共享命名空间，个人上下文留在私有命名空间。' },
        { title: '每个租户一本账', body: '每个命名空间各自保留哈希链审计轨迹，随时可查。' }
      ] }
    ],

    benchMetrics: {
      rows: [
        { name: 'LongMemEval', ours: 96.2, theirs: 94.4 },
        { name: 'LoCoMo',      ours: 94.8, theirs: 92.5 },
        { name: 'BEAM (1M)',   ours: 68.5, theirs: 64.1 },
        { name: 'BEAM (10M)',  ours: 53.9, theirs: 48.6 }
      ],
      note: '满分 100，越高越好。Mem0 分数取自其官方研究页 mem0.ai/research 公开数据。'
    },
    specHead: ['对比维度', 'Mnemosyne OS 8.1.0', 'Mem0 Cloud', 'Pinecone + RAG'],
    specRows: [
      ['部署形态', '本地 / 自托管 / 云端 —— 同一份代码', '仅托管 SaaS', '托管向量库 + 自建检索层'],
      ['核心依赖', '0 个（Python 标准库）', '托管服务 + SDK', '向量库 + 嵌入模型 + 编排框架'],
      ['LongMemEval', '96.2', '94.4', '未公开'],
      ['LoCoMo', '94.8', '92.5', '未公开'],
      ['BEAM（1M / 10M）', '68.5 / 53.9', '64.1 / 48.6', '未公开'],
      ['向量压缩', '32x（AIC 记忆胶囊）', '无原生压缩层', '标量量化，约 4x'],
      ['数据主权', 'SQLite 文件在你磁盘上', '数据存第三方云', '向量存第三方云'],
      ['离线可用', '是（退回 FTS5）', '否', '否'],
      ['防篡改审计', 'SHA-256 哈希链账本', '无', '无'],
      ['时序知识图谱', '原生 TripleStore 版本链', '有限', '需自行拼装'],
      ['Agent 接入', '52 个 MCP 工具，开箱即用', 'REST API', '需自写工具层'],
      ['许可与成本', 'MIT · 自托管 $0', '按调用量计费', '按向量量 + 席位计费']
    ],

    ent: [
      { icon: 'shield-check', title: '数据主权 Sovereignty', body: '从根上就是零信任：核心不依赖任何云服务、没有遥测、写入路径里没有第三方 SDK。你的数据之所以是你的，是因为它从未移动过。' },
      { icon: 'server', title: '可迁移 Portability', body: '笔记本、私有虚拟机、Kubernetes 还是气隙机柜 —— 同一份代码、同一套 API、同一种 SQLite 文件格式。' },
      { icon: 'scroll-text', title: '可审计 Auditability', body: '每一次读写都记进 SHA-256 哈希链。verify_chain() 能指出被改动的那一条记录 —— 篡改因此是可被发现的，而不是可被否认的。' }
    ],
    entBadges: ['MIT', 'HIPAA 映射', '等保 映射', 'GDPR 映射', 'PIPL 映射', 'SHA-256 账本'],

    plans: [
      { name: 'Free', badge: '免费', desc: '全部 MCP 工具，不用绑卡。先让它替你记住一次。',
        price: '¥0', unit: '/ 月', cta: '免费开始', href: '#/login',
        feats: [
          ['55 个 MCP 工具全开', 0],
          ['冷层记忆 30 天召回窗口', 0],
          ['1 个命名空间', 0],
          ['审计窗口 7 天', 0],
          ['跨命名空间召回', 1],
          ['数据永不删除', 1]
        ] },
      { name: 'Pro', badge: '最受欢迎', desc: '每天都在用 AI 干活的人，记忆不该有保质期。',
        price: '$6.9', unit: '/ 月', cta: '开通 Pro', href: '#/dashboard/billing', rec: 1,
        footnote: '$69/年 —— 付 10 个月用 12 个月。随时可在 PayPal 内取消。',
        feats: [
          ['包含 Free 全部功能，外加：', 1],
          ['永久冷层记忆（不再有 30 天窗口）', 0],
          ['跨命名空间召回', 0],
          ['审计历史无限制', 0],
          ['全量导出', 0],
          ['通过 PayPal 订阅自动续费', 0]
        ] },
      { name: 'Team', badge: '团队', desc: '按席位计费。面向小团队与合规敏感型部署。',
        price: '$19.9', unit: '/ 席位 / 月', cta: '开通 Team', href: '#/dashboard/billing',
        footnote: '$199/年 / 席位 —— 付 10 个月用 12 个月。',
        feats: [
          ['包含 Pro 全部功能，外加：', 1],
          ['多用户命名空间管理', 0],
          ['团队记忆策略', 0],
          ['审计报告导出', 0],
          ['按席位计费', 0]
        ] },
      { name: '增值包', badge: '加购', desc: 'Pro / Team 之上的可选加购，不是独立订阅层。',
        price: '$9.9', unit: '/ 月', cta: '加到 Pro / Team', href: '#/dashboard/billing',
        footnote: '需已有 Pro 或 Team 订阅，只做月付。',
        feats: [
          ['verify_integrity 定期报告', 0],
          ['删除证明导出（memory_cascade_delete）', 0],
          ['数据驻留配置支持', 0],
          ['需已有 Pro 或 Team', 1]
        ] }
    ],

    resources: [
      { title: 'CHANGELOG.md', desc: '版本历史、破坏性变更与带日期的发布记录，覆盖全部 7.x 构建。', go: '阅读 →', href: REPO + '/blob/main/CHANGELOG.md' },
      { title: 'docs/RECALL_STRATEGY.md', desc: '召回是怎么组装的，以及每轮记忆注入是如何对照 token 预算被评估的。', go: '阅读 →', href: REPO + '/blob/main/docs/RECALL_STRATEGY.md' },
      { title: 'scripts/verify_recall_quality.py', desc: '本页召回质量数字背后的测量脚本。可以直接拿你自己的语料跑。', go: '运行 →', href: REPO + '/blob/main/scripts/verify_recall_quality.py' }
    ],

    footCols: [
      /* 2026-10-24：同 EN，改为真实静态路径，理由见 EN 段的注释。 */
      { title: '开发人员', links: [
        ['文档', '/docs/'], ['API 参考', '/api-reference/'], ['MCP 集成', '/mcp/'],
        ['命令行界面', '/cli/'], ['信任中心', '/trust/'], ['状态', '/status/']] },
      { title: '资源', links: [
        ['研究', '/research/'], ['博客', '/blog/'], ['集成', '/integrations/'],
        ['发行说明', '/changelog/'], ['GitHub', REPO]] },
      { title: '产品', links: [
        ['定价', '/pricing/'], ['核心能力', '#product'], ['工作原理', '#how'],
        ['架构（BEAM）', '#architecture'], ['性能基准', '#benchmarks']] },
      { title: '用例', links: [
        ['客户支持', '#/use-cases/customer-support'], ['卫生保健', '#/use-cases/healthcare'],
        ['教育', '#/use-cases/education'], ['销售与客户关系管理', '#/use-cases/sales-crm'],
        ['电子商务', '#/use-cases/ecommerce']] },
      { title: '公司', links: [
        ['关于我们', '/about/'], ['联系我们', '/contact/'], ['职业生涯', '/careers/'],
        ['创业计划', '/startup/'], ['已知缺陷', REPO + '/blob/main/docs/KNOWN_DEFECTS.md'],
        ['PyPI 包', 'https://pypi.org/project/ai-memo-os/']] }
    ],

    'foot.blurb': '一套零依赖、本地优先的 AI 智能体记忆层。0.21 ms 召回，存储属于你自己。',
    'foot.privacy': '隐私政策',
    'foot.terms': '服务条款',
    'foot.releases': '发行说明'
  };

  var DICT = { en: EN, zh: ZH };

  /* 后台「页面文案」要列出全部可改键，得先知道有哪些键、默认值是什么。
     DICT 是主脚本作用域内的局部变量，后台面板在另一个作用域里拿不到，
     所以在这里挂一份出去。只导出字符串键：meta 这种嵌套对象不是「一行文案」，
     硬塞进输入框只会变成 [object Object]。 */
  window.__I18N_KEYS = (function () {
    var out = [], k;
    for (k in ZH) {
      if (Object.prototype.hasOwnProperty.call(ZH, k) && typeof ZH[k] === 'string') out.push(k);
    }
    return out;
  })();
  window.__I18N_DEFAULTS = { zh: ZH, en: EN };

  /* ======================================================================= *
   *  BLOG POSTS — 文章数据。分类、日期、封面都在这里，正文在 BLOG_POSTS[id].body
   *                                                                          *
   *  正文是逐行的字符串数组（body 是字符串），作者写的换行与分段原样保留。
   *  新增文章：往 BLOG_POSTS 里加一条 + 在 blog 页的 articles 数组里引用 id。
   * ======================================================================= */

  var BLOG_POSTS = {
    'kimi-vs-deepseek': {
      cat: '行业观察',
      catEn: 'Industry',
      date: '2026-10-17 08:41',
      dateEn: '17 October 2026, 08:41',
      title: '国产开源AI正在悄然分叉成两条道路！',
      lede: '不是谁赢、谁输的抉择，是两种完全不同的未来！',
      img: 'assets/blog-kimi-vs-deepseek.jpg',
      alt: '两人站在飘扬的五星红旗前，一人食指抵唇示意安静，一人握拳高举。',
      body: [
        '国产开源AI正在悄然分叉成两条道路！Kimi杨植麟 vs DeepSeek梁文峰',
        '',
        '不是谁赢、谁输的抉择，是两种完全不同的未来！',
        '',
        '最终国产AI很可能迎来双赢局面！',
        '',
        '一条路把开源当产品杠杆，用长上下文和Agent快速锁住用户、冲商业化；',
        '',
        '另一条路把开源当生态武器，用极致效率和国产算力适配，把模型做成不可替代的底座。',
        '',
        'Kimi和DeepSeek，从表面趋同到彻底分岔，只花了一年。',
        '',
        '【关键差异】',
        '',
        '1.开源的用法',
        '',
        '- Kimi开源是为了加速产品落地和心智占领；',
        '',
        '- DeepSeek开源是为了降低接入门槛、扩大生态渗透，让别人都跑在自己的算力上。',
        '',
        '2.融资与控制权',
        '',
        '- 杨植麟密集融资、估值跟产品节奏暴涨，冲港股讲收入故事；',
        '',
        '- 梁文峰个人大额出资锁死控制，估值按战略稀缺定价，冲科创板。',
        '',
        '3.收入逻辑',
        '',
        '- Kimi增长驱动，API+付费快速放量；',
        '',
        '- DeepSeek效率驱动，高毛利+涨价不流失，靠成本结构而非规模。',
        '',
        '4.组织与姿态',
        '',
        '- 一个约300人产品公司，轻资产锁定客户；',
        '',
        '- 一个约270人研究实验室，开源渗透、不急于锁客。',
        '',
        '国产开源AI第一次真正出现结构性分叉：一条路在卖产品，一条路在建底座。',
        '',
        '接下来谁能走得更远，取决于你更相信"收入"还是"不可替代"。'
      ].join('\n')
    }
  };

  /* 文章卡片 —— b.articles 里的每一项 = 一篇可点开的文章 */
  function articleCards(ids) {
    return (ids || []).map(function (id) {
      var a = BLOG_POSTS[id];
      if (!a) return '';
      var zh = lang === 'zh';
      var cat = zh ? a.cat : (a.catEn || a.cat);
      var when = zh ? a.date : (a.dateEn || a.date);
      return '<a class="acard" href="#/blog/' + esc(id) + '">' +
               '<span class="athumb"><img src="' + esc(a.img) + '" alt="' + esc(a.alt || a.title) + '" loading="lazy"></span>' +
               '<span class="abody">' +
                 '<span class="ameta">' + esc(cat) + ' · ' + esc(when) + '</span>' +
                 '<span class="atitle">' + esc(a.title) + '</span>' +
                 '<span class="alede">' + esc(a.lede) + '</span>' +
                 '<span class="amore">' + esc(dz('阅读全文', 'Read the article')) + ' →</span>' +
               '</span>' +
             '</a>';
    }).join('');
  }

  /* ======================================================================= *
   *  ROUTED PAGES — mirrors the mem0 menu architecture one-for-one           *
   * ======================================================================= */

  var PAGES = {

    en: {

      /* ------------------------------------------------------ Developers */
      docs: {
        eyebrow: 'Documentation', h1: 'Build with Mnemosyne OS',
        lede: 'Mnemosyne OS gives AI agents memory that outlives the session. Install the package, keep one SQLite file next to your code, and let the agent decide what is worth remembering.',
        cta: [['API reference', '#/api', 'primary'], ['README on GitHub', REPO + '/blob/main/README.md', 'ghost']],
        blocks: [
          { h: 'Remember your first memory',
            p: 'Five-minute quick start. No account, no API key, no network call — the engine runs on the Python standard library alone.',
            code: { n: 'python', b: [
              'pip install ai-memo-os',
              '',
              'from mnemosyne import MemoryBrain',
              '',
              'brain = MemoryBrain("./my_memories", enable_embeddings=False)',
              'brain.ensure_init()',
              '',
              'brain.retain("Apple Inc. was founded in 1976", fast=True)',
              '',
              'results = brain.recall("Apple", k=5)',
              'for score, record, reasons in results:',
              '    print(f"{score:.4f}  {record[\'content\']}")'
            ].join('\n') } },

          { h: 'Add memory to your coding agent',
            p: 'Claude Code first, then any host that speaks MCP. They all point at the same stdio server, so the memory is shared rather than duplicated per editor.',
            cards: [
              ['Claude Code / Claude Desktop', 'Point the client at the stdio server and 52 tools appear — no adapter to write.'],
              ['Cursor', 'Drop the same block into mcp.json and the editor remembers your project decisions across sessions.'],
              ['DeepSeek Harness', 'Patch-style deployment guide — the host config is amended, never overwritten.'],
              ['OpenWebUI', 'Point it at the Streamable HTTP gateway with a bearer token. Nothing else changes.']
            ] },

          { h: 'Let the agent register itself',
            p: 'Four commands create the store, the namespace and the token. No email address, no dashboard, no sign-up form — everything needed to start is in the repository.',
            code: { n: 'bash', b: [
              '# 1 · initialise the store (SQLite + SHA-256 hash-chain ledger)',
              'mnemosyne --dir ./mem init',
              '',
              '# 2 · write, then read back',
              'mnemosyne --dir ./mem retain --content "Founded in 1976"',
              'mnemosyne --dir ./mem recall "founded" --k 5',
              '',
              '# 3 · expose it over MCP with a tenant token',
              'export MNEMOSYNE_MCP_TOKEN="your-secret-token"',
              'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace default',
              '',
              '# 4 · open the local dashboard: browser, graph view, stats',
              'python -m mnemosyne.webui.web_server --port 9090'
            ].join('\n') } },

          { h: 'Documentation in the repository',
            p: 'Fourteen documents and ten runnable examples, all versioned with the code.',
            tools: [
              ['README.md', 'Full reference in English, with a matching README in eight other languages.'],
              ['docs/RECALL_STRATEGY.md', 'How recall is assembled, and how per-turn injection is assessed against the token budget.'],
              ['docs/ACCEPTANCE_GUIDE.md', 'Handshake, environment parity, cold and warm latency budgets, namespace isolation, audit chain.'],
              ['docs/KNOWN_DEFECTS.md', 'Confirmed defects with evidence, blast radius and the fix — published rather than hidden.'],
              ['docs/DEPLOY_DEEPSEEK_HARNESS.md', 'Wiring Mnemosyne OS into a host over MCP, patch-style so nothing is overwritten.'],
              ['docs/plugins/', 'Eight plugin documents: numpy, qdrant, reranker, crypto, hrr, async, context-engine, sdk.'],
              ['examples/', 'Ten runnable scripts — basic recall through to a LangChain chain and an embedded process.'],
              ['CHANGELOG.md', 'Release history with the evidence behind each mechanism change.']
            ] },

          { note: 'Everything above runs offline. The only commands that touch the network are the two optional vector plugins, and both fail soft to local FTS5 when the network is gone.' }
        ]
      },

      api: {
        eyebrow: 'API Reference', h1: 'The memory API, without the ceremony',
        lede: 'One Python class, one CLI, one HTTP surface and 52 MCP tools — all backed by the same SQLite file. Nothing is a bespoke interface, so an agent can use the SDK and a dashboard can read the same store.',
        cta: [['MCP Integration', '#/mcp', 'primary'], ['CLI reference', '#/cli', 'ghost']],
        blocks: [
          { h: 'Python — MemoryBrain',
            p: 'One object owns the store. Write, correct, recall and snapshot context through it.',
            code: { n: 'python', b: [
              'from mnemosyne import MemoryBrain',
              '',
              'brain = MemoryBrain("./memories", enable_embeddings=False)',
              'brain.ensure_init()',
              '',
              '# write — fingerprint dedup, entity extraction and the version chain are automatic',
              'brain.retain("The user\'s GPU is an RTX 4090", fast=True)',
              '',
              '# correct an earlier statement without deleting history',
              'brain.retain("The user swapped to an RTX 5090", supersedes=old_id)',
              '',
              '# conversation history and a context snapshot for the next turn',
              'brain.add_conversation_turn("session-1", "user", "Tell me about Apple")',
              'hits = brain.search_conversations("Apple", session_id="session-1")',
              'snapshot = brain.build_context_prompt(query="Apple", max_chars=2000)'
            ].join('\n') } },

          { h: 'Token-budgeted recall',
            p: 'A budget is a hard limit, not a hint. Anything that does not fit is demoted to an addressable capsule — a stable pointer plus the atomic values — instead of being silently dropped. The cost report tells you exactly what happened.',
            code: { n: 'python', b: [
              'results, cost = brain.recall("what GPU do I use", k=5, budget_tokens=100)',
              '',
              'cost["budget_limit"]      # 100',
              'cost["budget_used"]       # tokens actually injected',
              'cost["budget_respected"]  # True',
              'cost["capsule_count"]     # entries demoted to capsules',
              'cost["dropped_count"]     # always 0 — nothing is discarded outright'
            ].join('\n') } },

          { h: 'MCP tools — 31, over stdio or Streamable HTTP',
            p: 'The whole tool surface: twenty native, plus eleven that reuse the conventional agent-memory tool names so an existing MCP client needs no rewriting. An agent gets memory by declaring them; no glue code, no custom tool layer.',
            tools: [
              ['retain', 'Write a memory.'],
              ['recall', 'Retrieve memories within a token budget; returns confidence band and capsule level.'],
              ['retain_batch', 'Batch write with metadata passed through — roughly 15× the throughput of one-by-one writes.'],
              ['capsule', 'Compress one memory into an AIC capsule: stable pointer, structured facts, atomic values.'],
              ['expand', 'Expand a capsule pointer back to the original text and verify its content hash.'],
              ['recall_health', 'Retrieval-quality telemetry: hit distribution, relevance floor rejections, latency, capsule cache hit rate.'],
              ['stats', 'Runtime counters — writes, recalls, token savings.'],
              ['graph_query', 'Traverse the knowledge graph from an entity, N hops out.'],
              ['temporal_query', 'Query the version chain — what was true at a given time, not just what is true now.'],
              ['list_projects', 'Enumerate the isolated namespaces in this store.'],
              ['doctor', 'Health check across integrity, record count, disk, vector backend and graph edges.'],
              ['audit', 'Read the audit trail.'],
              ['confidence_history', 'How sure the system was, and how that certainty moved over time.'],
              ['consolidate', 'Merge highly similar or synonymous memories into one representative; originals are marked consolidated, never deleted.'],
              ['reflect', 'Totals by type, layer, fact type and confidence, plus top entities, fact-conflict detection and temporal density.'],
              ['dedup', 'Detect duplicates and near-duplicates via content fingerprint and similarity; dry_run reports without writing.'],
              ['forget', 'Forget a memory by id or by natural-language query — soft by default, with the audit chain intact.'],
              ['memory/export-v1', 'Export through the Memory Exchange Protocol.'],
              ['memory/import-v1', 'Import through the Memory Exchange Protocol.'],
              ['memory/claim', 'Claim memories from an external export into this namespace.'],
              ['add_memory', 'Client-compatible alias — save text or a conversation history for a user or agent.'],
              ['search_memories', 'Client-compatible alias — semantic search with filters.'],
              ['get_memories', 'Client-compatible alias — structured filter plus paginated listing.'],
              ['get_memory', 'Client-compatible alias — fetch one memory by id.'],
              ['update_memory', 'Client-compatible alias — overwrite text and/or metadata.'],
              ['delete_memory', 'Client-compatible alias — delete one memory.'],
              ['delete_all_memories', 'Client-compatible alias — clear a scope.'],
              ['delete_entities', 'Client-compatible alias — delete entities and cascade.'],
              ['list_entities', 'Client-compatible alias — list users, agents, apps and runs.'],
              ['list_events', 'Client-compatible alias — list memory operations.'],
              ['get_event_status', 'Client-compatible alias — poll an async operation.']
            ] },

          { h: 'HTTP and dashboard',
            p: 'The same store, exposed locally. The dashboard ships inside the package with no external CDN, and the REST endpoint is what it runs on.',
            code: { n: 'bash', b: [
              'python -m mnemosyne.webui.web_server --port 9090',
              '# then open http://127.0.0.1:9090',
              '# first run creates admin / mnemosyne — change the password after login'
            ].join('\n') } },

          { note: 'Protocol versions 2024-11-05 / 2025-03-26 / 2025-06-18, negotiated at initialize: the server echoes the client proposal when it supports it, otherwise answers with its own highest. The MCP surface stays backward compatible: 13 tools in 7.0.0, 14 in 7.0.1, 20 in 7.0.2, 31 in 8.0.0, 52 in 8.1.0, with every addition purely additive.' }
        ]
      },

      mcp: {
        eyebrow: 'MCP Integration', h1: 'Anything that speaks MCP already works',
        lede: 'The MCP server runs over stdio JSON-RPC with optional token authentication and multi-tenant namespaces. Thirty-one tools, one command, no adapter layer to maintain.',
        cta: [['All integrations', '#/integrations', 'primary'], ['API reference', '#/api', 'ghost']],
        blocks: [
          { h: 'Run the server',
            p: 'Stdio for desktop clients, Streamable HTTP for anything running behind a port.',
            code: { n: 'bash', b: [
              '# stdio — the shape every desktop client expects',
              'export MNEMOSYNE_MCP_TOKEN="your-secret-token"   # optional but recommended',
              'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace default',
              '',
              '# a client entry is three keys and a command',
              '{',
              '  "mcpServers": {',
              '    "mnemosyne": {',
              '      "command": "python",',
              '      "args": ["-m", "mnemosyne.webui.mcp_server",',
              '               "--brain-dir", "./mem", "--namespace", "default"],',
              '      "env": { "MNEMOSYNE_MCP_TOKEN": "your-secret-token" }',
              '    }',
              '  }',
              '}'
            ].join('\n') } },

          { h: 'Hosts that work today',
            p: 'Each of these is a configuration entry, not an integration project.',
            cards: [
              ['Claude Code / Claude Desktop', 'stdio JSON-RPC. All 52 tools appear on connect.'],
              ['Cursor', 'stdio via mcp.json. Project decisions survive the session.'],
              ['OpenWebUI', 'Streamable HTTP plus a bearer token.'],
              ['Hermes Agent', 'stdio. A long-running agent ends up with memory that outlives every session it starts.'],
              ['DeepSeek Harness', 'stdio, following the repository deployment guide.'],
              ['Any MCP host', 'If it speaks Model Context Protocol, it works — nothing above is a private interface.']
            ] },

          { h: 'Tenant isolation is physical',
            p: 'A token maps to a namespace, and a namespace maps to its own storage. This is not permission filtering over one shared table.',
            ul: [
              '<b>One token, one namespace.</b> The server resolves the namespace from the token, so a client cannot ask for someone else\'s.',
              '<b>Separate SQLite file and separate vector collection</b> per namespace.',
              '<b>A separate hash-chained audit trail</b> per namespace, so one tenant\'s ledger can be reviewed without exposing another\'s.',
              '<b>list_projects</b> enumerates the namespaces this token may see — and nothing else.'
            ] },

          { h: 'Security defaults',
            p: 'Sensible without configuration, inspectable with it.',
            ul: [
              '<b>Token authentication</b> on connect, optional for local-only stdio use.',
              '<b>The security notary runs before every write</b>: credential detection, invisible-Unicode detection, HTML-injection detection, then field-level redaction.',
              '<b>Explicit confidence is never overwritten.</b> A caller writing confidence 0 gets a retraction, not a silent correction.',
              '<b>Soft forget by default.</b> confidence goes to zero and the record is marked deleted; the audit chain stays intact and evict=true is required for physical removal.'
            ] },

          { note: 'A known boundary, stated plainly: purely paraphrased queries with no lexical or tag anchor to anything in the store can fall below the relevance floor and return nothing. That is a deliberate trade — an empty result is safer for an agent than five unrelated memories. The reranker plugin exists to close the remaining gap.' }
        ]
      },

      cli: {
        eyebrow: 'CLI', h1: 'The whole engine from the terminal',
        lede: 'Every capability in the Python API has a command. Nothing is hidden behind the SDK, which means the CLI is also the fastest way to prove the engine works.',
        cta: [['Documentation', '#/docs', 'primary'], ['API reference', '#/api', 'ghost']],
        blocks: [
          { h: 'Everyday commands',
            /* pip 安装后直接用 mnemosyne；源码树内等价于 python mnemosyne.py。
               python -m mnemosyne 同样可用（包内有 __main__.py）。 */

            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem init',
              'mnemosyne --dir ./mem retain --content "Apple Inc. was founded in 1976"',
              'mnemosyne --dir ./mem recall "Apple" --k 5',
              'mnemosyne --dir ./mem consolidate --dry-run'
            ].join('\n') } },

          { h: 'Health, graph and audit',
            p: 'The three commands worth putting in a cron job or a CI step.',
            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem status --json',
              'mnemosyne --dir ./mem doctor --json',
              '',
              'mnemosyne --dir ./mem graph-query "Steve Jobs" --depth 2 --json',
              '',
              'mnemosyne --dir ./mem verify-integrity --json',
              'mnemosyne --dir ./mem ledger-audit <memory_id>'
            ].join('\n') } },

          { h: 'Move data in and out',
            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem export --format json --out ./memories.json',
              'mnemosyne --dir ./mem import ./memories.json',
              '# migrate only applies to the legacy JSONL backend:',
              'mnemosyne --dir ./old migrate --jsonl ./old/index.jsonl'
            ].join('\n') } },

          { h: 'Local dashboard',
            p: 'A dark admin interface served from the package itself — no external CDN, no telemetry, no cloud dependency. Memory browser, graph view and runtime stats.',
            code: { n: 'bash', b: [
              'python -m mnemosyne.webui.web_server --port 9090',
              '# http://127.0.0.1:9090 — default account admin / mnemosyne'
            ].join('\n') } }
        ]
      },

      trust: {
        eyebrow: 'Trust Center', h1: 'Security, compliance and certification',
        lede: 'Nothing leaves the machine, so the trust boundary is the filesystem. The claim is not that Mnemosyne OS holds a certificate — it is that its behaviour is inspectable, and every statement below maps to code you can read.',
        cta: [['Security model in the repository', REPO + '/tree/main/security', 'primary'], ['Known defects', REPO + '/blob/main/docs/KNOWN_DEFECTS.md', 'ghost']],
        blocks: [
          { h: 'The trust boundary is a file',
            p: 'There is no hosted control plane in the path. Memory lives in a SQLite file on disk, the ledger is in the same database, and the core imports nothing outside the Python standard library. Deleting the file is a complete, auditable deletion — there is no replica to chase.',
            ul: [
              '<b>Zero third-party dependencies in the core.</b> install_requires is an empty list and stays that way.',
              '<b>No telemetry.</b> There is nothing to opt out of, because nothing is collected.',
              '<b>Offline by default.</b> The vector tier is optional and fails soft to local FTS5 indexing.'
            ] },

          { h: 'Tamper-evident by construction',
            p: 'Every write is chained into a SHA-256 ledger. Verification does not just tell you that something changed — it names the record that was altered, which turns tampering from deniable into detectable.',
            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem verify-integrity --json',
              '# { "chain_valid": true, "records_checked": 10287 }',
              '',
              'mnemosyne --dir ./mem ledger-audit <memory_id>',
              '# walks the chain around one record'
            ].join('\n') } },

          { h: 'The security notary',
            p: 'A pre-write inspection stage that runs on every path — SDK, CLI, MCP and batch.',
            ul: [
              '<b>Credential detection</b> — API keys, passwords and card numbers are identified before they land.',
              '<b>Invisible-Unicode detection</b> — zero-width and bidirectional control characters are surfaced rather than stored.',
              '<b>HTML-injection detection</b> — markup is flagged instead of being faithfully persisted for a downstream renderer to execute.',
              '<b>Field-level redaction</b> — sensitive fields are masked at write time, and the original judgement is kept in meta rather than discarded.'
            ] },

          { h: 'Compliance',
            p: 'A mapping for HIPAA, 等保, GDPR and PIPL is maintained alongside the ledger that makes the mapping auditable, so a review can be answered with evidence rather than a questionnaire.',
            tiles: [['HIPAA', 'health data mapping'], ['等保', 'PRC baseline'], ['GDPR', 'EU data protection'], ['PIPL', 'PRC personal information']] },

          { note: 'An honest statement of scope: Mnemosyne OS is the engine, not the certificate. Formal attestation is a deployment exercise that depends on your infrastructure, your retention policy and your auditors — which is why the Enterprise tier exists. What ships in the open repository is the mechanism, the evidence and the ability to reproduce both.' }
        ]
      },

      status: {
        eyebrow: 'Status', h1: 'There is no hosted service to go down',
        lede: 'Mnemosyne OS runs where your data lives, so "status" means the health of your own node rather than the uptime of ours. Three commands cover it, and all of them work with the network unplugged.',
        cta: [['Run a health check', '#/cli', 'primary'], ['Observability in the API', '#/api', 'ghost']],
        blocks: [
          { h: 'Check your own node',
            code: { n: 'bash', b: [
              '# process health: integrity, record count, disk, vector backend, graph edges',
              'mnemosyne --dir ./mem doctor --json',
              '',
              '# runtime counters: writes, recalls, token savings',
              'mnemosyne --dir ./mem status --json',
              '',
              '# ledger integrity — names the record if something was altered',
              'mnemosyne --dir ./mem verify-integrity --json'
            ].join('\n') } },

          { h: 'What recall_health reports',
            p: 'Added in 7.0.2 for a specific reason: a memory stack can be "up" and still be getting worse. Recall quality that degrades as a session grows is invisible to an uptime check, so the health surface reports quality, not just liveness.',
            tools: [
              ['calls / empty_result_rate', 'How often recall is asked, and how often the honest answer is "nothing relevant".'],
              ['floor_rejections', 'How many candidates the relevance floor removed before the model saw them.'],
              ['latency p50 / max', 'Retrieval latency at the median and the tail.'],
              ['channel_hits', 'Which of the five recall channels actually contributed.'],
              ['sem_top1 / sem_background', 'Candidate cosine at the top versus the corpus median — the signal used to detect a drifted threshold.'],
              ['capsule_cache', 'Capsule cache hit rate, which is what keeps an upstream prompt cache warm.'],
              ['vector_ops / breaker', 'Vector write and delete outcomes, plus circuit-breaker state and discard counts by reason.'],
              ['graph', 'Edge count, entity count, qualifier coverage and backfill status.']
            ] },

          { h: 'A healthy node reports',
            ul: [
              '<b>chain_valid: true</b> with a record count you recognise.',
              '<b>No discarded vector writes.</b> The circuit breaker is closed and dropped_unavailable is zero.',
              '<b>Graph edges present.</b> A non-zero edge count means the knowledge-graph channel is genuinely load-bearing rather than nominally present.',
              '<b>A non-zero capsule cache hit rate</b> once you are past the first few recalls.'
            ] },

          { note: 'Release notes for every version, including the defects found and fixed, live in CHANGELOG.md in the repository. Publishing the failure modes is part of the product.' }
        ]
      },

      /* ------------------------------------------------------- Resources */
      research: {
        eyebrow: 'Research', h1: 'A memory layer that runs on the standard library',
        lede: 'Most memory systems assume a vector database, an embedding service and a cloud control plane. Mnemosyne OS assumes none of them, then measures what that costs and what it saves. Here are the three benchmarks the field is judged on, and the architecture behind them.',
        cta: [['Benchmarks', '#/benchmarks', 'primary'], ['Reproduce the measurements', REPO + '/blob/main/scripts/verify_recall_quality.py', 'ghost']],
        tiles: [['0.21ms', 'recall latency p50'], ['0.3ms', 'write / record'], ['298MB', 'at 100,000 records'], ['8/8', 'precision @ 1']],
        blocks: [
          { h: 'The three benchmarks the field is judged on',
            p: 'Memory systems are compared on three published benchmarks. Mnemosyne OS is measured on all three, beside the numbers Mem0 reports for itself.',
            tools: [
              ['LongMemEval — <b>96.2</b>  ·  Mem0 94.4', 'Long-horizon conversation: can the system still recall what was said many sessions ago?'],
              ['LoCoMo — <b>94.8</b>  ·  Mem0 92.5', 'Multi-session dialogue memory across very long conversations.'],
              ['BEAM (1M) — <b>68.5</b>  ·  Mem0 64.1', 'Byte-efficient associative memory under a one-million-token budget.'],
              ['BEAM (10M) — <b>53.9</b>  ·  Mem0 48.6', 'The same benchmark at ten times the budget, where every system degrades.']
            ] },

          { h: 'Five recall channels, fused',
            p: 'Recall is not one similarity search. Five independent signals score every candidate in parallel, then a reranker converges them, and a relevance floor decides whether anything deserves to reach the model at all.',
            tools: [
              ['Lexical — BM25 / FTS5', 'Bigram tokenisation and a built-in synonym dictionary, tuned for Chinese as much as English.'],
              ['Semantic — vector similarity', 'Optional. Supplied by the numpy in-process backend or the Qdrant plugin; the engine runs without it.'],
              ['Knowledge graph — edge traversal', 'Subject–predicate–object edges extracted on write, expanded on read.'],
              ['Time decay', 'Recency weighting that only switches to event time when the query carries explicit temporal intent.'],
              ['Confidence weighting', 'How much the system trusts each memory, over its whole history rather than its current value.']
            ],
            p2: 'A structural tag channel sits alongside the five, so that preference and intent questions — which are almost always paraphrases — stay reachable even when the semantic score alone would fall under the floor.' },

          { h: 'Reversible compression instead of lossy summarisation',
            p: 'Summarising a memory with a language model produces something shorter that is no longer the memory: generated text can introduce numbers, dates and conclusions that were never in the source. The AIC capsule takes the opposite approach — it compresses by structure and keeps the original reachable.',
            ul: [
              '<b>Lossless and reversible.</b> Every capsule carries a pointer back to the original; expand() returns it character for character and verifies the content hash.',
              '<b>Zero hallucination by construction.</b> Nothing is generated. Key points are extractive, facts come from rule-based triples, and every fragment must be a verbatim substring of the source.',
              '<b>Fact conservation.</b> Numbers, dates, amounts, model identifiers, URLs, e-mail addresses and quoted speech are treated as atoms and survive every compression level.',
              '<b>Five levels.</b> full → gist → facts → pointer → atoms, each one validated against the same atomic set.',
              '<b>Addressable by content.</b> The capsule key is derived from content hash, id, type, time and budget tier, so the same memory at the same budget produces a byte-identical capsule — which is what keeps an upstream prefix cache warm.'
            ] },

          { h: 'Measured, not asserted',
            p: 'Each figure below is produced by a script in the repository, on a real store, and the harness is the first thing run before a release.',
            tools: [
              ['Recall latency, p50 — <b>0.21 ms</b>', 'End-to-end quality trial against a real vector stack.'],
              ['Storage write — <b>0.3 ms per record</b>', 'The storage layer alone.'],
              ['Full write path — <b>~1 ms</b>', 'Notary, ledger, audit and index included, which is the number a user actually experiences.'],
              ['Resident memory — <b>298 MB at 100,000 records</b>', 'Everything in RAM, which is what makes sub-millisecond recall possible without a vector service.'],
              ['Precision @ 1 — <b>8 / 8</b>', 'Eight labelled question-answer pairs against sixteen same-topic distractors, including after 28 unrelated queries in the same session.'],
              ['Capsule compression — <b>0.51 ratio</b>', 'A 73-token source compressed under a 40-token budget to level "pointer", with all seven atomic values preserved.'],
              ['Batch writes — <b>~15×</b>', 'retain_batch against one-by-one writes.'],
              ['Sub-second regression suite — <b>94 assertions</b>', 'Offline, no external services, guarding atom conservation, zero hallucination, lossless round-trip and budget honesty.']
            ] },

          { h: 'The market this sits in',
            p: 'Memory became its own infrastructure category because long context turned out not to be memory. Published research through 2026 found accuracy degrading as input grows even in frontier models — the documented failure mode behind the shift to dedicated memory layers.',
            tiles: [['$6.27B', 'agent memory market, 2026'], ['$28.45B', 'forecast, 2030'], ['57%', 'of firms run agents in production'], ['40%+', 'agent projects at cancellation risk']],
            p2: 'The last figure is the interesting one. Analyses of stalled agent projects repeatedly point at unreliable recall rather than a weak base model — which is why a memory layer that says "I have nothing relevant" is worth more than one that always returns five plausible-looking records.' },

          { note: 'Methodology: the Mnemosyne OS figures above come from this project\'s own regression harnesses and are reproducible with scripts/verify_recall_quality.py, verify_precision_recall.py and verify_memory_lifecycle.py. Market figures are drawn from published analyst and industry reports for 2026.' }
        ]
      },

      blog: {
        eyebrow: 'Blog', h1: 'Engineering notes',
        lede: 'Mnemosyne OS is documented in public, including the parts that went wrong. These are the write-ups that live in the repository — each one describes a specific mechanism, the evidence that justified it, and what it cost to get there.',
        cta: [['Changelog', '#/changelog', 'primary'], ['All repository docs', REPO + '/tree/main/docs', 'ghost']],
        blocks: [
          { h: 'Recent notes',
            cards: [
              ['Why we stopped summarising memories', 'Generated compression introduces facts the source never contained. The AIC capsule replaces generation with extraction — and then proves it.'],
              ['The relevance floor, and why returning nothing is a feature', 'Always filling the top-k means the highest score is always 1.0, which makes the score meaningless. A calibrated floor restores an absolute meaning to relevance.'],
              ['Eleven confirmed defects, published with evidence', 'KNOWN_DEFECTS.md lists each failure, the reproduction, the blast radius and the fix. Reading it is the fastest way to understand how the engine actually behaves.'],
              ['Recall strategy and the cost of per-turn injection', 'What it costs to inject memory on every turn, and how the token budget decides what earns the space.'],
              ['A graph channel that was nominally present', 'Entity extraction was silently producing fragments, so graph traversal always returned nothing while still consuming fusion weight.'],
              ['Acceptance, not configuration', 'A guide to proving the stack works end to end: handshake, environment parity, cold and warm latency, namespace isolation, audit chain.']
            ] },
          { h: 'Articles',
            articles: ['kimi-vs-deepseek'] },
          { note: 'Longer-form articles will be published here as the engineering notes are adapted. The primary source stays the repository, where each claim sits next to the code and the test that verifies it.' }
        ]
      },

      integrations: {
        eyebrow: 'Integrations', h1: 'Memory for every stack',
        lede: 'Add persistent memory to the agent frameworks, coding tools and voice pipelines you have already built. Every entry below rides the public MCP surface or the Python SDK — no forked client, no vendor plugin.',
        search: { ph: 'Search integrations…', all: 'All categories', none: 'No integration matches that search.' },
        cats: ['MCP · stdio', 'MCP · HTTP', 'Python SDK', 'Plugin SDK', 'Local'],
        items: [
          { n: 'Claude Code', c: 'MCP · stdio', i: 'CC', d: '52 tools appear on connect. The agent remembers decisions between sessions without being told again.',
            cp: 'claude mcp add mnemosyne -- python -m mnemosyne.webui.mcp_server --brain-dir ./mem' },
          { n: 'Claude Desktop', c: 'MCP · stdio', i: 'CD', d: 'The same stdio server, declared in claude_desktop_config.json.',
            cp: '{"command":"python","args":["-m","mnemosyne.webui.mcp_server","--brain-dir","./mem"]}' },
          { n: 'Cursor', c: 'MCP · stdio', i: 'CU', d: 'Project context that survives the session — conventions, rejected approaches and review notes stay attached to the repository.',
            cp: '{"mcpServers":{"mnemosyne":{"command":"python","args":["-m","mnemosyne.webui.mcp_server"]}}}' },
          { n: 'DeepSeek Harness', c: 'MCP · stdio', i: 'DH', d: 'Deployed patch-style: the host configuration is amended, never overwritten, and the change is reversible.',
            cp: 'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace dsh' },
          { n: 'Hermes Agent', c: 'MCP · stdio', i: 'HA', d: 'A long-running agent gets a memory layer that outlives every session it starts.',
            cp: 'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace hermes' },
          { n: 'Codex', c: 'MCP · stdio', i: 'CX', d: 'Any MCP-capable CLI agent mounts the same server; nothing in the tool list is host-specific.',
            cp: 'python -m mnemosyne.webui.mcp_server --brain-dir ./mem' },
          { n: 'OpenWebUI', c: 'MCP · HTTP', i: 'OW', d: 'Point it at the Streamable HTTP gateway with a bearer token. The chat front end stops forgetting who it is talking to.',
            cp: 'python -m mnemosyne.webui.mcp_server --http --brain-dir ./mem --port 8788' },
          { n: 'Any MCP host', c: 'MCP · HTTP', i: 'MP', d: 'Streamable HTTP is the only public port a deployment needs to expose, which keeps the network surface at one.',
            cp: 'MNEMOSYNE_MCP_TOKEN=<token> python -m mnemosyne.webui.mcp_server --http --port 8788' },
          { n: 'LangChain', c: 'Python SDK', i: 'LC', d: 'A runnable example wiring MemoryBrain in as the retrieval and memory component of a chain.',
            cp: 'python examples/langchain_integration.py' },
          { n: 'Ollama', c: 'Local', i: 'OL', d: 'A fully local loop — local model plus local memory, with no request leaving the host.',
            cp: 'python examples/ollama_integration.py' },
          { n: 'Embedded, no server', c: 'Python SDK', i: 'EM', d: 'Import the brain straight into your own process. No daemon, no port, no IPC.',
            cp: 'from mnemosyne import MemoryBrain; MemoryBrain("./mem").ensure_init()' },
          { n: 'Plugin catalogue', c: 'Plugin SDK', i: 'PL', d: 'Eight documented plugins — numpy, qdrant, reranker, crypto, hrr, async, context-engine and the SDK itself.',
            cp: 'MNEMOSYNE_PLUGINS=numpy_vector,reranker python -m mnemosyne.webui.web_server' }
        ]
      },

      changelog: {
        eyebrow: 'Changelog', h1: 'Release notes',
        lede: 'Every version, including the defects it found and fixed. The full document is versioned with the code — this is the summary.',
        cta: [['Full CHANGELOG.md', REPO + '/blob/main/CHANGELOG.md', 'primary'], ['Known defects', REPO + '/blob/main/docs/KNOWN_DEFECTS.md', 'ghost']],
        blocks: [
          { h: '8.1.0 — 22 September 2026',
            p: 'The release that turned "zero dependencies" from a slogan into a verifiable architectural constraint, and gave Mnemosyne a memory API that existing agent code can adopt by changing one import.',
            ul: [
              '<b>Memory API.</b> <code>Memory</code>, <code>AsyncMemory</code> and <code>MemoryClient</code>, re-exported from the package root so the documented entry point is simply <code>from mnemosyne import Memory</code>. Parameter names, defaults, keyword-only markers, return envelopes and error codes are fixed contracts.',
              '<b>Four-dimensional scoping, physically enforced.</b> <code>user_id</code> / <code>agent_id</code> / <code>run_id</code> / <code>app_id</code> — one SQLite file per scope combination, not a filter over shared rows. Namespaces are hashed over sorted, length-prefixed components, so <code>(a, bc)</code> and <code>(ab, c)</code> cannot collide and key order cannot change the result.',
              '<b>Complete filter language</b> — <code>eq</code> <code>ne</code> <code>gt</code> <code>gte</code> <code>lt</code> <code>lte</code> <code>in</code> <code>nin</code> <code>contains</code> <code>icontains</code> <code>startswith</code> <code>endswith</code> and wildcards, with arbitrarily nested <code>AND</code> / <code>OR</code> / <code>NOT</code>.',
              '<b>72 optional providers</b> — 20 LLM, 13 embedder, 28 vector store, 5 reranker, 6 graph store. Everything reachable over HTTP is implemented on the standard library\'s <code>urllib</code>, so <code>install_requires</code> is still an empty list.',
              '<b>MCP surface 20 → 52 tools.</b> Forty-one native, plus eleven that reuse the conventional agent-memory tool names, so an existing MCP client can be pointed at Mnemosyne without rewriting its tool definitions.',
              '<b>Service surface.</b> REST <code>/v1</code>, <code>/v2</code> and <code>/v3</code> sharing the console\'s listener with token auth and async event ids; a compatible CLI with <code>--agent</code> JSON envelopes; manifests for Claude, Codex, Cursor and Kimi; integrations for LangChain, LlamaIndex, CrewAI, Dify, n8n and the Vercel AI SDK.',
              '<b>Nine defects fixed, each with regression coverage.</b> The most serious: <code>meta</code> was absent from the column list, so every <code>INSERT</code> silently dropped it and the read path then <i>fabricated</i> a replacement — user metadata vanished across a restart. <code>meta</code> is now a real column with an idempotent migration for existing databases.',
              '<b>Breaking change.</b> The client API moved to <code>mnemosyne/api/</code> and its helper modules were renamed to match. The memory-store format, REST routes and MCP tool names are unaffected.'
            ] },
          { h: '7.0.2 — 15 September 2026',
            p: 'The release that turned "precise memory, precise recall, precise compression under a very short context" from a claim into something reproducible and assertable.',
            ul: [
              '<b>AIC memory capsule.</b> Compression redefined as layered and addressable — a stable pointer, structured facts and atomic values — with lossless reversibility, zero generation and fact conservation proved by assertion. Tool count 18 → 20.',
              '<b>Relevance floor.</b> The fusion score previously had no absolute meaning because every channel normalised against its own maximum. A calibrated floor means recall can now honestly return nothing.',
              '<b>Access-count feedback loop removed.</b> Previously, asking six unrelated questions boosted a distractor enough to displace the correct answer. The boost is now multiplicative and capped at 5%.',
              '<b>Graph channel made load-bearing.</b> Edge writes were losing their memory id, so graph traversal had never actually returned data while still carrying fusion weight. Fixed, with existing stores backfilled.',
              '<b>Time channel corrected.</b> A memory that mentioned a date was being penalised for being specific. Decay now uses the record\'s own recency unless the query asks about time.',
              '<b>Write-side deduplication</b> with a hard atomic constraint: fragments where one character changes the fact are never merged, however similar they look.',
              '<b>recall_health</b> and a three-part doctor — quality telemetry, because a stack can be up and still be getting worse.'
            ] },
          { h: '7.0.1 — 14 September 2026',
            ul: [
              '<b>forget</b> tool, soft by default: confidence to zero and status deleted, audit chain intact. Tool count 13 → 14.',
              '<b>Memory correction</b> via retain(supersedes=…) — the earlier statement is marked superseded rather than removed, and recall reports which is which.',
              '<b>Qdrant vector backend plugin</b> with a circuit breaker, proxy bypass, warmup and a health probe — a persistent cross-process vector index.',
              '<b>Fast write path now indexes embeddings</b>, so memories written through it can participate in semantic recall.',
              '<b>Three new documents</b> and a parameterised 21-assertion lifecycle script.'
            ] },
          { h: '7.0.0 — 25 August 2026',
            p: 'The first stable release: a zero-dependency, local-first memory system.',
            ul: [
              'SQLite plus FTS5 with WAL, JSONL compatibility and a migrate path.',
              'SHA-256 hash-chain ledger with verify_chain() naming the altered record.',
              'Write-time notary: provenance fingerprint, cross-corroboration, injection detection, temporal consistency.',
              'Plugin system with numpy_vector, crypto, reranker, hrr, async and context-engine.',
              'MCP server with token auth and multi-tenant namespaces. 13 tools.',
              'Memory Exchange Protocol export and import.',
              'Forgetting economics: low-value memories migrate to warm and cold tiers with gzip archiving and a bloom filter — never deletion.',
              'Token budgeter, field-level redaction, local dark dashboard and an async API.'
            ] }
        ]
      },

      /* --------------------------------------------------------- Pricing */
      pricing: {
        eyebrow: 'Pricing', h1: 'Simple and affordable',
        lede: 'The engine is MIT and the free tier is not crippled — all 52 MCP tools ship in it. Paid tiers buy hosting, multi-tenancy and compliance delivery, never a feature you already have.',
        plans: true,
        blocks: [
          { h: 'What you are actually paying for',
            cards: [
              ['Hosting and coordination', 'A managed deployment with the free-tier package — free VM, free embedding API, free HTTPS tunnel — instead of running it yourself.'],
              ['Multi-tenancy', 'Token-mapped namespaces with physically separate stores and separate audit chains, so one deployment can serve many teams without shared tables.'],
              ['Compliance delivery', 'The mapping, the export format and a review channel for HIPAA, 等保, GDPR and PIPL.'],
              ['Support and SLA', 'From community issues on the free tier to a dedicated channel and 99.9% availability on Enterprise.']
            ] },
          { h: 'Deployment stays your choice',
            p: 'The same source runs on a laptop, a private VM, Kubernetes or an air-gapped rack. Nothing in the paid tiers adds a capability the MIT engine lacks — it adds coordination, governance and a phone number.',
            ul: [
              '<b>Self-hosted is a first-class option.</b> The free-tier deployment package is in the repository.',
              '<b>Export is always available.</b> Leaving with your memories is one CLI command, on every tier.',
              '<b>No per-seat pricing.</b> Every tier includes unlimited end users.'
            ] },
          { note: 'Prices are in USD, billed monthly, and exclude tax. Enterprise terms, OEM licensing and source-level agreements are handled through the contact form.' }
        ]
      },

      /* ------------------------------------------------------- Use cases */
      'use-cases/customer-support': {
        eyebrow: 'Use case', h1: 'Customer support',
        lede: 'A customer who wrote last month should be recognised this month. Support memory is not about storing transcripts — it is about remembering the person, the promises and the inconsistencies.',
        cta: [['See all use cases', '#/usecases', 'primary'], ['Start building', '#/docs', 'ghost']],
        blocks: [
          { h: 'What changes',
            cards: [
              ['Continuity across tickets and channels', 'One store, one namespace per customer. The web ticket and the phone call see the same history.'],
              ['Escalation notes that travel', 'Consolidated episode summaries hand over cleanly between agents, and between agents and humans.'],
              ['Contradictions surfaced, not buried', 'Fact-conflict detection flags cases where two remembered claims cannot both be true — the highest-value signal in support.'],
              ['A ledger you can show a regulator', 'Every read and write is chained; the audit trail is evidence rather than recollection.']
            ] },
          { h: 'Why local-first matters here',
            p: 'Support memory is where personal data concentrates, and it is also where regulators look first. Because the store is a file you control, retention policy is a filesystem operation rather than a vendor negotiation — and redaction happens at write time, before the data exists in a downstream system.',
            ul: [
              '<b>Field-level redaction at write time</b> — card numbers and credentials never enter the store.',
              '<b>Soft forget</b> that honours a deletion request while keeping the audit chain intact.',
              '<b>Per-tenant audit trails</b>, so one customer\'s ledger can be reviewed without exposing another\'s.'
            ] },
          { h: 'A realistic shape',
            p: 'Each customer becomes a namespace. Turns are written as episodes; the facts inside them land in the graph. When a new ticket arrives, recall runs against that namespace only, inside a token budget small enough for the cheapest model to handle.',
            ul: [
              'add_conversation_turn() on every message',
              '<b>recall(budget_tokens=100)</b> before the model sees the ticket',
              'reflect() on a schedule to surface recurring entities and contradictions',
              'consolidate() to keep near-duplicate episodes from crowding the candidate pool'
            ] }
        ]
      },

      'use-cases/healthcare': {
        eyebrow: 'Use case', h1: 'Healthcare',
        lede: 'Clinical context is longitudinal by nature, and it is the last place where data should leave the building. Mnemosyne OS keeps a patient-specific memory that never crosses the perimeter.',
        cta: [['Trust Center', '#/trust', 'primary'], ['Talk to us', '#/contact', 'ghost']],
        blocks: [
          { h: 'What changes',
            cards: [
              ['Patient-specific continuity', 'Prior findings, treatment pathways and preferences stay attached to the patient rather than to a session.'],
              ['Temporal questions answered separately', 'What was true at the last visit and what is true now are two different questions, and the version chain answers both.'],
              ['Air-gapped by design', 'Deployment inside a clinical network requires no egress at all, because the engine has no cloud dependency.'],
              ['Tamper-evident records', 'A hash-chained ledger makes any alteration detectable and points to the exact record.']
            ] },
          { h: 'Where the engine helps and where it does not',
            p: 'Mnemosyne OS is a memory layer, not a clinical decision system. It decides what context is worth surfacing and proves that nothing was silently changed. Diagnosis, dosage and clinical judgement remain outside its scope — deliberately.',
            ul: [
              '<b>Ambiguity resolved structurally.</b> "The user\'s allergy is penicillin" and "… was penicillin" are distinct versions, not one overwritten record.',
              '<b>Fact conflicts are surfaced</b> rather than resolved by recency.',
              '<b>Deduplication refuses to merge</b> when a number, date, dosage or identifier differs.'
            ] },
          { h: 'Compliance posture',
            p: 'The mapping for HIPAA is maintained alongside the mechanism, and the deployment model keeps data residency under your control — on-premise, private cloud or fully air-gapped.',
            tiles: [['HIPAA', 'mapping maintained'], ['0 egress', 'air-gap capable'], ['SHA-256', 'hash-chain ledger'], ['On-prem', 'your infrastructure']] }
        ]
      },

      'use-cases/education': {
        eyebrow: 'Use case', h1: 'Education',
        lede: 'A tutor that remembers what a student already understood is worth more than one that restarts every lesson. Mnemosyne OS gives learning agents a durable model of the learner.',
        cta: [['See all use cases', '#/usecases', 'primary'], ['Start building', '#/docs', 'ghost']],
        blocks: [
          { h: 'What changes',
            cards: [
              ['A model of the learner, not a transcript', 'Concepts mastered, misconceptions held and the pace that actually worked.'],
              ['Confidence that moves', 'confidence_history records how sure the system was and how that certainty shifted as evidence arrived.'],
              ['Institution-controlled data', 'Student data stays inside the school\'s perimeter — which is usually the condition for adoption at all.'],
              ['Recall inside a cheap model\'s budget', 'A 100-token injection keeps memory usable without a frontier model in the loop.']
            ] },
          { h: 'The questions it is built for',
            ul: [
              '<b>"What did this student struggle with last term?"</b> — temporal query over the version chain.',
              '<b>"Which misconceptions keep coming back?"</b> — reflect() with deep pattern discovery across episodes.',
              '<b>"Which examples landed for this student?"</b> — preference and intent recall through the tag channel.',
              '<b>"Has anything here changed?"</b> — the ledger answers with evidence.'
            ] },
          { h: 'Deployment',
            p: 'A single department machine can run the whole thing. The vector tier is optional, so a school without GPU capacity or a cloud budget gets full functionality from SQLite and FTS5 alone.',
            ul: [
              'Runs offline — no network dependency in the teaching loop',
              'One SQLite file per cohort or per student, your choice',
              'Offline operation falls back to local lexical indexing rather than failing'
            ] }
        ]
      },

      'use-cases/sales-crm': {
        eyebrow: 'Use case', h1: 'Sales and CRM',
        lede: 'Most CRM records are structured facts; the deal is usually in the unstructured context around them. Mnemosyne OS remembers why a decision was made, not just that it was made.',
        cta: [['See all use cases', '#/usecases', 'primary'], ['Start building', '#/docs', 'ghost']],
        blocks: [
          { h: 'What changes',
            cards: [
              ['The reasoning, not just the outcome', 'Why a champion changed roles, which objection actually killed a deal, who said what in March.'],
              ['Time-aware account history', 'Where an account stood last quarter and where it stands now are separately answerable.'],
              ['Consistency across the team', 'One node, many namespaces: shared account facts in a shared namespace, individual notes kept private.'],
              ['Forecast inputs you can defend', 'Every conclusion traces back to the record that produced it.']
            ] },
          { h: 'Where it fits',
            p: 'Mnemosyne OS is not a system of record. It sits next to the CRM and answers the questions the CRM was never shaped to answer — the ones with sentences rather than fields.',
            ul: [
              '<b>Auto-extracted entities</b> turn contacts, companies and products into graph nodes without a data-entry step.',
              '<b>consolidate()</b> keeps months of near-duplicate meeting notes from crowding out the primary source.',
              '<b>detect conflicts</b> when two reps record incompatible next steps.',
              '<b>forget()</b> honours data-deletion requests without destroying the audit chain.'
            ] },
          { h: 'A realistic deployment',
            p: 'Sales tooling is usually cloud-hosted, which makes the interesting configuration the multi-tenant one — one deployment, a namespace per account team, with token-mapped isolation rather than permission filtering.',
            ul: ['Token maps to namespace', 'Separate store and separate vector collection per namespace', 'Separate hash-chained audit trail per namespace'] }
        ]
      },

      'use-cases/ecommerce': {
        eyebrow: 'Use case', h1: 'E-commerce',
        lede: 'Personalisation that persists across sessions, without shipping a customer\'s history to a third-party cloud. The shopper is recognised because the memory sits beside the store, not inside someone else\'s.',
        cta: [['See all use cases', '#/usecases', 'primary'], ['Start building', '#/docs', 'ghost']],
        blocks: [
          { h: 'What changes',
            cards: [
              ['Preferences, not settings', 'Sizes, fit complaints, materials avoided and brands preferred are remembered once and applied everywhere.'],
              ['Session-spanning continuity', 'The assistant does not re-ask what it was already told three weeks ago.'],
              ['Return and support context', 'A return conversation starts with the order history already in context.'],
              ['Latency that feels local', '0.21 ms recall p50 means memory adds no perceptible delay to a product page.']
            ] },
          { h: 'The token argument',
            p: 'Personalisation normally competes with cost, because context is re-sent on every call. Budgeted recall inverts that: only what fits the budget reaches the model, and nothing that does not fit is discarded — it stays addressable as a capsule.',
            ul: [
              '<b>budget_tokens caps the injection</b>, so a long customer history cannot inflate the bill.',
              '<b>Demoted entries keep a pointer and their atomic values</b>, so a size or an order number is never lost to a budget cut.',
              '<b>Capsule keys are content-derived</b>, so the same memory at the same budget produces a byte-identical capsule and upstream prefix caches keep hitting.'
            ] },
          { h: 'Data posture',
            p: 'Cart and browsing history are among the most commercially sensitive data a retailer holds. Because the store is a file you control, retention windows are enforced by your own process, and redaction happens before the write rather than in a downstream export.',
            tiles: [['0 cloud', 'no third-party store'], ['Write-time', 'redaction'], ['Per-tenant', 'audit chain'], ['$0', 'free tier deploy']] }
        ]
      },

      /* --------------------------------------------------------- Company */
      about: {
        eyebrow: 'About us', h1: 'Mnemosyne OS — the memory layer for AI agents',
        lede: 'Every interaction should be personal, considered and efficient. An agent can only be those things if it remembers what came before — so we built the memory layer we wanted to depend on.',
        cta: [['Get started', '#/docs', 'primary'], ['Read the source', REPO, 'ghost']],
        tiles: [['37', 'GitHub stars'], ['300', 'PyPI downloads / month'], ['52', 'MCP tools'], ['9', 'documented languages']],
        person: {
          img: 'data:image/jpeg;base64,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',
          kicker: 'Founder & CEO',
          name: 'Hu Jingkun　胡景堃',
          role: 'Founder and CEO, Mnemosyne OS — Guangdong Xinshiming Industrial Co., Ltd.',
          tags: ['Nanjing University', 'Project 985 / Project 211', '22 years as HRVP, Fortune Global 500', 'AI memory infrastructure'],
          bio: [
            'Frank Hu holds a degree from Nanjing University, a Project 985 and Project 211 institution. For 22 years he served as a Human Resources Vice President at Fortune Global 500 companies, where the work kept returning to one question every large organisation faces: what gets remembered, by whom, and on what evidence.',
            'Mnemosyne OS grew out of the conviction that surfaced in that work — that an organisation\'s most valuable and least durable asset is context, and that the agents now being deployed inside those organisations face exactly the same problem. The engine is therefore deliberately zero-dependency and local-first: a memory layer that cannot be audited is not one a regulated business can rely on.',
            'He writes the engine himself, and publishes the defects his own measurements find — including the eleven documented in KNOWN_DEFECTS.md.'
          ]
        },
        blocks: [
          { h: 'Persistent memory infrastructure for AI agents',
            p: 'Mnemosyne OS 8.1.0 is a zero-dependency, local-first memory system with multi-tier forgetting, a hash-chain ledger, a plugin SDK, a local dashboard and full MCP support. It is the only memory engine whose core requires no third-party dependency at all — no vector database, no LLM runtime, no cloud lock-in — and it runs on a laptop, a server or serverless infrastructure without modification.',
            p2: 'That constraint is the product. Every feature in Mnemosyne OS exists because removing the dependencies made it necessary: forgetting economics replaced unbounded growth, a hash chain replaced trust in a provider, and reversible compression replaced lossy summarisation.' },

          { h: 'Imagination · Mission · Purpose',
            cards: [
              ['Imagination', 'A world where an AI assistant remembers what it was told, without the conversation being shipped to a data centre to make that possible. Memory as a household utility: always there, entirely yours.'],
              ['Mission', 'To make persistent memory a primitive rather than a pipeline. Context that arrives because it is relevant, not because it fits in a window — and a demonstrable record of what was remembered, changed and forgotten.'],
              ['Purpose', 'In the next decade of AI, the difference between a tool and a colleague is continuity. We build the layer that keeps an agent learning, adapting and compounding instead of starting over.']
            ] },

          { h: 'What the numbers look like',
            p: 'Six months of work, measured in public rather than asserted.',
            tools: [
              ['Version 8.1.0 — 22 September 2026', 'Four releases in four weeks, each one shipping the defects it found as documentation.'],
              ['52 MCP tools', 'Every capability reachable over the public protocol, on every tier including the free one.'],
              ['Nine README languages', 'English, 简体中文, 繁體中文, Español, Русский, Deutsch, ไทย, 한국어, 日本語.'],
              ['0 third-party dependencies', 'install_requires is an empty list — and a regression test that fails if it stops being one.'],
              ['298 MB at 100,000 records', 'The whole store resident in memory, which is what makes 0.21 ms recall possible without a vector service.']
            ] },

          { h: 'The company behind it',
            tools: [
              ['Guangdong Xinshiming Industrial Co., Ltd.', '广东鑫室铭实业有限公司 — the operating entity behind Mnemosyne OS. Registered capital HKD 10,000,000; established 27 May 2013.'],
              ['Registered address', 'Tianhe Street No. 30, Guangdong-Macao In-Depth Cooperation Zone, China.'],
              ['Founder & CEO — Hu Jingkun (胡景堃)', 'Nanjing University, a Project 985 and Project 211 institution. 22 years as a Human Resources Vice President at Fortune Global 500 companies. Author of the Mnemosyne OS engine.'],
              ['Customer service — +86 756 8935999', 'Monday to Friday, during PRC business hours.'],
              ['Engineering — SkillHub', 'The internal component and skill distribution platform that ships alongside Mnemosyne OS.'],
              ['Open source — github.com/MnemosyneOS/mnemosyne', 'The complete engine, documentation and regression harnesses, MIT licensed.'],
              ['Package — PyPI ai-memo-os', 'Installed with a single pip command; no build step and no compiler.'],
              ['X — @mnemosyne_oos', 'Release announcements and short engineering notes.']
            ] },

          { note: '*Just as every application needs a database, every AI agent needs memory. We are building the default memory layer for AI agents — so that every developer can reach it, and own it.' }
        ]
      },

      contact: {
        eyebrow: 'Contact us', h1: 'Talk to the Mnemosyne OS team.', split: true,
        lede: 'Deployment questions, product demos, an enterprise evaluation or a partnership — tell us what you need and the team will get back to you directly.',
        form: { submit: 'Submit', ok: 'Thank you — your message has been recorded.', fields: [
          ['f1', 'Name', 'First and last name', 'text'],
          ['f2', 'Email', 'Your email address', 'email'],
          ['f3', 'Company', 'Company name', 'text'],
          ['f4', 'How can we help?', 'Tell us how we can help…', 'area']
        ] },
        blocks: [
          { h: 'Direct channels',
            tools: [
              ['Customer service — +86 756 8935999', 'Monday to Friday, during PRC business hours.'],
              ['Company — Guangdong Xinshiming Industrial Co., Ltd.', '广东鑫室铭实业有限公司 · registered capital HKD 10,000,000.'],
              ['Address — Tianhe Street No. 30, Guangdong-Macao In-Depth Cooperation Zone, China', 'Visits by appointment; please call ahead.'],
              ['GitHub Issues', 'Bug reports, feature requests and security-adjacent questions. Preferred for anything technical.'],
              ['Enterprise and OEM', 'Air-gapped deployment, source-level agreements and white-label licensing.']
            ] },
          { h: 'What to expect',
            ul: [
              '<b>Engineering questions</b> are usually answered fastest through GitHub Issues, where the answer stays searchable for the next person.',
              '<b>Enterprise evaluations</b> include a deployment walkthrough and the compliance mapping for your jurisdiction.',
              '<b>Security reports</b> are acknowledged on receipt and fixed before disclosure — see the Trust Center for the model.'
            ] },
          { note: 'Product documentation, the full API reference and every regression harness are in the repository. Many questions are answered there already, without waiting for a reply.' }
        ]
      },

      careers: {
        eyebrow: 'Careers', h1: 'Build the memory layer for AI',
        lede: 'We are a small team working on a problem that is about to be everybody\'s: making AI agents remember reliably, cheaply and under the user\'s own control.',
        cta: [['Talk to us', '#/contact', 'primary'], ['Read the source', REPO, 'ghost']],
        blocks: [
          { h: 'No open roles right now',
            p: 'We are not hiring against a fixed list at the moment. That said, the fastest interview at a company like this is a pull request: if you have read the code, found something worth improving and shipped it, we will read it closely.',
            ul: [
              '<b>Open source first.</b> Contributions to github.com/MnemosyneOS/mnemosyne are the strongest signal we can read.',
              '<b>KNOWN_DEFECTS.md is public.</b> Anything in it is fair game, and a fix with a test is worth more than a CV.',
              '<b>Regressions are the point.</b> If your change makes the 94-assertion harness stronger, say so in the description.'
            ] },
          { h: 'What the work looks like',
            p: 'Retrieval quality, memory compression, storage engines and protocol work — held to a standard where a claim without an assertion attached does not count. If you enjoy reading a measurement, distrusting your own conclusion and writing down the failure anyway, this is that kind of team.',
            cards: [
              ['Retrieval and ranking', 'Fusion across five channels, relevance calibration, and honest empty results.'],
              ['Compression', 'Lossless, addressable compression with conservation proofs.'],
              ['Storage and ledger', 'SQLite internals, hash-chain integrity, tiering and forgetting economics.'],
              ['Protocol and integration', 'The MCP surface, multi-tenant isolation and host adapters.']
            ] },
          { note: 'Speculative applications are welcome at any time through the contact form — tell us what you would change in the engine first, and why.' }
        ]
      },

      startup: {
        eyebrow: 'Startup program', h1: 'Startup program',
        lede: 'If you are building an AI agent, memory is not something you should have to build twice. The program gives early-stage teams the Pro tier free while you find product–market fit.',
        cta: [['Apply through the contact form', '#/contact', 'primary'], ['Read the docs', '#/docs', 'ghost']],
        blocks: [
          { h: 'What the program includes',
            cards: [
              ['Pro tier, free for twelve months', 'Multi-tenant namespaces, the Qdrant vector backend, the HTTP gateway and priority support.'],
              ['A deployment walkthrough', 'We help you stand the stack up — including the free-tier package if you have no budget for infrastructure yet.'],
              ['Architecture review', 'A session on memory design: what to write, what to decay and what to never store. Most quality problems start here.'],
              ['No lock-in, by construction', 'Everything you store is a SQLite file. If you leave, you export with one command and keep all of it.']
            ] },
          { h: 'Who qualifies',
            ul: [
              '<b>Pre-seed to Series A</b>, with an agent or an agent-adjacent product in development.',
              '<b>Under 25 people</b>, and less than three years old.',
              '<b>Willing to keep the store yours</b> — we would rather have a reference than a hostage.',
              '<b>Not a competitor:</b> we are a memory layer, not an agent platform, and the program is for teams building on top.'
            ] },
          { h: 'Why we run it',
            p: 'Memory design is the part of agent engineering that is easiest to get wrong and hardest to retrofit. Teams that decide their write, decay and redaction policies early do not end up rebuilding a store six months in — and those are the teams whose feedback makes the engine better.',
            ul: [
              'Memory design review before the first line of integration code',
              'Direct channel for defects and feature requests during the program',
              'Migration support if you started on another memory layer'
            ] }
        ]
      }

    },

    zh: {

      docs: {
        eyebrow: '文档', h1: '使用 Mnemosyne OS 构建',
        lede: 'Mnemosyne OS 让 AI 智能体的记忆活得比会话更久。装一个包，在代码旁边留一个 SQLite 文件，然后让智能体自己决定什么值得记住。',
        cta: [['API 参考', '#/api', 'primary'], ['GitHub 上的 README', REPO + '/blob/main/README_CN.md', 'ghost']],
        blocks: [
          { h: '记住你的第一个记忆',
            p: '五分钟快速入门。不需要账号、不需要 API 密钥、不发网络请求 —— 引擎只跑 Python 标准库。',
            code: { n: 'python', b: [
              'pip install ai-memo-os',
              '',
              'from mnemosyne import MemoryBrain',
              '',
              'brain = MemoryBrain("./my_memories", enable_embeddings=False)',
              'brain.ensure_init()',
              '',
              'brain.retain("Apple Inc. was founded in 1976", fast=True)',
              '',
              'results = brain.recall("Apple", k=5)',
              'for score, record, reasons in results:',
              '    print(f"{score:.4f}  {record[\'content\']}")'
            ].join('\n') } },

          { h: '给你的编码代理增加内存',
            p: '先从 Claude Code 开始，然后任何支持 MCP 的宿主都可以。它们都指向同一个 stdio 服务端，所以记忆是共享的，而不是每个编辑器各存一份。',
            cards: [
              ['Claude Code / Claude Desktop', '把客户端指向 stdio 服务端，20 个工具直接出现，不用写适配层。'],
              ['Cursor', '同一段配置放进 mcp.json，编辑器就能跨会话记住你的项目决策。'],
              ['DeepSeek Harness', 'Patch 式部署指南 —— 只增补宿主配置，不覆盖你原有的内容。'],
              ['OpenWebUI', '地址指向 Streamable HTTP 网关，带上 Bearer 令牌，其他都不用改。']
            ] },

          { h: '让智能体自行注册',
            p: '四条命令建好存储、命名空间与令牌。不需要邮箱、不需要控制面板、不需要注册表单 —— 开跑所需的一切都在仓库里。',
            code: { n: 'bash', b: [
              '# 1 · 初始化存储（SQLite + SHA-256 哈希链账本）',
              'mnemosyne --dir ./mem init',
              '',
              '# 2 · 写入，再读回来',
              'mnemosyne --dir ./mem retain --content "Founded in 1976"',
              'mnemosyne --dir ./mem recall "founded" --k 5',
              '',
              '# 3 · 用租户令牌通过 MCP 暴露出去',
              'export MNEMOSYNE_MCP_TOKEN="your-secret-token"',
              'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace default',
              '',
              '# 4 · 打开本地控制台：记忆浏览、图谱视图、运行统计',
              'python -m mnemosyne.webui.web_server --port 9090'
            ].join('\n') } },

          { h: '仓库里的文档',
            p: '十四份文档与十个可运行示例，全部与代码一起做版本管理。',
            tools: [
              ['README_CN.md', '完整中文说明；另有八种语言的对应 README。'],
              ['docs/RECALL_STRATEGY.md', '召回是怎么组装的，以及每轮记忆注入是如何对照 token 预算被评估的。'],
              ['docs/ACCEPTANCE_GUIDE.md', '握手、子进程环境逐键对齐、冷热延迟预算、命名空间隔离、审计链。'],
              ['docs/KNOWN_DEFECTS.md', '已确证缺陷，逐项给出事实、实测证据、影响面与修法 —— 公开而不是藏起来。'],
              ['docs/DEPLOY_DEEPSEEK_HARNESS.md', '通过 MCP 把 Mnemosyne OS 接进宿主的部署指南，Patch 式，不覆盖任何原内容。'],
              ['docs/plugins/', '八份插件文档：numpy、qdrant、reranker、crypto、hrr、async、context-engine、sdk。'],
              ['examples/', '十个可运行脚本，从基础召回一直到 LangChain 链与进程内嵌入。'],
              ['CHANGELOG.md', '版本历史，以及每一次机制变更背后的证据。']
            ] },

          { note: '以上全部可离线运行。唯一需要联网的是两个可选的向量插件，且断网时会软退回本地 FTS5 索引。' }
        ]
      },

      api: {
        eyebrow: 'API 参考', h1: '不摆架子的记忆 API',
        lede: '一个 Python 类、一套命令行、一个 HTTP 面、52 个 MCP 工具 —— 底下是同一个 SQLite 文件。没有任何一个是定制接口，所以智能体能用 SDK，控制台也能读同一个存储。',
        cta: [['MCP 集成', '#/mcp', 'primary'], ['命令行参考', '#/cli', 'ghost']],
        blocks: [
          { h: 'Python —— MemoryBrain',
            p: '一个对象持有整个存储。写入、更正、召回、生成上下文快照都通过它。',
            code: { n: 'python', b: [
              'from mnemosyne import MemoryBrain',
              '',
              'brain = MemoryBrain("./memories", enable_embeddings=False)',
              'brain.ensure_init()',
              '',
              '# 写入 —— 指纹去重、实体抽取、版本链全部自动完成',
              'brain.retain("The user\'s GPU is an RTX 4090", fast=True)',
              '',
              '# 更正之前的说法，而不删除历史',
              'brain.retain("The user swapped to an RTX 5090", supersedes=old_id)',
              '',
              '# 会话历史，以及给下一轮的上下文快照',
              'brain.add_conversation_turn("session-1", "user", "Tell me about Apple")',
              'hits = brain.search_conversations("Apple", session_id="session-1")',
              'snapshot = brain.build_context_prompt(query="Apple", max_chars=2000)'
            ].join('\n') } },

          { h: '带 token 预算的召回',
            p: '预算是一条硬约束，不是提示。放不进正文的条目会被降级为可寻址的胶囊（稳定指针 + 关键原子），而不是被静默丢弃。账目会如实告诉你发生了什么。',
            code: { n: 'python', b: [
              'results, cost = brain.recall("what GPU do I use", k=5, budget_tokens=100)',
              '',
              'cost["budget_limit"]      # 100',
              'cost["budget_used"]       # 实际注入的 token 数',
              'cost["budget_respected"]  # True',
              'cost["capsule_count"]     # 被降级为胶囊的条数',
              'cost["dropped_count"]     # 恒为 0 —— 没有东西被直接扔掉'
            ].join('\n') } },

          { h: 'MCP 工具 —— 52 个，走 stdio 或 Streamable HTTP',
            p: '完整的工具面：四十一个原生（含 8.1.0 新增的二十一个记忆形成层工具），外加十一个沿用通行 Agent 记忆工具名的别名，既有 MCP 客户端无需重写。智能体只要声明它们就获得了记忆能力，不需要胶水代码，也不需要自写工具层。',
            tools: [
              ['retain', '写入一条记忆。'],
              ['recall', '在 token 预算内召回记忆；回传置信带与胶囊层级。'],
              ['retain_batch', '批量写入并透传元数据 —— 吞吐约为逐条写入的 15 倍。'],
              ['capsule', '把一条记忆压成 AIC 胶囊：稳定指针 + 结构化事实 + 关键原子。'],
              ['expand', '按指针取回原文，并做内容哈希校验。'],
              ['recall_health', '检索质量遥测：命中分布、被相关性下限剔除的条数、延迟、胶囊缓存命中率。'],
              ['stats', '运行计数 —— 写入、召回、节省的 token。'],
              ['graph_query', '从某个实体出发，沿知识图谱走 N 跳。'],
              ['temporal_query', '查询版本链 —— 某个时间点曾成立的事实，而不只是现在成立的。'],
              ['list_projects', '列出这个存储里隔离的命名空间。'],
              ['doctor', '体检：完整性、记录数、磁盘、向量后端、图边规模。'],
              ['audit', '读取审计轨迹。'],
              ['confidence_history', '系统当时有多确定，以及这份确定随时间如何变化。'],
              ['consolidate', '把高度相似或同义的多条记忆合并为一条代表记录；原文标记为 consolidated，绝不删除。'],
              ['reflect', '按类型 / 层 / 事实类型 / 置信度汇总，附高频实体、事实冲突检测与时间密度。'],
              ['dedup', '通过内容指纹与相似度检出重复与近重复；dry_run 只报告不写库。'],
              ['forget', '按 memory_id 或自然语言 query 遗忘一条记忆 —— 默认软遗忘，审计链保持完整。'],
              ['memory/export-v1', '通过记忆交换协议导出。'],
              ['memory/import-v1', '通过记忆交换协议导入。'],
              ['memory/claim', '把外部导出中的记忆认领进当前命名空间。'],
              ['add_memory', '客户端兼容别名 —— 为用户或智能体保存文本或对话历史。'],
              ['search_memories', '客户端兼容别名 —— 带过滤条件的语义检索。'],
              ['get_memories', '客户端兼容别名 —— 结构化过滤 + 分页列举。'],
              ['get_memory', '客户端兼容别名 —— 按 id 取回单条。'],
              ['update_memory', '客户端兼容别名 —— 覆盖文本与 / 或元数据。'],
              ['delete_memory', '客户端兼容别名 —— 删除单条。'],
              ['delete_all_memories', '客户端兼容别名 —— 清空一个作用域。'],
              ['delete_entities', '客户端兼容别名 —— 删除实体并级联。'],
              ['list_entities', '客户端兼容别名 —— 列出用户 / 智能体 / 应用 / 运行。'],
              ['list_events', '客户端兼容别名 —— 列出记忆操作。'],
              ['get_event_status', '客户端兼容别名 —— 轮询异步操作状态。']
            ] },

          { h: 'HTTP 与控制台',
            p: '同一个存储，在本地暴露出来。控制台随包发布、不依赖任何外部 CDN，REST 端点就是它跑的那一套。',
            code: { n: 'bash', b: [
              'python -m mnemosyne.webui.web_server --port 9090',
              '# 然后打开 http://127.0.0.1:9090',
              '# 首次运行会创建 admin / mnemosyne —— 登录后请改密码'
            ].join('\n') } },

          { note: '协议版本 2024-11-05 / 2025-03-26 / 2025-06-18 三档，在 initialize 时协商：客户端提议的版本在支持列表内就照它回，否则回服务端自己最高的那一档。MCP 工具面保持向后兼容：7.0.0 是 13 个，7.0.1 是 14 个，7.0.2 是 20 个，8.0.0 是 31 个，8.1.0 是 52 个，每次增加都是纯增量。' }
        ]
      },

      mcp: {
        eyebrow: 'MCP 集成', h1: '凡实现 MCP 的宿主，现在就能用',
        lede: 'MCP 服务端跑 stdio JSON-RPC，支持可选的令牌鉴权与多租户命名空间。三十一个工具、一条命令，没有需要长期维护的适配层。',
        cta: [['全部集成', '#/integrations', 'primary'], ['API 参考', '#/api', 'ghost']],
        blocks: [
          { h: '启动服务端',
            p: '桌面客户端走 stdio，跑在端口后面的一切走 Streamable HTTP。',
            code: { n: 'bash', b: [
              '# stdio —— 每个桌面客户端都认的形状',
              'export MNEMOSYNE_MCP_TOKEN="your-secret-token"   # 可选，但建议开启',
              'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace default',
              '',
              '# 客户端一侧就是三个键加一条命令',
              '{',
              '  "mcpServers": {',
              '    "mnemosyne": {',
              '      "command": "python",',
              '      "args": ["-m", "mnemosyne.webui.mcp_server",',
              '               "--brain-dir", "./mem", "--namespace", "default"],',
              '      "env": { "MNEMOSYNE_MCP_TOKEN": "your-secret-token" }',
              '    }',
              '  }',
              '}'
            ].join('\n') } },

          { h: '现在就能挂上的宿主',
            p: '下面每一条都只是配置项，不是一个集成项目。',
            cards: [
              ['Claude Code / Claude Desktop', 'stdio JSON-RPC，连上就出现全部 52 个工具。'],
              ['Cursor', '通过 mcp.json 走 stdio，项目决策跨会话留存。'],
              ['OpenWebUI', 'Streamable HTTP 加一个 Bearer 令牌。'],
              ['Hermes Agent', 'stdio。常驻智能体由此获得一层跨越它所有会话的记忆。'],
              ['DeepSeek Harness', '按仓库部署指南走 stdio。'],
              ['任何 MCP 宿主', '凡实现 Model Context Protocol 就能用 —— 上面每一条都不是私有接口。']
            ] },

          { h: '租户隔离是物理的',
            p: '令牌映射命名空间，命名空间映射各自的存储。这不是在一张共享表上做权限过滤。',
            ul: [
              '<b>一把令牌，一个命名空间。</b> 服务端从令牌解析命名空间，客户端无法索取别人的。',
              '<b>每个命名空间一个独立 SQLite 文件与独立向量集合。</b>',
              '<b>每个命名空间一条独立的哈希链审计轨迹</b>，审查一个租户的账本不需要暴露另一个。',
              '<b>list_projects</b> 只枚举这把令牌有权看到的命名空间。'
            ] },

          { h: '默认的安全姿态',
            p: '不配置也合理，配置了可审查。',
            ul: [
              '<b>连接时做令牌鉴权</b>；纯本地 stdio 用途可以不开。',
              '<b>每次写入前都过安全公证</b>：凭据检测、不可见 Unicode 检测、HTML 注入检测，然后做字段级脱敏。',
              '<b>显式传入的置信度不会被覆盖。</b> 调用方写入 confidence 0，得到的是撤回，而不是被静默改写。',
              '<b>默认软遗忘。</b> confidence 归零、记录标记为 deleted，审计链保持完整；物理删除需要显式 evict=true。'
            ] },

          { note: '一个已知边界，如实说明：与库内任何内容都没有词面或标签锚点的纯改写问句，可能落到相关性下限之下并返回空。这是刻意的取舍 —— 对智能体而言，空结果比五条无关记忆安全得多。重排插件存在的意义就是补上剩下的缺口。' }
        ]
      },

      cli: {
        eyebrow: '命令行界面', h1: '整台引擎，从终端就能用',
        lede: 'Python API 里的每一项能力都有对应命令。没有任何东西藏在 SDK 后面 —— 所以命令行也是验证引擎是否正常的最快方式。',
        cta: [['使用文档', '#/docs', 'primary'], ['API 参考', '#/api', 'ghost']],
        blocks: [
          { h: '日常命令',

            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem init',
              'mnemosyne --dir ./mem retain --content "Apple Inc. was founded in 1976"',
              'mnemosyne --dir ./mem recall "Apple" --k 5',
              'mnemosyne --dir ./mem consolidate --dry-run'
            ].join('\n') } },

          { h: '体检、图谱与审计',
            p: '这三条值得放进定时任务或 CI 步骤。',
            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem status --json',
              'mnemosyne --dir ./mem doctor --json',
              '',
              'mnemosyne --dir ./mem graph-query "Steve Jobs" --depth 2 --json',
              '',
              'mnemosyne --dir ./mem verify-integrity --json',
              'mnemosyne --dir ./mem ledger-audit <memory_id>'
            ].join('\n') } },

          { h: '数据进出',
            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem export --format json --out ./memories.json',
              'mnemosyne --dir ./mem import ./memories.json',
              '# migrate 只对旧版 JSONL 后端有效（SQLite 库没有 index.jsonl）:',
              'mnemosyne --dir ./old migrate --jsonl ./old/index.jsonl'
            ].join('\n') } },

          { h: '本地控制台',
            p: '暗色管理界面由包自身提供 —— 不依赖外部 CDN、无遥测、无需账号。含记忆浏览器、图谱视图与运行统计。',
            code: { n: 'bash', b: [
              'python -m mnemosyne.webui.web_server --port 9090',
              '# http://127.0.0.1:9090 —— 默认账号 admin / mnemosyne'
            ].join('\n') } }
        ]
      },

      trust: {
        eyebrow: '信任中心', h1: '安全、合规与认证',
        lede: '没有东西离开这台机器，所以信任边界就是文件系统。我们要声明的不是 Mnemosyne OS 持有某张证书 —— 而是它的行为可以被审查，下面每一条都能对应到你可以读的代码。',
        cta: [['仓库里的安全模块', REPO + '/tree/main/security', 'primary'], ['已知缺陷', REPO + '/blob/main/docs/KNOWN_DEFECTS.md', 'ghost']],
        blocks: [
          { h: '信任边界就是一个文件',
            p: '链路里没有任何托管控制面。记忆是磁盘上的一个 SQLite 文件，账本在同一个数据库里，核心不导入 Python 标准库之外的任何东西。删掉那个文件就是一次完整、可审计的删除 —— 没有副本需要追。',
            ul: [
              '<b>核心零第三方依赖。</b> install_requires 是空列表，并且会一直保持。',
              '<b>无遥测。</b> 没有需要关闭的东西，因为什么都没采集。',
              '<b>默认离线。</b> 向量层是可选的，断网时软退回本地 FTS5 索引。'
            ] },

          { h: '篡改从一开始就可被发现',
            p: '每次写入都串进 SHA-256 账本。校验不只告诉你"有东西被改过"，而是指出是哪一条记录被改 —— 这让篡改从"可否认"变成"可检测"。',
            code: { n: 'bash', b: [
              'mnemosyne --dir ./mem verify-integrity --json',
              '# { "chain_valid": true, "records_checked": 10287 }',
              '',
              'mnemosyne --dir ./mem ledger-audit <memory_id>',
              '# 围绕某一条记录走一遍链'
            ].join('\n') } },

          { h: '安全公证',
            p: '写入前的检查阶段，SDK、命令行、MCP 与批量路径全都会走。',
            ul: [
              '<b>凭据检测</b> —— API 密钥、密码、卡号在落库前就被识别。',
              '<b>不可见 Unicode 检测</b> —— 零宽字符与双向控制符会被暴露出来，而不是被存下去。',
              '<b>HTML 注入检测</b> —— 标记会被标记出来，而不是原样持久化、等着下游渲染器去执行。',
              '<b>字段级脱敏</b> —— 敏感字段在写入时打码，公证的原始判断保留在 meta 里而不是被丢弃。'
            ] },

          { h: '合规',
            p: 'HIPAA、等保、GDPR 与 PIPL 的映射与账本一起维护，因此合规审查可以用证据回答，而不是填一份问卷。',
            tiles: [['HIPAA', '医疗数据映射'], ['等保', '国内基线'], ['GDPR', '欧盟数据保护'], ['PIPL', '个人信息保护法']] },

          { note: '关于范围的如实说明：Mnemosyne OS 是引擎，不是证书。正式认证是一次部署实践，取决于你的基础设施、留存策略与审计方 —— 这也是企业版存在的理由。开源仓库里提供的是机制、证据，以及复现两者的能力。' }
        ]
      },

      status: {
        eyebrow: '状态', h1: '没有托管服务可以宕机',
        lede: 'Mnemosyne OS 跑在你的数据所在的地方，所以这里的"状态"指的是你自己节点的健康状况，而不是我们的可用性。三条命令足以覆盖，且全部可断网运行。',
        cta: [['跑一次体检', '#/cli', 'primary'], ['API 里的可观测性', '#/api', 'ghost']],
        blocks: [
          { h: '检查你自己的节点',
            code: { n: 'bash', b: [
              '# 进程体检：完整性、记录数、磁盘、向量后端、图边规模',
              'mnemosyne --dir ./mem doctor --json',
              '',
              '# 运行计数：写入、召回、节省的 token',
              'mnemosyne --dir ./mem status --json',
              '',
              '# 账本完整性 —— 若被改过，会指出是哪一条',
              'mnemosyne --dir ./mem verify-integrity --json'
            ].join('\n') } },

          { h: 'recall_health 报什么',
            p: '7.0.2 新增这一面是有具体原因的：记忆栈可以"活着"却正在变差。随会话时长退化的召回质量，在可用性检查里完全隐形，所以这一面报的是质量，不只是存活。',
            tools: [
              ['calls / empty_result_rate', '召回被调用多少次，以及"没有相关记忆"这个诚实答案出现多少次。'],
              ['floor_rejections', '在被模型看到之前，有多少候选被相关性下限剔除。'],
              ['latency p50 / max', '检索延迟的中位与尾部。'],
              ['channel_hits', '五路召回通道里，实际贡献了分数的是哪几路。'],
              ['sem_top1 / sem_background', '候选余弦的 top1 与语料中位数 —— 用来发现阈值漂移的信号。'],
              ['capsule_cache', '胶囊缓存命中率，这正是上游提示缓存能持续命中的原因。'],
              ['vector_ops / breaker', '向量写入与删除的结果，以及熔断器状态与按原因分类的丢弃计数。'],
              ['graph', '边数、实体数、qualifier 覆盖率与回填状态。']
            ] },

          { h: '健康的节点会报',
            ul: [
              '<b>chain_valid: true</b>，且记录数与你预期一致。',
              '<b>没有丢弃的向量写入。</b> 熔断器是闭合的，dropped_unavailable 为 0。',
              '<b>图边存在。</b> 边数非零，说明知识图谱通道是真的在承担召回，而不是名义上存在。',
              '<b>胶囊缓存命中率非零</b> —— 在跑过几次召回之后。'
            ] },

          { note: '每个版本的更新记录（包括发现并修掉的缺陷）都在仓库的 CHANGELOG.md 里。把失效模式公开，本身就是产品的一部分。' }
        ]
      },

      research: {
        eyebrow: '研究', h1: '一套只跑标准库的记忆层',
        lede: '大多数记忆系统都假定有一个向量数据库、一个嵌入服务和一个云端控制面。Mnemosyne OS 一个都不假定，然后测量这件事的代价与收益。下面是架构与证据。',
        cta: [['性能基准', '#/benchmarks', 'primary'], ['复现测量', REPO + '/blob/main/scripts/verify_recall_quality.py', 'ghost']],
        tiles: [['0.21ms', '召回延迟 p50'], ['0.3ms', '每条写入'], ['298MB', '10 万条常驻'], ['8/8', 'precision @ 1']],
        blocks: [
          { h: '业界公认的三大基准测试',
            p: '记忆系统之间比的就是这三个公开基准。Mnemosyne OS 三项全部实测，并列出 Mem0 自己公开的分数作对照。',
            tools: [
              ['LongMemEval —— <b>96.2</b>  ·  Mem0 94.4', '长程对话：隔了很多轮会话之后，还能不能想起当初说过什么。'],
              ['LoCoMo —— <b>94.8</b>  ·  Mem0 92.5', '超长对话里的多会话记忆。'],
              ['BEAM（1M）—— <b>68.5</b>  ·  Mem0 64.1', '一百万 token 预算下的字节高效联想记忆。'],
              ['BEAM（10M）—— <b>53.9</b>  ·  Mem0 48.6', '同样的基准放大十倍预算，所有系统都会退化。']
            ] },

          { h: '五路召回，融合成一个结果',
            p: '召回不是一次相似度检索。五路独立信号并行给每个候选打分，再由重排器收敛，最后由相关性下限决定到底有没有东西配得上进入模型。',
            tools: [
              ['词法 —— BM25 / FTS5', 'Bigram 分词加内置同义词词典，对中文与英文同等用功。'],
              ['语义 —— 向量相似度', '可选。由 numpy 进程内后端或 Qdrant 插件提供；不开也能跑。'],
              ['知识图谱 —— 边遍历', '写入时抽取「主体 — 谓词 — 客体」边，读取时展开。'],
              ['时间衰减', '时效加权；只有当查询显式带有时间意图时，才切到事件时间。'],
              ['置信度加权', '系统对每条记忆的信任程度，看的是它的全部历史而不是当前值。']
            ],
            p2: '在五路之外还有一路结构化标签通道，让偏好与意图类问句保持可达 —— 这类问题几乎总是改写句，单靠语义分很容易落到下限之下。' },

          { h: '可逆压缩，而不是有损摘要',
            p: '用语言模型去摘要一条记忆，得到的是更短、但已经不再是那条记忆的东西：生成文本可能引入原文里根本没有的数字、日期和结论。AIC 胶囊走的是相反的路 —— 按结构压缩，并让原文始终可取回。',
            ul: [
              '<b>无损且可逆。</b> 每个胶囊都带一条指回原文的指针；expand() 逐字取回并校验内容哈希。',
              '<b>零幻觉是结构保证的。</b> 全程不做生成。要点是抽取式的，事实来自规则三元组，每个片段都必须是原文的逐字子串。',
              '<b>事实守恒。</b> 数字、日期、金额、型号、URL、邮箱与引号原话被视为"原子"，在所有压缩层级都完整保留。',
              '<b>五级阶梯。</b> full → gist → facts → pointer → atoms，每一级都按同一套原子集校验。',
              '<b>内容寻址。</b> 胶囊 key 由内容哈希、id、类型、时间与预算档共同派生，所以同一记忆在同一预算下产出逐字节相同的胶囊 —— 这正是上游前缀缓存能持续命中的原因。'
            ] },

          { h: '是测出来的，不是声称的',
            p: '下面每个数字都由仓库里的脚本产出，跑在真实存储上，而这套测量脚本是发版前第一个要跑的东西。',
            tools: [
              ['召回延迟 p50 —— <b>0.21 ms</b>', '端到端质量对照，对接真实向量栈。'],
              ['存储层写入 —— <b>0.3 ms / 条</b>', '仅存储层本身的耗时。'],
              ['完整写入路径 —— <b>约 1 ms</b>', '含安全公证、账本、审计与索引，这才是用户实际感受到的数字。'],
              ['常驻内存 —— <b>10 万条 298 MB</b>', '全部在内存里，这是没有向量服务也能做到亚毫秒召回的物理前提。'],
              ['Precision @ 1 —— <b>8 / 8</b>', '八条标注问答，对十六条同主题干扰项；包括在同一会话先问过 28 个无关问题之后。'],
              ['胶囊压缩 —— <b>0.51 压缩比</b>', '73 token 的原文在 40 token 预算下压到 pointer 层级，七个关键原子全部保留。'],
              ['批量写入 —— <b>约 15×</b>', 'retain_batch 相对逐条写入。'],
              ['亚秒级回归套件 —— <b>94 项断言</b>', '离线、不连任何外部服务，守的是原子守恒、零幻觉、无损往返与预算诚实。']
            ] },

          { h: '它所在的市场',
            p: '记忆之所以成为一个独立的基础设施品类，是因为「长上下文」被证明并不等于记忆。截至 2026 年的公开研究在主流模型上都测到：输入变长，准确率就下降 —— 这正是专用记忆层被推上台前的失效模式。',
            tiles: [['$6.27B', '智能体记忆市场 2026'], ['$28.45B', '2030 预测'], ['57%', '企业已在生产跑智能体'], ['40%+', '智能体项目面临取消风险']],
            p2: '最后这个数字最有意思。对停滞项目的分析反复指向召回不可靠，而不是基座模型太弱 —— 这正是为什么一个敢说"我没有相关记忆"的记忆层，比一个总能返回五条看似合理记录的记忆层更有价值。' },

          { note: '方法论：上面 Mnemosyne OS 的数字来自本项目自己的回归套件，可用 scripts/verify_recall_quality.py、verify_precision_recall.py 与 verify_memory_lifecycle.py 复现。市场数据引自 2026 年公开发布的分析与行业报告。' }
        ]
      },

      blog: {
        eyebrow: '博客', h1: '工程笔记',
        lede: 'Mnemosyne OS 是在公开场合被记录的，包括那些走错的部分。下面这些写下来的东西都存放在仓库里 —— 每一篇讲一个具体机制、支撑它的证据，以及做到它付出了什么代价。',
        cta: [['更新记录', '#/changelog', 'primary'], ['仓库全部文档', REPO + '/tree/main/docs', 'ghost']],
        blocks: [
          { h: '近期笔记',
            cards: [
              ['为什么我们不再摘要记忆', '生成式压缩会引入原文从未包含的事实。AIC 胶囊把生成换成抽取 —— 并且证明了这一点。'],
              ['相关性下限，以及"返回空"为什么是特性', '无论如何都填满 top-k，意味着最高分恒为 1.0，分数因此失去意义。经过标定的下限让相关性重新有绝对含义。'],
              ['十一项已确证缺陷，连证据一起公开', 'KNOWN_DEFECTS.md 逐条列出故障、复现方式、影响面与修法。读它是理解这台引擎真实行为最快的方式。'],
              ['召回策略，以及每轮注入的代价', '每一轮都注入记忆要花多少钱，以及 token 预算如何决定谁配得上这个位置。'],
              ['一个名义上存在的图通道', '实体抽取在悄悄产出碎片，于是图遍历永远返回空，却仍然占着融合权重。'],
              ['验收，而不是配置', '一份端到端证明这套栈可用的指南：握手、环境一致性、冷热延迟、命名空间隔离、审计链。']
            ] },
          { h: '文章',
            articles: ['kimi-vs-deepseek'] },
          { note: '更长的文章会在工程笔记整理成文后陆续发布在这里。一手资料仍然是仓库 —— 每个论断就挨着它的代码和验证它的测试。' }
        ]
      },

      integrations: {
        eyebrow: '集成', h1: '每个技术栈的记忆',
        lede: '为你已经建好的智能体框架、编码工具与语音管道加上持久记忆。下面每一条都走公开的 MCP 面或 Python SDK —— 没有分叉的客户端，也没有厂商插件。',
        search: { ph: '搜索集成…', all: '全部分类', none: '没有匹配这个搜索的集成。' },
        cats: ['MCP · stdio', 'MCP · HTTP', 'Python SDK', '插件 SDK', '本地模型'],
        items: [
          { n: 'Claude Code', c: 'MCP · stdio', i: 'CC', d: '连上就出现 52 个工具。智能体在会话之间记住决策，不需要被重新告知。',
            cp: 'claude mcp add mnemosyne -- python -m mnemosyne.webui.mcp_server --brain-dir ./mem' },
          { n: 'Claude Desktop', c: 'MCP · stdio', i: 'CD', d: '同一个 stdio 服务端，在 claude_desktop_config.json 里声明即可。',
            cp: '{"command":"python","args":["-m","mnemosyne.webui.mcp_server","--brain-dir","./mem"]}' },
          { n: 'Cursor', c: 'MCP · stdio', i: 'CU', d: '跨越会话的项目上下文 —— 约定、被否掉的方案与评审意见都牢牢挂在仓库上。',
            cp: '{"mcpServers":{"mnemosyne":{"command":"python","args":["-m","mnemosyne.webui.mcp_server"]}}}' },
          { n: 'DeepSeek Harness', c: 'MCP · stdio', i: 'DH', d: 'Patch 式部署：宿主配置只增补不覆盖，改动可回退。',
            cp: 'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace dsh' },
          { n: 'Hermes Agent', c: 'MCP · stdio', i: 'HA', d: '常驻智能体获得一层跨越它所有会话的长期记忆。',
            cp: 'python -m mnemosyne.webui.mcp_server --brain-dir ./mem --namespace hermes' },
          { n: 'Codex', c: 'MCP · stdio', i: 'CX', d: '任何支持 MCP 的命令行智能体都能挂上同一个服务端；工具面里没有宿主专属的东西。',
            cp: 'python -m mnemosyne.webui.mcp_server --brain-dir ./mem' },
          { n: 'OpenWebUI', c: 'MCP · HTTP', i: 'OW', d: '地址指向 Streamable HTTP 网关，带上 Bearer 令牌。对话前端从此不再忘记它在跟谁说话。',
            cp: 'python -m mnemosyne.webui.mcp_server --http --brain-dir ./mem --port 8788' },
          { n: '任何 MCP 宿主', c: 'MCP · HTTP', i: 'MP', d: 'Streamable HTTP 是一次部署唯一需要对外暴露的端口，网络面因此收敛为一个。',
            cp: 'MNEMOSYNE_MCP_TOKEN=<token> python -m mnemosyne.webui.mcp_server --http --port 8788' },
          { n: 'LangChain', c: 'Python SDK', i: 'LC', d: '可运行示例：把 MemoryBrain 作为检索与记忆组件接进链里。',
            cp: 'python examples/langchain_integration.py' },
          { n: 'Ollama', c: '本地模型', i: 'OL', d: '全本地闭环 —— 本地模型加本地记忆，没有任何请求离开这台机器。',
            cp: 'python examples/ollama_integration.py' },
          { n: '进程内嵌入', c: 'Python SDK', i: 'EM', d: '直接把 brain 导进你自己的进程。没有守护进程、没有端口、没有 IPC。',
            cp: 'from mnemosyne import MemoryBrain; MemoryBrain("./mem").ensure_init()' },
          { n: '插件目录', c: '插件 SDK', i: 'PL', d: '八个带文档的插件 —— numpy、qdrant、reranker、crypto、hrr、async、context-engine 与 SDK 本身。',
            cp: 'MNEMOSYNE_PLUGINS=numpy_vector,reranker python -m mnemosyne.webui.web_server' }
        ]
      },

      changelog: {
        eyebrow: '发行说明', h1: '版本更新记录',
        lede: '每一个版本，包括它发现并修掉的缺陷。完整文档与代码一起做版本管理 —— 这里是摘要。',
        cta: [['完整 CHANGELOG.md', REPO + '/blob/main/CHANGELOG.md', 'primary'], ['已知缺陷', REPO + '/blob/main/docs/KNOWN_DEFECTS.md', 'ghost']],
        blocks: [
          { h: '8.1.0 —— 2026 年 10 月 20 日',
            p: '这一版把"零依赖"从口号变成可验证的架构约束，同时让 Mnemosyne 的记忆 API 能够与既有 Agent 记忆代码直接互操作 —— 改一行 import 即可切换。',
            ul: [
              '<b>记忆 API。</b> <code>Memory</code> / <code>AsyncMemory</code> / <code>MemoryClient</code>，包顶层直接可 import：<code>from mnemosyne import Memory</code>。参数名、默认值、关键字限定、返回信封与错误码均已固定为契约。',
              '<b>四维作用域，物理隔离。</b> <code>user_id</code> / <code>agent_id</code> / <code>run_id</code> / <code>app_id</code> —— 每个组合一个独立 SQLite 文件，而不是"共享行 + 过滤条件"。命名空间由排序后 + 长度前缀哈希导出，因此 <code>(a, bc)</code> 与 <code>(ab, c)</code> 不碰撞，键顺序也不影响结果。',
              '<b>完整过滤语言</b> —— <code>eq</code> <code>ne</code> <code>gt</code> <code>gte</code> <code>lt</code> <code>lte</code> <code>in</code> <code>nin</code> <code>contains</code> <code>icontains</code> <code>startswith</code> <code>endswith</code> 与通配符，支持 <code>AND</code> / <code>OR</code> / <code>NOT</code> 任意嵌套。',
              '<b>72 个可选 provider</b> —— LLM 20、嵌入 13、向量库 28、重排 5、图存储 6。凡走 HTTP 的都在标准库 <code>urllib</code> 上实现，因此 <code>install_requires</code> 仍是空列表。',
              '<b>MCP 工具面 20 → 31。</b> 二十个原生，外加十一个沿用通行 Agent 记忆工具名的别名，既有 MCP 客户端无需重写工具定义即可指向 Mnemosyne。',
              '<b>服务面。</b> REST <code>/v1</code>、<code>/v2</code>、<code>/v3</code> 与控制台共用同一监听端口，带令牌鉴权与异步事件 id；兼容命令集并支持 <code>--agent</code> JSON 信封；提供 Claude、Codex、Cursor、Kimi 的清单；集成 LangChain、LlamaIndex、CrewAI、Dify、n8n 与 Vercel AI SDK。',
              '<b>修复九个真实缺陷，每个都有回归覆盖。</b> 最严重的一个：<code>meta</code> 不在列清单里，每次 <code>INSERT</code> 都静默丢弃它，读取路径随即<i>伪造</i>一个替代值 —— 用户元数据在重启后消失。<code>meta</code> 现已是真实列，并对存量库提供幂等迁移。',
              '<b>破坏性变更。</b> 客户端 API 移至 <code>mnemosyne/api/</code>，辅助模块同步改名。记忆存储格式、REST 路由与 MCP 工具名不受影响。'
            ] },
          { h: '7.0.2 —— 2026 年 9 月 15 日',
            p: '这一版把"精准记忆、精准召回、极短上下文下的精确压缩"从声称的能力，变成了可复现、可断言的事实。',
            ul: [
              '<b>AIC 记忆胶囊。</b> 把压缩重新定义为"分层 + 可寻址" —— 稳定指针 + 结构化事实 + 内容原子 —— 并以断言保证无损可逆、零生成、事实守恒。工具数 18 → 20。',
              '<b>相关性下限。</b> 此前每一路打分都对自身最大值归一化，导致融合分没有绝对含义。经过标定的下限让召回可以诚实地返回空。',
              '<b>去掉访问计数正反馈。</b> 此前仅仅先问过六个无关问题，就足以把干扰项抬到正确答案前面。现在加成是乘性的，且封顶 5%。',
              '<b>图通道真正承担召回。</b> 边写入时丢掉了记忆 id，导致图遍历从未真正返回过数据却仍占着融合权重。已修复，并对存量库回填。',
              '<b>时间通道纠正。</b> 正文里写了日期的记忆反而因为"更具体"被扣分。现在除非查询显式带时间意图，否则用记录自身的时效。',
              '<b>写入侧语义去重</b>，并附一条硬约束：改一个字就是另一个事实的片段，相似度再高也绝不合并。',
              '<b>recall_health</b> 与三段式 doctor —— 记忆栈可以活着却在变差，所以指标面必须报质量，而不只是存活。'
            ] },
          { h: '7.0.1 —— 2026 年 9 月 14 日',
            ul: [
              '<b>forget</b> 工具，默认软遗忘：置信度归零、状态标记为 deleted、审计链保持完整。工具数 13 → 14。',
              '<b>记忆更正</b>，通过 retain(supersedes=…) —— 旧说法被标记为 superseded 而非删除，召回会回传哪条已被取代。',
              '<b>Qdrant 向量后端插件</b>，内置熔断器、代理绕过、预热与健康探测 —— 一个跨进程持久的向量索引。',
              '<b>快速写入路径补上向量索引</b>，让经它写入的记忆也能参与语义召回。',
              '<b>三份新文档</b>，以及一套参数化的 21 项断言生命周期脚本。'
            ] },
          { h: '7.0.0 —— 2026 年 8 月 25 日',
            p: '第一个正式版：一套零依赖、本地优先的记忆系统。',
            ul: [
              'SQLite + FTS5，WAL 模式，兼容 JSONL，并提供 migrate 迁移路径。',
              'SHA-256 哈希链账本，verify_chain() 可指出被篡改的那一条记录。',
              '写入时公证：来源指纹、交叉印证、注入检测、时间一致性检查。',
              '插件体系：numpy_vector、crypto、reranker、hrr、async、context-engine。',
              'MCP 服务端，支持令牌鉴权与多租户命名空间隔离。13 个工具。',
              '记忆交换协议导出与导入。',
              '遗忘经济学：低价值记忆迁移至温 / 冷层，gzip 归档加布隆过滤 —— 而不是删除。',
              'Token 预算器、字段级脱敏、本地暗色控制台与异步 API。'
            ] }
        ]
      },

      pricing: {
        eyebrow: '定价', h1: '简单实惠',
        lede: '引擎是 MIT 许可，免费那一档也没有被阉割 —— 全部 52 个 MCP 工具都在里面。付费买的是托管、多租户与合规交付，而不是解锁你本来就有的功能。',
        plans: true,
        blocks: [
          { h: '你到底在为哪些东西付费',
            cards: [
              ['托管与协同', '托管部署包 —— 免费云主机、免费嵌入 API、免费 HTTPS 隧道 —— 让你不必自己运维。'],
              ['多租户', '令牌映射命名空间，存储与审计链都是物理独立，因此一次部署可以服务多个团队而不共享任何表。'],
              ['合规交付', '面向 HIPAA、等保、GDPR 与 PIPL 的映射、导出格式与审查通道。'],
              ['支持与 SLA', '从免费档的社区工单，到企业版的专属通道与 99.9% 可用性。']
            ] },
          { h: '部署方式始终由你选',
            p: '同一份源码可以跑在笔记本、私有虚拟机、Kubernetes 或气隙机柜上。付费档没有增加任何 MIT 引擎不具备的能力 —— 它增加的是协同、治理和一个可以打电话的人。',
            ul: [
              '<b>自托管是一等选项。</b> 免费额度部署包就在仓库里。',
              '<b>导出永远可用。</b> 带着你的记忆离开，就是一个命令行，任何档位都一样。',
              '<b>不按席位计费。</b> 每一档都含无限最终用户。'
            ] },
          { note: '价格为美元、按月计费、不含税。企业条款、OEM 授权与源码级协议请通过联系表单沟通。' }
        ]
      },

      'use-cases/customer-support': {
        eyebrow: '用例', h1: '客户支持',
        lede: '上个月写过信的用户，这个月应当被认出来。支持场景的记忆不是存对话记录 —— 是记住这个人、这些承诺，以及那些互相矛盾的地方。',
        cta: [['全部用例', '#/usecases', 'primary'], ['开始构建', '#/docs', 'ghost']],
        blocks: [
          { h: '会改变什么',
            cards: [
              ['跨工单、跨渠道的连贯性', '一个存储、每位客户一个命名空间。网页工单与电话记录看到的是同一段历史。'],
              ['能交接的升级备注', '归并后的情景摘要可以在智能体之间、以及智能体与人之间干净地交接。'],
              ['矛盾被摆出来，而不是被埋掉', '事实冲突检测会标记"两条记忆不可能同时为真"的情况 —— 这是支持场景里价值最高的信号。'],
              ['一本能给监管方看的账', '每一次读写都串进链里；审计轨迹是证据，而不是回忆。']
            ] },
          { h: '为什么本地优先在这里重要',
            p: '支持场景是个人数据最集中的地方，也恰好是监管最先看的地方。因为存储是你掌控的文件，留存策略变成一次文件系统操作而不是一场供应商谈判 —— 并且脱敏发生在写入时，早于数据在任何下游系统里存在。',
            ul: [
              '<b>字段级脱敏在写入时完成</b> —— 卡号与凭据从未进入存储。',
              '<b>软遗忘</b>既履行删除请求，又保持审计链完整。',
              '<b>每租户独立审计轨迹</b>，审查一位客户的账本不必暴露另一位。'
            ] },
          { h: '一个务实的形态',
            p: '每位客户对应一个命名空间。每一轮对话写成情景；其中的事实落进图谱。新工单进来时，召回只在这个命名空间内跑，且注入量小到最便宜的模型也扛得住。',
            ul: [
              '每条消息调 add_conversation_turn()',
              '模型看到工单之前先跑 <b>recall(budget_tokens=100)</b>',
              '定时跑 reflect()，把反复出现的实体与矛盾捞出来',
              '用 consolidate() 防止近重复情景挤占候选池'
            ] }
        ]
      },

      'use-cases/healthcare': {
        eyebrow: '用例', h1: '卫生保健',
        lede: '临床语境本质上是纵向的，而这里也是最不该让数据离开这栋楼的地方。Mnemosyne OS 维护一份从不越过边界的、按患者隔离的记忆。',
        cta: [['信任中心', '#/trust', 'primary'], ['联系我们', '#/contact', 'ghost']],
        blocks: [
          { h: '会改变什么',
            cards: [
              ['按患者隔离的连续性', '既往发现、治疗路径与偏好挂在患者身上，而不是挂在某次会话上。'],
              ['时序问题分别回答', '"上次就诊时是这样"与"现在是这样"是两个不同的问题，版本链两个都能答。'],
              ['设计上可气隙运行', '在院内网络中部署不需要任何出网，因为引擎本身没有云端依赖。'],
              ['防篡改的记录', '哈希链账本让任何改动都可被发现，并指出具体是哪一条。']
            ] },
          { h: '引擎能帮什么、不帮什么',
            p: 'Mnemosyne OS 是记忆层，不是临床决策系统。它决定哪些上下文值得被呈现，并证明没有被静默改动。诊断、剂量与临床判断不在它的范围内 —— 这是刻意的。',
            ul: [
              '<b>歧义在结构上被消解。</b>"患者对青霉素过敏"与"……曾经对青霉素过敏"是两个版本，而不是一条被覆盖的记录。',
              '<b>事实冲突被摆出来</b>，而不是按新旧直接判胜负。',
              '<b>去重拒绝合并</b>：只要数字、日期、剂量或标识符不同。'
            ] },
          { h: '合规姿态',
            p: 'HIPAA 的映射与机制一起维护，部署形态让数据驻留始终在你的掌控内 —— 院内、私有云或完全气隙。',
            tiles: [['HIPAA', '映射持续维护'], ['0 出网', '可气隙运行'], ['SHA-256', '哈希链账本'], ['本地', '你的基础设施']] }
        ]
      },

      'use-cases/education': {
        eyebrow: '用例', h1: '教育',
        lede: '记得学生已经懂了什么的辅导老师，比每节课重新开始的更有价值。Mnemosyne OS 给教学智能体一份关于学习者本身的持久模型。',
        cta: [['全部用例', '#/usecases', 'primary'], ['开始构建', '#/docs', 'ghost']],
        blocks: [
          { h: '会改变什么',
            cards: [
              ['关于学习者的模型，而不是一份逐字稿', '掌握了哪些概念、持有哪些误解、以及哪种节奏真的奏效。'],
              ['会变化的置信度', 'confidence_history 记录系统当时有多确定，以及随着证据到位这份确定如何移动。'],
              ['数据由学校掌控', '学生数据留在学校边界之内 —— 而这通常本来就是能不能被采用的前提。'],
              ['便宜模型也扛得住的注入量', '100 token 的注入让记忆不必依赖旗舰模型也照样可用。']
            ] },
          { h: '它是为这些问题而建的',
            ul: [
              '<b>"这个学生上学期卡在哪？"</b> —— 在版本链上做时序查询。',
              '<b>"哪几个误解反复出现？"</b> —— reflect() 的深度模式发现，跨情景扫描。',
              '<b>"哪种讲法对他有效？"</b> —— 偏好与意图经标签通道召回。',
              '<b>"这里有东西被改过吗？"</b> —— 账本用证据回答。'
            ] },
          { h: '部署',
            p: '一台院系机器就能跑完整个东西。向量层是可选的，所以没有 GPU 也没有云预算的学校，仅靠 SQLite 与 FTS5 就能获得完整功能。',
            ul: [
              '可离线运行 —— 教学闭环里没有网络依赖',
              '每个班级或每个学生一个 SQLite 文件，随你选',
              '断网时退回本地词法索引，而不是直接失败'
            ] }
        ]
      },

      'use-cases/sales-crm': {
        eyebrow: '用例', h1: '销售与客户关系管理',
        lede: 'CRM 里的记录大多是结构化事实，而成交线索往往在它们周围那些没被结构化的上下文里。Mnemosyne OS 记住的是决定为什么被做出，而不只是被做出过。',
        cta: [['全部用例', '#/usecases', 'primary'], ['开始构建', '#/docs', 'ghost']],
        blocks: [
          { h: '会改变什么',
            cards: [
              ['过程，而不只是结果', '关键联系人为什么换岗、是哪条异议真正杀掉了单子、三月份谁说了什么。'],
              ['带时间维度的客户历史', '"上季度这个客户处于什么位置"与"现在处于什么位置"是两个可分别回答的问题。'],
              ['团队之间的一致性', '一台机器、多个命名空间：共享的客户事实放共享命名空间，个人笔记留在私有命名空间。'],
              ['经得起追问的预测输入', '每个结论都能一路追回到产生它的那条记录。']
            ] },
          { h: '它放在哪个位置',
            p: 'Mnemosyne OS 不是系统记录。它待在 CRM 旁边，回答 CRM 从来就不是为它而设计的那些问题 —— 那些需要句子而不是字段的问题。',
            ul: [
              '<b>自动抽取实体</b>，把联系人、公司与产品变成图谱节点，不需要额外录入。',
              '<b>consolidate()</b> 防止几个月的近重复会议记录把主要来源挤出去。',
              '<b>检出冲突</b>：两位销售记下了互相矛盾的下一步动作。',
              '<b>forget()</b> 履行数据删除请求，同时不破坏审计链。'
            ] },
          { h: '一个务实的部署',
            p: '销售工具通常托管在云上，因此真正有意思的配置是多租户那一套 —— 一次部署、每个客户团队一个命名空间、用令牌映射做隔离，而不是权限过滤。',
            ul: ['令牌映射到命名空间', '每个命名空间独立存储与独立向量集合', '每个命名空间独立哈希链审计轨迹'] }
        ]
      },

      'use-cases/ecommerce': {
        eyebrow: '用例', h1: '电子商务',
        lede: '跨会话持续存在的个性化，同时不必把客户的历史送去第三方云。购物者之所以被认出来，是因为记忆就待在店铺旁边，而不是待在别人的机房里。',
        cta: [['全部用例', '#/usecases', 'primary'], ['开始构建', '#/docs', 'ghost']],
        blocks: [
          { h: '会改变什么',
            cards: [
              ['记住偏好，而不是设置项', '尺码、穿着体验的抱怨、避开的材质与偏好的品牌，记住一次，处处生效。'],
              ['跨会话的连续性', '助手不会再问三周前就已经被告知的事情。'],
              ['退货与支持上下文', '一次退货对话开始时，订单历史已经在上下文里了。'],
              ['快得像本地的延迟', '召回 p50 0.21 ms，意味着记忆不会给商品页加上任何可感知的延迟。']
            ] },
          { h: 'token 层面的论证',
            p: '个性化通常与成本对立，因为上下文每次调用都要重发。预算召回把这件事反过来：只有装得进预算的东西才进入模型，而装不进去的也不会被丢掉 —— 它作为胶囊保持可寻址。',
            ul: [
              '<b>budget_tokens 给注入量封顶</b>，再长的客户历史也无法把账单吹起来。',
              '<b>被降级的条目保留指针与关键原子</b>，所以尺码和订单号不会因为预算被砍掉而消失。',
              '<b>胶囊 key 由内容派生</b>，同一记忆在同一预算下产出逐字节相同的胶囊，上游前缀缓存持续命中。'
            ] },
          { h: '数据姿态',
            p: '购物车与浏览历史是零售商手上商业敏感度最高的数据之一。因为存储是你掌控的文件，留存窗口由你自己的流程执行，脱敏发生在写入之前，而不是事后从某个导出文件里补。',
            tiles: [['0 云端', '无第三方存储'], ['写入时', '即完成脱敏'], ['每租户', '独立审计链'], ['$0', '免费额度可部署']] }
        ]
      },

      about: {
        eyebrow: '关于我们', h1: 'Mnemosyne OS —— AI 代理的记忆层',
        lede: '因此，每一次互动都应当是个性化的、考虑周到的、高效的。而智能体只有记得住之前发生过什么，才可能做到这三点 —— 所以我们先做了自己愿意依赖的那层记忆。',
        cta: [['开始使用', '#/docs', 'primary'], ['阅读源码', REPO, 'ghost']],
        tiles: [['37', 'GitHub 星标'], ['300', 'PyPI 月下载量'], ['52', 'MCP 工具'], ['9', '文档语言数']],
        person: {
          img: 'data:image/jpeg;base64,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',
          kicker: '创始人 & CEO',
          name: '胡景堃　Hu Jingkun',
          role: 'Mnemosyne OS 创始人兼 CEO —— 广东鑫室铭实业有限公司',
          tags: ['南京大学', '985 / 211', '22 年全球 500 强 HRVP', 'AI 记忆基础设施'],
          bio: [
            '胡景堃（Frank Hu）毕业于南京大学（985 / 211）。此后 22 年，他在全球 500 强企业担任人力资源副总裁（HRVP）。那份工作最终总会回到所有大型组织都要面对的一个问题上：什么会被记住、被谁记住、又凭什么证据记住。',
            'Mnemosyne OS 源自那段经历里形成的一个判断 —— 一个组织最有价值、也最易流失的资产是上下文；而今天被部署进这些组织内部的 AI 智能体，面对的正是同一个问题。所以这台引擎刻意做成零依赖、本地优先：一个无法被审计的记忆层，就不是受监管业务能够依赖的记忆层。',
            '引擎由他本人编写，并且会把自测发现的缺陷公开出来 —— 包括 KNOWN_DEFECTS.md 里记录的那十一项。'
          ]
        },
        blocks: [
          { h: '面向人工智能代理的持久内存基础设施',
            p: 'Mnemosyne OS 8.1.0 是一套零依赖、本地优先的记忆系统，具备多级遗忘、哈希链账本、插件 SDK、本地控制台与完整的 MCP 支持。它是目前唯一一个核心完全不依赖第三方组件的记忆引擎 —— 不需要向量数据库、不需要 LLM 运行时、不被任何云锁定 —— 并且能在笔记本、服务器或无服务器基础设施上原样运行。',
            p2: '这条约束本身就是产品。Mnemosyne OS 里的每一项功能，都是因为拿掉依赖之后变得必需：遗忘经济学替代了无限增长，哈希链替代了对供应商的信任，可逆压缩替代了有损摘要。' },

          { h: '想象 · 使命 · 目的',
            cards: [
              ['想象', '一个 AI 助手记得你告诉过它什么，而这件事不需要把对话送去数据中心才能实现的世界。记忆成为一种家庭基础设施：永远在场，完全属于你。'],
              ['使命', '让持久记忆成为一种原语，而不是一条需要自己搭的管线。上下文之所以到达，是因为它相关，而不是因为它塞得进窗口 —— 并且对"记住了什么、改了什么、忘了什么"留有可证明的记录。'],
              ['目的', '在 AI 的下一个十年里，工具与同事的区别就是连续性。我们做的，是让智能体持续学习、适应、复利式积累，而不是每次从头开始的那一层。']
            ] },

          { h: '这些数字长什么样',
            p: '半年的工作，在公开场合被测量，而不是被声称。',
            tools: [
              ['版本 8.1.0 —— 2026 年 10 月 20 日', '四周内四个版本，每一个都把自身发现的缺陷作为文档交付。'],
              ['52 个 MCP 工具', '每一项能力都可通过公开协议触达，包括免费档在内的所有档位。'],
              ['九种 README 语言', 'English、简体中文、繁體中文、Español、Русский、Deutsch、ไทย、한국어、日本語。'],
              ['0 个第三方依赖', 'install_requires 是空列表 —— 并且有一个回归测试，一旦它不再是空列表就会失败。'],
              ['10 万条 298 MB', '整个存储常驻内存，这是没有向量服务也能做到 0.21 ms 召回的物理前提。']
            ] },

          { h: '背后的公司',
            tools: [
              ['广东鑫室铭实业有限公司', 'Mnemosyne OS 的运营主体。注册资本：壹仟万元港币（HKD 10,000,000）；成立于 2013 年 5 月 27 日。'],
              ['注册地址', '中国粤澳深度合作区天河街30号。'],
              ['创始人兼 CEO —— 胡景堃（Frank Hu）', '南京大学（985 / 211）毕业。22 年全球 500 强企业人力资源副总裁（HRVP）经历。Mnemosyne OS 引擎作者。'],
              ['客服 —— +86 756 8935999', '周一至周五，中国境内工作时间。'],
              ['工程 —— SkillHub', '随 Mnemosyne OS 一同交付的内部组件与技能分发平台。'],
              ['开源 —— github.com/MnemosyneOS/mnemosyne', '完整的引擎、文档与回归套件，MIT 许可。'],
              ['发行 —— PyPI ai-memo-os', '一条 pip 命令即可安装，无需构建步骤，无需编译器。'],
              ['X —— @mnemosyne_oos', '版本公告与短篇工程笔记。']
            ] },

          { note: '*就像每个应用程序都需要数据库，每个 AI 智能体都需要记忆。我们在做的，是人工智能智能体的默认记忆层 —— 让每个开发者都能够访问它，并且拥有它。' }
        ]
      },

      contact: {
        eyebrow: '联系我们', h1: '和 Mnemosyne OS 团队聊聊。', split: true,
        lede: '部署问题、产品演示、企业评估或合作意向 —— 告诉我们你的需求，团队会直接与你联系。',
        form: { submit: '提交', ok: '已收到，感谢你的留言。', fields: [
          ['f1', '姓名', '名字和姓氏', 'text'],
          ['f2', '电子邮件', '您的电子邮件', 'email'],
          ['f3', '公司', '公司名称', 'text'],
          ['f4', '我们能帮上什么忙？', '请告诉我们如何才能帮到您……', 'area']
        ] },
        blocks: [
          { h: '直接联系方式',
            tools: [
              ['客服 —— +86 756 8935999', '周一至周五，中国境内工作时间。'],
              ['公司 —— 广东鑫室铭实业有限公司', '注册资本：壹仟万元港币（HKD 10,000,000）。'],
              ['地址 —— 中国粤澳深度合作区天河街30号', '来访请提前预约，先致电确认。'],
              ['GitHub Issues', '缺陷报告、功能请求与安全相关问题。技术类问题走这里最快。'],
              ['企业与 OEM', '气隙部署、源码级协议与白标授权。']
            ] },
          { h: '会发生什么',
            ul: [
              '<b>工程类问题</b>通常通过 GitHub Issues 得到最快答复，而且答案会留在这里，方便下一个人检索。',
              '<b>企业评估</b>包含一次部署演示，以及针对你所在司法辖区的合规映射说明。',
              '<b>安全报告</b>收到即确认，并在披露之前修复 —— 详见信任中心的模型说明。'
            ] },
          { note: '产品文档、完整 API 参考与全部回归套件都在仓库里。很多问题在那里已经有答案，不必等回复。' }
        ]
      },

      careers: {
        eyebrow: '职业生涯', h1: '一起做 AI 的记忆层',
        lede: '我们是一个小团队，在做一件很快就会变成所有人问题的事：让 AI 智能体可靠地、低成本地、并且在用户自己的掌控之下记住东西。',
        cta: [['联系我们', '#/contact', 'primary'], ['阅读源码', REPO, 'ghost']],
        blocks: [
          { h: '目前没有开放职位',
            p: '我们眼下没有按固定清单在招人。不过在这种公司，最快的面试就是一个 pull request：如果你读了代码、发现了值得改的地方并且把它交付了，我们会认真读。',
            ul: [
              '<b>开源优先。</b> 对 github.com/MnemosyneOS/mnemosyne 的贡献，是我们能读到的最强信号。',
              '<b>KNOWN_DEFECTS.md 是公开的。</b> 里面任何一条都可以动手，一个带测试的修复比一份简历更有价值。',
              '<b>回归测试才是重点。</b> 如果你的改动让那套 94 项断言的套件更强，请在描述里写清楚。'
            ] },
          { h: '工作大概是什么样',
            p: '检索质量、记忆压缩、存储引擎与协议工作 —— 标准是：一个没有断言跟在后面的论断不算数。如果你享受读一个测量结果、怀疑自己的结论、然后把失败也照样写下来的过程，这就是那样的团队。',
            cards: [
              ['检索与排序', '五路融合、相关性标定，以及诚实地返回空结果。'],
              ['压缩', '无损、可寻址，并带守恒证明的压缩。'],
              ['存储与账本', 'SQLite 内部机制、哈希链完整性、分层与遗忘经济学。'],
              ['协议与集成', 'MCP 工具面、多租户隔离与宿主适配。']
            ] },
          { note: '随时可以通过联系表单投递自荐 —— 先告诉我们你会在引擎里改什么，以及为什么。' }
        ]
      },

      startup: {
        eyebrow: '创业计划', h1: '创业计划',
        lede: '如果你正在做 AI 智能体，记忆不该是需要做两遍的东西。这个计划为早期团队免费提供专业版，直到你找到产品与市场的契合点。',
        cta: [['通过联系表单申请', '#/contact', 'primary'], ['阅读文档', '#/docs', 'ghost']],
        blocks: [
          { h: '计划包含',
            cards: [
              ['专业版，免费十二个月', '多租户命名空间、Qdrant 向量后端、HTTP 网关与优先支持。'],
              ['一次部署陪跑', '我们帮你把这套栈立起来 —— 如果暂时没有基础设施预算，就用免费额度部署包。'],
              ['架构评审', '一次关于记忆设计的会：写什么、让什么衰减、什么永远不要存。大多数质量问题都从这一步开始。'],
              ['结构上没有锁定', '你存下的一切就是一个 SQLite 文件。想走的时候一条命令导出，全部带走。']
            ] },
          { h: '谁符合条件',
            ul: [
              '<b>天使轮到 A 轮之间</b>，有智能体产品或智能体周边的产品在开发中。',
              '<b>团队少于 25 人</b>，成立不满三年。',
              '<b>愿意让存储保持属于自己</b> —— 我们要的是一个案例，不是一个 hostage。',
              '<b>不是竞品：</b> 我们是记忆层，不是智能体平台，这个计划面向在它之上做东西的团队。'
            ] },
          { h: '我们为什么要做这件事',
            p: '记忆设计是智能体工程里最容易做错、也最难事后补的部分。早早定下写入、衰减与脱敏策略的团队，不会在半年后被迫重做一遍存储 —— 而这些团队的反馈，正是让引擎变好的输入。',
            ul: [
              '在写第一行集成代码之前先做一次记忆设计评审',
              '计划期内直达的缺陷与需求反馈通道',
              '如果你从别的记忆层迁过来，我们提供迁移支持'
            ] }
        ]
      }

    }
  };

  /* ======================================================================= *
   *  2 · STATE + HELPERS                                                     *
   * ======================================================================= */

  var root = document.documentElement;
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REDUCED = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false;
  var HAS_IO = (typeof window.IntersectionObserver === 'function');
  var HAS_RAF = (typeof window.requestAnimationFrame === 'function');

  var lang  = (root.getAttribute('data-lang') === 'zh') ? 'zh' : 'en';
  var themePref = root.getAttribute('data-theme-pref') || 'system';
  var T = DICT[lang];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function tx(key, fallback) {
    var v = T[key];
    return (v === undefined || v === null) ? (fallback || '') : v;
  }
  function icons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      try { window.lucide.createIcons(); } catch (e) {}
    }
  }

  /* ======================================================================= *
   *  3 · THEME                                                               *
   * ======================================================================= */

  var mq = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function systemDark() { return mq ? mq.matches : true; }
  function resolved() { return themePref === 'system' ? (systemDark() ? 'dark' : 'light') : themePref; }

  var THEME_ICON = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark:  '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    system:'<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'
  };

  function paintTheme() {
    var mode = resolved();
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-theme-pref', themePref);

    var meta = $('#meta-theme');
    if (meta) meta.setAttribute('content', mode === 'dark' ? '#08080A' : '#FFFFFF');

    var ic = $('#theme-icon');
    if (ic) ic.innerHTML = THEME_ICON[themePref] || THEME_ICON.system;

    $$('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-theme-set') === themePref ? 'true' : 'false');
    });
    $$('#theme-seg-m button').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-theme-set') === themePref ? 'true' : 'false');
    });

    rebuildDust();
  }

  function setTheme(pref) {
    themePref = pref;
    try { localStorage.setItem('mn-theme', pref); } catch (e) {}
    paintTheme();
  }

  if (mq) {
    var onSys = function () { if (themePref === 'system') paintTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  /* ======================================================================= *
   *  4 · NAVIGATION                                                          *
   * ======================================================================= */

  /* Header rows carry a label plus a one-line description — the density mem0
     uses. Resources widens into a list + featured card. */
  function signedInNav() { return !!(SESSION && uidOf(SESSION)); }

  function navHTML() {
    /* An entry flagged `auth` only exists once somebody is signed in, so
       a visitor never sees a link into a console they cannot open. */
    return (T.nav || []).filter(function (item) {
      return !item.auth || signedInNav();
    }).map(function (item, i) {
      if (!item.items && !item.mega) {
        /* 控制台入口常显，但带 data-need-login：点击层统一处理 ——
           未登录弹登录框，已登录才真的跳进控制台。href 仍指向控制台，
           万一脚本没跑到，路由侧 ensureRole 还会把他送回 #/login，
           两层兜底，不会出现"点进去是一个空壳管理员界面"。 */
        if (item.console) {
          var ch = esc(item.href || '#/dashboard/overview');
          return '<a class="navbtn plain" href="' + ch + '" data-need-login data-href="' + ch + '">' +
                 esc(item.label) + '</a>';
        }
        return '<a class="navbtn plain" href="' + esc(item.href || '#') + '">' + esc(item.label) + '</a>';
      }

      var panel;
      if (item.mega) {
        var list = item.mega.map(function (sub) {
          var ext = sub.ext ? ' target="_blank" rel="noopener"' : '';
          return '<a href="' + esc(sub.href) + '"' + ext + '>' + esc(sub.t) + '</a>';
        }).join('');
        var tiles = ((item.feat && item.feat.tiles) || []).map(function (t) {
          return '<span class="feat-tile"><span class="n">' + esc(t[0]) +
                 '</span><span class="u">' + esc(t[1]) + '</span></span>';
        }).join('');
        var feat = item.feat
          ? '<a class="feat" style="padding:0" href="' + esc(item.feat.href) + '">' +
              '<span class="feat-art">' + tiles + '</span>' +
              '<span class="feat-body"><h4>' + esc(item.feat.t) + '</h4><p>' + esc(item.feat.d) + '</p></span>' +
            '</a>'
          : '';
        panel = '<div class="menu wide" data-menu-panel="' + i + '">' +
                  '<div class="col">' + list + '</div>' + feat +
                '</div>';
      } else {
        var rows = item.items.filter(function (sub) {
          return !sub.auth || signedInNav();
        }).map(function (sub) {
          var ext = sub.ext ? ' target="_blank" rel="noopener"' : '';
          return '<a href="' + esc(sub.href) + '"' + ext + '>' +
                   '<span class="t">' + esc(sub.t) + '</span>' +
                   (sub.d ? '<span class="d">' + esc(sub.d) + '</span>' : '') +
                 '</a>';
        }).join('');
        panel = '<div class="menu" data-menu-panel="' + i + '">' + rows + '</div>';
      }

      return '<div class="rel">' +
               '<button class="navbtn" data-menu="' + i + '" aria-haspopup="true" aria-expanded="false">' +
                 esc(item.label) +
                 '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
               '</button>' + panel +
             '</div>';
    }).join('');
  }

  function sheetNavHTML() {
    return (T.nav || []).map(function (item) {
      if (!item.items && !item.mega) {
        if (item.console) {
          var ch = esc(item.href || '#/dashboard/overview');
          return '<a class="block py-3.5 text-[16px] text-fg border-b" style="border-color:var(--hair)" href="' +
                 ch + '" data-need-login data-href="' + ch + '">' + esc(item.label) + '</a>';
        }
        return '<a class="block py-3.5 text-[16px] text-fg border-b" style="border-color:var(--hair)" href="' +
               esc(item.href || '#') + '">' + esc(item.label) + '</a>';
      }
      var kids = (item.mega || item.items).map(function (sub) {
        var ext = sub.ext ? ' target="_blank" rel="noopener"' : '';
        return '<a href="' + esc(sub.href) + '"' + ext + '>' + esc(sub.t) + '</a>';
      }).join('');
      return '<details><summary>' + esc(item.label) +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
             '</summary>' + kids + '</details>';
    }).join('');
  }

  function closeMenus(except) {
    $$('.menu.on').forEach(function (m) {
      if (except && m === except) return;
      m.classList.remove('on');
      var id = m.getAttribute('data-menu-panel');
      var btn = $('[data-menu="' + id + '"]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      // 打开来源随面板一起清掉，否则下次 hover 展开会残留上一次的 click 标记
      // 注意这里必须用循环变量 m：写成 panel 会抛 ReferenceError，而它被
      // catch 吞掉，症状就是「hover 展开后一点就消失」，且控制台看不到任何报错。
      try { delete m.dataset.openedBy; } catch (err) { /* 老浏览器无 dataset，忽略 */ }
    });
  }

  function openMenu(id, source) {
    var panel = $('[data-menu-panel="' + id + '"]');
    var btn = $('[data-menu="' + id + '"]');
    if (!panel) return;
    closeMenus(panel);
    panel.classList.add('on');
    /* 记下是谁打开的。hover 展开的面板在被点击时**不能**当成"再点一次要收起"——
       否则用户 hover 展开、想去点其中一项、途中碰到按钮，面板当场消失，
       下拉菜单看起来就是坏的。区分来源后：hover 展开时第一次点击只接管，
       第二次才收起；触屏没有 hover，第一次点击即展开，两种设备行为一致。 */
    panel.dataset.openedBy = source || 'click';
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }

  /* mem0's top nav opens on hover — ours did not, which is why the menus read
     as "dead". Hover and click now both open; a short delay on the way out
     keeps the panel reachable while the pointer crosses the gap. */
  var menuTimer = null;

  document.addEventListener('mouseover', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var rel = t.closest('#mainnav .rel');
    if (!rel) return;
    var btn = rel.querySelector('[data-menu]');
    if (!btn) return;
    var id = btn.getAttribute('data-menu');
    var panel = $('[data-menu-panel="' + id + '"]');
    if (!panel || panel.classList.contains('on')) return;
    if (menuTimer) { clearTimeout(menuTimer); menuTimer = null; }
    openMenu(id, 'hover');
  });

  document.addEventListener('mouseout', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var rel = t.closest('#mainnav .rel');
    if (!rel) return;
    var to = e.relatedTarget;
    /* 判据从「指针是否还在这个按钮里」放大到「指针是否还在整条导航里」。
       原来只看 rel.contains(to)：而按钮与它展开的面板之间有 1 个安全间隙，
       指针从按钮移向面板时必然在间隙里经过一次 —— relatedTarget 落在
       body/其他节点上，140ms 后面板就关了，表现就是「鼠标放上去菜单
       立刻消失、根本点不到」。整个 #mainnav（含所有下拉面板）都算菜单，
       离开导航条才计时关闭。 */
    /* 判据用 #hdr 而不是 #mainnav：页头里除了导航条还有 logo 与按钮组，
       指针在它们之间移动时不该收起菜单。真正离开页头才计时关闭。 */
    if (to && to.closest && to.closest('#hdr')) return;
    if (menuTimer) clearTimeout(menuTimer);
    menuTimer = setTimeout(function () { closeMenus(); menuTimer = null; }, 140);
  });
  function closePops(except) {
    ['theme-pop', 'lang-pop'].forEach(function (id) {
      var p = $('#' + id);
      if (!p || p === except) return;
      p.classList.remove('on');
      var b = id === 'theme-pop' ? $('#theme-btn') : $('#lang-btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  /* ======================================================================= *
   *  5 · RENDERERS                                                           *
   * ======================================================================= */

  function renderStatic() {
    $$('[data-i18n]').forEach(function (el) {
      var v = T[el.getAttribute('data-i18n')];
      if (typeof v === 'string') el.textContent = v;
    });
    $$('[data-i18n-html]').forEach(function (el) {
      var v = T[el.getAttribute('data-i18n-html')];
      if (typeof v === 'string') el.innerHTML = v;
    });
    document.title = (T.meta && T.meta.title) || document.title;
  }

  function renderNav() {
    var m = $('#mainnav'); if (m) m.innerHTML = navHTML();
    var s = $('#sheet-nav'); if (s) s.innerHTML = sheetNavHTML();
    renderAccountNav();
    closeMenus(); closePops();
  }

  /* The header carries either the sign-in button or the signed-in account
     chip. Nothing is inferred from localStorage — SESSION is only ever set
     from a real SDK response. */
  function renderAccountNav() {
    var host = document.getElementById('nav-user');
    var cta = document.getElementById('nav-cta');
    var scta = document.getElementById('sheet-cta');
    if (!host) return;

    var signedIn = !!(SESSION && uidOf(SESSION));
    var zh = lang === 'zh';
    /* 「后台管理」是管理员专属。角色问回来之前先不画这个入口 —— 画出来再
       收回去会闪一下，而画错了会让成员以为进得去。拿不到角色就按非管理员
       处理，反正服务端还会再拦一次。 */
    if (signedIn && !DX_ROLE.loaded) dxEnsureRole().then(renderAccountNav);
    if (signedIn) {
      var mail = emailOf(SESSION);
      var disp = (SESSION.display_name || '').trim();
      var nm = disp || (mail ? String(mail).split('@')[0] : (zh ? '账号' : 'Account'));
      /* Avatar + name + caret, opening a panel. The name falls back to the
         local part of the address, and is ellipsised by CSS so a long one can
         never push the surrounding buttons around. */
      host.innerHTML =
        '<div class="rel">' +
          '<button class="mechip" type="button" data-menu="me" aria-haspopup="true" aria-expanded="false" title="' + esc(mail || nm) + '">' +
            avatarHTML(SESSION, 'av') +
            '<span class="nm">' + esc(nm) + '</span>' +
            '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
          '</button>' +
          '<div class="menu right" data-menu-panel="me">' +
            '<div class="mhead">' +
              avatarHTML(SESSION, 'av') +
              '<span class="tx"><span class="nm2">' + esc(nm) + '</span>' +
                (mail ? '<span class="em">' + esc(mail) + '</span>' : '') +
              '</span>' +
            '</div>' +
            '<a href="#/dashboard/overview"><span class="t">' + (zh ? 'Mnemosyne OS SaaS' : 'Mnemosyne OS SaaS') + '</span>' +
              '<span class="d">' + (zh ? '你的记忆、密钥、用量与设置' : 'Your memories, keys, usage and settings') + '</span></a>' +
            (DX_ROLE.loaded && isAdmin()
              ? '<a href="#/admin"><span class="t">' + (zh ? '后台管理' : 'Admin console') + '</span>' +
                '<span class="d">' + (zh ? '留言、成员、管理员与站点配置'
                                          : 'Leads, members, administrators, site settings') + '</span></a>'
              : '') +
            (DX_ROLE.loaded && isAdmin()
              ? '<a href="#/admin" data-ctab="account"><span class="t">' +
                (zh ? '账号设置' : 'Account settings') + '</span>' +
                '<span class="d">' + (zh ? '头像、资料与密码' : 'Picture, profile and password') + '</span></a>'
              : '<a href="#/dashboard/settings"><span class="t">' +
                (zh ? '账号设置' : 'Account settings') + '</span>' +
                '<span class="d">' + (zh ? '显示名与密码' : 'Display name and password') + '</span></a>') +
            '<button class="ma" type="button" data-act="signout">' +
              (zh ? '退出登录' : 'Sign out') + '</button>' +
          '</div>' +
        '</div>';
    } else {
      /* 未登录时右上角必须有一个明确的「登录」入口。
         原来这里是空的 —— 只剩「免费开始」，已经注册过的人得自己猜从哪进去。
         用 ghost 而不是 primary：主按钮的位置留给转化动作。
         <640 隐藏：手机上两个按钮 + 图标会挤爆顶栏（实测溢 19–30px），
         手机端的入口在汉堡菜单里（#sheet-cta 指向同一个 #/login）。 */
      host.innerHTML = '<a class="btn btn-ghost btn-sm hidden sm:inline-flex" href="#/login">' +
                       esc(lang === 'zh' ? '登录' : 'Log in') + '</a>';
    }
    if (cta) {
      cta.hidden = signedIn;
      /* Signed in, the primary button is the way into the console — that is
         where everything a member can do now lives. */
      if (signedIn) {
        cta.innerHTML = '';
      } else {
        cta.setAttribute('href', '#/login');
        cta.textContent = lang === 'zh' ? '免费开始' : 'Try Mnemosyne OS';
      }
    }
    if (scta) scta.setAttribute('href', signedIn ? '#/dashboard/overview' : '#/login');
  }

  function renderCode() {
    var tabs = $('#code-tabs');
    if (tabs) {
      tabs.innerHTML = CODE_TABS.map(function (t, i) {
        return '<button class="tab' + (i === 0 ? ' on' : '') + '" data-tab="' + t.id +
               '" role="tab" aria-selected="' + (i === 0) + '">' + esc(t.name) + '</button>';
      }).join('');
    }
    var panes = $('#code-panes');
    if (panes) {
      panes.innerHTML = CODE_TABS.map(function (t, i) {
        return '<div class="pane' + (i === 0 ? ' on' : '') + '" data-pane="' + t.id + '">' +
                 '<div class="term-body"><pre class="code"><code class="code">' + CODE_PANES[t.id] + '</code></pre></div>' +
               '</div>';
      }).join('');
    }
  }

  function renderStats() {
    var el = $('#stats'); if (!el) return;
    el.innerHTML = (T.stats || []).map(function (s) {
      var id = s.live ? ' id="stat-live"' : '';
      return '<div>' +
               '<div class="metric text-[34px] sm:text-[42px] text-fg"' + id + '>' + esc(s.value) + '</div>' +
               '<div class="k-label mt-3">' + esc(s.label) + '</div>' +
               '<p class="mt-2 text-[12.5px] leading-[1.6] text-fg3">' + esc(s.note) + '</p>' +
             '</div>';
    }).join('');
  }

  var proofIdx = 0, ucIdx = 0;

  function renderProof() {
    var seg = $('#proof-seg');
    if (seg) {
      seg.innerHTML = (T.proof || []).map(function (p, i) {
        return '<button role="tab" data-seg="proof" data-idx="' + i + '" aria-selected="' + (i === proofIdx) + '">' +
               esc(p.name) + '</button>';
      }).join('');
    }
    var body = $('#proof-body'); if (!body) return;
    var p = (T.proof || [])[proofIdx];
    if (!p) { body.innerHTML = ''; return; }
    var key = ['latency', 'compression', 'sovereignty'][proofIdx] || 'latency';
    var rows = (p.stats || []).map(function (r) {
      return '<div class="flex items-baseline justify-between gap-6 py-2.5" style="border-top:1px solid var(--hair)">' +
               '<dt class="k-label">' + esc(r[0]) + '</dt>' +
               '<dd class="mono text-[12.5px] text-fg2 text-right">' + esc(r[1]) + '</dd>' +
             '</div>';
    }).join('');
    body.innerHTML =
      '<article class="card card-pad">' +
        '<div class="flex items-start justify-between gap-4">' +
          '<div class="ico"><i data-lucide="' + esc(p.icon) + '"></i></div>' +
          '<span class="tag">' + esc(p.tag) + '</span>' +
        '</div>' +
        '<h3 class="mt-7 text-[17px] font-medium text-fg">' + esc(p.title) + '</h3>' +
        '<p class="mt-3 text-[13.5px] leading-[1.75] text-fg2">' + esc(p.body) + '</p>' +
        '<dl class="mt-7">' + rows + '</dl>' +
      '</article>' +
      '<div class="term"><div class="term-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span class="mono text-[11.5px]" style="color:#71717A">' + esc(p.title) + '</span></div>' +
        '<div class="term-body"><pre class="code"><code class="code">' + PANELS[key] + '</code></pre></div>' +
      '</div>';
  }

  function renderHow() {
    var el = $('#how-steps'); if (!el) return;
    el.innerHTML = (T.how || []).map(function (s) {
      return '<div class="step">' +
               '<span class="num">' + esc(s.num) + '</span>' +
               '<h3 class="mt-4 text-[17px] font-medium text-fg">' + esc(s.title) + '</h3>' +
               '<p class="mt-3 text-[13.5px] leading-[1.75] text-fg2">' + esc(s.body) + '</p>' +
               '<p class="mono mt-4 text-[11.5px] text-fg3">' + esc(s.meta) + '</p>' +
             '</div>';
    }).join('');
  }

  function renderArch() {
    var el = $('#arch-layers'); if (!el) return;
    var layers = (T.archLayers || []).map(function (l) {
      return '<div class="layer">' +
               '<div class="idx">' + esc(l.idx) + '</div>' +
               '<div>' +
                 '<h3>' + esc(l.title) + ' <span class="tagbox">' + esc(l.tag) + '</span></h3>' +
                 '<p>' + esc(l.body) + '</p>' +
                 '<p class="mono !text-[11.5px] !text-fg3 mt-3">' + esc(l.meta) + '</p>' +
               '</div>' +
             '</div>';
    }).join('');
    var c = T.archCloud || { stats: [] };
    var stats = (c.stats || []).map(function (s) {
      return '<div><dd class="metric text-[20px] text-fg">' + esc(s[0]) + '</dd>' +
             '<dt class="k-label mt-2">' + esc(s[1]) + '</dt></div>';
    }).join('');
    el.innerHTML = layers +
      '<div class="mt-10 pt-8 hair-t">' +
        '<h3 class="text-[14.5px] font-medium text-fg">' + esc(c.title) + '</h3>' +
        '<p class="mt-3 text-[13.5px] leading-[1.75] text-fg2">' + esc(c.body) + '</p>' +
        '<dl class="mt-7 grid grid-cols-3 gap-4">' + stats + '</dl>' +
      '</div>';
  }

  /* ---------------------------------------------------------------------
     Integrations — every entry rides the public MCP surface, so names and
     transports stay language-neutral and only the description is translated.
     Paths point at files that actually exist in the repository.
     ------------------------------------------------------------------- */
  var INTEGRATIONS = [
    { name: 'Claude Code / Claude Desktop', tp: 'MCP · stdio',
      href: REPO + '/blob/main/examples/mcp_usage.py', path: 'examples/mcp_usage.py',
      d: { en: 'Point the client at the stdio server and its tools appear with no adapter to write. Every memory is scoped by a project field, so the agent only ever sees its own.',
           zh: '把客户端指向 stdio 服务端，工具直接出现，不用写适配层。记忆按 project 字段隔离，每个智能体只看得到自己的。' } },
    { name: 'Cursor', tp: 'MCP · stdio', href: '', path: '',
      d: { en: 'Drop the same block into mcp.json and the editor carries your project decisions across sessions.',
           zh: '同一段配置放进 mcp.json，编辑器就能跨会话记住你的项目决策。' } },
    { name: 'Codex', tp: 'MCP · stdio',
      href: REPO + '/blob/main/examples/mcp_usage.py', path: 'examples/mcp_usage.py',
      d: { en: 'Listed in the console\'s known-agent registry, so its memories are counted and isolated from day one.',
           zh: '已在控制台的预置智能体名单中，写入的记忆从第一天起就被单独计数与隔离。' } },
    { name: 'OpenClaw', tp: 'MCP · stdio',
      href: REPO + '/blob/main/examples/mcp_usage.py', path: 'examples/mcp_usage.py',
      d: { en: 'One of the MCP clients named in the source. Token auth uses hmac.compare_digest, so the handshake is constant-time.',
           zh: '源码中明确点名的 MCP 客户端之一。令牌鉴权用 hmac.compare_digest，握手是常数时间的。' } },
    { name: 'DeepSeek Harness', tp: 'MCP · stdio',
      href: REPO + '/blob/main/docs/DEPLOY_DEEPSEEK_HARNESS.md', path: 'docs/DEPLOY_DEEPSEEK_HARNESS.md',
      d: { en: 'Patch-style deployment guide — the host config is amended, never overwritten.',
           zh: 'Patch 式部署指南 —— 只增补宿主配置，不覆盖你原有的内容。' } },
    { name: 'Hermes Agent', tp: 'MCP · stdio',
      href: REPO + '/blob/main/docs/DEPLOY_DEEPSEEK_HARNESS.md', path: 'docs/DEPLOY_DEEPSEEK_HARNESS.md',
      d: { en: 'A long-running agent gets a memory layer that outlives every session it starts.',
           zh: '常驻智能体获得一层跨越它所有会话的长期记忆。' } },
    { name: 'LangChain', tp: 'Python adapter',
      href: REPO + '/blob/main/examples/langchain_integration.py', path: 'examples/langchain_integration.py',
      d: { en: 'MnemosyneMemory is a framework-free bridge — load_memory_variables() and save_context(). Any agent that can load history can wear it.',
           zh: 'MnemosyneMemory 是一个不绑定框架的桥接类 —— load_memory_variables() 与 save_context()。任何能「读历史 + 存上下文」的智能体都能套上它。' } },
    { name: 'Ollama', tp: 'Local model',
      href: REPO + '/blob/main/examples/ollama_integration.py', path: 'examples/ollama_integration.py',
      d: { en: 'Fully local loop — local model plus local memory, with no request leaving the host.',
           zh: '全本地闭环 —— 本地模型 + 本地记忆，没有任何请求离开这台机器。' } },
    { name: 'Dify · Coze · n8n · AutoGPT', tp: 'Console isolation',
      href: REPO + '/blob/main/mnemosyne/webui/web_server.py', path: 'mnemosyne/webui/web_server.py',
      d: { en: 'The console maintains a known-agent registry and every data endpoint accepts ?agent=NAME, so one console serves many agents without cross-contamination.',
           zh: '控制台维护一份预置智能体名单，且所有数据接口都接受 ?agent=NAME —— 一个控制台服务多个智能体，互不串数据。' } },
    { name: 'Plugin catalogue', tp: 'Plugin SDK',
      href: REPO + '/tree/main/docs/plugins', path: 'docs/plugins/',
      d: { en: 'Eight documented plugins: numpy, qdrant, reranker, crypto, hrr, async, context-engine, sdk. Swapping the vector backend or adding encryption is a config change.',
           zh: '八个带文档的插件：numpy、qdrant、reranker、crypto、hrr、async、context-engine、sdk。换向量后端或加加密都只是改配置。' } }
  ];

  function renderIntegrations() {
    var el = $('#int-grid'); if (!el) return;
    el.innerHTML = INTEGRATIONS.map(function (it) {
      var link = it.href
        ? '<a class="pth" href="' + esc(it.href) + '" target="_blank" rel="noopener">' + esc(it.path) + '</a>'
        : '<span class="pth plain">' + (lang === 'zh' ? '仅需客户端配置' : 'client config only') + '</span>';
      return '<article class="intg">' +
               '<span class="text-[14.5px] font-medium text-fg">' + esc(it.name) + '</span>' +
               '<span class="tp">' + esc(it.tp) + '</span>' +
               '<p class="text-[13px] leading-[1.65] text-fg2">' + esc(it.d[lang] || it.d.en) + '</p>' +
               link +
             '</article>';
    }).join('');
  }

  function renderUseCases() {
    var seg = $('#uc-seg');
    if (seg) {
      seg.innerHTML = (T.uc || []).map(function (u, i) {
        return '<button role="tab" data-seg="uc" data-idx="' + i + '" aria-selected="' + (i === ucIdx) + '">' +
               esc(u.name) + '</button>';
      }).join('');
    }
    var body = $('#uc-body'); if (!body) return;
    var u = (T.uc || [])[ucIdx];
    if (!u) { body.innerHTML = ''; return; }
    body.innerHTML = (u.cards || []).map(function (card) {
      return '<article class="card card-pad flex flex-col">' +
               '<h3 class="text-[15px] font-medium text-fg">' + esc(card.title) + '</h3>' +
               '<p class="mt-3 text-[13.5px] leading-[1.75] text-fg2">' + esc(card.body) + '</p>' +
             '</article>';
    }).join('');
  }

  function renderBench() {
    var head = $('#spec-head');
    if (head) {
      head.innerHTML = '<tr>' + (T.specHead || []).map(function (h, i) {
        return '<th' + (i === 1 ? ' class="hl"' : '') + '>' + esc(h) + '</th>';
      }).join('') + '</tr>';
    }
    var body = $('#spec-body');
    if (body) {
      body.innerHTML = (T.specRows || []).map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          var cls = [];
          if (i === 1) cls.push('hl');
          if (i === 0) cls.push('whitespace-nowrap');
          return '<td' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' + esc(c) + '</td>';
        }).join('') + '</tr>';
      }).join('');
    }
  }

  function renderEnterprise() {
    var g = $('#ent-grid');
    if (g) {
      g.innerHTML = (T.ent || []).map(function (c) {
        return '<article class="card card-pad">' +
                 '<div class="ico"><i data-lucide="' + esc(c.icon) + '"></i></div>' +
                 '<h3 class="mt-5 text-[15.5px] font-medium text-fg">' + esc(c.title) + '</h3>' +
                 '<p class="mt-3 text-[13.5px] leading-[1.75] text-fg2">' + esc(c.body) + '</p>' +
               '</article>';
      }).join('');
    }
    var b = $('#ent-badges');
    if (b) {
      b.innerHTML = (T.entBadges || []).map(function (t) {
        return '<span class="tagbox2">' + esc(t) + '</span>';
      }).join('');
    }
  }

  /* One plan card, shared by the home section and the pricing page.
     Order follows mem0/pricing: name · badge → blurb → price → CTA →
     hairline → feature rows. */
  /* ===== 价格卡：月付 / 年付 + 币种 =====================================
     为什么周期和币种都做成「显式选择」而不是跟着语言走：
       语言决定的是**读什么字**，支付通道决定的是**能用什么付**。
       中文用户里有一大批只有 PayPal / 外卡的人（海外华人、跨境开发者），
       英文用户里也有能扫微信的。按语言锁通道 = 让一部分人根本付不了钱。
     为什么默认 USD 而不是跟着中文默认 CNY：
       人民币价约为美元价的 1/5（¥9.9 vs $6.9）。如果按浏览器语言自动给
       人民币价，等于对所有中文环境（含海外华人、能付美元的开发者）发一张
       五折以下的券。默认取**标价**，折扣由用户自己选，是更保守的做法。
     为什么切换按钮在**每张卡上**、但点击同步全部卡：
       用户看的是某一档的价，视线不会跳到页面顶部找开关；但每张卡各切各的
       会出现"Pro 显示年付价、Team 显示月付价"，同屏两套口径，读者会算错。 */
  /* 周期按**每张卡**独立记录，默认月付。
     早前是全局一个 interval，结果"给 Pro 选了年付，Team 也跟着变年付"——
     用户正在横向比较两档，联动会让人算错。 */
  /* 2026-10-24 站长要求：**默认人民币 + 微信支付**，美元 PayPal 放第二位。
     原来默认 USD 的理由是"人民币价约为美元价 1/5，默认低价等于发折扣券"，
     但站长明确要国内用户第一眼看到微信支付 —— 支付通道的可达性优先于价格锚点。
     首页的币种切换器仍在，想按美元付的人一键可切。 */
  var PRICE_STATE = { iv: {}, currency: 'CNY' };

  /* 取当前要显示的价格行。兼容两种数据形态：
     · 接口来的新形态（t.p.month / t.p.year，各含 usd / cny / 说明文案）
     · DICT 里的静态兜底（老形态 t.price / t.unit，只有月付美元）
     接口挂了也要能显示，所以必须兼容，不能直接取 t.p.month.usd。 */
  function priceRow(t) {
    if (!t.p) {
      return { iv: 'month', amount: t.price || '', note: t.footnote || '', legacy: true };
    }
    var iv = (t.hasYear && PRICE_STATE.iv[t.id] === 'year') ? 'year' : 'month';
    var row = t.p[iv] || t.p.month || {};
    var cny = PRICE_STATE.currency === 'CNY';
    return { iv: iv, amount: cny ? row.cny : row.usd, note: cny ? row.noteCny : row.noteUsd };
  }

  function priceUnit(t, iv) {
    var zh = lang === 'zh';
    if (t.isFree) return zh ? '/ 月' : '/ month';
    if (iv === 'year') {
      return t.perSeat ? (zh ? '/ 席位 / 年' : '/ seat / year') : (zh ? '/ 年' : '/ year');
    }
    return t.perSeat ? (zh ? '/ 席位 / 月' : '/ seat / month') : (zh ? '/ 月' : '/ month');
  }

  function planHTML(t) {
    /* 美元档除了跳转链接，再挂一个**页内 PayPal 按钮**（与控制台
       「套餐与用量」完全同一种交互）：能原地付款的人不该被先甩到控制台。
       按钮容器带 data-pp-plan，真正的 SDK 注入在两处统一做（见 mountPagePayPal）。
       微信（CNY）没有等价的页内 SDK，仍走原链接，落到控制台的扫码卡片。 */
    var ppPlan = '';
    if (!t.isFree && t.ppPlanId && PRICE_STATE.currency === 'USD') {
      ppPlan = '<div class="pp-slot-page" data-plan-id="' + esc(t.ppPlanId) + '"' +
               ' data-tier="' + esc(t.id) + '" style="max-width:100%;min-height:44px;margin-top:8px"></div>';
    }

    var feats = (t.feats || []).map(function (f) {
      return '<li class="feat' + (f[1] ? ' dim' : '') + '">' +
               '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
               '<span>' + esc(f[0]) + '</span></li>';
    }).join('');
    var p = priceRow(t);
    var zh = lang === 'zh';

    /* 卡内周期切换。只有真有两个周期的档才渲染 —— 加购包只做月付，
       给它一个假的"年付"按钮等于骗人。 */
    var seg = '';
    if (t.hasYear) {
      seg = '<div class="pseg pseg-sm" role="group">' +
              '<button type="button" data-piv="month" data-tier="' + esc(t.id) + '" ' +
                'aria-pressed="' + (p.iv === 'month') + '">' + (zh ? '月付' : 'Monthly') + '</button>' +
              '<button type="button" data-piv="year" data-tier="' + esc(t.id) + '" ' +
                'aria-pressed="' + (p.iv === 'year') + '">' + (zh ? '年付' : 'Yearly') + '</button>' +
            '</div>';
    }

    /* 年付时点明"等于付 10 个月"，月付时点明年付价 —— 两个方向都给对照，
       读者不用自己做除法。 */
    var extra = '';
    if (t.hasYear && t.p) {
      var alt = t.p[p.iv === 'year' ? 'month' : 'year'] || {};
      var altAmt = PRICE_STATE.currency === 'CNY' ? alt.cny : alt.usd;
      extra = (p.iv === 'year')
        ? (zh ? '相当于付 10 个月用 12 个月' : '12 months for the price of 10')
        : (zh ? '年付 ' + altAmt + '，省两个月' : 'Yearly ' + altAmt + ' saves 2 months');
    }

    /* CTA 直接写明走哪个通道 —— "开通 Pro" 这四个字不回答"我怎么付"。
       只在接口数据到位后才拼通道名：静态兜底卡没有 isFree 字段，
       给它拼会得到"免费开始（PayPal）"这种错话。 */
    var cta = t.cta || '';
    if (!t.isFree && t.p) {
      /* 站长要求两个通道都能在定价页直接下单：人民币走微信（默认），
         美元走 PayPal（第二）。按钮文案必须写清走哪条通道，
         否则用户点下去才发现是另一套收款方式。 */
      var chan = PRICE_STATE.currency === 'CNY' ? (zh ? '微信' : 'WeChat')
                                                : (zh ? 'PayPal' : 'PayPal');
      cta = zh ? cta + '（' + chan + '）' : cta + ' via ' + chan;
    }

    return '<div class="tier' + (t.rec ? ' tier-rec' : '') + '">' +
             '<div class="flex flex-wrap items-center justify-between gap-3">' +
               '<h3 class="tier-name">' + esc(t.name) + '</h3>' +
               (t.badge ? '<span class="' + (t.rec ? 'pill' : 'tagbox2') + '"' + (t.rec ? ' style="height:24px;padding:0 10px;font-size:11px"' : '') + '>' + esc(t.badge) + '</span>' : '') +
             '</div>' +
             '<p class="mt-3 text-[13px] leading-[1.6] text-fg3">' + esc(t.desc) + '</p>' +
             '<div class="mt-5">' + seg + '</div>' +
             /* 报价区：min-height 让四张卡的价目数字落在同一条基线 */
             '<div class="tier-price flex items-baseline gap-2">' +
               '<span class="metric text-[34px] tracking-[-.02em] text-fg">' + esc(p.amount) + '</span>' +
               '<span class="text-[13px] text-fg3">' + esc(priceUnit(t, p.iv)) + '</span>' +
             '</div>' +
             '<p class="price-note tier-note">' + esc(p.note || '') +
               (extra ? '<br>' + esc(extra) : '') + '</p>' +
             /* CTA 用统一的 tier-cta 度量：四张卡按钮等高、等宽、同一水平线。
                保留原本的 <a href> 行为与图标，只接管盒子尺寸。 */
             '<a class="btn ' + (t.rec ? 'btn-accent' : 'btn-ghost') + ' tier-cta mt-5" href="' + esc(t.href) + '">' +
               esc(cta) +
               '<span class="btn-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg></span>' +
             '</a>' +
             ppPlan +
             '<div class="rule my-6"></div>' +
             '<ul class="flex-1 tier-feats">' + feats + '</ul>' +
           '</div>';
  }

  function syncPriceSwitch() {
    var zh = lang === 'zh';
    var curEl = document.getElementById('currency-switch');
    if (curEl) {
      Array.prototype.forEach.call(curEl.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed',
          b.getAttribute('data-cur') === PRICE_STATE.currency ? 'true' : 'false');
      });
    }
  }

  /* 一个委托监听管住两处开关（页顶的 + 每张卡里的），不重复绑定 */
  document.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    var iv = el.closest('[data-piv]');
    var cu = el.closest('[data-cur]');
    if (!iv && !cu) return;
    e.preventDefault();
    if (iv) {
      var tk = iv.getAttribute('data-tier') || '';
      PRICE_STATE.iv[tk] = iv.getAttribute('data-piv') || 'month';
    }
    if (cu) PRICE_STATE.currency = cu.getAttribute('data-cur');
    renderTiers();
  });

  /* ------------------------------------------------- PayPal 页内按钮（定价页）
     2026-10-24 站长要求：定价页的支付体验必须和「套餐与用量」一致 ——
     既然控制台能原地弹 PayPal 付款，定价页就不该只有一条"跳转"链接。
     实现与 assets/console.js 的 mountPayPal **同一套参数**：
       · vault=true & intent=subscription（订阅必需，否则没有 subscription.create）；
       · currency 固定 USD —— 人民币走微信扫码，不经 PayPal；
       · locale 显式传，避免中国 IP 被推断成韩文弹窗；
       · custom_id 用登录邮箱，服务端 paypal-confirm 会拿它比对会话，防冒认。
     不重复造一套计费逻辑：付款确认仍打 /api/billing/paypal-confirm。 */
  var PP_PAGE = { loading: false, cbs: [], failed: false };

  function loadPayPalSdkPage(clientId, cb) {
    if (window.paypal && window.paypal.Buttons) return cb(true);
    if (PP_PAGE.failed) return cb(false);
    PP_PAGE.cbs.push(cb);
    if (PP_PAGE.loading) return;
    PP_PAGE.loading = true;
    var s = document.createElement('script');
    var loc = lang === 'zh' ? 'zh_CN' : 'en_US';
    s.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) +
            '&vault=true&intent=subscription&components=buttons&currency=USD' +
            '&locale=' + loc + '&buyer-country=CN';
    s.async = true;
    s.onload = function () {
      PP_PAGE.loading = false;
      var q = PP_PAGE.cbs; PP_PAGE.cbs = [];
      q.forEach(function (f) { try { f(true); } catch (e) {} });
    };
    s.onerror = function () {
      PP_PAGE.loading = false; PP_PAGE.failed = true;
      var q = PP_PAGE.cbs; PP_PAGE.cbs = [];
      q.forEach(function (f) { try { f(false); } catch (e) {} });
    };
    document.head.appendChild(s);
  }

  /* 定价页的按钮挂载：只处理 .pp-slot-page，不与控制台的 .pp-slot 抢节点 */
  function mountPagePayPal(clientId) {
    var slots = document.querySelectorAll('.pp-slot-page');
    if (!slots.length) return;
    loadPayPalSdkPage(clientId, function (okSdk) {
      if (!okSdk || !window.paypal || !window.paypal.Buttons) {
        /* SDK 打不开（国内网络常见）：不留空槽，写一句可读的说明，
           用户仍能点上面的 CTA 进控制台用微信或跳转支付。 */
        Array.prototype.forEach.call(slots, function (slot) {
          if (slot.getAttribute('data-mounted')) return;
          slot.setAttribute('data-mounted', '1');
          slot.innerHTML = '<div style="font-size:11.5px;line-height:1.6;color:var(--fg3);' +
            'text-align:center">' +
            esc(lang === 'zh' ? 'PayPal 按钮未能加载，请点上方按钮进入控制台用微信支付。'
                              : 'PayPal could not load. Use the button above and pay in the console.') +
            '</div>';
        });
        return;
      }
      var me = SESSION || {};
      Array.prototype.forEach.call(slots, function (slot) {
        if (slot.getAttribute('data-mounted')) return;
        var planId = slot.getAttribute('data-plan-id') || '';
        if (!planId) return;
        slot.setAttribute('data-mounted', '1');
        try {
          window.paypal.Buttons({
            style: { shape: 'rect', color: 'gold', layout: 'vertical',
                     label: 'pay', height: 40, tagline: false },
            createSubscription: function (data, actions) {
              return actions.subscription.create({
                plan_id: planId,
                /* 未登录时给空串：服务端会拒（它拿这个和会话邮箱比对）。
                   定价页对访客也显示按钮，但真正付款必须落在自己账号上。 */
                custom_id: String((me && (me.email || me.id)) || '')
              });
            },
            onApprove: function (data) {
              fetch('/api/billing/paypal-confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ subscription_id: data.subscriptionID })
              }).then(function (r) { return r.ok ? r.json() : null; })
                .then(function (b) {
                  if (b && b.ok && b.tier && b.tier !== 'free') {
                    toast((lang === 'zh' ? '订阅已生效：' : 'Subscription active: ') +
                          String(b.tier).toUpperCase());
                    location.hash = '#/dashboard/billing';
                  } else {
                    toast(lang === 'zh'
                      ? 'PayPal 已扣款，状态同步中，几秒后自动刷新'
                      : 'Paid — syncing your subscription, refresh in a moment');
                  }
                })['catch'](function () {
                  toast(lang === 'zh' ? '确认失败，请刷新后查看订阅状态'
                                      : 'Could not confirm — refresh to check your plan.');
                });
            },
            onError: function () {
              toast(lang === 'zh' ? 'PayPal 按钮加载失败，请改用微信或跳转支付'
                                  : 'PayPal failed to load — use WeChat or the link above.');
            }
          }).render(slot);
        } catch (e) { /* 单卡失败不影响其它卡 */ }
      });
    });
  }

  /* 每次重渲染卡片后重新挂载（切月/年、切币种都会重建 DOM） */
  var PP_CLIENT = '';

  function renderTiers() {
    var el = $('#tiers'); if (!el) return;
    /* 首次进入才拉接口；之后切月/年、切币种只是重渲染，不重复请求 */
    if (!T._live) { loadLivePricing(); return; }
    el.innerHTML = (T.plans || []).map(planHTML).join('');
    syncPriceSwitch();
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
    /* 美元档重画后要重新挂载页内按钮：旧的按钮节点随 innerHTML 一起没了 */
    if (PP_CLIENT && PRICE_STATE.currency === 'USD') mountPagePayPal(PP_CLIENT);
  }

  /* 价格数字格式化：6.9 → "6.9"，19.9 → "19.9"，69 → "69"。
     不做 toFixed(2)，因为 $6.90 在价格页读起来比 $6.90 笨重。 */
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return '0';
    return (Math.round(v * 100) / 100).toString();
  }

  function loadLivePricing() {
    if (!window.fetch) return;
    /* ⚠️ 这里必须自己取一次 #tiers：`el` 是 renderTiers 的**局部变量**，
       函数作用域链拿不到它。早前这行写的是裸 `el.innerHTML`，抛 ReferenceError
       后被下面的 .catch() 静默吞掉 —— 结果是「接口一直没被真正消费」，
       价格页永远停在静态值，而日志里一句错都没有。2026-10-23 实测发现。 */
    var el = $('#tiers'); if (!el) return;
    fetch('/v1/pricing', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.tiers || !d.tiers.length) return;
        var zh = lang === 'zh';

        /* 通道说明文案：用户最关心的不是"多少钱"，而是"我怎么付"。
           USD 走 PayPal 自动续费；CNY 走微信扫码 + 人工确认（PayPal 该账户
           不能收人民币，实测 CURRENCY_NOT_SUPPORTED_FOR_RECEIVER）。 */
        var noteUsd = zh ? '通过 PayPal 订阅，自动续费，可随时在 PayPal 内取消'
                         : 'Billed through PayPal Subscriptions — auto-renew, cancel anytime.';
        /* 不再写"人工确认"：这句话出现在价格页上会让人觉得"付了还要等"。
           实际开通方式见回复说明 —— 个人收款码没有回调，运营侧仍需一次确认；
           但这是后台动作，不该写在客户看的价目卡上。 */
        var noteCny = zh ? '微信扫码支付' : 'WeChat QR payment.';

        var plans = d.tiers.map(function (t) {
          var free = t.id === 'free';
          var team = t.id === 'team';
          var cny = t.cny || {};
          var hasYear = !free && Number(t.price_annual) > 0;
          var p = {
            id: t.id,
            name: t.name,
            badge: free ? (zh ? '免费' : 'FREE')
                 : team ? (zh ? '团队' : 'TEAM')
                 : (zh ? '最受欢迎' : 'POPULAR'),
            rec: t.id === 'pro' ? 1 : 0,
            isFree: free,
            perSeat: !!t.per_seat,
            hasYear: hasYear,
            desc: free
              ? (zh ? '全部 MCP 工具，不用绑卡。先让它替你记住一次。'
                    : 'Every MCP tool, no card required. See what persistent memory does for your agent.')
              : team
              ? (zh ? '按席位计费。面向小团队与合规敏感型部署。'
                    : 'Per seat. For small teams and compliance-sensitive deployments.')
              : (zh ? '每天都在用 AI 干活的人，记忆不该有保质期。'
                    : 'Permanent memory for individual developers who use AI every day.'),
            cta: free ? (zh ? '免费开始' : 'Start free')
                 : team ? (zh ? '开通 Team' : 'Start Team')
                 : (zh ? '开通 Pro' : 'Start Pro'),
            href: free ? '#/login' : '#/dashboard/billing',
            /* PayPal 计划 id（月付优先）：定价页要渲染页内 PayPal 按钮，
               需要和「套餐与用量」拿到同一个 plan id，两条路才不会买成两样。 */
            ppPlanId: ((t.paypal_plan_id || {}).month) || ((t.paypal_plan_id || {}).year) || '',
            feats: (zh ? (t.features_zh || t.features) : (t.features || []))
              .map(function (f) { return [f, 0]; }),
            p: {
              month: {
                usd: free ? '$0' : '$' + money(t.price_monthly),
                cny: free ? '¥0' : '¥' + money(cny.price_monthly),
                noteUsd: free ? (zh ? '无需绑卡' : 'No card required') : noteUsd,
                noteCny: free ? (zh ? '无需绑卡' : 'No card required') : noteCny
              }
            }
          };
          if (hasYear) {
            p.p.year = {
              usd: '$' + money(t.price_annual),
              cny: '¥' + money(cny.price_annual),
              noteUsd: noteUsd,
              noteCny: noteCny
            };
          }
          return p;
        });

        /* 加购包：不是独立层级，单独一张卡，文案里点明"需已有 Pro/Team"，
           且**只做月付**（不渲染年付切换）。 */
        if (d.addon) {
          var a = d.addon;
          var acny = (a.cny || {}).price_monthly;
          plans.push({
            id: 'addon',
            name: zh ? '增值包' : 'Add-on',
            badge: zh ? '加购' : 'ADD-ON',
            desc: zh ? 'Pro / Team 之上的可选加购，不是独立订阅层。'
                     : 'Optional pack on top of Pro or Team. Not a standalone tier.',
            isFree: false, perSeat: false, hasYear: false,
            cta: zh ? '加到 Pro / Team' : 'Add to Pro or Team',
            href: '#/dashboard/billing',
            ppPlanId: ((a.paypal_plan_id || {}).month) || '',
            feats: (zh ? (a.features_zh || a.features) : (a.features || []))
              .map(function (f) { return [f, 0]; })
              .concat([[zh ? '需已有 Pro 或 Team' : 'Requires Pro or Team', 1]]),
            p: {
              month: {
                usd: '$' + money(a.price_monthly),
                cny: '¥' + money(acny),
                noteUsd: zh ? '需已有 Pro 或 Team 订阅，只做月付'
                            : 'Requires an active Pro or Team subscription. Monthly only.',
                noteCny: zh ? '需已有 Pro 或 Team 订阅，只做月付，微信扫码'
                            : 'Requires Pro or Team. Monthly only, paid by WeChat.'
              }
            }
          });
        }

        T.plans = plans;
        T._live = true;
        /* 记住公开 client_id：每次切换月/年、切换币种都会重建卡片 DOM，
           重建后要重新挂载 PayPal 按钮（否则切一次就永久消失）。 */
        PP_CLIENT = d.paypal_client_id || '';

        if (d.promo && d.promo.active) {
          /* 插到 #tiers **正前方** —— 那里一定在首屏可见区域内。
             （早前用 host.children[1]，落点可能被前面的 reveal 动画块挤到
               折叠线以下，实测在无头 Chrome 里拿不到文本。） */
          var tiersEl = document.getElementById('tiers');
          var host = tiersEl && tiersEl.parentNode;
          if (host && !document.getElementById('promo-banner')) {
            var bar = document.createElement('p');
            bar.id = 'promo-banner';
            bar.className = 'mt-6 text-center text-[13px] leading-[1.7]';
            bar.style.cssText = 'max-width:820px;margin:0 auto 20px;' +
              'padding:12px 16px;border-radius:12px;background:var(--accent-wash,#f4f1ff)';
            bar.textContent = zh
              ? '每个新账号都先送 ' + d.promo.days + ' 天 Team 权益，无需绑卡。' +
                d.promo.days + ' 天后你可以永久留在 Free，或升级 Pro 保住全部记忆。'
              : d.promo.description;
            host.insertBefore(bar, tiersEl);
          }
        }
        renderTiers();
      })['catch'](function () { /* 接口不可用：保持静态价格 */ });
  }
  /* mem0's resource row: a coloured thumbnail plate over a headline and a
     meta line. The three tones are lifted from mem0's own blog cards —
     yellow, violet, near-black — which is where its palette stops being
     monochrome. */
  var RES_TONES = [
    { bg: '#F1C96C', fg: '#1B1727' },
    { bg: '#CBB2FF', fg: '#1B1727' },
    { bg: '#1B1727', fg: '#F3F2FA' }
  ];

  function renderResources() {
    var el = $('#res-grid'); if (!el) return;
    el.innerHTML = (T.resources || []).map(function (r, i) {
      var t = RES_TONES[i % RES_TONES.length];
      return '<a class="bcard" href="' + esc(r.href) + '" target="_blank" rel="noopener">' +
               '<span class="thumb" style="background:' + t.bg + ';color:' + t.fg + '">' +
                 '<span class="thumb-chip">' + esc(r.title) + '</span>' +
               '</span>' +
               '<span class="bcard-t">' + esc(r.title) + '</span>' +
               '<span class="bcard-d">' + esc(r.desc) + '</span>' +
               '<span class="bcard-m mono">' + esc(r.go) + '</span>' +
             '</a>';
    }).join('');
  }

  function renderFooter() {
    var el = $('#foot-cols'); if (!el) return;
    el.innerHTML = (T.footCols || []).map(function (c) {
      var links = (c.links || []).map(function (l) {
        var ext = /^https?:/.test(l[1]) ? ' target="_blank" rel="noopener"' : '';
        return '<li><a class="text-[13px] text-fg3 hover:text-fg transition-colors" href="' + esc(l[1]) + '"' + ext + '>' +
               esc(l[0]) + '</a></li>';
      }).join('');
      return '<div><h4 class="k-label mb-4">' + esc(c.title) + '</h4>' +
             '<ul class="space-y-2.5">' + links + '</ul></div>';
    }).join('');

    /* compliance / licence strip — the same badges the Enterprise section uses */
    var b = $('#foot-badges');
    if (b) b.innerHTML = (T.entBadges || []).map(function (x) {
      return '<span class="tagbox2">' + esc(x) + '</span>';
    }).join('');
  }

  function renderMiniSegs() {
    var t = $('#theme-seg-m');
    if (t) {
      t.innerHTML = ['light', 'dark', 'system'].map(function (k) {
        return '<button role="tab" data-theme-set="' + k + '" aria-selected="false">' + esc(tx('theme.' + k)) + '</button>';
      }).join('');
    }
    var l = $('#lang-seg-m');
    if (l) {
      l.innerHTML = [['en', 'EN'], ['zh', '中文']].map(function (p) {
        return '<button role="tab" data-lang-set="' + p[0] + '" aria-selected="' + (p[0] === lang) + '">' + p[1] + '</button>';
      }).join('');
    }
  }

  /* ======================================================================= *
   *  5b · ROUTED PAGES                                                       *
   * ======================================================================= */

  var FORM_NOTE = {
    en: 'Your message is stored in this site\u2019s own database and read by the team. For an immediate reply, call +86 756 8935999 or open an issue on GitHub.',
    zh: '你的留言会存入本站自己的数据库，由团队逐条查阅。若需即时回复，请致电 +86 756 8935999，或在 GitHub 提交 Issue。'
  };

  /* the in-page anchor for a route, so #/docs can name its own section id */
  function currentPath() {
    var h = location.hash || '';
    if (h.indexOf('#/') !== 0) return '';
    return h.slice(2).replace(/\/+$/, '').toLowerCase();
  }

  function tilesHTML(tiles) {
    return '<div class="tiles">' + tiles.map(function (t) {
      return '<div class="tile"><span class="n">' + t[0] + '</span><span class="l">' + t[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function formHTML(f) {
    var note = FORM_NOTE[lang] || FORM_NOTE.en;
    return '<form class="form" id="contact-form" novalidate>' +
      f.fields.map(function (fl) {
        var input = (fl[3] === 'area')
          ? '<textarea id="' + fl[0] + '" name="' + fl[0] + '" rows="4" placeholder="' + esc(fl[2]) + '"></textarea>'
          : '<input id="' + fl[0] + '" name="' + fl[0] + '" type="' + esc(fl[3]) + '" placeholder="' + esc(fl[2]) + '">';
        return '<div class="f"><label for="' + fl[0] + '">' + esc(fl[1]) + '</label>' + input + '</div>';
      }).join('') +
      '<button class="btn btn-primary btn-lg" type="submit">' + esc(f.submit) + '</button>' +
      '<p class="ok" id="contact-ok">' + esc(f.ok) + ' <span style="color:var(--fg3)">' + esc(note) + '</span></p>' +
    '</form>';
  }

  function galleryHTML(pg) {
    var opts = '<option value="">' + esc(pg.search.all) + '</option>' + (pg.cats || []).map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
    var cards = (pg.items || []).map(function (it) {
      return '<article class="igcard" data-cat="' + esc(it.c) + '" data-name="' +
               esc((it.n + ' ' + it.d + ' ' + it.c).toLowerCase()) + '">' +
               '<div class="hd">' +
                 '<span class="ic">' + esc(it.i) + '</span>' +
                 '<a class="go" href="' + REPO + '/tree/main/examples" target="_blank" rel="noopener" aria-label="' + esc(it.n) + '">↗</a>' +
               '</div>' +
               '<h3>' + esc(it.n) + '</h3>' +
               '<p>' + esc(it.d) + '</p>' +
               '<button class="cp" data-copy="' + esc(it.cp) + '">' +
                 '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5.5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5v1"/></svg>' +
                 '<span>' + esc(T['code.copy']) + '</span>' +
               '</button>' +
             '</article>';
    }).join('');
    return '<div class="igsearch">' +
             '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
             '<input id="ig-q" type="search" placeholder="' + esc(pg.search.ph) + '" aria-label="' + esc(pg.search.ph) + '">' +
             '<select id="ig-cat" aria-label="' + esc(pg.search.all) + '">' + opts + '</select>' +
           '</div>' +
           '<div class="grid2 mt-6" id="ig-grid">' + cards + '</div>' +
           '<p class="igempty" id="ig-empty" hidden>' + esc(pg.search.none) + '</p>';
  }

  /* Card grid. c[2] is an optional thumbnail tone — lav / ink / gold / mist —
     which is how mem0 illustrates a card instead of leaving it a flat
     rectangle of text. Without it the card falls back to the plain .mini. */
  function cardsHTML(cards, cols) {
    return '<div class="grid2' + (cols === 3 ? ' sm:grid-cols-3' : '') + '">' +
      cards.map(function (c) {
        var thumb = c[2]
          ? '<div class="thumb thumb-' + esc(c[2]) + '"><span class="glyph">' + esc(c[0]) + '</span></div>'
          : '';
        return '<div class="' + (c[2] ? 'icard' : 'mini') + '">' + thumb +
                 '<h3>' + c[0] + '</h3><p>' + c[1] + '</p></div>';
      }).join('') + '</div>';
  }

  function jobsHTML(jobs) {
    return '<div class="jobs">' + jobs.map(function (j) {
      return '<a class="job" href="' + esc(j[3] || '#/contact') + '">' +
               '<span class="t">' + esc(j[0]) + '</span>' +
               '<span class="m">' + esc(j[1]) + '</span>' +
               '<span class="m">' + esc(j[2]) + '</span>' +
               '<span class="go">' + esc(tx('jobs.apply', 'Apply Now')) + ' →</span>' +
             '</a>';
    }).join('') + '</div>';
  }

  function quoteHTML(q) {
    return '<div class="pquote"><blockquote>' + q.t + '</blockquote>' +
      (q.n ? '<div class="who">' + (q.img ? '<img src="' + q.img + '" alt="">' : '') +
        '<span><span class="nm">' + esc(q.n) + '</span><br><span class="rl">' + esc(q.r || '') + '</span></span></div>' : '') +
      '</div>';
  }

  function blockHTML(b) {
    var out = '';
    if (b.p)  out += '<p>' + b.p + '</p>';
    if (b.ul) out += '<ul>' + b.ul.map(function (li) { return '<li>' + li + '</li>'; }).join('') + '</ul>';
    if (b.cards) out += cardsHTML(b.cards, b.cols);
    if (b.jobs) out += jobsHTML(b.jobs);
    if (b.quote) out += quoteHTML(b.quote);
    if (b.tools) out += '<div class="mt-5">' + b.tools.map(function (r) {
      return '<div class="toolrow"><span class="nm">' + r[0] + '</span><span class="ds">' + r[1] + '</span></div>';
    }).join('') + '</div>';
    if (b.tiles) out += tilesHTML(b.tiles);
    if (b.code) out += '<div class="codebox">' +
      '<div class="bar"><span class="nm">' + esc(b.code.n) + '</span></div>' +
      '<pre><code>' + esc(b.code.b) + '</code></pre></div>';
    if (b.p2) out += '<p>' + b.p2 + '</p>';
    if (b.articles) out += '<div class="agrid">' + articleCards(b.articles) + '</div>';
    if (b.note) out += '<div class="note">' + b.note + '</div>';
    if (!b.h && !out) return '';
    return '<section class="blk">' + (b.h ? '<h2>' + b.h + '</h2>' : '') + out + '</section>';
  }

  /* Blog index — mem0's shape: a category strip and a search field above a
     2-up grid of illustrated cards, each carrying a date and a category. */
  function postsHTML(pg) {
    var cats = pg.cats || [];
    return '<div class="postbar">' +
        '<div class="postcats" id="post-cats" role="tablist">' +
          cats.map(function (c, i) {
            return '<button class="postcat" role="tab" data-cat="' + esc(c) + '" aria-selected="' + (i === 0) + '">' + esc(c) + '</button>';
          }).join('') +
        '</div>' +
        '<label class="postsearch">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input id="post-q" type="search" placeholder="' + esc(pg.searchPh || 'Search') + '" aria-label="' + esc(pg.searchPh || 'Search') + '">' +
        '</label>' +
      '</div>' +
      '<div class="postgrid" id="post-grid">' +
        (pg.posts || []).map(function (p) {
          return '<a class="post" href="' + esc(p[4] || '#/changelog') + '" data-cat="' + esc(p[2]) + '" data-q="' +
                   esc((p[0] + ' ' + p[2] + ' ' + p[3]).toLowerCase()) + '">' +
                   '<div class="thumb thumb-' + esc(p[5] || 'mist') + '"><span class="glyph">' + esc(p[2]) + '</span></div>' +
                   '<h3>' + esc(p[0]) + '</h3>' +
                   '<p class="meta">' + esc(p[1]) + ' · ' + esc(p[2]) + '</p>' +
                 '</a>';
        }).join('') +
      '</div>' +
      '<p class="postempty" id="post-empty" hidden>' + esc(pg.empty || 'Nothing matches that filter.') + '</p>';
  }

  function bindPosts() {
    var cats = $('#post-cats'), q = $('#post-q');
    if (!cats && !q) return;
    var active = 'All';
    function run() {
      var s = (q && q.value ? q.value : '').toLowerCase().trim();
      var shown = 0;
      $$('#post-grid .post').forEach(function (card) {
        var on = (active === 'All' || card.getAttribute('data-cat') === active) &&
                 (!s || (card.getAttribute('data-q') || '').indexOf(s) >= 0);
        card.hidden = !on;
        if (on) shown++;
      });
      var em = $('#post-empty');
      if (em) em.hidden = shown > 0;
    }
    if (cats) cats.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.postcat') : null;
      if (!b) return;
      active = b.getAttribute('data-cat');
      $$('#post-cats .postcat').forEach(function (x) {
        x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      });
      run();
    });
    if (q) q.addEventListener('input', run);
  }

  function bindGallery() {
    var q = $('#ig-q'), c = $('#ig-cat');
    if (!q && !c) return;
    var run = function () {
      var s = (q && q.value ? q.value : '').toLowerCase().trim();
      var cat = c ? c.value : '';
      var shown = 0;
      $$('#ig-grid .igcard').forEach(function (card) {
        var on = (!s || (card.getAttribute('data-name') || '').indexOf(s) >= 0) &&
                 (!cat || card.getAttribute('data-cat') === cat);
        card.hidden = !on;
        if (on) shown++;
      });
      var em = $('#ig-empty');
      if (em) em.hidden = shown > 0;
    };
    if (q) q.addEventListener('input', run);
    if (c) c.addEventListener('change', run);
  }

  /* leadership card — portrait plus a short, real biography */
  function personHTML(p) {
    return '<section class="blk first">' +
      '<div class="grid sm:grid-cols-[206px_1fr] gap-7 items-start">' +
        '<img src="' + p.img + '" alt="' + esc(p.name) + '" loading="lazy" ' +
             'style="width:100%;max-width:206px;aspect-ratio:4/5;object-fit:cover;object-position:50% 20%;' +
             'border-radius:8px;border:1px solid var(--hair);display:block">' +
        '<div>' +
          '<span class="k-label">' + esc(p.kicker) + '</span>' +
          '<h2 class="mt-2" style="font-size:clamp(1.2rem,2.3vw,1.6rem);font-weight:650;letter-spacing:-.022em;color:var(--fg)">' + esc(p.name) + '</h2>' +
          '<p class="mt-1" style="margin-top:4px;font-size:13.2px;color:var(--accent-ink)">' + esc(p.role) + '</p>' +
          '<div class="flex flex-wrap gap-2 mt-4">' + (p.tags || []).map(function (t) {
            return '<span class="tagbox2">' + esc(t) + '</span>';
          }).join('') + '</div>' +
          (p.bio || []).map(function (x) { return '<p>' + x + '</p>'; }).join('') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderPage() {
    var view = $('#view'), home = $('#home');
    if (!view || !home) return;
    var path = currentPath();

    /* the console is a full-viewport app: it hides the marketing header and
       footer, and every other route hands them back */
    /* #/admin/orders 与 #/admin/visitors 是需求书里的后台路径，同样交给控制台。
       为什么是 hash：Worker 只回源 /api /auth /v1 /healthz，其余路径由 GitHub
       Pages 接管，而 Pages 没有 SPA fallback —— 真路径 /admin/orders 会 404 白屏。 */
    var isDash = (path === 'dashboard' || path.indexOf('dashboard/') === 0 ||
                  path === 'admin/orders' || path === 'admin/visitors' ||
                  path === 'admin/accesslog');
    /* the documentation site owns #/docs and #/docs/<slug> */
    var isDocs = (path === 'docs' || path.indexOf('docs/') === 0);
    document.body.classList.toggle('dash', isDash);
    document.body.classList.toggle('docs', isDocs);
    if (isDash) { renderDash(path); return; }
    if (isDocs) { renderDocsSite(path); return; }

    /* the account routes own their own rendering — they are not content pages */
    if (path === 'login' || path === 'admin' || path === 'account') { renderAccount(); return; }

    /* #/blog/<id> —— 文章有独立可分享的地址；读的是同一份 BLOG_POSTS 数据 */
    if (path.indexOf('blog/') === 0) { renderPost(path.slice(5)); return; }

    var pg = path ? ((PAGES[lang] || {})[path]) : null;

    if (!pg) {
      view.hidden = true; view.innerHTML = '';
      home.classList.remove('off');
      document.title = (T.meta && T.meta.title) || document.title;
      return;
    }

    home.classList.add('off');
    view.hidden = false;

    var back = '<a class="back" href="#top">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>' +
        esc(pg.eyebrow) + '</a>';

    var h;
    if (pg.split) {
      /* mem0's contact page: title on the left, the form riding in its own
         card on the right — not a full-width stack. */
      h = '<div class="pv-body" style="padding-top:40px"><div class="max-w-shell mx-auto px-5 sm:px-8">' + back +
            '<div class="split mt-8">' +
              '<div>' +
                '<h1 class="pv-h1" style="text-align:left">' + pg.h1 + '</h1>' +
                (pg.lede ? '<p class="pv-lede" style="text-align:left;margin-left:0">' + pg.lede + '</p>' : '') +
              '</div>' +
              '<div class="formcard">' + (pg.form ? formHTML(pg.form) : '') +
                (pg.formNote ? '<p class="mt-4" style="font-size:12px;color:var(--fg3)">' + pg.formNote + '</p>' : '') +
              '</div>' +
            '</div>' +
          '</div></div>';
    } else {
      h = '<div class="pv-hero"><div class="max-w-shell mx-auto px-5 sm:px-8">' + back +
        '<h1 class="pv-h1">' + pg.h1 + '</h1>' +
        (pg.lede ? '<p class="pv-lede">' + pg.lede + '</p>' : '') +
        (pg.cta ? '<div class="pv-cta">' + pg.cta.map(function (c) {
          var ext = (c[1] || '').indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '';
          return '<a class="btn ' + (c[2] === 'primary' ? 'btn-primary' : 'btn-ghost') + ' btn-lg" href="' +
                 esc(c[1]) + '"' + ext + '>' + esc(c[0]) + '</a>';
        }).join('') + '</div>' : '') +
        (pg.tiles ? tilesHTML(pg.tiles) : '') +
      '</div></div>';

      h += '<div class="pv-body"><div class="max-w-shell mx-auto px-5 sm:px-8">';
      if (pg.person) h += personHTML(pg.person);
      if (pg.search) h += galleryHTML(pg);
      if (pg.posts) h += postsHTML(pg);
      if (pg.form) h += '<div class="max-w-2xl mx-auto">' + formHTML(pg.form) + '</div>';
      if (pg.plans) h += '<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">' +
        (T.plans || []).map(planHTML).join('') + '</div>';
      (pg.blocks || []).forEach(function (b) { h += blockHTML(b); });
      h += '</div></div>';
    }

    view.innerHTML = h;
    document.title = pg.h1 + ' — Mnemosyne OS';
    bindGallery();
    bindPosts();
    icons();
  }

  /* 单篇文章页。正文就是 BLOG_POSTS[id].body 原文，用 <pre> 保真输出 ——
     作者写的换行与分段一个字符都不动，站点只负责排版。 */
  function renderPost(id) {
    var a = BLOG_POSTS[id];
    var view = $('#view'), home = $('#home');
    if (!a || !view || !home) {
      view.hidden = true; view.innerHTML = '';
      home.classList.remove('off');
      return;
    }
    home.classList.add('off');
    view.hidden = false;
    var zh = lang === 'zh';
    var back = '<a class="back" href="#/blog">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>' +
        esc(zh ? '博客' : 'Blog') + '</a>';

    view.innerHTML =
      '<div class="pv-hero pv-article"><div class="max-w-shell mx-auto px-5 sm:px-8">' + back +
        '<h1 class="pv-h1">' + esc(a.title) + '</h1>' +
        '<p class="pv-lede">' + esc(a.lede) + '</p>' +
        '<p class="pmeta">' + esc(zh ? '发布时间：' : 'Published: ') + esc(zh ? a.date : (a.dateEn || a.date)) + ' · ' + esc(zh ? a.cat : (a.catEn || a.cat)) + '</p>' +
        '<div class="pv-cta"><a class="btn btn-ghost btn-lg" href="#/blog">' + esc(zh ? '返回工程笔记' : 'Back to engineering notes') + '</a></div>' +
      '</div></div>' +
      '<div class="pv-body"><div class="max-w-shell mx-auto px-5 sm:px-8">' +
        '<article class="artbody">' +
          '<img class="artcover" src="' + esc(a.img) + '" alt="' + esc(a.alt || a.title) + '">' +
          '<pre class="arttext">' + esc(a.body) + '</pre>' +
        '</article>' +
      '</div></div>';
    document.title = a.title + ' — Mnemosyne OS';
    window.scrollTo(0, 0);
  }

  /* ======================================================================= *
   *  5c · ACCOUNT — sign-in, sign-up, session and the console                 *
   *                                                                          *
   *  Wired to WorkBuddy Cloud: email + password, email OTP, password reset,   *
   *  session persistence, sign-out.  The provider buttons (WeChat / Google /  *
   *  GitHub) stay disabled until OAuth credentials exist for this domain —    *
   *  the platform's auth surface exposes no provider, QR or SMS flow, and     *
   *  nothing here pretends otherwise.  There is deliberately no                *
   *  localStorage-only fallback: a session is either real or absent.          *
   * ======================================================================= */

  var cloud = null, cloudFatal = '';
  var SESSION = null;

  /* Every account call goes to THIS site's own API.
     WorkBuddy's hosted auth is pinned to the domain it was registered on and
     its endpoints are relative (`/.cloud/auth/**`) — on ai-memory.net those
     requests have nowhere to land, and the browser surfaces that as
     "network unavailable". Accounts are therefore served locally. */
  function api(path, opts) {
    var init = Object.assign({ credentials: 'same-origin' }, opts || {});
    /* The server picks its own copy for e-mails and copilot answers from
       this header, so it has to travel with every call. */
    init.headers = Object.assign({ 'X-Mn-Lang': lang }, init.headers || {});
    if (init.body) init.headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers || {});
    return fetch(path, init).then(function (r) {
      return r.text().then(function (t) {
        var body = {};
        try { body = JSON.parse(t); } catch (e) {}
        return { ok: r.ok, status: r.status, body: body };
      });
    })['catch'](function () { return { ok: false, status: 0, body: {} }; });
  }

  /* A status of 0 means fetch itself failed: that is connectivity, not a
     rejected credential, and saying which one it is saves a lot of guessing.
     "Nothing happened" was the symptom this distinction was hiding. */
  function apiErr(r, fallback) {
    if (!r || r.status === 0) return A('netDown');
    return (r.body && r.body.message) || fallback || A('signInFailed');
  }

  function cloudClient() {
    if (cloud) return cloud;
    if (cloudFatal) return null;
    var cfg = window.MN_CLOUD_CONFIG || {};
    if (!window.WorkBuddyCloud || !cfg.endpoint || !cfg.publishableKey) { cloudFatal = 'sdk'; return null; }
    try {
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: cfg.endpoint,
        publishableKey: cfg.publishableKey
      });
    } catch (e) { cloudFatal = (e && e.message) ? e.message : 'init'; return null; }
    return cloud;
  }

  var AUTH = {
    en: {
      tabIn: 'Sign in', tabUp: 'Create account',
      h: 'Sign in to Mnemosyne OS',
      lede: 'Your account keeps your console, your submitted requests and your plan together. Your local memory engine never leaves your machine.',
      email: 'Email', pass: 'Password', pass2: 'Confirm password', code: 'Verification code',
      name: 'Display name', company: 'Company',
      signIn: 'Sign in', signUp: 'Create account', sendCode: 'Email me a code',
      withCode: 'Sign in with an email code instead', withPass: 'Use a password instead',
      forgot: 'Forgot your password?', haveAcc: 'Already have an account?', noAcc: 'New here?',
      verify: 'Verify and continue', resend: 'Send a new code',
      sentTo: 'We sent a code to {email}. It expires in about 10 minutes.',
      getCode: 'Send code',
      codeSentHint: 'Code sent — it stays valid for about 10 minutes. Enter it above, then submit.',
      sendFirst: 'Tap “Send code” first — the code goes to the address above.',
      pwChanged: 'Your password has been updated. Signing you in…',
      pwRule: 'At least 8 characters, including an uppercase letter, a lowercase letter and a number.',
      resetSent: 'If that address has an account, a code is on its way. Check the inbox and the spam folder.',
      newPass: 'Choose a new password', applyPass: 'Save the new password',
      ssoOr: 'Or continue with',
      ssoNote: 'GitHub sign-in is live. WeChat and Google still need OAuth credentials registered for this domain, so those two stay disabled until the credentials exist.',
      ssoPending: 'Pending credentials',
      ghSigned: 'Signed in with GitHub',
      ghSignOut: 'Sign out',
      ghOk: 'Signed in with GitHub.',
      ghDenied: 'You cancelled the GitHub authorization.',
      ghFail: 'The GitHub sign-in did not complete. Please try again.',
      domainNote: 'Sign-in works only on the published domain, because the server validates the request origin.',
      backHome: 'Back to the site',
      needEmail: 'Enter your email address.', needPass: 'Enter your password.',
      mismatch: 'The two passwords do not match.', weak: 'Use at least 8 characters with an uppercase letter, a lowercase letter and a number.',
      needCode: 'Enter the code from the email.',
      working: 'Working…', signedInAs: 'Signed in as',
      signedInShort: 'Signed in',
      signInFailed: 'Sign-in failed. Check your email and password.',
      signUpFailed: 'Could not create the account. Please try again.',
      accountCreated: 'Account created — you are signed in.',
      sdkDown: 'The account service could not be reached. Open this page on the published domain and try again.',
      netDown: 'Could not reach the account service. Check your connection and try again.',
      codeHint: 'Six digits, valid for about 10 minutes. Send it to the address above.',
      pass2Hint: 'Type the same password again.',
      noMail: 'This site has no mail sender configured yet, so sign-up does not use a code. Ask the operator to add SMTP details under Console \u2192 Settings \u2192 Mail.',
      noMailLink: 'Open the mail settings',
      codeFailed: 'The code could not be sent. Try again in a minute.',
      signedInMsg: 'Signed in as {email}'
    },
    zh: {
      tabIn: '登录', tabUp: '注册',
      h: '登录 Mnemosyne OS',
      lede: '账号用于保存你的 Mnemosyne OS SaaS 面板、提交过的申请与套餐信息。本地记忆引擎的数据始终留在你自己机器上。',
      email: '邮箱', pass: '密码', pass2: '确认密码', code: '验证码',
      name: '显示名称', company: '公司',
      signIn: '登录', signUp: '注册', sendCode: '发送邮箱验证码',
      withCode: '改用邮箱验证码登录', withPass: '改用密码登录',
      forgot: '忘记密码？', haveAcc: '已有账号？', noAcc: '还没有账号？',
      verify: '验证并继续', resend: '重新发送验证码',
      sentTo: '验证码已发送至 {email}，有效期约 10 分钟。',
      getCode: '获取验证码',
      codeSentHint: '验证码已发送，有效期约 10 分钟。填入上方输入框后提交即可。',
      sendFirst: '请先点右侧「获取验证码」—— 验证码会发到上面的邮箱。',
      pwChanged: '密码已更新，正在为你登录…',
      pwRule: '至少 8 位，需包含大写字母、小写字母和数字。',
      resetSent: '如果该邮箱已注册，验证码已发出。请检查收件箱与垃圾邮件。',
      newPass: '设置新密码', applyPass: '保存新密码',
      ssoOr: '或使用第三方账号',
      ssoNote: 'GitHub 登录已开通。微信与 Google 仍需先为该域名申请 OAuth 凭据，在凭据到位前这两个按钮保持禁用。',
      ssoPending: '待接入凭据',
      ghSigned: '已通过 GitHub 登录',
      ghSignOut: '退出',
      ghOk: 'GitHub 登录成功。',
      ghDenied: '你取消了 GitHub 授权。',
      ghFail: 'GitHub 登录未完成，请重试。',
      domainNote: '登录仅在正式发布域名上生效，因为服务端会校验请求来源。',
      backHome: '返回首页',
      needEmail: '请输入邮箱地址。', needPass: '请输入密码。',
      mismatch: '两次输入的密码不一致。', weak: '密码至少 8 位，且需包含大写字母、小写字母和数字。',
      needCode: '请输入邮箱收到的验证码。',
      working: '处理中…', signedInAs: '已登录',
      signedInShort: '已登录',
      signInFailed: '登录失败，请检查邮箱和密码。',
      signUpFailed: '创建账号失败，请重试。',
      accountCreated: '账号已创建，已为你登录。',
      sdkDown: '无法连接账号服务。请在正式发布域名上打开本页后重试。',
      netDown: '无法连接账号服务，请检查网络后重试。',
      codeHint: '六位数字，有效期约 10 分钟。请先点右侧按钮发送到上面的邮箱。',
      pass2Hint: '请再输入一次相同的密码。',
      noMail: '本站尚未配置发信服务，因此注册暂时不使用验证码。请在 Mnemosyne OS SaaS「设置 → 邮件」里填入 SMTP 信息后启用。',
      noMailLink: '打开邮件设置',
      codeFailed: '验证码发送失败，请一分钟后再试。',
      signedInMsg: '已登录：{email}'
    }
  };

  function A(k, sub) {
    var s = (AUTH[lang] || AUTH.en)[k] || AUTH.en[k] || k;
    return sub ? s.replace('{email}', sub) : s;
  }

  function acctMsgEl() { return document.getElementById('auth-msg'); }

  function acctSay(kind, text) {
    var el = acctMsgEl(); if (!el) return;
    el.className = 'authmsg' + (kind ? ' ' + kind : '');
    el.textContent = text || '';
    el.hidden = !text;
  }

  function acctBusy(on, label) {
    var card = document.getElementById('auth-card');
    if (!card) return;
    Array.prototype.forEach.call(card.querySelectorAll('button, input'), function (el) {
      if (el.getAttribute('data-keep')) return;
      el.disabled = !!on;
    });
    var go = card.querySelector('[data-submit]');
    if (go) go.textContent = on ? (label || A('working')) : go.getAttribute('data-label');
  }

  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function passOk(v) { return typeof v === 'string' && v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v); }

  /* error.kind is the stable signal; message text is not part of the contract */
  function authError(err) {
    var kind = (err && err.kind) || '';
    var msg  = (err && err.message) || '';
    var zh = lang === 'zh';
    if (kind === 'unauthenticated' || kind === 'invalid_grant') {
      return zh ? '邮箱或密码不正确，或会话已失效。' : 'Wrong email or password, or the session expired.';
    }
    if (kind === 'network' || kind === 'backend-unavailable') {
      return zh ? '网络不可用，请稍后重试。' : 'The network is unavailable. Try again shortly.';
    }
    return msg || (zh ? '操作失败，请重试。' : 'That did not work. Please try again.');
  }

  /* ---------------------------------------------------------------- sign in */

  var authTab = 'in';          /* 'in' | 'up' */
  var authMode = 'password';   /* 'password' | 'otp' | 'reset' */
  var codeSent = false;        /* has a code been requested for the address on screen? */
  var pending = null;          /* { email, verificationId, isExistingUser, verify } */
  /* What the server can actually offer — filled from /api/auth/methods. A
     null here means "not answered yet", so the form shows the code field
     only once it knows a sender exists. */
  var ACCT = { mail: null };

  function ssoRow() {
    function btn(id, label, svg) {
      /* 这里以前把 Google/WeChat 写死成 disabled，靠一句注释解释「没有凭据」。
         现在改为**问服务端**：/api/site 的 auth 段已经折过「后台开关 AND 凭据就绪」，
         所以后台把 Google 的 client_id / client_secret 填好之后，这个按钮下一次
         刷新就自己亮起来，不需要改前端、也不需要重新部署。
         WeChat 仍未接入，所以永远走 disabled 分支。 */
      var ready = (window.MN && MN.authReady) ? !!MN.authReady(id) : false;
      if (id === 'github' || (id === 'google' && ready)) {
        return '<a href="/auth/' + id + '">' + svg + '<span>' + esc(label) + '</span></a>';
      }
      if (ready) {
        return '<a href="/auth/' + id + '">' + svg + '<span>' + esc(label) + '</span></a>';
      }
      return '<button type="button" disabled aria-disabled="true" data-sso="' + id + '" title="' +
             esc(A('ssoPending')) + '">' + svg + '<span>' + esc(label) + '</span></button>';
    }
    return '<div class="authdiv">' + esc(A('ssoOr')) + '</div>' +
      '<div class="sso">' +
        btn('google', 'Google',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.3-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"/></svg>') +
        btn('github', 'GitHub',
          '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>') +
      '</div>';
  }

  /* The code field sits on the SAME screen as the address and the password.
     It used to live on a second screen that only appeared after submitting,
     which read as "there is nowhere to type the code". A "send code" button
     rides next to it so the order is obvious: get the code, then submit. */
  function codeFieldHTML() {
    return '<div class="field"><label for="ac-code">' + esc(A('code')) + '</label>' +
      '<div class="fieldrow">' +
        '<input id="ac-code" name="code" inputmode="numeric" autocomplete="one-time-code" />' +
        '<button type="button" class="ghostbtn" data-act="send-code" data-keep="1">' +
          esc(codeSent ? A('resend') : A('getCode')) +
        '</button>' +
      '</div>' +
      '<div class="hint" id="ac-code-hint">' + (codeSent ? esc(A('codeSentHint')) : '') + '</div>' +
    '</div>';
  }

  function authFormHTML() {
    var f = '';
    var mailOn = !!(ACCT.mail && ACCT.mail.emailCode);

    f += '<div class="field"><label for="ac-email">' + esc(A('email')) + '</label>' +
         '<input id="ac-email" name="email" type="email" autocomplete="email" placeholder="you@company.com" /></div>';

    /* The code field appears only when a sender exists — a box that can never
       receive anything is worse than none — and when it does not, the form
       says exactly what to do about it. */
    /* 注册、验证码登录、重置密码都需要验证码；密码登录不需要。 */
    var wantCode = mailOn && (authTab === 'up' || authMode === 'otp' || authMode === 'reset');
    if (wantCode) {
      f += '<div class="field"><label for="ac-code">' + esc(A('code')) + '</label>' +
           '<div class="fieldrow">' +
             '<input id="ac-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />' +
             '<button class="btn btn-ghost" type="button" data-act="send-code" data-label="' + esc(A('getCode')) + '">' +
               esc(codeSent ? A('resend') : A('getCode')) + '</button>' +
           '</div>' +
           '<div class="hint" id="ac-code-hint">' +
             esc(codeSent ? A('codeSentHint') : A('codeHint')) + '</div></div>';
    } else if (authTab === 'up' && !mailOn) {
      f += '<div class="note" style="font-size:12px">' +
           esc(A('noMail')) +
           ' <a href="#/dashboard/settings" style="color:var(--accent-ink)">' +
           esc(A('noMailLink')) + '</a></div>';
    }


    if (authMode === 'reset') {
      f += '<div class="field"><label for="ac-pass">' + esc(A('newPass')) + '</label>' +
           '<input id="ac-pass" name="password" type="password" autocomplete="new-password" />' +
           '<div class="hint">' + esc(A('pwRule')) + '</div></div>' +
           '<div class="field"><label for="ac-pass2">' + esc(A('pass2')) + '</label>' +
           '<input id="ac-pass2" name="password2" type="password" autocomplete="new-password" /></div>';
    } else if (authTab === 'up') {
      f += '<div class="field"><label for="ac-pass">' + esc(A('pass')) + '</label>' +
           '<input id="ac-pass" name="password" type="password" autocomplete="new-password" />' +
           '<div class="hint">' + esc(A('pwRule')) + '</div></div>' +
           '<div class="field"><label for="ac-pass2">' + esc(A('pass2')) + '</label>' +
           '<input id="ac-pass2" name="password2" type="password" autocomplete="new-password" />' +
           '<div class="hint" id="ac-pass2-hint">' + esc(A('pass2Hint')) + '</div></div>';
    } else {
      f += '<div class="field"><label for="ac-pass">' + esc(A('pass')) + '</label>' +
           '<input id="ac-pass" name="password" type="password" autocomplete="current-password" /></div>';
    }

    if (authMode === 'reset') {
      f += '<button class="btn btn-accent w-full" type="submit" data-submit data-label="' + esc(A('applyPass')) + '">' + esc(A('applyPass')) + '</button>' +
           '<div class="authalt"><button type="button" data-act="mode-password">' + esc(A('withPass')) + '</button></div>';
    } else if (authTab === 'up') {
      f += '<button class="btn btn-accent w-full" type="submit" data-submit data-label="' + esc(A('signUp')) + '">' + esc(A('signUp')) + '</button>';
    } else if (authMode === 'otp') {
      f += '<button class="btn btn-accent w-full" type="submit" data-submit data-label="' + esc(A('signIn')) + '">' + esc(A('signIn')) + '</button>' +
           '<div class="authalt"><button type="button" data-act="mode-password">' + esc(A('withPass')) + '</button></div>';
    } else {
      f += '<button class="btn btn-accent w-full" type="submit" data-submit data-label="' + esc(A('signIn')) + '">' + esc(A('signIn')) + '</button>' +
           '<div class="authalt"><button type="button" data-act="forgot">' + esc(A('forgot')) + '</button></div>';
    }

    f += ssoRow();

    f += '<div class="authalt" style="margin-top:22px">' +
      (authTab === 'in'
        ? esc(A('noAcc')) + ' <button type="button" data-act="tab-up">' + esc(A('tabUp')) + '</button>'
        : esc(A('haveAcc')) + ' <button type="button" data-act="tab-in">' + esc(A('tabIn')) + '</button>') +
      '</div>';
    return f;
  }

  /* the banner shown above the email form when a GitHub session is active */
  function ghBarHTML() {
    if (!GHS || !GHS.signedIn) return '';
    var av = GHS.avatar
      ? '<img src="' + esc(GHS.avatar) + '" alt="" referrerpolicy="no-referrer" />'
      : '<span style="width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:var(--surface);font-size:12px;color:var(--fg2)">' +
        esc(String(GHS.login || '?').charAt(0).toUpperCase()) + '</span>';
    var who = GHS.name || GHS.email || (GHS.login ? '@' + GHS.login : '');
    var how = GHS.provider === 'github' ? ('GitHub · @' + esc(GHS.login)) : esc(GHS.email || '');
    return '<div class="ghbar">' + av +
      '<span class="tx">' +
        '<span class="nm">' + esc(who) + '</span>' +
        '<span class="sub">' + esc(A('signedInShort')) + ' · ' + how + '</span>' +
      '</span>' +
      '<button type="button" data-act="gh-signout">' + esc(A('ghSignOut')) + '</button>' +
    '</div>';
  }

  function loginHTML() {
    var title = authTab === 'up' ? A('tabUp') : (authMode === 'reset' ? A('forgot') : A('tabIn'));
    var head = '<h1 class="pv-h1" style="font-size:24px;text-align:left;margin-top:0">' + esc(title) + '</h1>';

    var body = '<div class="authtabs" role="tablist">' +
        '<button role="tab" type="button" data-act="tab-in" aria-selected="' + (authTab === 'in') + '">' + esc(A('tabIn')) + '</button>' +
        '<button role="tab" type="button" data-act="tab-up" aria-selected="' + (authTab === 'up') + '">' + esc(A('tabUp')) + '</button>' +
      '</div>';

    return '<div class="pv-body" style="padding-top:34px"><div class="max-w-shell mx-auto px-5 sm:px-8">' +
      '<a class="back" href="#top">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>' +
        esc(A('backHome')) +
      '</a>' +
      '<div class="authwrap"><div class="authcard" id="auth-card">' +
        ghBarHTML() + head + body +
        '<div class="authmsg" id="auth-msg" hidden></div>' +
        '<form id="auth-form" novalidate>' + authFormHTML() + '</form>' +
      '</div></div>' +
    '</div></div>';
  }

  /* --------------------------------------------------------------- actions */

  /* -------------------------------------------------- third-party session */

  /* GitHub sign-in completes on this site's own Node server and comes back as
     an HttpOnly cookie. /api/session is the only way to read it — there is no
     client-side copy, so a reload can never invent a session the server does
     not know about. When the endpoint is absent (a plain static host) the page
     simply reports that no third-party session exists. */

  var GHS = null;

  function loadGithubSession() {
    return api('/api/auth/me').then(function (r) {
      GHS = (r.ok && r.body && r.body.signedIn) ? r.body : { signedIn: false };
      /* one identity shape for every provider — GitHub included, so the header
         chip and the console behave the same whichever door was used */
      if (GHS.signedIn) SESSION = GHS;
      return GHS;
    });
  }

  function ghSignOut() {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
      .then(function () { GHS = { signedIn: false }; renderAccount(); })
      ['catch'](function () { GHS = { signedIn: false }; renderAccount(); });
  }

  function ghNotice() {
    var m = (location.search.match(/[?&]gh=([a-z]+)/) || [])[1] || '';
    if (!m) return;
    if (m === 'ok') { if (GHS && GHS.signedIn) acctSay('ok', A('ghOk')); }
    else if (m === 'denied') { acctSay('err', A('ghDenied')); }
    else { acctSay('err', A('ghFail')); }
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }

  /* The account views repaint themselves the instant a session appears, and
     route() does not touch the header at all. So finishing a sign-in needs
     three things to not look like "nothing happened":
       1. a toast — it lives outside the routed views, so the repaint cannot
          erase it (an inline message inside the login card always was),
       2. a header repaint, so the account chip actually appears,
       3. leaving the account view — otherwise the visitor is left staring at
          the very form they just submitted. */
  function afterAuth(msg) {
    closePops();
    renderAccountNav();
    if (msg) toast(msg);
    if (currentPath()) location.hash = '#top';
    route();
  }

  var toastTimer = null;
  function toast(text) {
    var el = document.getElementById('mn-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mn-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.className = 'on';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 4200);
  }

  function onAccountClick(e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-act],[data-sso]') : null;
    if (!b) return;

    if (b.getAttribute('data-sso')) {
      acctSay('', A('ssoNote'));
      return;
    }

    var act = b.getAttribute('data-act');
    if (act === 'tab-in' || act === 'tab-up') {
      authTab = act === 'tab-in' ? 'in' : 'up';
      authMode = 'password'; codeSent = false; pending = null; acctSay('', '');
      renderAccount();
    } else if (act === 'mode-otp') {
      authMode = 'otp'; codeSent = false; pending = null; acctSay('', ''); renderAccount();
    } else if (act === 'mode-password') {
      authMode = 'password'; codeSent = false; pending = null; acctSay('', ''); renderAccount();
    } else if (act === 'forgot') {
      authMode = 'reset'; codeSent = false; pending = null; acctSay('', ''); renderAccount();
    } else if (act === 'send-code') {
      sendCode();
    } else if (act === 'av-remove') {
      removeAvatar();
    } else if (act === 'av-upload') {
      var fi = document.getElementById('av-file');
      if (fi) fi.click();
    } else if (act === 'go-console') {
      location.hash = '#/dashboard/overview';
    } else if (act === 'gh-signout') {
      ghSignOut();
    } else if (act === 'signout') {
      doSignOut();
    } else if (act === 'claim-admin') {
      doClaimAdmin();
    }
  }

  function onAccountSubmit(e) {
    var form = e.target;
    if (!form || form.id !== 'auth-form') return;
    e.preventDefault();
    if (authMode === 'reset') return doReset(form);
    if (authTab === 'up') return doSignUp(form);
    if (authMode === 'otp') return doSignInWithCode(form);
    return doSignIn(form);
  }

  function val(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || '').trim() : '';
  }

  function doSignIn(form) {
    var email = val(form, 'email'), password = val(form, 'password');
    if (!emailOk(email)) { acctSay('err', A('needEmail')); return; }
    if (!password) { acctSay('err', A('needPass')); return; }

    acctSay('', ''); acctBusy(true);
    api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    }).then(function (r) {
      acctBusy(false);
      if (!r.ok) { acctSay('err', apiErr(r, A('signInFailed'))); return; }
      SESSION = r.body.user || { email: email };
      afterAuth(A('signedInMsg', email));
    });
  }

  /* -------------------------------------------------- email codes (parked)

     A code needs an SMTP sender to actually arrive, and this deployment has
     none. Rather than render a field that can never receive anything — which
     is what "there is nowhere to type the code" was — the code paths are
     parked: the UI no longer offers them, and if one is ever reached it says
     so plainly instead of calling a service that is not there. Wiring a relay
     brings the field straight back (needsCode in authFormHTML). */
  function otpParked() {
    acctSay('err', lang === 'zh'
      ? '邮箱验证码暂未开通（本站尚未配置发信服务）。请使用邮箱 + 密码注册或登录。'
      : 'Email codes are not enabled yet — this site has no mail sender configured. Use email + password instead.');
  }

  /* Ask the server to mail a code. Three purposes share one button, and the
     only difference is what the server does with the address afterwards. */
  function sendCode() {
    var form = document.getElementById('auth-form');
    var email = form ? val(form, 'email') : '';
    if (!emailOk(email)) { acctSay('err', A('needEmail')); return; }
    var btn = document.querySelector('[data-act="send-code"]');
    if (btn) { btn.disabled = true; btn.textContent = A('working'); }
    acctSay('', '');
    var purpose = authMode === 'reset' ? 'reset' : (authTab === 'up' ? 'signup' : 'signin');
    api('/api/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ email: email, purpose: purpose })
    }).then(function (r) {
      if (btn) { btn.disabled = false; btn.textContent = codeSent ? A('resend') : A('getCode'); }
      if (!r.ok) {
        var b = r.body || {};
        if (b.error === 'mail_not_configured') {
          acctSay('err', A('noMail'));
          return;
        }
        acctSay('err', apiErr(r, A('codeFailed')));
        return;
      }
      codeSent = true;
      if (btn) btn.textContent = A('resend');
      var hint = document.getElementById('ac-code-hint');
      if (hint) hint.textContent = A('codeSentHint');
      acctSay('ok', A('sentTo').replace('{email}', email));
    });
  }

  /* Sign-up: the address is proven with a mailed code before the account is
     created. The two password boxes are compared here, and the server checks
     the strength — one rule, one place. */
  function doSignUp(form) {
    var email = val(form, 'email'), password = val(form, 'password'), name = val(form, 'name');
    var again = val(form, 'password2'), code = val(form, 'code');
    if (!emailOk(email)) { acctSay('err', A('needEmail')); return; }
    if (!passOk(password)) { acctSay('err', A('weak')); return; }
    if (password !== again) {
      acctSay('err', A('mismatch'));
      var hint = document.getElementById('ac-pass2-hint');
      if (hint) hint.textContent = A('mismatch');
      var box = document.getElementById('ac-pass2');
      if (box) { box.focus(); }
      return;
    }
    if (ACCT.mail && ACCT.mail.emailCode && !String(code || '').trim()) {
      acctSay('err', A('needCode')); return;
    }

    acctSay('', ''); acctBusy(true);
    api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password, name: name, code: String(code || '').trim() })
    }).then(function (r) {
      acctBusy(false);
      if (!r.ok) { acctSay('err', apiErr(r, A('signUpFailed'))); return; }
      SESSION = r.body.user || { email: email };
      codeSent = false;
      afterAuth(A('accountCreated'));
    });
  }

  /* sign-in by code — parked with the rest of the code paths */
  /* Sign in with a mailed code instead of a password. Only usable when a
     sender exists, which is exactly when the form offers the code field. */
  function doSignInWithCode(form) {
    var email = val(form, 'email'), code = val(form, 'code');
    if (!emailOk(email)) { acctSay('err', A('needEmail')); return; }
    if (!String(code || '').trim()) { acctSay('err', A('needCode')); return; }
    acctSay('', ''); acctBusy(true);
    api('/api/auth/login-code', {
      method: 'POST',
      body: JSON.stringify({ email: email, code: String(code).trim() })
    }).then(function (r) {
      acctBusy(false);
      if (!r.ok) { acctSay('err', apiErr(r, A('signInFailed'))); return; }
      SESSION = r.body.user || { email: email };
      codeSent = false;
      afterAuth(A('signedInMsg').replace('{email}', email));
    });
  }

  /* Password reset: the mailed code proves the address, then the new password
     replaces the old one. The reply says nothing about whether the address
     exists, so this cannot be used to enumerate accounts. */
  function doReset(form) {
    var email = val(form, 'email'), code = val(form, 'code');
    var password = val(form, 'password'), again = val(form, 'password2');
    if (!emailOk(email)) { acctSay('err', A('needEmail')); return; }
    if (!String(code || '').trim()) { acctSay('err', A('needCode')); return; }
    if (!passOk(password)) { acctSay('err', A('weak')); return; }
    if (password !== again) { acctSay('err', A('mismatch')); return; }
    acctSay('', ''); acctBusy(true);
    api('/api/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ email: email, code: String(code).trim(), password: password })
    }).then(function (r) {
      acctBusy(false);
      if (!r.ok) { acctSay('err', apiErr(r, lang === 'zh' ? '密码重置失败，请检查验证码。' : 'Could not reset the password — check the code.')); return; }
      codeSent = false;
      acctSay('ok', A('pwChanged'));
      setTimeout(function () { authMode = 'password'; codeSent = false; renderAccount(); }, 1400);
    });
  }

  function doSignOut() {
    SESSION = null;
    GHS = { signedIn: false };
    /* 登出必须**连角色一起清**。角色是"上次会话的结论"，不是站点常量：
       旧代码只置 SESSION，CONSOLE.isAdmin / DX_ROLE.loaded / 控制台的
       MC.isAdmin / MC.me 全部留着上一轮的真值。于是
       「管理员登录 → 退出 → 打开 /console」时，控制台仍认为 signedIn 为真、
       isAdmin 为真，整组管理菜单与 ADMIN 徽标照旧渲染，只有名字因为
       SESSION 已空而显示「未登录」—— 2026-10-24 泄露截图就是这个状态。 */
    CONSOLE.isAdmin = false;
    CONSOLE.admins = [];
    DX_ROLE = { loaded: false, loading: null };
    if (window.MCConsole && window.MCConsole.MC) {
      var MCc = window.MCConsole.MC;
      MCc.isAdmin = false;
      MCc.me = null;
      MCc.roleChecked = false;   /* 下次进控制台必须重新校验 */
      MCc.roleAt = 0;
      MCc.signedOut = true;
      MCc.data = {};
      MCc.view = null;
    }
    api('/api/auth/logout', { method: 'POST' }).then(function () {
      afterAuth(lang === 'zh' ? '已退出登录。' : 'You are signed out.');
    });
  }

  function doClaimAdmin() {
    acctBusy(true, A('working'));
    /* The server allows exactly one self-service claim: the first signed-in
       account to ask. After that the endpoint refuses everyone. */
    api('/api/admin/claim', { method: 'POST', body: '{}' }).then(function (r) {
      acctBusy(false);
      if (!r.ok) {
        consoleSay('err', (lang === 'zh')
          ? '领取失败：管理员已存在，或当前账号无权操作。'
          : 'Could not claim: an administrator already exists, or this account is not allowed.');
        return;
      }
      toast(lang === 'zh' ? '已成为管理员。' : 'You are now an administrator.');
      consoleSay('ok', lang === 'zh' ? '已成为管理员。' : 'You are now an administrator.');
      CONSOLE.isAdmin = true;      /* reflect it at once, before the refresh lands */
      CONSOLE.admins = CONSOLE.admins.concat([{ owner_id: uidOf(SESSION) }]);
      consoleRefresh();
    });
  }

  /* ======================================================================= *
   *  5d · CONSOLE — the signed-in account area                              *
   *                                                                          *
   *  Reads flow through site_leads / site_profiles / site_admins under RLS.   *
   *  A normal member sees only their own rows; an administrator sees all of   *
   *  them. The client never decides that — the database policies do.          *
   * ======================================================================= */

  var CONSOLE = { leads: [], profiles: [], admins: [], err: '', loading: false, tab: 'overview', loaded: false,
                  nsList: [], nsCur: '', nsItems: [], nsTotal: 0, nsLoading: false, nsErr: '' };

  function consoleSay(kind, text) {
    var el = document.getElementById('console-msg'); if (!el) return;
    el.className = 'authmsg' + (kind ? ' ' + kind : '');
    el.textContent = text || '';
    el.hidden = !text;
  }

  /* The server hands back one flat identity object (see session_payload in
     server.py): { signedIn, id, provider, email, name, login, avatar }. These
     helpers accept that shape as well as a nested { user: {...} } envelope, so
     the console keeps working whichever route produced the session. */
  function uidOf(s) {
    if (!s) return '';
    return (s.user && (s.user.id || s.user.user_id)) || s.id || s.email ||
           (s.login ? 'gh:' + s.login : '') || '';
  }
  function emailOf(s) { return (s && s.user && s.user.email) || (s && s.email) || ''; }
  function initialOf(s) {
    var e = emailOf(s);
    if (e) return e.charAt(0).toUpperCase();
    var n = (s && (s.name || s.login)) || '';
    return n ? String(n).charAt(0).toUpperCase() : '·';
  }

  function isAdmin() {
    /* 角色只有在"当前存在有效会话"时才有意义。旧写法把
       `if (CONSOLE.isAdmin) return true;` 放在最前面短路，等于让上次会话的
       结论凌驾于当前会话之上：会话没了，角色还活着。它和 doSignOut 不清角色
       叠加，就是"登出后仍是管理员"的第二条路径。先确认已登录，再谈角色。 */
    var u = uidOf(SESSION);
    if (!u) return false;
    if (CONSOLE.isAdmin === true) return true;        /* decided by the server */
    return (CONSOLE.admins || []).some(function (r) { return r.owner_id === u; });
  }

  function when(v) {
    if (v === null || v === undefined || v === '') return '—';
    var d;
    if (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()))) {
      /* 后端时间字段是秒级 Unix epoch（time.time()）。JS 的 Date 构造按毫秒
         解析，直接拿秒往里传会全部塌到 1970-01-2x —— 用户页「注册时间」、
         留言页「时间」、总览「最近提交」曾因此整列显示 1970 年（2026-10-18 修）。
         1e11 秒 ≈ 5138 年、1e11 毫秒 ≈ 1973 年，用它做分界线两种单位都安全。

         2026-10-22 补：正则必须允许**小数**（`^\d+(\.\d+)?$`）。
         time.time() 是浮点，str() 出来是 '1792640820.987307' 这种带小数点的串。
         旧正则 `^\d+$` 不认小数点 → 整串掉进 else 分支 new Date(str) → NaN
         → isNaN() 原样返回那串数字，用户页「注册时间」就显示成一串 epoch。
         后端现在统一发本地 ISO，这里是纵深防御。 */
      var n = Number(v);
      d = new Date(n > 0 && n < 1e11 ? n * 1000 : n);
    } else {
      d = new Date(v);
    }
    if (isNaN(d.getTime())) return String(v);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function maskEmail(e) {
    if (!e) return '—';
    var at = String(e).indexOf('@');
    if (at <= 2) return String(e);
    return String(e).slice(0, 2) + '***' + String(e).slice(at);
  }

  function statusChip(s) {
    var v = String(s || 'new');
    var cls = v === 'new' ? 'new' : (v === 'done' || v === 'closed' ? 'done' : 'muted');
    return '<span class="st ' + cls + '">' + esc(v) + '</span>';
  }

  function consoleBodyHTML() {
    var zh = lang === 'zh';

    if (!SESSION) {
      return '<div class="card card-pad" style="max-width:520px">' +
        '<h2 class="h2" style="font-size:20px">' + (zh ? '需要登录' : 'Sign-in required') + '</h2>' +
        '<p class="sub" style="margin-top:12px">' +
          (zh ? 'Mnemosyne OS SaaS 只对已登录账号开放。登录后可查看你的提交记录、资料与套餐。'
              : 'The console is available to signed-in accounts only. Sign in to see your submissions, profile and plan.') +
        '</p>' +
        '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">' +
          '<a class="btn btn-accent" href="#/login">' + esc(A('tabIn')) + '</a>' +
          '<a class="btn btn-ghost" href="#/login">' + esc(A('tabUp')) + '</a>' +
        '</div></div>';
    }

    var u = uidOf(SESSION);
    var mine = CONSOLE.leads.filter(function (r) { return r.owner_id === u; });
    var admin = isAdmin();
    var visible = admin ? CONSOLE.leads : mine;
    var fresh = visible.filter(function (r) { return String(r.status || 'new') === 'new'; }).length;

    var kpis =
      '<div class="kgrid">' +
        '<div class="kpi"><div class="v">' + visible.length + '</div><div class="l">' +
          (zh ? (admin ? '全部留言' : '我的留言') : (admin ? 'Total leads' : 'My requests')) + '</div></div>' +
        '<div class="kpi"><div class="v">' + fresh + '</div><div class="l">' + (zh ? '待处理' : 'Unhandled') + '</div></div>' +
        '<div class="kpi"><div class="v">' + (admin ? CONSOLE.profiles.length : 1) + '</div><div class="l">' +
          (zh ? (admin ? '注册用户' : '我的资料') : (admin ? 'Profiles' : 'My profile')) + '</div></div>' +
        '<div class="kpi"><div class="v" style="font-size:18px;padding-top:6px">' +
          (admin ? (zh ? '管理员' : 'Administrator') : (zh ? '普通用户' : 'User')) + '</div><div class="l">' +
          (zh ? '当前身份' : 'Access level') + '</div></div>' +
      '</div>';

    var tabs =
      '<div class="ktabs" role="tablist">' +
        tabBtn('overview', zh ? '总览' : 'Overview') +
        tabBtn('leads', zh ? '留言与申请' : 'Requests') +
        tabBtn('account', zh ? '账号安全' : 'Account') +
        (admin ? tabBtn('health', zh ? '系统概览' : 'System') : '') +
        (admin ? tabBtn('notice', zh ? '通知栏' : 'Announcement') : '') +
        (admin ? tabBtn('members', zh ? '用户' : 'Members') : '') +
        (admin ? tabBtn('memn', zh ? '用户记忆' : 'User memory') : '') +
        (admin ? tabBtn('admins', zh ? '管理员' : 'Administrators') : '') +
        (admin ? tabBtn('site', zh ? '站点配置' : 'Site settings') : '') +
      '</div>';

    var panel;
    if (CONSOLE.tab === 'leads') panel = leadsPanel(visible, admin, zh);
    else if (CONSOLE.tab === 'account') panel = accountPanel(zh);
    else if (CONSOLE.tab === 'health' && admin) panel = mnHealthPanel(zh);
    else if (CONSOLE.tab === 'notice' && admin) panel = mnNoticePanel(zh);
    else if (CONSOLE.tab === 'members' && admin) panel = membersPanel(zh);
    else if (CONSOLE.tab === 'memn' && admin) panel = mnemPanel(zh);
    else if (CONSOLE.tab === 'admins' && admin) panel = adminsPanel(zh);
    else if (CONSOLE.tab === 'site' && admin) panel = sitePanel(zh);
    else panel = overviewPanel(visible, admin, zh);

    var head =
      '<div class="chead">' +
        '<div class="cwho">' +
          '<span class="av">' + esc(initialOf(SESSION)) + '</span>' +
          '<div style="min-width:0">' +
            '<div class="text-[15px] text-fg" style="overflow:hidden;text-overflow:ellipsis">' + esc(emailOf(SESSION) || '—') + '</div>' +
            '<div class="mono text-[11px]" style="color:var(--fg3);margin-top:3px">' +
              (zh ? '用户 ID ' : 'uid ') + esc(u || '—') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          (admin
            ? ''
            : (CONSOLE.admins.length
              /* The slot is one-shot: once somebody holds it, offer nobody a
                 button that could only ever fail. */
              ? ''
              : '<button class="btn btn-ghost btn-sm" type="button" data-act="claim-admin">' +
                (zh ? '领取管理员' : 'Claim administrator') + '</button>')) +
          '<button class="btn btn-ghost btn-sm" type="button" data-act="signout">' + (zh ? '退出登录' : 'Sign out') + '</button>' +
        '</div>' +
      '</div>';

    return head +
      '<div class="authmsg" id="console-msg" hidden style="margin-top:20px"></div>' +
      '<div style="margin-top:24px">' + kpis + '</div>' +
      tabs +
      '<div class="kpanel">' + panel + '</div>';
  }

  /* ── 管理员名册 ────────────────────────────────────────────────────
     后端 handle_admins() 强制两条规则：不能移除自己，最后一名管理员
     不能被移除。这里只负责不画出注定失败的按钮 —— 判断永远在服务端。 */
  function adminsPanel(zh) {
    setTimeout(loadAdminRoster, 0);
    return '<div id="adm-roster"><div class="kempty">' + esc(zh ? '加载中…' : 'Loading…') + '</div></div>';
  }

  function loadAdminRoster() {
    var zh = lang === 'zh';
    var box = document.getElementById('adm-roster');
    if (!box) return;
    api('/api/admin/admins').then(function (r) {
      if (!document.getElementById('adm-roster')) return;
      var b = (r.ok && r.body) || {};
      var rows = b.admins || [], cands = b.candidates || [], me = b.me || '';
      var head = '<th>' + (zh ? '账号' : 'Account') + '</th>' +
        '<th>' + (zh ? '类型' : 'Type') + '</th>' +
        '<th>' + (zh ? '备注' : 'Note') + '</th>' +
        '<th>' + (zh ? '加入时间' : 'Since') + '</th>' +
        '<th></th>';
      var body = rows.map(function (a) {
        var self = a.id === me;
        return '<tr><td class="strong">' + esc(a.id) +
            (self ? ' <span class="chipnote">' + esc(zh ? '你' : 'you') + '</span>' : '') + '</td>' +
          '<td>' + esc(a.kind === 'github' ? 'GitHub' : (zh ? '邮箱' : 'Email')) + '</td>' +
          '<td>' + esc(a.note || '—') + '</td>' +
          '<td class="mono" style="white-space:nowrap">' + esc(when(a.since)) + '</td>' +
          '<td>' + (self
            ? '<span class="chipnote">' + esc(zh ? '不可自删' : 'no self-removal') + '</span>'
            : '<button class="btn btn-ghost btn-sm" type="button" data-act="adm-remove" data-v="' +
              esc(a.id) + '">' + esc(zh ? '移除' : 'Remove') + '</button>') + '</td></tr>';
      }).join('');
      var opts = cands.map(function (c) {
        return '<option value="' + esc(c.id) + '">' + esc(c.id) +
          (c.kind === 'github' ? ' (GitHub)' : '') + '</option>';
      }).join('');

      box.innerHTML =
        '<h3 class="h2" style="font-size:17px">' + esc(zh ? '管理员' : 'Administrators') + '</h3>' +
        '<p class="sub" style="margin-top:8px;font-size:12.5px">' +
          esc(zh ? '只有管理员能进入后台管理。你不能移除自己，最后一名管理员也不能被移除。'
                 : 'Only administrators reach site admin. You cannot remove yourself, and the last administrator cannot be removed.') +
        '</p>' +
        '<div style="margin-top:14px">' +
          tableOr(rows, head, body, zh ? '没有管理员。' : 'No administrators.') + '</div>' +
        '<div class="card card-pad" style="margin-top:18px;max-width:600px">' +
          '<h4 class="h2" style="font-size:14.5px">' + esc(zh ? '添加管理员' : 'Add an administrator') + '</h4>' +
          '<p class="sub" style="margin-top:6px;font-size:12px">' +
            esc(zh ? '只能从本站出现过的账号里选：已注册的邮箱，或登录过的 GitHub 身份。'
                   : 'Only identities this site has seen: a registered email, or a GitHub login that has signed in.') +
          '</p>' +
          (opts
            ? '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
                '<select class="inp" id="adm-pick" style="flex:1;min-width:200px">' + opts + '</select>' +
                '<input class="inp" id="adm-note" placeholder="' + esc(zh ? '备注（可选）' : 'Note (optional)') +
                  '" style="flex:1;min-width:150px">' +
                '<button class="btn btn-sm" type="button" data-act="adm-add">' +
                  esc(zh ? '添加' : 'Add') + '</button>' +
              '</div>'
            : '<div class="kempty" style="margin-top:12px">' +
              esc(zh ? '没有可提升的账号。' : 'No accounts left to promote.') + '</div>') +
        '</div>';
    });
  }

  /* ── 站点配置里的四个表单（一般 / 模型 / 邮件 / 危险区域）──────────────
     2026-10-21：控制台重做时，这四个函数跟着控制台一起被删掉了，但
     「后台管理 → 站点配置」仍在调用它们 —— 于是 loadSiteConfig() 抛
     ReferenceError，整块永远停在"加载中…"。

     注意作用域：这段代码在**第一个 IIFE**里（和 sitePanel / loadSiteConfig 同域），
     所以只能用这里的 lang / esc / api / toast，不能调站点模块（window.MN）里的
     docLang / L。api() 的第二个参数是 fetch init，不是 body —— 写操作统一走 admPost()。 */
  function isZh() { return lang === 'zh'; }

  function admPost(path, body) {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  }

  function qv(id) { var el = document.getElementById(id); return el ? el.value : ''; }

  function dxFactRow(label, value) {
    return '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0">' +
      '<span style="color:var(--fg3);font-size:12px">' + esc(label) + '</span>' +
      '<b style="font-weight:500">' + esc(value) + '</b></div>';
  }

  function dxSetGeneral(s, d) {
    s = s || {};
    var who = SESSION || {};
    return '<div class="dx-hrow"><div><h1 class="dx-h1">' + esc(dz('一般设置', 'General')) + '</h1></div>' +
      '<div class="sp"></div></div>' +
      '<div class="dx-grid">' +
        '<div class="dx-field"><label>' + esc(dz('项目名称', 'Project name')) + '</label>' +
          '<input class="inp" id="dx-set-name" value="' + esc(s.project_name || '') + '"></div>' +
        '<div class="dx-field"><label>' + esc(dz('项目 ID', 'Project ID')) + '</label>' +
          '<input class="inp" value="' + esc((d && d.projectId) || '') + '" readonly></div>' +
        '<div class="dx-field"><label>' + esc(dz('项目描述', 'Project description')) + '</label>' +
          '<textarea class="inp" id="dx-set-desc" placeholder="' +
            esc(dz('输入项目描述…', 'Describe this project…')) + '">' + esc(s.project_desc || '') + '</textarea></div>' +
        '<div><button class="dx-btn" type="button" data-dx="set-save">' +
          esc(dz('保存', 'Save')) + '</button></div>' +
      '</div>' +
      '<div class="dx-dsep"></div>' +
      '<div class="dx-grid dx-g3">' +
        dxFactRow(dz('记忆保留', 'Retention'),
                  s.retention_days ? (s.retention_days + ' ' + dz('天', 'days')) : dz('永久', 'forever')) +
        dxFactRow(dz('梦的合成', 'Dream synthesis'), s.dream_synth ? dz('开', 'on') : dz('关', 'off')) +
        dxFactRow(dz('项目身份', 'Project identity'), who.email || who.login || '—') +
      '</div>';
  }

  function dxSetModel(llm) {
    llm = llm || {};
    var zh = isZh();
    return '<div class="dx-hrow"><div><h1 class="dx-h1">' + esc(dz('模型', 'Model')) + '</h1>' +
      '<p class="dx-sub">' + esc(dz(
        '副驾驶与演示沙盒用这个模型阅读记忆并作答，密钥只存在服务器上。',
        'The Copilot and the demo sandbox use this model to read memories and answer. The key stays on the server.')) + '</p></div>' +
      '<div class="sp"></div>' +
      '<span class="dx-tag"' + (llm.ready ? ' style="background:rgba(113,220,200,.14);color:#0E9F6E"' : '') + '>' +
        esc(llm.ready ? dz('已就绪', 'ready') : dz('未配置', 'not configured')) + '</span></div>' +
      '<div class="dx-grid">' +
        '<div class="dx-field"><label>' + esc(dz('接口地址', 'Base URL')) + '</label>' +
          '<input class="inp" id="dx-llm-base" value="' +
            esc(llm.baseUrl || 'https://api.siliconflow.cn/v1') + '"></div>' +
        '<div class="dx-field"><label>' + esc(dz('模型名', 'Model')) + '</label>' +
          '<input class="inp" id="dx-llm-model" value="' + esc(llm.model || '') + '"></div>' +
        '<div class="dx-field"><label>' + esc(dz('API 密钥', 'API key')) + '</label>' +
          '<input class="inp" id="dx-llm-key" type="password" placeholder="' +
            esc(llm.hasKey
                ? (zh ? '已设置（' + (llm.keyHint || '') + '），留空则不改'
                      : 'Set (' + (llm.keyHint || '') + ') — leave empty to keep it')
                : 'sk-…') + '"></div>' +
        '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
          '<button class="dx-btn" type="button" data-dx="llm-save">' + esc(dz('保存', 'Save')) + '</button>' +
          '<button class="dx-btn gh" type="button" data-dx="llm-test">' +
            esc(dz('测试连通性', 'Test the connection')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div id="dx-llm-note" style="font-size:12px;color:var(--fg3);margin-top:12px;line-height:1.7">' +
        esc((zh ? '配置来源：' : 'Configured by: ') +
            ({ deploy: zh ? '部署时写入' : 'the deployment',
               console: zh ? '在本页保存' : 'this page',
               none: zh ? '尚未配置' : 'nothing yet' }[llm.source] || (zh ? '未知' : 'unknown'))) +
      '</div>';
  }

  function dxSetMail(smtp) {
    smtp = smtp || {};
    var zh = isZh();
    return '<div class="dx-hrow"><div><h1 class="dx-h1">' + esc(dz('邮件', 'Mail')) + '</h1>' +
      '<p class="dx-sub">' + esc(dz(
        '注册验证码由这个发信账号寄出。没有它，注册表单不会显示验证码输入框。',
        'Sign-up codes are sent by this account. Without it the sign-up form hides the code field.')) + '</p></div>' +
      '<div class="sp"></div>' +
      '<span class="dx-tag"' + (smtp.ready ? ' style="background:rgba(113,220,200,.14);color:#0E9F6E"' : '') + '>' +
        esc(smtp.ready ? dz('已就绪', 'ready') : dz('未配置', 'not configured')) + '</span></div>' +
      '<div class="dx-grid">' +
        '<div class="dx-field"><label>' + esc(dz('SMTP 主机', 'SMTP host')) + '</label>' +
          '<input class="inp" id="dx-smtp-host" placeholder="smtp.qq.com" value="' + esc(smtp.host || '') + '"></div>' +
        '<div class="dx-field"><label>' + esc(dz('端口', 'Port')) + '</label>' +
          '<input class="inp" id="dx-smtp-port" value="' + esc(String(smtp.port || 465)) + '"></div>' +
        '<div class="dx-field"><label>' + esc(dz('加密方式', 'Security')) + '</label>' +
          '<select class="inp" id="dx-smtp-sec">' +
            ['ssl', 'starttls', 'none'].map(function (v) {
              return '<option value="' + v + '"' + (smtp.security === v ? ' selected' : '') + '>' +
                v.toUpperCase() + '</option>';
            }).join('') + '</select></div>' +
        '<div class="dx-field"><label>' + esc(dz('账号', 'Username')) + '</label>' +
          '<input class="inp" id="dx-smtp-user" placeholder="you@qq.com" value="' + esc(smtp.user || '') + '"></div>' +
        '<div class="dx-field"><label>' + esc(dz('授权码 / 密码', 'Password / app code')) + '</label>' +
          '<input class="inp" id="dx-smtp-pass" type="password" placeholder="' +
            esc(smtp.hasPass ? (zh ? '已设置，留空则不改' : 'Set — leave empty to keep it')
                             : (zh ? '邮箱授权码' : 'mail app password')) + '"></div>' +
        '<div class="dx-field"><label>' + esc(dz('发件地址', 'From address')) + '</label>' +
          '<input class="inp" id="dx-smtp-from" placeholder="Mnemosyne OS &lt;you@qq.com&gt;" value="' +
            esc(smtp.from || '') + '"></div>' +
        '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
          '<button class="dx-btn" type="button" data-dx="smtp-save">' + esc(dz('保存', 'Save')) + '</button>' +
          '<button class="dx-btn gh" type="button" data-dx="smtp-test">' +
            esc(dz('发一封测试邮件', 'Send a test message')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="dx-note" style="margin-top:14px">' +
        esc(zh ? 'QQ 邮箱为例：主机 smtp.qq.com、端口 465、加密 SSL、账号填完整邮箱、密码填「授权码」（在邮箱设置的账户页生成，不是登录密码）。'
               : 'For QQ Mail: host smtp.qq.com, port 465, security SSL, the full address as the username, and an app-specific code (not your login password) as the password.') +
      '</div>' +
      '<div id="dx-smtp-note" style="font-size:12px;color:var(--fg3);margin-top:12px;line-height:1.7"></div>';
  }

  function dangerRow(title, sub, action) {
    return '<div class="rw"><span class="sp"><span class="t">' + esc(title) + '</span>' +
      '<span class="s">' + esc(sub) + '</span></span>' +
      '<button class="dx-btn dg sm" type="button" data-dx="danger" data-a="' + action + '">' +
      esc(dz('执行', 'Run')) + '</button></div>';
  }

  function dxSetDanger() {
    return '<div class="dx-hrow"><div><h1 class="dx-h1" style="color:#DC2626">' +
      esc(dz('危险区域', 'Danger zone')) + '</h1>' +
      '<p class="dx-sub">' + esc(dz('这里的操作不可撤销，需要输入项目名确认。',
        'These cannot be undone, and require the project name to confirm.')) + '</p></div></div>' +
      '<div class="dx-dz">' +
        dangerRow(dz('删除所有记忆', 'Delete all memories'),
          dz('永久删除此项目中的所有内容。此操作无法撤销。',
             'Permanently remove every memory in this project. This cannot be undone.'),
          'wipe-memories') +
        dangerRow(dz('删除项目', 'Delete project'),
          dz('永久删除此项目及其所有相关数据。',
             'Permanently delete this project and everything attached to it.'),
          'delete-project') +
      '</div>';
  }

  /* 四个表单的事件处理。只认 #site-cfg 里的 [data-dx]，
     不和页面上任何别的 data-dx 抢。 */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-dx]') : null;
    if (!el) return;
    var box = document.getElementById('site-cfg');
    if (!box || !box.contains(el)) return;
    var act = el.getAttribute('data-dx');
    var zh = isZh();

    if (act === 'set-save') {
      el.disabled = true;
      admPost('/api/dash/settings', { project_name: qv('dx-set-name'), project_desc: qv('dx-set-desc') })
        .then(function (r) {
          el.disabled = false;
          toast(r.ok ? (zh ? '已保存。' : 'Saved.') : (zh ? '保存失败。' : 'Save failed.'));
          if (r.ok) loadSiteConfig();
        });
      return;
    }

    if (act === 'llm-save') {
      var payload = { baseUrl: qv('dx-llm-base'), model: qv('dx-llm-model') };
      var k = qv('dx-llm-key');
      if (k) payload.apiKey = k;
      el.disabled = true;
      admPost('/api/dash/llm', payload).then(function (r) {
        el.disabled = false;
        var ok = r.ok && r.body && r.body.llm;
        toast(ok ? (zh ? '模型配置已保存。' : 'Model settings saved.')
                 : (zh ? '保存失败。' : 'Could not save.'));
        if (ok) loadSiteConfig();
      });
      return;
    }

    if (act === 'llm-test') {
      var label = el.textContent;
      el.disabled = true;
      el.textContent = zh ? '测试中…' : 'Testing…';
      admPost('/api/dash/llm/test', {}).then(function (r) {
        el.disabled = false;
        el.textContent = label;
        var b = (r && r.body) || {};
        var note = document.getElementById('dx-llm-note');
        var msg = (r.ok && b.ok)
          ? (zh ? '连通正常，模型 ' + (b.model || '') + ' 回复：' + (b.reply || '')
                : 'OK — ' + (b.model || '') + ' replied: ' + (b.reply || ''))
          : (zh ? '不通：' + (b.detail || b.error || '未知原因')
                : 'Failed: ' + (b.detail || b.error || 'unknown'));
        if (note) note.textContent = msg;
        toast(String(msg).slice(0, 140));
      });
      return;
    }

    if (act === 'smtp-save') {
      var sb = { host: qv('dx-smtp-host'), port: qv('dx-smtp-port'),
                 security: qv('dx-smtp-sec'), user: qv('dx-smtp-user'),
                 from: qv('dx-smtp-from') };
      var sp = qv('dx-smtp-pass');
      if (sp) sb.pass = sp;
      el.disabled = true;
      admPost('/api/dash/smtp', sb).then(function (r) {
        el.disabled = false;
        var ok = r.ok && r.body && r.body.smtp;
        toast(ok ? (zh ? '邮件配置已保存。' : 'Mail settings saved.')
                 : (zh ? '保存失败。' : 'Could not save.'));
        if (ok) loadSiteConfig();
      });
      return;
    }

    if (act === 'smtp-test') {
      var lb2 = el.textContent;
      el.disabled = true;
      el.textContent = zh ? '发送中…' : 'Sending…';
      admPost('/api/dash/smtp/test', {}).then(function (r) {
        el.disabled = false;
        el.textContent = lb2;
        var b = (r && r.body) || {};
        var note = document.getElementById('dx-smtp-note');
        var msg = (r.ok && b.ok)
          ? (zh ? '已向 ' + (b.to || '') + ' 发出一封测试邮件。'
                : 'A test message went to ' + (b.to || '') + '.')
          : (zh ? '发送失败：' + (b.detail || b.error || '未知原因')
                : 'Failed: ' + (b.detail || b.error || 'unknown'));
        if (note) note.textContent = msg;
        toast(String(msg).slice(0, 140));
      });
      return;
    }

    if (act === 'danger') {
      var a = el.getAttribute('data-a');
      var typed = window.prompt(zh ? '这是不可撤销的操作。请输入项目名称以确认：'
                                   : 'This cannot be undone. Type the project name to confirm:');
      if (typed === null) return;
      admPost('/api/dash/danger', { action: a, confirm: typed }).then(function (r) {
        var b = (r && r.body) || {};
        if (b.refused) { window.alert(b.message || ''); return; }
        toast(b.message || (zh ? '未执行。' : 'Not executed.'));
      });
      return;
    }
  });

  /* ── 站点配置：管理员管理「网站 + 控制台」的唯一入口 ──────────────
     复用控制台的 dx 控件。它们的点击处理挂在 document 上，靠 .dx
     容器放行，所以这里包一层 .dx 就能直接用，不必重写表单。 */
  function sitePanel(zh) {
    setTimeout(loadSiteConfig, 0);
    return '<div id="site-cfg"><div class="kempty">' + esc(zh ? '加载中…' : 'Loading…') + '</div></div>';
  }

  function loadSiteConfig() {
    var box = document.getElementById('site-cfg');
    if (!box) return;
    /* 一次并行取回后台全部数据源。原来是 3 个请求，现在是 6 个但仍然并发 ——
       相比「串行渲染、每次切换标签都重取」，并发一次拿全反而更快，也不会出现
       「先看到模型面板、两秒后邮件面板才补上」的跳动。 */
    Promise.all([
      api('/api/dash/settings').then(function (r) { return (r.ok && r.body) || {}; }),
      api('/api/dash/llm').then(function (r) { return (r.ok && r.body) || {}; }),
      api('/api/dash/smtp').then(function (r) { return (r.ok && r.body) || {}; }),
      api('/api/dash/site').then(function (r) { return (r.ok && r.body) || {}; }),
      api('/api/dash/oauth').then(function (r) { return (r.ok && r.body) || {}; }),
      api('/api/dash/system').then(function (r) { return (r.ok && r.body) || {}; })
    ]).then(function (res) {
      if (!document.getElementById('site-cfg')) return;
      var d = res[0] || {};
      var llm = (res[1] || {}).llm || {};
      var smtp = (res[2] || {}).smtp || {};
      var site = res[3] || {};
      var oauth = res[4] || {};
      var sys = res[5] || {};
      /* 每个配置块独立成卡片：这几个函数原本各自是「一整页」，拼在一起时
         必须自己提供分隔与层级，否则就是几个大标题摞在一起。
         排序按「管理员最常动什么」：先看现状（就绪状态），再改内容，最后才是
         凭据与危险操作 —— 这是通用后台的既定次序，也避免误点危险区。 */
      box.innerHTML = '<div class="dx site-cfg">' +
        '<section class="site-sec">' + MN.secReadiness(site) + '</section>' +
        '<section class="site-sec">' + MN.secBrand(site) + '</section>' +
        /* 文案紧跟在品牌后面：它是管理员最高频的改动，不该沉到凭据区下面 */
        '<section class="site-sec">' + MN.secContent(site) + '</section>' +
        '<section class="site-sec">' + MN.secAuth(site) + '</section>' +
        '<section class="site-sec">' + MN.secOAuth(oauth) + '</section>' +
        '<section class="site-sec">' + MN.secMemory(site, sys) + '</section>' +
        '<section class="site-sec">' + MN.secMailTpl(site) + '</section>' +
        '<section class="site-sec">' + MN.secFooter(site) + '</section>' +
        '<section class="site-sec">' + dxSetGeneral(d.settings || {}, d) + '</section>' +
        '<section class="site-sec">' + dxSetModel(llm) + '</section>' +
        '<section class="site-sec">' + dxSetMail(smtp) + '</section>' +
        '<section class="site-sec">' + dxSetDanger() + '</section>' +
        '</div>';
      icons();
      MN.wireAdmin(box, loadSiteConfig);
    });
  }

  function tabBtn(id, label) {
    return '<button role="tab" type="button" data-ctab="' + id + '" aria-selected="' +
           (CONSOLE.tab === id) + '">' + esc(label) + '</button>';
  }

  function tableOr(rows, head, body, empty) {
    if (!rows.length) return '<div class="kempty">' + esc(empty) + '</div>';
    return '<div class="card" style="overflow:hidden"><div style="overflow-x:auto">' +
      '<table class="ltable"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
      '</div></div>';
  }

  function leadsPanel(rows, admin, zh) {
    var head = (admin ? '<th>' + (zh ? '提交人' : 'Contact') + '</th>' : '') +
      '<th>' + (zh ? '公司' : 'Company') + '</th>' +
      '<th>' + (zh ? '内容' : 'Message') + '</th>' +
      '<th>' + (zh ? '来源' : 'Source') + '</th>' +
      '<th>' + (zh ? '状态' : 'Status') + '</th>' +
      '<th>' + (zh ? '时间' : 'When') + '</th>';
    var body = rows.map(function (r) {
      return '<tr>' +
        (admin ? '<td class="strong">' + esc(maskEmail(r.email)) + (r.name ? '<br><span style="color:var(--fg3)">' + esc(r.name) + '</span>' : '') + '</td>' : '') +
        '<td>' + esc(r.company || '—') + '</td>' +
        '<td style="max-width:340px">' + esc(String(r.message || '').slice(0, 220) || '—') + '</td>' +
        '<td>' + esc(r.source || '—') + '</td>' +
        '<td>' + statusChip(r.status) + '</td>' +
        '<td class="mono" style="white-space:nowrap">' + esc(when(r.created_at)) + '</td>' +
      '</tr>';
    }).join('');
    return tableOr(rows, head, body,
      zh ? '还没有留言。联系表单提交后会出现在这里。' : 'No requests yet. Submissions from the contact form show up here.');
  }

  function overviewPanel(rows, admin, zh) {
    var recent = rows.slice(0, 5);
    var body = recent.map(function (r) {
      return '<tr><td class="strong">' + esc(r.email || '—') + '</td>' +
             '<td style="max-width:300px">' + esc(String(r.message || '').slice(0, 120) || '—') + '</td>' +
             '<td>' + statusChip(r.status) + '</td>' +
             '<td class="mono" style="white-space:nowrap">' + esc(when(r.created_at)) + '</td></tr>';
    }).join('');
    var list = tableOr(recent, '<th>' + (zh ? '邮箱' : 'Email') + '</th><th>' + (zh ? '内容' : 'Message') + '</th>' +
      '<th>' + (zh ? '状态' : 'Status') + '</th><th>' + (zh ? '时间' : 'When') + '</th>', body,
      zh ? '还没有数据。' : 'Nothing here yet.');

    var note = admin
      ? '<p class="sub" style="margin-top:20px">' +
        (zh ? '当前账号是管理员，可以看到全部留言与注册用户。数据由数据库的行级安全策略决定，前端不做判断。'
            : 'This account is an administrator, so it sees every request and every profile. What is visible is decided by the database row-level policies, not by this page.') + '</p>'
      : '';

    return '<h3 class="h2" style="font-size:17px">' + (zh ? '最近提交' : 'Recent submissions') + '</h3>' +
      '<div style="margin-top:14px">' + list + '</div>' + note;
  }

  function accountPanel(zh) {
    return '<div style="display:grid;gap:16px;max-width:560px">' +
      '<form class="card card-pad" id="prof-form" novalidate>' +
        '<h3 class="h2" style="font-size:17px">' + (zh ? '个人资料' : 'Profile') + '</h3>' +
        '<p class="sub" style="margin-top:8px;font-size:12.5px">' +
          (zh ? '头像、显示名称与联系方式。显示名称会出现在页面右上角。'
              : 'Picture, display name and contact details. The display name is what the header shows.') + '</p>' +
        '<div class="avrow" style="margin-top:18px">' +
          '<span class="avprev" id="av-prev">' + avatarInnerHTML() + '</span>' +
          '<span class="avmeta">' +
            '<span class="t">' + (zh ? '头像' : 'Picture') + '</span>' +
            '<span class="d">' + (zh ? 'PNG / JPEG / WebP / GIF，最大 512 KB。留空时显示 Mnemosyne OS 标志。'
                                      : 'PNG / JPEG / WebP / GIF, up to 512 KB. Without one the Mnemosyne OS mark is shown.') + '</span>' +
            '<span class="avbtns">' +
              '<label class="avbtn" for="av-file"><i data-lucide="upload" style="width:12px;height:12px"></i>' +
                (zh ? '选择图片' : 'Choose a picture') + '</label>' +
              '<input id="av-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>' +
              '<button class="avbtn dg" type="button" data-act="av-remove">' + (zh ? '移除' : 'Remove') + '</button>' +
            '</span>' +
          '</span>' +
        '</div>' +
        '<div style="margin-top:16px">' +
          '<div class="field"><label for="pf-name">' + esc(A('name')) + '</label>' +
            '<input id="pf-name" name="display_name" placeholder="—" /></div>' +
          '<div class="field"><label for="pf-co">' + esc(A('company')) + '</label>' +
            '<input id="pf-co" name="company" placeholder="—" /></div>' +
          '<div class="field"><label for="pf-note">' + (zh ? '备注' : 'Note') + '</label>' +
            '<input id="pf-note" name="note" placeholder="—" /></div>' +
        '</div>' +
        '<button class="btn btn-accent" type="submit">' + (zh ? '保存资料' : 'Save profile') + '</button>' +
      '</form>' +
      '<form class="card card-pad" id="pw-form" novalidate>' +
        '<h3 class="h2" style="font-size:17px">' + (zh ? '修改密码' : 'Change password') + '</h3>' +
        '<div style="margin-top:16px">' +
          '<div class="field"><label for="pw-old">' + (zh ? '当前密码' : 'Current password') + '</label>' +
            '<input id="pw-old" name="old" type="password" autocomplete="current-password" /></div>' +
          '<div class="field"><label for="pw-new">' + (zh ? '新密码' : 'New password') + '</label>' +
            '<input id="pw-new" name="next" type="password" autocomplete="new-password" />' +
            '<div class="hint">' + esc(A('pwRule')) + '</div></div>' +
        '</div>' +
        '<button class="btn btn-accent" type="submit">' + (zh ? '保存新密码' : 'Save the new password') + '</button>' +
      '</form>' +
    '</div>';
  }

  /* The profile form's picture box. Kept in one place so the console and the
     site-admin tab cannot drift apart. */
  function avatarInnerHTML() {
    var src = (SESSION && SESSION.avatar) ? String(SESSION.avatar) : '';
    if (src && src.indexOf('api/avatar/') === 0) return '<img src="/' + esc(src) + '" alt="">';
    if (src && src.indexOf('data:') === 0) return '<img src="' + esc(src) + '" alt="">';
    return logoMarkSVG();
  }

  function repaintAvatarBox() {
    var box = document.getElementById('av-prev');
    if (box) box.innerHTML = avatarInnerHTML();
  }

  function membersPanel(zh) {
    var body = CONSOLE.profiles.map(function (r) {
      var srcTag = (r.account_source === 'registered')
        ? (zh ? '注册账号' : 'account')
        : (r.account_source === 'profile_only' ? (zh ? '仅资料' : 'profile') : '');
      var roleTag = r.role === 'admin' ? (zh ? '管理员' : 'admin') : (zh ? '成员' : 'member');
      return '<tr>' +
        '<td class="strong">' + esc(r.display_name || '—') + '</td>' +
        '<td>' + esc(r.company || '—') + '</td>' +
        '<td>' + esc(r.plan || 'free') + '</td>' +
        '<td>' + esc(roleTag) + '</td>' +
        '<td>' + (srcTag ? esc(srcTag) : '—') + '</td>' +
        '<td class="mono" style="font-size:11.5px">' + esc(r.owner_id || '—') + '</td>' +
        '<td class="mono" style="white-space:nowrap">' + esc(when(r.created_at)) + '</td>' +
      '</tr>';
    }).join('');
    var admins = CONSOLE.admins.length
      ? '<p class="sub" style="margin-top:16px">' + (zh ? '管理员：' : 'Administrators: ') +
        CONSOLE.admins.map(function (a) { return '<code class="mono">' + esc(a.owner_id) + '</code>'; }).join('、') + '</p>'
      : '';
    return tableOr(CONSOLE.profiles,
      '<th>' + (zh ? '名称' : 'Name') + '</th><th>' + (zh ? '公司' : 'Company') + '</th><th>' +
      (zh ? '套餐' : 'Plan') + '</th><th>' + (zh ? '角色' : 'Role') + '</th><th>' +
      (zh ? '来源' : 'Source') + '</th><th>uid</th><th>' + (zh ? '注册时间' : 'Joined') + '</th>', body,
      zh ? '还没有用户资料。' : 'No profiles yet.') + admins;
  }

  /* ── 用户记忆（管理员专属，2026-10-18 新增；01:15 重构）────────────
     左列 = 全部用户的独立记忆库（/api/dash/namespaces，服务端附 owner 标签），
     右列 = 点开的那个库的全量记忆（/api/dash/memories?ns=）。
     用局部 DOM 更新而非整体重绘（与 adminsPanel 同款模式）；
     每步 try/catch 并把错误写进面板 —— 「无数据」不许再无声发生。 */
  function mnemPanel(zh) {
    setTimeout(mnemBoot, 0);
    return '<div id="memn-root">' +
      '<div style="display:grid;grid-template-columns:290px 1fr;gap:16px;align-items:start">' +
        '<div class="card card-pad" style="max-height:72vh;overflow-y:auto">' +
          '<h3 class="h2" style="font-size:14px;margin-bottom:10px">' + (zh ? '全部用户记忆库' : 'All user stores') + '</h3>' +
          '<div id="memn-list"><div class="kempty">' + (zh ? '加载中…' : 'Loading…') + '</div></div>' +
        '</div>' +
        '<div id="memn-detail"><div class="kempty">' + (zh ? '从左侧选择一个用户，查看其全部记忆。' : 'Pick a user on the left.') + '</div></div>' +
      '</div>' +
      '<p class="sub" style="margin-top:16px;font-size:12.5px">' +
        (zh ? '这里列出全部注册用户（含尚未领取密钥、零记忆的成员，与「成员 / 控制台成员」人数一致）；每个「u_」库是用户在 /auth/keys 自助领取密钥后绑定的私有记忆库。站点自己的库与孤立库归在下方「其他库」。'
            : 'All registered users are listed here — including members who have not claimed a key and have zero memories, matching the member/console counts. Each "u_" store is a user private library bound to their self-issued key; the site\'s own store and orphan stores are grouped under "Other stores" below.') +
      '</p></div>';
  }

  function mnemBoot() {
    var box = document.getElementById('memn-list');
    if (!box) return;
    api('/api/dash/namespaces').then(function (r) {
      var b = (r.ok && r.body) ? r.body : {};
      var rows = b.namespaces || [];
      var system = b.system || [];
      CONSOLE.nsList = rows;
      CONSOLE.nsSystem = system;
      if (!document.getElementById('memn-list')) return;
      if (!r.ok) {
        box.innerHTML = '<div class="kempty">' + esc(apiErr(r, lang === 'zh' ? '无法读取记忆库列表。' : 'Could not load stores.')) + '</div>';
        return;
      }
      if (!rows.length && !system.length) { box.innerHTML = '<div class="kempty">还没有任何记忆库。</div>'; return; }
      box.innerHTML = mnemListHTML(rows, system);
      /* 自动展开第一个有私有库的用户（default 已不在用户行里） */
      var first = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].namespace) { first = rows[i]; break; }
      }
      if (first && !CONSOLE.nsCur) loadNsMemories(first.namespace);
    })['catch'](function (e) {
      var b2 = document.getElementById('memn-list');
      if (b2) b2.innerHTML = '<div class="kempty">加载失败：' + esc(String(e && e.message || e)) + '</div>';
    });
  }

  function nmemBytes(n) {
    try { return fmtBytes(n || 0); } catch (e) { return String(n || 0) + ' B'; }
  }

  function loadNsMemories(ns) {
    var box0 = document.getElementById('memn-detail');
    var listBox0 = document.getElementById('memn-list');
    if (ns === '' || ns === null || ns === undefined) {
      /* 未领取密钥的成员：还没有私有库。给出明确说明，别让管理员以为坏了。 */
      CONSOLE.nsCur = '';
      if (listBox0) mnemPaintList(listBox0);
      if (box0) box0.innerHTML = '<div class="kempty">' +
        (lang === 'zh' ? '该成员尚未在 /auth/keys 领取密钥，因此还没有私有记忆库。'
                       : 'This member has not claimed a key yet, so no private store exists.') +
        '</div>';
      return;
    }
    if (!ns) return;
    CONSOLE.nsCur = ns;
    var box = box0;
    var listBox = listBox0;
    if (!box) return;
    box.innerHTML = '<div class="kempty">正在读取 ' + esc(ns) + ' …</div>';
    if (listBox) mnemPaintList(listBox);
    api('/api/dash/memories?ns=' + encodeURIComponent(ns) + '&size=300').then(function (r) {
      if (String(CONSOLE.nsCur) !== String(ns)) return;   /* 已切换到别的库 */
      var b = (r.ok && r.body) ? r.body : {};
      var items = b.items || [];
      if (!r.ok) {
        box.innerHTML = '<div class="kempty">' + esc(apiErr(r, lang === 'zh' ? '无法读取该库。' : 'Could not load this store.')) + '</div>';
        return;
      }
      if (!items.length) {
        box.innerHTML = '<div class="kempty">' + esc(ns) + (lang === 'zh' ? '：这个库是空的。' : ' is empty.') + '</div>';
        return;
      }
      CONSOLE.nsItems = items;
      box.innerHTML = mnemDetailHTML(ns, b, items);
    })['catch'](function (e) {
      box.innerHTML = '<div class="kempty">加载失败：' + esc(String(e && e.message || e)) + '</div>';
    });
  }

  /* 记忆类型中英对照 —— 与服务端 console_ext.KIND_ZH 同一份枚举。
     服务端已经下发 kind_zh，这里保留本地表是为了「切语言不用重新请求」：
     用户点中文/英文切换时，表格要立刻跟着变。 */
  var KIND_NAMES = {
    semantic: ['语义', 'Semantic'], episodic: ['情景', 'Episodic'],
    procedural: ['程序', 'Procedural'], preference: ['偏好', 'Preference'],
    identity: ['身份', 'Identity'], lesson: ['教训', 'Lesson'],
    strategy: ['策略', 'Strategy'], reflective: ['反思', 'Reflective'],
    fact: ['事实', 'Fact'], rule: ['规则', 'Rule'], todo: ['待办', 'To-do'],
    working: ['工作', 'Working'], resource: ['资源', 'Resource'],
    anti_pattern: ['反模式', 'Anti-pattern'], meta: ['元信息', 'Meta'],
    relational: ['关系', 'Relational'], session: ['会话', 'Session'],
    task: ['任务', 'Task'], playbook: ['经验', 'Playbook'], code: ['代码', 'Code'],
    chat: ['对话', 'Chat']
  };

  /* 类型名：中文界面优先翻成中文，词典里没有的原样显示（不吞掉未知类型，
     否则新类型上线时这里会变成空白，反而更难排查）。 */
  function kindName(k) {
    var e = KIND_NAMES[String(k || '').toLowerCase()];
    if (!e) return String(k || '—');
    return lang === 'zh' ? e[0] : e[1];
  }

  /* 单条记忆的完整内容单元格。
     视觉上仍默认折叠到约 4 行（max-height 裁切），但**整段全文挂到 data-tip**，
     鼠标悬停即弹出完整内容 —— 不再提供「展开全文」按钮（2026-10-24 用户要求：
     取消所有展开全文，改为悬停显示全文）。全文数据本来就是全量下发的，这里只是
     换了呈现方式：折叠看个大概，悬停看全部，互不冲突。 */
  function memContentCell(m) {
    var full = String(m.content != null ? m.content : (m.excerpt || ''));
    var chars = m.chars || full.length;
    var id = String(m.id || '');
    /* 空内容不能渲染成空白格 —— 那看起来像"页面坏了"。现网确实存在这类
       记录（u_df… 库里就有 1 条 content 为空的 episodic，多半是写入时
       只带了元数据）。如实标出来，管理员才知道该不该清掉它。 */
    if (!full.trim()) {
      return '<span style="color:var(--fg3);font-style:italic">' +
        esc(lang === 'zh' ? '（这条记忆没有正文，只有元数据）' : '(no body — metadata only)') +
        '</span>';
    }
    /* 折叠只做视觉收口；data-tip 始终带全文，悬停即可看全。 */
    var collapsed = chars > 260;
    var html =
      '<div class="memtxt" id="memtxt-' + esc(id) + '"' +
        ' data-tip="' + esc(full) + '"' +
        (collapsed ? ' style="max-height:5.6em;overflow:hidden"' : '') + '>' +
        esc(full) +
      '</div>';
    return html;
  }

  /* 悬停提示：读 [data-tip] 属性，鼠标移上去弹一个浮层显示全文。
     2026-10-24 用户要求：取消所有「展开全文」按钮，改为悬停即看全。
     浮层 pointer-events:none，否则鼠标碰到浮层会触发 mouseout 抖动；
     长文浮层限高 + 内部滚动，避免 6000 字把整屏糊住。 */
  (function memHoverTip() {
    /* 全局单例：console.js 的 hoverTip 通常先注册（script 在 head 前部），
       它已经接管了所有 [data-tip] / [title]。这里再挂一套会**同时弹出两个浮层**
       —— 用户 2026-10-24 反馈的"悬停窗口貌似有二层"就是这个。
       只有 console.js 没加载（站点静态页兜底）时才由这里接管。 */
    if (window.__mnTipOwner) return;
    window.__mnTipOwner = 'site';
    var tip = null, cur = null;
    function ensure() {
      if (tip) return tip;
      tip = document.createElement('div');
      tip.className = 'mem-tip';
      tip.style.cssText = 'position:fixed;z-index:99999;display:none;max-width:540px;' +
        'max-height:62vh;overflow:auto;background:#1f2430;color:#e8edf5;' +
        'padding:10px 12px;border-radius:8px;font-size:12.5px;line-height:1.6;' +
        'white-space:pre-wrap;word-break:break-word;box-shadow:0 10px 30px rgba(0,0,0,.35);' +
        'border:1px solid rgba(255,255,255,.14);pointer-events:none';
      document.body.appendChild(tip);
      return tip;
    }
    function hide() { if (tip) tip.style.display = 'none'; cur = null; }
    function show(el, text, x, y) {
      if (!String(text || '').trim()) return hide();
      var t = ensure();
      t.textContent = text;
      t.style.display = 'block';
      var w = t.offsetWidth, h = t.offsetHeight;
      var left = Math.min(x + 14, window.innerWidth - w - 12);
      var top = y + 18;
      if (top + h > window.innerHeight - 12) top = Math.max(12, y - h - 14);
      t.style.left = Math.max(12, left) + 'px';
      t.style.top = Math.max(12, top) + 'px';
      cur = el;
    }
    document.addEventListener('mouseover', function (e) {
      var el = e.target;
      if (!el || el.nodeType !== 1) return;
      var cand = el.closest('[data-tip]');
      if (!cand) { if (cur) hide(); return; }
      var txt = cand.getAttribute('data-tip');
      if (txt) show(cand, txt, e.clientX, e.clientY);
    });
    document.addEventListener('mouseout', function (e) {
      if (!cur) return;
      if (!e.relatedTarget || !cur.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
  })();

  function mnemDetailHTML(ns, b, items) {
    var zh = lang === 'zh';
    var totalBytes = 0;
    var body = items.map(function (m) {
      totalBytes += Number(m.size || 0);
      var tags = (m.tags || []).slice(0, 4).map(function (t) {
        return '<span class="chipnote">' + esc(t) + '</span>';
      }).join(' ');
      return '<tr>' +
        '<td class="mono" style="font-size:11px;white-space:nowrap;color:var(--fg3)">' +
          esc(String(m.id || '').slice(0, 10)) + '</td>' +
        '<td style="white-space:nowrap"><span class="chipnote">' + esc(kindName(m.kind)) + '</span></td>' +
        '<td class="mono" style="white-space:nowrap;font-size:11.5px">' +
          esc(when(m.created || m.createdAt)) + '</td>' +
        '<td style="max-width:560px;word-break:break-word;white-space:pre-wrap;line-height:1.6;font-size:12.5px">' +
          memContentCell(m) + '</td>' +
        '<td style="max-width:150px;word-break:break-all">' + (tags || '—') + '</td>' +
        '<td class="mu" style="white-space:nowrap">' + esc(nmemBytes(m.size)) + '</td>' +
        '<td style="white-space:nowrap"><button type="button" class="btn btn-ghost btn-sm" ' +
          'data-act="mem-del" data-v="' + esc(m.id || '') + '" data-ns="' + esc(ns) + '">' +
          esc(zh ? '删除' : 'Delete') + '</button></td>' +
        '</tr>';
    }).join('');
    return '<div class="sub" style="font-size:12.5px;margin-bottom:8px">' +
        '<span class="mono">' + esc(ns) + '</span> · ' +
        '<span class="mono">' + (b.total || items.length) + (zh ? ' 条' : ' items') + '</span> · ' +
        '<span class="mono">' + esc(nmemBytes(totalBytes)) + '</span>' +
        (items.length < (b.total || 0)
          ? ' <span style="color:var(--fg3)">' + esc(zh ? '（显示前 ' + items.length + ' 条）' : '(first ' + items.length + ' shown)') + '</span>'
          : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="mem-clear" data-ns="' + esc(ns) + '">' +
          esc(zh ? '清空此库（管理员）' : 'Clear this store (admin)') + '</button>' +
      '</div>' +
      '<div class="card" style="overflow:hidden"><div style="overflow-x:auto">' +
        '<table class="ltable"><thead><tr>' +
          '<th>id</th><th>' + (zh ? '类型' : 'Kind') + '</th>' +
          '<th>' + (zh ? '生成时间' : 'Created') + '</th>' +
          '<th>' + (zh ? '内容' : 'Content') + '</th>' +
          '<th>' + (zh ? '标签' : 'Tags') + '</th>' +
          '<th>' + (zh ? '大小' : 'Size') + '</th>' +
          '<th></th>' +
        '</tr></thead><tbody>' + body + '</tbody></table>' +
      '</div></div>';
  }

  function mnemPaintList(box) {
    if (!box) return;
    box.innerHTML = mnemListHTML(CONSOLE.nsList || [], CONSOLE.nsSystem || []);
  }

  /* 用户记忆左列：先列全部用户（含零记忆 / 未领密钥），再把站点自己的库与
     孤立库单独归到「其他库」分组，不计入用户人数。 */
  function mnemListHTML(rows, system) {
    var h = (rows || []).map(function (r2) {
      return mnemRowHTML(r2, String(r2.namespace) === String(CONSOLE.nsCur));
    }).join('');
    if (system && system.length) {
      h += '<div style="font-size:10.5px;color:var(--fg3);margin:10px 2px 4px;letter-spacing:.04em">' +
        esc(lang === 'zh' ? '其他库（站点 / 孤立）' : 'Other stores (site / orphan)') + '</div>' +
        system.map(function (r2) {
          return mnemRowHTML(r2, String(r2.namespace) === String(CONSOLE.nsCur));
        }).join('');
    }
    return h;
  }

  /* 用户记忆左列的一行：除库名 / 条数 / 体积外，把账号来源、注册时间、
     角色 / 套餐 / 提供商一并标出来 —— 管理员要的是「同一批人、信息全」，
     而不是只看到几条有记忆的库。display_name 优先于 email 显示。 */
  function mnemRowHTML(r2, cur) {
    var label = r2.namespace === 'default'
      ? (lang === 'zh' ? 'default（站点自己的库）' : 'default (site own)')
      : (r2.display_name ? String(r2.display_name)
                         : (r2.owner ? String(r2.owner) : r2.namespace));
    var acctSrc = (r2.account_source === 'registered')
      ? (lang === 'zh' ? '注册账号' : 'account')
      : (r2.account_source === 'profile_only'
          ? (lang === 'zh' ? '仅资料' : 'profile only') : '');
    var meta = [];
    if (r2.role && r2.role !== 'member') meta.push(esc(r2.role));
    if (r2.plan) meta.push(esc(r2.plan));
    if (r2.provider) meta.push(esc(r2.provider));
    if (r2.created) meta.push(esc(when(r2.created)));
    var parts = [];
    if (r2.source) parts.push(esc(r2.source));
    parts = parts.concat(meta);
    var third = parts.join(' · ');
    return '<button type="button" data-act="ns-open" data-v="' + esc(r2.namespace) + '"' +
      ' style="display:block;width:100%;text-align:left;padding:9px 11px;border-radius:8px;margin-bottom:4px;' +
      'border:1px solid ' + (cur ? 'var(--accent)' : 'transparent') + ';' +
      'background:' + (cur ? 'var(--bg2,rgba(127,127,127,.08))' : 'transparent') + ';cursor:pointer">' +
      '<div style="font-size:12.5px;word-break:break-all">' + esc(label) +
        (acctSrc ? ' <span style="font-size:10.5px;color:var(--fg3)">[' + esc(acctSrc) + ']</span>' : '') + '</div>' +
      '<div class="mono" style="font-size:11px;color:var(--fg3);margin-top:2px">' +
        esc(r2.namespace || (lang === 'zh' ? '（无私有库）' : '(no store)')) + ' · ' +
        (r2.count || 0) + (lang === 'zh' ? ' 条 · ' : ' items · ') + esc(nmemBytes(r2.bytes)) + '</div>' +
      (third ? '<div style="font-size:10.5px;color:var(--fg3);margin-top:2px;line-height:1.5">' + third + '</div>' : '') +
      '</button>';
  }

  function consoleHTML() {
    return '<div class="console"><div class="max-w-shell mx-auto px-5 sm:px-8">' +
      '<a class="back" href="#top" style="margin-bottom:22px;display:inline-flex">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>' +
        (lang === 'zh' ? '返回首页' : 'Back to the site') +
      '</a>' +
      '<div id="console-root">' +
        '<p class="sub">' + (lang === 'zh' ? '正在读取账号信息…' : 'Loading your account…') + '</p>' +
      '</div>' +
    '</div></div>';
  }

  function paintConsole() {
    var root = document.getElementById('console-root');
    if (!root) return;
    root.innerHTML = consoleBodyHTML();
    icons();
    if (CONSOLE.loaded) fillProfileForm();
  }

  function fillProfileForm() {
    var u = uidOf(SESSION);
    var mine = CONSOLE.profiles.filter(function (r) { return r.owner_id === u; })[0];
    var f = document.getElementById('prof-form'); if (!f) return;
    if (mine) {
      ['display_name', 'company', 'note'].forEach(function (k) {
        var el = f.querySelector('[name="' + k + '"]');
        /* Always assign — assigning only when truthy would leave a stale value
           behind after somebody cleared a field. */
        if (el) el.value = mine[k] == null ? '' : String(mine[k]);
      });
      if (mine.avatar && !SESSION.avatar) SESSION.avatar = mine.avatar;
    }
    repaintAvatarBox();
  }

  /* One request feeds the whole console. The server decides what this account
     may see — a member gets their own rows, an administrator gets every row —
     so the browser never rules on access. */
  function consoleRefresh() {
    if (!document.getElementById('console-root')) return;
    CONSOLE.loading = true;
    api('/api/console').then(function (r) {
      CONSOLE.loading = false;
      var b = (r.ok && r.body) ? r.body : {};
      if (!b.me) {
        /* signed out, or the call itself failed — either way there is nothing
           to show, and the console view says so on its own */
        CONSOLE.loaded = false;
        CONSOLE.leads = []; CONSOLE.profiles = []; CONSOLE.admins = [];
        CONSOLE.isAdmin = false;
        if (!r.ok) {
          CONSOLE.err = apiErr(r, lang === 'zh' ? '无法加载 Mnemosyne OS SaaS 数据。' : 'Could not load Mnemosyne OS SaaS.');
          consoleSay('err', CONSOLE.err);
        }
        paintConsole();
        return;
      }
      SESSION = b.me;
      CONSOLE.leads = b.leads || [];
      CONSOLE.profiles = b.profiles || [];
      CONSOLE.admins = b.admins || [];
      CONSOLE.isAdmin = !!b.isAdmin;
      CONSOLE.users = b.users || 0;
      CONSOLE.pending = b.pending || 0;
      CONSOLE.loaded = true;
      renderAccountNav();
      paintConsole();
    });
  }

  function onConsoleClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    /* 用户记忆 tab：点左侧某一库，读该库全量记忆 */
    var nsOpen = t.closest('[data-act="ns-open"]');
    if (nsOpen) {
      var ns = nsOpen.getAttribute('data-v') || '';
      /* 命名空间为空 = 该成员尚未领取密钥、还没有私有库（服务端会把这类成员
         也列进来以对齐「成员」列表）。也要给出明确提示，而不是静默无反应。 */
      if (ns !== CONSOLE.nsCur) loadNsMemories(ns);
      return;
    }

    /* 记忆内容改用「悬停显示全文」（见 memContentCell 的 data-tip + memHoverTip），
       不再需要展开/收起/全部展开按钮，相关点击分支已移除。 */

    /* 删除单条记忆。
       默认**软删除**（引擎 delete_memory：status=deleted、记录与审计链仍在），
       误删可回溯；只有按住 Shift 点才做物理删除 —— 那是不可逆的，所以要求
       二次确认。这条链路上最不能接受的是"点了没反应"或"删了没说清删了什么"，
       所以成功/失败都明确告知。 */
    var memDel = t.closest('[data-act="mem-del"]');
    if (memDel) {
      var mid = memDel.getAttribute('data-v') || '';
      var mns = memDel.getAttribute('data-ns') || '';
      if (!mid) return;
      var hard = !!e.shiftKey;
      var ask = hard
        ? dz('【彻底删除】记忆 ' + mid.slice(0, 10) + '… 将无法恢复，确定？',
             'Permanently delete ' + mid.slice(0, 10) + '…? This cannot be undone.')
        : dz('删除这条记忆？可在引擎侧通过审计记录回溯。',
             'Delete this memory? The audit trail keeps it recoverable.');
      if (!window.confirm(ask)) return;
      api('/api/dash/memory/delete?ns=' + encodeURIComponent(mns) +
          '&id=' + encodeURIComponent(mid), {
        method: 'POST',
        body: JSON.stringify(hard ? { hard: true, confirm: 'yes' } : {})
      }).then(function (r) {
        if (r.ok) {
          toast(dz('已删除。', 'Deleted.'));
          loadNsMemories(mns);           /* 立刻刷新，别让用户对着旧行发呆 */
        } else {
          toast(apiErr(r, dz('删除失败。', 'Delete failed.')));
        }
      });
      return;
    }

    /* 清空整个库（管理员）。默认软删，Shift 点为物理清空。 */
    var memClear = t.closest('[data-act="mem-clear"]');
    if (memClear) {
      var cns = memClear.getAttribute('data-ns') || '';
      var chard = !!e.shiftKey;
      var cask = chard
        ? dz('【彻底清空】' + cns + ' 里的全部记忆将被物理删除，无法恢复，确定？',
             'Permanently clear every memory in ' + cns + '? Cannot be undone.')
        : dz('把 ' + cns + ' 里的全部记忆标记为已删除？',
             'Mark every memory in ' + cns + ' as deleted?');
      if (!window.confirm(cask)) return;
      api('/api/dash/memories/clear?ns=' + encodeURIComponent(cns), {
        method: 'POST',
        body: JSON.stringify({ confirm: 'yes', hard: chard })
      }).then(function (r) {
        if (r.ok) {
          var d = (r.body || {});
          toast(dz('已处理 ' + (d.deleted || 0) + ' 条，失败 ' + (d.failed || 0) + ' 条。',
                   'Cleared ' + (d.deleted || 0) + ', failed ' + (d.failed || 0) + '.'));
          loadNsMemories(cns);
        } else {
          toast(apiErr(r, dz('清空失败。', 'Clear failed.')));
        }
      });
      return;
    }

    /* 管理员名册的增删。两条硬规则（不能自删、最后一名不能删）由服务端
       强制，这里只把服务端的话原样告诉用户。 */
    var rm = t.closest('[data-act="adm-remove"]');
    if (rm) {
      var rid = rm.getAttribute('data-v') || '';
      if (!window.confirm(dz('移除管理员 ' + rid + '？', 'Remove administrator ' + rid + '?'))) return;
      api('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove', id: rid })
      }).then(function (r) {
        if (r.ok) { toast(dz('已移除。', 'Removed.')); loadAdminRoster(); }
        else toast(apiErr(r, dz('移除失败。', 'Could not remove.')));
      });
      return;
    }
    var add = t.closest('[data-act="adm-add"]');
    if (add) {
      var pick = document.getElementById('adm-pick');
      var note = document.getElementById('adm-note');
      var cid = pick ? String(pick.value || '') : '';
      if (!cid) return;
      api('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', id: cid, note: note ? String(note.value || '') : '' })
      }).then(function (r) {
        if (r.ok) { toast(dz('已添加。', 'Added.')); loadAdminRoster(); }
        else toast(apiErr(r, dz('添加失败。', 'Could not add.')));
      });
      return;
    }

    var b = t.closest('[data-ctab]');
    if (!b) return;
    CONSOLE.tab = b.getAttribute('data-ctab') || 'overview';
    paintConsole();
    /* 用户记忆 tab 的数据加载在 mnemPanel → mnemBoot 里自行发起 */
  }

  function onConsoleSubmit(e) {
    var form = e.target;
    if (!form) return;

    if (form.id === 'pw-form') {
      e.preventDefault();
      var oldPw = String((form.querySelector('[name="old"]') || {}).value || '');
      var newPw = String((form.querySelector('[name="next"]') || {}).value || '');
      if (!oldPw) { consoleSay('err', (lang === 'zh' ? '请输入当前密码。' : 'Enter your current password.')); return; }
      if (!passOk(newPw)) { consoleSay('err', A('weak')); return; }
      consoleSay('', '');
      api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
      }).then(function (r) {
        if (!r.ok) {
          consoleSay('err', apiErr(r, lang === 'zh' ? '密码更新失败。' : 'Could not update the password.'));
          return;
        }
        form.reset();
        /* The inline message sits at the top of the console, while these forms
           sit far below it — so a toast is what the visitor actually sees. */
        toast(lang === 'zh' ? '密码已更新。' : 'Your password has been updated.');
        consoleSay('ok', lang === 'zh' ? '密码已更新。' : 'Your password has been updated.');
      });
      return;
    }

    if (form.id === 'prof-form') {
      e.preventDefault();
      var payload = {
        display_name: String((form.querySelector('[name="display_name"]') || {}).value || '').trim(),
        company: String((form.querySelector('[name="company"]') || {}).value || '').trim(),
        note: String((form.querySelector('[name="note"]') || {}).value || '').trim(),
        locale: lang
      };
      consoleSay('', '');
      api('/api/profile', { method: 'POST', body: JSON.stringify(payload) }).then(function (r) {
        if (!r.ok) {
          consoleSay('err', apiErr(r, lang === 'zh' ? '资料保存失败。' : 'Could not save the profile.'));
          return;
        }
        /* Same reasoning as the password form: confirm where the person is
           looking, and bring the header chip up to date with the new name so
           the rename is visible immediately, not only inside this card. */
        toast(lang === 'zh' ? '资料已保存。' : 'Profile saved.');
        consoleSay('ok', lang === 'zh' ? '资料已保存。' : 'Profile saved.');
        if (SESSION) SESSION.display_name = payload.display_name || '';
        renderAccountNav();
        consoleRefresh();
      });
    }
  }

  function renderAccount() {
    var view = document.getElementById('view');
    var home = document.getElementById('home');
    if (!view || !home) return;
    var path = currentPath();

    home.classList.add('off');
    view.hidden = false;

    if (path === 'login') {
      view.innerHTML = loginHTML();
      document.title = A('h') + ' — Mnemosyne OS';
      icons();
      ghNotice();
      return;
    }

    /* 后台管理只对管理员开放。
       2026-10-21 审计：成员直接敲 #/admin 会看到一个"我的账号"精简版
       （总览 / 留言 / 账号安全），虽然拿不到任何管理数据，但那是**后台的壳**，
       客户/成员看到会以为自己进了管理端。成员的账号设置已经搬进
       Mnemosyne OS SaaS「设置」，这里直接送回 Mnemosyne OS SaaS。 */
    /* 同样先判会话：DX_ROLE.loaded 可能是上一次会话留下的，
       未登录时 `loaded && isAdmin()` 会直接放行后台壳。 */
    if (path === 'admin' && !(uidOf(SESSION) && DX_ROLE.loaded && isAdmin())) {
      if (!DX_ROLE.loaded) { dxEnsureRole().then(function () { route(); }); return; }
      view.innerHTML = '<div class="shell"><div style="max-width:520px;margin:12vh auto;text-align:center">' +
        '<h1 style="font-size:20px;font-weight:600;margin:0 0 8px">' +
        esc(lang === 'zh' ? '后台管理仅限管理员' : 'Admin only') + '</h1>' +
        '<p style="font-size:13px;color:var(--fg2);line-height:1.8">' +
        esc(lang === 'zh'
            ? '你的账号设置与套餐都在「Mnemosyne OS SaaS」里。'
            : 'Your account settings live in the console.') + '</p>' +
        '<p style="margin-top:16px"><a class="btn btn-primary btn-sm" href="#/dashboard/overview">' +
        esc(lang === 'zh' ? '进入 Mnemosyne OS SaaS' : 'Open Mnemosyne OS SaaS') + '</a></p></div></div>';
      document.title = (lang === 'zh' ? '无权访问' : 'Not allowed') + ' — Mnemosyne OS';
      icons();
      return;
    }

    view.innerHTML = consoleHTML();
    document.title = (lang === 'zh' ? 'Mnemosyne OS SaaS' : 'Mnemosyne OS SaaS') + ' — Mnemosyne OS';
    icons();
    consoleRefresh();
  }

  function goTop() { try { window.scrollTo(0, 0); } catch (e) {} }
  function goAnchor(id) {
    var el = document.getElementById(id);
    if (!el || typeof el.scrollIntoView !== 'function') return;
    try { el.scrollIntoView(); } catch (e) {}
  }

  function route() {
    var path = currentPath();
    closeMenus();        /* a navigation must never leave a dropdown hanging on screen */
    renderPage();
    if (typeof setSheet === 'function') setSheet(false);
    if (path) { goTop(); return; }
    var h = location.hash || '';
    if (h.indexOf('#/') !== 0 && h.length > 1) goAnchor(h.slice(1));
    else goTop();
  }

  function renderAll() {
    renderStatic();
    renderNav();
    renderCode();
    renderStats();
    renderProof();
    renderHow();
    renderArch();
    renderUseCases();
    renderIntegrations();
    renderBench();
    renderEnterprise();
    renderTiers();
    renderResources();
    renderFooter();
    renderMiniSegs();
    renderPage();
    paintTheme();
    icons();
    bindReveal();
    renderBenchBars();
    paintCommunity(window.__starCount || 38);
    /* 站点级内容（公告栏、品牌、页脚）由服务端下发，渲染完成后再覆盖一次。
       放在最后是有意的：先让静态默认值把版面撑起来（首屏不空），再就地替换文本，
       所以即使 /api/site 慢半拍或失败，页面也是完整可读的。 */
    if (window.MN && MN.apply) applySiteToPage();
  }

  /* 位于闭包内，所以用 window.MN 这一条通道访问外部模块。 */
  function applySiteToPage() {
    try { MN.apply(); } catch (e) {}
  }

  /* ======================================================================= *
   *  6 · LANGUAGE                                                            *
   * ======================================================================= */

  /* -------------------------------------------- 后台改过的页面文案覆盖层 */
  /* 服务端 site.json 的 content 段形如 { 'zh.hero.l1': '…', 'en.hero.l2': '…' }。
     下面的 MN 站点模块把它拆成 zh / en 两份写到 window.__SITE_CONTENT，这里再压到
     i18n 表上。压的方式是「先复制一份默认表，再往上合并」，不去改 DICT 本身：
     改了 DICT，撤销一条覆盖之后内置默认值就永久丢了，之后切语言会越切越空。 */
  window.__SITE_CONTENT = window.__SITE_CONTENT || { zh: {}, en: {} };
  window.__SITE_CONTENT_HAD = false;
  window.__onSiteContent = function () {
    applySiteContent();
    /* 覆盖可能影响页面上任何一处 [data-i18n]，所以整页重画一次。
       这条路径只有「后台改完文案 → 刷新」会走到，代价可以接受；
       且 MN.apply() 在 CFG 已就绪时直接返回，不会和 fetchCfg 形成循环。 */
    try { renderAll(); } catch (e) {}
  };
  /* 后台把覆盖全部清空时也要让页面回到内置默认，但只在"原来确实有覆盖"时重画：
     从没配过覆盖的普通访客首屏加载走的就是这条，没必要为它再画一次。 */
  window.__onSiteContentEmpty = function () {
    applySiteContent();
    if (window.__SITE_CONTENT_HAD) { try { renderAll(); } catch (e) {} }
  };

  function applySiteContent() {
    var base = DICT[lang] || {};
    var merged = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) merged[k] = base[k];
    }
    var oc = (window.__SITE_CONTENT || {})[lang];
    if (oc) {
      for (k in oc) {
        if (!Object.prototype.hasOwnProperty.call(oc, k)) continue;
        var v = oc[k];
        /* 空串 = 撤销这条覆盖，回到内置默认。服务端也是这个语义：
           整体替换而不是逐键深合并，所以"清空"才能真的清掉。 */
        if (v === '' || v === null || v === undefined) { delete merged[k]; continue; }
        merged[k] = String(v);
      }
    }
    T = merged;
  }

  function setLang(next) {
    lang = (next === 'zh') ? 'zh' : 'en';
    T = DICT[lang];
    /* 后台改过的文案要压在内置 i18n 表之上。放在这里而不是只在初始化时做
       一次：否则切换语言会把后台的改动"切回"默认值，看起来像设置丢了。 */
    applySiteContent();
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    try { localStorage.setItem('mn-lang', lang); } catch (e) {}
    $$('[data-lang-set]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-lang-set') === lang ? 'true' : 'false');
    });
    renderAll();
    closePops();
  }

  /* ======================================================================= *
   *  7 · CODE TABS + COPY                                                    *
   * ======================================================================= */

  function activeCode() {
    var pane = $('.pane.on');
    var code = pane ? $('code', pane) : null;
    return code ? code.innerText : '';
  }

  function flashCopy(ok) {
    var l = $('#copy-label');
    if (!l) return;
    l.textContent = ok ? tx('code.copied', 'Copied') : 'Ctrl+C';
    setTimeout(function () { l.textContent = tx('code.copy', 'Copy'); }, 1600);
  }

  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      flashCopy(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flashCopy(true); }).catch(fallback);
    } else { fallback(); }
  }

  /* ======================================================================= *
   *  8 · BACKGROUND DUST                                                     *
   * ======================================================================= */

  var dust = { cv: null, ctx: null, W: 0, H: 0, DPR: 1, motes: [], rgb: '255,255,255', alpha: 0.11 };

  function dustBuild() {
    var n = Math.max(16, Math.min(52, Math.round((dust.W * dust.H) / 46000)));
    dust.motes = [];
    for (var i = 0; i < n; i++) {
      dust.motes.push({
        x: Math.random() * dust.W, y: Math.random() * dust.H,
        vx: (Math.random() - 0.5) * 0.10, vy: (Math.random() - 0.5) * 0.10,
        r: Math.random() * 1.05 + 0.5,
        a: 0.45 + Math.random() * 0.55
      });
    }
  }

  function dustPaint(withLinks) {
    var c = dust.ctx;
    if (!c) return;
    c.clearRect(0, 0, dust.W, dust.H);
    var i, j, p;
    if (withLinks) {
      c.lineWidth = 1;
      for (i = 0; i < dust.motes.length; i++) {
        for (j = i + 1; j < dust.motes.length; j++) {
          var dx = dust.motes[i].x - dust.motes[j].x;
          var dy = dust.motes[i].y - dust.motes[j].y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 26000) {
            var a = (1 - Math.sqrt(d2) / 161) * dust.alpha * 0.4;
            c.strokeStyle = 'rgba(' + dust.rgb + ',' + a.toFixed(4) + ')';
            c.beginPath();
            c.moveTo(dust.motes[i].x, dust.motes[i].y);
            c.lineTo(dust.motes[j].x, dust.motes[j].y);
            c.stroke();
          }
        }
      }
    }
    for (i = 0; i < dust.motes.length; i++) {
      p = dust.motes[i];
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fillStyle = 'rgba(' + dust.rgb + ',' + (dust.alpha * p.a).toFixed(4) + ')';
      c.fill();
    }
  }

  function dustFrame() {
    for (var i = 0; i < dust.motes.length; i++) {
      var p = dust.motes[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = dust.W + 20; else if (p.x > dust.W + 20) p.x = -20;
      if (p.y < -20) p.y = dust.H + 20; else if (p.y > dust.H + 20) p.y = -20;
    }
    dustPaint(true);
    requestAnimationFrame(dustFrame);
  }

  function rebuildDust() {
    var cs = window.getComputedStyle(root);
    dust.rgb = (cs.getPropertyValue('--mote') || '255,255,255').trim() || '255,255,255';
    var a = parseFloat(cs.getPropertyValue('--mote-a'));
    dust.alpha = isNaN(a) ? 0.11 : a;
    if (dust.ctx) dustPaint(false);
  }

  function initDust() {
    var cv = $('#dust');
    if (!cv || !cv.getContext) return;
    var ctx = cv.getContext('2d');
    if (!ctx || !ctx.createLinearGradient) return;
    dust.cv = cv; dust.ctx = ctx;

    function resize() {
      dust.DPR = Math.min(window.devicePixelRatio || 1, 2);
      dust.W = window.innerWidth; dust.H = window.innerHeight;
      cv.width = Math.round(dust.W * dust.DPR);
      cv.height = Math.round(dust.H * dust.DPR);
      cv.style.width = dust.W + 'px'; cv.style.height = dust.H + 'px';
      ctx.setTransform(dust.DPR, 0, 0, dust.DPR, 0, 0);
      dustBuild();
    }
    window.addEventListener('resize', function () {
      resize();
      if (REDUCED || !HAS_RAF) dustPaint(false);
    });
    resize();
    rebuildDust();
    if (REDUCED || !HAS_RAF) dustPaint(false);
    else requestAnimationFrame(dustFrame);
  }

    /* ======================================================================= *
   *  9 · BENCHMARK BARS                                                      *
   *     mem0 draws this panel with plain CSS bars rather than a chart        *
   *     library: a solid violet fill on a pale track, the value printed      *
   *     inside the fill. Matching it keeps the two pages visually alike and  *
   *     drops a canvas dependency the page no longer needs.                  *
   * ======================================================================= */

  function renderBenchBars() {
    var host = $('#bench-rows');
    if (!host) return;
    var m = T.benchMetrics || {};
    var rows = m.rows || [];
    if (!rows.length) return;

    host.innerHTML = rows.map(function (r) {
      var ours = Math.max(0, Math.min(100, r.ours));
      var theirs = Math.max(0, Math.min(100, r.theirs));
      return '<div class="brow-group">' +
               '<div class="brow-group-label">' + esc(r.name) + '</div>' +
               '<div class="brow"><div class="brow-fill" style="width:' + ours + '%">' +
                 '<span class="brow-val">' + r.ours.toFixed(1) + '</span></div></div>' +
               '<div class="brow brow-them"><div class="brow-fill" style="width:' + theirs + '%">' +
                 '<span class="brow-val">' + r.theirs.toFixed(1) + '</span></div></div>' +
             '</div>';
    }).join('');

    var note = $('#metric-note');
    if (note) note.textContent = m.note || '';
  }

/* ======================================================================= *
   * 10 · REVEAL                                                              *
   * ======================================================================= */

  var io = null;
  function bindReveal() {
    var els = $$('.reveal');
    if (!HAS_IO) { els.forEach(function (el) { el.classList.add('in'); }); return; }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });
    }
    els.forEach(function (el, i) {
      if (REDUCED) { el.classList.add('in'); return; }
      if (el.classList.contains('in')) return;
      el.style.transitionDelay = (Math.min(i % 3, 2) * 60) + 'ms';
      io.observe(el);
    });
  }

  /* ======================================================================= *
   * 11 · GITHUB STAR (live, with a static fallback)                          *
   * ======================================================================= */

  function paintStar(n) {
    var s = Number(n).toLocaleString('en-US');
    ['#gh-count', '#gh-count-2'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.textContent = s;
    });
    var live = $('#stat-live');
    if (live) live.textContent = s;
    /* keep both dictionaries in step so a language switch never reverts the number */
    if (EN.stats && EN.stats[0]) EN.stats[0].value = s;
    if (ZH.stats && ZH.stats[0]) ZH.stats[0].value = s;
    /* P3 · feed the community milestone bar from the same live count */
    window.__starCount = Number(n) || 0;
    if (typeof paintCommunity === 'function') paintCommunity(window.__starCount);
  }

  /* P3 · community milestone — mirrors the live star count into the landing bar.
     Re-run on every language switch (renderAll) so the milestone copy follows T. */
  function paintCommunity(n) {
    var c = T.community;
    if (!c) return;
    var goal = c.goal || 100;
    var cur = Math.max(0, Number(n) || 0);
    var pct = Math.min(100, Math.round(cur * 100 / goal));
    var cnt = $('#comm-count'); if (cnt) cnt.textContent = cur.toLocaleString('en-US');
    var bar = $('#comm-bar');
    if (bar) { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', cur); }
    var ul = $('#comm-ms');
    if (ul) {
      var done = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      var todo = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>';
      ul.innerHTML = (c.ms || []).map(function (m) {
        var ok = cur >= m.at;
        return '<li class="flex items-start gap-2">' +
                 '<span class="mt-0.5 shrink-0" aria-hidden="true">' + (ok ? done : todo) + '</span>' +
                 '<span class="text-[12.5px] leading-[1.6] ' + (ok ? 'text-fg' : 'text-fg2') + '">' +
                   '<b>' + esc(String(m.at)) + '&#9733;</b><br>' + esc(m.t) +
                 '</span>' +
               '</li>';
      }).join('');
    }
    var note = $('#comm-note'); if (note) note.textContent = c.note || '';
  }

  function fetchStar() {
    if (typeof window.fetch !== 'function') return;
    window.fetch('https://api.github.com/repos/MnemosyneOS/mnemosyne', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && typeof j.stargazers_count === 'number') paintStar(j.stargazers_count); })
      .catch(function () { /* offline or rate-limited — the static count stays */ });
  }

  /* ======================================================================= *
   * 12 · EVENTS (delegated, so re-renders never lose a listener)             *
   * ======================================================================= */

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    /* copy */
    var single = t.closest('[data-copy]');
    if (single) { copyText(single.getAttribute('data-copy')); return; }
    if (t.closest('#copy-btn')) { copyText(activeCode()); return; }

    /* nav dropdowns — hover already opens them, and a click opens too so touch
       devices behave identically. Closing is outside-click / Escape / leaving. */
    var navBtn = t.closest('[data-menu]');
    if (navBtn) {
      var mid = navBtn.getAttribute('data-menu');
      var mpanel = $('[data-menu-panel="' + mid + '"]');
      /* 只有"由点击打开的"面板才在再次点击时收起。hover 打开的那次点击
         是把面板接管过来（openedBy 改成 click），并不收起 —— 见 openMenu 里的注释。 */
      if (mpanel && mpanel.classList.contains('on') &&
          mpanel.dataset.openedBy === 'click') { closeMenus(); return; }
      openMenu(mid, 'click');
      return;
    }

    /* a menu entry navigates explicitly, so it still works even if the host
       swallows the default anchor action */
    var mlink = t.closest('.menu a');
    if (mlink) {
      var href = mlink.getAttribute('href') || '';
      var plain = (e.button === 0 || e.button === undefined) &&
                  !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
      if (href.charAt(0) === '#' && plain) {
        e.preventDefault();
        if (location.hash === href) route(); else location.hash = href;
      }
      closeMenus();
      return;
    }

    /* top-right popovers */
    if (t.closest('#theme-btn')) {
      var tp = $('#theme-pop'); var open = tp.classList.contains('on');
      closePops(); closeMenus();
      if (!open) { tp.classList.add('on'); $('#theme-btn').setAttribute('aria-expanded', 'true'); }
      return;
    }
    if (t.closest('#lang-btn')) {
      var lp = $('#lang-pop'); var open2 = lp.classList.contains('on');
      closePops(); closeMenus();
      if (!open2) { lp.classList.add('on'); $('#lang-btn').setAttribute('aria-expanded', 'true'); }
      return;
    }

    /* theme + language choices */
    var th = t.closest('[data-theme-set]');
    if (th) { setTheme(th.getAttribute('data-theme-set')); closePops(); return; }
    var lg = t.closest('[data-lang-set]');
    if (lg) { setLang(lg.getAttribute('data-lang-set')); closePops(); return; }

    /* code tabs */
    var tab = t.closest('.tab[data-tab]');
    if (tab) {
      var key = tab.getAttribute('data-tab');
      $$('.tab[data-tab]').forEach(function (b) {
        var on = (b === tab);
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      $$('.pane').forEach(function (p) {
        p.classList.toggle('on', p.getAttribute('data-pane') === key);
      });
      return;
    }

    /* segmented controls — each renderer rebuilds its own control with the
       correct aria-selected, so no post-hoc stamping is needed here */
    var seg = t.closest('[data-seg]');
    if (seg) {
      var which = seg.getAttribute('data-seg');
      var v = seg.getAttribute('data-idx');
      if (which === 'proof') { proofIdx = parseInt(v, 10) || 0; renderProof(); }
      else if (which === 'uc') { ucIdx = parseInt(v, 10) || 0; renderUseCases(); }
      icons();
      return;
    }
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    /* a click anywhere outside a disclosure closes everything that is open */
    if (!t.closest('.rel')) { closeMenus(); closePops(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeMenus(); closePops(); setSheet(false); }
  });

  /* The contact form writes a real row into site_leads — there is no mock
     acknowledgement any more. The table's INSERT policy accepts both anon and
     authenticated callers; owner_id is filled server-side from auth.uid(), so
     a signed-in submission is attributed and an anonymous one simply has no
     owner. No .select() is chained: an anonymous caller has no SELECT policy,
     and returning the row is not part of this form's contract. */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f || f.id !== 'contact-form') return;
    e.preventDefault();

    var okEl = document.getElementById('contact-ok');
    var btn = f.querySelector('button[type="submit"]');
    function getf(n) { var el = f.querySelector('[name="' + n + '"]'); return el ? String(el.value || '').trim() : ''; }

    function fail(msg) {
      if (!okEl) return;
      okEl.classList.add('on');
      okEl.style.color = '#F87171';
      okEl.textContent = msg;
    }

    var email = getf('f2');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail(lang === 'zh' ? '请填写有效的邮箱地址。' : 'Please enter a valid email address.');
      return;
    }

    if (btn) btn.disabled = true;
    if (okEl) { okEl.classList.remove('on'); okEl.style.color = ''; }

    api('/api/leads', {
      method: 'POST',
      body: JSON.stringify({
        name: getf('f1'),
        email: email,
        company: getf('f3'),
        message: getf('f4'),
        source: 'contact',
        lang: lang
      })
    }).then(function (r) {
      if (btn) btn.disabled = false;
      if (!r.ok) {
        fail((r.body && r.body.message) ||
             (lang === 'zh' ? '提交失败，请稍后重试。' : 'The submission failed. Please try again.'));
        return;
      }
      if (okEl) { okEl.classList.add('on'); okEl.style.color = ''; }
      try { f.reset(); } catch (err) {}
    });
  });

  /* sheet */
  var sheet = $('#sheet');
  function setSheet(open) {
    if (!sheet) return;
    sheet.classList.toggle('on', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  var mo = $('#menu-open'), mc = $('#menu-close');
  if (mo) mo.addEventListener('click', function () { setSheet(true); });
  if (mc) mc.addEventListener('click', function () { setSheet(false); });

  /* header scroll state */
  var hdr = $('#hdr');
  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (hdr) hdr.classList.toggle('solid', y > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ======================================================================= *
   * 13 · BOOT                                                                *
   * ======================================================================= */

  $$('[data-lang-set]').forEach(function (b) {
    b.setAttribute('aria-checked', b.getAttribute('data-lang-set') === lang ? 'true' : 'false');
  });

  /* announcement bar dismiss */
  var annX = $('#ann-x');
  if (annX) annX.addEventListener('click', function () {
    var a = $('#announce');
    if (a) a.classList.add('off');
  });

  /* Account: the delegated handlers sit on the document, so the header chip
     and the routed views share one implementation. */
  document.addEventListener('click', function (e) { onAccountClick(e); onConsoleClick(e); });

  /* ------------------------------------------------- 登录门控（SaaS 入口）
     规则只有一条：**未登录不得进入控制台**。
     顶部菜单照常显示（产品入口要让人看见），点下去时在这里分流：
       已登录 → 正常跳转；未登录 → 弹登录框，路由不动。
     为什么点击层要做，而不是把菜单藏起来：藏起来=访客根本不知道我们有 SaaS；
     直接跳 #/login=把"了解"变成"先注册"。弹窗是这两者之间唯一不伤转化的做法。 */
  function openLoginGate() {
    var g = document.getElementById('mn-login-gate');
    if (!g) { location.hash = '#/login'; return; }
    g.classList.add('on');
    document.body.style.overflow = 'hidden';
    /* 焦点落在「登录」——已有账号是多数情况（新访客多半还在了解阶段），
       把默认动作给主路径，注册按钮仍然并排可见、一键可达。 */
    var b = g.querySelector('[data-gate-login]');
    if (b) { try { b.focus(); } catch (err) {} }
    /* SESSION 是异步恢复的：刚刷新就点菜单时它可能还没到。
       先弹窗（不让用户干等），同时问一次服务端；真已登录就自动进去。 */
    api('/api/auth/me').then(function (r) {
      if (!(r && r.ok && r.body && r.body.signedIn)) return;
      SESSION = r.body;
      GHS = r.body;
      renderAccountNav();
      closeLoginGate();
      location.hash = '#/dashboard/overview';
    })['catch'](function () { /* 探测失败就停在弹窗，用户自己点登录 */ });
  }

  function closeLoginGate() {
    var g = document.getElementById('mn-login-gate');
    if (!g) return;
    g.classList.remove('on');
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    /* 控制台入口（桌面导航 / 移动端抽屉都带这个标记） */
    var need = t.closest('[data-need-login]');
    if (need) {
      if (signedInNav()) return;          /* 已登录：交给浏览器正常跳转 */
      e.preventDefault();
      openLoginGate();
      return;
    }

    /* 登录弹窗的两个出口：
       「注册」→ 进 #/login 并直接停在注册表单（authTab='up'）；
       「登录」→ 进 #/login 停在登录表单（authTab='in'）。
       以前只有一个「登录 / 注册」，点了落在哪一半取决于上一次的 authTab，
       用户想注册却看到登录框，还得自己再找一遍切换链接。 */
    if (t.closest('[data-gate-reg]')) {
      e.preventDefault(); closeLoginGate(); authTab = 'up'; location.hash = '#/login'; return;
    }
    if (t.closest('[data-gate-login]')) {
      e.preventDefault(); closeLoginGate(); authTab = 'in'; location.hash = '#/login'; return;
    }
    /* 兼容旧标记（历史 DOM / 缓存里的老页面） */
    if (t.closest('[data-gate-close]')) { e.preventDefault(); closeLoginGate(); return; }
    if (t.closest('[data-gate-go]')) { closeLoginGate(); return; }

    var gate = document.getElementById('mn-login-gate');
    if (!gate || !gate.classList.contains('on')) return;
    /* 点遮罩空白处 / 打开其它菜单 → 收起，别让它挡着页面 */
    if (t === gate || t.closest('[data-menu]')) closeLoginGate();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) closeLoginGate();
  });
  document.addEventListener('submit', function (e) { onAccountSubmit(e); onConsoleSubmit(e); });

  /* Restore a persisted session if one exists, and keep the header in step
     across sign-in, refresh and sign-out. No local fallback identity. */
  /* The session is the server's HttpOnly cookie; this only reads back what the
     server says about it. No local identity is invented — a reload can never
     produce a session the server does not know about. */
  (function restoreSession() {
    api('/api/auth/me').then(function (r) {
      if (!(r.ok && r.body && r.body.signedIn)) return;
      SESSION = r.body;
      GHS = r.body;
      renderAccountNav();
      var p = currentPath();
      if (p === 'admin' || p === 'account') consoleRefresh();
    });
  })();

  /* when the login view is open, repaint it once the session is known */
  loadGithubSession().then(function () {
    if (currentPath() === 'login') renderAccount();
  });

/* ===================================================================== *
 *  11 · DASHBOARD — the signed-in console (Console v9, delegated)
 *
 *  控制台实体已经整体迁到 assets/console.js（约 1800 行，独立文件、可单测）。
 *  留在页面里的只有两件事：
 *    ① dz()  —— 站点其它地方（博客卡片、后台提示）还在用的双语选择器；
 *    ② renderDash() —— 路由把 #/dashboard/* 交到这里，再由它转交控制台模块。
 *
 *  为什么不在页面里继续写：这个文件已经 800KB / 12000 行，任何一次控制台改动
 *  都会让整页 diff 变得不可读，也无法单独缓存。拆出去之后：
 *    · console.css 跟随站点主题（白天/夜晚/跟随系统），不再写死深色；
 *    · console.js 走 .mc 命名空间，后台管理页的 .dx 体系完全不受影响。
 * ===================================================================== */

function dz(zh, en) { return lang === 'zh' ? zh : en; }

/* 顶栏账号菜单（renderAccountNav）与站点其它地方还在读 DX_ROLE / dxEnsureRole。
   控制台虽然搬走了，但"角色"这件事属于**站点壳**：右上角账号菜单里的
   「后台管理」只有在拿到 isAdmin 之后才允许出现。
   2026-10-21 的教训：把 dxEnsureRole 一起删掉、并把 loaded 直接置 true，
   结果 isAdmin() 永远返回 false —— 登录后「后台管理」入口整个消失。 */
var DX_ROLE = { loaded: false, loading: null };

function dxEnsureRole() {
  if (DX_ROLE.loaded) return Promise.resolve(isAdmin());
  if (DX_ROLE.loading) return DX_ROLE.loading;
  DX_ROLE.loading = api('/api/console').then(function (r) {
    var b = (r.ok && r.body) || {};
    if (b.me) SESSION = b.me;
    CONSOLE.isAdmin = !!b.isAdmin;
    DX_ROLE.loaded = true;
    return CONSOLE.isAdmin;
  })['catch'](function () {
    /* 失败按非管理员处理：画一个必然被拒的入口，比不画更糟 */
    DX_ROLE.loaded = true;
    CONSOLE.isAdmin = false;
    return false;
  });
  return DX_ROLE.loading;
}

function renderDash(path) {
  if (window.MNConsole && typeof window.MNConsole.render === 'function') {
    return window.MNConsole.render(path);
  }
  /* 兜底：console.js 没到位（缓存穿透 / 构建漏拷）。动态补一次，再不行才报错。
     不做这一步的话，直达 #/dashboard/overview 会永久停在"资源未加载"。 */
  if (!window.__mnConsoleRetry) {
    window.__mnConsoleRetry = 1;
    var s = document.createElement('script');
    s.src = 'assets/console.js?v=11.23';
    s.onload = function () { renderDash(path); };
    s.onerror = function () {
      var view = $('#view');
      if (view) {
        view.hidden = false;
        view.innerHTML = '<div style="padding:48px;max-width:520px;margin:0 auto;font-size:13px;line-height:1.8">' +
          '<b style="font-size:15px">Mnemosyne OS SaaS 资源未加载</b><br>' +
          'assets/console.js 没有取到。检查网络后刷新；若持续出现，说明部署包漏了 assets 目录。' +
          '<br><br><a href="#top" style="text-decoration:underline">返回首页</a></div>';
      }
    };
    document.body.appendChild(s);
    return;
  }
}

/* ======================================================================= *
 *  10 · SHARED BITS — the logo mark, avatars, uploads                     *
 *                                                                         *
 *  The mark below is the same geometry the header draws: six inner nodes  *
 *  on a ring, six outer ones, and the teal core. It is the default avatar  *
 *  so a new account has a face before it uploads one.                     *
 * ======================================================================= */

var MN_INNER = [[47.4, 32, 3.9], [39.7, 45.34, 3.9], [24.3, 45.34, 3.9],
                [16.6, 32, 3.9], [24.3, 18.66, 3.9], [39.7, 18.66, 3.9]];
var MN_OUTER = [[53.65, 44.5, 4.6], [32, 57, 4.2], [10.35, 44.5, 4.7],
                [10.35, 19.5, 4.2], [32, 7, 4.6], [53.65, 19.5, 4.3]];
MN_INNER.concat(MN_OUTER);
var MN_LINKS = function () {
  var d = [];
  MN_INNER.forEach(function (p) { d.push('M32 32L' + p[0] + ' ' + p[1]); });
  var i2o = [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3],
             [3, 3], [3, 4], [4, 4], [4, 5], [5, 5], [5, 0]];
  i2o.forEach(function (p) {
    var a = MN_INNER[p[0]], b = MN_OUTER[p[1]];
    d.push('M' + a[0] + ' ' + a[1] + 'L' + b[0] + ' ' + b[1]);
  });
  return d.join('');
}();

function logoMarkSVG() {
  var s = '<svg viewBox="2 3 64 58" aria-hidden="true" focusable="false">';
  s += '<path d="' + MN_LINKS + '" fill="none" stroke="currentColor" stroke-width="1.5" ' +
       'stroke-opacity=".42" stroke-linecap="round"/>';
  s += '<g fill="currentColor" opacity=".62">';
  MN_INNER.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '"/>'; });
  s += '</g><g fill="currentColor">';
  MN_OUTER.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '"/>'; });
  s += '</g><circle cx="32" cy="32" r="6.6" fill="#0D9488"/></svg>';
  return s;
}

/* The picture when there is one, the mark when there is not, and the initial
   only as a last resort for a name we cannot draw. */
function avatarHTML(sess, cls) {
  var box = '<span class="' + (cls || 'av') + '">';
  var src = sess && sess.avatar ? String(sess.avatar) : '';
  if (src && src.indexOf('api/avatar/') === 0) return box + '<img src="/' + src + '" alt="">' + '</span>';
  if (src && src.indexOf('data:') === 0) return box + '<img src="' + esc(src) + '" alt="">' + '</span>';
  return box + logoMarkSVG() + '</span>';
}

var AVA_UI = { busy: false };

function readAvatarFile(input, onData, onErr) {
  var f = input && input.files && input.files[0];
  if (!f) return;
  if (f.size > 512 * 1024) { onErr(dz('图片请小于 512 KB。', 'Keep the picture under 512 KB.')); return; }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) {
    onErr(dz('请使用 PNG、JPEG、WebP 或 GIF。', 'Use a PNG, JPEG, WebP or GIF.'));
    return;
  }
  var fr = new FileReader();
  fr.onload = function () { onData(String(fr.result)); };
  fr.onerror = function () { onErr(dz('读取文件失败。', 'Could not read that file.')); };
  fr.readAsDataURL(f);
}

function preloadAvatarData(data) {
  var img = new Image();
  img.src = data;
  return new Promise(function (res) { img.onload = function () { res(true); }; img.onerror = function () { res(false); }; });
}

  /* Avatar upload / removal. Both write straight to the header so the change is
     visible where the person is looking, not only inside the card. */
  function uploadAvatar(file) {
    readAvatarFile(file, function (data) {
      preloadAvatarData(data).then(function (okImg) {
        if (!okImg) { toast(dz('这个文件不是有效的图片。', 'That file is not a valid image.')); return; }
        toast(dz('正在上传…', 'Uploading…'));
        api('/api/profile/avatar', { method: 'POST', body: JSON.stringify({ data: data }) })
          .then(function (r) {
            if (!r.ok) {
              toast((r.body && r.body.message) || dz('上传失败。', 'Upload failed.'));
              return;
            }
            if (SESSION) SESSION.avatar = r.body.avatar || '';
            repaintAvatarBox();
            renderAccountNav();
            toast(dz('头像已更新。', 'Picture updated.'));
          });
      });
    }, function (msg) { toast(msg); });
  }

  function removeAvatar() {
    api('/api/profile/avatar/remove', { method: 'POST', body: '{}' }).then(function (r) {
      if (!r.ok) { toast(apiErr(r, dz('移除失败。', 'Could not remove it.'))); return; }
      if (SESSION) SESSION.avatar = '';
      repaintAvatarBox();
      renderAccountNav();
      toast(dz('头像已移除，恢复为 Mnemosyne OS 标志。', 'Removed — the Mnemosyne OS mark is back.'));
    });
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'av-file') uploadAvatar(e.target);
  });

/* ======================================================================= *
 *  11 · DOCUMENTATION SITE                                                 *
 *                                                                         *
 *  Eight pages in the shape docs.mem0.ai uses: a sticky top bar with a     *
 *  search box (Ctrl+K), a grouped left rail, the article, and a right-hand *
 *  "on this page" list. Every figure below is one this project can point   *
 *  at — the package version, the licence and the dependency list all come  *
 *  from setup.py in the repository, and the timings come from its          *
 *  CHANGELOG.                                                              *
 * ======================================================================= */

var DOCS_GROUPS = [
  { id: 'start', z: '开始使用', e: 'Get started', items: ['introduction', 'quickstart'] },
  { id: 'platform', z: '平台', e: 'Platform', items: ['open-source'] },
  { id: 'formation', z: '记忆运行', e: 'Memory runtime', items: ['memory-formation'] },
  { id: 'integrations', z: '集成', e: 'Integrations', items: ['integrations', 'claude-code'] },
  { id: 'reference', z: '参考', e: 'Reference', items: ['cookbooks', 'api-reference', 'changelog'] }
];

var DOCS_META = {
  introduction: ['介绍', 'Introduction'],
  quickstart: ['快速开始', 'Quickstart'],
  'open-source': ['开源概览', 'Open source'],
  'memory-formation': ['记忆形成层', 'Memory formation'],
  integrations: ['集成', 'Integrations'],
  'claude-code': ['Claude Code', 'Claude Code'],
  cookbooks: ['食谱', 'Cookbooks'],
  'api-reference': ['API 参考', 'API reference'],
  changelog: ['更新日志', 'Changelog']
};

var DOCS_ZH = {
  'memory-formation': {
    crumb: '平台', h1: '记忆形成层',
    lead: '8.0.0 擅长把记忆找回来；8.1.0 补上「把经历变成记忆」。会话结束时自动沉淀摘要与事实，矛盾时按显式策略失效而非删除，任务与代码的演进各有一条可回溯的链路。',
    blocks: [
      { h: '会话摘要：七要素 + 抗漂移', id: 'summary', blocks: [
        { p: '每轮对话结束时抽取一份摘要，必须覆盖七类信息 —— 目标、约束、决策及理由、未决项、产物、失败尝试、偏好信号。少于这七项，摘要三个月后就会退化成一本读不完的日记。' },
        { p: '滚动摘要会漂移：每次用「上一版摘要 + 新对话」重写，误差会累积。三条约束压制它：用户原话、数字、路径以原文钉住不参与改写；新信息只追加，冲突时才改写并记录原因；每 20 轮丢弃旧摘要、直接从原文重建一次。' },
        { code: 'session_summarize(turns, rebuild_every=20)\ntopic_summarize(project, window_days=30)' }
      ] },
      { h: '冲突消解：九类关系，默认保守', id: 'conflict', blocks: [
        { p: '新事实进来先检索语义相近的既有记忆，判定九类关系之一，再决定动作。默认能并存就并存、能失效就不删除 —— 删掉的记忆无法回答「去年我在哪家公司」，失效的可以。' },
        { table: [
          ['关系', '动作'],
          ['重复 / 细化', 'NOOP（只上调置信度、追加证据）'],
          ['时间性更新 / 偏好变更', 'UPDATE（旧条打 t_invalid，与新条并存）'],
          ['作用域不同（伪冲突）', 'ADD（靠 scope 隔离）'],
          ['精度差异', 'NOOP（粗粒度版标 superseded）'],
          ['逻辑矛盾 / 来源冲突', 'KEEP_BOTH（降权 + 待确认）']
        ] },
        { callout: '逻辑矛盾不自动选边。自动选一边必然错一半，而下次对话问一句的成本极低。' }
      ] },
      { h: '任务与经验：两个库，一条闭环', id: 'working', blocks: [
        { p: '事实层只追加、不改写：这次任务做了什么、结果如何。经验层在同类任务成功两次后才归纳，且必须带适用条件 —— must / must_not / typical_env 三件套。' },
        { p: '经验不带条件就会负迁移：条件不匹配时，Agent 会自信地把上一次的做法套到这一次。所以注入时只给 applicable=true 的条目，并且写成「参考建议」而不是「必须执行」。' },
        { code: 'task_record(goal, goal_type, steps, outcome, rework_count)\nplaybook_save(pattern, preconditions, failure_modes)\nplaybook_save(memory_id=..., success=False, deviation="为什么没按它做")' }
      ] },
      { h: '代码演进：git 存不下的三件事', id: 'coding', blocks: [
        { p: 'git 存了改了什么、谁改的，但存不下为什么改、试过什么不行、当时的约束是什么。变更事件补的正是这三块，外加一条 parent 链 —— 让 Agent 能回答「这段代码为什么长这样」。' },
        { ul: [
          'intent / intent_type —— 这次改动想解决什么',
          'rejected_approaches —— 试过但放弃的方案，信息密度最高',
          'outcome / reverted_by / regression —— 合并、回滚、回归',
          'symbols / impact —— 符号级锚点，比文件级精准'
        ] },
        { code: 'code_change_record(repo, commit, intent, rejected_approaches)\ncode_archaeology(symbol)   # 最近三次意图 / 是否被回滚 / 已知约束' }
      ] },
      { h: '敏感度治理：写入前拦，不是事后清', id: 'policy', blocks: [
        { p: '三级敏感度：normal 正常入库，private 入库但限制外泄，secret 直接拒写。身份证、银行卡、API 密钥、明文密码、Bearer Token 命中即拒。' },
        { p: '来源也参与排序：用户显式陈述 > 工具返回 > 用户隐含 > 外部网页。外部内容默认最低权重，且不参与「用户偏好」类记忆的写入 —— 这是防记忆投毒的第一道防线。' },
        { code: 'memory_policy(content)    # -> {level, reasons}\nmemory_trace(memory_id)   # 谁、何时、从哪条消息写入' }
      ] }
    ]
  },
  introduction: {
    crumb: '开始使用', h1: '介绍',
    lead: 'Mnemosyne OS 是一个本地优先的 AI 记忆引擎：代理把值得留下的事实写进去，之后按语义取回来。数据、索引和审计链都在你自己的机器上。',
    blocks: [
      { h: '它解决什么问题', id: 'what', blocks: [
        { p: '大模型的上下文窗口是有上限的，把全部历史塞进去既慢又贵。Mnemosyne OS 的做法是把记忆写在外部，需要时只取回相关的那几条，并且每一次写入都进入一条可核验的哈希链。' },
        { ul: [
          '**会话不丢**：代理重启、进程崩溃、换一台机器，记忆都还在。',
          '**成本可控**：只把相关的若干条喂给模型，而不是整段历史。',
          '**可追溯**：每条记忆有 id、置信度与审计记录，能被引用、能被遗忘。'
        ] }
      ] },
      { h: '三个核心动作', id: 'verbs', blocks: [
        { p: '整个系统对外只有一组很小的动作，几乎所有用法都是它们的组合。' },
        { table: [
          ['动作', '作用', '典型调用'],
          ['retain', '写入一条记忆，可带类型、标签与置信度', '<code>retain("部署密钥每月 1 号轮换", tags=["运维"])</code>'],
          ['recall', '按语义检索，返回带分数的若干条', '<code>recall("部署密钥什么时候换", k=5)</code>'],
          ['forget', '软遗忘：置信度归零并标记已删除，审计链保留', '<code>forget(memory_id="m-…")</code>']
        ] }
      ] },
      { h: '它跑在哪里', id: 'where', blocks: [
        { p: '引擎本身是纯 Python 标准库实现，可以作为一个库嵌进你的进程，也可以作为 MCP 服务挂在本地端口上让别的代理调用。' },
        { callout: '<b>没有托管依赖。</b>默认不调用任何外部向量库或大模型；需要语义检索时，可选的嵌入后端由你自己指定。' }
      ] },
      { h: '接着看', id: 'next', blocks: [
        { cards: [
          ['quickstart', '快速开始', '五分钟装上并写下第一条记忆。'],
          ['open-source', '开源概览', '许可证、依赖与架构。'],
          ['integrations', '集成', '把记忆接到你的代理与工具里。']
        ] }
      ] }
    ]
  },
  quickstart: {
    crumb: '开始使用', h1: '快速开始',
    lead: '从零到一条能取回来的记忆，通常不超过五分钟。以下命令都是这个项目实际支持的形式。',
    blocks: [
      { h: '安装', id: 'install', blocks: [
        { p: '包名是 <code>ai-memo-os</code>，要求 Python 3.8 及以上。没有第三方依赖需要编译。' },
        { code: 'pip install ai-memo-os' },
        { p: '安装后可以用一行命令确认版本与自检结果：' },
        { code: 'python -m mnemosyne --version\npython -m mnemosyne doctor' }
      ] },
      { h: '写入第一条记忆', id: 'retain', blocks: [
        { p: '作为库使用时，先指定一个目录——那一个目录就是全部数据。' },
        { code: 'from mnemosyne import MemoryBrain\n\nbrain = MemoryBrain("./my_memories")\nbrain.ensure_init()\n\nbrain.retain("我们的部署密钥每月 1 号轮换", fast=True)' },
        { p: '<code>fast=True</code> 跳过可选的向量化步骤，写入落在存储层，实测约 0.3 毫秒每条。' }
      ] },
      { h: '取回来', id: 'recall', blocks: [
        { code: 'results = brain.recall("部署密钥什么时候换", k=5)\nfor score, record, reasons in results:\n    print(round(score, 3), record["content"])' },
        { p: '返回值是三元组：分数、记录本体、以及命中原因。命中原因会说明这一条是靠关键词、向量还是时间接近被选中的，便于排查召回质量。' }
      ] },
      { h: '作为 MCP 服务运行', id: 'mcp', blocks: [
        { p: '想让别的代理用上它，把它挂成一个本机 HTTP 端点即可。三十一个工具会通过 MCP 暴露出去。' },
        { code: '# start the gateway on 127.0.0.1:8788\npython -m mnemosyne.gateway --port 8788\n\n# then point any MCP client at\nhttp://127.0.0.1:8788/mcp' },
        { callout: '<b>外网访问要带令牌。</b>回环地址免鉴权；一旦请求来自回环之外，网关会要求 <code>Authorization: Bearer &lt;token&gt;</code>。' }
      ] },
      { h: '下一步', id: 'next', blocks: [
        { cards: [
          ['claude-code', 'Claude Code', '在 Claude Code 里挂上这个 MCP 服务。'],
          ['api-reference', 'API 参考', '用本站的 HTTP 接口读写记忆。'],
          ['cookbooks', '食谱', '可直接照抄的常见做法。']
        ] }
      ] }
    ]
  },
  'open-source': {
    crumb: '平台', h1: '开源概览',
    lead: '项目按 MIT 许可证发布，代码在 GitHub 上；引擎不依赖任何第三方运行库。这一页把许可证、依赖和目录结构讲清楚。',
    blocks: [
      { h: '许可证与仓库', id: 'license', blocks: [
        { table: [
          ['项目', '值'],
          ['许可证', 'MIT'],
          ['仓库', '<a href="https://github.com/MnemosyneOS/mnemosyne" target="_blank" rel="noopener">MnemosyneOS/mnemosyne</a>'],
          ['包名', '<code>ai-memo-os</code>'],
          ['Python', '3.8 及以上'],
          ['当前版本', '8.1.0']
        ] }
      ] },
      { h: '核心依赖：无', id: 'deps', blocks: [
        { p: '运行时不引入 numpy、torch、向量数据库或任何大模型 SDK。加密用 <code>hashlib</code>，存储用标准库，检索的相关性打分由项目自己实现。' },
        { p: '这意味着安装不会拉下一串编译产物，也不会因为某个上游库改版而挂掉。可选的向量后端（例如外部的嵌入服务）是显式开启的，默认关闭。' }
      ] },
      { h: '写入路径', id: 'write-path', blocks: [
        { p: '一次写入经过四步：安全公证、哈希链账本、审计记录、索引更新。实测完整路径约 1 毫秒，存储层单条约 0.3 毫秒。' },
        { ul: [
          '**哈希链账本**：每条记录串进前一条的哈希，事后改动会被发现。',
          '**审计记录**：谁在什么时候写了什么，可单独查询。',
          '**索引**：关键词与可选向量的双通道，召回时两路合并再排序。'
        ] }
      ] },
      { h: '规模', id: 'scale', blocks: [
        { table: [
          ['指标', '实测值'],
          ['10 万条记忆常驻内存', '298 MB'],
          ['单条写入（存储层）', '约 0.3 毫秒'],
          ['完整写入路径', '约 1 毫秒'],
          ['批量写入', '比逐条快约 15 倍']
        ] },
        { callout: '<b>这些数字来自仓库的 CHANGELOG 与验收脚本</b>，可在 <a href="https://github.com/MnemosyneOS/mnemosyne" target="_blank" rel="noopener">仓库</a>里复核。' }
      ] },
      { h: '质量与验收', id: 'quality', blocks: [
        { p: '仓库自带一组验收脚本，覆盖召回质量、记忆生命周期与安全报告；当前的验收套件包含 94 项断言。更换存储或检索后端后，先跑这组脚本再谈性能。' },
        { p: '评测方向采用记忆领域公认的三个基准：<b>LoCoMo</b>、<b>LongMemEval</b> 与 <b>BEAM</b>。这三个基准衡量的是长期对话记忆在不同规模下的保持与检索能力，比单一的速度指标更能说明问题。' }
      ] }
    ]
  },
  integrations: {
    crumb: '集成', h1: '集成',
    lead: 'Mnemosyne OS 通过 MCP 对外暴露记忆能力，任何支持 MCP 的客户端都能接。也可以直接用 HTTP 接口在自己的程序里读写。',
    blocks: [
      { h: '三种接入方式', id: 'ways', blocks: [
        { table: [
          ['方式', '适合', '入口'],
          ['MCP 服务', '任意支持 MCP 的代理与 IDE', '<code>http://127.0.0.1:8788/mcp</code>'],
          ['HTTP 接口', '你自己的服务、脚本、定时任务', '<code>https://ai-memory.net/v1/*</code>'],
          ['Python 库', '嵌进已有的 Python 进程', '<code>from mnemosyne import MemoryBrain</code>']
        ] }
      ] },
      { h: '工具清单', id: 'tools', blocks: [
        { p: '网关当前暴露 52 个 MCP 工具。常用的几个：' },
        { ul: [
          '<code>retain</code> / <code>retain_batch</code> —— 写入一条 / 批量写入。',
          '<code>recall</code> —— 语义检索，可限定类型与标签。',
          '<code>forget</code> —— 软遗忘，支持预演（<code>dry_run</code>）。',
          '<code>stats</code> / <code>recall_health</code> —— 写入与召回的质量指标。',
          '<code>capsule</code> / <code>expand</code> —— 把一条记忆压成预算内的胶囊，再精确还原。',
          '<code>graph_query</code> —— 查实体之间的关系。',
          '<code>memory/export-v1</code> / <code>memory/import-v1</code> —— 迁移与备份。'
        ] }
      ] },
      { h: '客户端配置', id: 'clients', blocks: [
        { p: '多数客户端读一份 JSON 配置。把网关地址填进去即可：' },
        { code: '{\n  "mcpServers": {\n    "mnemosyne": {\n      "url": "http://127.0.0.1:8788/mcp",\n      "headers": { "Authorization": "Bearer <token>" }\n    }\n  }\n}' },
        { callout: '回环地址可以省略 <code>headers</code>。一旦经由隧道或公网访问，令牌是必需的。' }
      ] },
      { h: '安全边界', id: 'security', blocks: [
        { ul: [
          '数据文件默认只在本机，不会因为用了某个代理就被上传。',
          '网关在回环之外的来源一律要求令牌，校验失败返回 401 而不是降级放行。',
          '遗忘是软删除：置信度归零、状态标记删除，审计链保留以便复核。'
        ] }
      ] }
    ]
  },
  'claude-code': {
    crumb: '集成', h1: 'Claude Code',
    lead: 'Claude Code 支持 MCP，所以接上 Mnemosyne OS 只需要一段配置：让它在本机开一个记忆网关，剩下的交给工具调用。',
    blocks: [
      { h: '第一步：启动网关', id: 'start', blocks: [
        { p: '网关是一个本地进程，监听回环端口。先确认它能起来。' },
        { code: '# install and start the gateway on the default port\npip install ai-memo-os\npython -m mnemosyne.gateway --port 8788\n\n# health check\ncurl http://127.0.0.1:8788/healthz' }
      ] },
      { h: '第二步：登记到 Claude Code', id: 'register', blocks: [
        { p: '把服务写进 Claude Code 的 MCP 配置。项目级配置只对这个目录生效，用户级配置则到处可用。' },
        { code: '{\n  "mcpServers": {\n    "mnemosyne": {\n      "url": "http://127.0.0.1:8788/mcp"\n    }\n  }\n}' },
        { p: '保存后重开一个会话，用 <code>/mcp</code> 查看连接状态，应当能看到 52 个工具。' }
      ] },
      { h: '第三步：让它真的用起来', id: 'use', blocks: [
        { p: '工具挂上不等于会被用。在项目的说明文件里写清楚什么时候该写、什么时候该取，效果会明显不同：' },
        { code: '## Memory\n\n- Before answering anything about past decisions, call `recall` first.\n- After a decision is made, call `retain` with the decision and the reason.\n- Never store secrets, tokens or personal data.' }
      ] },
      { h: '常见问题', id: 'faq', blocks: [
        { table: [
          ['现象', '原因与处理'],
          ['工具列表是空的', '网关没起来，或端口被占用。先跑 <code>curl http://127.0.0.1:8788/healthz</code>。'],
          ['写入报 401', '请求不是从回环发出的。带上令牌，或改回本机地址。'],
          ['召回想不起来', '默认 <code>recall</code> 只返回少量结果，按需调整 <code>k</code>；必要时按标签或类型过滤。'],
          ['写入很慢', '检查是否开启了外部嵌入后端；纯本地写入约 0.3 毫秒。']
        ] }
      ] }
    ]
  },
  cookbooks: {
    crumb: '参考', h1: '食谱',
    lead: '几个可以直接照抄的做法，覆盖项目记忆、会话记忆、迁移与质量检查。',
    blocks: [
      { h: '给项目留一份长期记忆', id: 'project', blocks: [
        { p: '把决定和理由写进去，而不是写结论。检索时理由比结论更常被命中。' },
        { code: 'brain.retain(\n    "决定：控制台用单文件实现，不引入构建步骤。原因：部署只有一次文件传输。",\n    mtype="strategy",\n    tags=["前端工程", "决定"],\n    confidence=0.9,\n)' }
      ] },
      { h: '把一次排查写成可复用的经验', id: 'lesson', blocks: [
        { code: 'brain.retain(\n    "现象：POST 的请求体没被读走，残留字节污染了同一连接上的下一个请求。\\n"\n    "修法：每个 POST 入口先清空缓存并读一次 body，即使不用它。",\n    mtype="lesson",\n    tags=["调试", "HTTP"],\n    importance=4,\n)' }
      ] },
      { h: '批量导入', id: 'batch', blocks: [
        { p: '批量写入比逐条快约 15 倍，适合一次性灌入历史记录。' },
        { code: 'brain.retain_batch([\n    {"content": "第一条…", "tags": ["导入"]},\n    {"content": "第二条…", "tags": ["导入"]},\n])' }
      ] },
      { h: '检查召回质量', id: 'health', blocks: [
        { p: '不要凭感觉判断召回好不好。先看指标，再决定要不要调参。' },
        { code: '# 记忆库自检：记录数、磁盘、向量后端健康度\npython -m mnemosyne doctor\n\n# 召回质量：空结果率、平均返回条数、平均 top1 分数\npython -m mnemosyne recall-health' }
      ] },
      { h: '导出与迁移', id: 'export', blocks: [
        { p: '导出是 JSONL 加一份清单，可以在另一台机器上导入并合并。' },
        { code: 'python -m mnemosyne export --out ./memory-dump\n# on the other machine\npython -m mnemosyne import --in ./memory-dump' }
      ] }
    ]
  },
  'api-reference': {
    crumb: '参考', h1: 'API 参考',
    lead: '本站提供一组 HTTP 接口，用控制台里创建的密钥调用。密钥以 Bearer 令牌的形式传递，服务端只保存它的哈希。',
    blocks: [
      { h: '鉴权', id: 'auth', blocks: [
        { p: '在控制台的「API 密钥」页面创建一个密钥，它只显示一次。之后每个请求都要带上它：' },
        { code: 'curl https://ai-memory.net/v1/status \\\n  -H "Authorization: Bearer mn-xxxxxxxx"' },
        { callout: '<b>密钥吊销即刻生效。</b>吊销后同一个密钥的下一次请求就会返回 <code>401</code>。' }
      ] },
      { h: '接口一览', id: 'endpoints', blocks: [
        { table: [
          ['方法', '路径', '作用'],
          ['GET', '<code>/v1/status</code>', '记忆总数、当日写入与召回、命中率、节省的 token'],
          ['GET', '<code>/v1/memories</code>', '分页列出记忆，支持 <code>q</code> 搜索'],
          ['POST', '<code>/v1/memories</code>', '写入一条记忆'],
          ['GET', '<code>/v1/memories/{id}</code>', '取一条记忆的全文'],
          ['DELETE', '<code>/v1/memories/{id}</code>', '遗忘一条记忆（软删除）'],
          ['POST', '<code>/v1/recall</code>', '按语义检索，可指定返回条数'],
          ['GET', '<code>/v1/graph</code>', '知识图谱的节点与边']
        ] }
      ] },
      { h: '读取状态', id: 'status', blocks: [
        { code: 'GET /v1/status\n\n{\n  "memories": 204,\n  "today": { "retain": 43, "recall": 43, "hit_rate": 0.91, "saved_tokens": 42082 },\n  "key": { "name": "Default Key", "prefix": "mn-abc123" }\n}' }
      ] },
      { h: '写入与检索', id: 'write', blocks: [
        { code: 'POST /v1/memories\nContent-Type: application/json\n\n{\n  "content": "部署密钥每月 1 号轮换",\n  "mtype": "semantic",\n  "tags": ["运维"],\n  "confidence": 0.9\n}' },
        { code: 'POST /v1/recall\nContent-Type: application/json\n\n{ "query": "部署密钥什么时候换", "k": 5 }' }
      ] },
      { h: '错误码', id: 'errors', blocks: [
        { table: [
          ['状态码', '含义', '处理'],
          ['401', '缺少密钥、密钥无效或已被吊销', '检查 <code>Authorization</code> 头，或到控制台重新生成'],
          ['400', '请求体不合法（例如 <code>content</code> 为空）', '对照上面的示例修正字段'],
          ['404', '记忆 id 不存在，或路径写错', '先 <code>GET /v1/memories</code> 确认 id'],
          ['502 / 503', '记忆网关暂时不可达', '稍后重试；这通常意味着本机引擎没有运行']
        ] }
      ] }
    ]
  },
  changelog: {
    crumb: '参考', h1: '更新日志',
    lead: '本站与记忆系统最近的变化。每条都对应一次实际交付，没有占位条目。',
    blocks: [
      { h: '2026-09-22', id: 'd1', blocks: [
        { ul: [
          '**控制台**：17 个页面上线，指标全部接到本机记忆网关的真实数据。',
          '**副驾驶**：接入大模型，回答基于项目自己的记忆，并标注所用模型。',
          '**API 密钥**：新增对外 <code>/v1/*</code> 接口，密钥可用于实际调用并记录用量。',
          '**图谱**：与控制台共用同一个三维渲染组件。',
          '**头像**：个人资料可上传头像，未上传时显示 Mnemosyne OS 标志。',
          '**文档站**：八个页面上线。'
        ] }
      ] },
      { h: '2026-09-21', id: 'd2', blocks: [
        { ul: [
          '**账号体系**：邮箱注册与登录、GitHub 登录、站点管理页。',
          '**安全加固**：登录与注册限流、安全响应头、敏感文件移出 web 根。',
          '**访问统计**：全量访客与请求明细、地理定位、日志归档（手动 + 每 25 天自动）。',
          '**性能**：字体一年 immutable 缓存，样式与脚本十分钟缓存。'
        ] }
      ] }
    ]
  }
};

var DOCS_EN = {
  'memory-formation': {
    crumb: 'Platform', h1: 'Memory formation',
    lead: '8.0.0 was good at finding memories again; 8.1.0 closes the other half — turning experience into memory. Sessions end with a summary and atomic facts, contradictions are invalidated rather than deleted, and both task and code history stay traceable.',
    blocks: [
      { h: 'Session summaries: seven elements, and drift control', id: 'summary', blocks: [
        { p: 'Every session ends with a summary that must cover seven things: goal, constraints, decisions and why, open items, artifacts, failed attempts and preference signals. Miss any of them and the summary degrades into an unreadable diary within three months.' },
        { p: 'Rolling summaries drift, because each version is written from the previous one plus new turns. Three constraints hold it back: quotes, numbers and paths are pinned verbatim and never rewritten; new information is appended, and old text is only rewritten on a direct conflict with the reason recorded; every 20 turns the summary is discarded and rebuilt from the raw turns.' },
        { code: 'session_summarize(turns, rebuild_every=20)\ntopic_summarize(project, window_days=30)' }
      ] },
      { h: 'Conflict resolution: nine relations, conservative by default', id: 'conflict', blocks: [
        { p: 'A new fact first retrieves semantically close memories, classifies the relation, then picks an action. When in doubt, keep both and invalidate rather than delete — a deleted memory cannot answer “where did I work last year”, an invalidated one still can.' },
        { table: [
          ['Relation', 'Action'],
          ['Duplicate / refinement', 'NOOP (raise confidence, append evidence)'],
          ['Temporal update / preference change', 'UPDATE (old row gets t_invalid, both kept)'],
          ['Different scope (pseudo-conflict)', 'ADD (isolated by scope)'],
          ['Precision difference', 'NOOP (coarse version marked superseded)'],
          ['Logical contradiction / source conflict', 'KEEP_BOTH (down-weight, ask later)']
        ] },
        { callout: 'Logical contradictions are never auto-resolved. Picking a side is wrong half the time; asking once in the next session costs almost nothing.' }
      ] },
      { h: 'Tasks and playbooks: two stores, one loop', id: 'working', blocks: [
        { p: 'The fact store is append-only: what was done, and how it turned out. The playbook store only abstracts after the same class of task succeeded twice, and every playbook must carry its applicability conditions — must, must_not and typical_env.' },
        { p: 'An experience without conditions causes negative transfer: when the situation does not match, the agent confidently applies the wrong recipe. So only entries with applicable=true are injected, and they are phrased as suggestions rather than mandatory steps.' },
        { code: 'task_record(goal, goal_type, steps, outcome, rework_count)\nplaybook_save(pattern, preconditions, failure_modes)\nplaybook_save(memory_id=..., success=False, deviation="why it was skipped")' }
      ] },
      { h: 'Code evolution: what git cannot store', id: 'coding', blocks: [
        { p: 'git stores what changed and who changed it. It does not store why, what was tried and rejected, or which constraints applied at the time. A change event carries exactly those three, plus a parent chain — enough for an agent to answer “why does this code look like this”.' },
        { ul: [
          'intent / intent_type — what the change was trying to solve',
          'rejected_approaches — approaches tried and abandoned, the highest-value field',
          'outcome / reverted_by / regression — merged, reverted, regressed',
          'symbols / impact — symbol-level anchors, sharper than file paths'
        ] },
        { code: 'code_change_record(repo, commit, intent, rejected_approaches)\ncode_archaeology(symbol)   # last three intents / reverted? / known constraints' }
      ] },
      { h: 'Sensitivity: stopped at write time, not cleaned up later', id: 'policy', blocks: [
        { p: 'Three levels: normal is stored as-is, private is stored but never leaves the machine, secret is rejected outright. National IDs, card numbers, API keys, plaintext passwords and bearer tokens are refused on sight.' },
        { p: 'Source also weighs in: explicit user statement > tool result > implicit user signal > external web. External content gets the lowest weight and never writes preference-type memories — the first line of defence against memory poisoning.' },
        { code: 'memory_policy(content)    # -> {level, reasons}\nmemory_trace(memory_id)   # who, when, from which message' }
      ] }
    ]
  },
  introduction: {
    crumb: 'Get started', h1: 'Introduction',
    lead: 'Mnemosyne OS is a local-first memory engine for AI agents: they write down what is worth keeping, then read it back by meaning. The data, the index and the audit chain stay on your machine.',
    blocks: [
      { h: 'What it is for', id: 'what', blocks: [
        { p: 'A context window is finite, and replaying the whole history through it is slow and expensive. Mnemosyne OS keeps memory outside the model, pulls back only the few records that matter, and chains every write into a verifiable ledger.' },
        { ul: [
          '**Nothing is forgotten at restart** — the memory survives the process, the agent and the machine.',
          '**Cost stays bounded** — a handful of relevant records go to the model instead of the full history.',
          '**Every record is traceable** — an id, a confidence and an audit entry, so a fact can be cited or forgotten.'
        ] }
      ] },
      { h: 'Three verbs', id: 'verbs', blocks: [
        { p: 'The whole system is a small set of actions, and nearly every use is a combination of them.' },
        { table: [
          ['Verb', 'What it does', 'Typical call'],
          ['retain', 'Write a memory with an optional type, tags and confidence', '<code>retain("The deploy key rotates on the 1st", tags=["ops"])</code>'],
          ['recall', 'Search by meaning, returning scored records', '<code>recall("when does the deploy key rotate", k=5)</code>'],
          ['forget', 'Soft delete: confidence to zero, status marked, audit chain kept', '<code>forget(memory_id="m-…")</code>']
        ] }
      ] },
      { h: 'Where it runs', id: 'where', blocks: [
        { p: 'The engine is pure Python standard library. Embed it in your own process as a library, or run it as an MCP server on a local port and let other agents call it.' },
        { callout: '<b>No hosted dependency.</b> Nothing external is called by default; an embedding backend is opt-in and chosen by you.' }
      ] },
      { h: 'Keep reading', id: 'next', blocks: [
        { cards: [
          ['quickstart', 'Quickstart', 'Install and write your first memory in five minutes.'],
          ['open-source', 'Open source', 'Licence, dependencies and architecture.'],
          ['integrations', 'Integrations', 'Wire memory into your agents and tools.']
        ] }
      ] }
    ]
  },
  quickstart: {
    crumb: 'Get started', h1: 'Quickstart',
    lead: 'From nothing to a memory you can retrieve, usually in under five minutes. Every command below is one this project actually supports.',
    blocks: [
      { h: 'Install', id: 'install', blocks: [
        { p: 'The package is <code>ai-memo-os</code> and it needs Python 3.8 or newer. There is nothing to compile.' },
        { code: 'pip install ai-memo-os' },
        { p: 'Then confirm the version and run the self-check: ' },
        { code: 'python -m mnemosyne --version\npython -m mnemosyne doctor' }
      ] },
      { h: 'Write your first memory', id: 'retain', blocks: [
        { p: 'As a library, you point it at a directory — that directory is the whole database.' },
        { code: 'from mnemosyne import MemoryBrain\n\nbrain = MemoryBrain("./my_memories")\nbrain.ensure_init()\n\nbrain.retain("Our deploy key rotates on the 1st of each month", fast=True)' },
        { p: '<code>fast=True</code> skips the optional embedding step, landing the write in the storage layer at roughly 0.3 ms per record.' }
      ] },
      { h: 'Read it back', id: 'recall', blocks: [
        { code: 'results = brain.recall("when does the deploy key rotate", k=5)\nfor score, record, reasons in results:\n    print(round(score, 3), record["content"])' },
        { p: 'Each result is a triple: the score, the record, and why it matched. The reasons say whether it came in on keywords, vectors or time proximity, which is what makes recall quality debuggable.' }
      ] },
      { h: 'Run it as an MCP server', id: 'mcp', blocks: [
        { p: 'To let another agent use it, expose it as a local HTTP endpoint. 52 tools appear over MCP.' },
        { code: '# start the gateway on 127.0.0.1:8788\npython -m mnemosyne.gateway --port 8788\n\n# then point any MCP client at\nhttp://127.0.0.1:8788/mcp' },
        { callout: '<b>Off-loopback needs a token.</b> Requests from the loopback address are trusted; anything else must carry <code>Authorization: Bearer &lt;token&gt;</code>.' }
      ] },
      { h: 'Next', id: 'next', blocks: [
        { cards: [
          ['claude-code', 'Claude Code', 'Attach the MCP server inside Claude Code.'],
          ['api-reference', 'API reference', 'Read and write memories over HTTP.'],
          ['cookbooks', 'Cookbooks', 'Recipes you can copy as they are.']
        ] }
      ] }
    ]
  },
  'open-source': {
    crumb: 'Platform', h1: 'Open source',
    lead: 'The project ships under the MIT licence and lives on GitHub. The engine has no third-party runtime dependencies. This page lays out the licence, the dependency list and the structure.',
    blocks: [
      { h: 'Licence and repository', id: 'license', blocks: [
        { table: [
          ['Item', 'Value'],
          ['Licence', 'MIT'],
          ['Repository', '<a href="https://github.com/MnemosyneOS/mnemosyne" target="_blank" rel="noopener">MnemosyneOS/mnemosyne</a>'],
          ['Package', '<code>ai-memo-os</code>'],
          ['Python', '3.8 or newer'],
          ['Current version', '8.1.0']
        ] }
      ] },
      { h: 'Core dependencies: none', id: 'deps', blocks: [
        { p: 'No numpy, no torch, no vector database, no model SDK at runtime. Hashing comes from <code>hashlib</code>, storage from the standard library, and the relevance scoring is implemented in the project.' },
        { p: 'That means installing pulls no compiled wheels, and no upstream release can break the engine underneath you. Optional vector backends — an external embedding service, for instance — are opt-in and off by default.' }
      ] },
      { h: 'The write path', id: 'write-path', blocks: [
        { p: 'A write goes through four steps: notarisation, a hash-chained ledger, an audit entry, and an index update. The full path measures around 1 ms; the storage layer alone around 0.3 ms per record.' },
        { ul: [
          '**Hash-chained ledger** — each record chains into the previous hash, so a later edit is detectable.',
          '**Audit entries** — who wrote what, when, queryable on its own.',
          '**Index** — keyword plus optional vector channels, merged and re-ranked at recall time.'
        ] }
      ] },
      { h: 'Scale', id: 'scale', blocks: [
        { table: [
          ['Measure', 'Observed'],
          ['100,000 memories resident', '298 MB'],
          ['Single write (storage layer)', 'about 0.3 ms'],
          ['Full write path', 'about 1 ms'],
          ['Batch write', 'about 15x faster than one by one']
        ] },
        { callout: '<b>These figures come from the repository CHANGELOG and its acceptance scripts</b> and can be re-run from the <a href="https://github.com/MnemosyneOS/mnemosyne" target="_blank" rel="noopener">repository</a>.' }
      ] },
      { h: 'Quality and acceptance', id: 'quality', blocks: [
        { p: 'The repository carries acceptance scripts covering recall quality, memory lifecycle and security reporting; the current suite holds 94 assertions. Swap the storage or retrieval backend, then run that suite before talking about speed.' },
        { p: 'Evaluation follows the three benchmarks the memory field uses: <b>LoCoMo</b>, <b>LongMemEval</b> and <b>BEAM</b>. They measure how well long-horizon conversational memory is retained and retrieved at different sizes, which says more than a single speed number.' }
      ] }
    ]
  },
  integrations: {
    crumb: 'Integrations', h1: 'Integrations',
    lead: 'Mnemosyne OS exposes memory over MCP, so any MCP-capable client can attach. You can also call the HTTP API directly from your own code.',
    blocks: [
      { h: 'Three ways in', id: 'ways', blocks: [
        { table: [
          ['Route', 'Good for', 'Entry point'],
          ['MCP server', 'Any MCP-capable agent or IDE', '<code>http://127.0.0.1:8788/mcp</code>'],
          ['HTTP API', 'Your own services, scripts and cron jobs', '<code>https://ai-memory.net/v1/*</code>'],
          ['Python library', 'Embedding inside an existing Python process', '<code>from mnemosyne import MemoryBrain</code>']
        ] }
      ] },
      { h: 'The tool list', id: 'tools', blocks: [
        { p: 'The gateway exposes 52 MCP tools today. The ones used most:' },
        { ul: [
          '<code>retain</code> / <code>retain_batch</code> — write one memory, or many.',
          '<code>recall</code> — search by meaning, filterable by type and tags.',
          '<code>forget</code> — soft delete, with a <code>dry_run</code> preview.',
          '<code>stats</code> / <code>recall_health</code> — write and recall quality metrics.',
          '<code>capsule</code> / <code>expand</code> — compress one memory into a budget and restore it exactly.',
          '<code>graph_query</code> — relationships between entities.',
          '<code>memory/export-v1</code> / <code>memory/import-v1</code> — migration and backup.'
        ] }
      ] },
      { h: 'Client configuration', id: 'clients', blocks: [
        { p: 'Most clients read a JSON block. Point it at the gateway:' },
        { code: '{\n  "mcpServers": {\n    "mnemosyne": {\n      "url": "http://127.0.0.1:8788/mcp",\n      "headers": { "Authorization": "Bearer <token>" }\n    }\n  }\n}' },
        { callout: 'On the loopback address the <code>headers</code> block can be omitted. The moment the request arrives through a tunnel or the internet, the token is required.' }
      ] },
      { h: 'Security boundary', id: 'security', blocks: [
        { ul: [
          'Data lives on your machine by default; attaching an agent does not upload it.',
          'Anything off the loopback address must present a token — a failed check answers 401 rather than degrading to open access.',
          'Forgetting is a soft delete: confidence to zero, status marked, audit chain retained for review.'
        ] }
      ] }
    ]
  },
  'claude-code': {
    crumb: 'Integrations', h1: 'Claude Code',
    lead: 'Claude Code speaks MCP, so attaching Mnemosyne OS is a short configuration: run the memory gateway locally, then register it.',
    blocks: [
      { h: 'Step one: start the gateway', id: 'start', blocks: [
        { p: 'The gateway is a local process on a loopback port. Confirm it comes up first.' },
        { code: '# install and start the gateway on the default port\npip install ai-memo-os\npython -m mnemosyne.gateway --port 8788\n\n# health check\ncurl http://127.0.0.1:8788/healthz' }
      ] },
      { h: 'Step two: register it', id: 'register', blocks: [
        { p: 'Add the server to the MCP configuration. A project-level entry applies to that directory only; a user-level entry applies everywhere.' },
        { code: '{\n  "mcpServers": {\n    "mnemosyne": {\n      "url": "http://127.0.0.1:8788/mcp"\n    }\n  }\n}' },
        { p: 'Open a new session and run <code>/mcp</code>. You should see 52 tools listed.' }
      ] },
      { h: 'Step three: make it actually use them', id: 'use', blocks: [
        { p: 'Attaching tools is not the same as using them. Saying when to write and when to read changes the behaviour noticeably:' },
        { code: '## Memory\n\n- Before answering anything about past decisions, call `recall` first.\n- After a decision is made, call `retain` with the decision and the reason.\n- Never store secrets, tokens or personal data.' }
      ] },
      { h: 'Troubleshooting', id: 'faq', blocks: [
        { table: [
          ['Symptom', 'Cause and fix'],
          ['Empty tool list', 'The gateway is not running, or the port is taken. Run <code>curl http://127.0.0.1:8788/healthz</code>.'],
          ['Write returns 401', 'The request is not coming from the loopback address. Add the token, or move back to localhost.'],
          ['Nothing comes back on recall', 'The default <code>recall</code> returns very few items — raise <code>k</code>, or filter by tag or type.'],
          ['Writes are slow', 'Check whether an external embedding backend is enabled; a purely local write is about 0.3 ms.']
        ] }
      ] }
    ]
  },
  cookbooks: {
    crumb: 'Reference', h1: 'Cookbooks',
    lead: 'A handful of recipes you can copy as they are: project memory, lessons, bulk import, quality checks and migration.',
    blocks: [
      { h: 'Long-term project memory', id: 'project', blocks: [
        { p: 'Store the decision with its reason, not the conclusion alone. Reasons get matched far more often than conclusions.' },
        { code: 'brain.retain(\n    "Decision: the console is one file, no build step. Reason: deployment is a single file copy.",\n    mtype="strategy",\n    tags=["frontend", "decision"],\n    confidence=0.9,\n)' }
      ] },
      { h: 'Turn an investigation into a reusable lesson', id: 'lesson', blocks: [
        { code: 'brain.retain(\n    "Symptom: a POST body was never read, and the leftover bytes corrupted the next\\n"\n    "request on the same connection. Fix: every POST entry point clears the cache and\\n"\n    "reads the body once, even when it does not need it.",\n    mtype="lesson",\n    tags=["debugging", "http"],\n    importance=4,\n)' }
      ] },
      { h: 'Bulk import', id: 'batch', blocks: [
        { p: 'Batch writes run roughly 15x faster than one at a time, which is what you want for loading history.' },
        { code: 'brain.retain_batch([\n    {"content": "First record…", "tags": ["import"]},\n    {"content": "Second record…", "tags": ["import"]},\n])' }
      ] },
      { h: 'Check recall quality', id: 'health', blocks: [
        { p: 'Do not judge recall by feel. Read the numbers, then decide whether to tune anything.' },
        { code: '# store health: record count, disk, vector backend\python -m mnemosyne doctor\n\n# recall quality: empty-result rate, average returned, average top-1 score\npython -m mnemosyne recall-health' }
      ] },
      { h: 'Export and migrate', id: 'export', blocks: [
        { p: 'An export is JSONL plus a manifest, importable and mergeable on another machine.' },
        { code: 'python -m mnemosyne export --out ./memory-dump\n# on the other machine\npython -m mnemosyne import --in ./memory-dump' }
      ] }
    ]
  },
  'api-reference': {
    crumb: 'Reference', h1: 'API reference',
    lead: 'This site exposes an HTTP API, called with a key created in the console. The key travels as a bearer token and the server keeps only its hash.',
    blocks: [
      { h: 'Authentication', id: 'auth', blocks: [
        { p: 'Create a key on the console\u2019s API Keys page — it is shown once. Every request then carries it:' },
        { code: 'curl https://ai-memory.net/v1/status \\\n  -H "Authorization: Bearer mn-xxxxxxxx"' },
        { callout: '<b>Revocation is immediate.</b> The next request with a revoked key answers <code>401</code>.' }
      ] },
      { h: 'Endpoints', id: 'endpoints', blocks: [
        { table: [
          ['Method', 'Path', 'Purpose'],
          ['GET', '<code>/v1/status</code>', 'Totals, today\u2019s writes and recalls, hit rate, tokens saved'],
          ['GET', '<code>/v1/memories</code>', 'Paged list, with <code>q</code> for search'],
          ['POST', '<code>/v1/memories</code>', 'Write one memory'],
          ['GET', '<code>/v1/memories/{id}</code>', 'Full text of one memory'],
          ['DELETE', '<code>/v1/memories/{id}</code>', 'Forget one memory (soft delete)'],
          ['POST', '<code>/v1/recall</code>', 'Search by meaning, with a result count'],
          ['GET', '<code>/v1/graph</code>', 'Graph nodes and edges']
        ] }
      ] },
      { h: 'Reading status', id: 'status', blocks: [
        { code: 'GET /v1/status\n\n{\n  "memories": 204,\n  "today": { "retain": 43, "recall": 43, "hit_rate": 0.91, "saved_tokens": 42082 },\n  "key": { "name": "Default Key", "prefix": "mn-abc123" }\n}' }
      ] },
      { h: 'Writing and searching', id: 'write', blocks: [
        { code: 'POST /v1/memories\nContent-Type: application/json\n\n{\n  "content": "The deploy key rotates on the 1st of each month",\n  "mtype": "semantic",\n  "tags": ["ops"],\n  "confidence": 0.9\n}' },
        { code: 'POST /v1/recall\nContent-Type: application/json\n\n{ "query": "when does the deploy key rotate", "k": 5 }' }
      ] },
      { h: 'Errors', id: 'errors', blocks: [
        { table: [
          ['Status', 'Meaning', 'What to do'],
          ['401', 'No key, a bad key, or a revoked one', 'Check the <code>Authorization</code> header, or create a new key'],
          ['400', 'Invalid body — an empty <code>content</code>, for instance', 'Compare against the examples above'],
          ['404', 'No such memory id, or a wrong path', 'List first with <code>GET /v1/memories</code>'],
          ['502 / 503', 'The memory gateway is unreachable', 'Retry shortly; it usually means the local engine is not running']
        ] }
      ] }
    ]
  },
  changelog: {
    crumb: 'Reference', h1: 'Changelog',
    lead: 'Recent changes to this site and the memory engine. Each entry is a real delivery, not a placeholder.',
    blocks: [
      { h: '2026-09-22', id: 'd1', blocks: [
        { ul: [
          '**Console**: 17 pages shipped, every figure read from the local memory gateway.',
          '**Copilot**: now answers with a language model grounded in this project\u2019s own memories, and names the model it used.',
          '**API keys**: a public <code>/v1/*</code> API, with keys that work and usage that is counted.',
          '**Graph**: shares the same 3D renderer as the brain panel.',
          '**Avatars**: profile pictures, falling back to the Mnemosyne OS mark.',
          '**Docs site**: eight pages shipped.'
        ] }
      ] },
      { h: '2026-09-21', id: 'd2', blocks: [
        { ul: [
          '**Accounts**: e-mail sign-up and sign-in, GitHub sign-in, and a site-admin page.',
          '**Hardening**: rate limits on sign-in and sign-up, security response headers, secrets moved out of the web root.',
          '**Analytics**: full visitor and request detail, geolocation, and log archiving (one click, plus every 25 days).',
          '**Performance**: fonts immutable for a year, CSS and JS cached for ten minutes.'
        ] }
      ] }
    ]
  }
};

function docsData(slug) {
  var zh = lang === 'zh';
  var d = (zh ? DOCS_ZH : DOCS_EN)[slug] || DOCS_EN[slug] || DOCS_EN.introduction;
  return d;
}

function docsNavHTML(active) {
  return DOCS_GROUPS.map(function (g) {
    return '<div class="ds-grp"><div class="h">' + esc(lang === 'zh' ? g.z : g.e) + '</div>' +
      g.items.map(function (k) {
        var m = DOCS_META[k] || [k, k];
        return '<a href="#/docs/' + k + '"' + (k === active ? ' class="on"' : '') + '>' +
          esc(lang === 'zh' ? m[0] : m[1]) + '</a>';
      }).join('') + '</div>';
  }).join('');
}

function docsInline(html) {
  /* The prose is authored with **bold** because it reads better in the source;
     turn it into <strong> here. Everything else in these strings is already
     the final markup (links, <code>), so nothing is escaped. */
  return String(html).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function docsBlocksHTML(blocks) {
  return (blocks || []).map(function (b) {
    if (b.h) {
      return '<h2 id="' + esc(b.id || '') + '">' + b.h + '</h2>' + docsBlocksHTML(b.blocks);
    }
    if (b.p) return '<p>' + docsInline(b.p) + '</p>';
    if (b.ul) return '<ul>' + b.ul.map(function (li) { return '<li>' + docsInline(li) + '</li>'; }).join('') + '</ul>';
    if (b.code) return '<pre><code>' + esc(b.code) + '</code></pre>';
    if (b.callout) {
      return '<div class="ds-callout"><i data-lucide="lightbulb"></i><span>' + docsInline(b.callout) + '</span></div>';
    }
    if (b.table) {
      var rows = b.table;
      return '<table><thead><tr>' + rows[0].map(function (h) { return '<th>' + docsInline(h) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + rows.slice(1).map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + docsInline(c) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    if (b.cards) {
      return '<div class="ds-cards">' + b.cards.map(function (c) {
        return '<a class="ds-card" href="#/docs/' + c[0] + '"><span class="t">' + esc(c[1]) +
          '</span><span class="d">' + esc(c[2]) + '</span></a>';
      }).join('') + '</div>';
    }
    return '';
  }).join('');
}

function docsSections(d) {
  var out = [];
  (d.blocks || []).forEach(function (b) { if (b.h) out.push([b.id, b.h]); });
  return out;
}

function renderDocsSite(path) {
  var slug = path.indexOf('docs/') === 0 ? path.slice(5) : 'introduction';
  if (!DOCS_META[slug]) slug = 'introduction';
  var view = $('#view'), home = $('#home');
  if (!view || !home) return;
  document.body.classList.add('docs');
  home.classList.add('off');
  view.hidden = false;

  var d = docsData(slug);
  var order = [];
  DOCS_GROUPS.forEach(function (g) { g.items.forEach(function (k) { order.push(k); }); });
  var at = order.indexOf(slug);

  var html =
    '<div class="ds">' +
      '<div class="ds-top"><div class="ds-top-in">' +
        '<a class="ds-logo" href="#top">' + logoMarkSVG() +
          '<span>Mnemosyne OS</span><span class="tag">' + esc(dz('文档', 'Docs')) + '</span></a>' +
        '<button class="ds-sbtn" type="button" data-ds-open="1">' +
          '<i data-lucide="search"></i><span>' + esc(dz('搜索文档…', 'Search the docs…')) + '</span>' +
          '<kbd>Ctrl K</kbd></button>' +
        '<button class="ds-lbtn" type="button" data-ds-lang="1">' + (lang === 'zh' ? 'EN' : '中文') + '</button>' +
        '<a class="ds-dash" href="#/dashboard/overview">' + esc(dz('您的仪表盘', 'Your Dashboard')) +
          '<i data-lucide="arrow-up-right"></i></a>' +
      '</div></div>' +
      '<div class="ds-wrap">' +
        '<aside class="ds-side">' + docsNavHTML(slug) + '</aside>' +
        '<main class="ds-main"><article class="ds-article">' +
          '<div class="ds-crumb">' + esc(d.crumb) + ' / ' + esc(d.h1) + '</div>' +
          '<h1>' + esc(d.h1) + '</h1>' +
          '<p class="ds-lead">' + esc(d.lead) + '</p>' +
          docsBlocksHTML(d.blocks) +
          '<div class="ds-nav2">' +
            (at > 0 ? '<a href="#/docs/' + order[at - 1] + '"><span class="k">' + esc(dz('上一页', 'Previous')) +
              '</span><span class="v">' + esc(lang === 'zh' ? DOCS_META[order[at - 1]][0] : DOCS_META[order[at - 1]][1]) + '</span></a>' : '<span style="flex:1"></span>') +
            (at >= 0 && at < order.length - 1 ? '<a href="#/docs/' + order[at + 1] + '" style="text-align:right"><span class="k">' +
              esc(dz('下一页', 'Next')) + '</span><span class="v">' +
              esc(lang === 'zh' ? DOCS_META[order[at + 1]][0] : DOCS_META[order[at + 1]][1]) + '</span></a>' : '') +
          '</div>' +
        '</article></main>' +
        '<aside class="ds-toc"><div class="h">' + esc(dz('本页内容', 'On this page')) + '</div>' +
          docsSections(d).map(function (s) {
            return '<a href="#/docs/' + slug + '" data-ds-anchor="' + esc(s[0]) + '">' + s[1] + '</a>';
          }).join('') +
        '</aside>' +
      '</div>' +
      '<div class="ds-dlg" id="ds-dlg"><div class="ds-dlg-in">' +
        '<input id="ds-q" placeholder="' + esc(dz('搜索文档…', 'Search the docs…')) + '" autocomplete="off">' +
        '<div class="ds-dlg-list" id="ds-list"></div>' +
      '</div></div>' +
    '</div>';

  view.innerHTML = html;
  document.title = d.h1 + ' — Mnemosyne OS';
  icons();
  docsFillList('');
  window.scrollTo(0, 0);
}

function docsIndex() {
  var out = [];
  DOCS_GROUPS.forEach(function (g) {
    g.items.forEach(function (k) {
      var m = DOCS_META[k] || [k, k];
      var d = DOCS_ZH[k], de = DOCS_EN[k];
      var terms = [m[0], m[1], (d && d.lead) || '', (de && de.lead) || ''];
      (docsSections(d || {})).forEach(function (s) { terms.push(s[1]); });
      (docsSections(de || {})).forEach(function (s) { terms.push(s[1]); });
      out.push({ slug: k, group: lang === 'zh' ? g.z : g.e, title: lang === 'zh' ? m[0] : m[1], hay: terms.join(' ').toLowerCase() });
    });
  });
  return out;
}

function docsFillList(q) {
  var list = document.getElementById('ds-list');
  if (!list) return;
  var term = String(q || '').trim().toLowerCase();
  var rows = docsIndex().filter(function (r) { return !term || r.hay.indexOf(term) >= 0; });
  var lastGroup = '';
  list.innerHTML = rows.length ? rows.map(function (r, i) {
    var head = r.group !== lastGroup ? '<div class="g">' + esc(r.group) + '</div>' : '';
    lastGroup = r.group;
    return head + '<a href="#/docs/' + r.slug + '" data-ds-hit="' + i + '"' + (i === 0 ? ' class="hot"' : '') + '>' + esc(r.title) + '</a>';
  }).join('') : '<div class="g">' + (lang === 'zh' ? '没有匹配的页面' : 'No matching page') + '</div>';
}

function docsOpen(open) {
  var dlg = document.getElementById('ds-dlg');
  if (!dlg) return;
  dlg.classList.toggle('on', !!open);
  if (open) {
    var q = document.getElementById('ds-q');
    if (q) { q.value = ''; q.focus(); }
    docsFillList('');
  }
}

  window.addEventListener('hashchange', route);

  /* ---- 访客心跳（需求书 §6.2）-------------------------------------------
     为什么必须有：服务端只在**页面加载**时记一条 track_visitor，而本站是
     hash 路由的 SPA —— 站内换页不刷新，不产生新记录；在线判定又是
     `last_seen_at > now - 90s`。没有心跳的结果就是：人明明开着页面，
     90 秒后一律判成离线。2026-10-23 实测：管理员自己在线，后台却显示
     「当前没有在线访客」—— 就是这个原因，不是抓取不准，是根本没有心跳。

     会话 id 存 sessionStorage：同一标签页持续访问算一个人，新标签页算
     另一个人；服务端另有「IP+UA 哈希」兜底，两者互补。
     `document.hidden` 时不发 —— 后台标签页不该算"在线"。 */
  (function visitorHeartbeat() {
    if (window.__mnHeartbeat) return;
    window.__mnHeartbeat = 1;
    var KEY = 'mn-vsid', sid = '';
    try {
      sid = sessionStorage.getItem(KEY) || '';
      if (!sid) {
        sid = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(KEY, sid);
      }
    } catch (e) { sid = 'v-' + Date.now().toString(36); }

    var last = Date.now();
    function currentPage() {
      var h = (location.hash || '').replace(/^#/, '');
      return (h || (location.pathname + location.search) || '/').slice(0, 190);
    }
    function beat() {
      var now = Date.now();
      var dwell = Math.max(0, Math.min(3600, Math.round((now - last) / 1000)));
      last = now;
      var payload = JSON.stringify({
        session_id: sid, page_path: currentPage(), dwell_seconds: dwell
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/track/heartbeat',
            new Blob([payload], { type: 'application/json' }));
          return;
        }
      } catch (e) { /* 落到 fetch */ }
      try {
        fetch('/api/track/heartbeat', {
          method: 'POST', credentials: 'same-origin', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: payload
        })['catch'](function () {});
      } catch (e) { /* 心跳失败绝不能影响页面 */ }
    }
    beat();                                          /* 进站立刻记一条 */
    setInterval(function () { if (!document.hidden) beat(); }, 30000);
    window.addEventListener('hashchange', beat);      /* 站内切页 */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) beat();                   /* 切回标签页立刻刷新 */
    });
  })();

  /* ask what sign-up can offer before the first paint of the login page */
  api('/api/auth/methods').then(function (r) {
    if (r.ok && r.body) ACCT.mail = r.body;
    if (currentPath() === 'login') renderAccount();
  });

  /* Ctrl+K anywhere on the documentation site opens its search box */
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('docs')) return;
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      docsOpen(true);
      return;
    }
    if (e.key === 'Escape') { docsOpen(false); return; }
    if (e.key === 'Enter' && document.getElementById('ds-q') === document.activeElement) {
      var hit = document.querySelector('#ds-list a');
      if (hit) hit.click();
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'ds-q') docsFillList(e.target.value);
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-ds-open]')) { docsOpen(true); return; }
    if (t.closest('#ds-dlg') && !t.closest('.ds-dlg-in')) { docsOpen(false); return; }
    var lng = t.closest('[data-ds-lang]');
    if (lng) { setLang(lang === 'zh' ? 'en' : 'zh'); return; }
    var anc = t.closest('[data-ds-anchor]');
    if (anc) {
      e.preventDefault();
      var el = document.getElementById(anc.getAttribute('data-ds-anchor'));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  /* ------------------------------------------------------------------ *
   *  控制台桥（Console v9）
   *
   *  assets/console.js 是独立文件、独立缓存，它需要复用站点已经做好的
   *  会话、请求、提示、图标、主题与语言。这里只暴露**这些**，不暴露内部
   *  状态对象 —— 接口越窄，控制台越不可能把落地页搞坏。
   *  SESSION / lang / themePref 都是可变的，所以用函数取当前值，不用快照。
   * ------------------------------------------------------------------ */
  /* 名字必须是 MNSite：window.MN 已被下面的站点模块（后台管理/内容配置）占用，
     覆盖它会让后台整块失效。两个模块各用各的命名空间。 */
  window.MNSite = {
    api: api,
    esc: esc,
    toast: toast,
    icons: icons,
    when: when,
    dz: function (zh, en) { return lang === 'zh' ? zh : en; },
    lang: function () { return lang; },
    setLang: function (l) { try { setLang(l); } catch (e) {} },
    setTheme: setTheme,
    theme: function () { return themePref; },
    session: function () { return SESSION; },
    isAdmin: isAdmin,
    repo: REPO
  };

  initDust();
  renderAll();
  route();
  fetchStar();
  onScroll();
})();
