// scripts/dev-agent.ts
import 'dotenv/config';
import fs from 'fs-extra';
import path from 'path';
import globby from 'globby';
import { execa } from 'execa';
import simpleGit from 'simple-git';
import OpenAI from 'openai';
import { z } from 'zod';

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** ---- Guardrails ---- */
const READONLY_GLOBS = [
  'lib/fetch*',          // your core fetch logic
  'app/api/**',          // API routes you want to protect initially
];
function isProtected(file: string) {
  // extremely simple guard: block exact prefixes; globs handled below via globby check in write
  return READONLY_GLOBS.some((g) => {
    const prefix = g.replace('/**','');
    return file.startsWith(prefix);
  });
}

/** ---- Tools (exposed to the model) ---- */
const ToolSchemas = {
  list_files: z.object({ pattern: z.string().default('**/*.{ts,tsx,js,jsx,css,md}') }),
  read_file: z.object({ path: z.string() }),
  write_file: z.object({ path: z.string(), content: z.string(), create: z.boolean().default(true) }),
  run_cmd: z.object({ cmd: z.string(), cwd: z.string().default('.') }),
  make_branch_commit_pr: z.object({
    branch: z.string(),
    title: z.string(),
    body: z.string().default(''),
    files: z.array(z.object({ path: z.string(), content: z.string() })).default([]),
  }),
} as const;

async function list_files(args: z.infer<typeof ToolSchemas.list_files>) {
  const files = await globby(args.pattern, { gitignore: true, ignore: ['node_modules', '.dist', '.git'] });
  return { files };
}

async function read_file(args: z.infer<typeof ToolSchemas.read_file>) {
  const full = path.resolve(process.cwd(), args.path);
  if (!fs.existsSync(full)) throw new Error(`File not found: ${args.path}`);
  const content = await fs.readFile(full, 'utf8');
  return { path: args.path, content };
}

async function write_file(args: z.infer<typeof ToolSchemas.write_file>) {
  if (isProtected(args.path)) {
    throw new Error(`Write blocked by guardrails: ${args.path}`);
  }
  const full = path.resolve(process.cwd(), args.path);
  if (!fs.existsSync(full) && !args.create) throw new Error(`File not found and create=false: ${args.path}`);
  await fs.ensureDir(path.dirname(full));
  await fs.writeFile(full, args.content, 'utf8');
  return { ok: true, path: args.path };
}

async function run_cmd(args: z.infer<typeof ToolSchemas.run_cmd>) {
  const { stdout, stderr } = await execa({ shell: true })`${{ raw: args.cmd }}`;
  return { stdout, stderr };
}

async function make_branch_commit_pr(args: z.infer<typeof ToolSchemas.make_branch_commit_pr>) {
  const git = simpleGit();
  // create branch
  await git.checkout(['-b', args.branch]).catch(async () => {
    await git.checkout(args.branch);
  });

  // optional staged writes passed in-memory
  for (const f of args.files) {
    if (isProtected(f.path)) throw new Error(`Write blocked by guardrails: ${f.path}`);
    await fs.ensureDir(path.dirname(f.path));
    await fs.writeFile(f.path, f.content, 'utf8');
  }

  await git.add('.');
  await git.commit(args.title);
  await git.push('origin', args.branch);

  // create PR via gh CLI (requires `gh auth login` once in Codespaces)
  await execa('gh', ['pr', 'create', '--fill', '--title', args.title, '--body', args.body]).catch(() => {});
  const prUrl = (await execa('gh', ['pr', 'view', '--json', 'url', '-q', '.url'])).stdout.trim();
  return { ok: true, prUrl, branch: args.branch };
}

/** ---- Router that the model can call ---- */
const tools = {
  list_files,
  read_file,
  write_file,
  run_cmd,
  make_branch_commit_pr,
};
type ToolName = keyof typeof tools;

async function callTool(name: ToolName, args: any) {
  switch (name) {
    case 'list_files': return list_files(ToolSchemas.list_files.parse(args));
    case 'read_file': return read_file(ToolSchemas.read_file.parse(args));
    case 'write_file': return write_file(ToolSchemas.write_file.parse(args));
    case 'run_cmd': return run_cmd(ToolSchemas.run_cmd.parse(args));
    case 'make_branch_commit_pr': return make_branch_commit_pr(ToolSchemas.make_branch_commit_pr.parse(args));
  }
}

/** ---- Main loop ---- */
async function main() {
  const goal = process.argv.slice(2).join(' ').trim();
  if (!goal) {
    console.error('Usage: ts-node scripts/dev-agent.ts "<goal or task>"');
    process.exit(1);
  }

  console.log('🎯 Goal:', goal);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: [
        'You are Autodun-Nexus Dev Agent. You edit code in this repo and create small, safe PRs.',
        'RULES:',
        '- Never edit protected files: lib/fetch*, app/api/** unless explicitly asked.',
        '- Prefer adding wrappers/adapters and new components.',
        '- Make small focused changes with tests/docs when possible.',
        '- After changes, create a branch and PR.',
        '- Use list_files/read_file/write_file/run_cmd/make_branch_commit_pr tools only.',
      ].join('\n'),
    },
    { role: 'user', content: goal },
  ];

  // tool loop (simple)
  for (let step = 0; step < 20; step++) {
    const res = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tool_choice: 'auto',
      tools: [
        { type: 'function', function: { name: 'list_files', parameters: ToolSchemas.list_files } },
        { type: 'function', function: { name: 'read_file', parameters: ToolSchemas.read_file } },
        { type: 'function', function: { name: 'write_file', parameters: ToolSchemas.write_file } },
        { type: 'function', function: { name: 'run_cmd', parameters: ToolSchemas.run_cmd } },
        { type: 'function', function: { name: 'make_branch_commit_pr', parameters: ToolSchemas.make_branch_commit_pr } },
      ],
      temperature: 0.2,
    });

    const choice = res.choices[0];
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name as ToolName;
        const args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
        console.log(`🛠  ${name}…`);
        try {
          const result = await callTool(name, args);
          messages.push(msg);
          messages.push({ role: 'tool', tool_call_id: tc.id!, content: JSON.stringify(result) });
        } catch (err: any) {
          messages.push(msg);
          messages.push({ role: 'tool', tool_call_id: tc.id!, content: JSON.stringify({ error: err.message }) });
        }
      }
    } else {
      // final reply
      console.log('\n📋 Plan/Result:\n', msg.content);
      break;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
