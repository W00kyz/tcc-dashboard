---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/AppNav.tsx"]
---

# Painel de gestão — shell e todas as páginas

Escopo: o dashboard inteiro (shell, login, operação, planejamento, cadastros, admin). Modo: Operate.
Público: gestores e admins da Prefeitura Universitária; desktop no escritório, celular em campo.
Restrições: só tema claro; neutro, sem marca oficial; shadcn; sidebar agrupada em poucos módulos; textos pt-BR do i18n; testes de comportamento.

## Direction contract

THESIS: O painel se orienta como o campus. Ele recusa o admin genérico de cards de KPI cinza: módulos são placas de sinalização, rotas são linhas de percurso, exceções acendem em amarelo-placa.

OWN-WORLD: Chão neutro frio #f4f5f2, superfícies brancas, azul-placa #14213d (sidebar e ações primárias), amarelo-placa #e9b949 só para contadores e atenção, tinta #2b2d31. Overpass (letra de sinalização viária) em escala estrita; números tabulares. Cantos de 4–6px, filetes de 1px, sem sombras decorativas. Chips de código em placas sólidas.

STORY: O gestor abre o quadro, vê primeiro o que está atrasado ou alertando, segue a linha de percurso de cada rota até a parada problemática e age (reconhecer, resolver, reatribuir). Os cadastros e a administração ficam recolhidos em módulos.

FIRST VIEWPORT: Sidebar azul-placa de 240px com os módulos Operação, Planejamento, Relatórios, Cadastros e Administração (recolhíveis, o módulo ativo aberto, contadores amarelos). Topo com trilha módulo/página. Título "Quadro de rotas" e data, ações "Nova rota"/"Nova rota ocasional" à direita. Filtros em linha. Alertas abertos. Lista de rotas, cada uma com a linha de percurso de discos numerados.

FORM: Sinalização de campus, candidato 1 da lista ordenada (escolha do usuário: IMPECCABLE'S PICK); seed key 9a98bf45.

SIGNATURE: a linha de percurso (discos numerados ligados por um traço, cheio até a última parada feita, vermelho na parada atrasada), usada no quadro, no construtor de rotas e nos templates. Movimento: o traço preenche até a parada atual numa transição ease-out única quando o status muda.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
