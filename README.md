# WOLFPAK AI

**Pool your machines into one AI cluster. Open source. Run anywhere. Own your inference.**

WOLFPAK lets a small group — a family, a startup, a few friends — pool their laptops and desktops into one private AI cluster. Everyone installs the CLI, someone creates a pack, shares an invite link, and the machines form a mesh.

## Features

- **Private AI Mesh** — Your machines form a P2P network via libp2p. No central server.
- **Smart Inference Routing** — Queries route to whichever member has the best model loaded.
- **Shared API Providers** — Pool OpenRouter, Groq, Together, OpenAI, or Anthropic keys with per-member budgets.
- **Any GGUF Model** — Auto-detect your hardware, pull the optimal model from HuggingFace.
- **OpenAI-Compatible API** — Drop-in replacement at `localhost:8787/v1/chat/completions`.
- **Encrypted Pack Capsules** — AES-256-GCM encrypted backup/restore of entire pack state.
- **Works Everywhere** — Mac, Linux, Windows. Node.js 18+.

## Quick Start

```bash
# Install
npm install -g wolfpak-ai

# Initialize your node
wolfpak init --name "my-laptop"

# Create a pack (you become the Alpha)
wolfpak create my-pack

# Share the invite link + encryption key with your crew
# They join with:
wolfpak join <invite-link> -k <encryption-key>

# Start the node
wolfpak start

# Your AI is now at http://localhost:8787/v1/chat/completions
```

## Commands

| Command | Description |
|---------|-------------|
| `wolfpak init` | Initialize WOLFPAK on this machine |
| `wolfpak create <name>` | Create a new pack (become Alpha) |
| `wolfpak join <invite> -k <key>` | Join a pack via invite link |
| `wolfpak start` | Start node (mesh + API server) |
| `wolfpak status` | Show node and pack status |
| `wolfpak chat` | Interactive chat mode |
| `wolfpak models list` | List downloaded models |
| `wolfpak models pull <url>` | Download a GGUF model |
| `wolfpak models load <name>` | Load a model for inference |
| `wolfpak models recommend` | Show recommended model for your hardware |
| `wolfpak provider add <type> <name> <key>` | Add shared API provider |
| `wolfpak provider list` | List shared providers |
| `wolfpak invite` | Show pack invite link |
| `wolfpak capsule create` | Encrypted pack backup |
| `wolfpak capsule restore <file> -k <key>` | Restore from backup |
| `wolfpak system-info` | Show hardware info |
| `wolfpak kill` | Stop the node |

## Architecture

```
┌─────────────────────────────────────────────┐
│                 WOLFPAK NODE                │
│                                             │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐ │
│  │   CLI     │  │ API Srv  │  │ Inference│ │
│  │ Commander │  │ :8787/v1 │  │  Engine  │ │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘ │
│        │              │              │       │
│  ┌─────┴──────────────┴──────────────┴─────┐ │
│  │           Pack Manager                  │ │
│  │  Identity | Providers | Capsules        │ │
│  └─────────────────┬───────────────────────┘ │
│                    │                         │
│  ┌─────────────────┴───────────────────────┐ │
│  │         libp2p Mesh Network             │ │
│  │  GossipSub | mDNS | DHT | Noise        │ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
          │                    │
     ┌────┴────┐          ┌───┴────┐
     │  Peer A │          │ Peer B │
     │ (GPU)   │          │ (CPU)  │
     └─────────┘          └────────┘
```

## How Inference Routing Works

1. **Local first** — If this node has a model loaded, use it
2. **Pack mesh** — Broadcast to pack, route to best available GPU
3. **Shared providers** — Fall back to pooled API keys (OpenRouter, Groq, etc.)

## Shared Providers

Pool API keys across your pack. Each member can contribute keys with budget caps:

```bash
# Add OpenRouter key with $50/month budget
wolfpak provider add openrouter my-key sk-or-... -b 50

# Add Groq key (unlimited)
wolfpak provider add groq fast-inference gsk_...

# Add Anthropic key
wolfpak provider add anthropic claude sk-ant-...
```

## Security

- **Ed25519 identity** — Each node gets a persistent cryptographic identity
- **Noise encryption** — All mesh traffic is encrypted
- **AES-256-GCM** — Pack capsules use military-grade encryption
- **No central server** — Your data never leaves your pack

## Tech Stack

- **TypeScript** — Full type safety
- **libp2p** — P2P networking (GossipSub + mDNS + Kademlia DHT)
- **node-llama-cpp** — Local GGUF model inference
- **Express** — OpenAI-compatible API server
- **SQLite** — Local state management

## License

MIT — Use it, fork it, build on it. Free forever.

---

**Built by [WOLFPAK AI](https://github.com/wolfpak-ai)**
