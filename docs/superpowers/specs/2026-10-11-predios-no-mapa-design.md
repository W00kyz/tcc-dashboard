# Prédios no mapa da operação — design

Data: 2026-10-11 · Repositórios: `tcc-backend`, `tcc-dashboard` · Estado: implementado

## Objetivo

No mapa da operação (quadro de rotas), o gestor clica num prédio cadastrado: o mapa aproxima
até o prédio e um painel mostra as "áreas internas" — os andares e os pontos de serviço de cada
andar, com a situação de hoje de cada ponto.

### Decisões confirmadas com o usuário

- "Áreas internas" = andares + pontos de serviço (sem planta baixa).
- Contorno do prédio importado do OpenStreetMap; quando o prédio não tiver contorno, a área é
  derivada dos pontos de serviço dele.
- Abordagem 1: o painel consulta o OSM (Overpass API) só no momento do cadastro; o backend
  apenas armazena o polígono e nunca chama serviço externo.
- Armazenamento em JSONB (GeoJSON), não em coluna PostGIS.

### Fora de escopo

Planta baixa, desenho manual do contorno, consultas espaciais no backend, vínculo em lote.

## Parte 1 — Backend (`tcc-backend`)

### Modelo e migração

`Building` (`app/domain/catalog/models.py`) ganha três colunas, todas anuláveis:

| Coluna             | Tipo         | Conteúdo                                                                 |
| ------------------ | ------------ | ------------------------------------------------------------------------ |
| `footprint`        | JSONB        | Polígono GeoJSON `{"type": "Polygon", "coordinates": [[[lon, lat], …]]}` |
| `footprint_source` | `String(20)` | `"osm"`; nulo enquanto não há contorno (preparado para outras fontes)    |
| `osm_way_id`       | `BigInteger` | Id do _way_ OSM de onde veio o contorno                                  |

Migração Alembic nova adiciona as colunas sem default; prédios existentes ficam sem contorno.

### API (`app/api/buildings.py`)

- `BuildingOut` passa a incluir `footprint`, `footprint_source`, `osm_way_id`.
- `PUT /buildings/{building_id}/footprint` — corpo `{ "footprint": <Polygon>, "osm_way_id": int }`;
  grava as três colunas (`footprint_source = "osm"`) e devolve `BuildingOut`. 404 se o prédio não
  existe.
- `DELETE /buildings/{building_id}/footprint` — zera as três colunas; devolve `BuildingOut`.
- Ambos: `require_role(MANAGER, ADMIN)` e `record_audit_trail` (entity_type `building`,
  action `set_footprint` / `clear_footprint`, `before`/`after` com `osm_way_id`).
- Separado do `PATCH` de nome/área: o vínculo geográfico não se mistura com a edição cadastral.

### Validação (Pydantic)

Recusa com 422 qualquer contorno que não seja:

- `type == "Polygon"` com exatamente um anel (sem buracos);
- anel com 4 a 500 posições, fechado (primeira posição igual à última);
- cada posição `[lon, lat]` com `-180 ≤ lon ≤ 180` e `-90 ≤ lat ≤ 90`.

### Testes (pytest)

Grava, substitui e remove contorno; cada regra de validação devolve 422; profissional de campo
recebe 403; auditoria registrada; `GET /buildings` devolve os campos novos. Depois, regenerar
`../docs/api/openapi.json` e, no painel, `npm run generate:api`.

## Parte 2 — Vínculo do contorno no cadastro (`tcc-dashboard`)

### Onde

Na página de Andares de cada prédio (`/predios/:buildingId/andares`), nova seção
"Contorno no mapa".

### Comportamento

- Mapa do campus (mesmos limites e zoom mínimo do mapa da operação) com os contornos de prédios
  do OSM em cinza; nome do OSM ao passar o mouse.
- Contornos obtidos numa consulta Overpass para os limites do campus
  (`way["building"](bbox); out geom;`), feita ao abrir a seção e mantida em cache (React Query)
  durante a sessão.
- Clicar num contorno o destaca e mostra o nome OSM com o botão "Vincular a este prédio"
  ("Trocar contorno" se já houver um). Confirmar envia o `PUT`.
- Contorno já vinculado aparece em azul-placa. "Remover contorno" pede confirmação e envia o
  `DELETE`.
- Falha/timeout da Overpass: "Não foi possível carregar os contornos do OpenStreetMap. Tente
  novamente." com botão para tentar de novo; o contorno salvo continua visível.
- Lista de Prédios: selo "Contorno vinculado" / "Sem contorno" por prédio.

### Organização

- `src/lib/osmBuildings.ts` (TS puro, com teste): monta a consulta Overpass para um bbox e
  converte a resposta em `{ osmWayId, name, footprint }[]`, descartando geometrias inválidas
  (aberta, > 500 posições, sem geometria).
- `src/api/overpass.ts`: cliente fino com `fetch` injetável (testes nunca tocam a rede).
- Componente de mapa de vínculo próprio, separado de `WorkerPositionsMap`.
- Limites do campus (`CAMPUS_BOUNDS`) extraídos para um módulo compartilhado
  (`src/lib/campus.ts`) usado pelos dois mapas.

## Parte 3 — Clique no prédio no mapa da operação (`tcc-dashboard`)

### Contornos no mapa

- Prédio com contorno: polígono em azul-placa translúcido, abaixo dos marcadores dos
  profissionais.
- Prédio sem contorno com ≥ 3 pontos de serviço: envoltória convexa dos pontos, borda tracejada,
  legenda "Área aproximada".
- Prédio com < 3 pontos e sem contorno: não aparece; a legenda explica.

### Ao clicar num prédio

- O mapa desliza (`flyToBounds`, mesma animação e respeito a "reduzir movimento" do clique no
  profissional) até o prédio caber; o contorno fica destacado e os demais esmaecem.
- No lugar do trilho de alertas abre o painel "Prédio" com botão "Voltar" (devolve os alertas).

### Painel do prédio

- Cabeçalho: nome, área do campus e resumo do dia ("12 pontos · 7 feitos · 1 atrasado").
- Abas por andar ("Todos" + um por andar, na ordem de cadastro).
- Lista dos pontos do andar com a situação de hoje: pendente, em andamento, feito, atrasado ou
  "sem visita hoje".
- Clicar num ponto da lista destaca o marcador no mapa, e vice-versa.

### Pontos no mapa

Com um prédio aberto, os pontos do andar selecionado aparecem como marcadores quadrados (os
profissionais seguem circulares), nas cores de estado do sistema (feito verde, em andamento
âmbar, atrasado vermelho, pendente cinza, sem visita contorno neutro); nome ao passar o mouse.

### Dados

- Andares: `GET /floors?building_id=`; pontos: `GET /service-points?floor_id=` por andar.
- Situação de hoje: paradas das rotas do dia (já carregadas pelo quadro) cruzadas por
  `service_point_id`; "atrasado" quando a rota da parada está atrasada no snapshot e a parada é a
  atual (mesma regra da linha de percurso).
- Envoltória convexa e cruzamento ponto × situação em `src/lib/buildingInterior.ts` (TS puro,
  com teste).

### Fechar e responsividade

"Voltar", Esc ou clique fora de qualquer prédio fecham o painel e restauram a vista anterior. No
celular o painel do prédio substitui o bloco de alertas abaixo do mapa.

## Erros

- Andares/pontos não carregam: erro dentro do painel do prédio; o resto do quadro segue
  funcionando.
- Falha ao salvar contorno (422/rede): "Não foi possível salvar o contorno" com o motivo; o
  vínculo anterior é mantido.
- Geometrias inválidas do OSM são descartadas no painel e não aparecem como opção.

## Testes

- Backend: cenários da Parte 1.
- Painel, lógica pura: `osmBuildings.ts`, `buildingInterior.ts` (envoltória convexa, cruzamento).
- Painel, componentes (comportamento, Overpass fake): vincular/trocar/remover contorno; abrir o
  prédio, trocar de andar, ver situação dos pontos, voltar aos alertas.
- Navegador real: clicar num prédio e conferir zoom e marcadores.

## Ordem de entrega

1. Backend: modelo, migração, endpoints, validação, testes, OpenAPI.
2. Painel: vínculo do contorno no cadastro.
3. Painel: clique no prédio no mapa da operação e painel interno.

## Riscos conhecidos

- O backend não tem ambiente Python instalado nesta máquina; rodar pytest/alembic exige instalar
  Python 3.13 e as dependências (`uv sync`), o que baixa pacotes.
- `../docs/api/openapi.json` (fonte do `npm run generate:api`) não existe nesta máquina; será
  gerado a partir do backend (`app.openapi()`), o que também depende do ambiente Python.
- A Overpass pública tem limite de uso; a consulta é única por sessão de cadastro.
- `GET /service-points?floor_id=` por andar gera N requisições por prédio (N andares, tipicamente
  < 10); aceitável, revisitar se virar gargalo.
