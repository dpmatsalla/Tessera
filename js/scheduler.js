export const FAST_BATCH_BUDGET_MS = 20;
export const FAST_BATCH_MAX_TURNS = 100;

export function useFastComputerBatch(players, speed) {
  return Number(speed) === 1
    && players?.[1]?.type === "computer"
    && players?.[2]?.type === "computer";
}

export function batchShouldContinue(startedAt, now, turns) {
  return turns < FAST_BATCH_MAX_TURNS
    && now - startedAt < FAST_BATCH_BUDGET_MS;
}
