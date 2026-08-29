/** Textos visíveis ao usuário (RNF02, pt-BR). Um dicionário tipado — sem framework externo:
 * o sistema tem um só idioma nesta fase, e a regra que importa é "nunca string fixa no
 * componente", não suporte a troca de locale em runtime. */
export const strings = {
  loginTitle: "Monitoramento de Rotas",
  loginSubtitle: "PU · UFCG",
  loginEmailLabel: "E-mail",
  loginPasswordLabel: "Senha",
  loginSubmit: "Entrar",
  loginSubmitPending: "Entrando…",
  loginInvalidCredentials: "E-mail ou senha incorretos.",
  loginEmailInvalid: "Informe um e-mail válido.",
  loginPasswordRequired: "Informe sua senha.",
  routeBoardTitle: "Rotas de hoje",
  routeBoardLoading: "Carregando rotas…",
  routeBoardError: "Não foi possível carregar as rotas.",
  routeBoardEmpty: "Nenhuma rota atribuída para hoje.",
  routeBoardNotStarted: "Não iniciada",
  routeStartedAtPrefix: "Iniciada às",
} as const;

export type StringKey = keyof typeof strings;
