// Plate display normalization shared by the form preview and server
// validation (BUSINESS_RULE 2.3): trimmed, uppercase, single spaces.
// The matching form is normalizePlate() in validations/common.ts.
export function displayPlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, " ");
}
export const vehicleTypeLabels = { motor: "Motor", mobil: "Mobil" } as const;
