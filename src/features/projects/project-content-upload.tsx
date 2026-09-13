import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FilePickerButton, SelectedFilesList } from '@/components/ui/file-picker-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  usePostProjectDocumentsToThread,
  usePostProjectPhotosToThread,
  useUploadDocument,
} from '@/features/data/hooks'
import { formatUnknownError } from '@/lib/auth-errors'
import { DOCUMENT_KIND_OPTIONS, PHOTO_KIND_OPTIONS } from '@/lib/utils'
import { IMAGE_UPLOAD_ACCEPT, UPLOAD_ACCEPT, isImageUploadFile } from '@/lib/uploads'

export type ProjectUploadKind = 'photo' | 'document'

type Props = {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Shared Upload entry: PHOTO / DOCUMENT only.
 * Receipts upload lives exclusively in the Project receipts section.
 */
export function ProjectContentUploadDialog({ projectId, open, onOpenChange }: Props) {
  const uploadDocument = useUploadDocument()
  const postPhotosToThread = usePostProjectPhotosToThread()
  const postDocumentsToThread = usePostProjectDocumentsToThread()

  const [step, setStep] = useState<'choose' | ProjectUploadKind>('choose')
  const [files, setFiles] = useState<File[]>([])
  const [kindLabel, setKindLabel] = useState('')
  const [titleNote, setTitleNote] = useState('')

  const busy =
    uploadDocument.isPending || postPhotosToThread.isPending || postDocumentsToThread.isPending

  function reset() {
    setStep('choose')
    setFiles([])
    setKindLabel('')
    setTitleNote('')
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  async function submitPhotoOrDocument(kind: 'photo' | 'document') {
    if (files.length === 0) {
      toast.error(kind === 'photo' ? 'Choose at least one photo.' : 'Choose at least one document.')
      return
    }
    if (kind === 'photo' && files.some((f) => !isImageUploadFile(f))) {
      toast.error('Photos must be image files (JPG, PNG, WEBP, or HEIC).')
      return
    }
    if (kind === 'document' && files.some((f) => isImageUploadFile(f))) {
      toast.error('For images, use Upload → Photo. Documents are PDF, Word, or Excel.')
      return
    }

    try {
      const uploaded = []
      for (const file of files) {
        uploaded.push(
          await uploadDocument.mutateAsync({
            file,
            category: kind === 'photo' ? 'work_photo' : 'project_file',
            projectId,
            bucket: 'project-files',
            kindLabel: kindLabel || null,
          }),
        )
      }

      try {
        if (kind === 'photo') {
          const captionParts = [kindLabel, titleNote.trim()].filter(Boolean)
          await postPhotosToThread.mutateAsync({
            projectId,
            photos: uploaded,
            visibleToClient: true,
            caption: captionParts.length ? captionParts.join(' · ') : undefined,
          })
        } else {
          await postDocumentsToThread.mutateAsync({
            projectId,
            documents: uploaded.map((doc) => ({
              name: titleNote.trim()
                ? `${titleNote.trim()}${kindLabel ? ` (${kindLabel})` : ''}: ${doc.name}`
                : kindLabel
                  ? `${kindLabel}: ${doc.name}`
                  : doc.name,
            })),
            visibleToClient: true,
          })
        }
      } catch (threadError) {
        console.error('[project upload] saved file but thread post failed', threadError)
        toast.success(
          kind === 'photo'
            ? 'Photo(s) saved (thread notice failed — see console)'
            : 'Document(s) saved (thread notice failed — see console)',
        )
        toast.error(formatUnknownError(threadError, 'Could not post to project updates'))
        close()
        return
      }

      toast.success(kind === 'photo' ? 'Photo(s) uploaded' : 'Document(s) uploaded')
      close()
    } catch (error) {
      console.error('[project upload] failed', error)
      toast.error(formatUnknownError(error, 'Upload failed'))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 'choose'
              ? 'Upload'
              : step === 'photo'
                ? 'Upload photo'
                : 'Upload document'}
          </DialogTitle>
        </DialogHeader>

        {step === 'choose' ? (
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="h-auto justify-start px-3 py-3 text-left"
              onClick={() => setStep('photo')}
            >
              <span className="block">
                <span className="font-medium">Photo</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Site / progress images
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto justify-start px-3 py-3 text-left"
              onClick={() => setStep('document')}
            >
              <span className="block">
                <span className="font-medium">Document</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Agreements, designs, work orders, warranties
                </span>
              </span>
            </Button>
          </div>
        ) : null}

        {step === 'photo' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Photo type (optional)</Label>
              <Select
                value={kindLabel || '__none'}
                onValueChange={(v) => setKindLabel(v === '__none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No type</SelectItem>
                  {PHOTO_KIND_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea
                value={titleNote}
                onChange={(e) => setTitleNote(e.target.value)}
                rows={2}
                placeholder="Short note about this photo"
              />
            </div>
            <FilePickerButton
              accept={IMAGE_UPLOAD_ACCEPT}
              label="Choose photo(s)"
              multiple
              selectedFiles={files}
              onFiles={setFiles}
            />
            <SelectedFilesList files={files} onChange={setFiles} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep('choose')}>
                Back
              </Button>
              <Button
                disabled={busy || files.length === 0}
                onClick={() => void submitPhotoOrDocument('photo')}
              >
                {busy ? 'Uploading…' : 'Upload photo'}
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'document' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select
                value={kindLabel || '__none'}
                onValueChange={(v) => setKindLabel(v === '__none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Other / unspecified</SelectItem>
                  {DOCUMENT_KIND_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Title / note (optional)</Label>
              <Input
                value={titleNote}
                onChange={(e) => setTitleNote(e.target.value)}
                placeholder="e.g. Signed agreement — bathroom"
              />
            </div>
            <FilePickerButton
              accept={UPLOAD_ACCEPT}
              label="Choose document(s)"
              multiple
              selectedFiles={files}
              onFiles={setFiles}
            />
            <SelectedFilesList files={files} onChange={setFiles} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep('choose')}>
                Back
              </Button>
              <Button
                disabled={busy || files.length === 0}
                onClick={() => void submitPhotoOrDocument('document')}
              >
                {busy ? 'Uploading…' : 'Upload document'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
