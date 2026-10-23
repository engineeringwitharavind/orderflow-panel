// One id per tab for the life of the page. Tags broadcasts so a tab can ignore
// its own echoes, and breaks ties between concurrent edits.
export const TAB_ID: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
