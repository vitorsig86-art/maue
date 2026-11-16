# Decisões técnicas

Registro curto de decisões com impacto duradouro no template ou nos projetos derivados. As regras comuns estão no [AGENTS.md](../AGENTS.md), seção "Colaboração Claude Code + Codex"; este arquivo não as substitui nem concede autorização para executar mudanças.

Use uma entrada apenas quando houver decisão relevante nos temas definidos no AGENTS.md. Ajustes rotineiros dispensam registro. Não incluir credenciais, URLs autenticadas ou dados confidenciais de clientes.

## Formato de uma entrada

- **Data, título e estado:** proposta, adotada ou substituída; indicar eventual sucessora.
- **Contexto e referência:** problema, responsável, caminhos e commit/PR ou HEAD de base com diff identificado.
- **Decisão e motivo:** solução escolhida e alternativa relevante descartada.
- **Impacto:** compatibilidade, dados, desempenho e projetos derivados, conforme aplicável.
- **Autorização:** quem autorizou e em qual pedido/referência, quando exigida.
- **Validação e retorno seguro:** verificações executadas e resultados, pendências, limites e como desfazer a mudança sem remover trabalho alheio.

## 2026-11-13 — Instruções comuns para Claude Code e Codex

- **Estado:** homologação concluída; aprovação final pelo Claude Code em 13/11/2026, com resultado **APROVADO** e ressalvas corrigidas e validadas.
- **Contexto e referência:** os dois agentes trabalham no mesmo template e precisam de instruções e passagem explícitas. Implementador: Codex. Base do template: `7e3281738a30d44fc96b59d81d35aa5d634121ac`; entrega sem commit identificada pelo acréscimo da seção "Colaboração Claude Code + Codex" ao AGENTS.md e pela criação deste arquivo.
- **Decisão e motivo:** centralizar as regras no AGENTS.md e manter CLAUDE.md somente com `@AGENTS.md`. Registrar aqui apenas decisões duradouras, evitando duas políticas técnicas paralelas.
- **Impacto:** exclusivamente documental. As regras técnicas anteriores e o mecanismo de criação de derivados são preservados; não há alteração de aplicação, dependências, dados ou infraestrutura.
- **Autorização:** responsável pelo template, nos pedidos "Cardeal Map — Implantação do Protocolo Claude Code + Codex" e "Cardeal Map — Ajustes finais do Protocolo de Colaboração", limitados à Fase 1 documental e às suas ressalvas; no pedido "Cardeal Map — Homologação e Commit da Fase 1", autorizou o commit local exclusivamente de AGENTS.md e docs/DECISOES.md, sem push ou avanço para outras fases.
- **Revisão independente — 13/11/2026:** realizada pelo Claude Code, com resultado **APROVADO COM RESSALVAS**, conforme comunicado pelo responsável no pedido de ajustes finais. As ressalvas documentais abrangem a exceção de `safe.directory` por comando de leitura, os meios de passagem de contexto e o uso de temporários externos em operações auxiliares de leitura/comparação.
- **Correções aplicadas — 13/11/2026:** explicitados esses três pontos no AGENTS.md, com bloqueio da exceção para escrita e orientação para relatar impedimentos. Acrescentadas orientações sobre a origem das decisões herdadas e a ausência de atualização documental automática nos derivados antigos. As ressalvas foram corrigidas e validadas pelo Claude Code na aprovação final de 13/11/2026.
- **Validação e retorno seguro:** a validação documental da implantação incluiu releitura e conferência de diff/estado Git; a preservação byte a byte refere-se ao snapshot local anterior à Fase 1, com CRLF, enquanto o blob Git usa LF. CLAUDE.md foi preservado e as alterações preexistentes foram conferidas por hashes. Instalação, build e testes da aplicação não integram esta fase. Se houver revisão desta decisão, modificar somente os acréscimos documentais identificados, preservando o conteúdo técnico anterior e quaisquer alterações posteriores de terceiros.
- **Homologação final — 13/11/2026:** revisão independente concluída pelo Claude Code, com veredito **APROVADO**, conforme comunicado pelo responsável no pedido de homologação. Ressalvas corrigidas e validadas; confirmação final concluída. O commit documental local foi autorizado pelo responsável, exclusivamente para AGENTS.md e docs/DECISOES.md. Push, merge, publicação e demais fases não estão autorizados.

## 2026-11-13 — Skills: fonte canônica `.agents/skills` e espelho físico `.claude/skills`

- **Estado:** implementada sem commit; revisão independente das correções realizada pelo Codex em 16/11/2026, **APROVADO COM RESSALVAS**, sem bloqueador para utilizar o criador de projetos. A reprovação inicial e as correções permanecem registradas abaixo como histórico. Commit e publicação continuam dependendo de autorização própria.
- **Contexto e referência:** as 15 junctions de `.claude/skills` apontavam, por caminho absoluto, para `C:\Users\Usuario\Desktop\cardeal-map-template\.agents\skills\...`, inexistente após a mudança da pasta para `projetos\`. As skills Cesium não carregavam no Claude Code e o Git listava os 26 arquivos como apagados. O `new-project.ps1` seguia o destino das junctions e não conferia o resultado: `campinas-2-webgis` (06/11/2026) ficou com 15 pastas de skills vazias e um primeiro commit sem skills. Implementador: Claude Code. Base: `f28a2b00925a991a94f2c6fbb8c791d4bbab5a79`. Arquivos: `.claude/skills/` (restauração física, sem diff contra HEAD), `scripts/sync-skills.cjs` (novo), `scripts/new-project.ps1`, `AGENTS.md`, `docs/CESIUM_VECTOR_TILES_2026.md` e esta entrada.
- **Decisão e motivo:** `.agents/skills` é a fonte canônica (lida pelo Codex, idêntica ao HEAD, frontmatter entre aspas em linha única). `.claude/skills` é um espelho físico versionado: o Git já guardava essas skills como 26 arquivos regulares, com a mesma árvore de `.agents/skills` (`36ce84a`), logo a migração não altera nenhum blob. Alternativas descartadas: junctions (só caminhos absolutos; foi o que quebrou); symlinks relativos (`core.symlinks=false` faz o checkout gerar arquivos de texto, exigem privilégio no Windows e o robocopy `/XJ` os exclui); referência fora do projeto (`~/.claude/skills` ou plugin), que tornaria o derivado dependente da máquina e não atende o Codex. `agent/skills` difere apenas na formatação do frontmatter YAML, sem conteúdo exclusivo; permanece temporariamente, fora da sincronização.
- **Segurança (após as correções):**
  - `--check` (padrão) só lê. Compara inventário e SHA-256 e valida a estrutura de cada skill na fonte e no espelho: diretório físico, `SKILL.md`, frontmatter delimitado e legível, `name` e `description` presentes e `name` igual ao diretório. Árvores idênticas sem skill utilizável retornam 2.
  - `--apply` só usa o Git quando `--root` é a raiz do repositório (`rev-parse --show-toplevel`). Raiz aninhada é recusada, inclusive com `--allow-dirty-source`.
  - A fonte é conferida por conteúdo contra o HEAD: `git ls-tree` comparado com `git hash-object` dos arquivos encontrados no disco. Arquivo alterado (inclusive escondido do `git status`), ausente, não rastreado ou ignorado bloqueia a operação, salvo `--allow-dirty-source` explícito.
  - Uma skill do espelho só é substituída quando todos os seus arquivos têm o conteúdo do HEAD, reconferido por SHA-256 imediatamente antes do rename.
  - Nunca segue links, não remove skill que exista só no espelho e não sobrescreve conteúdo desconhecido ou alterado.
  - O rollback desfaz só o que foi feito (staging, backup, troca, espelho criado nesta operação) e confere o espelho byte a byte contra o estado anterior. Só então declara "restaurado e verificado". Se algo não puder ser desfeito, mantém as cópias de segurança em `.claude/.skills-sync-*`, relata a recuperação como incompleta e bloqueia novos `--apply` até a conferência manual.
  - As junctions foram removidas uma a uma por `rmdir` não recursivo, depois de confirmar por `lstat`/`readlink` que eram links com destino externo e inexistente.
- **Impacto:** nenhuma alteração em `src/`, dependências, `package.json`/`package-lock.json`, `skills-lock.json`, `agent/skills` ou derivados existentes. Nos novos derivados, `.claude/skills` é copiado de `.agents/skills`; o espelho do template é excluído do robocopy. O `new-project.ps1` faz três conferências:
  - antes do `git init`: inventário e SHA-256 das duas árvores do derivado contra a origem canônica do template, ausência de links e `sync-skills.cjs --check`;
  - antes do commit: caminhos e blobs do índice (`git ls-files -s`) contra `git hash-object` dos arquivos verificados;
  - depois do commit: os blobs do HEAD.
  - Se o primeiro commit falhar, o script agora termina com erro (antes emitia só um aviso). Os derivados já afetados (`campinas-2-webgis`, `aliehs-webgis`, `andrelandia-webgis`, `fazenda-cafe`, `cambuci-webgis`, `jurema-webgis`) exigem tarefas próprias em cada projeto.
- **Autorização:** responsável pelo template, no pedido "Cardeal Map — Fase 2: Implementação Segura das Skills". Sem commit, push, merge ou alteração de derivados existentes.
- **Revisão independente — 13/11/2026:** o Codex reprovou a primeira implementação para commit. Os pontos apontados foram:
  - caminhos inconsistentes entre `git status` e `git ls-tree` com `--root` em subpasta de outro repositório, o que permitia classificar como íntegra uma edição local do espelho;
  - integridade da fonte deduzida só do `git status`;
  - rollback que falhava quando o espelho não existia e a falha ocorria na preparação;
  - `--check` que aceitava árvores idênticas sem skills utilizáveis;
  - `new-project.ps1` conferindo só contagens;
  - registro incorreto sobre o lockfile.
- **Correções aplicadas — 13/11/2026:** foram feitas alterações em `scripts/sync-skills.cjs`, `scripts/new-project.ps1` e nesta entrada. A revisão independente posterior reprovou o retorno antecipado de `--apply`, a validação YAML e a promessa de rollback. Os três pontos receberam ajustes; nova revisão independente permanece pendente.
- **Formato de frontmatter suportado:** subconjunto deliberadamente restrito: delimitadores `---`, somente os campos obrigatórios `name` e `description`, cada um em linha única, sem comentários ou outros campos. `name` começa por letra ASCII minúscula, contém somente letras ASCII minúsculas, números e hífens, sem hífens consecutivos ou finais, tem no máximo 64 caracteres, não pode ser `true`, `false` ou `null` e deve corresponder à pasta. `description` é string entre aspas duplas com sintaxe JSON ou texto simples ASCII iniciado por letra, contendo apenas letras, números, espaços, vírgulas, pontos e hífens, exceto os valores reservados `null`, `true` e `false`. Outras construções YAML, inclusive aspas simples e frontmatter multilinha, são rejeitadas. A restrição evita um parser YAML incompleto e dispensa instalação antes da criação de derivados; as 15 skills atuais seguem esse formato. A validação aguarda revisão independente.
- **Lockfile:** o Codex reproduziu os 15 `computedHash` do `skills-lock.json`. Não há divergência comprovada no lockfile. A afirmação anterior desta entrada estava errada: a tentativa usou metodologia insuficiente. A sonda procurava pastas com nome errado e não chegou a comparar nenhuma skill. Refazendo, os 15 hashes foram reproduzidos como SHA-256 de caminho relativo + conteúdo de cada arquivo, ordenados por `localeCompare`, sobre os bytes da árvore de trabalho (CRLF, `core.autocrlf=true`). Isso também mostra que o hash depende das quebras de linha do checkout.
- **Validação e retorno seguro:**
  - **Revisão independente final — 16/11/2026 (Codex):** inspeção direta dos dois scripts, documentação e estado Git, base `f28a2b0` mais alterações locais. Quinze testes independentes em diretórios descartáveis passaram: check e idempotência; raiz Git aninhada; fonte ignorada, desconhecida, alterada e ausente; rollback com espelho ausente em seis pontos; preservação de edição local; árvores sem SKILL.md e frontmatter inválido. O criador produziu derivado descartável com 26 arquivos Claude no primeiro commit e check aprovado; testes de arquivo excluído do índice e hook recusando commit retornaram erro (1), como esperado. Não há bloqueador identificado para criar Maue. Ressalvas: parser aceita somente o subconjunto de frontmatter documentado; check compara estrutura e espelhos, enquanto a integridade contra HEAD é exigida no apply; não foram revalidados checkout em outra máquina, concorrência de escritores ou travamentos reais do sistema. Registros anteriores de revisão pendente referem-se às versões anteriores. Alterações preexistentes foram preservadas, inclusive package.json, package-lock.json e settings locais. Integração ao npm run check permanece tarefa separada.
  - **No template:** `--check` = 0, `--apply` = 0 sem escrita e `git diff --quiet HEAD` em `.claude/skills` e `.agents/skills`. As 15 skills Cesium passaram a aparecer na lista de skills da sessão do Claude Code depois da migração.
  - **Registro histórico:** `sync-skills.cjs`, em fixtures descartáveis com espaço e "ç" no caminho: 75 testes aprovados na implementação anterior do validador. O formato atual rejeita frontmatter multilinha. Os testes históricos cobriram:
    - raiz aninhada;
    - fonte com arquivo ignorado, alterado, staged, ausente, não rastreado ou escondido por `assume-unchanged`;
    - espelho ausente, com falhas em 7 pontos;
    - espelho existente, com falhas em 9 pontos: antes, durante e depois do staging, entre backup e troca, depois da troca e antes da limpeza;
    - falha durante a própria recuperação;
    - árvores idênticas sem `SKILL.md` válido e 8 variações de frontmatter inválido;
    - aceitação do frontmatter em várias linhas (estilo `agent/skills`);
    - repetição sem efeito depois de aplicar;
    - preservação de conteúdo alterado ou desconhecido, inclusive escondido do `git status`;
    - junctions, resíduos e skill que só existe no espelho.
  - **`new-project.ps1`, num clone descartável e a partir do template:**
    - o derivado tem 26 + 26 arquivos no commit, com blobs iguais aos canônicos do template;
    - `--check` = 0 antes e depois de mover o derivado;
    - arquivo deixado fora do índice por regra de exclusão: aborta sem commit;
    - hook recusando o commit: termina com erro;
    - aborta antes do `git init` com divergência real da cópia, frontmatter inválido, link ou fonte vazia.
  - **Não verificados:** colisão de maiúsculas e minúsculas (o NTFS não permite criá-la), checkout em outra máquina e caminhos não ASCII dentro das skills no `new-project.ps1` (o PowerShell 5.1 decodifica a saída do Git pela página de código do console; as skills atuais só têm nomes ASCII). Pendente, em tarefa separada por haver alterações preexistentes em `package.json`: incluir `node scripts/sync-skills.cjs --check` no `npm run check`. Retorno seguro: `git restore -- scripts/new-project.ps1 AGENTS.md docs/CESIUM_VECTOR_TILES_2026.md docs/DECISOES.md` e remoção de `scripts/sync-skills.cjs`, mediante autorização; `.claude/skills` não tem diff a desfazer.


## 2026-11-16 — Vetores do Maue

- **Estado:** configurados no projeto derivado, sem commit ou publicação.
- **Decisão:** servir cinco cópias de visualização em public/geojson, sem dependência de upload ao R2. Reutilizados o preparador e os carregadores existentes; sem alteração de Cesium ou código genérico. Somente Bing e ortofoto ligados na abertura.
- **Origem e transformações:** arquivos mestres em C:/Users/Usuario/Desktop/MAUE/webgis/geojson, intactos. Hashes, contagens, atributos originais e mapeamento por source_ref em docs/maue-geojson-provenance.json. Fontes declaram CRS84 (longitude/latitude). Perímetro SIGEF decodificado de Windows-1252 para UTF-8; demais fontes UTF-8. Preparador aplica coordenadas 2D com 7 casas, conversão de unidades, cotas das curvas, classificação das microbacias e comprimentos da drenagem; STRAHLER e STREAM_ID preservados. Nomes das ramas preservados de Name e do perímetro de nome_area. Estatísticas numéricas das ramas tipadas sem recalcular valores. Remoção de Z somente para renderização drapeada; datum vertical não informado, sem alegação de transformação altimétrica ou precisão cadastral.
- **Autorização:** responsável, pedido “bora configurar os geojson”. Sem commit, push ou deploy.
- **Validação:** verificadas contagens, tipos de geometria, referência por feição, ordem de Strahler e hashes dos mestres antes/depois. Testes da aplicação e conferência visual relatados na entrega. Para desfazer, retirar somente as cinco entradas de vetores e suas cópias/registro de proveniência, preservando as alterações anteriores do Maue.
