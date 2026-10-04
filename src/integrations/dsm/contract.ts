/** Integration requirements, not an implemented DSM transport or policy schema. */
export interface DsmGameEvidence {
  holderIdentity: Uint8Array;
  parentCoordinate: Uint8Array;
  rulesCommitment: Uint8Array;
  operationEvidence: Uint8Array;
  consumedResourceDescriptors: readonly Uint8Array[];
}

/** Only the real Core/SDK may produce protocol acceptance. No local implementation exists. */
export type DsmSubmissionResult =
  | { kind: 'accepted'; canonicalReceipt: Uint8Array; successorCoordinate: Uint8Array }
  | { kind: 'invalid'; versionedError: Uint8Array }
  | { kind: 'pending-evidence' };

export interface DsmGameTransport {
  submit(evidence: DsmGameEvidence): Promise<DsmSubmissionResult>;
}
