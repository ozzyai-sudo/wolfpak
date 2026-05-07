---
title: "WOLFPAK AI — CLI Command Reference"
subtitle: "v0.1.0 | Pool your machines. Own your AI."
author: "WOLFPAK AI"
date: "May 2026"
geometry: margin=1in
fontsize: 11pt
colorlinks: true
linkcolor: blue
header-includes:
  - \usepackage{fancyhdr}
  - \pagestyle{fancy}
  - \fancyhead[L]{WOLFPAK AI}
  - \fancyhead[R]{CLI Reference v0.1.0}
  - \fancyfoot[C]{\thepage}
---

\newpage

# What is WOLFPAK AI?

WOLFPAK AI lets a small group — a family, a startup, a few friends — pool their laptops and desktops into one private AI cluster called a **pack**.

Everyone installs the CLI, someone creates a pack, shares an invite link, and the machines form a peer-to-peer mesh network. Queries route to whichever member has the best model loaded, or fall back to shared API providers.

**Key Features:**

- P2P mesh networking via libp2p (no central server)
- Local GGUF model inference via node-llama-cpp
- OpenAI-compatible API at `localhost:8787/v1`
- Shared API providers with per-member budgets
- AES-256-GCM encrypted pack capsule backups
- Ed25519 cryptographic identity per node

---

# Installation

```bash
# Install globally via npm
npm install -g wolfpak-ai

# Or clone and run from source
git clone https://github.com/ozzyai-sudo/wolfpak.git
cd wolfpak
npm install
npm run dev -- <command>
```

**Requirements:** Node.js 18+ (20+ recommended)

---

# Quick Start

```bash
# 1. Initialize your node
wolfpak init --name "my-laptop"

# 2. Create a pack
wolfpak create my-pack

# 3. Share the invite link + encryption key with your crew

# 4. They join with:
wolfpak join <invite-link> -k <encryption-key>

# 5. Start the node
wolfpak start

# 6. AI is now live at http://localhost:8787/v1/chat/completions
```

\newpage

# Command Reference

## wolfpak init

Initialize WOLFPAK on this machine. Creates a persistent Ed25519 identity stored at `~/.wolfpak/identity.json`.

```
wolfpak init [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `-n, --name <name>` | Display name for this node (default: auto-generated) |

**Example:**

```bash
wolfpak init --name "office-desktop"
```

**Output:**

```
✓ Identity created
  Peer ID:  wpk_70dad0809a3db615c7d88a5944dc8f5a
  Name:     office-desktop
  Config:   /home/user/.wolfpak
```

---

## wolfpak create

Create a new pack. You become the **Alpha** (leader) of the pack. Generates an invite link and encryption key to share with others.

```
wolfpak create <name>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `name` | Name for your pack |

**Example:**

```bash
wolfpak create my-startup
```

**Output:**

```
✓ Pack "my-startup" created
  Pack ID:  pack_9293f5307d05e9f1dce10a1f
  Role:     Alpha (leader)
  Members:  1

Share this invite link with your pack:
wolfpak://join/eyJwYWNr...

Encryption key (share securely — needed to join):
G76ODWsRSx+oeT4JFU75ir/fMFEUiYdglqCy7iWy+4A=
```

**Important:** Share the invite link and encryption key through separate secure channels.

\newpage

## wolfpak join

Join an existing pack using an invite link and encryption key.

```
wolfpak join <invite> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `invite` | The `wolfpak://join/...` invite link |

**Options:**

| Flag | Description |
|------|-------------|
| `-k, --key <key>` | Pack encryption key (required) |

**Example:**

```bash
wolfpak join wolfpak://join/eyJwYWNr... -k G76ODWsRSx+oeT4JFU75ir...
```

---

## wolfpak start

Start the WOLFPAK node. This launches both the P2P mesh network and the OpenAI-compatible API server.

```
wolfpak start [options]
```

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --port <port>` | Mesh network port | `4002` |
| `-a, --api-port <port>` | API server port | `8787` |

**Example:**

```bash
wolfpak start --port 4002 --api-port 8787
```

**What happens:**

1. Mesh network starts on the specified port
2. Node discovers peers via mDNS (local network) and DHT
3. API server starts at `http://localhost:<api-port>/v1/`
4. Node announces itself to the pack

**API Endpoints (once running):**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Node health check |
| `/v1/chat/completions` | POST | Chat completions (OpenAI-compatible) |
| `/v1/models` | GET | List available models |
| `/v1/pack/status` | GET | Pack status and members |
| `/v1/pack/members` | GET | List pack members |

\newpage

## wolfpak status

Show the full status of your node, pack, members, providers, and models.

```
wolfpak status
```

**Example Output:**

```
  WOLFPAK STATUS

  Node
    Peer ID:      wpk_70dad0809a3db615c7d88a5944dc8f5a
    Name:         ozzy-macbook
    RAM:          32GB
    Platform:     darwin x64
    Mesh:         ONLINE

  Pack
    Name:         enlite-pack
    Pack ID:      pack_9293f5307d05e9f1dce10a1f
    Members:      3
    Providers:    2
    Routing:      best-gpu

  Members
    α ● ozzy-macbook (you) — relay, storage, inference, embedding
    • ● vps-main — relay, storage, inference, embedding
    • ● imac-backup — relay, storage, embedding

  Models
    gemma-3-27b-Q4_K_M (16.1GB, Q4_K_M) [LOADED]
```

---

## wolfpak chat

Start an interactive chat session. Uses the inference routing system: local model first, then pack mesh, then shared providers.

```
wolfpak chat
```

**Example:**

```
  WOLFPAK Chat
  Type your message. Ctrl+C to exit.

  you > What is the capital of France?
  ai  > The capital of France is Paris.
         [local | gemma-3-27b-Q4_K_M]
```

Type `exit` or `quit` or press `Ctrl+C` to end the session.

\newpage

## wolfpak models

Manage AI models (GGUF format). Subcommands:

### wolfpak models list

List all downloaded models in `~/.wolfpak/models/`.

```
wolfpak models list
```

### wolfpak models pull

Download a GGUF model from a URL (typically HuggingFace).

```
wolfpak models pull <url>
```

**Example:**

```bash
wolfpak models pull https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf
```

### wolfpak models load

Load a downloaded model into memory for local inference.

```
wolfpak models load <name>
```

**Example:**

```bash
wolfpak models load gemma-3-4b-it-Q4_K_M
```

### wolfpak models recommend

Auto-detect your hardware and recommend the optimal model.

```
wolfpak models recommend
```

**Recommended Models by RAM:**

| RAM | Recommended Model |
|-----|------------------|
| 4 GB | Gemma 3 1B (Q4_K_M) |
| 8 GB | Gemma 3 4B (Q4_K_M) |
| 16 GB | Gemma 3 12B (Q4_K_M) |
| 32 GB | Gemma 3 27B (Q4_K_M) |
| 64 GB+ | Qwen 2.5 32B (Q4_K_M) |

\newpage

## wolfpak provider

Manage shared API providers. Pool API keys across your pack so everyone can use them.

### wolfpak provider add

Add a shared API provider to the pack.

```
wolfpak provider add <type> <name> <apiKey> [options]
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `type` | Provider type: `openrouter`, `groq`, `together`, `openai`, `anthropic` |
| `name` | Friendly name for this provider |
| `apiKey` | The API key |

**Options:**

| Flag | Description | Default |
|------|-------------|---------|
| `-b, --budget <amount>` | Monthly budget in dollars (0 = unlimited) | `0` |

**Examples:**

```bash
# Add OpenRouter with $50/month budget
wolfpak provider add openrouter my-key sk-or-... -b 50

# Add Groq (unlimited)
wolfpak provider add groq fast-llm gsk_...

# Add Anthropic
wolfpak provider add anthropic claude sk-ant-...
```

### wolfpak provider list

List all shared providers in the pack.

```
wolfpak provider list
```

---

## wolfpak invite

Show the invite link and encryption key for the current pack.

```
wolfpak invite
```

Share the invite link publicly and the encryption key privately (separate channels).

\newpage

## wolfpak capsule

Encrypted backup and restore of pack state.

### wolfpak capsule create

Create an AES-256-GCM encrypted backup of the entire pack (identity, members, providers, settings). Saved as a `.wpk` file.

```
wolfpak capsule create [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output file path (default: current directory) |

**Example:**

```bash
wolfpak capsule create -o ~/backups/my-pack.wpk
```

### wolfpak capsule restore

Restore a pack from an encrypted capsule backup.

```
wolfpak capsule restore <file> [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `-k, --key <key>` | Pack encryption key (required) |

**Example:**

```bash
wolfpak capsule restore ~/backups/my-pack.wpk -k G76ODWsRSx+oeT4JFU75ir...
```

---

## wolfpak system-info

Show hardware information and recommended capabilities.

```
wolfpak system-info
```

---

## wolfpak kill

Stop the WOLFPAK node (mesh and API server).

```
wolfpak kill
```

\newpage

# Using the API

Once `wolfpak start` is running, you have an OpenAI-compatible API at `localhost:8787`. Use it with any OpenAI client library:

### curl

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:8787/v1", api_key="wolfpak")

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### JavaScript

```javascript
const response = await fetch('http://localhost:8787/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'auto',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});
const data = await response.json();
console.log(data.choices[0].message.content);
```

\newpage

# How Inference Routing Works

WOLFPAK uses a 3-tier routing strategy:

```
Request comes in
    │
    ▼
┌─────────────────────┐
│ 1. Local Model?     │──── Yes ──▶ Run locally (fastest)
│    (GGUF loaded)    │
└─────────┬───────────┘
          │ No
          ▼
┌─────────────────────┐
│ 2. Pack Mesh?       │──── Yes ──▶ Route to best GPU peer
│    (peer has model)  │
└─────────┬───────────┘
          │ No
          ▼
┌─────────────────────┐
│ 3. Shared Provider? │──── Yes ──▶ Use pooled API key
│    (API key exists)  │
└─────────┬───────────┘
          │ No
          ▼
      Error: No inference source available
```

# Security

| Layer | Technology |
|-------|-----------|
| Node Identity | Ed25519 keypairs |
| Mesh Encryption | Noise protocol (all traffic) |
| Pack Capsules | AES-256-GCM |
| Peer Discovery | mDNS (local) + Kademlia DHT |
| Message Passing | GossipSub (encrypted) |

# File Locations

| File | Location |
|------|----------|
| Identity | `~/.wolfpak/identity.json` |
| Pack config | `~/.wolfpak/pack.json` |
| Models | `~/.wolfpak/models/` |

---

**GitHub:** [github.com/ozzyai-sudo/wolfpak](https://github.com/ozzyai-sudo/wolfpak)

**License:** MIT — Free forever. Use it, fork it, build on it.
