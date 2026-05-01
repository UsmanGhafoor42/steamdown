import type { Patch } from "./types";

export type PatchRange = {
  start: number;
  end: number;
  patch: Patch;
};

function hasContextAt(text: string, start: number, end: number, patch: Patch) {
  if (patch.before !== undefined) {
    const beforeStart = start - patch.before.length;

    if (beforeStart < 0 || text.slice(beforeStart, start) !== patch.before) {
      return false;
    }
  }

  if (patch.after !== undefined) {
    if (text.slice(end, end + patch.after.length) !== patch.after) {
      return false;
    }
  }

  return true;
}

function hasInsertionContextAt(text: string, index: number, patch: Patch) {
  if (patch.before !== undefined) {
    const beforeStart = index - patch.before.length;

    if (beforeStart < 0 || text.slice(beforeStart, index) !== patch.before) {
      return false;
    }
  }

  if (patch.after !== undefined) {
    if (text.slice(index, index + patch.after.length) !== patch.after) {
      return false;
    }
  }

  return true;
}

function findInsertionIndex(text: string, patch: Patch) {
  if (patch.before !== undefined && patch.before !== "") {
    let searchFrom = 0;

    while (searchFrom <= text.length) {
      const beforeIndex = text.indexOf(patch.before, searchFrom);

      if (beforeIndex === -1) {
        break;
      }

      const insertionIndex = beforeIndex + patch.before.length;

      if (hasInsertionContextAt(text, insertionIndex, patch)) {
        return insertionIndex;
      }

      searchFrom = beforeIndex + 1;
    }
  }

  if (patch.after !== undefined && patch.after !== "") {
    let searchFrom = 0;

    while (searchFrom <= text.length) {
      const afterIndex = text.indexOf(patch.after, searchFrom);

      if (afterIndex === -1) {
        break;
      }

      if (hasInsertionContextAt(text, afterIndex, patch)) {
        return afterIndex;
      }

      searchFrom = afterIndex + 1;
    }
  }

  return hasInsertionContextAt(text, 0, patch) ? 0 : null;
}

export function findPatchRange(text: string, patch: Patch): PatchRange | null {
  if (patch.find === "") {
    const index = findInsertionIndex(text, patch);

    if (index === null) {
      return null;
    }

    return {
      start: index,
      end: index,
      patch,
    };
  }

  let searchFrom = 0;

  while (searchFrom <= text.length) {
    const start = text.indexOf(patch.find, searchFrom);

    if (start === -1) {
      return null;
    }

    const end = start + patch.find.length;

    if (hasContextAt(text, start, end, patch)) {
      return {
        start,
        end,
        patch,
      };
    }

    searchFrom = start + 1;
  }

  return null;
}

export function findPatchRangesInDocumentOrder(
  text: string,
  patches: Patch[],
): PatchRange[] {
  return patches
    .map((patch, order) => {
      const range = findPatchRange(text, patch);

      return range ? { ...range, order } : null;
    })
    .filter((range): range is PatchRange & { order: number } => range !== null)
    .sort((left, right) => left.start - right.start || left.order - right.order)
    .map((range) => ({
      start: range.start,
      end: range.end,
      patch: range.patch,
    }));
}

export function sortPatchesInDocumentOrder(
  text: string,
  patches: Patch[],
): Patch[] {
  return findPatchRangesInDocumentOrder(text, patches).map(
    (range) => range.patch,
  );
}

export function applyPatchAtRange(text: string, range: PatchRange): string {
  return (
    text.slice(0, range.start) +
    range.patch.replace +
    text.slice(range.end)
  );
}

export function applyPatch(text: string, patch: Patch): string {
  const range = findPatchRange(text, patch);

  if (!range) {
    return text;
  }

  return applyPatchAtRange(text, range);
}

export function applyPatches(text: string, patches: Patch[]): string {
  return patches.reduce(
    (current, patch) => applyPatch(current, patch),
    text,
  );
}

export function applyPatchesInDocumentOrder(text: string, patches: Patch[]) {
  const sortedPatches = sortPatchesInDocumentOrder(text, patches);

  return sortedPatches.reduce(
    (current, patch) => applyPatch(current, patch),
    text,
  );
}
