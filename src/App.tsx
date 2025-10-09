import { useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
)

const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK!

const ACCEPTED = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv', '.xlsx', '.csv'
]
const MAX_MB = 50

const prettyBytes = (bytes: number) => {
  const units = ['B','KB','MB','GB']; let i=0, v=bytes
  while (v>=1024 && i<units.length-1){ v/=1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

export default function App() {
  const inputRef = useRef<HTMLInputElement|null>(null)
  const [file, setFile] = useState<File|null>(null)
  const [status, setStatus] = useState<'idle'|'uploading'|'notifying'|'success'|'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')

  const onBrowse = () => inputRef.current?.click()

  const handleFiles = (files: FileList|null) => {
    if(!files?.length) return
    const f = files[0]
    if (f.size > MAX_MB*1024*1024) { setStatus('error'); setMessage(`Máx ${MAX_MB}MB`); return }
    const ok = ACCEPTED.some(a => f.type===a || f.name.toLowerCase().endsWith(a))
    if (!ok) { setStatus('error'); setMessage('Use .xlsx ou .csv'); return }
    setFile(f); setStatus('idle'); setMessage('')
  }

  const onUpload = async () => {
    if (!file) return
    setStatus('uploading'); setProgress(5); setMessage('')

    try {
      // nome aleatório com prefixo 'public/'
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const key = `public/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`

      // upload com progresso (supabase-js usa fetch; não expõe progresso real)
      // então mostramos "fake" progress durante o await e finalizamos em 100 no fim
      const { error } = await supabase.storage
        .from('uploads')
        .upload(key, file, { contentType: file.type, upsert: false })

      if (error) throw error
      setProgress(80)

      // obter URL pública
      const { data } = supabase.storage.from('uploads').getPublicUrl(key)
      const fileUrl = data.publicUrl

      setStatus('notifying')

      // notificar n8n com JSON levinho
      const r = await fetch(N8N_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: fileUrl,
          filename: file.name,
          mimetype: file.type,
          size: file.size,
          source: 'supabase'
        })
      })

      if (!r.ok) throw new Error(`n8n ${r.status}`)

      setProgress(100)
      setStatus('success')
      setMessage('✅ Enviado e notificado!')
      setFile(null)
    } catch (e:any) {
      setStatus('error')
      setMessage(e?.message || 'Falha no upload')
    }
  }

  return (
    <div style={{minHeight:'100vh'}} className="grid place-items-center bg-black text-white">
      <div className="w-full max-w-md border border-white/15 rounded-xl p-6 bg-neutral-900">
        <h1 className="text-2xl font-semibold mb-4">Atualizar Dados do Dashboard</h1>

        <input ref={inputRef} type="file" accept=".csv,.xlsx"
               onChange={e=>handleFiles(e.target.files)} className="hidden" />
        <button onClick={onBrowse} className="bg-purple-600 px-4 py-2 rounded">
          Selecionar Arquivo
        </button>

        {file && (
          <div className="mt-4 text-sm">
            <p className="truncate">{file.name}</p>
            <p>{prettyBytes(file.size)}</p>
            <button onClick={onUpload} disabled={status==='uploading'||status==='notifying'}
                    className="bg-green-600 px-4 py-2 mt-3 rounded disabled:opacity-50">
              {status==='uploading' ? 'Enviando...' :
               status==='notifying' ? 'Finalizando...' : 'Enviar'}
            </button>
          </div>
        )}

        {(status==='uploading'||status==='notifying') && (
          <div className="mt-3 w-full bg-neutral-700 h-2 rounded">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {status==='success' && <p className="text-green-400 mt-3">{message}</p>}
        {status==='error' && <p className="text-red-400 mt-3">{message}</p>}
      </div>
    </div>
  )
}
