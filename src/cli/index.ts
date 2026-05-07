#!/usr/bin/env node
/**
 * WOLFPAK AI — CLI Entry Point
 * Pool your machines into one AI cluster.
 * Open source. Run anywhere. Own your inference.
 */
import '../polyfills.js';
import { Command } from 'commander';
import chalk from 'chalk';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { getOrCreateIdentity, loadIdentity, getWolfpakDir } from '../core/identity.js';
import { createPack, loadPack, getInviteLink, parseInvite, joinPack, addProvider, savePack } from '../core/pack.js';
import { startMesh, stopMesh, getMesh, announcePresence } from '../network/mesh.js';
import { startAPI, stopAPI } from '../api/server.js';
import { listModels, loadModel, recommendedModelTier, infer, unloadModel, ensureModelsDir } from '../inference/engine.js';
import { createCapsule, restoreCapsule } from '../core/capsule.js';
import { getOrCreateSecurityConfig, regenerateToken, approvePeer as approveP, rejectPeer as rejectP } from '../core/security.js';

const VERSION = '0.1.0';

const WOLF_BANNER = `
${chalk.bold.hex('#8B5CF6')('██╗    ██╗ ██████╗ ██╗     ███████╗██████╗  █████╗ ██╗  ██╗')}
${chalk.bold.hex('#7C3AED')('██║    ██║██╔═══██╗██║     ██╔════╝██╔══██╗██╔══██╗██║ ██╔╝')}
${chalk.bold.hex('#6D28D9')('██║ █╗ ██║██║   ██║██║     █████╗  ██████╔╝███████║█████╔╝ ')}
${chalk.bold.hex('#5B21B6')('██║███╗██║██║   ██║██║     ██╔══╝  ██╔═══╝ ██╔══██║██╔═██╗ ')}
${chalk.bold.hex('#4C1D95')('╚███╔███╔╝╚██████╔╝███████╗██║     ██║     ██║  ██║██║  ██╗')}
${chalk.bold.hex('#3B0764')(' ╚══╝╚══╝  ╚═════╝ ╚══════╝╚═╝     ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝')}
${chalk.gray('                    Pool your machines. Own your AI.')}
`;

const program = new Command();

program
  .name('wolfpak')
  .description('WOLFPAK AI — Pool your machines into one AI cluster')
  .version(VERSION);

// ─── INIT ───────────────────────────────────────────────────────
program
  .command('init')
  .description('Initialize WOLFPAK on this machine')
  .option('-n, --name <name>', 'Display name for this node')
  .action((opts) => {
    console.log(WOLF_BANNER);
    const identity = getOrCreateIdentity(opts.name);
    console.log(chalk.green('✓ Identity created'));
    console.log(chalk.gray(`  Peer ID:  ${identity.peerId}`));
    console.log(chalk.gray(`  Name:     ${identity.displayName}`));
    console.log(chalk.gray(`  Config:   ${getWolfpakDir()}`));
    console.log();
    console.log(chalk.hex('#8B5CF6')('Next: wolfpak create <pack-name>  or  wolfpak join <invite>'));
  });

// ─── CREATE PACK ────────────────────────────────────────────────
program
  .command('create <name>')
  .description('Create a new pack (you become the Alpha)')
  .action((name) => {
    const pack = createPack(name);
    const invite = getInviteLink(pack);

    console.log(chalk.green(`✓ Pack "${name}" created`));
    console.log(chalk.gray(`  Pack ID:  ${pack.packId}`));
    console.log(chalk.gray(`  Role:     Alpha (leader)`));
    console.log(chalk.gray(`  Members:  1`));
    console.log();
    console.log(chalk.hex('#8B5CF6')('Share this invite link with your pack:'));
    console.log(chalk.white.bold(invite));
    console.log();
    console.log(chalk.hex('#8B5CF6')('Encryption key (share securely — needed to join):'));
    console.log(chalk.white.bold(pack.encryptionKey));
    console.log();
    console.log(chalk.gray('Next: wolfpak start'));
  });

// ─── JOIN PACK ──────────────────────────────────────────────────
program
  .command('join <invite>')
  .description('Join a pack using an invite link')
  .option('-k, --key <key>', 'Pack encryption key')
  .action((invite, opts) => {
    try {
      const inviteData = parseInvite(invite);
      if (!opts.key) {
        console.log(chalk.red('✗ Encryption key required. Use: wolfpak join <invite> -k <key>'));
        return;
      }
      const pack = joinPack(inviteData, opts.key);
      console.log(chalk.green(`✓ Joined pack "${pack.name}"`));
      console.log(chalk.gray(`  Pack ID:  ${pack.packId}`));
      console.log(chalk.gray(`  Role:     Member`));
      console.log();
      console.log(chalk.gray('Next: wolfpak start'));
    } catch (err: any) {
      console.log(chalk.red(`✗ Failed to join: ${err.message}`));
    }
  });

// ─── START ──────────────────────────────────────────────────────
program
  .command('start')
  .description('Start the WOLFPAK node (mesh + API server)')
  .option('-p, --port <port>', 'Mesh port', '4002')
  .option('-a, --api-port <port>', 'API server port', '8787')
  .action(async (opts) => {
    console.log(WOLF_BANNER);

    const identity = loadIdentity();
    if (!identity) {
      console.log(chalk.red('✗ Not initialized. Run: wolfpak init'));
      return;
    }

    const pack = loadPack();

    console.log(chalk.hex('#8B5CF6')(`Node:  ${identity.displayName} (${identity.peerId})`));
    console.log(chalk.hex('#8B5CF6')(`Pack:  ${pack?.name || 'None (solo mode)'}`));
    console.log();

    try {
      // Start mesh network
      console.log(chalk.gray('Starting mesh network...'));
      await startMesh(parseInt(opts.port), {
        onPeerJoin: (peerId) => {
          console.log(chalk.green(`  + Peer joined: ${peerId.slice(0, 16)}...`));
        },
        onPeerLeave: (peerId) => {
          console.log(chalk.yellow(`  - Peer left: ${peerId.slice(0, 16)}...`));
        },
        onInferenceRequest: async (req) => {
          console.log(chalk.cyan(`  ⚡ Inference request from pack`));
          const result = await infer({ messages: [{ role: 'user', content: req.prompt }] });
          return result.choices[0].message.content;
        },
      });

      // Start API server
      console.log(chalk.gray('Starting API server...'));
      await startAPI(parseInt(opts.apiPort));

      console.log();
      const secConfig = getOrCreateSecurityConfig();
      console.log(chalk.green.bold('✓ WOLFPAK is running'));
      console.log(chalk.gray(`  API:   http://localhost:${opts.apiPort}/v1/chat/completions`));
      console.log(chalk.gray(`  Mesh:  port ${opts.port}`));
      console.log(chalk.hex('#F59E0B')(`  Token: ${secConfig.apiToken}`));
      console.log(chalk.gray(`  Auth:  Authorization: Bearer <token>`));
      console.log(chalk.gray(`  Ctrl+C to stop`));

      // Graceful shutdown
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\nShutting down...'));
        await stopAPI();
        await stopMesh();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await stopAPI();
        await stopMesh();
        process.exit(0);
      });
    } catch (err: any) {
      console.error(chalk.red(`✗ Failed to start: ${err.message}`));
      process.exit(1);
    }
  });

// ─── STATUS ─────────────────────────────────────────────────────
program
  .command('status')
  .description('Show node and pack status')
  .action(() => {
    const identity = loadIdentity();
    const pack = loadPack();
    const mesh = getMesh();
    const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));

    console.log(chalk.hex('#8B5CF6').bold('\n  WOLFPAK STATUS\n'));

    if (!identity) {
      console.log(chalk.red('  Not initialized. Run: wolfpak init'));
      return;
    }

    console.log(chalk.white('  Node'));
    console.log(chalk.gray(`    Peer ID:      ${identity.peerId}`));
    console.log(chalk.gray(`    Name:         ${identity.displayName}`));
    console.log(chalk.gray(`    RAM:          ${totalGB}GB`));
    console.log(chalk.gray(`    Platform:     ${os.platform()} ${os.arch()}`));
    console.log(chalk.gray(`    Mesh:         ${mesh ? chalk.green('ONLINE') : chalk.red('OFFLINE')}`));
    console.log();

    if (pack) {
      console.log(chalk.white('  Pack'));
      console.log(chalk.gray(`    Name:         ${pack.name}`));
      console.log(chalk.gray(`    Pack ID:      ${pack.packId}`));
      console.log(chalk.gray(`    Members:      ${pack.members.length}`));
      console.log(chalk.gray(`    Providers:    ${pack.providers.length}`));
      console.log(chalk.gray(`    Routing:      ${pack.settings.routingStrategy}`));
      console.log();

      console.log(chalk.white('  Members'));
      for (const m of pack.members) {
        const role = m.role === 'alpha' ? chalk.hex('#FFD700')('α') : chalk.gray('•');
        const online = m.lastSeen && (Date.now() - new Date(m.lastSeen).getTime()) < 60000 ? chalk.green('●') : chalk.red('●');
        const isMe = m.peerId === identity.peerId ? chalk.cyan(' (you)') : '';
        console.log(chalk.gray(`    ${role} ${online} ${m.displayName}${isMe} — ${m.capabilities.join(', ')}`));
      }
      console.log();

      if (pack.providers.length > 0) {
        console.log(chalk.white('  Shared Providers'));
        for (const p of pack.providers) {
          const budget = p.monthlyBudget > 0 ? `$${p.usedThisMonth}/$${p.monthlyBudget}` : 'unlimited';
          console.log(chalk.gray(`    ${p.type}/${p.name} — ${budget}`));
        }
        console.log();
      }
    } else {
      console.log(chalk.gray('  No pack active. Create or join one:'));
      console.log(chalk.gray('    wolfpak create <name>'));
      console.log(chalk.gray('    wolfpak join <invite> -k <key>'));
      console.log();
    }

    const models = listModels();
    console.log(chalk.white('  Models'));
    if (models.length === 0) {
      const rec = recommendedModelTier();
      console.log(chalk.gray(`    No models downloaded.`));
      console.log(chalk.gray(`    Recommended for ${rec.vram}: ${rec.recommended}`));
      console.log(chalk.gray(`    Download: wolfpak models pull <url>`));
    } else {
      for (const m of models) {
        const loaded = m.loaded ? chalk.green(' [LOADED]') : '';
        const sizeGB = (m.size / (1024 * 1024 * 1024)).toFixed(1);
        console.log(chalk.gray(`    ${m.name} (${sizeGB}GB, ${m.quantization})${loaded}`));
      }
    }
    console.log();
  });

// ─── MODELS ─────────────────────────────────────────────────────
const modelsCmd = program
  .command('models')
  .description('Manage AI models');

modelsCmd
  .command('list')
  .description('List downloaded models')
  .action(() => {
    const models = listModels();
    if (models.length === 0) {
      const rec = recommendedModelTier();
      console.log(chalk.gray('No models downloaded.'));
      console.log(chalk.gray(`Recommended for your system (${rec.vram}): ${rec.recommended}`));
      return;
    }
    console.log(chalk.hex('#8B5CF6').bold('\n  Downloaded Models\n'));
    for (const m of models) {
      const loaded = m.loaded ? chalk.green(' [LOADED]') : '';
      const sizeGB = (m.size / (1024 * 1024 * 1024)).toFixed(1);
      console.log(chalk.gray(`  ${m.name} (${sizeGB}GB, ${m.quantization})${loaded}`));
    }
    console.log();
  });

modelsCmd
  .command('pull <url>')
  .description('Download a GGUF model from URL')
  .action(async (url) => {
    const modelsDir = ensureModelsDir();
    const filename = url.split('/').pop() || 'model.gguf';
    const destPath = path.join(modelsDir, filename);

    console.log(chalk.gray(`Downloading ${filename}...`));
    console.log(chalk.gray(`Destination: ${destPath}`));

    try {
      execFileSync('curl', ['-L', '-o', destPath, url], { stdio: 'inherit' });
      console.log(chalk.green(`✓ Model downloaded: ${filename}`));
    } catch (err: any) {
      console.log(chalk.red(`✗ Download failed: ${err.message}`));
    }
  });

modelsCmd
  .command('load <name>')
  .description('Load a model for inference')
  .action(async (name) => {
    try {
      const filename = name.endsWith('.gguf') ? name : `${name}.gguf`;
      await loadModel(filename);
      console.log(chalk.green(`✓ Model loaded: ${name}`));
    } catch (err: any) {
      console.log(chalk.red(`✗ Failed to load: ${err.message}`));
    }
  });

modelsCmd
  .command('recommend')
  .description('Show recommended model for your hardware')
  .action(() => {
    const rec = recommendedModelTier();
    console.log(chalk.hex('#8B5CF6').bold('\n  Hardware Detection\n'));
    console.log(chalk.gray(`  System RAM:    ${rec.vram}`));
    console.log(chalk.gray(`  Recommended:   ${rec.recommended}`));
    console.log(chalk.gray(`  Platform:      ${os.platform()} ${os.arch()}`));
    console.log(chalk.gray(`  CPUs:          ${os.cpus().length}`));
    console.log();
    console.log(chalk.gray('  Download from HuggingFace:'));
    console.log(chalk.gray('  wolfpak models pull https://huggingface.co/.../model.gguf'));
    console.log();
  });

// ─── PROVIDER ───────────────────────────────────────────────────
const providerCmd = program
  .command('provider')
  .description('Manage shared API providers');

providerCmd
  .command('add <type> <name> <apiKey>')
  .description('Add a shared API provider (openrouter, groq, together, openai, anthropic)')
  .option('-b, --budget <amount>', 'Monthly budget in dollars', '0')
  .action((type, name, apiKey, opts) => {
    try {
      const identity = loadIdentity();
      if (!identity) {
        console.log(chalk.red('✗ Not initialized. Run: wolfpak init'));
        return;
      }
      addProvider({
        name,
        type: type as any,
        apiKey,
        addedBy: identity.peerId,
        monthlyBudget: parseFloat(opts.budget),
      });
      console.log(chalk.green(`✓ Provider added: ${type}/${name}`));
      console.log(chalk.gray(`  Budget: ${opts.budget === '0' ? 'unlimited' : '$' + opts.budget + '/mo'}`));
    } catch (err: any) {
      console.log(chalk.red(`✗ ${err.message}`));
    }
  });

providerCmd
  .command('list')
  .description('List shared providers')
  .action(() => {
    const pack = loadPack();
    if (!pack || pack.providers.length === 0) {
      console.log(chalk.gray('No providers configured.'));
      console.log(chalk.gray('Add one: wolfpak provider add openrouter my-key sk-...'));
      return;
    }
    console.log(chalk.hex('#8B5CF6').bold('\n  Shared Providers\n'));
    for (const p of pack.providers) {
      const budget = p.monthlyBudget > 0 ? `$${p.usedThisMonth}/$${p.monthlyBudget}` : 'unlimited';
      console.log(chalk.gray(`  ${p.type}/${p.name} — ${budget} (added by ${p.addedBy.slice(0, 12)}...)`));
    }
    console.log();
  });

// ─── CHAT ───────────────────────────────────────────────────────
program
  .command('chat')
  .description('Interactive chat with WOLFPAK AI')
  .action(async () => {
    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log(chalk.hex('#8B5CF6').bold('\n  WOLFPAK Chat'));
    console.log(chalk.gray('  Type your message. Ctrl+C to exit.\n'));

    const messages: Array<{ role: string; content: string }> = [];

    const ask = () => {
      rl.question(chalk.hex('#8B5CF6')('  you > '), async (input: string) => {
        if (!input.trim()) return ask();
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          rl.close();
          return;
        }

        messages.push({ role: 'user', content: input });

        try {
          const response = await infer({ messages });
          const reply = response.choices[0].message.content;
          messages.push({ role: 'assistant', content: reply });
          console.log(chalk.white(`  ai  > ${reply}`));
          console.log(chalk.gray(`         [${response.source} | ${response.model}]`));
          console.log();
        } catch (err: any) {
          console.log(chalk.red(`  ✗ ${err.message}`));
          console.log();
        }

        ask();
      });
    };

    ask();
  });

// ─── CAPSULE ────────────────────────────────────────────────────
const capsuleCmd = program
  .command('capsule')
  .description('Backup and restore pack state');

capsuleCmd
  .command('create')
  .description('Create an encrypted pack capsule backup')
  .option('-o, --output <path>', 'Output file path')
  .action((opts) => {
    try {
      const capsulePath = createCapsule(opts.output);
      console.log(chalk.green(`✓ Capsule created: ${capsulePath}`));
    } catch (err: any) {
      console.log(chalk.red(`✗ ${err.message}`));
    }
  });

capsuleCmd
  .command('restore <file>')
  .description('Restore a pack from a capsule')
  .option('-k, --key <key>', 'Pack encryption key')
  .action((file, opts) => {
    if (!opts.key) {
      console.log(chalk.red('✗ Encryption key required. Use: wolfpak capsule restore <file> -k <key>'));
      return;
    }
    try {
      restoreCapsule(file, opts.key);
      console.log(chalk.green('✓ Pack restored from capsule'));
    } catch (err: any) {
      console.log(chalk.red(`✗ ${err.message}`));
    }
  });

// ─── INVITE ─────────────────────────────────────────────────────
program
  .command('invite')
  .description('Show the invite link for current pack')
  .action(() => {
    const pack = loadPack();
    if (!pack) {
      console.log(chalk.red('✗ No active pack.'));
      return;
    }
    const link = getInviteLink(pack);
    console.log(chalk.hex('#8B5CF6').bold('\n  Pack Invite\n'));
    console.log(chalk.gray(`  Pack:   ${pack.name}`));
    console.log(chalk.gray(`  Members: ${pack.members.length}`));
    console.log();
    console.log(chalk.white('  Invite link:'));
    console.log(chalk.white.bold(`  ${link}`));
    console.log();
    console.log(chalk.white('  Encryption key (share separately):'));
    console.log(chalk.white.bold(`  ${pack.encryptionKey}`));
    console.log();
  });

// ─── PEERS ──────────────────────────────────────────────────────
const peersCmd = program
  .command('peers')
  .description('Manage peer approvals');

peersCmd
  .command('pending')
  .description('Show peers waiting for approval')
  .action(() => {
    const sec = getOrCreateSecurityConfig();
    if (sec.pendingPeers.length === 0) {
      console.log(chalk.green('  No pending peers.'));
      return;
    }
    console.log(chalk.hex('#F59E0B').bold(`\n  ${sec.pendingPeers.length} Pending Peer(s)\n`));
    sec.pendingPeers.forEach((p, i) => {
      console.log(chalk.white(`  ${i + 1}. ${p.displayName}`));
      console.log(chalk.gray(`     ID:   ${p.peerId}`));
      console.log(chalk.gray(`     Caps: ${p.capabilities.join(', ')}`));
      console.log(chalk.gray(`     Time: ${new Date(p.requestedAt).toLocaleString()}`));
      console.log();
    });
    console.log(chalk.gray('  Approve: wolfpak peers approve <peer-id>'));
    console.log(chalk.gray('  Reject:  wolfpak peers reject <peer-id>'));
    console.log();
  });

peersCmd
  .command('approve <peerId>')
  .description('Approve a pending peer to join the pack')
  .action((peerId) => {
    const sec = getOrCreateSecurityConfig();

    // Allow approving by index number (1, 2, 3...)
    const idx = parseInt(peerId);
    let targetId = peerId;
    if (!isNaN(idx) && idx > 0 && idx <= sec.pendingPeers.length) {
      targetId = sec.pendingPeers[idx - 1].peerId;
    }

    // Also allow partial peer ID match
    if (!sec.pendingPeers.find((p: any) => p.peerId === targetId)) {
      const match = sec.pendingPeers.find((p: any) => p.peerId.includes(targetId));
      if (match) targetId = match.peerId;
    }

    if (approveP(targetId)) {
      console.log(chalk.green(`✓ Peer approved: ${targetId}`));
    } else {
      console.log(chalk.red(`✗ Peer not found in pending list: ${peerId}`));
    }
  });

peersCmd
  .command('reject <peerId>')
  .description('Reject and permanently block a peer')
  .action((peerId) => {
    const sec = getOrCreateSecurityConfig();

    const idx = parseInt(peerId);
    let targetId = peerId;
    if (!isNaN(idx) && idx > 0 && idx <= sec.pendingPeers.length) {
      targetId = sec.pendingPeers[idx - 1].peerId;
    }

    if (!sec.pendingPeers.find((p: any) => p.peerId === targetId)) {
      const match = sec.pendingPeers.find((p: any) => p.peerId.includes(targetId));
      if (match) targetId = match.peerId;
    }

    rejectP(targetId);
    console.log(chalk.red(`✗ Peer rejected and blocked: ${targetId}`));
  });

peersCmd
  .command('list')
  .description('Show all approved and blocked peers')
  .action(() => {
    const sec = getOrCreateSecurityConfig();
    console.log(chalk.hex('#8B5CF6').bold('\n  Peer Status\n'));

    console.log(chalk.green(`  Approved (${sec.approvedPeers.length}):`));
    if (sec.approvedPeers.length === 0) console.log(chalk.gray('    None'));
    sec.approvedPeers.forEach(p => console.log(chalk.gray(`    ${chalk.green('●')} ${p}`)));

    console.log();
    console.log(chalk.red(`  Blocked (${sec.blockedPeers.length}):`));
    if (sec.blockedPeers.length === 0) console.log(chalk.gray('    None'));
    sec.blockedPeers.forEach(p => console.log(chalk.gray(`    ${chalk.red('●')} ${p}`)));

    console.log();
    console.log(chalk.hex('#F59E0B')(`  Pending (${sec.pendingPeers.length}):`));
    if (sec.pendingPeers.length === 0) console.log(chalk.gray('    None'));
    sec.pendingPeers.forEach(p => console.log(chalk.gray(`    ${chalk.hex('#F59E0B')('●')} ${p.displayName} (${p.peerId.slice(0, 20)}...)`)));
    console.log();
  });

// ─── TOKEN ──────────────────────────────────────────────────────
program
  .command('token')
  .description('Show or regenerate your API token')
  .option('-r, --regenerate', 'Generate a new token')
  .action((opts) => {
    if (opts.regenerate) {
      const newToken = regenerateToken();
      console.log(chalk.green('✓ Token regenerated'));
      console.log(chalk.hex('#F59E0B')(newToken));
    } else {
      const sec = getOrCreateSecurityConfig();
      console.log(chalk.hex('#8B5CF6').bold('\n  API Token\n'));
      console.log(chalk.hex('#F59E0B')(`  ${sec.apiToken}`));
      console.log(chalk.gray('\n  Use with: Authorization: Bearer <token>'));
      console.log(chalk.gray('  Regenerate: wolfpak token --regenerate'));
      console.log();
    }
  });

// ─── KILL ───────────────────────────────────────────────────────
program
  .command('kill')
  .description('Stop the WOLFPAK node')
  .action(async () => {
    await stopAPI();
    await stopMesh();
    console.log(chalk.green('✓ WOLFPAK stopped'));
  });

// ─── SYSTEM INFO ────────────────────────────────────────────────
program
  .command('system-info')
  .description('Show system hardware info and capabilities')
  .action(() => {
    const totalGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
    const freeGB = Math.round(os.freemem() / (1024 * 1024 * 1024));
    const rec = recommendedModelTier();

    console.log(chalk.hex('#8B5CF6').bold('\n  System Information\n'));
    console.log(chalk.gray(`  Platform:       ${os.platform()} ${os.arch()}`));
    console.log(chalk.gray(`  CPU:            ${os.cpus()[0]?.model || 'unknown'}`));
    console.log(chalk.gray(`  Cores:          ${os.cpus().length}`));
    console.log(chalk.gray(`  Total RAM:      ${totalGB}GB`));
    console.log(chalk.gray(`  Free RAM:       ${freeGB}GB`));
    console.log(chalk.gray(`  Hostname:       ${os.hostname()}`));
    console.log();
    console.log(chalk.white('  Recommended'));
    console.log(chalk.gray(`  Model:          ${rec.recommended}`));
    console.log(chalk.gray(`  Capabilities:   inference, embedding, relay, storage, orchestration`));
    console.log();
  });

program.parse();
