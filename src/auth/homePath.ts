import type { Session } from "@/auth/AuthContext";

/** Where a signed-in user lands: a field worker's only panel page is "Meus dados" (RNF10);
 * everyone else starts on the route board.
 * @example homePathFor("MANAGER") // "/rotas" */
export function homePathFor(role: Session["role"]): string {
  return role === "FIELD_WORKER" ? "/meus-dados" : "/rotas";
}
