import { screen, within } from "@testing-library/react";

/**
 * The list row (role "listitem") that shows `text`, found the way a reader scans a list
 * instead of by walking the DOM. Throws when no row matches, so a failing lookup reads as a
 * failing assertion.
 *
 * @example within(listItemWithText("Sala 101")).getByRole("button", { name: "Promover" })
 */
export function listItemWithText(text: string): HTMLElement {
  const row = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(text) !== null);
  if (row === undefined) {
    throw new Error(`No list item shows "${text}"; expected a row containing that text.`);
  }

  return row;
}
