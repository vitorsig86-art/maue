<#
.SYNOPSIS
  Creates a new Cardeal Map project from this template.

.DESCRIPTION
  Copies the template to -Destination without generated folders, local secrets
  or template history, rebuilds .claude\skills as a physical copy of the
  canonical .agents\skills and verifies it (scripts/sync-skills.cjs --check)
  before git init,
  renames the npm package to -Slug, applies AGENTS.md "Projetos derivados"
  (src/projects/<slug>.ts registered in index.ts, derived-project notice)
  and creates the main branch with a first local commit.
  Saved as UTF-8 with BOM so Windows PowerShell 5.1 keeps the accents.
  No remote, push or install is performed. Roteiro: docs/NOVO-PROJETO.md.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\new-project.ps1 -Slug fazenda-exemplo -Destination C:\Users\Usuario\Desktop\fazenda-exemplo
#>
param(
  [Parameter(Mandatory = $true)][string]$Slug,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = "Stop"

if ($Slug -notmatch '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$') {
  throw "Invalid slug '$Slug'. Use lowercase letters, digits and hyphens (e.g. fazenda-exemplo)."
}

$template = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$target = [System.IO.Path]::GetFullPath($Destination)

if ($target.TrimEnd('\').StartsWith($template.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Destination must be outside the template folder: $target"
}
if ((Test-Path $target) -and (Get-ChildItem -Force $target | Select-Object -First 1)) {
  throw "Destination exists and is not empty: $target"
}

# Generated folders, history and secrets, excluded by name at any depth:
#   robocopy <template> <destino> /E /XD node_modules .git dist .vercel .npm-cache .vite .verification /XF .env .env.local
# Also skipped: junctions/links (/XJ), the template's .claude\skills mirror (rebuilt
# below from .agents\skills) and the local Claude Code permissions file.
# robocopy exit codes 0-7 mean success.
$skillsCanonical = Join-Path $template ".agents\skills"
$skillsMirror = Join-Path $template ".claude\skills"
$excludedDirs = @("node_modules", ".git", "dist", ".vercel", ".npm-cache", ".vite", ".verification", $skillsMirror)
$excludedFiles = @(".env", ".env.local", "settings.local.json")

# The canonical skills must be a physical folder without links (scripts/sync-skills.cjs).
if (-not (Test-Path -LiteralPath $skillsCanonical -PathType Container)) { throw "Canonical skills folder not found: $skillsCanonical" }
$canonicalLinks = @(Get-ChildItem -LiteralPath $skillsCanonical -Force -Recurse -Attributes ReparsePoint -ErrorAction SilentlyContinue)
if ((Get-Item -LiteralPath $skillsCanonical -Force).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { $canonicalLinks += Get-Item -LiteralPath $skillsCanonical -Force }
if ($canonicalLinks.Count) { throw "Links in the canonical skills: $($canonicalLinks.FullName -join ', ')" }

# Skill inventories: relative path ("/" separators, case-sensitive) -> SHA-256.
function Get-SkillInventory([string]$Directory) {
  $inventory = New-Object System.Collections.Hashtable ([System.StringComparer]::Ordinal)
  $base = (Resolve-Path -LiteralPath $Directory).Path.TrimEnd('\') + '\'
  foreach ($file in @(Get-ChildItem -LiteralPath $Directory -Force -Recurse -File)) {
    $inventory[$file.FullName.Substring($base.Length).Replace('\', '/')] = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash
  }
  return $inventory
}
function Assert-SameInventory($Expected, $Actual, [string]$Label) {
  $problems = @()
  foreach ($rel in $Expected.Keys) {
    if (-not $Actual.ContainsKey($rel)) { $problems += "missing $rel" }
    elseif ($Actual[$rel] -ne $Expected[$rel]) { $problems += "different $rel" }
  }
  foreach ($rel in $Actual.Keys) { if (-not $Expected.ContainsKey($rel)) { $problems += "extra $rel" } }
  if ($problems.Count) { throw "$Label does not match the canonical skills: $($problems -join ', ')" }
}
# Git entries under a folder: relative path -> blob id, from "git ls-files -s" or "git ls-tree -r HEAD".
function Get-GitBlobs([string]$Folder, [switch]$Head) {
  $blobs = New-Object System.Collections.Hashtable ([System.StringComparer]::Ordinal)
  if ($Head) { $lines = @(git -c core.quotePath=false ls-tree -r HEAD -- $Folder) } else { $lines = @(git -c core.quotePath=false ls-files -s -- $Folder) }
  if ($LASTEXITCODE -ne 0) { throw "git could not list $Folder" }
  foreach ($line in $lines) {
    if ($line -notmatch '^\d+ (?:blob )?([0-9a-f]{40,64})(?: 0)?\t(.+)$') { throw "Unexpected git entry in ${Folder}: $line" }
    $blobs[$Matches[2].Substring($Folder.Length + 1)] = $Matches[1]
  }
  return $blobs
}

$canonical = Get-SkillInventory $skillsCanonical
if (-not $canonical.Count) { throw "Canonical skills folder is empty: $skillsCanonical" }

Write-Host "Copying template to $target ..."
robocopy $template $target /E /XJ /XD $excludedDirs /XF $excludedFiles /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# .claude\skills: physical copy of the canonical .agents\skills (no junctions, no
# absolute paths), verified file by file before git init.
$skillsTarget = Join-Path $target ".claude\skills"
if (Test-Path -LiteralPath $skillsTarget) { throw "Unexpected .claude\skills in the copy: $skillsTarget" }
robocopy $skillsCanonical $skillsTarget /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed for .claude\skills with exit code $LASTEXITCODE" }
$remaining = Get-ChildItem -Force -Recurse -Attributes ReparsePoint $target -ErrorAction SilentlyContinue
if ($remaining) { throw "Links remain in the copy: $($remaining.FullName -join ', ')" }
foreach ($folder in @(".agents\skills", ".claude\skills")) {
  Assert-SameInventory $canonical (Get-SkillInventory (Join-Path $target $folder)) "$folder in the copy"
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js not found: required to verify the skills (scripts/sync-skills.cjs)" }
& $node.Source (Join-Path $target "scripts\sync-skills.cjs") --check --root $target
if ($LASTEXITCODE -ne 0) { throw "Skills verification failed in the copy (sync-skills.cjs exit $LASTEXITCODE); nothing was committed" }

# Rename the npm package (package.json and the lockfile root entries).
$utf8 = New-Object System.Text.UTF8Encoding($false)
$packagePath = Join-Path $target "package.json"
$package = [System.IO.File]::ReadAllText($packagePath)
$renamed = [regex]::Replace($package, '"name":\s*"[^"]*"', "`"name`": `"$Slug`"", 1)
if ($renamed -eq $package -and $package -notmatch "`"name`":\s*`"$Slug`"") { throw "Could not set the package name in package.json" }
[System.IO.File]::WriteAllText($packagePath, $renamed, $utf8)

$lockPath = Join-Path $target "package-lock.json"
if (Test-Path $lockPath) {
  $lock = [System.IO.File]::ReadAllText($lockPath)
  # Root "name" and packages[""].name are the first two occurrences.
  $lock = [regex]::Replace($lock, '"name":\s*"cardeal-map-template"', "`"name`": `"$Slug`"", 2)
  [System.IO.File]::WriteAllText($lockPath, $lock, $utf8)
}

# Apply AGENTS.md "Projetos derivados": real values live in src/projects/<slug>.ts.
$projectFile = Join-Path $target "src\projects\$Slug.ts"
$projectSource = @"
import type { ProjectConfig } from "./types";
import { templateProject } from "./template";

// Valores reais do projeto $Slug. template.ts guarda só exemplos genéricos
// usados por npm run check: não coloque dados da propriedade nele.
// Passo a passo: docs/NOVO-PROJETO.md (exemplo real comentado: projeto Cyro).
const basemap = templateProject.layers[0];

export const project: ProjectConfig = {
  ...templateProject,
  id: "$Slug",
  name: "Nome do projeto",
  location: "Município, UF",
  // Área do projeto [W, S, E, N] em graus; define o limite de navegação.
  // Ausente = sem limite. Capture com "Capturar bounds da vista" (npm run dev).
  // bounds: [W, S, E, N],
  // Opcional: navigation: { marginRatio: 0.25, maximumZoomDistance: 5000 },
  // Capture a vista final (cameraCapture). Ângulos em graus; altura em metros sobre o elipsoide.
  initialCamera: { longitude: 0, latitude: 0, height: 20000000, heading: 0, pitch: -90, roll: 0 },
  // Ordem = empilhamento: o último item fica por cima.
  layers: [basemap],
  scenes: [],
  diagnostic: { steps: [] },
  // Ferramentas só aparecem em npm run dev; desligue cameraCapture ao finalizar.
  developmentTools: { modelAlignment: false, cropAuthoring: false, cameraCapture: true },
};
"@
[System.IO.File]::WriteAllText($projectFile, ($projectSource -replace "`r`n", "`n"), $utf8)

$indexSource = @"
import { project } from "./$Slug";
import type { ProjectConfig } from "./types";

export const projects: ProjectConfig[] = [project];
"@
[System.IO.File]::WriteAllText((Join-Path $target "src\projects\index.ts"), ($indexSource -replace "`r`n", "`n"), $utf8)

$templateCommit = (git -C $template rev-parse --short HEAD).Trim()
$templateDirty = git -C $template status --porcelain --untracked-files=no
$origin = "commit $templateCommit"
if ($templateDirty) { $origin = "$origin, com alterações não commitadas" }
$created = Get-Date -Format "yyyy-MM-dd"
$agentsPath = Join-Path $target "AGENTS.md"
$agents = [System.IO.File]::ReadAllText($agentsPath)
$notice = "> **Projeto derivado ``$Slug``**, criado do Cardeal Map template ($origin) em $created. A seção `"Projetos derivados`" prevalece sobre as regras exclusivas do template. Configuração real: ``src/projects/$Slug.ts``."
$agents = [regex]::Replace($agents, '^(# [^\r\n]*\r?\n)', "`$1`n$notice`n", 1)
if ($agents -notmatch [regex]::Escape($notice)) { throw "Could not add the derived-project notice to AGENTS.md" }
[System.IO.File]::WriteAllText($agentsPath, $agents, $utf8)

# Git repository on branch main. The first commit makes main a real branch,
# ready for "git push -u origin main"; no remote is added.
$committed = $false
Push-Location $target
try {
  git init | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "git init failed" }
  git symbolic-ref HEAD refs/heads/main
  if ($LASTEXITCODE -ne 0) { throw "Could not set the main branch" }
  git -c core.safecrlf=false add -A
  if ($LASTEXITCODE -ne 0) { throw "git add failed" }
  # The index must hold exactly the canonical skill paths in both folders, with the
  # blobs git computes from the verified working files (an ignore rule, for example,
  # could leave a skill file out of "git add -A").
  $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $rels = @($canonical.Keys | Sort-Object)
  $expectedBlobs = @{}
  foreach ($folder in @(".agents/skills", ".claude/skills")) {
    $ids = @($rels | ForEach-Object { "$folder/$_" } | git hash-object --stdin-paths)
    if ($LASTEXITCODE -ne 0 -or $ids.Count -ne $rels.Count) { throw "git hash-object failed for $folder" }
    $expected = New-Object System.Collections.Hashtable ([System.StringComparer]::Ordinal)
    for ($i = 0; $i -lt $rels.Count; $i++) { $expected[$rels[$i]] = $ids[$i] }
    $expectedBlobs[$folder] = $expected
    Assert-SameInventory $expected (Get-GitBlobs $folder) "Git index for $folder"
  }
  git commit -q -m "Start $Slug from Cardeal Map template ($templateCommit)"
  if ($LASTEXITCODE -ne 0) { throw "First commit failed (git user.name/user.email set? hooks?). Branch main exists but has no commit: run node scripts/sync-skills.cjs --check, then commit manually." }
  $committed = $true
  foreach ($folder in @(".agents/skills", ".claude/skills")) {
    Assert-SameInventory $expectedBlobs[$folder] (Get-GitBlobs $folder -Head) "First commit for $folder"
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Project '$Slug' created at $target (branch main$(if ($committed) { ', first commit done' }))"
Write-Host "Roteiro completo: docs/NOVO-PROJETO.md"
Write-Host "Next steps:"
Write-Host "  cd `"$target`""
Write-Host "  npm.cmd ci"
Write-Host "  edit src/projects/$Slug.ts  (name, location, bounds, initialCamera, layers)"
Write-Host "  npm.cmd run typecheck; npm.cmd run check"
Write-Host ""
Write-Host "LEMBRETES:" -ForegroundColor Yellow
Write-Host "  1. Preencha o .env.local (copy .env.example .env.local) com os tokens do Cesium ion" -ForegroundColor Yellow
Write-Host "     deste projeto. O dev só lê o .env.local ao iniciar: reinicie o npm run dev." -ForegroundColor Yellow
Write-Host "  2. Crie o repositório PRIVADO no GitHub e envie a branch main:" -ForegroundColor Yellow
Write-Host "     gh repo create $Slug --private --source . --remote origin --push" -ForegroundColor Yellow
Write-Host "     (ou crie em github.com/new como Private e rode: git remote add origin <url>; git push -u origin main)" -ForegroundColor Yellow
exit 0
