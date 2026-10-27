/** True when this worker added the certification themselves (not Tamay / management). */
export function isSelfUploadedCertification(
  cert: { created_by?: string | null },
  workerId?: string | null,
) {
  return Boolean(workerId && cert.created_by === workerId)
}
