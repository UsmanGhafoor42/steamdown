import { applyPatch, applyPatches } from "./applyPatches";
import type { Patch } from "./types";

type DiffOp =
  | { type: "equal"; value: string }
  | { type: "insert"; value: string }
  | { type: "delete"; value: string };

const CONTEXT_WINDOW = 32;

function units(text: string) {
  return text.split("");
}

function suffixContext(text: string) {
  return text.slice(Math.max(0, text.length - CONTEXT_WINDOW));
}

function prefixContext(text: string) {
  return text.slice(0, CONTEXT_WINDOW);
}

function coalesceOperations(operations: DiffOp[]) {
  const merged: DiffOp[] = [];

  for (const operation of operations) {
    const previous = merged[merged.length - 1];

    if (previous && previous.type === operation.type) {
      previous.value += operation.value;
      continue;
    }

    merged.push({ ...operation });
  }

  return merged;
}

function myersDiff(sourceText: string, targetText: string): DiffOp[] {
  if (sourceText === targetText) {
    return sourceText === ""
      ? []
      : [{ type: "equal", value: sourceText }];
  }

  const source = units(sourceText);
  const target = units(targetText);
  const sourceLength = source.length;
  const targetLength = target.length;
  const max = sourceLength + targetLength;
  const offset = max;
  const frontier = new Int32Array(2 * max + 3);
  const traces: Int32Array[] = [];

  for (let depth = 0; depth <= max; depth += 1) {
    for (let diagonal = -depth; diagonal <= depth; diagonal += 2) {
      const diagonalIndex = offset + diagonal;
      let x =
        diagonal === -depth ||
        (diagonal !== depth &&
          frontier[diagonalIndex - 1] < frontier[diagonalIndex + 1])
          ? frontier[diagonalIndex + 1]
          : frontier[diagonalIndex - 1] + 1;
      let y = x - diagonal;

      while (
        x < sourceLength &&
        y < targetLength &&
        source[x] === target[y]
      ) {
        x += 1;
        y += 1;
      }

      frontier[diagonalIndex] = x;

      if (x >= sourceLength && y >= targetLength) {
        traces.push(frontier.slice());
        const operations: DiffOp[] = [];
        let currentX = sourceLength;
        let currentY = targetLength;

        for (let currentDepth = depth; currentDepth > 0; currentDepth -= 1) {
          const previousFrontier = traces[currentDepth - 1];
          const currentDiagonal = currentX - currentY;
          const previousDiagonal =
            currentDiagonal === -currentDepth ||
            (currentDiagonal !== currentDepth &&
              previousFrontier[offset + currentDiagonal - 1] <
                previousFrontier[offset + currentDiagonal + 1])
              ? currentDiagonal + 1
              : currentDiagonal - 1;
          const previousX = previousFrontier[offset + previousDiagonal];
          const previousY = previousX - previousDiagonal;

          while (currentX > previousX && currentY > previousY) {
            operations.push({
              type: "equal",
              value: source[currentX - 1],
            });
            currentX -= 1;
            currentY -= 1;
          }

          if (currentX === previousX) {
            operations.push({
              type: "insert",
              value: target[currentY - 1],
            });
            currentY -= 1;
          } else {
            operations.push({
              type: "delete",
              value: source[currentX - 1],
            });
            currentX -= 1;
          }
        }

        while (currentX > 0 && currentY > 0) {
          operations.push({
            type: "equal",
            value: source[currentX - 1],
          });
          currentX -= 1;
          currentY -= 1;
        }

        while (currentX > 0) {
          operations.push({
            type: "delete",
            value: source[currentX - 1],
          });
          currentX -= 1;
        }

        while (currentY > 0) {
          operations.push({
            type: "insert",
            value: target[currentY - 1],
          });
          currentY -= 1;
        }

        return coalesceOperations(operations.reverse());
      }
    }

    traces.push(frontier.slice());
  }

  return [];
}

function patchesFromOperations(currentText: string, operations: DiffOp[]) {
  const patches: Patch[] = [];
  let workingText = currentText;
  let workingIndex = 0;

  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];

    if (operation.type === "equal") {
      workingIndex += operation.value.length;
      continue;
    }

    let find = "";
    let replace = "";

    while (index < operations.length && operations[index].type !== "equal") {
      const currentOperation = operations[index];

      if (currentOperation.type === "delete") {
        find += currentOperation.value;
      } else {
        replace += currentOperation.value;
      }

      index += 1;
    }

    const liveFind = workingText.slice(workingIndex, workingIndex + find.length);
    const before = suffixContext(workingText.slice(0, workingIndex));
    const after = prefixContext(
      workingText.slice(workingIndex + liveFind.length),
    );
    const patch: Patch = {
      find: liveFind,
      replace,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    };

    patches.push(patch);
    workingText =
      workingText.slice(0, workingIndex) +
      replace +
      workingText.slice(workingIndex + liveFind.length);
    workingIndex += replace.length;

    if (index < operations.length && operations[index].type === "equal") {
      workingIndex += operations[index].value.length;
    }
  }

  return patches;
}

export function diffToPatches(currentText: string, targetText: string): Patch[] {
  return patchesFromOperations(currentText, myersDiff(currentText, targetText));
}

export function expandPatchForAnimation(currentText: string, patch: Patch) {
  if (patch.find === "") {
    return [patch];
  }

  const minimalPatches = diffToPatches(patch.find, patch.replace);

  if (minimalPatches.length === 0) {
    return patch.find === patch.replace ? [] : [patch];
  }

  const patchedWithOriginal = applyPatch(currentText, patch);
  const patchedWithMinimal = applyPatches(currentText, minimalPatches);

  return patchedWithMinimal === patchedWithOriginal ? minimalPatches : [patch];
}

export function getPatchedText(currentText: string, patches: Patch[]) {
  return applyPatches(currentText, patches);
}
