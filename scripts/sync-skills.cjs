// Checks and, on request, refreshes the physical Claude Code mirror of the skills.
// Canonical source: .agents/skills/ (versioned). Mirror: .claude/skills/ (versioned
// physical copy, never junctions or symlinks). See AGENTS.md and docs/DECISOES.md.
//
//   node scripts/sync-skills.cjs [--check]     read only (default)
//   node scripts/sync-skills.cjs --apply       creates missing skills and refreshes
//                                              skills whose mirror matches git HEAD
//   options: --root <dir>         repository root (default: this script's parent);
//                                 with git it must be the repository top level
//            --allow-dirty-source --apply even if .agents/skills differs from git
//                                 HEAD (changed, missing, untracked or ignored
//                                 files) or there is no git repository
//
// --check validates the structure of every skill (physical folder, SKILL.md with
// frontmatter, name equal to the folder, description) in the source and in the
// mirror, and compares both inventories by SHA-256.
// Exit codes: 0 in sync (or applied), 1 divergence or entries preserved, 2 error.
// --apply never follows links, never deletes outside <root>/.claude, replaces a
// mirror skill only when its content equals git HEAD (git hash-object vs ls-tree),
// never removes skills that exist only in the mirror and attempts to restore the previous
// state on failure, reporting any residue it could not recover. Links in the
// mirror must be removed by hand (rmdir <entry>, without /s) after checking them.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const SOURCE = ".agents/skills";
const MIRROR = ".claude/skills";
const WORK_PARENT = ".claude";
const WORK_PREFIX = ".skills-sync-";
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const INVALID = /[<>:"|?*\u0000-\u001f]|[. ]$/;
const SKILL_NAME = /^(?!(?:true|false|null)$)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { mode: "check", root: path.join(__dirname, ".."), allowDirtySource: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--apply") options.mode = "apply";
    else if (arg === "--allow-dirty-source") options.allowDirtySource = true;
    else if (arg === "--root") {
      if (!argv[index + 1]) throw new UsageError("--root exige um caminho");
      options.root = argv[(index += 1)];
    } else throw new UsageError(`Opção desconhecida: ${arg}`);
  }
  if (options.check && options.mode === "apply") throw new UsageError("Use --check ou --apply, não ambos");
  return options;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function exists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// Walks a tree with lstat only. Links are recorded, never followed.
function scan(base, realRoot) {
  const result = { exists: false, files: new Map(), links: [], unsafe: [], entries: new Map() };
  if (!exists(base)) return result;
  const stat = fs.lstatSync(base);
  if (stat.isSymbolicLink()) {
    result.links.push(".");
    return result;
  }
  if (!stat.isDirectory()) throw new Error(`Não é diretório: ${base}`);
  if (!isInside(realRoot, fs.realpathSync(base))) throw new Error(`Fora da raiz do repositório: ${base}`);
  result.exists = true;
  const walk = (directory, relative) => {
    const seen = new Map();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = entry.name;
      const rel = relative ? `${relative}/${name}` : name;
      const key = name.normalize("NFC").toLowerCase();
      if (seen.has(key)) result.unsafe.push(`${rel} (colide com ${seen.get(key)})`);
      seen.set(key, name);
      if (RESERVED.test(name) || INVALID.test(name)) result.unsafe.push(`${rel} (nome inválido no Windows)`);
      const full = path.join(directory, name);
      const entryStat = fs.lstatSync(full);
      let type = "other";
      if (entryStat.isSymbolicLink()) {
        type = "link";
        result.links.push(rel);
      } else if (entryStat.isDirectory()) {
        type = "dir";
        walk(full, rel);
      } else if (entryStat.isFile()) {
        type = "file";
        result.files.set(rel, sha256(full));
      } else result.unsafe.push(`${rel} (tipo de entrada não suportado)`);
      if (!relative) result.entries.set(name, type);
    }
  };
  walk(base, "");
  return result;
}

// Supported subset: exactly name and description, one line each; name is a
// plain skill identifier; description is a JSON double-quoted string or plain
// ASCII text beginning with a letter and containing only letters, digits,
// spaces, commas, periods and hyphens. YAML constructs and comments are not
// supported. This deliberately does not parse general YAML.
function parseFrontmatter(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0].trimEnd() !== "---") return { error: "SKILL.md não começa com frontmatter (---)" };
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end < 0) return { error: "frontmatter sem delimitador de fechamento (---)" };
  const fields = Object.create(null);
  for (const line of lines.slice(1, end)) {
    const match = /^(name|description):[ \t]+(.+)$/.exec(line);
    if (!match) return { error: `linha fora do formato suportado: ${line.slice(0, 60)}` };
    const [, name, raw] = match;
    if (Object.hasOwn(fields, name)) return { error: `campo duplicado no frontmatter: ${name}` };
    if (name === "name") {
      if (!SKILL_NAME.test(raw)) return { error: "name fora do formato suportado" };
      fields[name] = raw;
    } else if (raw.startsWith('"')) {
      try {
        fields[name] = JSON.parse(raw);
      } catch {
        return { error: "description entre aspas inválida" };
      }
      if (typeof fields[name] !== "string") return { error: "description deve ser string" };
    } else {
      if (!/^[A-Za-z][A-Za-z0-9 ,.-]*$/.test(raw) || /^(?:null|true|false)$/i.test(raw.trim())) {
        return { error: "description fora do formato suportado" };
      }
      fields[name] = raw;
    }
  }
  return { fields };
}

// Every top-level entry must be a usable skill: physical folder with SKILL.md,
// valid frontmatter, name equal to the folder and a non-empty description.
function validateSkills(base, tree) {
  const problems = [];
  if (!tree.exists) return problems;
  if (!tree.entries.size) problems.push("nenhuma skill encontrada");
  for (const [name, type] of tree.entries) {
    if (type !== "dir") {
      problems.push(`${name}: não é diretório físico de skill (${type})`);
      continue;
    }
    if (!tree.files.has(`${name}/SKILL.md`)) {
      problems.push(`${name}: SKILL.md ausente`);
      continue;
    }
    const parsed = parseFrontmatter(fs.readFileSync(path.join(base, name, "SKILL.md"), "utf8"));
    if (parsed.error) {
      problems.push(`${name}: ${parsed.error}`);
      continue;
    }
    const { name: declared, description } = parsed.fields;
    if (typeof declared !== "string" || !declared) problems.push(`${name}: campo name ausente`);
    else if (!SKILL_NAME.test(declared) || declared.length > 64) problems.push(`${name}: name inválido (${declared})`);
    else if (declared !== name) problems.push(`${name}: name declarado (${declared}) difere do diretório`);
    if (typeof description !== "string" || !description.trim()) problems.push(`${name}: campo description ausente ou vazio`);
    else if (description.length > 1024) problems.push(`${name}: description com mais de 1024 caracteres`);
  }
  return problems;
}

function compare(source, mirror) {
  const missing = [];
  const different = [];
  const extra = [];
  for (const [rel, hash] of source.files) {
    if (!mirror.files.has(rel)) missing.push(rel);
    else if (mirror.files.get(rel) !== hash) different.push(rel);
  }
  for (const rel of mirror.files.keys()) if (!source.files.has(rel)) extra.push(rel);
  return { missing, different, extra };
}

function skillOf(rel) {
  return rel.split("/")[0];
}

function leftovers(root) {
  const parent = path.join(root, WORK_PARENT);
  if (!exists(parent) || !fs.lstatSync(parent).isDirectory()) return [];
  return fs.readdirSync(parent).filter((name) => name.startsWith(WORK_PREFIX));
}

function git(root, args, input) {
  return execFileSync(
    "git",
    ["--no-optional-locks", "-c", `safe.directory=${root.replace(/\\/g, "/")}`, "-c", "core.quotePath=false", "-C", root, ...args],
    { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
}

// Git is used only when <root> is exactly the top level of a repository with HEAD,
// so every path below is relative to the same root. A nested root is refused.
function gitContext(root, realRoot) {
  let top;
  try {
    top = git(root, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return { available: false, reason: "sem repositório git" };
  }
  if (!samePath(fs.realpathSync(top), realRoot)) return { available: false, nested: true, top };
  try {
    git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  } catch {
    return { available: false, reason: "repositório sem HEAD" };
  }
  return { available: true };
}

// HEAD blobs under relDir, keyed by path relative to relDir.
function headBlobs(root, relDir) {
  const blobs = new Map();
  const nonBlobs = [];
  for (const item of git(root, ["ls-tree", "-r", "-z", "--full-tree", "HEAD", "--", relDir]).split("\0")) {
    if (!item) continue;
    const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(item);
    if (!match) throw new Error(`Saída inesperada do git ls-tree: ${item}`);
    const rel = match[4].slice(relDir.length + 1);
    if (match[2] !== "blob" || match[1] === "120000") nonBlobs.push(rel);
    else blobs.set(rel, match[3]);
  }
  return { blobs, nonBlobs };
}

// Blob ids of working files as git would store them (clean filters, e.g. CRLF).
function workBlobs(root, relDir, rels) {
  if (!rels.length) return new Map();
  const ids = git(root, ["hash-object", "--stdin-paths"], rels.map((rel) => `${relDir}/${rel}`).join("\n") + "\n").trim().split(/\r?\n/);
  if (ids.length !== rels.length) throw new Error("Saída inesperada do git hash-object");
  return new Map(rels.map((rel, index) => [rel, ids[index]]));
}

// Content comparison of a scanned tree with HEAD: changed, missing in the working
// tree, unknown to HEAD (untracked or ignored) and non-regular entries in HEAD.
function compareWithHead(root, relDir, tree) {
  const head = headBlobs(root, relDir);
  const rels = [...tree.files.keys()];
  const work = workBlobs(root, relDir, rels);
  return {
    modified: rels.filter((rel) => head.blobs.has(rel) && head.blobs.get(rel) !== work.get(rel)),
    unknown: rels.filter((rel) => !head.blobs.has(rel)),
    missing: [...head.blobs.keys()].filter((rel) => !tree.files.has(rel)),
    nonBlobs: head.nonBlobs,
  };
}

function report(state) {
  const lines = [];
  const list = (title, items) => {
    if (items.length) lines.push(`${title} (${items.length}):`, ...items.map((item) => `  - ${item}`));
  };
  list(`Links na fonte ${SOURCE}`, state.source.links);
  list(`Nomes inseguros na fonte ${SOURCE}`, state.source.unsafe);
  list(`Estrutura inválida na fonte ${SOURCE}`, state.sourceProblems);
  list(`Links no espelho ${MIRROR} (remover manualmente, sem seguir o destino)`, state.mirror.links);
  list(`Nomes inseguros no espelho ${MIRROR}`, state.mirror.unsafe);
  list(`Estrutura inválida no espelho ${MIRROR}`, state.mirrorProblems);
  list("Ausentes no espelho", state.diff.missing);
  list("Divergentes no espelho", state.diff.different);
  list("Extras no espelho", state.diff.extra);
  list(`Resíduos de sincronização interrompida em ${WORK_PARENT}`, state.leftovers);
  return lines;
}

function inspect(root, realRoot) {
  for (const dir of [path.dirname(SOURCE), WORK_PARENT]) {
    const full = path.join(root, dir);
    if (exists(full) && fs.lstatSync(full).isSymbolicLink()) throw new Error(`${dir} é um link`);
  }
  const source = scan(path.join(root, SOURCE), realRoot);
  if (!source.exists) throw new Error(`Fonte canônica ausente ou inválida: ${SOURCE}`);
  const mirror = scan(path.join(root, MIRROR), realRoot);
  const state = {
    source,
    mirror,
    sourceProblems: validateSkills(path.join(root, SOURCE), source),
    mirrorProblems: validateSkills(path.join(root, MIRROR), mirror),
    diff: compare(source, mirror),
    leftovers: leftovers(root),
  };
  state.sourceValid = !source.links.length && !source.unsafe.length && !state.sourceProblems.length;
  state.inSync =
    state.sourceValid &&
    mirror.exists &&
    !mirror.links.length &&
    !mirror.unsafe.length &&
    !state.mirrorProblems.length &&
    !state.diff.missing.length &&
    !state.diff.different.length &&
    !state.diff.extra.length &&
    !state.leftovers.length;
  return state;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Windows may briefly lock files (antivirus, indexer): retry transient errors.
function retry(action) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return action();
    } catch (error) {
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(error.code)) throw error;
      sleep(100 * (attempt + 1));
    }
  }
}

// Test hook: SYNC_SKILLS_TEST_FAIL_AT=<step>[,<step>...] simulates failures.
function failing(step) {
  return (process.env.SYNC_SKILLS_TEST_FAIL_AT || "").split(",").includes(step);
}
function failpoint(step) {
  if (failing(step)) throw new Error(`Falha simulada (${step})`);
}

function skillFiles(tree, skill) {
  return new Map([...tree.files].filter(([rel]) => skillOf(rel) === skill));
}

function sameFiles(a, b) {
  return a.size === b.size && [...a].every(([rel, hash]) => b.get(rel) === hash);
}

function copySkill(sourceDir, targetDir, expected) {
  fs.mkdirSync(targetDir);
  for (const [rel, hash] of expected) {
    const target = path.join(targetDir, ...rel.split("/").slice(1));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceDir, ...rel.split("/")), target, fs.constants.COPYFILE_EXCL);
    if (sha256(target) !== hash) throw new Error(`Hash divergente na cópia temporária: ${rel}`);
  }
}

function preflight(root, realRoot, options, state, gitInfo) {
  if (!state.sourceValid) throw new Error("Fonte com links, nomes inseguros ou estrutura inválida: nada foi alterado");
  if (gitInfo.nested) throw new Error(`--root não é a raiz do repositório git (${gitInfo.top}): nada foi alterado`);
  if (state.mirror.links.length) return "Espelho contém links: remova-os manualmente (rmdir <entrada>, sem /s) e rode de novo. Nada foi alterado.";
  if (state.mirror.unsafe.length) return "Espelho contém nomes inseguros: nada foi alterado.";
  if (state.leftovers.length) return "Há resíduos de uma sincronização interrompida: confira e restaure/remova manualmente antes de aplicar. Nada foi alterado.";
  if (exists(path.join(root, MIRROR)) && !fs.lstatSync(path.join(root, MIRROR)).isDirectory()) throw new Error(`${MIRROR} não é diretório: nada foi alterado`);
  if (!gitInfo.available) {
    if (!options.allowDirtySource) throw new Error(`Não foi possível conferir ${SOURCE} contra o git HEAD (${gitInfo.reason}); use --allow-dirty-source somente se autorizado`);
    return null;
  }
  const head = compareWithHead(root, SOURCE, state.source);
  const issues = [
    ...head.modified.map((rel) => `${rel} (alterado em relação ao HEAD)`),
    ...head.missing.map((rel) => `${rel} (ausente; existe no HEAD)`),
    ...head.unknown.map((rel) => `${rel} (não rastreado ou ignorado)`),
    ...head.nonBlobs.map((rel) => `${rel} (entrada não regular no HEAD)`),
  ];
  if (issues.length && !options.allowDirtySource) {
    throw new Error(`${SOURCE} difere do git HEAD; use --allow-dirty-source somente se autorizado:\n${issues.map((item) => `  - ${item}`).join("\n")}`);
  }
  return null;
}

function apply(root, realRoot, options, state) {
  const gitInfo = gitContext(root, realRoot);
  const blocked = preflight(root, realRoot, options, state, gitInfo);
  if (blocked) return { code: 1, message: blocked };
  if (state.inSync) return { code: 0, message: "Nada a aplicar: fonte e espelho idênticos." };

  const touched = new Set([...state.diff.missing, ...state.diff.different, ...state.diff.extra].map(skillOf));
  const mirrorHead = gitInfo.available && state.mirror.exists ? compareWithHead(root, MIRROR, state.mirror) : null;
  const plan = [];
  const preserved = [];
  for (const skill of [...state.source.entries.keys()].sort()) {
    if (!touched.has(skill)) continue;
    if (!state.mirror.entries.has(skill)) {
      plan.push({ skill, replace: false });
      continue;
    }
    // Replace an existing mirror skill only when every file in it has exactly the
    // content of git HEAD (files missing from it are fine): nothing unrecoverable is
    // lost. Changed, untracked or ignored files keep it. Without git: keep.
    const inSkill = (rel) => skillOf(rel) === skill;
    const pristine =
      state.mirror.entries.get(skill) === "dir" &&
      mirrorHead !== null &&
      !mirrorHead.modified.some(inSkill) &&
      !mirrorHead.unknown.some(inSkill) &&
      !mirrorHead.nonBlobs.some(inSkill);
    if (pristine) plan.push({ skill, replace: true });
    else preserved.push(skill);
  }
  const mirrorOnly = [...state.mirror.entries.keys()].filter((skill) => !state.source.entries.has(skill));
  const notes = [];
  if (preserved.length) notes.push(`Preservadas (conteúdo local diferente do HEAD ou sem referência git; não sobrescritas): ${preserved.join(", ")}`);
  if (mirrorOnly.length) notes.push(`Somente no espelho (não removidas): ${mirrorOnly.join(", ")}`);
  const finalCode = preserved.length || mirrorOnly.length ? 1 : 0;
  if (!plan.length) return { code: finalCode || 1, message: notes.join("\n") || "Nada a aplicar." };

  const mirrorDir = path.join(root, MIRROR);
  const workParent = path.join(root, WORK_PARENT);
  fs.mkdirSync(workParent, { recursive: true });
  const tx = {
    workDir: path.join(workParent, `${WORK_PREFIX}${process.pid}-${Date.now()}`),
    mirrorExisted: state.mirror.exists,
    mirrorCreated: false,
    steps: plan.map((step) => ({ ...step, staged: false, backedUp: false, placed: false })),
  };
  tx.stageDir = path.join(tx.workDir, "stage");
  tx.backupDir = path.join(tx.workDir, "backup");
  try {
    failpoint("before-stage");
    fs.mkdirSync(tx.workDir);
    if (!isInside(fs.realpathSync(workParent), fs.realpathSync(tx.workDir)) || !isInside(realRoot, fs.realpathSync(tx.workDir))) {
      throw new Error("Diretório temporário fora de .claude");
    }
    fs.mkdirSync(tx.stageDir);
    fs.mkdirSync(tx.backupDir);
    for (const step of tx.steps) {
      copySkill(path.join(root, SOURCE), path.join(tx.stageDir, step.skill), skillFiles(state.source, step.skill));
      step.staged = true;
      failpoint("during-stage");
    }
    failpoint("after-stage");
    if (!tx.mirrorExisted) {
      fs.mkdirSync(mirrorDir);
      tx.mirrorCreated = true;
      failpoint("after-mirror-created");
    }
    tx.steps.forEach((step, index) => {
      const target = path.join(mirrorDir, step.skill);
      if (step.replace) {
        // Content must still be what was judged pristine a moment ago.
        const now = scan(target, realRoot);
        if (now.links.length || !sameFiles(new Map([...now.files].map(([rel, hash]) => [`${step.skill}/${rel}`, hash])), skillFiles(state.mirror, step.skill))) {
          throw new Error(`${MIRROR}/${step.skill} mudou durante a sincronização`);
        }
        retry(() => fs.renameSync(target, path.join(tx.backupDir, step.skill)));
        step.backedUp = true;
        failpoint(`after-backup-${index + 1}`);
      } else if (exists(target)) throw new Error(`${MIRROR}/${step.skill} surgiu durante a sincronização`);
      retry(() => fs.renameSync(path.join(tx.stageDir, step.skill), target));
      step.placed = true;
      failpoint(`after-swap-${index + 1}`);
    });
    const after = inspect(root, realRoot);
    const wrong = [...after.diff.missing, ...after.diff.different].filter((rel) => tx.steps.some((step) => step.skill === skillOf(rel)));
    const invalid = after.mirrorProblems.filter((problem) => tx.steps.some((step) => problem.startsWith(`${step.skill}:`)));
    if (wrong.length || invalid.length) throw new Error(`Verificação pós-aplicação falhou: ${[...wrong, ...invalid].join(", ")}`);
    failpoint("before-cleanup");
  } catch (error) {
    const problems = rollback(tx, root, realRoot, state, mirrorDir);
    if (problems.length) {
      throw new Error(`${error.message}\nRecuperação incompleta; nada mais foi removido. Confira ${tx.workDir}:\n${problems.map((item) => `  - ${item}`).join("\n")}`);
    }
    throw new Error(`${error.message}\nEstado anterior restaurado e verificado; sem resíduos.`);
  }
  const lines = [`Aplicado: ${tx.steps.map((step) => `${step.skill} (${step.replace ? "atualizada" : "criada"})`).join(", ")}`, ...notes];
  try {
    removeWorkDir(tx);
  } catch (error) {
    lines.push(`Aplicado, mas o diretório temporário não pôde ser removido (${error.message}): ${tx.workDir}`);
    return { code: 1, message: lines.join("\n") };
  }
  return { code: finalCode, message: lines.join("\n") };
}

// Removes our work dir only when no backup is left in it.
function removeWorkDir(tx) {
  if (!exists(tx.workDir)) return;
  if (exists(tx.backupDir) && fs.readdirSync(tx.backupDir).length && tx.steps.some((step) => step.backedUp && !step.placed)) {
    throw new Error("há cópias de segurança não restauradas");
  }
  fs.rmSync(tx.workDir, { recursive: true, force: true });
  if (exists(tx.workDir)) throw new Error("remoção incompleta");
}

// Undoes, in reverse order, only what was actually done; then verifies that the
// mirror is byte-identical to the snapshot taken before the operation.
function rollback(tx, root, realRoot, state, mirrorDir) {
  const problems = [];
  const simulateFailure = failing("during-rollback");
  for (const step of [...tx.steps].reverse()) {
    const target = path.join(mirrorDir, step.skill);
    const staged = path.join(tx.stageDir, step.skill);
    const backup = path.join(tx.backupDir, step.skill);
    try {
      if (simulateFailure) throw new Error("Falha simulada (during-rollback)");
      if (step.placed) {
        if (!exists(target)) throw new Error(`${MIRROR}/${step.skill} ausente ao desfazer`);
        if (exists(staged)) throw new Error(`destino temporário ocupado: ${staged}`);
        retry(() => fs.renameSync(target, staged));
        step.placed = false;
      }
      if (step.backedUp) {
        if (!exists(backup)) throw new Error(`cópia de segurança ausente: ${backup}`);
        if (exists(target)) throw new Error(`${MIRROR}/${step.skill} ocupado ao restaurar`);
        retry(() => fs.renameSync(backup, target));
        step.backedUp = false;
      }
    } catch (error) {
      problems.push(`${step.skill}: ${error.message}`);
    }
  }
  if (tx.mirrorCreated && !problems.length && exists(mirrorDir)) {
    try {
      if (fs.readdirSync(mirrorDir).length) throw new Error("não está vazio");
      fs.rmdirSync(mirrorDir);
      tx.mirrorCreated = false;
    } catch (error) {
      problems.push(`${MIRROR} criado nesta operação: ${error.message}`);
    }
  }
  if (!problems.length) {
    const now = scan(mirrorDir, realRoot);
    if (now.exists !== state.mirror.exists || !sameFiles(now.files, state.mirror.files) || now.links.length !== state.mirror.links.length) {
      problems.push(`${MIRROR} difere do estado anterior após a recuperação`);
    }
  }
  if (!problems.length) {
    try {
      removeWorkDir(tx);
    } catch (error) {
      problems.push(`diretório temporário ${tx.workDir}: ${error.message}`);
    }
  }
  return problems;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  try {
    const root = path.resolve(options.root);
    const realRoot = fs.realpathSync(root);
    const state = inspect(root, realRoot);
    const summary = `${state.source.entries.size} skills / ${state.source.files.size} arquivos em ${SOURCE}`;
    if (options.mode === "check") {
      if (state.inSync) {
        console.log(`Skills sincronizadas e válidas: ${summary}; ${MIRROR} idêntico (SHA-256).`);
        return 0;
      }
      if (!state.mirror.exists && !state.mirror.links.length) console.log(`Espelho ausente: ${MIRROR}`);
      console.log(report(state).join("\n"));
      if (!state.sourceValid) {
        console.log("Erro: fonte canônica inválida; corrija .agents/skills antes de sincronizar.");
        return 2;
      }
      console.log("Divergência: rode node scripts/sync-skills.cjs --apply somente se autorizado.");
      return 1;
    }
    const result = apply(root, realRoot, options, state);
    console.log(result.message);
    if (result.code === 0) console.log(`Skills sincronizadas: ${summary}.`);
    return result.code;
  } catch (error) {
    console.error(`Erro: ${error.message}`);
    return 2;
  }
}

process.exitCode = main();
