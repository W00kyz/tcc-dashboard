---
name: Rotas do Campus
description: Painel de gestão das rotas de manutenção da Prefeitura Universitária, sinalizado como o próprio campus.
colors:
  sign-blue: "#14213d"
  sign-yellow: "#e9b949"
  sign-yellow-soft: "#fbf1d3"
  campus-ground: "#f4f5f2"
  plate-white: "#ffffff"
  ink: "#1f2329"
  muted-ink: "#5a5f68"
  muted-field: "#eceee9"
  accent-field: "#eef1f6"
  hairline: "#dcdfe4"
  input-stroke: "#c5cad3"
  rail-text: "#d3d9e6"
  rail-muted: "#8f9ab4"
  rail-hover: "#1f2e50"
  status-pending: "#6b7079"
  status-progress: "#8a5a00"
  status-progress-soft: "#fbf1d3"
  status-done: "#23683f"
  status-done-soft: "#e2f0e6"
  status-late: "#b3261e"
  status-late-soft: "#fbe7e5"
typography:
  headline:
    fontFamily: "Separator Dot, Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Separator Dot, Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Separator Dot, Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "Separator Dot, Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.08em"
  disc-numeral:
    fontFamily: "Separator Dot, Overpass, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.5625rem"
    fontWeight: 700
    lineHeight: 1
rounded:
  marker: "2px"
  plate: "3px"
  control: "6px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.sign-blue}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.control}"
    height: "36px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
  input-field:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.sign-blue}"
    rounded: "{rounded.control}"
    height: "36px"
  count-badge:
    backgroundColor: "{colors.sign-yellow}"
    textColor: "{colors.sign-blue}"
    rounded: "{rounded.pill}"
  status-plate-late:
    backgroundColor: "{colors.status-late-soft}"
    textColor: "{colors.status-late}"
    rounded: "{rounded.plate}"
  code-plate:
    backgroundColor: "{colors.sign-blue}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.plate}"
---

# Design System: Rotas do Campus

## Overview

**Creative North Star: "O Campus Sinalizado"**

O painel se orienta como o campus que ele administra. A navegação é um poste de sinalização azul, as páginas são placas brancas sobre um chão neutro e frio, e o que pede atenção acende em amarelo, como uma placa de obra. Cada rota é desenhada como uma linha de percurso, com discos numerados ligados por um traço que se preenche até a última parada concluída.

É uma ferramenta de trabalho, então a densidade é alta e a decoração é quase nenhuma. O caráter vem da letra de sinalização viária (Overpass), das placas de cantos quase retos e da disciplina de cor: azul para estrutura e ação, amarelo só para contagem e atenção, e as cores de estado sempre acompanhadas de palavra e ícone. O tom é institucional e sóbrio, sem identidade oficial da UFCG.

**Key Characteristics:**

- Trilho lateral azul-placa com módulos recolhíveis; o item ativo é uma placa branca.
- Chão #f4f5f2 com superfícies brancas e filetes de 1px; sem sombras decorativas.
- Linha de percurso (discos numerados + traço) como assinatura recorrente.
- Amarelo-placa reservado para contadores e "precisa de atenção".
- Números tabulares em todo o painel.

## Colors

Neutros frios do campus, um azul de sinalização que carrega a estrutura e um amarelo de placa usado com parcimônia.

### Primary

- **Azul-Placa** (sign-blue): trilho lateral, títulos de página e de painel, botão primário, discos de paradas concluídas, chips de código (tipo de rota, versão, dias da semana).

### Secondary

- **Amarelo-Placa** (sign-yellow): contadores (fila de revisão, notificações, alertas), marcador de não lida, cor de seleção de texto. O texto sobre ele é sempre azul-placa, nunca branco.

### Neutral

- **Chão do Campus** (campus-ground): fundo de toda página autenticada e do login.
- **Placa Branca** (plate-white): painéis, cards de rota, tabelas, campos de formulário.
- **Tinta** (ink) e **Tinta Apagada** (muted-ink): texto principal e secundário (contraste AA sobre branco).
- **Filete** (hairline) e **Traço de Campo** (input-stroke): bordas de painel e de controles.
- **Campo Neutro** (muted-field) e **Campo de Destaque** (accent-field): faixas de rodapé de card e hover.

### Status

- **Pendente / Em andamento / Concluído / Atrasado**: cada estado tem uma tinta e um fundo suave do mesmo tom (status-* e status-*-soft). O âmbar de "Em andamento" vem da especificação do quadro (IN_PROGRESS âmbar) e é uma cor de estado, não o amarelo-placa.

### Named Rules

**The Plate Yellow Rule.** O amarelo só marca contagem e atenção. Nunca é fundo de região nem cor de texto.

**The Word-Beside-Colour Rule.** Estado nunca é comunicado só por cor: todo badge de estado tem rótulo, e os críticos têm ícone.

## Typography

**Body Font:** Overpass (com ui-sans-serif, system-ui)
**Display/Label Font:** Overpass, em pesos 700–800

**Separator Dot:** face local (Arial/Liberation/DejaVu) restrita a U+00B7, listada antes da Overpass só para dar espaçamento correto ao separador "·".

**Character:** Uma única família, derivada da letra de sinalização viária, que vai de 800 nos títulos a 400 no corpo. A voz vem do peso, não de uma segunda família.

### Hierarchy

- **Headline** (800, 1.75rem, 1.25): o h1 de cada página, em azul-placa.
- **Title** (700, 1rem): títulos de painel e de card (nome do profissional, título do alerta).
- **Body** (400, 0.875rem, 1.5): texto, células de tabela, metadados.
- **Disc numeral** (700, 0.5625rem): só o número dentro dos discos de 18px da linha de percurso compacta (tabela). Não usar para texto corrido.
- **Label** (700, 0.6875rem, 0.08em, caixa alta): cabeçalhos de tabela, rótulos de módulo da sidebar, títulos de seção da gaveta.

### Named Rules

**The Tabular Rule.** Todo número (datas, contagens, coordenadas, horários) usa algarismos tabulares, para alinhar em colunas.

## Layout

O shell é uma sidebar de 16rem (gaveta Sheet abaixo de 768px) com um topo fixo de 56px que mostra a trilha módulo › página. O conteúdo ocupa colunas com três larguras: estreita (48rem) para formulários, padrão (64rem) e larga (80rem) para quadros e tabelas, com respiro de 16px no celular e 32px no desktop.

Os padrões recorrentes são: o quadro com o "Mapa da operação" como peça central (altura min(62vh, 40rem)) e o trilho de alertas de 22rem ao lado, seguido da tabela de rotas agrupada por empresa, os cadastros com lista à esquerda e formulário "Novo cadastro" num painel de 20rem à direita, e os construtores (rota, template) com dados à esquerda (20rem) e pontos à direita. No celular tudo empilha: mapa, alertas e por fim a tabela, cujas linhas se reorganizam em blocos compactos.

## Elevation & Depth

O sistema é plano. A profundidade vem de camadas tonais (chão → placa branca → faixa de rodapé em campo neutro) e de filetes de 1px. Sombra só aparece em camadas que flutuam sobre a página: diálogos e a gaveta de detalhes.

### Shadow Vocabulary

- **Camada flutuante** (`box-shadow: 0 24px 48px -16px rgb(20 33 61 / 0.35)`): diálogos.
- **Gaveta lateral** (`box-shadow: -8px 0 24px -12px rgb(20 33 61 / 0.35)`): gaveta de detalhes da execução.

### Named Rules

**The Flat Plate Rule.** Painéis e cards em repouso não têm sombra: só borda de 1px.

## Shapes

Cantos quase retos, como placas esmaltadas: 2px nos marcadores quadrados de ponto de serviço no mapa, 3px em badges de estado e chips de código, 6px em controles, painéis e cards. Círculos ficam reservados para os discos da linha de percurso e para os contadores.

## Components

### Buttons

- **Shape:** cantos suaves (6px), altura 36px (32px no tamanho sm).
- **Primary:** fundo azul-placa, texto branco; é a ação principal da página (Nova rota, Salvar, Gerar).
- **Outline:** fundo branco com borda, para ações secundárias.
- **Ghost:** barra de ações do card de rota, com só as ações frequentes visíveis (Editar, Reatribuir). As raras (Otimizar, Concluir sem evidência, Cancelar) ficam no menu "Mais ações", e Cancelar é o item destrutivo. Rotas encerradas não mostram barra.
- **Focus:** anel de 3px em azul-placa a 50%.

### Badges

- **State plates:** cantos de 3px, tinta sobre fundo suave do mesmo tom (pending, progress, done, late).
- **Signal:** pílula amarela com texto azul, para contagem e "Não lida".
- **Code plate:** placa azul sólida com texto branco (Eventual, v2, Seg/Qua/Sex).

### Cards / Containers

- **Painel:** placa branca, borda de 1px, cantos de 6px, cabeçalho com título em azul-placa separado por filete.
- **Card de rota:** cabeçalho (nome + estados), linha de progresso, linha de percurso e faixa de ações em campo neutro. Uma rota atrasada ganha a borda na tinta de atraso a 50%.

### Inputs / Fields

- **Style:** campo branco, traço #c5cad3, 6px, altura 36px. Os selects são nativos estilizados (NativeSelect), e a data usa `<input type="date">`.
- **Focus:** borda azul-placa + anel de 3px.
- **Error:** mensagem curta na tinta de atraso sob o campo (FieldError); erros de página vêm numa faixa suave com ícone (ErrorMessage).

### Navigation

- Trilho azul-placa; rótulos de módulo em label (caixa alta, 0.6875rem, #8f9ab4) com chevron.
- Módulos: Operação (aberto por padrão), Planejamento, Cadastros e Administração (recolhidos). O módulo da página atual abre sozinho. Notificações não fazem parte da sidebar: ficam no sino do header, e a página aparece na trilha como Conta › Notificações.
- Item ativo: placa branca com texto azul em 600. Hover: #1f2e50. Contadores amarelos à direita do item.
- No celular a sidebar vira Sheet, aberta pelo botão do topo.
- Header (56px, fixo): botão da sidebar, trilha e, no canto direito, o sino de notificações. O sino tem contador amarelo-placa (99+ no máximo) e abre um menu com as 6 notificações mais recentes, "Marcar todas como lidas" e "Ver todas as notificações". As não lidas aparecem com ponto amarelo e fundo signal-soft. O sino fica oculto para profissional de campo.

### Faixa de KPIs

Uma única placa dividida por filetes de 1px (grade com `gap-px` sobre a cor do filete): 6 células em telas largas, 3 em tablet, 2 no celular. Cada célula tem rótulo em label, valor em 800 / 1.75rem em azul-placa e uma linha de detalhe. O valor só fica vermelho quando é exceção (atrasadas, alertas críticos), e um marcador amarelo indica algo a tratar (alertas, revisão pendente). Células que levam a algum lugar são links ou botões inteiros. Os números vêm do snapshot ao vivo, não dos filtros.

### Mapa da operação

Mapa Leaflet num painel branco com legenda, pensado para 50 a 100 profissionais. Marcadores: azul-placa para quem está em campo; vermelho (status-late, raio maior e rótulo "· atrasada") para rota atrasada; cinza para posição com mais de 15 min. Atraso vence desatualização. Só atrasados e o profissional selecionado têm rótulo fixo; os demais mostram o nome ao passar o mouse. A seleção ganha um halo branco grosso, nunca uma cor nova. Clicar num marcador destaca a linha da tabela e desliza a vista até o profissional (flyTo de 0,8 s, aproximando até o nível 18 se estiver mais longe; salto sem animação com "reduzir movimento"); clicar numa linha ou no botão "Localizar" destaca o marcador. O mapa abre enquadrando o campus da UFCG, e essa vista é o zoom mínimo: dá para aproximar (até o nível 19), nunca afastar além do campus, e o arraste para na borda do campus. O zoom fracionário faz o campus preencher o painel em qualquer tamanho.

### Prédios no mapa

Os prédios cadastrados aparecem no mapa da operação como polígonos, abaixo dos marcadores dos profissionais. Com contorno vinculado do OpenStreetMap: borda azul-placa de 1,5px e preenchimento azul-placa a 12%. Sem contorno e com 3 ou mais pontos de serviço: a envoltória convexa dos pontos, com a mesma tinta, mas borda tracejada (4 4) e a legenda "Área aproximada (pelos pontos)"; com menos de 3 pontos o prédio não aparece, e uma nota sob o mapa explica. Clicar num prédio desliza a vista até ele caber (flyToBounds de 0,8 s, salto sem animação com "reduzir movimento"): o selecionado ganha borda de 3px, preenchimento a 30% e o nome fixo no centro, e os demais esmaecem para borda cinza de 1px e preenchimento a 5%. Esc, "Voltar aos alertas" ou um clique fora de qualquer prédio fecham o painel e devolvem a vista que o mapa tinha antes de o prédio abrir (voo de 0,8 s; salto sem animação com "reduzir movimento"). Trocar de um prédio para outro mantém a vista anterior ao primeiro.

Com um prédio aberto, os pontos de serviço do andar escolhido viram marcadores quadrados de 14px (cantos de 2px, borda branca de 2px), para não se confundirem com os discos dos profissionais. A cor segue os estados do sistema: feito verde (#23683f), em andamento âmbar (#8a5a00), atrasado vermelho (#b3261e), pendente cinza (#6b7079) e "sem visita hoje" branco com contorno cinza. O nome aparece ao passar o mouse e fica fixo no ponto selecionado; clicar num ponto da lista ou do mapa destaca o outro.

O painel "Prédio" ocupa o lugar do trilho de alertas (no celular, o do bloco de alertas abaixo do mapa). É uma placa branca com cabeçalho separado por filete: botão ghost "Voltar aos alertas", nome em azul-placa 700, área do campus e o resumo do dia ("6 pontos · 0 feitos · 0 atrasados"). Abaixo, abas por andar ("Todos" e um botão por andar, o ativo em azul-placa cheio) e a lista dos pontos, cada um com a plaquinha de estado (Pendente, Em andamento, Feito, Atrasado, Sem visita hoje). Erros de carga ficam dentro do painel e o resto do quadro segue funcionando.

### Contorno do prédio (página de Andares)

Seção "Contorno no mapa" em `/predios/:id/andares`, antes da lista de andares. Um mapa do campus (mesmos limites e zoom mínimo do mapa da operação) desenha os contornos de prédios do OpenStreetMap em cinza (borda de 1px, preenchimento a 15%) com o nome do OSM ao passar o mouse; o contorno já vinculado fica em azul-placa translúcido e não responde a clique. Clicar num contorno, ou no botão da lista "Prédios encontrados" ao lado (o caminho por teclado), o destaca com borda azul-placa de 3px e mostra "Contorno selecionado: nome" com o botão primário "Vincular a este prédio" ("Trocar contorno" quando já há um). "Remover contorno" é outline e pede confirmação. Contornos já ligados a outro prédio trazem "Já vinculado a …" no nome. Se a consulta ao OpenStreetMap falha, uma faixa de erro com "Tentar novamente" aparece e o contorno salvo continua visível. Na lista de Prédios, cada linha leva o selo "Contorno vinculado" ou "Sem contorno".

### Tabela de rotas

Uma linha densa por rota (cerca de 52px), com o mesmo template de colunas no cabeçalho fixo e em todas as linhas: profissional, situação, percurso (linha de percurso "sm", discos de 18px), próximo ponto, última posição e ações (ícones com nome acessível). Linhas agrupadas por empresa terceirizada, com cabeçalho recolhível e subtotais (rotas, atrasadas, % dos pontos). Ordem por urgência: atrasadas, com alerta, em andamento, planejadas, concluídas e canceladas. Empresas com atraso vêm primeiro e "Sem empresa vinculada" fica por último. Linhas atrasadas têm fundo status-late-soft; a selecionada tem anel azul-placa. Paginação de 10 linhas contadas entre todas as empresas, na ordem exibida; uma empresa dividida entre páginas mantém os subtotais da empresa inteira. Abaixo da tabela: "Mostrando X–Y de N rotas", Anterior/Próxima e "Página X de Y". Mudar qualquer filtro volta à página 1.

### Linha de Percurso (signature)

Discos de 24px numerados pela ordem da parada, ligados por um traço de 2px. Pendente: disco branco com traço cinza. Em andamento: disco branco com borda e anel azul-placa (o amarelo fica para contagem e atenção). Concluído: disco azul cheio, e o traço seguinte fica azul. A parada atual de uma rota atrasada fica vermelha. As cores fazem transição em 500ms ease-out quando o estado muda. A mesma gramática aparece nas linhas de template, numera as paradas nos construtores e ilustra o painel do login.

## Do's and Don'ts

### Do:

- **Do** abrir toda página com um `PageHeader` (h1 em azul-placa, 800) e as ações principais à direita.
- **Do** colocar listas e tabelas em painéis brancos com borda de 1px sobre o chão #f4f5f2.
- **Do** usar a linha de percurso sempre que uma sequência de paradas aparecer.
- **Do** usar ícones lucide, nunca glifos Unicode (×, ⠿, ◀).
- **Do** manter filtros e selects como controles nativos estilizados.

### Don't:

- **Don't** usar o amarelo-placa como fundo de região ou cor de texto.
- **Don't** comunicar estado só por cor.
- **Don't** pôr sombra em painéis ou cards em repouso.
- **Don't** usar a identidade oficial da UFCG (brasão, cores oficiais).
- **Don't** criar tema escuro: o painel é só claro (decisão do produto).
