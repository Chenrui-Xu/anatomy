export function describeDial({ index, reading, settled, perTurn = 20 }) {
  if (!Number.isFinite(reading) || !Number.isFinite(perTurn) || perTurn <= 0) throw new TypeError("Invalid dial reading");
  const value = reading.toFixed(1);
  const position = index < 0 ? "The probe centre is between blocks." : `Block ${index + 1} is under the probe centre.`;
  return {
    summary: `${position} The needle currently reads ${value} px of travel.${settled ? " The mechanism is at rest." : " The mechanism is still settling."}`,
    carriage: "The carriage moves the three blocks beneath the fixed gauge. Moving to a different block changes the surface under the probe.",
    plunger: `The plunger is ${value} px above the carriage surface. It rises or falls as the probe follows the block below it.`,
    needle: `One turn represents ${perTurn} px of plunger travel. ${value} px corresponds to ${(reading / perTurn).toFixed(3)} turns of the needle.`,
  };
}
