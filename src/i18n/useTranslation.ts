import { strings, type StringKey } from "@/i18n/strings";

export function useTranslation() {
  return { t: (key: StringKey): string => strings[key] };
}
