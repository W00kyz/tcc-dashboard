# Contribuindo — tcc-dashboard

## Branches

| Prefixo     | Uso                                    |
| ----------- | -------------------------------------- |
| `feat/`     | funcionalidade nova                    |
| `fix/`      | correção de defeito                    |
| `chore/`    | ferramental, dependências, CI          |
| `docs/`     | documentação                           |
| `refactor/` | mudança sem alteração de comportamento |

Nome em inglês, kebab-case, referenciando o requisito quando houver:
`feat/rf29-qr-check-in`.

`main` é protegida. Nada entra por push direto.

## Commits

[Conventional Commits](https://www.conventionalcommits.org). Tipos permitidos:
`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `revert`.

```
feat(execution): validate check-in radius against service point

Cross-references the QR floor with the GPS fix and rejects the scan when the
distance exceeds the configured tolerance. Records NOT_VALIDATED instead of
failing when the GPS fix is unavailable (RNF07).

Refs: RF32, RNF07
```

Assunto em inglês, imperativo, minúsculo, sem ponto final, até 72 caracteres. Corpo
explica **por que**. Rodapé cita os requisitos atendidos.

O hook `commit-msg` valida. **Nunca contornar com `--no-verify`** — hook que rejeita é
sinal de corrigir a mudança, não a validação.

**Sem trailer `Co-Authored-By`**, mesmo em commit assistido por agente. O autor em
`git config user.name` responde pela mudança na revisão.

## Pull requests

Título segue a convenção de commit. A descrição diz o que mudou, por que, como testar,
e quais requisitos atendeu. CI verde é obrigatório.

## Contrato OpenAPI (AD-04)

```bash
npm run generate:api
```

Gera `src/api/generated/schema.d.ts` a partir de `../docs/api/openapi.json`
(publicado pelo `tcc-backend`, ver `backend/CONTRIBUTING.md`). Nunca editar esse
arquivo à mão — ele é regenerado inteiro a cada execução. Rodar de novo sempre que
o schema OpenAPI mudar, isto é, depois de qualquer mudança de request/response de
rota no `tcc-backend`.

## Testes end-to-end

```bash
npm run test:e2e
```

Rodam contra a stack real (`../infra/scripts/dev-up.sh`, ou `docker compose -f
../infra/docker-compose.yml up -d`), no banco de desenvolvimento. Cada spec cria os próprios
dados, marcados com "E2E" no nome (ou e-mail `e2e-`), e a execução os apaga no fim
(`e2e/support/cleanup.sql`). Durante a execução as Configurações viram dia de serviço a semana
toda, até 23:59:59; ao fim, a linha de configurações e as regras de alerta voltam exatamente como
estavam.

Para conferir que o banco termina a execução como começou:

```bash
e2e/support/db-snapshot.sh > antes.txt
npm run test:e2e
e2e/support/db-snapshot.sh | diff antes.txt -   # nenhuma diferença
```

## Versões

Todas travadas. Imagens Docker por digest, GitHub Actions por SHA, dependências por
versão exata, arquivos de lock commitados. PR que introduz `latest`, `^` ou `~` é
rejeitado.

## Antes de abrir PR

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

Os cinco precisam passar.
