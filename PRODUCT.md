# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Gestores (MANAGER)** da Prefeitura Universitária da UFCG: planejam e acompanham as rotas diárias dos profissionais de campo (limpeza, manutenção, serviços), tratam alertas de atraso, revisam execuções e mantêm os cadastros do campus. Usam o painel principalmente no desktop do escritório durante o expediente e também consultam pelo celular quando estão em campo.
- **Administradores (ADMIN)**: tudo o que o gestor faz, mais gestão de usuários e configurações do sistema.
- **Profissionais de campo (FIELD_WORKER)**: trabalham pelo app móvel (`tcc-mobile`); no painel só acessam "Meus dados" (RNF10).

## Product Purpose

Painel de gestão do sistema de monitoramento de rotas da Prefeitura Universitária da UFCG. Torna visível, em tempo real, se o trabalho de campo planejado está sendo cumprido: em que rota cada profissional está, quais paradas foram feitas, o que está atrasado e o que precisa de revisão. Sucesso: o gestor percebe um problema (atraso, alerta, execução pendente) e age sobre ele sem caçar informação.

## Positioning

Ferramenta interna de uma universidade pública, ligada ao modelo real do campus (prédios, andares, pontos de serviço, empresas terceirizadas, formulários de execução com evidências). Não é um produto comercial.

## Operating Context

- Rotina diária: o quadro de rotas (`/rotas`) fica aberto durante o expediente, alimentado por SSE (com fallback de polling).
- Fluxos: criar rotas regulares e ocasionais, gerir templates de rota, reatribuir rotas, configurar regras de alerta, revisar execuções (fila "pendente de revisão"), consultar relatórios e notificações.
- Cadastros: pontos de serviço, prédios e andares, eventos, profissionais, empresas terceirizadas, tipos de serviço, formulários.
- Administração: usuários e configurações.
- Desktop é o caso principal; o celular é secundário, mas precisa funcionar.

## Capabilities and Constraints

- React 19, TypeScript, Vite, Tailwind v4, componentes shadcn (estilo new-york, `radix-ui`, ícones lucide).
- Todo texto visível em pt-BR, vindo de `src/i18n/strings.ts`; os testes consultam por esses textos.
- Cliente da API gerado a partir do OpenAPI; não se escrevem tipos à mão.
- Papéis restringem rotas: MANAGER/ADMIN no painel; só ADMIN em usuários e configurações.
- Só tema claro (decisão de 2026-10-11).

## Brand Commitments

- Tom institucional, sóbrio e neutro: **sem** identidade oficial da UFCG (sem brasão nem cores oficiais).
- Navegação por sidebar, com as funcionalidades agrupadas em poucos módulos para evitar uma lista longa de opções.

## Evidence on Hand

- Nenhum logo nem asset de marca. Não inventar marca, números ou depoimentos.

## Product Principles

1. Exceções primeiro: atrasos, alertas e execuções pendentes têm que ser percebidos antes de qualquer outra coisa.
2. Densidade com clareza: o gestor varre muitas rotas e registros; escaneabilidade vale mais que decoração.
3. Agrupar por trabalho, não por tabela: a navegação reflete os módulos de trabalho do gestor.
4. Institucional não é burocrático: sóbrio e confiável, mas moderno e rápido.

## Accessibility & Inclusion

- Navegação completa por teclado, foco visível, contraste WCAG AA; status nunca comunicado só por cor.
