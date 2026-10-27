import { createCertificationProofUrl } from '@/features/data/certifications'
import { viewDocumentFile } from '@/features/data/documents'
import { supabase } from '@/lib/supabase'
import type { DocumentRecord } from '@/types/database'

export function deleteRequestOpenLabel(target?: string | null) {
  return target === 'certification' ? 'Open certification' : 'Open document'
}

/** Opens the file or proof the worker asked to delete so admin can check it first. */
export async function openDeleteRequestTarget(meta: {
  documentId?: string | null
  certificationId?: string | null
}) {
  if (meta.certificationId) {
    const { data, error } = await supabase
      .from('certifications')
      .select('id, name, document_url')
      .eq('id', meta.certificationId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('This certification is no longer available.')
    if (!data.document_url) throw new Error('This certification has no proof file to open.')
    const url = await createCertificationProofUrl(data.document_url)
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  if (meta.documentId) {
    const { data, error } = await supabase.from('documents').select('*').eq('id', meta.documentId).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('This document is no longer available.')
    await viewDocumentFile(data as DocumentRecord)
    return
  }

  throw new Error('This delete request has no file to open.')
}
