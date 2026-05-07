# WOLFPAK AI — Getting Started Guide

Pool your machines into one private AI cluster. This guide walks you through everything step by step.

---

## What is WOLFPAK AI?

WOLFPAK lets you and your friends/team combine your computers into one shared AI system. Instead of paying for expensive cloud AI, you run models locally across your machines. Queries automatically route to whichever machine has the best model loaded.

**Think of it like this:** You have a MacBook, your friend has a gaming PC with a GPU, and you have a VPS server. WOLFPAK connects all three into one AI cluster that anyone in the group can use.

---

## Step 1: Install WOLFPAK

### Option A: Install from npm (easiest)
```bash
npm install -g wolfpak-ai
```

### Option B: Install from source
```bash
git clone https://github.com/ozzyai-sudo/wolfpak.git
cd wolfpak
npm install
```

If you installed from source, replace `wolfpak` with `npm run wolfpak --` in all commands below.

**Requirements:** Node.js 18 or higher.

---

## Step 2: Initialize Your Node

Every machine needs its own identity. Run this once per machine:

```bash
wolfpak init --name "my-laptop"
```

Pick a name that identifies this machine (e.g., "office-desktop", "gaming-pc", "vps-server").

**What happens:**
- Creates a cryptographic identity (Ed25519 keypair)
- Stores config at `~/.wolfpak/`
- This identity is permanent for this machine

---

## Step 3: Create a Pack

One person creates the pack. Everyone else joins it.

### If you're the leader (Alpha):

```bash
wolfpak create my-team
```

This outputs two things you need to share:

1. **Invite link** — `wolfpak://join/eyJwYWNr...` (safe to share publicly)
2. **Encryption key** — `G76ODWsRSx+oeT4J...` (share privately, separate channel)

**Important:** Share the invite link and encryption key through DIFFERENT channels. For example, post the invite link in a group chat but DM the encryption key.

### If you're joining someone's pack:

```bash
wolfpak join wolfpak://join/eyJwYWNr... -k G76ODWsRSx+oeT4J...
```

Replace the invite link and key with what the Alpha shared with you.

---

## Step 4: Start Your Node

```bash
wolfpak start
```

**What happens:**
- Starts the P2P mesh network (discovers other pack members)
- Starts the AI API server at `http://localhost:8787`
- Your machine is now part of the cluster

Leave this running. Press `Ctrl+C` to stop.

### Custom ports (optional):
```bash
wolfpak start --port 4002 --api-port 8787
```

---

## Step 5: Check Status

```bash
wolfpak status
```

This shows:
- Your node info (name, RAM, platform)
- Pack info (members, who's online)
- Downloaded models
- Connected peers

---

## Step 6: Add an AI Model (Optional)

If you want to run AI locally on your machine (instead of using API providers), download a model:

### See what's recommended for your hardware:
```bash
wolfpak models recommend
```

### Download a model from HuggingFace:
```bash
wolfpak models pull https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf
```

### Load the model:
```bash
wolfpak models load gemma-3-4b-it-Q4_K_M
```

### Recommended models by RAM:

| Your RAM | Model | Download Size |
|----------|-------|--------------|
| 4 GB | Gemma 3 1B | ~1 GB |
| 8 GB | Gemma 3 4B | ~3 GB |
| 16 GB | Gemma 3 12B | ~7 GB |
| 32 GB | Gemma 3 27B | ~15 GB |
| 64 GB+ | Qwen 2.5 32B | ~19 GB |

---

## Step 7: Add Shared API Providers (Optional)

Don't have a GPU? No problem. Pool API keys from services like OpenRouter, Groq, or Anthropic:

```bash
# Add an OpenRouter key with $50/month budget
wolfpak provider add openrouter my-key sk-or-v1-abc123 -b 50

# Add a Groq key (unlimited)
wolfpak provider add groq fast-llm gsk_abc123

# Add an Anthropic key
wolfpak provider add anthropic claude sk-ant-abc123
```

Everyone in the pack can use these shared keys. Budget limits prevent overspending.

### See all providers:
```bash
wolfpak provider list
```

---

## Step 8: Use Your AI Cluster

### Chat in the terminal:
```bash
wolfpak chat
```

Type messages and get responses. Type `exit` to quit.

### Use the API (for apps):

Your cluster exposes an OpenAI-compatible API at `http://localhost:8787/v1/chat/completions`.

**curl:**
```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello!"}]}'
```

**Python:**
```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8787/v1", api_key="wolfpak")
response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

**JavaScript:**
```javascript
const res = await fetch('http://localhost:8787/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'auto',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
const data = await res.json();
console.log(data.choices[0].message.content);
```

### Use the Desktop App:

Open `http://localhost:8787/app/` in your browser for the full Command Center with:
- Dashboard with stats
- Pack member management
- Provider management
- Model management
- Chat interface
- Inference logs

---

## Step 9: Invite More People

### Show your pack's invite info:
```bash
wolfpak invite
```

### Send them this guide and the invite link + key.

Each person just needs to:
1. Install WOLFPAK (`npm install -g wolfpak-ai`)
2. Init their node (`wolfpak init --name "their-pc"`)
3. Join the pack (`wolfpak join <link> -k <key>`)
4. Start their node (`wolfpak start`)

That's it. Their machine joins the mesh automatically.

---

## Step 10: Backup Your Pack

Create an encrypted backup of your entire pack state:

```bash
wolfpak capsule create
```

This creates a `.wpk` file encrypted with AES-256-GCM. To restore:

```bash
wolfpak capsule restore my-pack.wpk -k <encryption-key>
```

---

## How Inference Routing Works

When you send a message, WOLFPAK tries three things in order:

```
1. LOCAL MODEL  →  Is a model loaded on this machine? Use it. (fastest)
         ↓ no
2. PACK MESH    →  Does another pack member have a model? Route to them.
         ↓ no
3. API PROVIDER →  Use a shared API key (OpenRouter, Groq, etc.)
         ↓ no
4. ERROR        →  "No inference source available"
```

This means you always get the fastest possible response. Local is instant, mesh adds a bit of latency, and API providers work as a fallback.

---

## Quick Reference

| What you want to do | Command |
|---------------------|---------|
| Initialize | `wolfpak init --name "my-pc"` |
| Create a pack | `wolfpak create my-pack` |
| Join a pack | `wolfpak join <link> -k <key>` |
| Start the node | `wolfpak start` |
| Check status | `wolfpak status` |
| Chat with AI | `wolfpak chat` |
| Download a model | `wolfpak models pull <url>` |
| Load a model | `wolfpak models load <name>` |
| See recommended model | `wolfpak models recommend` |
| Add API provider | `wolfpak provider add <type> <name> <key>` |
| Show invite link | `wolfpak invite` |
| Create backup | `wolfpak capsule create` |
| Restore backup | `wolfpak capsule restore <file> -k <key>` |
| System info | `wolfpak system-info` |
| Stop the node | `wolfpak kill` or `Ctrl+C` |

---

## Troubleshooting

**"No inference source available"**
You need either a loaded model or a shared provider. Run `wolfpak models recommend` or add a provider.

**"Not initialized"**
Run `wolfpak init` first.

**"No active pack"**
Run `wolfpak create <name>` or `wolfpak join <link> -k <key>`.

**Port already in use**
Use a different port: `wolfpak start --port 4003 --api-port 8788`

**Can't find peers on the network**
Peers are discovered via mDNS on local networks. For remote machines, they'll connect through the DHT (may take a minute).

---

## Security

- All mesh traffic is encrypted (Noise protocol)
- Pack backups use AES-256-GCM encryption
- Each node has a unique Ed25519 identity
- No central server — everything is peer-to-peer
- API keys are stored locally in `~/.wolfpak/pack.json`

---

**GitHub:** [github.com/ozzyai-sudo/wolfpak](https://github.com/ozzyai-sudo/wolfpak)
**License:** MIT — Free forever.
